# Server & Runtimes

Der HTTP-Kernel braucht keinen eigenen Server. Dieselbe App mit denselben Controllern läuft im Deepkit Framework Server, in deinem eigenen Node.js-Server, innerhalb von Express oder Fastify, hinter einem `fetch`-Handler von Bun, Deno oder Cloudflare Workers und in AWS Lambda.

| Einstiegspunkt | Verwende ihn für |
|---|---|
| `FrameworkModule` | Vollständige Anwendungen: Server, Worker, HTTPS, Komprimierung, CLI, Debugger |
| `kernel.handleRequestMaybeSync(req, res)` | Deinen eigenen `node:http`- / `node:https`-Server |
| `kernel.createMiddleware()` | Das Einbinden von Deepkit-Routen in Express, Connect oder Fastify (mit `@fastify/middie`) |
| `kernel.fetch(request)` | `Bun.serve`, `Deno.serve`, Cloudflare Workers und alles andere mit einem Web-Standard-`Request`/`Response`-Handler |
| `createLambdaHandler(kernel)` | AWS Lambda hinter API Gateway (HTTP und REST API), Function URLs und Application Load Balancers |

Alle Beispiele verwenden diese App:

```typescript
import { App } from '@deepkit/app';
import { http, HttpBody, HttpKernel, HttpModule } from '@deepkit/http';
import { MinLength } from '@deepkit/type';

class UserController {
    @http.GET('/hello')
    hello() {
        return { hello: 'world' };
    }

    @http.POST('/user')
    create(body: HttpBody<{ name: string & MinLength<3> }>) {
        return { id: 1, name: body.name };
    }
}

const app = new App({
    controllers: [UserController],
    imports: [new HttpModule()],
});
const kernel = app.get(HttpKernel);
```

## Deepkit Framework Server

Mit dem `FrameworkModule` ist der Server bereits eingebaut und wird mit `server:start` gestartet. Er bringt HTTPS, Komprimierung, mehrere Worker-Prozesse, Graceful Shutdown, das HTTP-Access-Log und den Debugger mit.

```typescript
import { FrameworkModule } from '@deepkit/framework';

new App({
    controllers: [UserController],
    imports: [new FrameworkModule({
        port: 8080,
        compression: 6,
        workers: 4,
    })],
}).run();
```

```sh
ts-node app.ts server:start
```

## Eigener Node.js-Server

Übergib die Request-Klassen von Deepkit an `createServer`, damit Request-Objekte nicht konvertiert werden müssen:

```typescript
import { createServer } from 'http';
import { HttpRequest, HttpResponse } from '@deepkit/http';

createServer(
    { IncomingMessage: HttpRequest, ServerResponse: HttpResponse as any },
    (req, res) => kernel.handleRequestMaybeSync(req, res),
).listen(8080);
```

`handleRequestMaybeSync` gibt nur dann ein Promise zurück, wenn der Request asynchron verarbeitet wird, zum Beispiel mit einem `async`-Controller. `handleRequest` gibt immer ein Promise zurück.

## Express, Fastify & Co.

`createMiddleware` gibt eine Middleware im Connect-Stil zurück. Mit `fallThroughOnNotFound` werden Requests ohne passende Deepkit-Route an die nächste Middleware weitergereicht, anstatt mit 404 beantwortet zu werden.

```typescript
import express from 'express';

const server = express();
server.use(kernel.createMiddleware({ fallThroughOnNotFound: true }));
server.get('/legacy', (req, res) => res.send('handled by express'));
server.listen(8080);
```

## Fetch-Handler

`kernel.fetch(request)` nimmt einen Web-Standard-`Request` entgegen und gibt eine `Response` zurück. Bei synchronen Routen wird die `Response` direkt zurückgegeben, ohne Promise.

### Bun

```typescript
Bun.serve({
    port: 8080,
    fetch: request => kernel.fetch(request),
});
```

