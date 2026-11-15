# Erste Schritte

Um Deepkit RPC zu verwenden, muss `@deepkit/type` korrekt installiert sein, da es auf Runtime Types basiert. Siehe [Runtime Type Installation](../runtime-types.md).

Sobald dies erfolgreich erledigt ist, kann `@deepkit/rpc` oder das Deepkit Framework, das die Library bereits unter der Haube verwendet, installiert werden.

```sh
npm install @deepkit/rpc
```

Beachten Sie, dass Controller-Klassen in `@deepkit/rpc` auf TypeScript-Decorators basieren und dieses Feature mit experimentalDecorators aktiviert werden muss.

Das Paket `@deepkit/rpc` muss auf dem Server und dem Client installiert werden, wenn diese jeweils eine eigene package.json haben.

Um über TCP mit dem Server zu kommunizieren, muss das Paket `@deepkit/rpc-tcp` auf dem Client und dem Server installiert werden.

```sh
npm install @deepkit/rpc-tcp
```

Für die WebSocket-Kommunikation wird das Paket ebenfalls auf dem Server benötigt. Der Client im Browser hingegen verwendet WebSocket aus dem offiziellen Standard.

Soll der Client auch in einer Umgebung verwendet werden, in der WebSocket nicht verfügbar ist (zum Beispiel NodeJS), wird das Paket ws im Client benötigt.

```sh
npm install ws
```

## Verwendung

Nachfolgend ein voll funktionsfähiges Beispiel, das auf WebSockets und der Low-Level-API von @deepkit/rpc basiert. Bei Verwendung des Deepkit Frameworks werden Controller über App-Module bereitgestellt, und ein RpcKernel wird nicht manuell instanziiert.

_Datei: server.ts_

```typescript
import { rpc, RpcKernel } from '@deepkit/rpc';
import { RpcWebSocketServer } from '@deepkit/rpc-tcp';

@rpc.controller('/main')
export class Controller {
    @rpc.action()
    hello(title: string): string {
        return 'Hello ' + title;
    }
}

const kernel = new RpcKernel();
kernel.registerController(Controller);
const server = new RpcWebSocketServer(kernel, 'localhost:8081');
server.start({
    host: '127.0.0.1',
    port: 8081,
});
console.log('Server started at ws://127.0.0.1:8081');

```

_Datei: client.ts_

```typescript
import { RpcWebSocketClient } from '@deepkit/rpc';
import type { Controller } from './server';

async function main() {
    const client = new RpcWebSocketClient('ws://127.0.0.1:8081');
    const controller = client.controller<Controller>('/main');

    const result = await controller.hello('World');
    console.log('result', result);

    client.disconnect();
}

main().catch(console.error);

```

## Server-Controller

Der Begriff „Procedure“ in Remote Procedure Call wird häufig auch als „Action“ bezeichnet. Eine Action ist eine Methode, die in einer Klasse definiert und mit dem Decorator `@rpc.action` markiert ist. Die Klasse selbst wird mit dem Decorator `@rpc.controller` als Controller markiert und erhält einen eindeutigen Namen. Auf diesen Namen wird dann im Client verwiesen, um den richtigen Controller anzusprechen. Es können beliebig viele Controller definiert und registriert werden.


```typescript
import { rpc } from '@deepkit/rpc';

@rpc.controller('/main')
class Controller {
    @rpc.action()
    hello(title: string): string {
        return 'Hello ' + title;
    }

    @rpc.action()
    test(): boolean {
        return true;
    }
}
```

Nur Methoden, die mit `@rpc.action()` markiert sind, können von einem Client aufgerufen werden.

Typen müssen explizit angegeben werden und können nicht inferiert werden. Dies ist wichtig, da der Serializer genau wissen muss, wie die Typen aussehen, um sie in Binärdaten (BSON) oder JSON umzuwandeln, die dann über die Leitung gesendet werden.

## Client-Controller

