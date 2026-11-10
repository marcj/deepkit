# HTTP

Deepkit RPC는 [WebSocket](./websocket.md), [TCP](./tcp.md), [IPC](./ipc.md) 외에도 일반 HTTP 위에서 실행할 수 있습니다. 모든 action 호출은 JSON 응답을 반환하는 하나의 HTTP 요청입니다. 컨트롤러는 그대로이며, 클라이언트의 transport만 바뀝니다.

이는 지속적인 연결이 필요하지 않거나 불가능할 때 유용합니다:

- 서버 사이드 렌더링: 페이지의 각 요청이 수명이 짧은 자체 클라이언트로 렌더링되는 경우.
- HTTP 요청만 전달하는 서버리스 및 엣지 플랫폼.
- WebSocket 연결을 통과시키지 않는 프록시, 로드 밸런서, 방화벽.
- 디버깅: 모든 호출이 브라우저의 네트워크 탭에 표시되며 `curl`로 반복 실행할 수 있습니다.

호출은 여전히 완전히 타입이 지정됩니다. 파라미터와 결과는 TypeScript 타입에 따라 직렬화되므로 `Date`, `bigint`, `Map`, `Set`, `Uint8Array`, enum, union, 클래스가 원래의 형태 그대로 도착하며, 서버는 모든 파라미터를 검증합니다.

## 서버

Deepkit 앱에서는 `FrameworkModule`의 `httpRpcBasePath`를 설정합니다. 그러면 모든 RPC 컨트롤러가 WebSocket에 더해 해당 경로 아래에서도 사용 가능해집니다:

```typescript
import { App } from '@deepkit/app';
import { FrameworkModule } from '@deepkit/framework';
import { rpc } from '@deepkit/rpc';
import { MinLength } from '@deepkit/type';

class User {
    created: Date = new Date();

    constructor(public id: number, public name: string & MinLength<3>) {}
}

@rpc.controller('user')
class UserController {
    @rpc.action()
    add(a: number, b: number): number {
        return a + b;
    }

    @rpc.action()
    create(user: User): User {
        return user;
    }
}

new App({
    controllers: [UserController],
    imports: [new FrameworkModule({ httpRpcBasePath: 'api/v1' })],
}).run();
```

이제 action은 `/api/v1/user/add`와 `/api/v1/user/create`에서 접근할 수 있습니다.

## 클라이언트

`RpcClient`의 transport로 `RpcHttpClientAdapter`를 사용합니다. 나머지 API는 WebSocket과 동일합니다:

```typescript
import { RpcClient, RpcHttpClientAdapter } from '@deepkit/rpc';

const client = new RpcClient(new RpcHttpClientAdapter('https://example.com/api/v1'));
const user = client.controller<UserController>('user');

await user.add(2, 3); // 5
const created = await user.create(new User(1, 'Peter'));
created.created instanceof Date; // true
```

클라이언트는 action의 타입을 첫 호출 시 한 번 가져오고, 이를 사용해 파라미터를 직렬화하고 결과를 역직렬화합니다. WebSocket과 마찬가지로, 반환된 클래스는 서버가 설명하는 타입으로 구성된 클래스의 인스턴스입니다. 즉, 프로퍼티는 가지고 있지만 사용자 자신의 클래스의 메서드는 가지고 있지 않습니다.

의존성 주입을 사용하는 프론트엔드에서는 `createRpcHttpClientProvider`가 클라이언트를 제공합니다. 인자 없이 호출하면 페이지의 origin을 사용합니다:

```typescript
import { createRpcHttpClientProvider } from '@deepkit/rpc';

providers: [createRpcHttpClientProvider('https://example.com/api/v1')];
```

### 헤더와 HTTP 구현

`RpcHttpClientAdapter`의 두 번째 인자는 모든 요청과 함께 전송되는 헤더입니다. 세 번째 인자는 `fetch`를 대체합니다. 예를 들어 Angular의 `HttpClient`로 대체하면 서버 사이드 렌더링이 응답을 다시 요청하는 대신 브라우저로 전달할 수 있습니다:

```typescript
import { HttpClient } from '@angular/common/http';
import { firstValueFrom } from 'rxjs';
import { RpcClient, RpcHttpClientAdapter, RpcHttpInterface, RpcHttpResponseInterface } from '@deepkit/rpc';

class AngularHttp implements RpcHttpInterface {
    constructor(private http: HttpClient) {}

    async fetch(url: string, options: { headers: { [name: string]: string }; method: string; body?: string }): Promise<RpcHttpResponseInterface> {
        const res = await firstValueFrom(
            this.http.request(options.method, url, { body: options.body, headers: options.headers, observe: 'response', responseType: 'json' }),
        );
        const headers: { [name: string]: string } = {};
        for (const key of res.headers.keys()) headers[key] = String(res.headers.get(key));
        return { status: res.status, headers, body: res.body };
    }
}

const client = new RpcClient(new RpcHttpClientAdapter('api/v1', {}, new AngularHttp(httpClient)));
```

