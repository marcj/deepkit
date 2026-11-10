# IPC

Deepkit RPC verbindet auch Teile einer Anwendung, die parallel auf derselben Maschine laufen: Worker Threads, Web Workers im Browser und Child Processes. Die Controller sind dieselben wie über [TCP](./tcp.md), [WebSocket](./websocket.md) oder [HTTP](./http.md), und wie bei TCP und WebSocket funktionieren Streaming, Progress und Back-Controller. Nur der Kanal zwischen den beiden Seiten ist ein anderer, und es liegt kein Netzwerk-Stack dazwischen.

Eine Seite stellt einen `RpcKernel` mit `serveRpcChannel()` bereit, die andere verbindet einen `RpcClient` mit `RpcChannelClientAdapter`. Beide sind in `@deepkit/rpc` enthalten und funktionieren sowohl in node als auch im Browser. Der Kanal ist einer der folgenden:

| Kanal                         | Zwischen                                                                       |
| ----------------------------- | ------------------------------------------------------------------------------ |
| `createSharedMemoryChannel()` | Threads: nodes `worker_threads`, Web Workers. Am schnellsten.                  |
| `createMessagePortChannel()`  | Threads: ein `Worker`, `MessagePort` oder `self` in einem Web Worker.          |
| `createStreamChannel()`       | Prozesse: eine zusätzliche Pipe eines Child Process oder ein beliebiger Byte-Stream. |
| `createProcessChannel()`      | Prozesse: der IPC-Kanal von `child_process.fork()`.                            |

## Worker Threads

Der Worker stellt den Kernel über seinen Port zum Main Thread bereit:

```typescript
// server.ts, läuft im Worker
import { parentPort } from 'node:worker_threads';

import { RpcKernel, createMessagePortChannel, rpc, serveRpcChannel } from '@deepkit/rpc';

@rpc.controller('image')
export class ImageController {
    @rpc.action()
    resize(image: Uint8Array, width: number): Uint8Array {
        return resize(image, width);
    }
}

const kernel = new RpcKernel();
kernel.registerController(ImageController);
serveRpcChannel(kernel, createMessagePortChannel(parentPort!));
```

Der Main Thread startet den Worker und verbindet sich mit ihm:

```typescript
import { Worker } from 'node:worker_threads';

import { RpcChannelClientAdapter, RpcClient, createMessagePortChannel } from '@deepkit/rpc';

import type { ImageController } from './server.js';

const worker = new Worker('./server.js');
const client = new RpcClient(new RpcChannelClientAdapter(createMessagePortChannel(worker)));
const image = client.controller<ImageController>('image');

const small = await image.resize(original, 200);
```

Nachrichten werden an den anderen Thread übertragen (transferred), nicht kopiert. Die Frames aller Aufrufe, die in einem Tick gemacht werden, gehen in eine Nachricht. Wenn der Worker beendet wird, wird die Verbindung des Clients getrennt.

Andere Nachrichten können sich den Port teilen: Alles, was kein `Uint8Array` ist, bleibt Ihren eigenen Listenern überlassen.

## Shared Memory

Zwischen Threads sendet der schnellste Kanal überhaupt keine Nachrichten. Beide Seiten teilen sich einen `SharedArrayBuffer` mit einem Ringpuffer pro Richtung: Der Sender schreibt die Frames direkt hinein, der Empfänger liest sie von dort. Es gibt keine Allokation und kein Structured Clone pro Nachricht, und solange die andere Seite beschäftigt ist, ist kein Aufwecken nötig.

```typescript
// Main Thread
import { Worker } from 'node:worker_threads';

import { RpcChannelClientAdapter, RpcClient, createRpcSharedMemory, createSharedMemoryChannel } from '@deepkit/rpc';

const memory = createRpcSharedMemory(); // 1 MB pro Richtung
const worker = new Worker('./server.js', { workerData: { memory } });
const channel = createSharedMemoryChannel(memory, 'client');
worker.on('exit', () => channel.close());
const client = new RpcClient(new RpcChannelClientAdapter(channel));
```

```typescript
// server.ts, im Worker
import { workerData } from 'node:worker_threads';

import { createSharedMemoryChannel, serveRpcChannel } from '@deepkit/rpc';

serveRpcChannel(kernel, createSharedMemoryChannel(workerData.memory, 'server'));
```

Nachrichten, die größer als der Ringpuffer sind, werden in Teilen gesendet. Der Speicher kann nicht erkennen, wann der andere Thread beendet wurde, rufen Sie daher in diesem Fall `close()` des Kanals auf, wie oben beim `exit`-Event.

