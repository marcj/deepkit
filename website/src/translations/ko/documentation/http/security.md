# 보안

Deepkit HTTP는 TypeScript 타입을 기반으로 모든 입력을 검증하며, 내부 에러 세부 정보를 클라이언트에 노출하지 않습니다. 인증, 인가, CORS, 보안 헤더, rate limiting은 프레임워크에 하드코딩되어 있지 않습니다. 대신 [HTTP 이벤트](./events.md) 또는 [미들웨어](./middleware.md)로 직접 구현하므로 애플리케이션에 정확히 맞출 수 있습니다.

이 페이지에서는 내장된 보호 기능과 나머지를 사용 가능한 API로 구현하는 방법을 보여줍니다.

## 입력 검증

모든 라우트 파라미터(path, query, header, body)는 라우트가 호출되기 전에 선언된 타입으로 변환되고 검증됩니다. 유효하지 않은 데이터를 가진 요청은 절대 코드에 도달하지 않으며 상태 코드 400으로 응답됩니다. 이는 인젝션 공격과 잘못된 형식의 데이터에 대한 첫 번째 방어선입니다.

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
        // body는 유효한 RegisterBody임이 보장됩니다
    }

    @http.GET('/users')
    list(limit: HttpQuery<number & Positive & Maximum<100>> = 20) {
        // limit은 1에서 100 사이의 숫자입니다
    }
}
```

```sh
$ curl -X POST http://localhost:8080/register -H 'Content-Type: application/json' -d '{"email": "nope", "username": "a"}'
{"message":"Validation error:...","errors":[{"path":"email","code":"pattern",...},{"path":"username","code":"minLength",...}]}
```

타입에 포함되지 않은 프로퍼티는 body에서 제거됩니다. 클라이언트가 `{"email": "...", "username": "peter", "isAdmin": true}`를 보내면, 컨트롤러는 `isAdmin`이 없는 객체를 받습니다. body 타입이 클라이언트가 설정할 수 있는 프로퍼티만 포함하는 한, 이는 mass assignment 취약점을 방지합니다. 전체 엔티티 대신 전용 body 타입(또는 `Pick<User, 'email' | 'username'>`)을 사용하세요.

`MaxLength`로 문자열 길이와 배열 크기를, `Maximum`/`Minimum`으로 숫자 범위를 제한하여 클라이언트가 데이터베이스나 비즈니스 로직에 임의로 큰 값을 보낼 수 없도록 하세요.

사용 가능한 모든 타입은 [입력 & 출력](./input-output.md)과 [검증](../runtime-types/validation.md)을 참조하세요.

## 인증

인증은 `httpWorkflow.onAuth` 이벤트에서 수행하는 것이 가장 좋습니다. 이 이벤트는 라우트가 결정된 후, 라우트 파라미터가 resolve되기 전에 실행되므로 라우트와 그 메타데이터에 접근할 수 있습니다. 이벤트 리스너는 의존성 주입 컨테이너에 의해 생성되므로 자체 서비스를 주입할 수 있습니다.

다음 예제는 bearer token을 읽고, 사용자를 로드한 뒤 `request.store`에 저장합니다. HTTP 스코프 provider가 의존성 주입을 통해 컨트롤러에서 사용자를 사용할 수 있도록 합니다.

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
        //데이터베이스에서 토큰을 조회합니다
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

이제 `User` 파라미터를 선언하는 모든 라우트는 로그인한 사용자를 요구하며, 그렇지 않은 라우트는 공개 상태로 유지됩니다. factory에서 던져진 `HttpUnauthorizedError`는 401 응답으로 변환됩니다.

bearer token 대신 세션 쿠키나 API key 헤더를 읽거나 JWT를 같은 방식으로 검증할 수 있습니다. 리스너에서 요청 body를 읽으려면(예: 로그인 폼), body가 비동기로 파싱되므로 `HttpRequestParser<T>`를 사용하세요:

```typescript
import { HttpRequestParser, httpWorkflow } from '@deepkit/http';

