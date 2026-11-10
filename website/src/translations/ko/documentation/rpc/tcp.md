# TCP

TCP는 Deepkit RPC에서 가장 빠른 네트워크 전송 방식으로, 서버 간 통신(마이크로서비스 또는 서로 통신하는 Node 프로세스)에 사용됩니다. WebSocket이 지원하는 모든 기능(스트리밍, 진행 상황, back controller, peer-to-peer)을 WebSocket 프로토콜의 프레이밍 없이 지원합니다. 브라우저는 TCP 연결을 열 수 없으므로, 브라우저에서는 [WebSocket](./websocket.md) 또는 [HTTP](./http.md)를 사용하세요. 자체 애플리케이션의 worker thread, Web Worker 및 child process와의 통신에는 [IPC](./ipc.md)가 더 빠릅니다.

서버와 클라이언트는 `@deepkit/rpc-tcp`에 있습니다:

```sh
npm install @deepkit/rpc-tcp
```

## 서버

`RpcTcpServer`는 호스트와 포트에서 `RpcKernel`을 제공합니다:

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

호스트와 포트 대신 경로를 지정하면 Unix socket으로 제공되며, 이는 같은 머신의 프로세스 간 통신에서 더 빠릅니다:

```typescript
const server = new RpcTcpServer(kernel, '/var/run/my-app/rpc.sock');
```

Unix socket은 커널의 TCP/IP 스택을 건너뜁니다. 같은 머신에서 작은 호출은 localhost를 통한 TCP보다 약 25% 빠르며(Linux 서버에서 다른 프로세스로의 호출당 45 µs 대신 34 µs), 100개 객체의 결과는 20% 빠릅니다. 스레드 간 또는 자체 child process와의 통신에는 [IPC](./ipc.md)가 더욱 빠릅니다.

## Deepkit 앱

Deepkit 앱은 컨트롤러를 WebSocket을 통해, 그리고 `httpRpcBasePath`를 사용하면 HTTP를 통해 제공합니다. TCP를 통해서도 제공하려면, 서버가 시작될 때 앱의 `RpcKernel`을 `RpcTcpServer`에 전달하세요. 컨트롤러, 앱의 provider 및 `RpcKernelSecurity`는 WebSocket에서와 동일하게 동작합니다:

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

## 클라이언트

```typescript
import { RpcClient } from '@deepkit/rpc';
import { RpcTcpClientAdapter } from '@deepkit/rpc-tcp';

const client = new RpcClient(new RpcTcpClientAdapter('localhost:8811'));
const user = client.controller<UserController>('user');

await user.hello('Peter'); // 'Hello Peter'
```

클라이언트는 첫 번째 호출 시 연결하며, 연결이 끊어진 후에는 다음 호출 시 다시 연결합니다. Unix socket의 경우 해당 경로를 전달하세요: `new RpcTcpClientAdapter('/var/run/my-app/rpc.sock')`.

## 인증

클라이언트에 설정된 토큰은 연결당 한 번 전송되며, `RpcKernelSecurity.authenticate`가 이를 해당 연결의 세션으로 변환합니다. [보안](./security.md)을 참조하세요.

```typescript
client.token.set('my-session-token');
```
