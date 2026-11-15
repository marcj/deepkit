# Security

Deepkit HTTP validates all input based on your TypeScript types and does not leak internal error details to the client. Authentication, authorization, CORS, security headers, and rate limiting are not hardcoded into the framework. Instead, you implement them with [HTTP events](./events.md) or [middlewares](./middleware.md), so they fit your application exactly.

This page shows the built-in protections and how to implement the rest with the available APIs.

## Input Validation

All route parameters (path, query, header, body) are converted to the declared type and validated before the route is called. A request with invalid data never reaches your code and is answered with status 400. This is your first line of defense against injection attacks and malformed data.

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
        // body is guaranteed to be a valid RegisterBody
    }

    @http.GET('/users')
    list(limit: HttpQuery<number & Positive & Maximum<100>> = 20) {
        // limit is a number between 1 and 100
    }
}
```

```sh
$ curl -X POST http://localhost:8080/register -H 'Content-Type: application/json' -d '{"email": "nope", "username": "a"}'
{"message":"Validation error:...","errors":[{"path":"email","code":"pattern",...},{"path":"username","code":"minLength",...}]}
```

Properties that are not part of the type are removed from the body. If a client sends `{"email": "...", "username": "peter", "isAdmin": true}`, the controller receives an object without `isAdmin`. This prevents mass assignment vulnerabilities, as long as the body type contains only the properties the client is allowed to set. Use a dedicated body type (or `Pick<User, 'email' | 'username'>`) instead of your full entity.

Limit the length of strings and the size of arrays with `MaxLength`, and the range of numbers with `Maximum`/`Minimum`, so that clients can't send arbitrarily large values to your database or business logic.

See [Input & Output](./input-output.md) and [Validation](../runtime-types/validation.md) for all available types.

## Authentication

Authentication is best done in the `httpWorkflow.onAuth` event. It runs after the route was resolved and before the route parameters are resolved, so you have access to the route and its metadata. Event listeners are created by the dependency injection container, so you can inject your own services.

The following example reads a bearer token, loads the user, and stores it in `request.store`. An HTTP scoped provider makes the user available to controllers via dependency injection.

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
        //look up the token in your database
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

Every route that declares a `User` parameter now requires a logged-in user, routes without it stay public. The `HttpUnauthorizedError` thrown in the factory is converted to a 401 response.

Instead of a bearer token, you can read a session cookie, an API key header, or verify a JWT the same way. To read the request body in a listener (e.g. for a login form), use `HttpRequestParser<T>`, since the body is parsed asynchronously:

```typescript
import { HttpRequestParser, httpWorkflow } from '@deepkit/http';

app.listen(httpWorkflow.onAuth, async (event, parser: HttpRequestParser<{ apiKey?: string }>) => {
    const data = await parser();
    //data.apiKey comes from headers, body, or query
});
```

Another option is a [parameter resolver](./input-output.md#resolver), which resolves the user only for routes that use it.

## Authorization

To restrict a route to certain users, attach metadata to the route and check it in a listener. Routes support groups via `.group()` and arbitrary values via `.data()`. Both are available in all HTTP events via `event.route`.

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

The third argument is the order of the listener. With `10`, it runs after the authentication listener (default order `0`), so `request.store.user` is already set, and before the default handler of the HTTP module (order `100`). Alternatively, do both in the same listener.

For the functional router, use the `groups` and `data` options:

```typescript
router.get({ path: '/admin/stats', data: { role: 'admin' }, groups: ['admin'] }, (user: User) => {
    return { users: 1000 };
});
```

`event.accessDenied()` jumps to the `accessDenied` workflow state, which responds with status 403 by default. Inside a controller, the same can be done by throwing `HttpAccessDeniedError`. For checks that depend on the loaded data (e.g. "is this user the owner of this document?"), do the check in the controller or service:

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

To change the response for denied access, listen to `httpWorkflow.onAccessDenied`:

```typescript
import { httpWorkflow, JSONResponse } from '@deepkit/http';