app.listen(httpWorkflow.onAuth, async (event, parser: HttpRequestParser<{ apiKey?: string }>) => {
    const data = await parser();
    //data.apiKey는 headers, body 또는 query에서 옵니다
});
```

또 다른 방법은 [파라미터 resolver](./input-output.md#resolver)로, 사용자를 사용하는 라우트에서만 사용자를 resolve합니다.

## 인가

라우트를 특정 사용자로 제한하려면 라우트에 메타데이터를 첨부하고 리스너에서 확인하세요. 라우트는 `.group()`을 통한 그룹과 `.data()`를 통한 임의의 값을 지원합니다. 둘 다 모든 HTTP 이벤트에서 `event.route`를 통해 사용할 수 있습니다.

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

세 번째 인자는 리스너의 순서입니다. `10`으로 설정하면 인증 리스너(기본 순서 `0`) 이후에 실행되므로 `request.store.user`가 이미 설정되어 있고, HTTP 모듈의 기본 핸들러(순서 `100`) 이전에 실행됩니다. 또는 둘 다 같은 리스너에서 처리할 수도 있습니다.

함수형 라우터에서는 `groups`와 `data` 옵션을 사용하세요:

```typescript
router.get({ path: '/admin/stats', data: { role: 'admin' }, groups: ['admin'] }, (user: User) => {
    return { users: 1000 };
});
```

`event.accessDenied()`는 `accessDenied` 워크플로 상태로 이동하며, 기본적으로 상태 코드 403으로 응답합니다. 컨트롤러 내부에서는 `HttpAccessDeniedError`를 던져 같은 효과를 낼 수 있습니다. 로드된 데이터에 의존하는 검사(예: "이 사용자가 이 문서의 소유자인가?")는 컨트롤러나 서비스에서 수행하세요:

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

접근 거부 시의 응답을 변경하려면 `httpWorkflow.onAccessDenied`를 리스닝하세요:

```typescript
import { httpWorkflow, JSONResponse } from '@deepkit/http';

