# IPC

Deepkit RPC also connects parts of one application that run in parallel on the same machine: worker threads, Web Workers in the browser, and child processes. The controllers are the same as over [TCP](./tcp.md), [WebSocket](./websocket.md) or [HTTP](./http.md), and like over TCP and WebSocket, streaming, progress and back controllers work. Only the channel between the two sides is different, and there is no network stack in between.

One side serves an `RpcKernel` with `serveRpcChannel()`, the other connects a `RpcClient` with `RpcChannelClientAdapter`. Both are in `@deepkit/rpc` and work in node as well as in the browser. The channel is one of:

| Channel                       | Between                                                          |
| ----------------------------- | ---------------------------------------------------------------- |
| `createSharedMemoryChannel()` | Threads: node's `worker_threads`, Web Workers. Fastest.          |
| `createMessagePortChannel()`  | Threads: a `Worker`, `MessagePort`, or `self` in a Web Worker.   |
| `createStreamChannel()`       | Processes: an extra pipe of a child process, or any byte stream. |
| `createProcessChannel()`      | Processes: the IPC channel of `child_process.fork()`.            |

## Worker threads

The worker serves the kernel over its port to the main thread:

```typescript
// server.ts, runs in the worker
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

The main thread starts the worker and connects to it:

```typescript
import { Worker } from 'node:worker_threads';

import { RpcChannelClientAdapter, RpcClient, createMessagePortChannel } from '@deepkit/rpc';

import type { ImageController } from './server.js';

const worker = new Worker('./server.js');
const client = new RpcClient(new RpcChannelClientAdapter(createMessagePortChannel(worker)));
const image = client.controller<ImageController>('image');

const small = await image.resize(original, 200);
```

Messages are transferred to the other thread, not copied. The frames of all calls made in one tick go in one message. When the worker exits, the client gets disconnected.

Other messages can share the port: everything that is not a `Uint8Array` is left to your own listeners.

## Shared memory

Between threads, the fastest channel doesn't send messages at all. Both sides share a `SharedArrayBuffer` with one ring buffer per direction: the sender writes the frames directly into it, the receiver reads them from there. There is no allocation and no structured clone per message, and while the other side is busy no wake-up is needed.

```typescript
// main thread
import { Worker } from 'node:worker_threads';

import { RpcChannelClientAdapter, RpcClient, createRpcSharedMemory, createSharedMemoryChannel } from '@deepkit/rpc';

const memory = createRpcSharedMemory(); // 1 MB per direction
const worker = new Worker('./server.js', { workerData: { memory } });
const channel = createSharedMemoryChannel(memory, 'client');
worker.on('exit', () => channel.close());
const client = new RpcClient(new RpcChannelClientAdapter(channel));
```

```typescript
// server.ts, in the worker
import { workerData } from 'node:worker_threads';

import { createSharedMemoryChannel, serveRpcChannel } from '@deepkit/rpc';

serveRpcChannel(kernel, createSharedMemoryChannel(workerData.memory, 'server'));
```

Messages larger than the ring buffer are sent in parts. The memory can't tell when the other thread ended, so call `close()` of the channel then, like on the `exit` event above.

After a message, the receiving side polls for the next one for 100 µs before it goes to sleep, in each turn of the event loop, so the thread stays free meanwhile. An answer that arrives in that time is read right away, instead of after a wake-up of the thread, which takes 20 to 30 µs (see [Performance](#performance)). The cost is a busy core while waiting. The option `spin` sets the time in microseconds, `0` disables polling: `createSharedMemoryChannel(memory, 'client', { spin: 0 })`.

## Web Workers

In the browser the same works with a Web Worker. The worker uses its global scope `self` as port:

```typescript
// worker.ts
import { RpcKernel, createMessagePortChannel, serveRpcChannel } from '@deepkit/rpc';

const kernel = new RpcKernel();
kernel.registerController(SearchController);
serveRpcChannel(kernel, createMessagePortChannel(self));
```

```typescript
// in the page
const worker = new Worker(new URL('./worker.ts', import.meta.url), { type: 'module' });
const client = new RpcClient(new RpcChannelClientAdapter(createMessagePortChannel(worker)));
const search = client.controller<SearchController>('search');
```

This moves expensive work off the main thread, with the same typed calls as to the server. Shared memory works in the browser as well, when the page is cross-origin isolated (the headers `Cross-Origin-Opener-Policy: same-origin` and `Cross-Origin-Embedder-Policy: require-corp`) and the browser has `Atomics.waitAsync`; pass the memory to the worker with `postMessage()`.

Chromium, Firefox and WebKit (Safari) all support it, measured with Playwright. A small call from the page to a Web Worker, on a MacBook (M-series):

| Browser       | MessagePort | Shared memory |
| ------------- | ----------: | ------------: |
| Chromium 158  |       23 µs |        8.8 µs |
| Firefox 159   |       46 µs |         28 µs |
| WebKit 27     |       48 µs |         28 µs |

## Child processes

A child process is useful when the work should not share the memory and the crashes of the main process, or runs another node version. The fastest channel to a child is an extra pipe: the bytes go directly through it.

```typescript
// main process
import { spawn } from 'node:child_process';
import { Socket } from 'node:net';

