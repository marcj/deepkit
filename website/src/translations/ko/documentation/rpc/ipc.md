# IPC

Deepkit RPC는 같은 머신에서 병렬로 실행되는 하나의 애플리케이션의 여러 부분, 즉 worker thread, 브라우저의 Web Worker, 그리고 child process도 연결합니다. 컨트롤러는 [TCP](./tcp.md), [WebSocket](./websocket.md) 또는 [HTTP](./http.md)를 통한 경우와 동일하며, TCP 및 WebSocket과 마찬가지로 스트리밍, 진행 상황(progress), back controller가 동작합니다. 두 측 사이의 채널만 다를 뿐이며, 그 사이에 네트워크 스택이 없습니다.

한쪽은 `serveRpcChannel()`로 `RpcKernel`을 제공하고, 다른 쪽은 `RpcChannelClientAdapter`로 `RpcClient`를 연결합니다. 둘 다 `@deepkit/rpc`에 있으며 node와 브라우저 모두에서 동작합니다. 채널은 다음 중 하나입니다:

| 채널                          | 연결 대상                                                        |
| ----------------------------- | ---------------------------------------------------------------- |
| `createSharedMemoryChannel()` | 스레드: node의 `worker_threads`, Web Worker. 가장 빠름.          |
| `createMessagePortChannel()`  | 스레드: `Worker`, `MessagePort`, 또는 Web Worker 내의 `self`.    |
| `createStreamChannel()`       | 프로세스: child process의 추가 pipe, 또는 임의의 byte stream.    |
| `createProcessChannel()`      | 프로세스: `child_process.fork()`의 IPC 채널.                     |

## Worker thread

worker는 메인 스레드로 향하는 자신의 port를 통해 kernel을 제공합니다:

```typescript
// server.ts, worker에서 실행됨
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

메인 스레드는 worker를 시작하고 그것에 연결합니다:

```typescript
import { Worker } from 'node:worker_threads';

import { RpcChannelClientAdapter, RpcClient, createMessagePortChannel } from '@deepkit/rpc';

import type { ImageController } from './server.js';

const worker = new Worker('./server.js');
const client = new RpcClient(new RpcChannelClientAdapter(createMessagePortChannel(worker)));
const image = client.controller<ImageController>('image');

const small = await image.resize(original, 200);
```

메시지는 다른 스레드로 복사되지 않고 전송(transfer)됩니다. 한 tick 내에 이루어진 모든 호출의 frame은 하나의 메시지로 전달됩니다. worker가 종료되면 클라이언트의 연결이 끊어집니다.

다른 메시지도 port를 공유할 수 있습니다: `Uint8Array`가 아닌 모든 것은 여러분 자신의 listener에 맡겨집니다.

## Shared memory

스레드 간에 가장 빠른 채널은 메시지를 아예 보내지 않습니다. 양측은 방향마다 하나의 ring buffer를 가진 `SharedArrayBuffer`를 공유합니다: 송신 측은 frame을 그 안에 직접 쓰고, 수신 측은 거기서 읽습니다. 메시지마다 할당이나 structured clone이 없으며, 상대 측이 바쁜 동안에는 wake-up도 필요하지 않습니다.

```typescript
// 메인 스레드
import { Worker } from 'node:worker_threads';

import { RpcChannelClientAdapter, RpcClient, createRpcSharedMemory, createSharedMemoryChannel } from '@deepkit/rpc';

const memory = createRpcSharedMemory(); // 방향당 1 MB
const worker = new Worker('./server.js', { workerData: { memory } });
const channel = createSharedMemoryChannel(memory, 'client');
worker.on('exit', () => channel.close());
const client = new RpcClient(new RpcChannelClientAdapter(channel));
```

```typescript
// server.ts, worker 내부
import { workerData } from 'node:worker_threads';

import { createSharedMemoryChannel, serveRpcChannel } from '@deepkit/rpc';

