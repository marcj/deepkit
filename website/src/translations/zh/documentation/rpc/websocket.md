# WebSocket

WebSocket 是 Deepkit RPC 的默认传输方式。它可以在浏览器和 Node 中运行，所有调用共用一个保持打开的连接，并且支持全部功能：使用 RxJS Observables、Subjects 和 Collections 进行流式传输，上传和下载进度，back controllers（服务端调用客户端）以及点对点消息。

在服务器之间，[TCP](./tcp.md) 更快。对于 worker threads、Web Workers 和子进程，请使用 [IPC](./ipc.md)。在无法保持连接打开的场景下，[HTTP](./http.md) 会将每次调用作为单独的请求发送。

## Deepkit 应用

Deepkit 应用会在其 HTTP 服务器的端口上通过 WebSocket 提供 RPC 控制器，无需任何配置：

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

## 客户端

```typescript
import { RpcWebSocketClient } from '@deepkit/rpc';

const client = new RpcWebSocketClient('ws://localhost:8080');
const user = client.controller<UserController>('user');

await user.hello('Peter'); // 'Hello Peter'
```

客户端在第一次调用时建立连接，并在连接断开后的下一次调用时重新连接。`client.connect()` 会立即建立连接，`client.disconnect()` 会关闭连接。

在浏览器中，`RpcWebSocketClient.fromCurrentHost()` 会连接到页面所在的主机，在 HTTPS 页面上使用 `wss://`。在使用依赖注入的前端中，`provideRpcWebSocketClient` 用于提供客户端：

```typescript
import { provideRpcWebSocketClient } from '@deepkit/rpc';

// 页面的 origin，或给定的 URL；端口映射用于运行在其他端口上的开发服务器
providers: [provideRpcWebSocketClient(undefined, { 4200: 8080 })];
```

Node 22 及更高版本内置了 `WebSocket`。对于更早的版本，请将 `ws` 包的类传递给适配器：

```typescript
import { RpcClient, RpcWebSocketClientAdapter } from '@deepkit/rpc';
import WebSocket from 'ws';

const client = new RpcClient(new RpcWebSocketClientAdapter('ws://localhost:8080', WebSocket as any));
```

## 不使用框架

`@deepkit/rpc-tcp` 中的 `RpcWebSocketServer` 在独立的端口上提供 `RpcKernel` 服务：

```typescript
import { RpcKernel } from '@deepkit/rpc';
import { RpcWebSocketServer } from '@deepkit/rpc-tcp';

const kernel = new RpcKernel();
kernel.registerController(UserController, 'user');

const server = new RpcWebSocketServer(kernel, 'localhost:8081');
server.start({ host: 'localhost', port: 8081 });
```

## 身份验证

在客户端上设置的 token 每个连接只发送一次，`RpcKernelSecurity.authenticate` 会将其转换为该连接的会话。参见 [安全](./security.md)。

```typescript
client.token.set('my-session-token');
```
