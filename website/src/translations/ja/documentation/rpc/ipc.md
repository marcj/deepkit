# IPC

Deepkit RPC は、同じマシン上で並行して動作する 1 つのアプリケーションの各部分も接続します。対象は worker threads、ブラウザの Web Workers、そして子プロセスです。コントローラーは [TCP](./tcp.md)、[WebSocket](./websocket.md)、[HTTP](./http.md) 経由の場合と同じです。TCP や WebSocket と同様に、ストリーミング、進捗、バックコントローラーも動作します。異なるのは両者の間のチャネルだけで、間にネットワークスタックは存在しません。

一方の側は `serveRpcChannel()` で `RpcKernel` を提供し、もう一方の側は `RpcChannelClientAdapter` で `RpcClient` を接続します。どちらも `@deepkit/rpc` に含まれており、node でもブラウザでも動作します。チャネルは次のいずれかです。

| チャネル                       | 接続先                                                            |
| ----------------------------- | ---------------------------------------------------------------- |
| `createSharedMemoryChannel()` | スレッド: node の `worker_threads`、Web Workers。最速。              |
| `createMessagePortChannel()`  | スレッド: `Worker`、`MessagePort`、または Web Worker 内の `self`。    |
| `createStreamChannel()`       | プロセス: 子プロセスの追加パイプ、または任意のバイトストリーム。          |
| `createProcessChannel()`      | プロセス: `child_process.fork()` の IPC チャネル。                   |

## Worker threads

ワーカーは、メインスレッドへのポート経由でカーネルを提供します。

```typescript
// server.ts、ワーカー内で実行される
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

メインスレッドはワーカーを起動し、それに接続します。

```typescript
import { Worker } from 'node:worker_threads';

import { RpcChannelClientAdapter, RpcClient, createMessagePortChannel } from '@deepkit/rpc';

import type { ImageController } from './server.js';

const worker = new Worker('./server.js');
const client = new RpcClient(new RpcChannelClientAdapter(createMessagePortChannel(worker)));
const image = client.controller<ImageController>('image');

const small = await image.resize(original, 200);
```

メッセージはコピーされるのではなく、もう一方のスレッドへ転送 (transfer) されます。1 tick 内に行われたすべての呼び出しのフレームは、1 つのメッセージにまとめられます。ワーカーが終了すると、クライアントは切断されます。

他のメッセージもポートを共有できます。`Uint8Array` 以外のものはすべて、独自のリスナーに任されます。

## 共有メモリ

スレッド間では、最速のチャネルはメッセージをまったく送信しません。両者は方向ごとに 1 つのリングバッファを持つ `SharedArrayBuffer` を共有します。送信側はフレームを直接そこに書き込み、受信側はそこから読み取ります。メッセージごとのアロケーションも structured clone もなく、相手側がビジーな間はウェイクアップも不要です。

```typescript
// メインスレッド
import { Worker } from 'node:worker_threads';

import { RpcChannelClientAdapter, RpcClient, createRpcSharedMemory, createSharedMemoryChannel } from '@deepkit/rpc';

const memory = createRpcSharedMemory(); // 方向ごとに 1 MB
const worker = new Worker('./server.js', { workerData: { memory } });
const channel = createSharedMemoryChannel(memory, 'client');
worker.on('exit', () => channel.close());
const client = new RpcClient(new RpcChannelClientAdapter(channel));
```

```typescript
// server.ts、ワーカー内
import { workerData } from 'node:worker_threads';

import { createSharedMemoryChannel, serveRpcChannel } from '@deepkit/rpc';