serveRpcChannel(kernel, createSharedMemoryChannel(workerData.memory, 'server'));
```

ring buffer보다 큰 메시지는 여러 부분으로 나누어 전송됩니다. 메모리는 상대 스레드가 언제 종료되었는지 알 수 없으므로, 위의 `exit` 이벤트처럼 그때 채널의 `close()`를 호출하세요.

메시지를 받은 후, 수신 측은 event loop의 각 turn마다 sleep에 들어가기 전에 100 µs 동안 다음 메시지를 polling하므로, 그동안 스레드는 자유로운 상태로 유지됩니다. 그 시간 내에 도착한 응답은 20~30 µs가 걸리는 스레드 wake-up 이후가 아니라 즉시 읽힙니다([성능](#성능) 참조). 그 대가로 대기하는 동안 코어 하나가 바쁜 상태가 됩니다. `spin` 옵션은 마이크로초 단위로 시간을 설정하며, `0`은 polling을 비활성화합니다: `createSharedMemoryChannel(memory, 'client', { spin: 0 })`.

## Web Worker

브라우저에서는 Web Worker로 동일하게 동작합니다. worker는 자신의 global scope인 `self`를 port로 사용합니다:

```typescript
// worker.ts
import { RpcKernel, createMessagePortChannel, serveRpcChannel } from '@deepkit/rpc';

const kernel = new RpcKernel();
kernel.registerController(SearchController);
serveRpcChannel(kernel, createMessagePortChannel(self));
```

```typescript
// 페이지에서
const worker = new Worker(new URL('./worker.ts', import.meta.url), { type: 'module' });
const client = new RpcClient(new RpcChannelClientAdapter(createMessagePortChannel(worker)));
const search = client.controller<SearchController>('search');
```

이를 통해 서버에 대한 호출과 동일한 타입 지정 호출로 비용이 큰 작업을 메인 스레드에서 분리할 수 있습니다. 페이지가 cross-origin isolated 상태이고(헤더 `Cross-Origin-Opener-Policy: same-origin` 및 `Cross-Origin-Embedder-Policy: require-corp`) 브라우저가 `Atomics.waitAsync`를 지원하는 경우, shared memory도 브라우저에서 동작합니다. 메모리는 `postMessage()`로 worker에 전달하세요.

Playwright로 측정한 결과, Chromium, Firefox, WebKit(Safari) 모두 이를 지원합니다. MacBook(M 시리즈)에서 페이지로부터 Web Worker로의 작은 호출:

| 브라우저      | MessagePort | Shared memory |
| ------------- | ----------: | ------------: |
| Chromium 158  |       23 µs |        8.8 µs |
| Firefox 159   |       46 µs |         28 µs |
| WebKit 27     |       48 µs |         28 µs |

## Child process

child process는 작업이 메인 프로세스의 메모리와 크래시를 공유하지 않아야 하거나, 다른 node 버전으로 실행되어야 할 때 유용합니다. child로 가는 가장 빠른 채널은 추가 pipe입니다: 바이트가 그것을 통해 직접 전달됩니다.

```typescript
// 메인 프로세스
import { spawn } from 'node:child_process';
import { Socket } from 'node:net';

import { RpcChannelClientAdapter, RpcClient, createStreamChannel } from '@deepkit/rpc';

const child = spawn(process.execPath, ['server.js'], { stdio: ['inherit', 'inherit', 'inherit', 'pipe'] });
const client = new RpcClient(new RpcChannelClientAdapter(createStreamChannel(child.stdio[3] as Socket)));
```

```typescript
// server.js, child 내부
import { Socket } from 'node:net';

import { createStreamChannel, serveRpcChannel } from '@deepkit/rpc';

serveRpcChannel(kernel, createStreamChannel(new Socket({ fd: 3, readable: true, writable: true })));
```

하나의 stream은 하나의 연결을 전달합니다: 클라이언트의 연결이 끊어지면 pipe가 종료됩니다.

어차피 child가 `fork()`로 시작된 경우에는 그 IPC 채널도 사용할 수 있습니다. 바이트가 바이트로 전송되도록 `serialization: 'advanced'`를 사용해야 합니다. 다른 메시지도 채널을 공유할 수 있습니다:

```typescript
import { fork } from 'node:child_process';

import { createProcessChannel } from '@deepkit/rpc';

// 메인 프로세스
const child = fork('./server.js', { serialization: 'advanced' });
const client = new RpcClient(new RpcChannelClientAdapter(createProcessChannel(child)));

