# 安全

Deepkit HTTP 基于你的 TypeScript 类型验证所有输入，并且不会向客户端泄露内部错误细节。身份验证、授权、CORS、安全标头和速率限制并未硬编码在框架中。相反，你可以通过 [HTTP 事件](./events.md)或[中间件](./middleware.md)来实现它们，使其与你的应用程序完全契合。

本页介绍内置的保护机制，以及如何使用现有 API 实现其余部分。

## 输入验证

所有路由参数（path、query、header、body）在调用路由之前都会被转换为声明的类型并进行验证。包含无效数据的请求永远不会到达你的代码，而是以状态码 400 响应。这是你抵御注入攻击和格式错误数据的第一道防线。

```typescript
import { http, HttpBody, HttpQuery } from '@deepkit/http';
import { Email, MaxLength, Maximum, MinLength, Pattern, Positive } from '@deepkit/type';

const slug = /^[a-z0-9-]+$/;

class RegisterBody {
    email!: Email;
    username!: string & MinLength<3> & MaxLength<32> & Pattern<typeof slug>;
}

class UserController {
    @http.POST('/register')
    register(body: HttpBody<RegisterBody>) {
        // body 保证是一个有效的 RegisterBody
    }

    @http.GET('/users')
    list(limit: HttpQuery<number & Positive & Maximum<100>> = 20) {
        // limit 是 1 到 100 之间的数字
    }
}
```

```sh
$ curl -X POST http://localhost:8080/register -H 'Content-Type: application/json' -d '{"email": "nope", "username": "a"}'
{"message":"Validation error:...","errors":[{"path":"email","code":"pattern",...},{"path":"username","code":"minLength",...}]}
```

不属于该类型的属性会从 body 中移除。如果客户端发送 `{"email": "...", "username": "peter", "isAdmin": true}`，控制器接收到的对象中将不包含 `isAdmin`。只要 body 类型仅包含允许客户端设置的属性，这就能防止批量赋值（mass assignment）漏洞。请使用专用的 body 类型（或 `Pick<User, 'email' | 'username'>`），而不是你的完整实体。

使用 `MaxLength` 限制字符串的长度和数组的大小，使用 `Maximum`/`Minimum` 限制数字的范围，这样客户端就无法向你的数据库或业务逻辑发送任意大的值。

有关所有可用类型，请参阅[输入与输出](./input-output.md)和[验证](../runtime-types/validation.md)。

## 身份验证

身份验证最好在 `httpWorkflow.onAuth` 事件中完成。它在路由解析之后、路由参数解析之前运行，因此你可以访问路由及其元数据。事件监听器由依赖注入容器创建，因此你可以注入自己的服务。

以下示例读取 bearer token，加载用户，并将其存储在 `request.store` 中。一个 HTTP 作用域的 provider 通过依赖注入使控制器可以获取该用户。

```typescript
import { App } from '@deepkit/app';
import { eventDispatcher } from '@deepkit/event';
import { FrameworkModule } from '@deepkit/framework';
import { http, HttpRequest, HttpUnauthorizedError, httpWorkflow } from '@deepkit/http';

class User {
    constructor(public id: number, public role: 'admin' | 'user') {
    }
}

class UserRepository {
    async findByToken(token: string): Promise<User | undefined> {
        //在你的数据库中查找该 token
        return undefined;
    }
}

class AuthListener {
    constructor(private users: UserRepository) {
    }

    @eventDispatcher.listen(httpWorkflow.onAuth)
    async onAuth(event: typeof httpWorkflow.onAuth.event) {
        const header = event.request.headers.authorization;
        if (!header?.startsWith('Bearer ')) return;

        const user = await this.users.findByToken(header.slice('Bearer '.length));
        if (user) event.request.store.user = user;
    }
}

class ProfileController {
    @http.GET('/me')
    me(user: User) {
        return { id: user.id };
    }
}

new App({
    controllers: [ProfileController],
    providers: [
        UserRepository,
        {
            provide: User, scope: 'http',
            useFactory(request: HttpRequest): User {
                if (!request.store.user) throw new HttpUnauthorizedError('Not logged in');
                return request.store.user;
            }
        },
    ],
    listeners: [AuthListener],
    imports: [new FrameworkModule()],
}).run();
```

```sh
$ curl http://localhost:8080/me
{"message":"Not logged in"}  # status 401
$ curl http://localhost:8080/me -H 'Authorization: Bearer secret-token'
{"id":2}
```

现在，每个声明了 `User` 参数的路由都要求用户已登录，没有该参数的路由则保持公开。在工厂函数中抛出的 `HttpUnauthorizedError` 会被转换为 401 响应。

