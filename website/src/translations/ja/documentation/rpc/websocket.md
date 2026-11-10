# WebSocket

WebSocket は Deepkit RPC のデフォルトのトランスポートです。ブラウザでも Node でも動作し、すべての呼び出しで 1 つのコネクションを開いたまま維持します。また、RxJS の Observable、Subject、Collection によるストリーミング、アップロードとダウンロードの進捗、バックコントローラー（サーバーからクライアントへの呼び出し）、ピアツーピアメッセージなど、すべての機能をサポートしています。

サーバー間では [TCP](./tcp.md) の方が高速です。ワーカースレッド、Web Worker、子プロセスとの通信には [IPC](./ipc.md) を使用してください。コネクションを開いたままにできない環境では、[HTTP](./http.md) がすべての呼び出しを個別のリクエストとして送信します。

## Deepkit アプリ

Deepkit アプリは、HTTP サーバーのポート上で WebSocket を介して RPC コントローラーを提供します。設定は一切不要です:

```typescript
import { App } from '@deepkit/app';
import { FrameworkModule } from '@deepkit/framework';
import { rpc } from '@deepkit/rpc';

@rpc.controller('user')
class UserController {
    @rpc.action()
    hello(name: string): string {
        return 'Hello ' + name;
    }
}

new App({
    controllers: [UserController],
    imports: [new FrameworkModule({ port: 8080 })],
}).run();
```

```sh
ts-node app.ts server:start
```

## クライアント

```typescript
import { RpcWebSocketClient } from '@deepkit/rpc';

const client = new RpcWebSocketClient('ws://localhost:8080');
const user = client.controller<UserController>('user');

await user.hello('Peter'); // 'Hello Peter'
```

クライアントは最初の呼び出し時に接続し、コネクションが失われた後は次の呼び出し時に再接続します。`client.connect()` は即座に接続し、`client.disconnect()` はコネクションを閉じます。

ブラウザでは、`RpcWebSocketClient.fromCurrentHost()` がページのホストに接続し、HTTPS ページでは `wss://` を使用します。依存性注入を使用するフロントエンドでは、`provideRpcWebSocketClient` がクライアントを提供します:

```typescript
import { provideRpcWebSocketClient } from '@deepkit/rpc';

// ページのオリジン、または指定された URL。ポートマッピングは別ポートで動作する開発サーバー用
providers: [provideRpcWebSocketClient(undefined, { 4200: 8080 })];
```

Node 22 以降には `WebSocket` が組み込まれています。それより古いバージョンでは、`ws` パッケージのクラスをアダプターに渡してください:

```typescript
import { RpcClient, RpcWebSocketClientAdapter } from '@deepkit/rpc';
import WebSocket from 'ws';

const client = new RpcClient(new RpcWebSocketClientAdapter('ws://localhost:8080', WebSocket as any));
```

## フレームワークなしで使用する

`@deepkit/rpc-tcp` の `RpcWebSocketServer` は、独自のポートで `RpcKernel` を提供します:

```typescript
import { RpcKernel } from '@deepkit/rpc';
import { RpcWebSocketServer } from '@deepkit/rpc-tcp';

const kernel = new RpcKernel();
kernel.registerController(UserController, 'user');

const server = new RpcWebSocketServer(kernel, 'localhost:8081');
server.start({ host: 'localhost', port: 8081 });
```

## 認証

クライアントに設定されたトークンはコネクションごとに 1 回送信され、`RpcKernelSecurity.authenticate` がそれをコネクションのセッションに変換します。[セキュリティ](./security.md)を参照してください。

```typescript
client.token.set('my-session-token');
```
