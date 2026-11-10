# TCP

TCP ist der schnellste Netzwerk-Transport von Deepkit RPC, für die Kommunikation zwischen Servern: Microservices oder Node-Prozesse, die miteinander kommunizieren. Er unterstützt alles, was WebSocket unterstützt (Streaming, Progress, Back-Controller, Peer-to-Peer), ohne das Framing des WebSocket-Protokolls. Browser können keine TCP-Verbindungen öffnen, verwende dort [WebSocket](./websocket.md) oder [HTTP](./http.md). Zu Worker-Threads, Web Workers und Child-Prozessen deiner eigenen Anwendung ist [IPC](./ipc.md) schneller.

Server und Client befinden sich in `@deepkit/rpc-tcp`:

```sh
npm install @deepkit/rpc-tcp
```

## Server

`RpcTcpServer` stellt einen `RpcKernel` auf einem Host und Port bereit:

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

Anstelle von Host und Port stellt ein Pfad den Server auf einem Unix-Socket bereit, was zwischen Prozessen auf derselben Maschine schneller ist:

```typescript
const server = new RpcTcpServer(kernel, '/var/run/my-app/rpc.sock');
```

Ein Unix-Socket umgeht den TCP/IP-Stack des Kernels. Auf derselben Maschine ist ein kleiner Aufruf etwa 25 % schneller als über TCP auf localhost (34 µs statt 45 µs pro Aufruf an einen anderen Prozess auf einem Linux-Server), und ein Ergebnis mit 100 Objekten 20 % schneller. Zwischen Threads oder zu einem eigenen Child-Prozess ist [IPC](./ipc.md) noch schneller.

## Deepkit-App

Eine Deepkit-App stellt ihre Controller über WebSocket und, mit `httpRpcBasePath`, über HTTP bereit. Um sie zusätzlich über TCP bereitzustellen, übergib den `RpcKernel` der App beim Start des Servers an einen `RpcTcpServer`. Die Controller, die Provider der App und `RpcKernelSecurity` funktionieren genauso wie über WebSocket:

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

Der Client verbindet sich beim ersten Aufruf und stellt die Verbindung beim nächsten Aufruf wieder her, nachdem sie verloren gegangen ist. Für einen Unix-Socket übergib dessen Pfad: `new RpcTcpClientAdapter('/var/run/my-app/rpc.sock')`.

## Authentifizierung

Ein auf dem Client gesetztes Token wird einmal pro Verbindung gesendet, und `RpcKernelSecurity.authenticate` macht daraus die Session der Verbindung. Siehe [Sicherheit](./security.md).

```typescript
client.token.set('my-session-token');
```