import { RpcChannelClientAdapter, RpcClient, createStreamChannel } from '@deepkit/rpc';

const child = spawn(process.execPath, ['server.js'], { stdio: ['inherit', 'inherit', 'inherit', 'pipe'] });
const client = new RpcClient(new RpcChannelClientAdapter(createStreamChannel(child.stdio[3] as Socket)));
```

```typescript
// server.js, in the child
import { Socket } from 'node:net';

import { createStreamChannel, serveRpcChannel } from '@deepkit/rpc';

serveRpcChannel(kernel, createStreamChannel(new Socket({ fd: 3, readable: true, writable: true })));
```

A stream carries one connection: when the client disconnects, the pipe ends.

When the child is started with `fork()` anyway, its IPC channel works as well. It has to use `serialization: 'advanced'`, so that bytes are sent as bytes. Other messages can share the channel:

```typescript
import { fork } from 'node:child_process';

import { createProcessChannel } from '@deepkit/rpc';

// main process
const child = fork('./server.js', { serialization: 'advanced' });
const client = new RpcClient(new RpcChannelClientAdapter(createProcessChannel(child)));

// server.js, in the child
serveRpcChannel(kernel, createProcessChannel(process));
```

node serializes every message of this channel and wraps it in JSON, which makes it the slowest of the channels.

## Worker pools

One worker uses one core. To spread the work over several, start several workers and put their clients into a `RpcClientPool`. Its controllers look like the ones of a single client, each call goes to the client with the fewest calls in flight:

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

A call that returns an Observable or Collection stays with the client that started it. Calls are not ordered among each other, since they may run on different workers. The pool works with any clients, also over shared memory or to child processes.

## Performance

Time per call from the main thread to a server in a worker thread or child process, on a Linux machine (Intel i9, node 26). The client waits for each answer before it makes the next call, except in the last column, where 64 calls are in flight at once:

| Channel                        | Two numbers | An object | 100 objects | 64 at once, per call |
| ------------------------------ | ----------: | --------: | ----------: | -------------------: |
| Shared memory                  |      5.8 µs |   10.2 µs |      150 µs |               1.1 µs |
| Shared memory, without polling |       31 µs |     38 µs |      210 µs |               1.4 µs |
| Pipe to a child process        |       34 µs |     39 µs |      205 µs |               1.4 µs |
| Unix socket to a child process |       34 µs |     39 µs |      204 µs |               1.3 µs |
| MessagePort to a worker thread |       41 µs |     49 µs |      213 µs |               1.5 µs |
| TCP to a child process         |       45 µs |     52 µs |      256 µs |               1.5 µs |
| `process.send()` (fork)        |       61 µs |     67 µs |      265 µs |               1.8 µs |

A single call is mostly the time the operating system takes to wake up the other thread or process, about 20 to 30 µs, which every channel that waits for a message pays. Shared memory avoids it by polling for the answer for 100 µs (option `spin`), which makes a call 6 times faster than over a Unix socket. With many calls at once, all channels batch them and a call costs around a microsecond. With larger results, serialization takes most of the time.

So: between threads, use shared memory. To a child process, use a pipe or a Unix socket, not `process.send()`. The benchmarks are in `benchmarks/comparison/ipc` of the repository.

## Connections

A channel carries one connection at a time. A client that disconnected connects again over the same message port, process channel or shared memory on its next call, and the server starts a new connection for it, with a new `rpc` scope. To connect several clients to one worker, give each its own `MessageChannel` or shared memory. For several workers, see [Worker pools](#worker-pools).

`serveRpcChannel()` returns the server of the channel. `close()` stops it and closes the current connection:

```typescript
const server = serveRpcChannel(kernel, channel);
server.connection; // the current connection, if any
server.close();
```

## Other channels

A channel is a small interface, `RpcChannel`: `send()` sends bytes, `end()` ends the connection, and `listen()` receives bytes and the end of the other side. Implement it for anything else that carries bytes or messages, for example Electron's IPC or a browser extension's port.
