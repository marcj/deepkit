# WebSocket

WebSocket ist der Standard-Transport von Deepkit RPC. Er funktioniert in Browsern und in Node, hält eine Verbindung für alle Aufrufe offen und unterstützt alles: Streaming mit RxJS Observables, Subjects und Collections, Fortschritt von Uploads und Downloads, Back-Controller (der Server ruft den Client auf) und Peer-to-Peer-Nachrichten.

Zwischen Servern ist [TCP](./tcp.md) schneller. Für Worker Threads, Web Workers und Child Processes verwende [IPC](./ipc.md). Wo keine Verbindung offen bleiben kann, sendet [HTTP](./http.md) jeden Aufruf als eigenen Request.

## Deepkit-App

Eine Deepkit-App stellt ihre RPC-Controller über WebSocket auf dem Port ihres HTTP-Servers bereit, es gibt nichts zu konfigurieren:

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

Der Client verbindet sich beim ersten Aufruf und verbindet sich beim nächsten Aufruf neu, nachdem die Verbindung verloren gegangen ist. `client.connect()` verbindet sofort, `client.disconnect()` schließt die Verbindung.

Im Browser verbindet sich `RpcWebSocketClient.fromCurrentHost()` mit dem Host der Seite, auf HTTPS-Seiten mit `wss://`. In einem Frontend mit Dependency Injection stellt `provideRpcWebSocketClient` den Client bereit:

```typescript
import { provideRpcWebSocketClient } from '@deepkit/rpc';

// der Origin der Seite oder die angegebene URL; das Port-Mapping ist für einen Dev-Server auf einem anderen Port
providers: [provideRpcWebSocketClient(undefined, { 4200: 8080 })];
```

Node 22 und neuer haben `WebSocket` eingebaut. Für ältere Versionen übergib die Klasse des `ws`-Pakets an den Adapter:

```typescript
import { RpcClient, RpcWebSocketClientAdapter } from '@deepkit/rpc';
import WebSocket from 'ws';

const client = new RpcClient(new RpcWebSocketClientAdapter('ws://localhost:8080', WebSocket as any));
```

## Ohne das Framework

`RpcWebSocketServer` aus `@deepkit/rpc-tcp` stellt einen `RpcKernel` auf einem eigenen Port bereit:

```typescript
import { RpcKernel } from '@deepkit/rpc';
import { RpcWebSocketServer } from '@deepkit/rpc-tcp';

const kernel = new RpcKernel();
kernel.registerController(UserController, 'user');

const server = new RpcWebSocketServer(kernel, 'localhost:8081');
server.start({ host: 'localhost', port: 8081 });
```

## Authentifizierung

Ein auf dem Client gesetzter Token wird einmal pro Verbindung gesendet, und `RpcKernelSecurity.authenticate` macht daraus die Session der Verbindung. Siehe [Sicherheit](./security.md).

```typescript
client.token.set('my-session-token');
```
