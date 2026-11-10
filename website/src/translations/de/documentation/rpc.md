# TypeScript RPC Framework

Deepkit RPC ist ein typsicheres RPC-Framework für TypeScript. Sie schreiben eine normale Class auf dem Server und rufen deren Methoden vom Client aus auf. Parameter und Ergebnisse werden dabei anhand Ihrer TypeScript-Types validiert, ganz ohne Codegenerierung.

```typescript
//server.ts
import { rpc, RpcKernel } from '@deepkit/rpc';
import { RpcWebSocketServer } from '@deepkit/rpc-tcp';
import { MinLength } from '@deepkit/type';

export interface User {
    username: string;
    createdAt: Date;
}

@rpc.controller('/user')
export class UserController {
    @rpc.action()
    create(username: string & MinLength<3>): User {
        return { username, createdAt: new Date() };
    }
}

const kernel = new RpcKernel();
kernel.registerController(UserController);

const server = new RpcWebSocketServer(kernel, 'localhost:8081');
server.start({ host: '127.0.0.1', port: 8081 });
```

```typescript
//client.ts
import { RpcWebSocketClient } from '@deepkit/rpc';
import type { UserController } from './server';

async function main() {
    const client = new RpcWebSocketClient('ws://127.0.0.1:8081');
    const users = client.controller<UserController>('/user');

    const user = await users.create('Peter');
    console.log(user.createdAt instanceof Date); // true

    await users.create('ab');
    // RpcError: Validation error for arguments of ...
    // username(minLength): Min length is 3 caused by value "ab"
}

main().catch(console.error);
```

Der Client importiert nur den Type des Controllers, sodass kein Server-Code im Client-Bundle landet. Das `Date` kommt als echtes `Date` an, und der ungültige Aufruf wird abgelehnt, bevor die Methode ausgeführt wird. Die Installation wird unter [Erste Schritte](./rpc/getting-started.md) beschrieben.

## Vergleich mit tRPC und gRPC

|                       | Deepkit RPC                             | tRPC                                     | gRPC                                   |
| --------------------- | --------------------------------------- | ---------------------------------------- | -------------------------------------- |
| API-Definition        | TypeScript-Class und -Types             | Router mit Procedures                    | `.proto`-Dateien                       |
| Codegenerierung       | Keine                                   | Keine                                    | Erforderlich                           |
| Laufzeitvalidierung   | Integriert, anhand der TypeScript-Types | Mit einer Schema-Bibliothek wie Zod      | Nur Nachrichtenstruktur                |
| Wire-Format           | Binär (BSON)                            | JSON                                     | Binär (Protocol Buffers)               |
| Transport             | WebSocket, TCP                          | HTTP, WebSocket                          | HTTP/2                                 |
| Sprachen              | TypeScript                              | TypeScript                               | Viele                                  |

Deepkit RPC benötigt den [Deepkit Type-Compiler](./runtime-types/getting-started.md) in Ihrem Build, da es Ihre Types zur Laufzeit ausliest. Für eine API, die von anderen Unternehmen oder einfachen HTTP-Clients aufgerufen wird, verwenden Sie stattdessen [Deepkit HTTP](./http.md). Greifen Sie zu gRPC, wenn Services in mehreren Programmiersprachen miteinander kommunizieren müssen.

## Was ist RPC?

RPC steht für Remote Procedure Call und ermöglicht es, Funktionen auf einem entfernten Server so aufzurufen, als wären es lokale Funktionen. Im Gegensatz zur HTTP-Client-Server-Kommunikation, die HTTP-Methoden und eine URL für die Zuordnung verwendet, nutzt RPC dafür den Funktionsnamen. Die zu sendenden Daten werden als normale Funktionsargumente übergeben, und das Ergebnis des Funktionsaufrufs auf dem Server wird an den Client zurückgesendet.