Der normale Ablauf bei RPC ist, dass der Client Funktionen auf dem Server ausführen kann. In Deepkit RPC ist es jedoch auch möglich, dass der Server Funktionen auf dem Client ausführt. Um dies zu ermöglichen, kann auch der Client einen Controller registrieren.

Der Client registriert den Controller mit `client.registerController()` unter einem Namen. Der Server bekommt die `RpcKernelConnection` des aufrufenden Clients injiziert und erstellt dafür mit `connection.controller<T>(name)` einen Remote-Controller. Wie auf dem Client gibt jede Methode des Remote-Controllers ein `Promise` zurück.

```typescript
import { rpc, RpcKernelConnection } from '@deepkit/rpc';

//läuft auf dem Client
@rpc.controller('/client')
export class ClientController {
    @rpc.action()
    notify(message: string): void {
        console.log('Server says:', message);
    }
}

//läuft auf dem Server
@rpc.controller('/main')
export class Controller {
    constructor(private connection: RpcKernelConnection) {
    }

    @rpc.action()
    async ping(): Promise<string> {
        const client = this.connection.controller<ClientController>('/client');
        await client.notify('ping received');
        return 'pong';
    }
}
```

```typescript
const client = new RpcWebSocketClient('ws://127.0.0.1:8081');
client.registerController(ClientController, '/client');

const controller = client.controller<Controller>('/main');
await controller.ping(); //gibt "Server says: ping received" auf dem Client aus
```

Der Remote-Controller funktioniert, solange die Verbindung offen ist. Um den Client später aufzurufen, zum Beispiel um eine Benachrichtigung zu pushen, behalten Sie eine Referenz auf die `RpcKernelConnection` und entfernen Sie sie, sobald der Client die Verbindung trennt. Back-Controller benötigen eine persistente Verbindung, daher funktionieren sie über WebSocket, TCP und IPC, aber nicht über [HTTP](./http.md).

## Dependency Injection

Wenn das Deepkit Framework verwendet wird, wird die Klasse vom Dependency-Injection-Container instanziiert und hat somit automatisch Zugriff auf alle anderen Provider in der Anwendung.