除了 bearer token，你也可以用同样的方式读取 session cookie、API key 标头或验证 JWT。要在监听器中读取请求 body（例如用于登录表单），请使用 `HttpRequestParser<T>`，因为 body 是异步解析的：

```typescript
import { HttpRequestParser, httpWorkflow } from '@deepkit/http';

app.listen(httpWorkflow.onAuth, async (event, parser: HttpRequestParser<{ apiKey?: string }>) => {
    const data = await parser();
    //data.apiKey 来自 headers、body 或 query
});
```

另一种选择是使用[参数解析器](./input-output.md#resolver)，它仅为使用该参数的路由解析用户。

## 授权

要将路由限制为特定用户访问，可以为路由附加元数据并在监听器中检查。路由支持通过 `.group()` 设置分组，以及通过 `.data()` 设置任意值。两者都可以在所有 HTTP 事件中通过 `event.route` 访问。

```typescript
class AdminController {
    @http.GET('/admin/stats').data('role', 'admin')
    stats(user: User) {
        return { users: 1000 };
    }

    @http.GET('/admin/users').group('admin')
    users(user: User) {
        return [];
    }
}

app.listen(httpWorkflow.onAuth, (event) => {
    const user: User | undefined = event.request.store.user;

    const role = event.route.data.get('role');
    if (role && user?.role !== role) {
        event.accessDenied();
        return;
    }

    if (event.route.groups.includes('admin') && user?.role !== 'admin') {
        event.accessDenied();
    }
}, 10);
```

第三个参数是监听器的顺序。设置为 `10` 时，它会在身份验证监听器（默认顺序 `0`）之后运行，因此 `request.store.user` 已被设置，同时在 HTTP 模块的默认处理器（顺序 `100`）之前运行。或者，你也可以在同一个监听器中完成这两件事。

对于函数式路由器，请使用 `groups` 和 `data` 选项：

```typescript
router.get({ path: '/admin/stats', data: { role: 'admin' }, groups: ['admin'] }, (user: User) => {
    return { users: 1000 };
});
```

`event.accessDenied()` 会跳转到 `accessDenied` 工作流状态，默认以状态码 403 响应。在控制器内部，可以通过抛出 `HttpAccessDeniedError` 实现相同效果。对于依赖于已加载数据的检查（例如"该用户是否是此文档的所有者？"），请在控制器或服务中进行检查：

```typescript
import { HttpAccessDeniedError, HttpNotFoundError } from '@deepkit/http';

class DocumentController {
    @http.GET('/document/:id')
    async get(id: number, user: User, documents: DocumentRepository) {
        const document = await documents.find(id);
        if (!document) throw new HttpNotFoundError();
        if (document.ownerId !== user.id) throw new HttpAccessDeniedError();
        return document;
    }
}
```

要更改拒绝访问时的响应，请监听 `httpWorkflow.onAccessDenied`：

```typescript
import { httpWorkflow, JSONResponse } from '@deepkit/http';

app.listen(httpWorkflow.onAccessDenied, (event) => {
    if (event.sent) return;
    event.send(new JSONResponse({ message: 'Access denied' }, 403));
});
```

## 错误处理

非 HTTP 错误（例如数据库查询失败）会在服务器上记录日志，并以通用的 `500 Internal error` 响应。无论处于何种环境，堆栈跟踪和错误消息都不会发送给客户端。

```typescript
class MyController {
    @http.GET('/crash')
    crash() {
        throw new Error('Connection to db.internal:5432 failed');
    }
}
```

```sh
$ curl http://localhost:8080/crash
Internal error
```

`HttpNotFoundError` 或 `HttpBadRequestError` 等 HTTP 错误的消息*会*发送给客户端，因为它们本就是面向客户端的。不要在其中放入内部信息。验证错误包含路径、错误代码和无效值。

要更改错误响应，请监听 `httpWorkflow.onControllerError`（控制器中抛出的错误）和 `httpWorkflow.onParametersFailed`（解析参数时的错误，例如验证错误）。请参阅 [HTTP 错误](./input-output.md#http-errors)。

## 请求大小与超时

`multipart/form-data` 和 `application/x-www-form-urlencoded` 请求的 body 在解析时有限制，你可以通过 HTTP 配置的 `parser` 选项进行配置：

```typescript
new App({
    imports: [
        new FrameworkModule({
            http: {
                parser: {
                    maxFileSize: 10 * 1024 * 1024,      //每个文件，默认 200 MB
                    maxTotalFileSize: 20 * 1024 * 1024, //一个请求的所有文件，默认为 maxFileSize
                    maxFiles: 5,                        //默认 Infinity
                    maxFields: 100,                     //默认 1000
                    maxFieldsSize: 1024 * 1024,         //所有非文件字段的总和，默认 20 MB
                },
            },
        }),
    ],
}).run();
```

如果你在不使用框架的情况下使用 `HttpModule`，请将相同的选项传递给 `new HttpModule({ parser: {...} })`。超出文件限制的请求会在调用控制器之前以 `413 Payload Too Large`（`HttpPayloadTooLargeError`）拒绝。

JSON body 没有内置的大小限制。请使用检查 `Content-Length` 标头的中间件来限制它们。中间件在读取 body 之前运行，因此过大的 body 永远不会被解析：

```typescript
import { httpMiddleware, HttpRequest, HttpResponse } from '@deepkit/http';

function bodyLimit(maxBytes: number) {
    return (request: HttpRequest, response: HttpResponse, next: (err?: any) => void) => {
        const length = Number(request.headers['content-length'] || 0);
        if (length > maxBytes) {
            response.writeHead(413, { 'Content-Type': 'text/plain' });
            response.end('Payload too large');
            return;
        }
        next();
    };
}

new App({
    middlewares: [httpMiddleware.for(bodyLimit(1024 * 1024))],
    imports: [new FrameworkModule()],
}).run();
```

使用 `Transfer-Encoding: chunked` 的请求没有 `Content-Length` 标头。在生产环境中，还应在反向代理中限制 body 大小（例如 nginx 中的 `client_max_body_size`）。

当 Deepkit Framework 的 Node.js 服务器直接对外暴露时，请配置其超时和限制以防范慢速客户端：

```typescript
new FrameworkModule({
    http: {
        headersTimeout: 20_000,  //接收完整标头的毫秒数
        requestTimeout: 60_000,  //接收完整请求的毫秒数
        keepAliveTimeout: 5_000,
        maxHeadersCount: 100,
        maxRequestsPerSocket: 1000,
    },
})
```

## 文件上传

上传的文件以 `UploadedFile` 的形式提供（请参阅[文件上传](./input-output.md#file-upload)）。`UploadedFile` 只能由框架的 body 解析器创建。如果客户端发送一个看起来像上传文件的 JSON 对象（例如带有 `path: '/etc/passwd'`），验证将以错误代码 `uploadSecurity` 失败。

上传的文件存储在临时目录中，并在请求结束后删除。请记住，`name` 和 `type` 是由客户端发送的，不可信任：不要将 `name` 用作文件路径；如果类型很重要，请检查文件内容。

```typescript
import { http, HttpBadRequestError, HttpBody, UploadedFile } from '@deepkit/http';
import { copyFile } from 'fs/promises';
import { randomUUID } from 'crypto';

class AvatarController {
    @http.POST('/avatar')
    async upload(body: HttpBody<{ file: UploadedFile }>) {
        if (body.file.size > 2 * 1024 * 1024) throw new HttpBadRequestError('File too large');
        //切勿将 body.file.name 用作路径
        await copyFile(body.file.path, `/var/uploads/${randomUUID()}`);
    }
}
```

## CORS

没有内置的 CORS 处理。在 `onRequest` 监听器中添加标头，并在路由器运行之前于 `onRoute` 监听器中响应预检请求（`OPTIONS`）。由于该监听器在路由器之前运行，因此对于未定义 `OPTIONS` 方法的路由同样有效。

```typescript
import { httpWorkflow, Response } from '@deepkit/http';

const allowedOrigins = ['https://app.example.com'];

app.listen(httpWorkflow.onRequest, (event) => {
    const origin = event.request.headers.origin;
    if (origin && allowedOrigins.includes(origin)) {
        event.response.setHeader('Access-Control-Allow-Origin', origin);
        event.response.setHeader('Access-Control-Allow-Credentials', 'true');
        event.response.setHeader('Vary', 'Origin');
    }
});

app.listen(httpWorkflow.onRoute, (event) => {
    if (event.request.method !== 'OPTIONS') return;
    event.response.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, PATCH, DELETE');
    event.response.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
    event.response.setHeader('Access-Control-Max-Age', '600');
    event.send(new Response('', 'text/plain').status(204));
});
```

只回显允许列表中的 origin。将任意 `Origin` 标头与 `Access-Control-Allow-Credentials: true` 一起回显，会允许所有网站向你的 API 发起经过身份验证的请求。

或者，也可以通过 `httpMiddleware.for()` 注册 Express/Connect 的 CORS 中间件，请参阅[中间件](./middleware.md)。注意，中间件只会对匹配路由的请求运行。

## 安全标头

在 `onRequest` 监听器中设置在 `event.response` 上的标头会随每个响应一起发送，包括错误响应：

```typescript
import { httpWorkflow } from '@deepkit/http';

app.listen(httpWorkflow.onRequest, (event) => {
    event.response.setHeader('X-Content-Type-Options', 'nosniff');
    event.response.setHeader('X-Frame-Options', 'DENY');
    event.response.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
    event.response.setHeader('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
    event.response.setHeader('Content-Security-Policy', "default-src 'self'");
});
```

对于单个路由，请在响应对象上使用 `.header()`：

```typescript
import { HtmlResponse } from '@deepkit/http';

router.get('/embed', () => {
    return new HtmlResponse('<p>Embeddable</p>')
        .header('Content-Security-Policy', "frame-ancestors https://partner.example.com");
});
```

## 速率限制

速率限制不是内置的。由于 `onRoute` 监听器在路由解析之前、读取 body 之前运行，因此它们是拒绝请求的低成本位置：

```typescript
import { httpWorkflow, JSONResponse } from '@deepkit/http';

const limit = 100; //每分钟请求数
const hits = new Map<string, { count: number, reset: number }>();

app.listen(httpWorkflow.onRoute, (event) => {
    const key = event.request.getRemoteAddress();
    const now = Date.now();

    let entry = hits.get(key);
    if (!entry || entry.reset < now) {
        entry = { count: 0, reset: now + 60_000 };
        hits.set(key, entry);
    }

    if (++entry.count > limit) {
        event.response.setHeader('Retry-After', String(Math.ceil((entry.reset - now) / 1000)));
        event.send(new JSONResponse({ message: 'Too many requests' }, 429));
    }
});
```

这种内存存储仅适用于单个进程，并且会随着客户端数量的增加而增长。对于多个进程或服务器，请使用 Redis 等共享存储，或在反向代理中进行速率限制。在反向代理之后，`getRemoteAddress()` 返回的是代理的地址；请从代理设置的标头（例如 `X-Forwarded-For`）中读取客户端地址，但前提是该请求确实来自你的代理。

在控制器内部，对于依赖于用户或操作的限制（例如每个账户的登录尝试次数），你可以抛出 `HttpTooManyRequestsError`（状态码 429）。

## Cookies

Deepkit HTTP 没有内置的 cookie 解析器或会话系统。从 `Cookie` 标头读取 cookie，并通过 `Set-Cookie` 标头设置它们：

```typescript
import { http, HttpHeader, JSONResponse } from '@deepkit/http';

function parseCookies(header: string = ''): Record<string, string> {
    const cookies: Record<string, string> = {};
    for (const part of header.split(';')) {
        const index = part.indexOf('=');
        if (index === -1) continue;
        cookies[part.slice(0, index).trim()] = decodeURIComponent(part.slice(index + 1).trim());
    }
    return cookies;
}

class SessionController {
    @http.POST('/login')
    login() {
        const sessionId = createSession(); //你的会话存储
        return new JSONResponse({ ok: true })
            .header('Set-Cookie', `session=${sessionId}; HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=86400`);
    }

    @http.GET('/session')
    session(cookie?: HttpHeader<string, { name: 'cookie' }>) {
        const { session } = parseCookies(cookie);
        //...
    }
}
```

在 `onAuth` 监听器中，通过 `event.request.headers.cookie` 读取该标头。

对于 session cookie，请始终设置 `HttpOnly`（JavaScript 无法读取）、`Secure`（仅通过 HTTPS 发送）以及 `SameSite=Lax` 或 `Strict`（对大多数请求防范 CSRF）。如果你的 API 使用 cookie 进行身份验证，并接受来自浏览器的状态变更请求，还需额外防范 CSRF，例如检查 `Origin` 标头或使用 CSRF token。

## HTML 输出

使用 [JSX 视图](./views.md)渲染 HTML 时，文本内容和属性值会被自动转义。仅对你信任的 HTML 使用 `html()`，并验证放入 `href` 或 `src` 中的 URL。请参阅[转义](./views.md#escaping)。

## 静态文件

框架的静态文件服务（`publicDir`）会以状态码 403 拒绝包含 `..` 的路径，并且不会提供点文件（例如 `.env`）或点目录中的文件。尽管如此，仍应只将本就打算公开的文件放入 public 目录。

## 生产环境检查清单

- 禁用调试模式（`FrameworkModule({ debug: false })`，即默认值）。调试器会在 `/_debug` 下暴露应用程序的内部信息，并且在调试模式下 RPC 错误会包含堆栈跟踪。
- 仅当你希望 RPC 操作可通过 HTTP 调用时，才设置 `httpRpcBasePath`。
- 在终止 TLS 并限制 body 大小和请求速率的反向代理之后运行，或配置上文所述的服务器超时。
- 为请求 body 使用专用类型，并通过验证类型限制字符串、数组和数字。
- 切勿将用户输入传递给 `html()`。
