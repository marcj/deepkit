# TCP

TCP is the fastest transport of Deepkit RPC, for communication between servers: microservices, workers, or a Node process that talks to another one. It supports everything WebSocket does (streaming, progress, back controllers, peer-to-peer), without the framing of the WebSocket protocol. Browsers can't open TCP connections, use [WebSocket](./websocket.md) or [HTTP](./http.md) there.

The server and the client are in `@deepkit/rpc-tcp`:

```sh
npm install @deepkit/rpc-tcp
```

## Server

`RpcTcpServer` serves an `RpcKernel` on a host and port:

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

Instead of a host and port, a path serves on a Unix socket, which is faster between processes on the same machine:

```typescript
const server = new RpcTcpServer(kernel, '/var/run/my-app/rpc.sock');
```

## Deepkit app

A Deepkit app serves its controllers over WebSocket and, with `httpRpcBasePath`, over HTTP. To serve them over TCP as well, give the `RpcKernel` of the app to an `RpcTcpServer` when the server starts. The controllers, the providers of the app and `RpcKernelSecurity` work the same as over WebSocket:

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

## Client

```typescript
import { RpcClient } from '@deepkit/rpc';
import { RpcTcpClientAdapter } from '@deepkit/rpc-tcp';

const client = new RpcClient(new RpcTcpClientAdapter('localhost:8811'));
const user = client.controller<UserController>('user');

await user.hello('Peter'); // 'Hello Peter'
```

The client connects on the first call and reconnects on the next call after the connection was lost. For a Unix socket, pass its path: `new RpcTcpClientAdapter('/var/run/my-app/rpc.sock')`.

## Authentication

A token set on the client is sent once per connection, and `RpcKernelSecurity.authenticate` turns it into the session of the connection. See [Security](./security.md).

```typescript
client.token.set('my-session-token');
```