serveRpcChannel(kernel, createSharedMemoryChannel(workerData.memory, 'server'));
```

リングバッファより大きいメッセージは分割して送信されます。メモリはもう一方のスレッドが終了したことを検知できないため、上記の `exit` イベントのように、そのタイミングでチャネルの `close()` を呼び出してください。

メッセージを受け取った後、受信側はスリープに入る前に、イベントループの各ターンで 100 µs の間次のメッセージをポーリングするため、その間もスレッドは空いたままです。この時間内に届いた応答は、20〜30 µs かかるスレッドのウェイクアップを待つことなく即座に読み取られます ([パフォーマンス](#performance) を参照)。その代償として、待機中は 1 コアがビジー状態になります。オプション `spin` で時間をマイクロ秒単位で設定でき、`0` でポーリングを無効にします: `createSharedMemoryChannel(memory, 'client', { spin: 0 })`。

## Web Workers

ブラウザでは、同じことが Web Worker でも機能します。ワーカーはそのグローバルスコープ `self` をポートとして使用します。

```typescript
// worker.ts
import { RpcKernel, createMessagePortChannel, serveRpcChannel } from '@deepkit/rpc';

const kernel = new RpcKernel();
kernel.registerController(SearchController);
serveRpcChannel(kernel, createMessagePortChannel(self));
```

```typescript
// ページ内
const worker = new Worker(new URL('./worker.ts', import.meta.url), { type: 'module' });
const client = new RpcClient(new RpcChannelClientAdapter(createMessagePortChannel(worker)));
const search = client.controller<SearchController>('search');
```

これにより、サーバーへの呼び出しと同じ型付きの呼び出しで、重い処理をメインスレッドから移すことができます。ページが cross-origin isolated であり (ヘッダー `Cross-Origin-Opener-Policy: same-origin` と `Cross-Origin-Embedder-Policy: require-corp`)、ブラウザが `Atomics.waitAsync` を備えていれば、共有メモリもブラウザで動作します。メモリは `postMessage()` でワーカーに渡してください。

Playwright で計測したところ、Chromium、Firefox、WebKit (Safari) のすべてがこれをサポートしています。MacBook (M シリーズ) 上での、ページから Web Worker への小さな呼び出し:

| ブラウザ       | MessagePort | 共有メモリ |
| ------------- | ----------: | ------------: |
| Chromium 158  |       23 µs |        8.8 µs |
| Firefox 159   |       46 µs |         28 µs |
| WebKit 27     |       48 µs |         28 µs |

## 子プロセス

子プロセスは、処理がメインプロセスとメモリやクラッシュを共有すべきでない場合や、別の node バージョンで実行される場合に便利です。子プロセスへの最速のチャネルは追加のパイプで、バイトはそこを直接通ります。

```typescript
// メインプロセス
import { spawn } from 'node:child_process';
import { Socket } from 'node:net';

import { RpcChannelClientAdapter, RpcClient, createStreamChannel } from '@deepkit/rpc';

const child = spawn(process.execPath, ['server.js'], { stdio: ['inherit', 'inherit', 'inherit', 'pipe'] });
const client = new RpcClient(new RpcChannelClientAdapter(createStreamChannel(child.stdio[3] as Socket)));
```

```typescript
// server.js、子プロセス内
import { Socket } from 'node:net';

import { createStreamChannel, serveRpcChannel } from '@deepkit/rpc';

serveRpcChannel(kernel, createStreamChannel(new Socket({ fd: 3, readable: true, writable: true })));
```

1 つのストリームは 1 つのコネクションを運びます。クライアントが切断すると、パイプは終了します。

いずれにせよ子プロセスを `fork()` で起動する場合は、その IPC チャネルも使えます。バイトがバイトとして送信されるよう、`serialization: 'advanced'` を使用する必要があります。他のメッセージもチャネルを共有できます。

```typescript
import { fork } from 'node:child_process';

import { createProcessChannel } from '@deepkit/rpc';

// メインプロセス
const child = fork('./server.js', { serialization: 'advanced' });
const client = new RpcClient(new RpcChannelClientAdapter(createProcessChannel(child)));