Siehe auch [Dependency Injection](dependency-injection.md#).

## Streaming RxJS

Eine Action kann ein RxJS `Observable`, `Subject` oder `BehaviorSubject` zurückgeben oder einen `ProgressTracker` aus `@deepkit/core-rxjs`. Der Rückgabetyp kann auch in ein `Promise` eingebettet sein. Der Client erhält ein Objekt desselben Typs, und die Werte kommen an, sobald der Server sie emittiert.

```typescript
import { rpc } from '@deepkit/rpc';
import { BehaviorSubject, Observable, Subject } from 'rxjs';

@rpc.controller('/main')
export class Controller {
    chat = new Subject<string>();
    status = new BehaviorSubject<string>('idle');

    @rpc.action()
    countdown(from: number): Observable<number> {
        return new Observable(subscriber => {
            for (let i = from; i >= 0; i--) subscriber.next(i);
            subscriber.complete();
        });
    }

    @rpc.action()
    messages(): Subject<string> {
        return this.chat;
    }

    @rpc.action()
    currentStatus(): BehaviorSubject<string> {
        return this.status;
    }
}
```

```typescript
const controller = client.controller<Controller>('/main');

const countdown = await controller.countdown(3);
countdown.subscribe(value => console.log(value)); //3, 2, 1, 0

const messages = await controller.messages();
messages.subscribe(message => console.log(message));

const status = await controller.currentStatus();
status.getValue(); //'idle'
```

Die Typen verhalten sich unterschiedlich:

- `Observable`: lazy. Der Server subscribed das zurückgegebene Observable jedes Mal, wenn der Client subscribed, und unsubscribed, wenn der Client unsubscribed. Dadurch wird die Teardown-Logik des Observables auf dem Server ausgeführt.
- `Subject`: Der Server subscribed sofort und leitet alle Werte weiter. Werte, die emittiert werden, bevor der Client subscribed, gehen verloren, wie bei jedem Subject.
- `BehaviorSubject`: wie `Subject`, und der Client startet mit dem aktuellen Wert des Servers, sodass `getValue()` sofort funktioniert.

Wenn der Server den Stream abschließt oder einen Fehler emittiert, wird auch das Observable oder Subject des Clients abgeschlossen bzw. erhält einen Fehler.

### Aufräumen

Der Aufruf von `unsubscribe()` oder `complete()` auf einem Subject oder BehaviorSubject auf dem Client bewirkt, dass der Server keine Werte mehr weiterleitet. Das Subject auf dem Server wird nicht abgeschlossen, sodass ein geteiltes Subject, wie `chat` oben, für andere Clients weiterhin funktioniert. Wenn die Verbindung geschlossen wird, unsubscribed der Server alle Observables und Subjects dieses Clients. Wenn der Client einen Stream verwirft, ohne zu unsubscriben, wird dieser freigegeben, sobald er vom Garbage Collector eingesammelt wird. Verlassen Sie sich aber nicht darauf und unsubscriben Sie explizit.

```typescript
const messages = await controller.messages();
const subscription = messages.subscribe(message => console.log(message));

subscription.unsubscribe(); //stoppt nur diesen Subscriber
messages.unsubscribe(); //weist den Server an, keine Werte mehr zu senden
```

### Fortschritt

`ProgressTracker` meldet den Fortschritt einer lang laufenden Operation. Jeder Aufruf von `track(message, total)` erstellt eine Gruppe, und das Setzen von `done` sendet das Update an den Client (gedrosselt auf 100 ms). Der Tracker wird abgeschlossen, wenn alle Gruppen fertig sind. Der Client kann `stop()` auf seinem Tracker aufrufen, wodurch die `onStop`-Callbacks auf dem Server aufgerufen werden.

```typescript
import { rpc } from '@deepkit/rpc';
import { ProgressTracker } from '@deepkit/core-rxjs';

@rpc.controller('/import')
export class ImportController {
    @rpc.action()
    import(): ProgressTracker {
        const tracker = new ProgressTracker();
        const rows = tracker.track('Importing rows', 100);

        const timer = setInterval(() => {
            rows.done++;
            if (rows.finished) clearInterval(timer);
        }, 50);
        rows.onStop(() => clearInterval(timer));

        return tracker;
    }
}
```

```typescript
const progress = await client.controller<ImportController>('/import').import();
progress.subscribe(() => console.log(progress.done, '/', progress.total));

progress.stop(); //bricht den Import auf dem Server ab
```

Streams benötigen eine persistente Verbindung und werden über [HTTP](./http.md) nicht unterstützt.

## Nominale Typen

Wenn der Client Daten aus einem Funktionsaufruf erhält, wurden diese zuerst auf dem Server serialisiert und dann auf dem Client deserialisiert. Enthält der Rückgabetyp der Funktion Klassen, werden diese Klassen auf der Client-Seite rekonstruiert, verlieren jedoch ihre nominale Identität und die zugehörigen Methoden. Um dieses Problem zu lösen, registrieren Sie die Klassen als nominale Typen mit eindeutigen IDs/Namen. Dieser Ansatz sollte auf alle Klassen angewendet werden, die innerhalb einer RPC-API verwendet werden.

Um eine Klasse zu registrieren, verwenden Sie den Decorator `@entity.name('id')`.

```typescript
import { entity } from '@deepkit/type';

@entity.name('user')
class User {
    id!: number;
    firstName!: string;
    lastName!: string;
    get fullName() {
        return this.firstName + ' ' + this.lastName;
    }
}
```

Sobald diese Klasse als Ergebnis einer Funktion verwendet wird, bleibt ihre Identität erhalten.

```typescript
const controller = client.controller<Controller>('/main');

const user = await controller.getUser(2);
user instanceof User; //true, wenn @entity.name verwendet wird, andernfalls false
```
