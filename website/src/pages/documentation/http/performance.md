# Performance

Deepkit compiles routing, parameter parsing, validation and serialization of each route to JavaScript functions. A request without extra listeners or middlewares then runs these functions directly, one after the other.

## What a request costs

A request goes through these steps:

1. route matching (one compiled function for all routes)
2. parameter parsing and validation of path, query, headers and body (compiled per route)
3. creating the controller in the request's dependency injection scope and calling the action
4. serializing the result according to the return type (compiled per route) and writing the response

As long as no listener is registered for the states up to the controller (see [Events](./events.md)), these steps run directly. A listener (e.g. an auth listener on `httpWorkflow.onAuth`) or a middleware makes the request go through the event workflow instead, which creates an event object per state. Errors, not found routes and listeners on `onResponse` (like the HTTP access log) are handed over to the workflow only when they happen, so a successful request stays on the direct path.

## Benchmarks

Measured CPU time of the server process per request (lower is better), with 200 concurrent connections from [autocannon](https://github.com/mcollina/autocannon) on the same machine. The CPU time is more meaningful than requests per second here, as the load generator on the same machine is the limit at around 50,000-60,000 requests per second.

`GET /hello` returns `{hello: 'world'}`. `POST /ingest` validates a 1.8KB JSON body with nested objects, arrays, dates and number ranges (zod for Hono, a TypeScript type for Deepkit) and answers with a small JSON.

### Node.js 26

| | GET /hello | POST /ingest |
|---|---|---|
| node:http (no routing, no validation) | 6.3µs | – |
| Hono + @hono/node-server + zod | 7.6µs | 23.6µs |
| **Deepkit** | **7.4µs** | **20.7µs** |

With a 357KB JSON body (200 participants with 10 GPS points each), Deepkit needs 1.14ms and Hono + zod 1.60ms per request. A large part of that is `JSON.parse`, which costs the same for both.

### Bun 1.4

| | GET /hello | POST /ingest |
|---|---|---|
| Bun.serve with its own router (no validation) | 2.2µs | 11.2µs |
| Hono + Bun.serve + zod | 3.0µs | 12.6µs |
| **Deepkit** with `Bun.serve` and `kernel.fetch` | **3.5µs** | **13.1µs** |
| Deepkit with Bun's `node:http` | 6.3µs | – |

Bun is faster with `Bun.serve` than with its `node:http` compatibility layer. Use `kernel.fetch`, see [Server & Runtimes](./runtimes.md#bun).

### Deno 2.9

User and system CPU time per request for `GET /hello`: `Deno.serve` without routing 12.0µs, Hono 13.2µs, Deepkit with `kernel.fetch` 14.4µs.

### Validation and deserialization alone

The same data without HTTP: 2,000 GPS points with a date each, already parsed from JSON.

| | Node.js | Bun |
|---|---|---|
| zod `parse` (with `z.coerce.date()`) | 794µs | 768µs |
| Deepkit `cast` (deserialize and validate) | 528µs | 333µs |
| zod `safeParse`, numeric timestamps instead of dates | 518µs | 499µs |
| Deepkit validator, numeric timestamps | 69µs | 46µs |

Without date conversion, the validation itself is 7x (Node.js) to 11x (Bun) faster. With dates, creating 2,000 `Date` objects takes a good part of the time (301µs in Node.js), the same for every library.

## Tips

- **Return plain objects from synchronous actions where possible.** Synchronous actions are handled without a promise per request.
- **Annotate return types** (`hello(): { hello: string }`). The result is then serialized with a compiled function, and properties that aren't part of the type are not sent.
- **Prefer middlewares and listeners only for routes that need them.** Use `httpMiddleware.for(...).forControllers(...)` or check the route in the listener, as any listener on the states up to the controller moves all requests to the event workflow.
- **The HTTP access log** (`FrameworkModule` option `httpLog`) formats and writes a line per request. Turn it off when a load balancer or proxy already logs requests.
- **Call `kernel.warmUp()`** at startup, so first requests don't compile routes. Required in Cloudflare Workers.
- **On Bun and Deno use `kernel.fetch`** with `Bun.serve`/`Deno.serve` instead of the `node:http` compatibility layers.

## Serverless and cold starts

Creating the app (modules, dependency injection container, router) takes a few milliseconds; with `warmUp()` also the compilation of all routes. In a measurement on Node.js, importing Deepkit and validating the first payload took 30ms, the first 100 validations including that 159ms, and the same with zod 207ms.

Whether the startup matters depends on how many requests an instance serves: Lambda, Cloud Run and similar platforms reuse an instance for many requests, so the startup is paid once per instance, not per request. On platforms that start an instance per request, the startup of any framework counts for every request.