app.listen(httpWorkflow.onAccessDenied, (event) => {
    if (event.sent) return;
    event.send(new JSONResponse({ message: 'Access denied' }, 403));
});
```

## Error Handling

Errors that are not HTTP errors (e.g. a failing database query) are logged on the server and answered with a generic `500 Internal error`. Stack traces and error messages are never sent to the client, regardless of the environment.

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

The messages of HTTP errors like `HttpNotFoundError` or `HttpBadRequestError` *are* sent to the client, since they are meant for the client. Don't put internal information into them. Validation errors contain the path, the error code, and the invalid value.

To change the error responses, listen to `httpWorkflow.onControllerError` (errors thrown in the controller) and `httpWorkflow.onParametersFailed` (errors while resolving the parameters, e.g. validation errors). See [HTTP Errors](./input-output.md#http-errors).

## Request Size and Timeouts

Bodies of `multipart/form-data` and `application/x-www-form-urlencoded` requests are parsed with limits that you can configure via the `parser` option of the HTTP config:

```typescript
new App({
    imports: [
        new FrameworkModule({
            http: {
                parser: {
                    maxFileSize: 10 * 1024 * 1024,      //per file, default 200 MB
                    maxTotalFileSize: 20 * 1024 * 1024, //all files of a request, default maxFileSize
                    maxFiles: 5,                        //default Infinity
                    maxFields: 100,                     //default 1000
                    maxFieldsSize: 1024 * 1024,         //all non-file fields together, default 20 MB
                },
            },
        }),
    ],
}).run();
```

If you use `HttpModule` without the framework, pass the same options to `new HttpModule({ parser: {...} })`. A request exceeding a file limit is rejected with `413 Payload Too Large` (`HttpPayloadTooLargeError`) before the controller is called.

JSON bodies have no built-in size limit. Limit them with a middleware that checks the `Content-Length` header. Middlewares run before the body is read, so a too large body is never parsed:

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

Requests with `Transfer-Encoding: chunked` have no `Content-Length` header. In production, also limit the body size in your reverse proxy (e.g. `client_max_body_size` in nginx).

When the Node.js server of the Deepkit Framework is exposed directly, configure its timeouts and limits to protect against slow clients:

```typescript
new FrameworkModule({
    http: {
        headersTimeout: 20_000,  //ms to receive the complete headers
        requestTimeout: 60_000,  //ms to receive the complete request
        keepAliveTimeout: 5_000,
        maxHeadersCount: 100,
        maxRequestsPerSocket: 1000,
    },
})
```

## File Uploads

Uploaded files are available as `UploadedFile` (see [File Upload](./input-output.md#file-upload)). An `UploadedFile` can only be created by the framework's body parser. If a client sends a JSON object that looks like an uploaded file (e.g. with `path: '/etc/passwd'`), validation fails with the error code `uploadSecurity`.

Uploaded files are stored in a temporary directory and deleted after the request. Keep in mind that `name` and `type` are sent by the client and can't be trusted: don't use `name` as a file path, and check the file content if the type matters.

```typescript
import { http, HttpBadRequestError, HttpBody, UploadedFile } from '@deepkit/http';
import { copyFile } from 'fs/promises';
import { randomUUID } from 'crypto';

class AvatarController {
    @http.POST('/avatar')
    async upload(body: HttpBody<{ file: UploadedFile }>) {
        if (body.file.size > 2 * 1024 * 1024) throw new HttpBadRequestError('File too large');
        //never use body.file.name as path
        await copyFile(body.file.path, `/var/uploads/${randomUUID()}`);
    }
}
```

## CORS

There is no built-in CORS handling. Add the headers in an `onRequest` listener, and answer preflight requests (`OPTIONS`) in an `onRoute` listener before the router runs. Since the listener runs before the router, this also works for routes that don't define an `OPTIONS` method.

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

Only reflect origins from an allowlist. Reflecting any `Origin` header together with `Access-Control-Allow-Credentials: true` allows every website to make authenticated requests to your API.

Alternatively, an Express/Connect CORS middleware can be registered with `httpMiddleware.for()`, see [Middleware](./middleware.md). Note that middlewares only run for requests that match a route.

## Security Headers

Headers set on `event.response` in an `onRequest` listener are sent with every response, including error responses:

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

For a single route, use `.header()` on a response object:

```typescript
import { HtmlResponse } from '@deepkit/http';

router.get('/embed', () => {
    return new HtmlResponse('<p>Embeddable</p>')
        .header('Content-Security-Policy', "frame-ancestors https://partner.example.com");
});
```

## Rate Limiting

Rate limiting is not built in. Since `onRoute` listeners run before the route is resolved and before the body is read, they are a cheap place to reject requests:

```typescript
import { httpWorkflow, JSONResponse } from '@deepkit/http';

const limit = 100; //requests per minute
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

This in-memory store only works for a single process and grows with the number of clients. For multiple processes or servers, use a shared store like Redis, or rate limit in your reverse proxy. Behind a reverse proxy, `getRemoteAddress()` returns the address of the proxy; read the client address from the header your proxy sets (e.g. `X-Forwarded-For`), but only if the request really came from your proxy.

Inside a controller, you can throw `HttpTooManyRequestsError` (status 429) for limits that depend on the user or the action, e.g. login attempts per account.

## Cookies

Deepkit HTTP has no built-in cookie parser or session system. Read cookies from the `Cookie` header and set them with the `Set-Cookie` header:

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
        const sessionId = createSession(); //your session store
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

In an `onAuth` listener, read the header via `event.request.headers.cookie`.

For session cookies, always set `HttpOnly` (not readable by JavaScript), `Secure` (only sent via HTTPS), and `SameSite=Lax` or `Strict` (protects against CSRF for most requests). If your API uses cookies for authentication and accepts state-changing requests from browsers, additionally protect it against CSRF, e.g. by checking the `Origin` header or with a CSRF token.

## HTML Output

When rendering HTML with [JSX views](./views.md), text content and attribute values are escaped automatically. Only use `html()` for HTML you trust, and validate URLs you put into `href` or `src`. See [Escaping](./views.md#escaping).

## Static Files

The static file serving of the framework (`publicDir`) rejects paths containing `..` with status 403 and doesn't serve dotfiles (e.g. `.env`) or files in dot-directories. Still, only put files into the public directory that are meant to be public.

## Production Checklist

- Disable debug mode (`FrameworkModule({ debug: false })`, the default). The debugger exposes internal information of your application under `/_debug`, and RPC errors include stack traces in debug mode.
- Only set `httpRpcBasePath` if you want RPC actions to be callable via HTTP.
- Run behind a reverse proxy that terminates TLS and limits body size and request rates, or configure the server timeouts described above.
- Use dedicated types for request bodies, and limit strings, arrays, and numbers with validation types.
- Never pass user input to `html()`.
