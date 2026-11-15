# 시작하기

Deepkit HTTP는 Runtime Types를 기반으로 하므로, Runtime Types가 이미 올바르게 설치되어 있어야 합니다. [Runtime Type 설치](../runtime-types/getting-started.md)를 참조하세요.

설치가 성공적으로 완료되었다면, `@deepkit/app`을 설치하거나 내부적으로 이미 이 라이브러리를 사용하는 Deepkit framework를 설치할 수 있습니다.

```sh
npm install @deepkit/http
```

controller API용 `@deepkit/http`는 TypeScript annotation을 기반으로 하므로, controller API를 사용하는 경우 `experimentalDecorators`로 이 기능을 활성화해야 합니다.
Class를 사용하지 않는다면 이 기능을 활성화할 필요가 없습니다.

_파일: tsconfig.json_

```json
{
  "compilerOptions": {
    "module": "CommonJS",
    "target": "es6",
    "moduleResolution": "node",
    "experimentalDecorators": true
  },
  "reflection": true
}
```

라이브러리가 설치되면 해당 API를 바로 사용할 수 있습니다.

## Functional API

Functional API는 Function을 기반으로 하며, 앱의 DI container를 통해 얻을 수 있는 router registry를 통해 등록할 수 있습니다.

```typescript
import { App } from '@deepkit/app';
import { FrameworkModule } from '@deepkit/framework';
import { HttpRouterRegistry } from '@deepkit/http';

const app = new App({
    imports: [new FrameworkModule]
});

const router = app.get(HttpRouterRegistry);

router.get('/', () => {
    return "Hello World!";
});

app.run();
```

모듈을 사용하는 경우, functional route를 모듈에서 동적으로 제공할 수도 있습니다.

```typescript
import { App, createModuleClass } from '@deepkit/app';
import { FrameworkModule } from '@deepkit/framework';
import { HttpRouterRegistry } from '@deepkit/http';

class MyModule extends createModuleClass({}) {
  override process() {
    this.configureProvider<HttpRouterRegistry>(router => {
      router.get('/', () => {
        return "Hello World!";
      });
    });
  }
}

const app = new App({
  imports: [new FrameworkModule, new MyModule]
});
```

App Module에 대해 더 알아보려면 [Framework Modules](../app/modules)를 참조하세요.

## Controller API

Controller API는 Class를 기반으로 하며, App-API의 `controllers` 옵션을 통해 등록할 수 있습니다.

```typescript
import { App } from '@deepkit/app';
import { FrameworkModule } from '@deepkit/framework';
import { http } from '@deepkit/http';

class MyPage {
    @http.GET('/')
    helloWorld() {
        return "Hello World!";
    }
}

new App({
    controllers: [MyPage],
    imports: [new FrameworkModule]
}).run();
```

모듈을 사용하는 경우, controller를 모듈에서 제공할 수도 있습니다.

```typescript
import { App, createModuleClass } from '@deepkit/app';
import { FrameworkModule } from '@deepkit/framework';
import { http } from '@deepkit/http';

class MyPage {
  @http.GET('/')
  helloWorld() {
    return "Hello World!";
  }
}

class MyModule extends createModuleClass({}) {
  override process() {
    this.addController(MyPage);
  }
}

const app = new App({
  imports: [new FrameworkModule, new MyModule]
});
```

controller를 동적으로 제공하려면(예를 들어 설정 옵션에 따라) `process` hook을 사용할 수 있습니다.

```typescript
class MyModuleConfiguration {
    debug: boolean = false;
}

class MyModule extends createModuleClass({
    config: MyModuleConfiguration
}) {
    override process() {
        if (this.config.debug) {
            class DebugController {
                @http.GET('/debug/')
                root() {
                    return 'Hello Debugger';
                }
            }
            this.addController(DebugController);
        }
    }
}
```

App Module에 대해 더 알아보려면 [Framework Modules](../app/modules)를 참조하세요.

## HTTP 서버

Deepkit Framework를 사용하는 경우 HTTP 서버가 이미 내장되어 있습니다. 하지만 HTTP 라이브러리는 Deepkit framework 없이 자체 HTTP 서버와 함께 사용할 수도 있으며, Express 내부, `Bun.serve`, `Deno.serve`, Cloudflare Workers 또는 AWS Lambda에서도 사용할 수 있습니다.

