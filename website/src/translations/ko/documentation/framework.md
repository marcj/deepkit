# TypeScript 백엔드 프레임워크

Deepkit Framework는 하나의 타입이 validator, JSON 형식, 데이터베이스 스키마, API 문서의 역할을 모두 하는 TypeScript 백엔드 프레임워크입니다. HTTP 및 RPC 서버, ORM, 의존성 주입, CLI, 구성을 하나의 애플리케이션에 제공합니다.

```typescript
//app.ts
import { App } from '@deepkit/app';
import { FrameworkModule } from '@deepkit/framework';
import { http, HttpBody } from '@deepkit/http';
import { Logger } from '@deepkit/logger';
import { Email, MinLength } from '@deepkit/type';

interface CreateUser {
    username: string & MinLength<3>;
    email: string & Email;
}

class UserService {
    constructor(private logger: Logger) {}

    create(input: CreateUser) {
        this.logger.log(`New user ${input.username}`);
        return { id: 1, ...input };
    }
}

class UserController {
    constructor(private users: UserService) {}

    @http.POST('/users')
    create(body: HttpBody<CreateUser>) {
        return this.users.create(body);
    }
}

new App({
    controllers: [UserController],
    providers: [UserService],
    imports: [new FrameworkModule()],
}).run();
```

```sh
$ ts-node app.ts server:start

$ curl -X POST localhost:8080/users -H 'content-type: application/json' \
    -d '{"username":"Peter","email":"peter@example.com"}'
{"id":1,"username":"Peter","email":"peter@example.com"}

$ curl -X POST localhost:8080/users -H 'content-type: application/json' \
    -d '{"username":"ab","email":"nope"}'
HTTP/1.1 400 Bad Request
{
  "message": "Validation error: ...",
  "errors": [
    {
      "path": "username",
      "code": "minLength",
      "message": "Min length is 3",
      "value": "ab"
    },
    ...
  ]
}
```

요청 본문은 Method가 실행되기 전에 `CreateUser` Interface를 기준으로 검증되며, `UserService`는 타입을 통해 주입됩니다. 새 프로젝트는 `npm init @deepkit/app@latest my-app`으로 시작할 수 있습니다.

## NestJS 및 Express와의 비교

|                      | Deepkit Framework              | NestJS                                 | Express 또는 Fastify      |
| -------------------- | ------------------------------ | -------------------------------------- | ------------------------- |
| 요청 검증            | TypeScript 타입 기반           | 데코레이터를 적용한 Class와 validator pipe | 직접 추가                 |
| 의존성 주입          | 내장, 데코레이터 불필요        | 내장, `@Injectable()` 사용             | 직접 추가                 |
| ORM                  | 내장                           | 직접 추가                              | 직접 추가                 |
| RPC                  | 내장                           | transport를 통해 추가                  | 직접 추가                 |
| 빌드 단계            | Deepkit 타입 컴파일러          | TypeScript 컴파일러                    | 선택 사항                 |

Deepkit은 런타임에 타입을 읽기 때문에 빌드 과정에 [타입 컴파일러](./runtime-types/getting-started.md)가 필요합니다. Express와 NestJS는 생태계가 훨씬 크며, 경우에 따라 이 점이 내장 기능보다 더 중요할 수 있습니다. 성능 수치는 [벤치마크 페이지](/benchmarks)에서 확인할 수 있습니다.

## 프레임워크 구성 요소

Deepkit Framework는 `@deepkit/app`의 [Deepkit App](./app.md)을 기반으로 하며, 애플리케이션에서 import할 수 있는 `FrameworkModule` 모듈을 `@deepkit/framework`에서 제공합니다.

`App` 추상화는 다음을 제공합니다:

- CLI 명령어
- 구성 로딩(환경 변수, dotfile, 사용자 정의)
- 모듈 시스템
- 강력한 Service Container
- 컨트롤러, 프로바이더, 리스너 등을 위한 레지스트리와 훅

`FrameworkModule` 모듈은 다음과 같은 추가 기능을 제공합니다:

- 애플리케이션 서버
    - HTTP 서버
    - RPC 서버
    - 멀티 프로세스 로드 밸런싱
    - SSL
- 디버깅 CLI 명령어
- 데이터베이스 마이그레이션 구성/명령어
- `{debug: true}` 옵션으로 사용하는 디버깅/프로파일러 GUI
- 대화형 API 문서(Swagger와 유사)
- DatabaseRegistry, ProcessLocking, Broker, Sessions용 프로바이더
- 통합 테스트 API

`FrameworkModule`을 사용하거나 사용하지 않고 애플리케이션을 작성할 수 있습니다.

## 설치

Deepkit Framework는 [Deepkit App](./app.md)을 기반으로 합니다. 먼저 해당 설치 안내를 따랐는지 확인하세요.
완료했다면 Deepkit Framework를 설치하고 `App`에서 `FrameworkModule`을 import할 수 있습니다.

