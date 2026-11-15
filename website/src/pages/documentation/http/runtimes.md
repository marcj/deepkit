# Server & Runtimes

The HTTP kernel doesn't need its own server. The same app with the same controllers runs in the Deepkit Framework server, in your own Node.js server, inside Express or Fastify, behind a `fetch` handler of Bun, Deno or Cloudflare Workers, and in AWS Lambda.

| Entry point | Use it for |
|---|---|
| `FrameworkModule` | Full applications: server, workers, HTTPS, compression, CLI, debugger |
| `kernel.handleRequestMaybeSync(req, res)` | Your own `node:http` / `node:https` server |
| `kernel.createMiddleware()` | Mounting Deepkit routes in Express, Connect or Fastify (with `@fastify/middie`) |
| `kernel.fetch(request)` | `Bun.serve`, `Deno.serve`, Cloudflare Workers, and everything else with a web standard `Request`/`Response` handler |
| `createLambdaHandler(kernel)` | AWS Lambda behind API Gateway (HTTP and REST API), Function URLs and Application Load Balancers |

All examples use this app:

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

With the `FrameworkModule` the server is already built in and started with `server:start`. It brings HTTPS, compression, multiple worker processes, graceful shutdown, the HTTP access log and the debugger.

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

## Your own Node.js server

Pass the request classes of Deepkit to `createServer`, so request objects don't have to be converted:

```typescript
import { createServer } from 'http';
import { HttpRequest, HttpResponse } from '@deepkit/http';

createServer(
    { IncomingMessage: HttpRequest, ServerResponse: HttpResponse as any },
    (req, res) => kernel.handleRequestMaybeSync(req, res),
).listen(8080);
```

`handleRequestMaybeSync` returns a promise only when the request is handled asynchronously, for example with an `async` controller. `handleRequest` always returns a promise.

## Express, Fastify & co.

`createMiddleware` returns a Connect-style middleware. With `fallThroughOnNotFound`, requests without a matching Deepkit route are passed on to the next middleware instead of answered with 404.

```typescript
import express from 'express';

const server = express();
server.use(kernel.createMiddleware({ fallThroughOnNotFound: true }));
server.get('/legacy', (req, res) => res.send('handled by express'));
server.listen(8080);
```

## Fetch handler

`kernel.fetch(request)` takes a web standard `Request` and returns a `Response`. For synchronous routes the `Response` is returned directly, without a promise.

### Bun

```typescript
Bun.serve({
    port: 8080,
    fetch: request => kernel.fetch(request),
});
```

Use `Bun.serve` instead of Bun's `node:http` compatibility layer. It needs about half the CPU time per request, see [Performance](./performance.md).

### Deno

```typescript
Deno.serve({ port: 8080 }, request => kernel.fetch(request));
```

### Cloudflare Workers

Workers need the `nodejs_compat` flag:

```toml
# wrangler.toml
compatibility_date = "2026-01-01"
compatibility_flags = ["nodejs_compat"]
```

Workers allow code generation (`new Function`) only while the worker starts, not while it handles a request. Deepkit compiles routers, validators and serializers to JavaScript, so call `kernel.warmUp()` at module level. It compiles everything requests need upfront:

```typescript
const kernel = app.get(HttpKernel);
kernel.warmUp();

export default {
    fetch: (request: Request) => kernel.fetch(request),
};
```

File uploads (`multipart/form-data` with files) are not supported in Workers, as uploaded files are written to temporary files and Workers have no file system.

### AWS Lambda

`createLambdaHandler` turns the kernel into a Lambda handler. It reads API Gateway HTTP API and Function URL events (payload format 2.0) as well as REST API and Application Load Balancer events (payload format 1.0), and returns binary bodies base64 encoded.

```typescript
import { createLambdaHandler } from '@deepkit/http';

const kernel = app.get(HttpKernel);
// compiles during Lambda's init phase instead of the first invocation
kernel.warmUp();

export const handler = createLambdaHandler(kernel);
```

The app is created once per Lambda instance and then serves all its invocations.

### Differences to a Node.js server

- The request body is read completely before the route is called. JSON bodies are read as text.
- A response is sent once it ended. Streams you return are collected and then sent as one body.
- The client's address isn't part of a web standard `Request`. Pass it as option if you need `request.getRemoteAddress()`. `createLambdaHandler` takes it from the event.

```typescript
// Bun
Bun.serve({
    fetch: (request, server) => kernel.fetch(request, { remoteAddress: server.requestIP(request)?.address }),
});

// Deno
Deno.serve((request, info) => kernel.fetch(request, { remoteAddress: info.remoteAddr.hostname }));
```

- `HttpRequest` and `HttpResponse` keep their API (`headers`, `setHeader`, `writeHead`, `readBody()`, …), so controllers, listeners and middlewares work unchanged.

## warmUp()

Deepkit compiles each route's parameter parsing, validation and serialization the first time it's needed. `kernel.warmUp()` does that upfront for all routes:

- required in Cloudflare Workers, which allow code generation only at startup
- recommended in Lambda and other serverless platforms, where the init phase runs before the first request
- removes the latency of the first request per route in long running servers

## Testing without a server

Both ways run the full request handling without network:

```typescript
import { HttpRequest } from '@deepkit/http';

const response = await kernel.request(HttpRequest.POST('/user').json({ name: 'Peter' }));
expect(response.json).toEqual({ id: 1, name: 'Peter' });

const fetched = await kernel.fetch(new Request('http://localhost/hello'));
expect(await fetched.json()).toEqual({ hello: 'world' });
```
