# HTTP

Deepkit RPC kann neben [WebSocket](./websocket.md), [TCP](./tcp.md) und [IPC](./ipc.md) auch über einfaches HTTP laufen: Jeder Action-Aufruf ist ein HTTP-Request mit einer JSON-Response. Die Controller bleiben gleich, nur der Transport des Clients ändert sich.

Das ist nützlich, wenn eine dauerhafte Verbindung nicht gewünscht oder nicht möglich ist:

- Server-Side Rendering, bei dem jeder Request der Seite mit einem eigenen, kurzlebigen Client rendert.
- Serverless- und Edge-Plattformen, die nur HTTP-Requests weiterleiten.
- Proxies, Load Balancer und Firewalls, die keine WebSocket-Verbindungen durchlassen.
- Debugging: Jeder Aufruf erscheint im Network-Tab des Browsers und kann mit `curl` wiederholt werden.

Die Aufrufe sind weiterhin vollständig typisiert. Parameter und Ergebnisse werden mit ihren TypeScript-Typen serialisiert, sodass `Date`, `bigint`, `Map`, `Set`, `Uint8Array`, Enums, Unions und Klassen als das ankommen, was sie sind, und der Server validiert jeden Parameter.

## Server

In einer Deepkit-App setzt man `httpRpcBasePath` des `FrameworkModule`. Alle RPC-Controller sind dann zusätzlich zu WebSocket auch unterhalb dieses Pfads verfügbar:

```typescript
import { App } from '@deepkit/app';
import { FrameworkModule } from '@deepkit/framework';
import { rpc } from '@deepkit/rpc';
import { MinLength } from '@deepkit/type';

class User {
    created: Date = new Date();

    constructor(public id: number, public name: string & MinLength<3>) {}
}

@rpc.controller('user')
class UserController {
    @rpc.action()
    add(a: number, b: number): number {
        return a + b;
    }

    @rpc.action()
    create(user: User): User {
        return user;
    }
}

new App({
    controllers: [UserController],
    imports: [new FrameworkModule({ httpRpcBasePath: 'api/v1' })],
}).run();
```

Die Actions sind nun unter `/api/v1/user/add` und `/api/v1/user/create` erreichbar.

## Client

Verwende `RpcHttpClientAdapter` als Transport eines `RpcClient`. Der Rest der API ist derselbe wie bei WebSocket:

```typescript
import { RpcClient, RpcHttpClientAdapter } from '@deepkit/rpc';

const client = new RpcClient(new RpcHttpClientAdapter('https://example.com/api/v1'));
const user = client.controller<UserController>('user');

await user.add(2, 3); // 5
const created = await user.create(new User(1, 'Peter'));
created.created instanceof Date; // true
```

Der Client lädt die Typen einer Action einmalig beim ersten Aufruf und verwendet sie, um die Parameter zu serialisieren und das Ergebnis zu deserialisieren. Wie bei WebSocket ist eine zurückgegebene Klasse eine Instanz einer Klasse, die aus den vom Server beschriebenen Typen erzeugt wird: Sie hat die Properties, aber nicht die Methoden deiner eigenen Klasse.

In einem Frontend mit Dependency Injection stellt `createRpcHttpClientProvider` den Client bereit. Ohne Argument verwendet er den Origin der Seite:

```typescript
import { createRpcHttpClientProvider } from '@deepkit/rpc';

providers: [createRpcHttpClientProvider('https://example.com/api/v1')];
```

### Header und die HTTP-Implementierung

Das zweite Argument von `RpcHttpClientAdapter` sind Header, die mit jedem Request gesendet werden. Das dritte Argument ersetzt `fetch`, zum Beispiel durch Angulars `HttpClient`, damit Server-Side Rendering die Responses an den Browser übertragen kann, anstatt sie erneut anzufordern:

```typescript
import { HttpClient } from '@angular/common/http';
import { firstValueFrom } from 'rxjs';
import { RpcClient, RpcHttpClientAdapter, RpcHttpInterface, RpcHttpResponseInterface } from '@deepkit/rpc';

class AngularHttp implements RpcHttpInterface {
    constructor(private http: HttpClient) {}

    async fetch(url: string, options: { headers: { [name: string]: string }; method: string; body?: string }): Promise<RpcHttpResponseInterface> {
        const res = await firstValueFrom(
            this.http.request(options.method, url, { body: options.body, headers: options.headers, observe: 'response', responseType: 'json' }),
        );
        const headers: { [name: string]: string } = {};
        for (const key of res.headers.keys()) headers[key] = String(res.headers.get(key));
        return { status: res.status, headers, body: res.body };
    }
}

const client = new RpcClient(new RpcHttpClientAdapter('api/v1', {}, new AngularHttp(httpClient)));
```

