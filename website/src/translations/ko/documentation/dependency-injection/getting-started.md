# 시작하기

Deepkit의 Dependency Injection은 Runtime Types에 기반하므로, Runtime Types가 이미 올바르게 설치되어 있어야 합니다. [런타임 타입](../runtime-types/getting-started.md)을 참고하세요.

이 작업이 완료되면, `@deepkit/injector`를 설치하거나, 이미 해당 라이브러리를 내부적으로 사용하는 Deepkit 프레임워크를 사용할 수 있습니다.

```sh
	npm install @deepkit/injector
```

라이브러리가 설치되면, 해당 API를 바로 사용할 수 있습니다.


## 사용법

Dependency Injection을 사용하는 방법은 세 가지가 있습니다.

* Injector API (저수준)
* Module API
* App API (Deepkit 프레임워크)

Deepkit 프레임워크 없이 `@deepkit/injector`를 사용하려면, 앞의 두 가지 방식을 권장합니다.

### Injector API

Injector API는 [Dependency Injection 소개](../dependency-injection)에서 이미 다루었습니다. 단일 Class `InjectorContext`로 하나의 DI 컨테이너를 생성하는 매우 간단한 사용 방식이 특징이며, 모듈이 없는 더 단순한 애플리케이션에 특히 적합합니다.

```typescript
import { InjectorContext } from '@deepkit/injector';

const injector = InjectorContext.forProviders([
    UserRepository,
    HttpClient,
]);

const repository = injector.get(UserRepository);
```

이 경우의 `injector` 객체는 Dependency Injection 컨테이너입니다. `InjectorContext.forProviders` Function은 Provider 배열을 받습니다. 어떤 값을 전달할 수 있는지는 [Dependency Injection Providers](providers.md) 섹션을 참고하세요.

### Module API

더 복잡한 API로 `InjectorModule` Class가 있으며, Provider들을 서로 다른 모듈에 저장하여 모듈별로 캡슐화된 DI 컨테이너를 여러 개 만들 수 있습니다. 또한 모듈별로 configuration Class를 사용할 수 있어, 자동으로 검증된 configuration 값을 Provider에 쉽게 제공할 수 있습니다. 모듈들은 서로를 import하고, Provider를 export하여 계층을 구축하고 깔끔하게 분리된 아키텍처를 만들 수 있습니다.

애플리케이션이 더 복잡하고 Deepkit 프레임워크를 사용하지 않는 경우 이 API를 사용하는 것이 좋습니다.

```typescript
import { InjectorModule, InjectorContext } from '@deepkit/injector';

const lowLevelModule = new InjectorModule([HttpClient])
     .addExport(HttpClient);

const rootModule = new InjectorModule([UserRepository])
     .addImport(lowLevelModule);

const injector = new InjectorContext(rootModule);
```

이 경우의 `injector` 객체는 Dependency Injection 컨테이너입니다. Provider는 여러 모듈로 나눌 수 있고, 모듈 import를 통해 다양한 위치에서 다시 가져올 수 있습니다. 이는 애플리케이션 또는 아키텍처의 계층을 반영하는 자연스러운 계층 구조를 만듭니다.
InjectorContext에는 항상 계층의 최상위 모듈(루트 모듈 또는 앱 모듈)을 전달해야 합니다. 이후 InjectorContext는 중개 역할만 하며, `injector.get()` 호출은 단순히 루트 모듈로 전달됩니다. 다만, 두 번째 인자로 모듈을 전달하면 루트가 아닌 모듈의 Provider도 가져올 수 있습니다.

```typescript
const repository = injector.get(UserRepository);

const httpClient = injector.get(HttpClient, lowLevelModule);
```

루트가 아닌 모든 모듈은 기본적으로 캡슐화되어, 해당 모듈의 모든 Provider는 그 모듈 내부에서만 사용할 수 있습니다. 다른 모듈에서도 사용하려면 해당 Provider를 export해야 합니다. export하면 Provider는 계층의 상위 모듈로 이동하며, 그 방식으로 사용할 수 있습니다.

모든 Provider를 기본적으로 최상위인 루트 모듈로 export하려면 `forRoot` 옵션을 사용할 수 있습니다. 이렇게 하면 모든 Provider를 다른 모든 모듈에서 사용할 수 있습니다.

```typescript
const lowLevelModule = new InjectorModule([HttpClient])
     .forRoot(); //모든 Provider를 루트로 export
```

### App API

Deepkit 프레임워크를 사용하면, 모듈은 `@deepkit/app` API로 정의합니다. 이는 Module API를 기반으로 하므로, 그 기능을 그대로 사용할 수 있습니다. 추가로 강력한 hook을 사용하고 configuration loader를 정의하여 더욱 동적인 아키텍처를 구성할 수 있습니다.

[프레임워크 모듈](../app/modules.md) 장에서 더 자세히 설명합니다.

```typescript
import { App } from '@deepkit/app';
import { FrameworkModule } from '@deepkit/framework';
import { HttpRouterRegistry, HttpBody } from '@deepkit/http';

interface User {
    username: string;
}

class Service {
    users: User[] = [];
}

const app = new App({
    providers: [Service],
    imports: [new FrameworkModule()],
});

const router = app.get(HttpRouterRegistry);

router.post('/users', (body: HttpBody<User>, service: Service) => {
    service.users.push(body);
});

router.get('/users', (service: Service): Users => {
    return service.users;
});
```