app.listen(httpWorkflow.onAccessDenied, (event) => {
    if (event.sent) return;
    event.send(new JSONResponse({ message: 'Access denied' }, 403));
});
```

## 에러 처리

HTTP 에러가 아닌 에러(예: 실패한 데이터베이스 쿼리)는 서버에 로그로 기록되고 일반적인 `500 Internal error`로 응답됩니다. 스택 트레이스와 에러 메시지는 환경과 관계없이 절대 클라이언트에 전송되지 않습니다.

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

`HttpNotFoundError`나 `HttpBadRequestError` 같은 HTTP 에러의 메시지는 클라이언트를 위한 것이므로 클라이언트에 *전송됩니다*. 여기에 내부 정보를 넣지 마세요. 검증 에러에는 경로, 에러 코드, 유효하지 않은 값이 포함됩니다.

에러 응답을 변경하려면 `httpWorkflow.onControllerError`(컨트롤러에서 던져진 에러)와 `httpWorkflow.onParametersFailed`(파라미터 resolve 중 발생한 에러, 예: 검증 에러)를 리스닝하세요. [HTTP 에러](./input-output.md#http-errors)를 참조하세요.

## 요청 크기와 타임아웃

`multipart/form-data` 및 `application/x-www-form-urlencoded` 요청의 body는 HTTP 설정의 `parser` 옵션으로 구성할 수 있는 제한과 함께 파싱됩니다:

```typescript
new App({
    imports: [
        new FrameworkModule({
            http: {
                parser: {
                    maxFileSize: 10 * 1024 * 1024,      //파일당, 기본값 200 MB
                    maxTotalFileSize: 20 * 1024 * 1024, //요청의 모든 파일, 기본값 maxFileSize
                    maxFiles: 5,                        //기본값 Infinity
                    maxFields: 100,                     //기본값 1000
                    maxFieldsSize: 1024 * 1024,         //파일이 아닌 모든 필드 합계, 기본값 20 MB
                },
            },
        }),
    ],
}).run();
```

프레임워크 없이 `HttpModule`을 사용한다면, 같은 옵션을 `new HttpModule({ parser: {...} })`에 전달하세요. 파일 제한을 초과하는 요청은 컨트롤러가 호출되기 전에 `413 Payload Too Large`(`HttpPayloadTooLargeError`)로 거부됩니다.

JSON body에는 내장된 크기 제한이 없습니다. `Content-Length` 헤더를 확인하는 미들웨어로 제한하세요. 미들웨어는 body를 읽기 전에 실행되므로 너무 큰 body는 절대 파싱되지 않습니다:

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

`Transfer-Encoding: chunked` 요청에는 `Content-Length` 헤더가 없습니다. 프로덕션에서는 reverse proxy에서도 body 크기를 제한하세요(예: nginx의 `client_max_body_size`).

Deepkit Framework의 Node.js 서버가 직접 노출되는 경우, 느린 클라이언트로부터 보호하기 위해 타임아웃과 제한을 구성하세요:

```typescript
new FrameworkModule({
    http: {
        headersTimeout: 20_000,  //전체 헤더를 수신하기까지의 ms
        requestTimeout: 60_000,  //전체 요청을 수신하기까지의 ms
        keepAliveTimeout: 5_000,
        maxHeadersCount: 100,
        maxRequestsPerSocket: 1000,
    },
})
```

## 파일 업로드

업로드된 파일은 `UploadedFile`로 사용할 수 있습니다([파일 업로드](./input-output.md#file-upload) 참조). `UploadedFile`은 프레임워크의 body parser만 생성할 수 있습니다. 클라이언트가 업로드된 파일처럼 보이는 JSON 객체(예: `path: '/etc/passwd'` 포함)를 보내면, 에러 코드 `uploadSecurity`와 함께 검증이 실패합니다.

업로드된 파일은 임시 디렉터리에 저장되며 요청 후 삭제됩니다. `name`과 `type`은 클라이언트가 보낸 값이므로 신뢰할 수 없다는 점에 유의하세요: `name`을 파일 경로로 사용하지 말고, 타입이 중요하다면 파일 내용을 확인하세요.

```typescript
import { http, HttpBadRequestError, HttpBody, UploadedFile } from '@deepkit/http';
import { copyFile } from 'fs/promises';
import { randomUUID } from 'crypto';

class AvatarController {
    @http.POST('/avatar')
    async upload(body: HttpBody<{ file: UploadedFile }>) {
        if (body.file.size > 2 * 1024 * 1024) throw new HttpBadRequestError('File too large');
        //body.file.name을 절대 경로로 사용하지 마세요
        await copyFile(body.file.path, `/var/uploads/${randomUUID()}`);
    }
}
```

## CORS

내장된 CORS 처리는 없습니다. `onRequest` 리스너에서 헤더를 추가하고, 라우터가 실행되기 전에 `onRoute` 리스너에서 preflight 요청(`OPTIONS`)에 응답하세요. 리스너가 라우터보다 먼저 실행되므로 `OPTIONS` 메서드를 정의하지 않은 라우트에서도 동작합니다.

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

허용 목록(allowlist)에 있는 origin만 반영하세요. `Access-Control-Allow-Credentials: true`와 함께 모든 `Origin` 헤더를 반영하면 모든 웹사이트가 API에 인증된 요청을 보낼 수 있게 됩니다.

또는 Express/Connect CORS 미들웨어를 `httpMiddleware.for()`로 등록할 수 있습니다. [미들웨어](./middleware.md)를 참조하세요. 미들웨어는 라우트와 일치하는 요청에서만 실행된다는 점에 유의하세요.

## 보안 헤더

`onRequest` 리스너에서 `event.response`에 설정한 헤더는 에러 응답을 포함한 모든 응답과 함께 전송됩니다:

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

단일 라우트의 경우 response 객체에 `.header()`를 사용하세요:

```typescript
import { HtmlResponse } from '@deepkit/http';

