# IPC

Deepkit RPC 也可以连接同一台机器上并行运行的同一应用的各个部分：worker threads、浏览器中的 Web Workers 以及子进程。控制器与通过 [TCP](./tcp.md)、[WebSocket](./websocket.md) 或 [HTTP](./http.md) 使用时相同，并且与 TCP 和 WebSocket 一样，支持 streaming、进度和反向控制器（back controllers）。唯一不同的是两端之间的通道，中间没有网络栈。

一端使用 `serveRpcChannel()` 提供 `RpcKernel` 服务，另一端使用 `RpcChannelClientAdapter` 连接 `RpcClient`。两者都位于 `@deepkit/rpc` 中，既可在 node 中使用，也可在浏览器中使用。通道为以下之一：

| 通道                          | 适用于                                                           |
| ----------------------------- | ---------------------------------------------------------------- |
| `createSharedMemoryChannel()` | 线程：node 的 `worker_threads`、Web Workers。最快。              |
| `createMessagePortChannel()`  | 线程：`Worker`、`MessagePort`，或 Web Worker 中的 `self`。       |
| `createStreamChannel()`       | 进程：子进程的额外管道，或任意字节流。                           |
| `createProcessChannel()`      | 进程：`child_process.fork()` 的 IPC 通道。                       |

## Worker threads

worker 通过其通往主线程的端口提供 kernel 服务：

```typescript
// server.ts，在 worker 中运行
import { parentPort } from 'node:worker_threads';

import { RpcKernel, createMessagePortChannel, rpc, serveRpcChannel } from '@deepkit/rpc';

@rpc.controller('image')
export class ImageController {
    @rpc.action()
    resize(image: Uint8Array, width: number): Uint8Array {
        return resize(image, width);
    }
}

const kernel = new RpcKernel();
kernel.registerController(ImageController);
serveRpcChannel(kernel, createMessagePortChannel(parentPort!));
```

主线程启动 worker 并连接到它：

```typescript
import { Worker } from 'node:worker_threads';

import { RpcChannelClientAdapter, RpcClient, createMessagePortChannel } from '@deepkit/rpc';

import type { ImageController } from './server.js';

const worker = new Worker('./server.js');
const client = new RpcClient(new RpcChannelClientAdapter(createMessagePortChannel(worker)));
const image = client.controller<ImageController>('image');

const small = await image.resize(original, 200);
```

消息会被转移（transfer）到另一个线程，而不是复制。同一个 tick 内发起的所有调用的帧会放在一条消息中发送。当 worker 退出时，客户端会断开连接。

其他消息可以共享该端口：所有不是 `Uint8Array` 的内容都交由你自己的监听器处理。

## 共享内存

在线程之间，最快的通道根本不发送消息。双方共享一个 `SharedArrayBuffer`，每个方向各有一个环形缓冲区：发送方直接将帧写入其中，接收方从那里读取。每条消息既没有内存分配，也没有 structured clone，并且在另一方忙碌时无需唤醒。

```typescript
// 主线程
import { Worker } from 'node:worker_threads';

import { RpcChannelClientAdapter, RpcClient, createRpcSharedMemory, createSharedMemoryChannel } from '@deepkit/rpc';

const memory = createRpcSharedMemory(); // 每个方向 1 MB
const worker = new Worker('./server.js', { workerData: { memory } });
const channel = createSharedMemoryChannel(memory, 'client');
worker.on('exit', () => channel.close());
const client = new RpcClient(new RpcChannelClientAdapter(channel));
```

```typescript
// server.ts，在 worker 中
import { workerData } from 'node:worker_threads';

import { createSharedMemoryChannel, serveRpcChannel } from '@deepkit/rpc';

serveRpcChannel(kernel, createSharedMemoryChannel(workerData.memory, 'server'));
```

大于环形缓冲区的消息会分段发送。共享内存无法得知另一个线程何时结束，因此此时需要调用通道的 `close()`，如上面的 `exit` 事件中那样。

