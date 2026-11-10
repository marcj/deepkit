# TCP

TCP は Deepkit RPC の中で最も高速なネットワークトランスポートであり、サーバー間の通信、つまりマイクロサービスや相互に通信する Node プロセスのために使用します。WebSocket でできることはすべてサポートしており（ストリーミング、進捗、バックコントローラー、peer-to-peer）、WebSocket プロトコルのフレーミングはありません。ブラウザは TCP 接続を開けないため、ブラウザでは [WebSocket](./websocket.md) または [HTTP](./http.md) を使用してください。自分のアプリケーションの worker threads、Web Workers、子プロセスとの通信には [IPC](./ipc.md) の方が高速です。

サーバーとクライアントは `@deepkit/rpc-tcp` に含まれています:

```sh
npm install @deepkit/rpc-tcp
```

## サーバー

`RpcTcpServer` は、ホストとポートで `RpcKernel` を提供します:

```typescript
import { RpcKernel, rpc } from '@deepkit/rpc';
import { RpcTcpServer } from '@deepkit/rpc-tcp';

@rpc.controller('user')
class UserController {
    @rpc.action()
    hello(name: string): string {
        return 'Hello ' + name;
    }
}

const kernel = new RpcKernel();
kernel.registerController(UserController, 'user');

const server = new RpcTcpServer(kernel, '0.0.0.0:8811');
await server.start();
```

ホストとポートの代わりにパスを指定すると Unix ソケットで提供され、同一マシン上のプロセス間ではこちらの方が高速です:

```typescript
const server = new RpcTcpServer(kernel, '/var/run/my-app/rpc.sock');
```

Unix ソケットはカーネルの TCP/IP スタックを経由しません。同一マシン上では、小さな呼び出しは localhost 上の TCP より約 25% 高速であり（Linux サーバー上で別プロセスへの呼び出し 1 回あたり 45 µs ではなく 34 µs）、100 個のオブジェクトからなる結果では 20% 高速です。スレッド間や自分の子プロセスとの通信では、[IPC](./ipc.md) がさらに高速です。

## Deepkit アプリ

Deepkit アプリはコントローラーを WebSocket で提供し、`httpRpcBasePath` を指定すると HTTP でも提供します。TCP でも提供するには、サーバーの起動時にアプリの `RpcKernel` を `RpcTcpServer` に渡します。コントローラー、アプリのプロバイダー、`RpcKernelSecurity` は WebSocket の場合と同じように動作します:

```typescript
import { App } from '@deepkit/app';
import { FrameworkModule, onServerMainBootstrap, onServerMainShutdown } from '@deepkit/framework';
import { RpcKernel } from '@deepkit/rpc';
import { RpcTcpServer } from '@deepkit/rpc-tcp';

let tcp: RpcTcpServer | undefined;

new App({
    controllers: [UserController],
    imports: [new FrameworkModule()],
})
    .listen(onServerMainBootstrap, async (event, kernel: RpcKernel) => {
        tcp = new RpcTcpServer(kernel, '0.0.0.0:8811');
        await tcp.start();
    })
    .listen(onServerMainShutdown, () => tcp?.close())
    .run();
```

## クライアント

```typescript
import { RpcClient } from '@deepkit/rpc';
import { RpcTcpClientAdapter } from '@deepkit/rpc-tcp';

const client = new RpcClient(new RpcTcpClientAdapter('localhost:8811'));
const user = client.controller<UserController>('user');

await user.hello('Peter'); // 'Hello Peter'
```

クライアントは最初の呼び出し時に接続し、接続が失われた場合は次の呼び出し時に再接続します。Unix ソケットの場合は、そのパスを渡します: `new RpcTcpClientAdapter('/var/run/my-app/rpc.sock')`。

## 認証

クライアントに設定されたトークンは接続ごとに 1 回送信され、`RpcKernelSecurity.authenticate` がそれを接続のセッションに変換します。[セキュリティ](./security.md) を参照してください。

```typescript
client.token.set('my-session-token');
```
