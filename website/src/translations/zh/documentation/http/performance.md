# 性能

Deepkit 会将每个路由的路由匹配、参数解析、验证和序列化编译为 JavaScript 函数。没有额外 listener 或 middleware 的请求会依次直接执行这些函数。

## 一个请求的开销

一个请求会经过以下步骤：

1. 路由匹配（所有路由共用一个编译后的函数）
2. 对 path、query、headers 和 body 进行参数解析和验证（按路由编译）
3. 在请求的依赖注入作用域中创建 controller 并调用 action
4. 根据返回类型序列化结果（按路由编译）并写入响应

只要在 controller 之前的各个状态上没有注册 listener（参见 [事件](./events.md)），这些步骤就会直接执行。listener（例如 `httpWorkflow.onAuth` 上的认证 listener）或 middleware 会使请求改为经过事件 workflow，后者会为每个状态创建一个事件对象。错误、未找到的路由以及 `onResponse` 上的 listener（例如 HTTP 访问日志）只有在实际发生时才会交给 workflow 处理，因此成功的请求会保持在直接路径上。

## 基准测试

在我们的基准测试机器（Intel Core i9-8950HK，12 线程，Linux，Node.js 26.13，Bun 1.4.4，Deno 2.9.6）上测量：每个请求的服务器进程 CPU 时间（越低越好），由同一台机器上的 [autocannon](https://github.com/mcollina/autocannon) 发起 200 个并发连接，取三轮的中位数。这里 CPU 时间比每秒请求数更有意义，因为同一台机器上的负载生成器远在服务器之前就会成为瓶颈。

`GET /hello` 返回 `{hello: 'world'}`。两个 POST 路由会验证一个包含嵌套对象、数组、日期和数值范围的 JSON body（Hono 使用 zod，Deepkit 使用 TypeScript 类型），并返回一个小的 JSON：1.8KB（一名参与者，10 个 GPS 点）和 357KB（200 名参与者，每人 10 个点）。Node.js 和 Bun 显示的是用户 CPU 时间，即 JavaScript 的工作量，不包括网络的系统时间，因为后者对所有方案都相同。

### Node.js

| | GET /hello | POST 1.8KB | POST 357KB |
|---|---|---|---|
| node:http（无路由，无验证） | 17.4µs | – | – |
| Hono + @hono/node-server + zod | 22.5µs | 80.8µs | 5.63ms |
| **Deepkit** | **21.0µs** | **66.3µs** | **4.53ms** |

### Bun

| | GET /hello | POST 1.8KB | POST 357KB |
|---|---|---|---|
| Bun.serve 及其自带路由（无验证） | 5.9µs | 37.3µs | – |
| Hono + Bun.serve + zod | 8.5µs | 42.1µs | 4.15ms |
| **Deepkit** 搭配 `Bun.serve` 和 `kernel.fetch` | **9.7µs** | **41.6µs** | **2.38ms** |
| Deepkit 搭配 Bun 的 `node:http` | 15.4µs | – | – |

Bun 使用 `Bun.serve` 时比使用其 `node:http` 兼容层快得多。请使用 `kernel.fetch`，参见 [服务器与运行时](./runtimes.md#bun)。

### Deno

`GET /hello` 每个请求的用户和系统 CPU 时间：无路由的 `Deno.serve` 为 11.7µs，Hono 为 14.7µs，使用 `kernel.fetch` 的 Deepkit 为 18.9µs。

### 仅验证和反序列化

不经过 HTTP 的相同数据：2,000 个 GPS 点，每个点带一个日期，已从 JSON 解析完成。

| | Node.js | Bun |
|---|---|---|
| zod `parse`（使用 `z.coerce.date()`） | 2.37ms | 2.30ms |
| Deepkit `cast`（反序列化并验证） | 1.49ms | 1.14ms |
| zod `safeParse`，使用数值时间戳代替日期 | 1.38ms | 1.48ms |
| Deepkit validator，数值时间戳 | 0.21ms | 0.14ms |
| 对相同 357KB 数据执行 `JSON.parse` | 2.24ms | 0.99ms |

在不进行日期转换的情况下，验证本身快 7 倍（Node.js）到 10 倍（Bun）。包含日期时，创建 2,000 个 `Date` 对象占用其中 0.77ms，这对所有库都一样。而解析 JSON 所需的时间与验证它大致相当。

## 建议

- **尽可能从同步 action 返回普通对象。** 同步 action 的处理无需为每个请求创建 promise。
- **标注返回类型**（`hello(): { hello: string }`）。这样结果会通过编译后的函数进行序列化，并且不属于该类型的属性不会被发送。
- **仅在需要的路由上使用 middleware 和 listener。** 使用 `httpMiddleware.for(...).forControllers(...)` 或在 listener 中检查路由，因为 controller 之前各状态上的任何 listener 都会使所有请求转入事件 workflow。
- **HTTP 访问日志**（`FrameworkModule` 选项 `httpLog`）会为每个请求格式化并写入一行。当负载均衡器或代理已经记录请求时，请将其关闭。
- **在启动时调用 `kernel.warmUp()`**，这样首批请求就无需编译路由。在 Cloudflare Workers 中这是必需的。
- **在 Bun 和 Deno 上，将 `kernel.fetch`** 与 `Bun.serve`/`Deno.serve` 搭配使用，而不是使用 `node:http` 兼容层。

## Serverless 与冷启动

创建应用（模块、依赖注入容器、路由器）需要几毫秒；使用 `warmUp()` 时还包括所有路由的编译。在基准测试机器上使用 Node.js，导入 Deepkit 并验证第一个包含 2,000 个 GPS 点的 payload 耗时 87ms（zod：93ms），包括这一次在内的前 100 个 payload 耗时 459ms（zod：607ms）。使用 Bun：61ms 和 296ms（zod：47ms 和 436ms）。首次使用时的编译开销在几次调用后即可收回。

启动开销是否重要取决于一个实例处理多少请求：Lambda、Cloud Run 及类似平台会将一个实例复用于许多请求，因此启动开销是每个实例支付一次，而不是每个请求支付一次。在为每个请求启动一个实例的平台上，任何框架的启动开销都会计入每个请求。
