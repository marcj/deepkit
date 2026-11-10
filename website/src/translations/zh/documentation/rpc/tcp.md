# TCP

TCP 是 Deepkit RPC 中最快的网络传输方式，适用于服务器之间的通信：微服务，或相互通信的 Node 进程。它支持 WebSocket 所支持的一切功能（streaming、进度、back controllers、点对点），但没有 WebSocket 协议的帧开销。浏览器无法建立 TCP 连接，在浏览器中请使用 [WebSocket](./websocket.md) 或 [HTTP](./http.md)。对于你自己应用中的 worker threads、Web Workers 和子进程，[IPC](./ipc.md) 更快。

服务器和客户端位于 `@deepkit/rpc-tcp` 中：

```sh
npm install @deepkit/rpc-tcp
```

## 服务器

`RpcTcpServer` 在指定的主机和端口上提供 `RpcKernel` 服务：

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

如果传入路径而不是主机和端口，则会在 Unix socket 上提供服务，这在同一台机器上的进程之间更快：

```typescript
const server = new RpcTcpServer(kernel, '/var/run/my-app/rpc.sock');
```

Unix socket 会跳过内核的 TCP/IP 协议栈。在同一台机器上，一次小调用比通过 localhost 上的 TCP 快约 25%（在一台 Linux 服务器上，对另一个进程的每次调用为 34 µs 而不是 45 µs），返回 100 个对象的结果则快 20%。在线程之间或与你自己的子进程通信时，[IPC](./ipc.md) 还要更快。

## Deepkit 应用

Deepkit 应用通过 WebSocket 提供其 controllers 服务，配置 `httpRpcBasePath` 后还可通过 HTTP 提供服务。若要同时通过 TCP 提供服务，请在服务器启动时将应用的 `RpcKernel` 传给 `RpcTcpServer`。controllers、应用的 providers 以及 `RpcKernelSecurity` 的工作方式与通过 WebSocket 时相同：

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

## 客户端

```typescript
import { RpcClient } from '@deepkit/rpc';
import { RpcTcpClientAdapter } from '@deepkit/rpc-tcp';

const client = new RpcClient(new RpcTcpClientAdapter('localhost:8811'));
const user = client.controller<UserController>('user');

await user.hello('Peter'); // 'Hello Peter'
```

客户端在第一次调用时建立连接，连接断开后会在下一次调用时重新连接。对于 Unix socket，传入其路径即可：`new RpcTcpClientAdapter('/var/run/my-app/rpc.sock')`。

## 身份验证

在客户端上设置的 token 每个连接只发送一次，`RpcKernelSecurity.authenticate` 会将其转换为该连接的 session。参见[安全](./security.md)。

```typescript
client.token.set('my-session-token');
```