Der Vorteil von RPC besteht darin, dass die Client-Server-Abstraktion schlank ist, da sie nicht mit Headern, URLs, Query-Strings oder Ähnlichem arbeitet. Der Nachteil ist, dass Funktionen auf einem Server über RPC nicht ohne Weiteres von einem Browser aufgerufen werden können und oft einen speziellen Client erfordern.

Ein wesentliches Merkmal von RPC ist, dass die Daten zwischen Client und Server automatisch serialisiert und deserialisiert werden. Daher sind typsichere RPC-Clients in der Regel möglich. Einige RPC-Frameworks zwingen Benutzer dazu, Types (Parameter-Types und Return-Types) in einem bestimmten Format anzugeben. Dies kann in Form einer DSL wie Protocol Buffers bei gRPC oder eines JavaScript-Schema-Builders geschehen. Zusätzliche Datenvalidierung kann ebenfalls vom RPC-Framework bereitgestellt werden, wird aber nicht von allen unterstützt.

Deepkit RPC extrahiert die Types aus dem TypeScript-Code selbst. Sobald zusätzliche Einschränkungen unter [Validierung](./runtime-types/validation.md) definiert sind, werden sie automatisch validiert. Da RPC grundsätzlich auf asynchroner Kommunikation basiert, geben alle Funktionsaufrufe auf dem Client ein `Promise` zurück, und das Ergebnis wird mit `await` empfangen.

## Streaming mit RxJS

Eine Action kann ein `Observable` zurückgeben. Auch der Client erhält ein solches, und jeder Wert kommt an, sobald der Server ihn ausgibt. Dadurch eignet sich Deepkit RPC für Echtzeitkommunikation.

```typescript
import { rpc } from '@deepkit/rpc';
import { Observable } from 'rxjs';

@rpc.controller('/numbers')
export class NumbersController {
    @rpc.action()
    countdown(from: number): Observable<number> {
        return new Observable(subscriber => {
            for (let i = from; i >= 0; i--) subscriber.next(i);
            subscriber.complete();
        });
    }
}

//auf dem Client
const numbers = client.controller<NumbersController>('/numbers');
const stream = await numbers.countdown(3);
stream.subscribe(value => console.log(value)); // 3, 2, 1, 0
```

## Isomorphes TypeScript

Wenn ein Projekt TypeScript sowohl auf dem Client (meist Frontend) als auch auf dem Server (Backend) verwendet, spricht man von isomorphem TypeScript. Ein typsicheres RPC-Framework, das auf den Types von TypeScript basiert, ist für ein solches Projekt besonders vorteilhaft, da Types zwischen Client und Server geteilt werden können.

Um dies zu nutzen, sollten Types, die auf beiden Seiten verwendet werden, in eine eigene Datei oder ein eigenes Package ausgelagert werden.

```typescript
//shared.ts
export class User {
    id: number = 0;
    username: string = '';
}

//server.ts
import { rpc } from '@deepkit/rpc';
import { User } from './shared';

@rpc.controller('/user')
export class UserController {
    constructor(private database: Database) {}

    @rpc.action()
    async getUser(id: number): Promise<User> {
        return await this.database.query(User).filter({ id }).findOne();
    }
}

//client.ts
import type { UserController } from './server';

const controller = client.controller<UserController>('/user');
const user = await controller.getUser(2);
```

Abwärtskompatibilität lässt sich auf die gleiche Weise umsetzen wie bei einer normalen lokalen API: Entweder werden neue Parameter als optional markiert oder es wird eine neue Methode hinzugefügt.

## Nächste Schritte

- [Erste Schritte](./rpc/getting-started.md): Installation und ein vollständiges Beispiel
- [Transport](./rpc/websocket.md): WebSocket, TCP und Ihr eigener Transport
- [Fehler](./rpc/errors.md) und [Sicherheit](./rpc/security.md)
- [Benchmarks](/benchmarks): Performance der Deepkit-Packages