// server.js、子プロセス内
serveRpcChannel(kernel, createProcessChannel(process));
```

node はこのチャネルのすべてのメッセージをシリアライズして JSON でラップするため、これはチャネルの中で最も遅いものになります。

## ワーカープール

1 つのワーカーは 1 つのコアを使用します。処理を複数のコアに分散するには、複数のワーカーを起動し、そのクライアントを `RpcClientPool` に入れます。そのコントローラーは単一クライアントのものと同じように見え、各呼び出しは実行中の呼び出しが最も少ないクライアントに送られます。

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

Observable または Collection を返す呼び出しは、それを開始したクライアントに留まります。呼び出しは異なるワーカーで実行される可能性があるため、呼び出し同士の順序は保証されません。プールは任意のクライアントで動作し、共有メモリ経由や子プロセスへのクライアントでも使えます。

## パフォーマンス

Linux マシン (Intel i9、node 26) 上での、メインスレッドから worker thread または子プロセス内のサーバーへの 1 呼び出しあたりの時間です。クライアントは各応答を待ってから次の呼び出しを行います。ただし最後の列は例外で、64 個の呼び出しが同時に実行中となります。

| チャネル                        | 2 つの数値 | オブジェクト 1 つ | オブジェクト 100 個 | 64 同時、1 呼び出しあたり |
| ------------------------------ | ----------: | --------: | ----------: | -------------------: |
| 共有メモリ                      |      5.8 µs |   10.2 µs |      150 µs |               1.1 µs |
| 共有メモリ、ポーリングなし        |       31 µs |     38 µs |      210 µs |               1.4 µs |
| 子プロセスへのパイプ              |       34 µs |     39 µs |      205 µs |               1.4 µs |
| 子プロセスへの Unix ソケット       |       34 µs |     39 µs |      204 µs |               1.3 µs |
| worker thread への MessagePort   |       41 µs |     49 µs |      213 µs |               1.5 µs |
| 子プロセスへの TCP               |       45 µs |     52 µs |      256 µs |               1.5 µs |
| `process.send()` (fork)        |       61 µs |     67 µs |      265 µs |               1.8 µs |

単一の呼び出しの大部分は、オペレーティングシステムがもう一方のスレッドまたはプロセスをウェイクアップするのにかかる時間、約 20〜30 µs であり、これはメッセージを待機するすべてのチャネルが負担します。共有メモリは応答を 100 µs の間ポーリングする (オプション `spin`) ことでこれを回避し、Unix ソケット経由よりも呼び出しが 6 倍高速になります。多数の呼び出しを同時に行う場合、すべてのチャネルがそれらをバッチ処理し、1 呼び出しあたりのコストは約 1 マイクロ秒になります。結果が大きい場合は、シリアライズが時間の大部分を占めます。

つまり、スレッド間では共有メモリを使用してください。子プロセスへは、`process.send()` ではなくパイプまたは Unix ソケットを使用してください。ベンチマークはリポジトリの `benchmarks/comparison/ipc` にあります。

## コネクション

1 つのチャネルは一度に 1 つのコネクションを運びます。切断されたクライアントは、次の呼び出し時に同じメッセージポート、プロセスチャネル、または共有メモリを通じて再接続し、サーバーはそのために新しい `rpc` スコープを持つ新しいコネクションを開始します。複数のクライアントを 1 つのワーカーに接続するには、それぞれに専用の `MessageChannel` または共有メモリを与えてください。複数のワーカーについては、[ワーカープール](#worker-pools) を参照してください。

`serveRpcChannel()` はチャネルのサーバーを返します。`close()` はサーバーを停止し、現在のコネクションを閉じます。

```typescript
const server = serveRpcChannel(kernel, channel);
server.connection; // 現在のコネクション (存在する場合)
server.close();
```

## その他のチャネル

チャネルは小さなインターフェース `RpcChannel` です。`send()` はバイトを送信し、`end()` はコネクションを終了し、`listen()` はバイトと相手側の終了を受信します。バイトやメッセージを運ぶ他のあらゆるもの、たとえば Electron の IPC やブラウザ拡張機能のポートに対して、これを実装してください。
