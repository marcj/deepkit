# WebSocket

WebSocket은 Deepkit RPC의 기본 transport입니다. 브라우저와 Node에서 동작하며, 모든 호출에 대해 하나의 연결을 열어 두고, 모든 기능을 지원합니다: RxJS Observable, Subject, Collection을 이용한 스트리밍, 업로드 및 다운로드 진행 상황, back controller(서버가 클라이언트를 호출하는 것), 그리고 peer-to-peer 메시지.

서버 간에는 [TCP](./tcp.md)가 더 빠릅니다. worker thread, Web Worker, child process에는 [IPC](./ipc.md)를 사용하세요. 연결을 열어 둘 수 없는 경우에는 [HTTP](./http.md)가 모든 호출을 각각 별도의 요청으로 전송합니다.

## Deepkit app

Deepkit app은 HTTP 서버의 포트에서 WebSocket을 통해 RPC controller를 제공하며, 별도로 설정할 것이 없습니다:

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

## 클라이언트

```typescript
import { RpcWebSocketClient } from '@deepkit/rpc';

const client = new RpcWebSocketClient('ws://localhost:8080');
const user = client.controller<UserController>('user');

await user.hello('Peter'); // 'Hello Peter'
```

클라이언트는 첫 번째 호출 시 연결하며, 연결이 끊어진 후에는 다음 호출 시 다시 연결합니다. `client.connect()`는 즉시 연결하고, `client.disconnect()`는 연결을 닫습니다.

브라우저에서 `RpcWebSocketClient.fromCurrentHost()`는 페이지의 호스트에 연결하며, HTTPS 페이지에서는 `wss://`를 사용합니다. dependency injection을 사용하는 프론트엔드에서는 `provideRpcWebSocketClient`가 클라이언트를 제공합니다:

```typescript
import { provideRpcWebSocketClient } from '@deepkit/rpc';

// 페이지의 origin 또는 지정된 URL; 포트 매핑은 다른 포트에서 실행되는 dev server를 위한 것입니다
providers: [provideRpcWebSocketClient(undefined, { 4200: 8080 })];
```

Node 22 이상에는 `WebSocket`이 내장되어 있습니다. 이전 버전에서는 `ws` 패키지의 Class를 adapter에 전달하세요:

```typescript
import { RpcClient, RpcWebSocketClientAdapter } from '@deepkit/rpc';
import WebSocket from 'ws';

const client = new RpcClient(new RpcWebSocketClientAdapter('ws://localhost:8080', WebSocket as any));
```

## 프레임워크 없이 사용하기

`@deepkit/rpc-tcp`의 `RpcWebSocketServer`는 자체 포트에서 `RpcKernel`을 제공합니다:

```typescript
import { RpcKernel } from '@deepkit/rpc';
import { RpcWebSocketServer } from '@deepkit/rpc-tcp';

const kernel = new RpcKernel();
kernel.registerController(UserController, 'user');

const server = new RpcWebSocketServer(kernel, 'localhost:8081');
server.start({ host: 'localhost', port: 8081 });
```

## 인증

클라이언트에 설정된 token은 연결당 한 번 전송되며, `RpcKernelSecurity.authenticate`가 이를 해당 연결의 session으로 변환합니다. [보안](./security.md)을 참조하세요.

```typescript
client.token.set('my-session-token');
```
