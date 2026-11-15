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

Measured on our benchmark machine (Intel Core i9-8950HK, 12 threads, Linux, Node.js 26.13, Bun 1.4.4, Deno 2.9.6): the CPU time of the server process per request (lower is better), with 200 concurrent connections from [autocannon](https://github.com/mcollina/autocannon) on the same machine, median of three rounds. The CPU time is more meaningful than requests per second here, as the load generator on the same machine is the limit long before the server.

`GET /hello` returns `{hello: 'world'}`. The two POST routes validate a JSON body with nested objects, arrays, dates and number ranges (zod for Hono, a TypeScript type for Deepkit) and answer with a small JSON: 1.8KB (one participant with 10 GPS points) and 357KB (200 participants with 10 points each). Node.js and Bun show the user CPU time, the work of JavaScript, without the system time for the network, which is the same for all.

### Node.js

| | GET /hello | POST 1.8KB | POST 357KB |
|---|---|---|---|
| node:http (no routing, no validation) | 17.4µs | – | – |
| Hono + @hono/node-server + zod | 22.5µs | 80.8µs | 5.63ms |
| **Deepkit** | **21.0µs** | **66.3µs** | **4.53ms** |

### Bun

| | GET /hello | POST 1.8KB | POST 357KB |
|---|---|---|---|
| Bun.serve with its own router (no validation) | 5.9µs | 37.3µs | – |
| Hono + Bun.serve + zod | 8.5µs | 42.1µs | 4.15ms |
| **Deepkit** with `Bun.serve` and `kernel.fetch` | **9.7µs** | **41.6µs** | **2.38ms** |
| Deepkit with Bun's `node:http` | 15.4µs | – | – |

Bun is a lot faster with `Bun.serve` than with its `node:http` compatibility layer. Use `kernel.fetch`, see [Server & Runtimes](./runtimes.md#bun).

### Deno

User and system CPU time per request for `GET /hello`: `Deno.serve` without routing 11.7µs, Hono 14.7µs, Deepkit with `kernel.fetch` 18.9µs.

### Validation and deserialization alone

The same data without HTTP: 2,000 GPS points with a date each, already parsed from JSON.

| | Node.js | Bun |
|---|---|---|
| zod `parse` (with `z.coerce.date()`) | 2.37ms | 2.30ms |
| Deepkit `cast` (deserialize and validate) | 1.49ms | 1.14ms |
| zod `safeParse`, numeric timestamps instead of dates | 1.38ms | 1.48ms |
| Deepkit validator, numeric timestamps | 0.21ms | 0.14ms |
| `JSON.parse` of the same 357KB | 2.24ms | 0.99ms |

Without date conversion, the validation itself is 7x (Node.js) to 10x (Bun) faster. With dates, creating 2,000 `Date` objects takes 0.77ms of that time, the same for every library. And parsing the JSON takes about as long as validating it.

## Tips

- **Return plain objects from synchronous actions where possible.** Synchronous actions are handled without a promise per request.
- **Annotate return types** (`hello(): { hello: string }`). The result is then serialized with a compiled function, and properties that aren't part of the type are not sent.
- **Prefer middlewares and listeners only for routes that need them.** Use `httpMiddleware.for(...).forControllers(...)` or check the route in the listener, as any listener on the states up to the controller moves all requests to the event workflow.
- **The HTTP access log** (`FrameworkModule` option `httpLog`) formats and writes a line per request. Turn it off when a load balancer or proxy already logs requests.
- **Call `kernel.warmUp()`** at startup, so first requests don't compile routes. Required in Cloudflare Workers.
- **On Bun and Deno use `kernel.fetch`** with `Bun.serve`/`Deno.serve` instead of the `node:http` compatibility layers.

## Serverless and cold starts

Creating the app (modules, dependency injection container, router) takes a few milliseconds; with `warmUp()` also the compilation of all routes. On the benchmark machine with Node.js, importing Deepkit and validating the first payload of 2,000 GPS points took 87ms (zod: 93ms), the first 100 payloads including that 459ms (zod: 607ms). With Bun: 61ms and 296ms (zod: 47ms and 436ms). The compilation on first use is paid back after a few calls.

Whether the startup matters depends on how many requests an instance serves: Lambda, Cloud Run and similar platforms reuse an instance for many requests, so the startup is paid once per instance, not per request. On platforms that start an instance per request, the startup of any framework counts for every request.