Angular의 transfer cache를 사용하는 경우, 에러를 표시하는 헤더인 `RpcHttpHeaderNames`를 포함시켜 에러 응답이 브라우저에서도 여전히 에러로 처리되도록 하세요:

```typescript
import { RpcHttpHeaderNames } from '@deepkit/rpc';

provideClientHydration(withHttpTransferCacheOptions({ includeHeaders: RpcHttpHeaderNames, includePostRequests: true }));
```

## 인증

클라이언트에 설정된 토큰은 모든 요청과 함께 `Authorization` 헤더로 전송됩니다:

```typescript
client.token.set('my-session-token');
```

서버는 각 요청을 `RpcKernelSecurity.authenticate`로 인증하며(실패 시 `Authentication failed`로 응답하고, 그 이유는 서버에 로그로 기록됩니다), `hasControllerAccess`가 다른 연결과 마찬가지로 접근 여부를 결정합니다. 토큰이 전달되기 전에 앞부분의 `Bearer `는 제거됩니다. 세션은 action 내에서 `SessionState`를 통해 사용할 수 있으며, `rpc` scope의 모든 provider를 주입할 수 있습니다:

```typescript
import { RpcKernelSecurity, Session, SessionState, rpc } from '@deepkit/rpc';

class AppSecurity extends RpcKernelSecurity {
    async authenticate(token: any): Promise<Session> {
        const user = await findUserByToken(token);
        if (!user) throw new Error('Invalid token');
        return new Session(user.name, token);
    }
}

@rpc.controller('user')
class UserController {
    constructor(private session: SessionState) {}

    @rpc.action()
    whoami(): string {
        return this.session.getSession().username;
    }
}

new App({
    controllers: [UserController],
    providers: [{ provide: RpcKernelSecurity, useClass: AppSecurity, scope: 'rpc' }],
    imports: [new FrameworkModule({ httpRpcBasePath: 'api/v1' })],
});
```

헤더이기 때문에 토큰은 문자열이어야 합니다. 토큰이 없는 클라이언트는 익명입니다.

## 요청

프로토콜은 Deepkit 클라이언트 없이도 호출할 수 있을 만큼 단순합니다:

| 요청                                          | 동작                                                                           |
| --------------------------------------------- | ------------------------------------------------------------------------------ |
| `GET /api/v1/user/add?arg=2&arg=3`            | `add(2, 3)`을 호출합니다. 모든 파라미터가 원시 값일 때 클라이언트가 사용합니다. |
| `POST /api/v1/user/create` with `[{...}]`     | JSON 배열을 파라미터로 하여 `create(...)`를 호출합니다.                        |
| `GET /api/v1/user/create.type`                | 파라미터와 결과의 타입으로, 클라이언트가 한 번 로드합니다.                     |

```bash
curl 'https://example.com/api/v1/user/add?arg=2&arg=3'
# 5

curl -X POST -H 'Content-Type: application/json' \
  -d '[{"id": 1, "name": "Peter"}]' https://example.com/api/v1/user/create
# {"created":"2026-01-02T03:04:05.000Z","id":1,"name":"Peter"}
```

쿼리 파라미터는 파라미터의 타입으로 변환되므로, `number` 파라미터의 경우 `?arg=2`는 숫자 `2`가 됩니다. 응답은 JSON으로 직렬화된 결과이며, 예를 들어 `Date`는 ISO 문자열, `bigint`는 문자열이 됩니다.

검증 실패를 포함한 에러는 `X-Rpc-Error` 헤더와 함께 에러를 body로 하여 응답됩니다. 클라이언트는 이를 다시 throw하며, 해당 클래스가 등록되어 있으면 그 클래스로 throw합니다([에러](./errors) 참조):

```json
{
    "classType": "@error:validation",
    "properties": {
        "name": "ValidationError",
        "errors": [{ "path": "user.name", "code": "minLength", "message": "Min length is 3", "value": "ab" }]
    }
}
```

## 제한 사항

모든 호출은 각각 독립된 요청이며, 응답은 하나의 값입니다. 연결이 필요한 모든 기능은 WebSocket 또는 TCP에서만 사용할 수 있습니다:

- `Observable`, `Subject`, `BehaviorSubject`, `ProgressTracker` 또는 `Collection`을 반환하는 action. HTTP에서는 이를 알리는 에러와 함께 실패합니다.
- 업로드 및 다운로드 진행 상황, 그리고 back controller(서버가 클라이언트를 호출하는 것).
- Peer-to-peer 메시지와 entity patch.

또한 각 호출은 전체 HTTP 요청 비용이 들기 때문에, 기존 WebSocket 또는 TCP 연결을 통한 호출보다 느립니다. 연속된 많은 호출이나 실시간 데이터에는 WebSocket을 사용하세요.

HTTP에서 `bigint`는 크기 제한이 없습니다. WebSocket과 TCP에서 일반 `bigint`는 64비트 정수이므로, 더 큰 값에는 `BinaryBigInt`를 사용하세요.