收到一条消息后，接收方会在事件循环的每一轮中轮询下一条消息 100 µs，然后才进入休眠，因此在此期间线程仍然是空闲的。在这段时间内到达的应答会被立即读取，而不必等到线程被唤醒之后，唤醒需要 20 到 30 µs（参见[性能](#performance)）。代价是等待期间会占用一个 CPU 核心。选项 `spin` 以微秒为单位设置该时间，`0` 表示禁用轮询：`createSharedMemoryChannel(memory, 'client', { spin: 0 })`。

## Web Workers

在浏览器中，同样的方式也适用于 Web Worker。worker 使用其全局作用域 `self` 作为端口：

```typescript
// worker.ts
import { RpcKernel, createMessagePortChannel, serveRpcChannel } from '@deepkit/rpc';

const kernel = new RpcKernel();
kernel.registerController(SearchController);
serveRpcChannel(kernel, createMessagePortChannel(self));
```

```typescript
// 在页面中
const worker = new Worker(new URL('./worker.ts', import.meta.url), { type: 'module' });
const client = new RpcClient(new RpcChannelClientAdapter(createMessagePortChannel(worker)));
const search = client.controller<SearchController>('search');
```

这样可以把开销大的工作从主线程中移出，并使用与调用服务器相同的类型化调用。共享内存在浏览器中同样可用，前提是页面处于跨源隔离状态（响应头 `Cross-Origin-Opener-Policy: same-origin` 和 `Cross-Origin-Embedder-Policy: require-corp`）并且浏览器支持 `Atomics.waitAsync`；通过 `postMessage()` 将内存传递给 worker。

经 Playwright 测量，Chromium、Firefox 和 WebKit（Safari）均支持。以下是在 MacBook（M 系列）上从页面向 Web Worker 发起一次小调用的耗时：

| 浏览器        | MessagePort | 共享内存      |
| ------------- | ----------: | ------------: |
| Chromium 158  |       23 µs |        8.8 µs |
| Firefox 159   |       46 µs |         28 µs |
| WebKit 27     |       48 µs |         28 µs |

## 子进程

当工作不应与主进程共享内存和崩溃，或需要运行另一个 node 版本时，子进程就很有用。通往子进程最快的通道是一条额外的管道：字节直接通过它传输。

```typescript
// 主进程
import { spawn } from 'node:child_process';
import { Socket } from 'node:net';

import { RpcChannelClientAdapter, RpcClient, createStreamChannel } from '@deepkit/rpc';

const child = spawn(process.execPath, ['server.js'], { stdio: ['inherit', 'inherit', 'inherit', 'pipe'] });
const client = new RpcClient(new RpcChannelClientAdapter(createStreamChannel(child.stdio[3] as Socket)));
```

```typescript
// server.js，在子进程中
import { Socket } from 'node:net';

import { createStreamChannel, serveRpcChannel } from '@deepkit/rpc';

serveRpcChannel(kernel, createStreamChannel(new Socket({ fd: 3, readable: true, writable: true })));
```

一个流承载一个连接：当客户端断开连接时，管道随之结束。

如果子进程本来就是用 `fork()` 启动的，也可以使用它的 IPC 通道。此时必须使用 `serialization: 'advanced'`，这样字节才会以字节形式发送。其他消息可以共享该通道：

```typescript
import { fork } from 'node:child_process';

import { createProcessChannel } from '@deepkit/rpc';

// 主进程
const child = fork('./server.js', { serialization: 'advanced' });
const client = new RpcClient(new RpcChannelClientAdapter(createProcessChannel(child)));

// server.js，在子进程中
serveRpcChannel(kernel, createProcessChannel(process));
```

node 会序列化该通道的每条消息并将其包装在 JSON 中，这使它成为所有通道中最慢的一种。

## Worker 池

一个 worker 使用一个 CPU 核心。要将工作分散到多个核心上，可以启动多个 worker，并将它们的客户端放入一个 `RpcClientPool` 中。它的控制器看起来与单个客户端的控制器相同，每次调用都会发往当前进行中调用最少的客户端：

```typescript
import { Worker } from 'node:worker_threads';
import { availableParallelism } from 'node:os';
import { RpcChannelClientAdapter, RpcClient, RpcClientPool, createMessagePortChannel } from '@deepkit/rpc';

const pool = new RpcClientPool(
    Array.from({ length: availableParallelism() - 1 }, () => {
        const worker = new Worker('./server.js');
        return new RpcClient(new RpcChannelClientAdapter(createMessagePortChannel(worker)));
    }),
);
const image = pool.controller<ImageController>('image');

const thumbnails = await Promise.all(files.map(file => image.resize(file, 200)));
await pool.disconnect();
```

返回 Observable 或 Collection 的调用会始终留在发起它的客户端上。调用之间没有顺序保证，因为它们可能运行在不同的 worker 上。该池适用于任何客户端，包括通过共享内存或连接到子进程的客户端。

## 性能

以下是在 Linux 机器（Intel i9，node 26）上，从主线程向 worker 线程或子进程中的服务器发起每次调用的耗时。客户端会等待每个应答返回后再发起下一次调用，最后一列除外，该列中同时有 64 个调用在进行：

| 通道                           | 两个数字    | 一个对象  | 100 个对象  | 同时 64 个，每次调用 |
| ------------------------------ | ----------: | --------: | ----------: | -------------------: |
| 共享内存                       |      5.8 µs |   10.2 µs |      150 µs |               1.1 µs |
| 共享内存，不轮询               |       31 µs |     38 µs |      210 µs |               1.4 µs |
| 到子进程的管道                 |       34 µs |     39 µs |      205 µs |               1.4 µs |
| 到子进程的 Unix socket         |       34 µs |     39 µs |      204 µs |               1.3 µs |
| 到 worker 线程的 MessagePort   |       41 µs |     49 µs |      213 µs |               1.5 µs |
| 到子进程的 TCP                 |       45 µs |     52 µs |      256 µs |               1.5 µs |
| `process.send()`（fork）       |       61 µs |     67 µs |      265 µs |               1.8 µs |

单次调用的耗时主要是操作系统唤醒另一个线程或进程所需的时间，约 20 到 30 µs，每个等待消息的通道都要付出这个代价。共享内存通过轮询应答 100 µs（选项 `spin`）避免了这一开销，这使得一次调用比通过 Unix socket 快 6 倍。当同时有大量调用时，所有通道都会对它们进行批处理，一次调用的开销约为一微秒。对于较大的结果，大部分时间花在序列化上。

因此：线程之间使用共享内存。与子进程通信时使用管道或 Unix socket，而不是 `process.send()`。基准测试位于仓库的 `benchmarks/comparison/ipc` 中。

## 连接

一个通道同一时间只承载一个连接。已断开连接的客户端会在下一次调用时通过同一个 message port、进程通道或共享内存重新连接，服务器会为其启动一个新连接，并带有新的 `rpc` 作用域。要将多个客户端连接到同一个 worker，请为每个客户端提供各自的 `MessageChannel` 或共享内存。关于多个 worker，请参见 [Worker 池](#worker-pools)。

`serveRpcChannel()` 返回该通道的服务器。`close()` 会停止服务器并关闭当前连接：

```typescript
const server = serveRpcChannel(kernel, channel);
server.connection; // 当前连接（如果有）
server.close();
```

## 其他通道

通道是一个小型 Interface `RpcChannel`：`send()` 发送字节，`end()` 结束连接，`listen()` 接收字节以及另一端的结束信号。可以为任何其他承载字节或消息的东西实现它，例如 Electron 的 IPC 或浏览器扩展的端口。