router.get('/embed', () => {
    return new HtmlResponse('<p>Embeddable</p>')
        .header('Content-Security-Policy', "frame-ancestors https://partner.example.com");
});
```

## Rate Limiting

Rate limiting은 내장되어 있지 않습니다. `onRoute` 리스너는 라우트가 결정되고 body를 읽기 전에 실행되므로, 요청을 거부하기에 비용이 적은 위치입니다:

```typescript
import { httpWorkflow, JSONResponse } from '@deepkit/http';

const limit = 100; //분당 요청 수
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

이 인메모리 저장소는 단일 프로세스에서만 동작하며 클라이언트 수에 따라 커집니다. 여러 프로세스나 서버의 경우 Redis 같은 공유 저장소를 사용하거나 reverse proxy에서 rate limiting을 하세요. Reverse proxy 뒤에서는 `getRemoteAddress()`가 프록시의 주소를 반환합니다. 프록시가 설정하는 헤더(예: `X-Forwarded-For`)에서 클라이언트 주소를 읽되, 요청이 실제로 프록시에서 온 경우에만 그렇게 하세요.

컨트롤러 내부에서는 사용자나 동작에 따라 달라지는 제한(예: 계정별 로그인 시도 횟수)에 대해 `HttpTooManyRequestsError`(상태 코드 429)를 던질 수 있습니다.

## 쿠키

Deepkit HTTP에는 내장된 쿠키 파서나 세션 시스템이 없습니다. `Cookie` 헤더에서 쿠키를 읽고 `Set-Cookie` 헤더로 설정하세요:

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
        const sessionId = createSession(); //세션 저장소
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

`onAuth` 리스너에서는 `event.request.headers.cookie`를 통해 헤더를 읽으세요.

세션 쿠키에는 항상 `HttpOnly`(JavaScript로 읽을 수 없음), `Secure`(HTTPS를 통해서만 전송), `SameSite=Lax` 또는 `Strict`(대부분의 요청에 대해 CSRF로부터 보호)를 설정하세요. API가 인증에 쿠키를 사용하고 브라우저로부터 상태를 변경하는 요청을 받는다면, 추가로 CSRF에 대해 보호하세요. 예를 들어 `Origin` 헤더를 확인하거나 CSRF 토큰을 사용할 수 있습니다.

## HTML 출력

[JSX 뷰](./views.md)로 HTML을 렌더링할 때 텍스트 내용과 속성 값은 자동으로 이스케이프됩니다. `html()`은 신뢰할 수 있는 HTML에만 사용하고, `href`나 `src`에 넣는 URL은 검증하세요. [이스케이프](./views.md#escaping)를 참조하세요.

## 정적 파일

프레임워크의 정적 파일 제공 기능(`publicDir`)은 `..`를 포함한 경로를 상태 코드 403으로 거부하며, dotfile(예: `.env`)이나 dot-디렉터리 내 파일은 제공하지 않습니다. 그래도 public 디렉터리에는 공개를 의도한 파일만 넣으세요.

## 프로덕션 체크리스트

- 디버그 모드를 비활성화하세요(`FrameworkModule({ debug: false })`, 기본값). 디버거는 `/_debug` 아래에서 애플리케이션의 내부 정보를 노출하며, 디버그 모드에서는 RPC 에러에 스택 트레이스가 포함됩니다.
- RPC 액션을 HTTP로 호출 가능하게 하려는 경우에만 `httpRpcBasePath`를 설정하세요.
- TLS를 종료하고 body 크기와 요청 속도를 제한하는 reverse proxy 뒤에서 실행하거나, 위에서 설명한 서버 타임아웃을 구성하세요.
- 요청 body에는 전용 타입을 사용하고, 검증 타입으로 문자열, 배열, 숫자를 제한하세요.
- 사용자 입력을 절대 `html()`에 전달하지 마세요.