// server.js, child 내부
serveRpcChannel(kernel, createProcessChannel(process));
```

node는 이 채널의 모든 메시지를 직렬화하고 JSON으로 감싸기 때문에, 채널 중 가장 느립니다.

## Worker pool

하나의 worker는 하나의 코어를 사용합니다. 작업을 여러 코어에 분산하려면 여러 worker를 시작하고 그 클라이언트들을 `RpcClientPool`에 넣으세요. 그 컨트롤러는 단일 클라이언트의 컨트롤러와 같은 모습이며, 각 호출은 진행 중인 호출이 가장 적은 클라이언트로 전달됩니다:

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

Observable 또는 Collection을 반환하는 호출은 그것을 시작한 클라이언트에 머무릅니다. 호출들은 서로 다른 worker에서 실행될 수 있으므로 서로 간의 순서가 보장되지 않습니다. pool은 shared memory를 통한 클라이언트나 child process로의 클라이언트 등 어떤 클라이언트와도 동작합니다.

## 성능

Linux 머신(Intel i9, node 26)에서 메인 스레드로부터 worker thread 또는 child process 내 서버로의 호출당 시간입니다. 클라이언트는 다음 호출을 하기 전에 각 응답을 기다리며, 64개의 호출이 동시에 진행 중인 마지막 열은 예외입니다:

| 채널                           | 숫자 두 개  | 객체 하나 | 객체 100개  | 동시 64개, 호출당    |
| ------------------------------ | ----------: | --------: | ----------: | -------------------: |
| Shared memory                  |      5.8 µs |   10.2 µs |      150 µs |               1.1 µs |
| Shared memory, polling 없음    |       31 µs |     38 µs |      210 µs |               1.4 µs |
| child process로의 pipe         |       34 µs |     39 µs |      205 µs |               1.4 µs |
| child process로의 Unix socket  |       34 µs |     39 µs |      204 µs |               1.3 µs |
| worker thread로의 MessagePort  |       41 µs |     49 µs |      213 µs |               1.5 µs |
| child process로의 TCP          |       45 µs |     52 µs |      256 µs |               1.5 µs |
| `process.send()` (fork)        |       61 µs |     67 µs |      265 µs |               1.8 µs |

단일 호출 시간의 대부분은 운영 체제가 상대 스레드나 프로세스를 깨우는 데 걸리는 약 20~30 µs이며, 메시지를 기다리는 모든 채널이 이 비용을 치릅니다. Shared memory는 100 µs 동안 응답을 polling하여(`spin` 옵션) 이를 피하며, 이로써 호출이 Unix socket을 통한 경우보다 6배 빨라집니다. 많은 호출이 동시에 이루어지면 모든 채널이 이를 일괄 처리하며 호출당 비용은 약 1마이크로초입니다. 결과가 클수록 직렬화가 대부분의 시간을 차지합니다.

따라서: 스레드 간에는 shared memory를 사용하세요. child process로는 `process.send()`가 아니라 pipe 또는 Unix socket을 사용하세요. 벤치마크는 저장소의 `benchmarks/comparison/ipc`에 있습니다.

## 연결

하나의 채널은 한 번에 하나의 연결을 전달합니다. 연결이 끊어진 클라이언트는 다음 호출 시 동일한 message port, process channel 또는 shared memory를 통해 다시 연결되며, 서버는 새로운 `rpc` scope와 함께 그것을 위한 새 연결을 시작합니다. 여러 클라이언트를 하나의 worker에 연결하려면 각각에 자체 `MessageChannel` 또는 shared memory를 제공하세요. 여러 worker의 경우 [Worker pool](#worker-pool)을 참조하세요.

`serveRpcChannel()`은 채널의 서버를 반환합니다. `close()`는 서버를 중지하고 현재 연결을 닫습니다:

```typescript
const server = serveRpcChannel(kernel, channel);
server.connection; // 현재 연결(있는 경우)
server.close();
```

## 기타 채널

채널은 작은 Interface인 `RpcChannel`입니다: `send()`는 바이트를 보내고, `end()`는 연결을 종료하며, `listen()`은 바이트와 상대 측의 종료를 수신합니다. 바이트나 메시지를 전달하는 다른 모든 것, 예를 들어 Electron의 IPC나 브라우저 확장 프로그램의 port에 대해 이를 구현하세요.