```typescript
import { createServer } from 'http';
import { HttpKernel, HttpRequest, HttpResponse } from '@deepkit/http';

const app = new App({
    controllers: [MyPage],
    imports: [new HttpModule]
});

const httpKernel = app.get(HttpKernel);

createServer(
    { IncomingMessage: HttpRequest, ServerResponse: HttpResponse as any },
    (req, res) => httpKernel.handleRequestMaybeSync(req, res),
).listen(8080, () => {
    console.log('listen at 8080');
});
```

HTTP kernel을 실행하는 모든 방법은 [서버 & 런타임](./runtimes.md)을 참조하세요.

## HTTP 클라이언트

Deepkit HTTP는 특별한 클라이언트가 필요하지 않습니다. 브라우저, Node.js, Bun, Deno에서 사용할 수 있는 `fetch` API 등 어떤 HTTP 클라이언트든 사용할 수 있습니다.

JSON 응답에는 JSON 타입만 포함되므로, `Date`는 문자열로 전달되며 데이터의 형태를 보장하는 것은 없습니다. 서버와 클라이언트 간에 타입을 공유한다면, `@deepkit/type`이 서버가 사용하는 것과 동일한 타입으로 응답을 변환하고 검증합니다.

```typescript
import { cast } from '@deepkit/type';

interface User {
    id: number;
    username: string;
    created: Date;
}

const response = await fetch('http://localhost:8080/user/1');
if (!response.ok) throw new Error(`Request failed with status ${response.status}`);

// "created"를 ISO 문자열에서 Date로 변환하고 결과를 검증합니다.
// 데이터가 User와 일치하지 않으면 ValidationError를 throw합니다.
const user = cast<User>(await response.json());
```

필요에 따라 사용할 수 있는 몇 가지 Function이 있습니다:

| Function               | 설명                                                                                                  |
|------------------------|--------------------------------------------------------------------------------------------------------------|
| `cast<T>(data)`        | 데이터를 변환하고(예: ISO 문자열을 `Date`로, `'2'`를 `2`로) 검증합니다. 유효하지 않으면 `ValidationError`를 throw합니다. |
| `deserialize<T>(data)` | 데이터를 검증하지 않고 변환합니다. 신뢰할 수 있는 소스에만 사용하세요.                                    |
| `is<T>(data)`          | Type guard입니다. 데이터를 변환하지 않고, 데이터가 이미 타입과 일치하면 `true`를 반환합니다.                      |
| `assert<T>(data)`      | `is`와 비슷하지만, `false`를 반환하는 대신 `ValidationError`를 throw합니다.                                      |
| `validate<T>(data)`    | `ValidationErrorItem`의 배열을 반환하며, 데이터가 유효하면 빈 배열을 반환합니다.                                       |

동일한 타입을 사용하여 요청 body를 전송하기 전에 검사할 수도 있습니다. 예를 들어 폼에서 오류를 미리 보여줄 때 유용합니다. 서버는 어차피 body를 검증합니다([입력 & 출력](./input-output.md) 참조).

```typescript
import { MinLength, validate } from '@deepkit/type';

interface CreateUser {
    username: string & MinLength<3>;
}

const body: CreateUser = { username: 'Pe' };
const errors = validate<CreateUser>(body);
if (errors.length) {
    // [{ path: 'username', code: 'minLength', message: 'Min length is 3', ... }]
} else {
    await fetch('http://localhost:8080/user', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
    });
}
```

서버가 유효하지 않은 입력 때문에 요청을 거부하면, 상태 코드 400과 함께 JSON body `{ message: string, errors: { path, code, message }[] }`로 응답합니다.

자세한 내용은 [Serialization](../runtime-types/serialization.md)과 [Validation](../runtime-types/validation.md)을 참조하세요.

## Route 이름

Route에는 forwarding 시 참조할 수 있는 고유한 이름을 지정할 수 있습니다. API에 따라 이름을 정의하는 방법이 다릅니다.

```typescript
//functional API
router.get({
    path: '/user/:id',
    name: 'userDetail'
}, (id: number) => {
    return {userId: id};
});

//controller API
class UserController {
    @http.GET('/user/:id').name('userDetail')
    userDetail(id: number) {
        return {userId: id};
    }
}
```

이름이 있는 모든 route는 `Router.resolveUrl()`을 통해 URL을 얻을 수 있습니다.

```typescript
import { HttpRouter } from '@deepkit/http';
const router = app.get(HttpRouter);
router.resolveUrl('userDetail', {id: 2}); //=> '/user/2'
```

## 보안

## 세션