Nach einer Nachricht pollt die empfangende Seite 100 µs lang nach der nächsten, bevor sie schlafen geht, und zwar in jedem Durchlauf der Event Loop, sodass der Thread in der Zwischenzeit frei bleibt. Eine Antwort, die in dieser Zeit eintrifft, wird sofort gelesen, statt erst nach einem Aufwecken des Threads, das 20 bis 30 µs dauert (siehe [Performance](#performance)). Der Preis dafür ist ein ausgelasteter Kern während des Wartens. Die Option `spin` legt die Zeit in Mikrosekunden fest, `0` deaktiviert das Polling: `createSharedMemoryChannel(memory, 'client', { spin: 0 })`.

## Web Workers

Im Browser funktioniert dasselbe mit einem Web Worker. Der Worker verwendet seinen globalen Scope `self` als Port:

```typescript
// worker.ts
import { RpcKernel, createMessagePortChannel, serveRpcChannel } from '@deepkit/rpc';

const kernel = new RpcKernel();
kernel.registerController(SearchController);
serveRpcChannel(kernel, createMessagePortChannel(self));
```

```typescript
// in der Seite
const worker = new Worker(new URL('./worker.ts', import.meta.url), { type: 'module' });
const client = new RpcClient(new RpcChannelClientAdapter(createMessagePortChannel(worker)));
const search = client.controller<SearchController>('search');
```

Damit wird aufwendige Arbeit aus dem Main Thread ausgelagert, mit denselben typisierten Aufrufen wie zum Server. Shared Memory funktioniert auch im Browser, wenn die Seite cross-origin isolated ist (die Header `Cross-Origin-Opener-Policy: same-origin` und `Cross-Origin-Embedder-Policy: require-corp`) und der Browser `Atomics.waitAsync` unterstützt; übergeben Sie den Speicher mit `postMessage()` an den Worker.

Chromium, Firefox und WebKit (Safari) unterstützen es alle, gemessen mit Playwright. Ein kleiner Aufruf von der Seite an einen Web Worker, auf einem MacBook (M-Serie):

| Browser       | MessagePort | Shared Memory |
| ------------- | ----------: | ------------: |
| Chromium 158  |       23 µs |        8.8 µs |
| Firefox 159   |       46 µs |         28 µs |
| WebKit 27     |       48 µs |         28 µs |

## Child Processes

Ein Child Process ist nützlich, wenn die Arbeit weder den Speicher noch die Abstürze des Hauptprozesses teilen soll oder eine andere node-Version verwendet. Der schnellste Kanal zu einem Child ist eine zusätzliche Pipe: Die Bytes gehen direkt hindurch.

```typescript
// Hauptprozess
import { spawn } from 'node:child_process';
import { Socket } from 'node:net';

import { RpcChannelClientAdapter, RpcClient, createStreamChannel } from '@deepkit/rpc';

const child = spawn(process.execPath, ['server.js'], { stdio: ['inherit', 'inherit', 'inherit', 'pipe'] });
const client = new RpcClient(new RpcChannelClientAdapter(createStreamChannel(child.stdio[3] as Socket)));
```

```typescript
// server.js, im Child
import { Socket } from 'node:net';

import { createStreamChannel, serveRpcChannel } from '@deepkit/rpc';

serveRpcChannel(kernel, createStreamChannel(new Socket({ fd: 3, readable: true, writable: true })));
```

Ein Stream trägt eine Verbindung: Wenn der Client die Verbindung trennt, endet die Pipe.

Wenn das Child ohnehin mit `fork()` gestartet wird, funktioniert auch dessen IPC-Kanal. Er muss `serialization: 'advanced'` verwenden, damit Bytes als Bytes gesendet werden. Andere Nachrichten können sich den Kanal teilen:

```typescript
import { fork } from 'node:child_process';

import { createProcessChannel } from '@deepkit/rpc';

// Hauptprozess
const child = fork('./server.js', { serialization: 'advanced' });
const client = new RpcClient(new RpcChannelClientAdapter(createProcessChannel(child)));

// server.js, im Child
serveRpcChannel(kernel, createProcessChannel(process));
```

node serialisiert jede Nachricht dieses Kanals und verpackt sie in JSON, was ihn zum langsamsten der Kanäle macht.

## Worker-Pools

Ein Worker nutzt einen Kern. Um die Arbeit auf mehrere zu verteilen, starten Sie mehrere Worker und fügen deren Clients in einen `RpcClientPool` ein. Seine Controller sehen aus wie die eines einzelnen Clients, jeder Aufruf geht an den Client mit den wenigsten laufenden Aufrufen:

```typescript
import { Worker } from 'node:worker_threads';
import { availableParallelism } from 'node:os';
import { RpcChannelClientAdapter, RpcClient, RpcClientPool, createMessagePortChannel } from '@deepkit/rpc';

const pool = new RpcClientPool(
    Array.from({ length: availableParallelism() - 1 }, () => {
        const worker = new Worker('./server.js');
        return new RpcClient(new RpcChannelClientAdapter(createMessagePortChannel(worker)));
    }),
);
const image = pool.controller<ImageController>('image');

const thumbnails = await Promise.all(files.map(file => image.resize(file, 200)));
await pool.disconnect();
```

Ein Aufruf, der ein Observable oder eine Collection zurückgibt, bleibt bei dem Client, der ihn gestartet hat. Aufrufe sind untereinander nicht geordnet, da sie auf verschiedenen Workern laufen können. Der Pool funktioniert mit beliebigen Clients, auch über Shared Memory oder zu Child Processes.

## Performance

Zeit pro Aufruf vom Main Thread zu einem Server in einem Worker Thread oder Child Process, auf einer Linux-Maschine (Intel i9, node 26). Der Client wartet auf jede Antwort, bevor er den nächsten Aufruf macht, außer in der letzten Spalte, in der 64 Aufrufe gleichzeitig laufen:

| Kanal                             | Zwei Zahlen | Ein Objekt | 100 Objekte | 64 gleichzeitig, pro Aufruf |
| --------------------------------- | ----------: | ---------: | ----------: | --------------------------: |
| Shared Memory                     |      5.8 µs |    10.2 µs |      150 µs |                      1.1 µs |
| Shared Memory, ohne Polling       |       31 µs |      38 µs |      210 µs |                      1.4 µs |
| Pipe zu einem Child Process       |       34 µs |      39 µs |      205 µs |                      1.4 µs |
| Unix Socket zu einem Child Process |      34 µs |      39 µs |      204 µs |                      1.3 µs |
| MessagePort zu einem Worker Thread |      41 µs |      49 µs |      213 µs |                      1.5 µs |
| TCP zu einem Child Process        |       45 µs |      52 µs |      256 µs |                      1.5 µs |
| `process.send()` (fork)           |       61 µs |      67 µs |      265 µs |                      1.8 µs |

Ein einzelner Aufruf besteht größtenteils aus der Zeit, die das Betriebssystem braucht, um den anderen Thread oder Prozess aufzuwecken, etwa 20 bis 30 µs, die jeder Kanal zahlt, der auf eine Nachricht wartet. Shared Memory vermeidet dies, indem 100 µs lang nach der Antwort gepollt wird (Option `spin`), was einen Aufruf 6-mal schneller macht als über einen Unix Socket. Bei vielen gleichzeitigen Aufrufen bündeln alle Kanäle diese, und ein Aufruf kostet etwa eine Mikrosekunde. Bei größeren Ergebnissen nimmt die Serialisierung den Großteil der Zeit ein.

Also: Zwischen Threads verwenden Sie Shared Memory. Zu einem Child Process verwenden Sie eine Pipe oder einen Unix Socket, nicht `process.send()`. Die Benchmarks befinden sich in `benchmarks/comparison/ipc` des Repositorys.

## Verbindungen

Ein Kanal trägt jeweils eine Verbindung. Ein Client, dessen Verbindung getrennt wurde, verbindet sich bei seinem nächsten Aufruf erneut über denselben Message Port, Prozesskanal oder Shared Memory, und der Server startet eine neue Verbindung für ihn, mit einem neuen `rpc`-Scope. Um mehrere Clients mit einem Worker zu verbinden, geben Sie jedem einen eigenen `MessageChannel` oder eigenen Shared Memory. Für mehrere Worker siehe [Worker-Pools](#worker-pools).

`serveRpcChannel()` gibt den Server des Kanals zurück. `close()` stoppt ihn und schließt die aktuelle Verbindung:

```typescript
const server = serveRpcChannel(kernel, channel);
server.connection; // die aktuelle Verbindung, falls vorhanden
server.close();
```

## Andere Kanäle

Ein Kanal ist ein kleines Interface, `RpcChannel`: `send()` sendet Bytes, `end()` beendet die Verbindung, und `listen()` empfängt Bytes und das Ende der anderen Seite. Implementieren Sie es für alles andere, das Bytes oder Nachrichten transportiert, zum Beispiel Electrons IPC oder den Port einer Browser-Extension.
