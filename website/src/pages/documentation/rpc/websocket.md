# WebSocket

WebSocket is the default transport of Deepkit RPC. It works in browsers and in Node, keeps one connection open for all calls, and supports everything: streaming with RxJS Observables, Subjects and Collections, progress of uploads and downloads, back controllers (the server calling the client) and peer-to-peer messages.

Between servers, [TCP](./tcp.md) is faster. To worker threads, Web Workers and child processes, use [IPC](./ipc.md). Where no connection can stay open, [HTTP](./http.md) sends every call as a request of its own.

## Deepkit app

A Deepkit app serves its RPC controllers over WebSocket on the port of its HTTP server, there is nothing to configure:

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

## Client

```typescript
import { RpcWebSocketClient } from '@deepkit/rpc';

const client = new RpcWebSocketClient('ws://localhost:8080');
const user = client.controller<UserController>('user');

await user.hello('Peter'); // 'Hello Peter'
```

The client connects on the first call and reconnects on the next call after the connection was lost. `client.connect()` connects right away, `client.disconnect()` closes the connection.

In the browser, `RpcWebSocketClient.fromCurrentHost()` connects to the host of the page, with `wss://` on HTTPS pages. In a frontend with dependency injection, `provideRpcWebSocketClient` provides the client:

```typescript
import { provideRpcWebSocketClient } from '@deepkit/rpc';

// the origin of the page, or the given URL; the port mapping is for a dev server on another port
providers: [provideRpcWebSocketClient(undefined, { 4200: 8080 })];
```

Node 22 and newer have `WebSocket` built in. For older versions, pass the class of the `ws` package to the adapter:

```typescript
import { RpcClient, RpcWebSocketClientAdapter } from '@deepkit/rpc';
import WebSocket from 'ws';

const client = new RpcClient(new RpcWebSocketClientAdapter('ws://localhost:8080', WebSocket as any));
```

## Without the framework

`RpcWebSocketServer` of `@deepkit/rpc-tcp` serves an `RpcKernel` on its own port:

```typescript
import { RpcKernel } from '@deepkit/rpc';
import { RpcWebSocketServer } from '@deepkit/rpc-tcp';

const kernel = new RpcKernel();
kernel.registerController(UserController, 'user');

const server = new RpcWebSocketServer(kernel, 'localhost:8081');
server.start({ host: 'localhost', port: 8081 });
```

## Authentication

A token set on the client is sent once per connection, and `RpcKernelSecurity.authenticate` turns it into the session of the connection. See [Security](./security.md).

```typescript
client.token.set('my-session-token');
```
