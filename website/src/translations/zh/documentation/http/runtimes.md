# 服务器与运行时

HTTP 内核不需要自己的服务器。同一个应用和相同的 controller 可以运行在 Deepkit Framework 服务器中、你自己的 Node.js 服务器中、Express 或 Fastify 内部、Bun、Deno 或 Cloudflare Workers 的 `fetch` 处理器之后，以及 AWS Lambda 中。

| 入口点 | 适用场景 |
|---|---|
| `FrameworkModule` | 完整应用：服务器、worker、HTTPS、压缩、CLI、调试器 |
| `kernel.handleRequestMaybeSync(req, res)` | 你自己的 `node:http` / `node:https` 服务器 |
| `kernel.createMiddleware()` | 在 Express、Connect 或 Fastify（配合 `@fastify/middie`）中挂载 Deepkit 路由 |
| `kernel.fetch(request)` | `Bun.serve`、`Deno.serve`、Cloudflare Workers，以及所有其他使用 Web 标准 `Request`/`Response` 处理器的环境 |
| `createLambdaHandler(kernel)` | 位于 API Gateway（HTTP 和 REST API）、Function URL 和 Application Load Balancer 之后的 AWS Lambda |

所有示例都使用以下应用：

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

## Deepkit Framework 服务器

使用 `FrameworkModule` 时，服务器已经内置，并通过 `server:start` 启动。它提供 HTTPS、压缩、多个 worker 进程、优雅关闭、HTTP 访问日志以及调试器。

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

## 你自己的 Node.js 服务器

将 Deepkit 的请求类传给 `createServer`，这样就无需转换请求对象：

```typescript
import { createServer } from 'http';
import { HttpRequest, HttpResponse } from '@deepkit/http';

createServer(
    { IncomingMessage: HttpRequest, ServerResponse: HttpResponse as any },
    (req, res) => kernel.handleRequestMaybeSync(req, res),
).listen(8080);
```

只有当请求被异步处理时（例如使用 `async` controller），`handleRequestMaybeSync` 才会返回一个 promise。`handleRequest` 则始终返回 promise。

## Express、Fastify 等

`createMiddleware` 返回一个 Connect 风格的 middleware。启用 `fallThroughOnNotFound` 后，没有匹配 Deepkit 路由的请求会被传递给下一个 middleware，而不是返回 404。

```typescript
import express from 'express';

const server = express();
server.use(kernel.createMiddleware({ fallThroughOnNotFound: true }));
server.get('/legacy', (req, res) => res.send('handled by express'));
server.listen(8080);
```

## Fetch 处理器

`kernel.fetch(request)` 接收一个 Web 标准的 `Request` 并返回一个 `Response`。对于同步路由，`Response` 会被直接返回，而不是包装在 promise 中。

### Bun

```typescript
Bun.serve({
    port: 8080,
    fetch: request => kernel.fetch(request),
});
```

请使用 `Bun.serve`，而不是 Bun 的 `node:http` 兼容层。它每个请求所需的 CPU 时间大约只有一半，参见 [性能](./performance.md)。

### Deno

```typescript
Deno.serve({ port: 8080 }, request => kernel.fetch(request));
```

### Cloudflare Workers

Workers 需要启用 `nodejs_compat` 标志：

```toml
# wrangler.toml
compatibility_date = "2026-01-01"
compatibility_flags = ["nodejs_compat"]
```

Workers 只允许在 worker 启动时进行代码生成（`new Function`），而不允许在处理请求时进行。Deepkit 会将路由器、验证器和序列化器编译为 JavaScript，因此请在模块级别调用 `kernel.warmUp()`。它会预先编译请求所需的一切：

```typescript
const kernel = app.get(HttpKernel);
kernel.warmUp();

export default {
    fetch: (request: Request) => kernel.fetch(request),
};
```

Workers 中不支持文件上传（包含文件的 `multipart/form-data`），因为上传的文件会被写入临时文件，而 Workers 没有文件系统。

### AWS Lambda

`createLambdaHandler` 将内核转换为 Lambda 处理器。它可以读取 API Gateway HTTP API 和 Function URL 事件（payload 格式 2.0），以及 REST API 和 Application Load Balancer 事件（payload 格式 1.0），并以 base64 编码返回二进制 body。

```typescript
import { createLambdaHandler } from '@deepkit/http';

const kernel = app.get(HttpKernel);
// 在 Lambda 的初始化阶段编译，而不是在第一次调用时
kernel.warmUp();

export const handler = createLambdaHandler(kernel);
```

应用在每个 Lambda 实例中只创建一次，随后处理该实例的所有调用。

### 与 Node.js 服务器的区别

- 请求 body 会在调用路由之前被完整读取。JSON body 以文本形式读取。
- 响应在结束后才会发送。你返回的 stream 会被收集起来，然后作为一个完整的 body 发送。
- 客户端地址不属于 Web 标准 `Request` 的一部分。如果你需要 `request.getRemoteAddress()`，请将其作为选项传入。`createLambdaHandler` 会从事件中获取它。

```typescript
// Bun
Bun.serve({
    fetch: (request, server) => kernel.fetch(request, { remoteAddress: server.requestIP(request)?.address }),
});

// Deno
Deno.serve((request, info) => kernel.fetch(request, { remoteAddress: info.remoteAddr.hostname }));
```

- `HttpRequest` 和 `HttpResponse` 保持其 API 不变（`headers`、`setHeader`、`writeHead`、`readBody()` 等），因此 controller、listener 和 middleware 无需修改即可正常工作。

## warmUp()

Deepkit 会在首次需要时编译每个路由的参数解析、验证和序列化。`kernel.warmUp()` 会为所有路由预先完成这些工作：

- 在 Cloudflare Workers 中是必需的，因为它只允许在启动时进行代码生成
- 在 Lambda 和其他 serverless 平台中推荐使用，因为初始化阶段会在第一个请求之前运行
- 在长时间运行的服务器中，可消除每个路由第一个请求的延迟

## 无需服务器的测试

以下两种方式都会在不使用网络的情况下运行完整的请求处理流程：

```typescript
import { HttpRequest } from '@deepkit/http';

const response = await kernel.request(HttpRequest.POST('/user').json({ name: 'Peter' }));
expect(response.json).toEqual({ id: 1, name: 'Peter' });

const fetched = await kernel.fetch(new Request('http://localhost/hello'));
expect(await fetched.json()).toEqual({ hello: 'world' });
```