```sh
npm install @deepkit/framework
```

```typescript
import { App } from '@deepkit/app';
import { FrameworkModule } from '@deepkit/framework';
import { Logger } from '@deepkit/logger';

const app = new App({
    imports: [new FrameworkModule({ debug: true })]
});

app.command('test', (logger: Logger) => {
    logger.log('Hello World!');
});

app.run();
```

이제 앱이 `FrameworkModule`을 import하므로 주제별로 그룹화된 더 많은 명령어를 사용할 수 있습니다.

그중 하나인 `server:start`는 HTTP 서버를 시작합니다. 이 명령어를 사용하려면 HTTP 라우트를 하나 이상 등록해야 합니다.

```typescript
import { App } from '@deepkit/app';
import { FrameworkModule } from '@deepkit/framework';
import { HttpRouterRegistry } from '@deepkit/http';
import { Logger } from '@deepkit/logger';

const app = new App({
    imports: [new FrameworkModule({ debug: true })]
});

app.command('test', (logger: Logger) => {
    logger.log('Hello World!');
});


const router = app.get(HttpRouterRegistry);

router.get('/', () => {
    return 'Hello World';
})

app.run();
```

`server:start` 명령어를 다시 실행하면 HTTP 서버가 시작되고 `/` 라우트를 사용할 수 있는 것을 확인할 수 있습니다.

```sh
$ ts-node app.ts server:start
```

```sh
$ curl http://localhost:8080/
Hello World
```

요청을 처리하는 방법은 [HTTP](http.md) 또는 [RPC](rpc.md) 챕터를 참고하세요. CLI 명령어에 대한 자세한 내용은 [App](app.md) 챕터에서 확인할 수 있습니다.

## App

`App` Class는 애플리케이션의 주요 진입점입니다. 모든 모듈과 구성을 로드하고 애플리케이션을 시작하는 역할을 합니다.
또한 모든 CLI 명령어를 로드하고 실행하는 역할도 합니다. FrameworkModule과 같은 모듈은 추가 명령어를 제공하고, 이벤트 리스너를 등록하며,
HTTP/RPC용 컨트롤러, 서비스 프로바이더 등을 제공합니다.

이 `app` 객체를 사용하면 CLI 컨트롤러를 실행하지 않고도 Dependency Injection 컨테이너에 접근할 수 있습니다.

```typescript
const app = new App({
    imports: [new FrameworkModule]
});

//등록된 모든 서비스에 접근
const eventDispatcher = app.get(EventDispatcher);
```

`FrameworkModule`이 Logger, ApplicationServer 및 [그 밖의 많은 서비스](https://github.com/deepkit/deepkit-framework/blob/master/packages/framework/src/module.ts)와 마찬가지로 `EventDispatcher`를 서비스 프로바이더로 등록하므로 이를 가져올 수 있습니다.

직접 작성한 서비스를 등록할 수도 있습니다.

```typescript

class MyService {
    constructor(private logger: Logger) {
    }

    helloWorld() {
        this.logger.log('Hello World');
    }
}

const app = new App({
    providers: [MyService],
    imports: [new FrameworkModule]
});

const service = app.get(MyService);

service.helloWorld();
```

### 디버거

애플리케이션과 모든 모듈의 구성 값은 디버거에서 확인할 수 있습니다. `FrameworkModule`에서 debug 옵션을 활성화하고 `http://localhost:8080/_debug/configuration`을 여세요.

```typescript
import { App } from '@deepkit/app';
import { FrameworkModule } from '@deepkit/framework';

new App({
    imports: [
        new FrameworkModule({
            debug: true,
        })
    ]
}).run();
```

![디버거 구성](/assets/documentation/framework/debugger-configuration.png)

`ts-node app.ts debug:config`를 사용하면 사용 가능한 모든 구성 옵션과 현재 값, 기본값, 설명, 데이터 타입을 표시할 수도 있습니다.

## 이벤트

Deepkit Framework에는 이벤트 리스너를 등록할 수 있는 다양한 이벤트 토큰이 포함되어 있습니다.

이벤트의 동작 방식에 대한 자세한 내용은 [이벤트](./app/events.md) 챕터를 참고하세요.

### 이벤트 디스패치

이벤트는 `EventDispatcher` Class를 통해 전송됩니다. Deepkit 앱에서는 의존성 주입을 통해 이를 제공받을 수 있습니다.

```typescript
import { cli, Command } from '@deepkit/app';
import { BaseEvent, EventDispatcher, EventToken } from '@deepkit/event';

class UserEvent extends BaseEvent {
    constructor(public user: { username: string }) {
        super();
    }
}

const UserAdded = new EventToken<UserEvent>('user.added');

@cli.controller('test')
export class TestCommand implements Command {
    constructor(protected eventDispatcher: EventDispatcher) {
    }

    async execute() {
        const event = new UserEvent({ username: 'Peter' });
        await this.eventDispatcher.dispatch(UserAdded, event);
    }
}
```
