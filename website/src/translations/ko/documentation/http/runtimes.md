# 서버 & 런타임

HTTP 커널은 자체 서버가 필요하지 않습니다. 동일한 컨트롤러를 가진 동일한 앱이 Deepkit Framework 서버, 직접 만든 Node.js 서버, Express 또는 Fastify 내부, Bun, Deno 또는 Cloudflare Workers의 `fetch` 핸들러 뒤, 그리고 AWS Lambda에서 실행됩니다.

| 진입점 | 용도 |
|---|---|
| `FrameworkModule` | 완전한 애플리케이션: 서버, 워커, HTTPS, 압축, CLI, 디버거 |
| `kernel.handleRequestMaybeSync(req, res)` | 직접 만든 `node:http` / `node:https` 서버 |
| `kernel.createMiddleware()` | Express, Connect 또는 Fastify(`@fastify/middie` 사용)에 Deepkit 라우트 마운트 |
| `kernel.fetch(request)` | `Bun.serve`, `Deno.serve`, Cloudflare Workers 및 웹 표준 `Request`/`Response` 핸들러를 사용하는 그 밖의 모든 환경 |
| `createLambdaHandler(kernel)` | API Gateway(HTTP 및 REST API), Function URL 및 Application Load Balancer 뒤의 AWS Lambda |

모든 예제는 다음 앱을 사용합니다:

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

## Deepkit Framework 서버

`FrameworkModule`을 사용하면 서버가 이미 내장되어 있으며 `server:start`로 시작됩니다. HTTPS, 압축, 다중 워커 프로세스, graceful shutdown, HTTP 액세스 로그 및 디버거를 제공합니다.

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

## 직접 만든 Node.js 서버

요청 객체를 변환할 필요가 없도록 Deepkit의 요청 클래스를 `createServer`에 전달합니다:

```typescript
import { createServer } from 'http';
import { HttpRequest, HttpResponse } from '@deepkit/http';

createServer(
    { IncomingMessage: HttpRequest, ServerResponse: HttpResponse as any },
    (req, res) => kernel.handleRequestMaybeSync(req, res),
).listen(8080);
```

`handleRequestMaybeSync`는 요청이 비동기적으로 처리될 때(예: `async` 컨트롤러 사용 시)에만 promise를 반환합니다. `handleRequest`는 항상 promise를 반환합니다.

## Express, Fastify 등

`createMiddleware`는 Connect 스타일의 미들웨어를 반환합니다. `fallThroughOnNotFound`를 사용하면 일치하는 Deepkit 라우트가 없는 요청은 404로 응답하는 대신 다음 미들웨어로 전달됩니다.

```typescript
import express from 'express';

const server = express();
server.use(kernel.createMiddleware({ fallThroughOnNotFound: true }));
server.get('/legacy', (req, res) => res.send('handled by express'));
server.listen(8080);
```

## Fetch 핸들러

`kernel.fetch(request)`는 웹 표준 `Request`를 받아 `Response`를 반환합니다. 동기 라우트의 경우 `Response`는 promise 없이 직접 반환됩니다.

### Bun

```typescript
Bun.serve({
    port: 8080,
    fetch: request => kernel.fetch(request),
});
```

Bun의 `node:http` 호환 레이어 대신 `Bun.serve`를 사용하세요. 요청당 CPU 시간이 약 절반으로 줄어듭니다. [성능](./performance.md)을 참조하세요.

### Deno

```typescript
Deno.serve({ port: 8080 }, request => kernel.fetch(request));
```

### Cloudflare Workers

Workers에는 `nodejs_compat` 플래그가 필요합니다:

```toml
# wrangler.toml
compatibility_date = "2026-01-01"
compatibility_flags = ["nodejs_compat"]
```

Workers는 워커가 시작되는 동안에만 코드 생성(`new Function`)을 허용하며, 요청을 처리하는 동안에는 허용하지 않습니다. Deepkit은 라우터, 검증기 및 직렬화기를 JavaScript로 컴파일하므로 모듈 레벨에서 `kernel.warmUp()`을 호출하세요. 이는 요청에 필요한 모든 것을 미리 컴파일합니다:

```typescript
const kernel = app.get(HttpKernel);
kernel.warmUp();

export default {
    fetch: (request: Request) => kernel.fetch(request),
};
```

업로드된 파일은 임시 파일에 기록되는데 Workers에는 파일 시스템이 없으므로, Workers에서는 파일 업로드(파일을 포함한 `multipart/form-data`)가 지원되지 않습니다.

### AWS Lambda

`createLambdaHandler`는 커널을 Lambda 핸들러로 변환합니다. API Gateway HTTP API 및 Function URL 이벤트(페이로드 형식 2.0)와 REST API 및 Application Load Balancer 이벤트(페이로드 형식 1.0)를 읽으며, 바이너리 본문은 base64로 인코딩하여 반환합니다.

```typescript
import { createLambdaHandler } from '@deepkit/http';

const kernel = app.get(HttpKernel);
// 첫 번째 호출 대신 Lambda의 init 단계에서 컴파일합니다
kernel.warmUp();

export const handler = createLambdaHandler(kernel);
```

앱은 Lambda 인스턴스당 한 번 생성된 후 해당 인스턴스의 모든 호출을 처리합니다.

### Node.js 서버와의 차이점

- 요청 본문은 라우트가 호출되기 전에 완전히 읽힙니다. JSON 본문은 텍스트로 읽힙니다.
- 응답은 종료된 후에 전송됩니다. 반환한 스트림은 수집된 후 하나의 본문으로 전송됩니다.
- 클라이언트의 주소는 웹 표준 `Request`에 포함되지 않습니다. `request.getRemoteAddress()`가 필요하다면 옵션으로 전달하세요. `createLambdaHandler`는 이벤트에서 이를 가져옵니다.

```typescript
// Bun
Bun.serve({
    fetch: (request, server) => kernel.fetch(request, { remoteAddress: server.requestIP(request)?.address }),
});

// Deno
Deno.serve((request, info) => kernel.fetch(request, { remoteAddress: info.remoteAddr.hostname }));
```

- `HttpRequest`와 `HttpResponse`는 기존 API(`headers`, `setHeader`, `writeHead`, `readBody()`, …)를 유지하므로 컨트롤러, 리스너 및 미들웨어는 변경 없이 동작합니다.

## warmUp()

Deepkit은 각 라우트의 파라미터 파싱, 검증 및 직렬화를 처음 필요할 때 컴파일합니다. `kernel.warmUp()`은 모든 라우트에 대해 이를 미리 수행합니다:

- 시작 시에만 코드 생성을 허용하는 Cloudflare Workers에서는 필수
- 첫 요청 전에 init 단계가 실행되는 Lambda 및 기타 서버리스 플랫폼에서 권장
- 장기 실행 서버에서 라우트별 첫 요청의 지연 시간 제거

## 서버 없이 테스트하기

두 방법 모두 네트워크 없이 전체 요청 처리를 실행합니다:

```typescript
import { HttpRequest } from '@deepkit/http';

const response = await kernel.request(HttpRequest.POST('/user').json({ name: 'Peter' }));
expect(response.json).toEqual({ id: 1, name: 'Peter' });

const fetched = await kernel.fetch(new Request('http://localhost/hello'));
expect(await fetched.json()).toEqual({ hello: 'world' });
```