Verwende `Bun.serve` anstelle von Buns `node:http`-Kompatibilitätsschicht. Es benötigt etwa die Hälfte der CPU-Zeit pro Request, siehe [Performance](./performance.md).

### Deno

```typescript
Deno.serve({ port: 8080 }, request => kernel.fetch(request));
```

### Cloudflare Workers

Workers benötigen das Flag `nodejs_compat`:

```toml
# wrangler.toml
compatibility_date = "2026-01-01"
compatibility_flags = ["nodejs_compat"]
```

Workers erlauben Codegenerierung (`new Function`) nur, während der Worker startet, nicht während er einen Request verarbeitet. Deepkit kompiliert Router, Validatoren und Serializer zu JavaScript, rufe daher `kernel.warmUp()` auf Modulebene auf. Es kompiliert alles, was Requests benötigen, im Voraus:

```typescript
const kernel = app.get(HttpKernel);
kernel.warmUp();

export default {
    fetch: (request: Request) => kernel.fetch(request),
};
```

Datei-Uploads (`multipart/form-data` mit Dateien) werden in Workers nicht unterstützt, da hochgeladene Dateien in temporäre Dateien geschrieben werden und Workers kein Dateisystem haben.

### AWS Lambda

`createLambdaHandler` macht aus dem Kernel einen Lambda-Handler. Er liest Events von API Gateway HTTP API und Function URL (Payload-Format 2.0) sowie von REST API und Application Load Balancer (Payload-Format 1.0) und gibt binäre Bodies Base64-kodiert zurück.

```typescript
import { createLambdaHandler } from '@deepkit/http';

const kernel = app.get(HttpKernel);
// kompiliert während der Init-Phase von Lambda statt beim ersten Aufruf
kernel.warmUp();

export const handler = createLambdaHandler(kernel);
```

Die App wird einmal pro Lambda-Instanz erstellt und bedient dann alle ihre Aufrufe.

### Unterschiede zu einem Node.js-Server

- Der Request-Body wird vollständig gelesen, bevor die Route aufgerufen wird. JSON-Bodies werden als Text gelesen.
- Eine Response wird gesendet, sobald sie beendet ist. Streams, die du zurückgibst, werden gesammelt und dann als ein Body gesendet.
- Die Adresse des Clients ist nicht Teil eines Web-Standard-`Request`. Übergib sie als Option, wenn du `request.getRemoteAddress()` benötigst. `createLambdaHandler` entnimmt sie dem Event.

```typescript
// Bun
Bun.serve({
    fetch: (request, server) => kernel.fetch(request, { remoteAddress: server.requestIP(request)?.address }),
});

// Deno
Deno.serve((request, info) => kernel.fetch(request, { remoteAddress: info.remoteAddr.hostname }));
```

- `HttpRequest` und `HttpResponse` behalten ihre API (`headers`, `setHeader`, `writeHead`, `readBody()`, …), sodass Controller, Listener und Middlewares unverändert funktionieren.

## warmUp()

Deepkit kompiliert das Parameter-Parsing, die Validierung und die Serialisierung jeder Route beim ersten Bedarf. `kernel.warmUp()` erledigt das im Voraus für alle Routen:

- erforderlich in Cloudflare Workers, die Codegenerierung nur beim Start erlauben
- empfohlen in Lambda und anderen Serverless-Plattformen, wo die Init-Phase vor dem ersten Request läuft
- beseitigt die Latenz des ersten Requests pro Route in lang laufenden Servern

## Testen ohne Server

Beide Wege führen die vollständige Request-Verarbeitung ohne Netzwerk aus:

```typescript
import { HttpRequest } from '@deepkit/http';

const response = await kernel.request(HttpRequest.POST('/user').json({ name: 'Peter' }));
expect(response.json).toEqual({ id: 1, name: 'Peter' });

const fetched = await kernel.fetch(new Request('http://localhost/hello'));
expect(await fetched.json()).toEqual({ hello: 'world' });
```