Wenn der Transfer-Cache von Angular verwendet wird, füge den Header hinzu, der Fehler kennzeichnet, `RpcHttpHeaderNames`, damit eine Fehler-Response im Browser weiterhin ein Fehler ist:

```typescript
import { RpcHttpHeaderNames } from '@deepkit/rpc';

provideClientHydration(withHttpTransferCacheOptions({ includeHeaders: RpcHttpHeaderNames, includePostRequests: true }));
```

## Authentifizierung

Ein auf dem Client gesetztes Token wird mit jedem Request als `Authorization`-Header gesendet:

```typescript
client.token.set('my-session-token');
```

Der Server authentifiziert jeden Request mit `RpcKernelSecurity.authenticate` (ein Fehlschlag wird mit `Authentication failed` beantwortet, der Grund wird auf dem Server geloggt), und `hasControllerAccess` entscheidet wie bei jeder anderen Verbindung über den Zugriff. Ein führendes `Bearer ` wird entfernt, bevor das Token weitergereicht wird. Die Session ist in der Action über `SessionState` verfügbar, und alle Provider des `rpc`-Scopes können injiziert werden:

```typescript
import { RpcKernelSecurity, Session, SessionState, rpc } from '@deepkit/rpc';

class AppSecurity extends RpcKernelSecurity {
    async authenticate(token: any): Promise<Session> {
        const user = await findUserByToken(token);
        if (!user) throw new Error('Invalid token');
        return new Session(user.name, token);
    }
}

@rpc.controller('user')
class UserController {
    constructor(private session: SessionState) {}

    @rpc.action()
    whoami(): string {
        return this.session.getSession().username;
    }
}

new App({
    controllers: [UserController],
    providers: [{ provide: RpcKernelSecurity, useClass: AppSecurity, scope: 'rpc' }],
    imports: [new FrameworkModule({ httpRpcBasePath: 'api/v1' })],
});
```

Da es sich um einen Header handelt, muss das Token ein String sein. Ein Client ohne Token ist anonym.

## Die Requests

Das Protokoll ist einfach genug, um es ohne Deepkit-Client aufzurufen:

| Request                                       | Was er bewirkt                                                                              |
| --------------------------------------------- | ------------------------------------------------------------------------------------------- |
| `GET /api/v1/user/add?arg=2&arg=3`            | Ruft `add(2, 3)` auf. Wird vom Client verwendet, wenn alle Parameter primitive Werte sind.  |
| `POST /api/v1/user/create` mit `[{...}]`      | Ruft `create(...)` mit dem JSON-Array als Parameter auf.                                    |
| `GET /api/v1/user/create.type`                | Die Typen der Parameter und des Ergebnisses, die der Client einmalig lädt.                  |

```bash
curl 'https://example.com/api/v1/user/add?arg=2&arg=3'
# 5

curl -X POST -H 'Content-Type: application/json' \
  -d '[{"id": 1, "name": "Peter"}]' https://example.com/api/v1/user/create
# {"created":"2026-01-02T03:04:05.000Z","id":1,"name":"Peter"}
```

Query-Parameter werden in die Typen der Parameter konvertiert, sodass `?arg=2` für einen `number`-Parameter die Zahl `2` ist. Die Response ist das als JSON serialisierte Ergebnis, ein `Date` ist beispielsweise ein ISO-String und ein `bigint` ein String.

Ein Fehler, einschließlich einer fehlgeschlagenen Validierung, wird mit dem Header `X-Rpc-Error` und dem Fehler als Body beantwortet. Der Client wirft ihn erneut, mit seiner Klasse, sofern diese registriert ist (siehe [Fehler](./errors)):

```json
{
    "classType": "@error:validation",
    "properties": {
        "name": "ValidationError",
        "errors": [{ "path": "user.name", "code": "minLength", "message": "Min length is 3", "value": "ab" }]
    }
}
```

## Einschränkungen

Jeder Aufruf ist ein eigener Request, und eine Response ist ein einzelner Wert. Alles, was eine Verbindung benötigt, ist nur über WebSocket oder TCP verfügbar:

- Actions, die ein `Observable`, `Subject`, `BehaviorSubject`, `ProgressTracker` oder `Collection` zurückgeben. Über HTTP schlagen sie mit einem Fehler fehl, der genau das besagt.
- Fortschritt von Uploads und Downloads sowie Back-Controller (der Server ruft den Client auf).
- Peer-to-Peer-Nachrichten und Entity-Patches.

Jeder Aufruf kostet außerdem einen vollständigen HTTP-Request, was langsamer ist als ein Aufruf über eine bestehende WebSocket- oder TCP-Verbindung. Für viele aufeinanderfolgende Aufrufe oder für Live-Daten verwende WebSocket.

Ein `bigint` hat über HTTP keine Größenbeschränkung. Über WebSocket und TCP ist ein einfacher `bigint` ein 64-Bit-Integer; verwende `BinaryBigInt` für größere Werte.
