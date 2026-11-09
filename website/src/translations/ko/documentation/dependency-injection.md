# TypeScript Dependency Injection

Deepkit은 서비스에 decorator를 붙이지 않아도 동작하는 TypeScript용 dependency injection 컨테이너입니다. interface를 포함한 TypeScript 타입으로부터 constructor parameter를 resolve하므로, 코드에 컨테이너 전용 annotation이나 token을 넣을 필요가 없습니다.

```typescript
import { InjectorContext } from '@deepkit/injector';

interface Mailer {
    send(to: string, text: string): void;
}

class SmtpMailer implements Mailer {
    send(to: string, text: string): void {
        console.log(`Sending "${text}" to ${to}`);
    }
}

class Signup {
    constructor(private mailer: Mailer) {}

    register(email: string): void {
        this.mailer.send(email, 'Welcome');
    }
}

const injector = InjectorContext.forProviders([Signup, SmtpMailer]);
injector.get(Signup).register('peter@example.com');
// Sending "Welcome" to peter@example.com
```

`Signup`은 `Mailer` interface에 의존하며, `SmtpMailer`가 해당 interface를 구현하고 있으므로 컨테이너가 이를 찾아냅니다. 예를 들어 테스트에서 다른 구현체를 사용하려면 `provide<Mailer>({ useClass: TestMailer })`로 명시적으로 제공하면 됩니다. 어떤 provider도 제공하지 않는 의존성은 정확한 위치와 함께 에러로 보고됩니다: `Undefined dependency "mailer: Mailer" of Signup(?). Type has no provider.`

## NestJS, InversifyJS, tsyringe와의 비교

|                         | Deepkit                 | NestJS                     | InversifyJS                 | tsyringe                    |
| ----------------------- | ----------------------- | -------------------------- | --------------------------- | --------------------------- |
| 서비스의 decorator      | 없음                    | `@Injectable()`            | `@injectable()`             | `@injectable()`             |
| interface에 의존하는 방법 | interface 타입          | Token과 `@Inject()`        | Token과 `@inject()`         | Token과 `@inject()`         |
| 타입 정보의 출처        | Deepkit type compiler   | `emitDecoratorMetadata`    | `emitDecoratorMetadata`     | `emitDecoratorMetadata`     |

Deepkit은 런타임에 타입을 읽기 때문에 빌드에 [Deepkit type compiler](./runtime-types/getting-started.md)가 필요합니다. 컨테이너가 의존성을 resolve하는 속도는 [벤치마크 페이지](/benchmarks)에서 확인할 수 있습니다. 설치 방법은 [시작하기](./dependency-injection/getting-started.md)를 참고하세요.

## Dependency Injection이란 무엇인가?

Dependency Injection(DI)은 클래스와 함수가 자신의 의존성을 _전달받는_ 디자인 패턴입니다. Inversion of Control(IoC) 원칙을 따르며, 복잡한 코드를 더 잘 분리하여 테스트 용이성, 모듈성, 명확성을 크게 향상시키는 데 도움이 됩니다. IoC 원칙을 적용하는 디자인 패턴에는 service locator 패턴과 같은 다른 패턴도 있지만, 특히 엔터프라이즈 소프트웨어에서는 DI가 지배적인 패턴으로 자리 잡았습니다.

IoC 원칙을 설명하기 위해 다음 예제를 살펴보겠습니다.

```typescript
import { HttpClient } from 'http-library';

class UserRepository {
    async getUsers(): Promise<Users> {
        const client = new HttpClient();
        return await client.get('/users');
    }
}
```

UserRepository 클래스는 HttpClient를 의존성으로 가지고 있습니다. 이 의존성 자체는 특별할 것이 없지만, `UserRepository`가 HttpClient를 직접 생성한다는 점이 문제입니다.
HttpClient의 생성을 UserRepository 안에 캡슐화하는 것이 좋은 생각처럼 보일 수 있지만, 실제로는 그렇지 않습니다. HttpClient를 교체하고 싶다면 어떻게 해야 할까요? 실제 HTTP 요청이 나가지 않도록 하면서 unit test로 UserRepository를 테스트하고 싶다면 어떻게 해야 할까요? 이 클래스가 HttpClient를 사용한다는 사실은 어떻게 알 수 있을까요?

## Inversion of Control

Inversion of Control(IoC)의 관점에서는 HttpClient를 constructor에서 명시적인 의존성으로 설정하는 다음과 같은 대안이 있습니다(constructor injection이라고도 합니다).

```typescript
class UserRepository {
    constructor(
        private http: HttpClient
    ) {}

    async getUsers(): Promise<Users> {
        return await this.http.get('/users');
    }
}
```

이제 HttpClient를 생성할 책임은 UserRepository가 아니라 UserRepository를 사용하는 쪽에 있습니다. 이것이 Inversion of Control(IoC)입니다. 제어가 뒤집힌, 즉 역전된 것입니다. 구체적으로 이 코드는 dependency injection을 적용하고 있는데, 의존성을 생성하거나 요청하지 않고 전달받기(주입받기) 때문입니다. Dependency Injection은 IoC의 한 가지 형태일 뿐입니다.

## Service Locator

DI 외에 Service Locator(SL)도 IoC 원칙을 적용하는 방법 중 하나입니다. 의존성을 전달받는 대신 요청하기 때문에 일반적으로 Dependency Injection의 반대 개념으로 여겨집니다. 위 코드에서 HttpClient를 다음과 같이 요청한다면 Service Locator 패턴이라고 부릅니다.

```typescript
class UserRepository {
    async getUsers(): Promise<Users> {
        const client = locator.getHttpClient();
        return await client.get('/users');
    }
}
```

`locator.getHttpClient` 함수의 이름은 무엇이든 될 수 있습니다. `useContext(HttpClient)`, `getHttpClient()`, `await import("client")`와 같은 함수 호출이나 `container.get(HttpClient)`, `container.http`와 같은 컨테이너 조회도 대안이 될 수 있습니다. 전역 객체를 import하는 것은 모듈 시스템 자체를 locator로 사용하는, service locator의 약간 다른 형태입니다.

```typescript
import { httpClient } from 'clients'

class UserRepository {
    async getUsers(): Promise<Users> {
        return await httpClient.get('/users');
    }
}
```

이 모든 형태의 공통점은 HttpClient 의존성을 명시적으로 요청하고, 코드가 service container의 존재를 알고 있다는 것입니다. 이는 코드를 프레임워크에 강하게 결합시키므로, 코드를 깔끔하게 유지하려면 피해야 합니다.

서비스 요청은 property의 기본값으로 이루어질 수 있을 뿐만 아니라 코드 중간 어딘가에서도 일어날 수 있습니다. 코드 중간에서 요청한다는 것은 타입 interface의 일부가 아니라는 뜻이므로 HttpClient의 사용이 숨겨집니다. HttpClient를 요청하는 방식에 따라서는 다른 구현체로 교체하는 것이 매우 어렵거나 아예 불가능할 수도 있습니다. 특히 unit test 영역과 코드의 명확성 측면에서 어려움이 발생할 수 있기 때문에, 오늘날 service locator는 특정 상황에서 anti-pattern으로 분류됩니다.

## Dependency Injection

Dependency Injection에서는 아무것도 요청하지 않으며, 사용하는 쪽에서 명시적으로 제공하거나 코드가 전달받습니다. 의존성을 사용하는 코드는 service container에 접근할 수 없고, `HttpClient`가 어떻게 생성되거나 조회되는지도 알지 못합니다. 핵심적으로 이 방식은 코드를 IoC 프레임워크로부터 분리하여 더 깔끔하게 만들어 줍니다.

코드는 단지 `HttpClient` 타입이 필요하다고 선언할 뿐입니다. Service Locator와 비교했을 때 Dependency Injection의 핵심적인 차별점이자 장점은, Dependency Injection을 사용하는 코드가 어떤 종류의 service container나 서비스 식별 시스템 없이도 완벽하게 동작한다는 것입니다(서비스에 이름을 붙일 필요가 없습니다). 이는 단순한 타입 선언이므로 IoC 프레임워크의 컨텍스트 밖에서도 동작합니다.

앞의 예제에서 볼 수 있듯이, 그곳에 이미 dependency injection 패턴이 적용되어 있습니다. 의존성이 constructor에 선언되어 있으므로 구체적으로는 constructor injection입니다. 따라서 이제 UserRepository는 다음과 같이 인스턴스화해야 합니다.

```typescript
const users = new UserRepository(new HttpClient());
```

UserRepository를 사용하려는 코드는 그 모든 의존성도 제공(주입)해야 합니다. HttpClient를 매번 새로 생성할지 동일한 것을 계속 사용할지는 이제 클래스 자신이 아니라 클래스를 사용하는 쪽에서 결정합니다. (클래스의 관점에서) service locator의 경우처럼 요청하지도 않고, 처음 예제처럼 스스로 전부 생성하지도 않습니다. 이러한 흐름의 역전에는 여러 가지 장점이 있습니다.

* 모든 의존성이 명시적으로 드러나므로 코드를 이해하기 쉽습니다.
* 모든 의존성이 고유하며 필요할 때 쉽게 변경할 수 있으므로 코드를 테스트하기 쉽습니다.
* 의존성을 쉽게 교체할 수 있으므로 코드의 모듈성이 높아집니다.
* UserRepository가 매우 복잡한 의존성을 직접 생성할 책임을 지지 않으므로 Separation of Concern 원칙을 촉진합니다.

하지만 명백한 단점도 바로 눈에 띕니다. HttpClient와 같은 모든 의존성을 정말로 직접 생성하거나 관리해야 할까요? 그렇기도 하고 아니기도 합니다. 의존성을 직접 관리하는 것이 전적으로 타당한 경우는 많습니다. 좋은 API의 특징은 의존성이 통제 불능으로 늘어나지 않고, 그런 상황에서도 사용하기 편하다는 것입니다. 많은 애플리케이션이나 복잡한 라이브러리에서는 실제로 그럴 수 있습니다. 의존성이 많은 매우 복잡한 저수준 API를 사용자에게 단순화된 형태로 제공할 때는 facade 패턴이 매우 적합합니다.

## Dependency Injection 컨테이너

그러나 더 복잡한 애플리케이션에서는 모든 의존성을 직접 관리할 필요가 없습니다. 바로 이를 위해 dependency injection 컨테이너가 존재하기 때문입니다. 컨테이너는 모든 객체를 자동으로 생성할 뿐만 아니라 의존성도 자동으로 "주입"하므로 수동으로 "new"를 호출할 필요가 없어집니다. 주입 방식에는 constructor injection, method injection, property injection 등 여러 가지가 있습니다. 이를 통해 의존성이 많은 복잡한 아키텍처도 쉽게 관리할 수 있습니다.

Deepkit은 `@deepkit/injector`를 통해, 또는 Deepkit Framework의 App 모듈에 이미 통합된 형태로 dependency injection 컨테이너(DI 컨테이너 또는 IoC 컨테이너라고도 합니다)를 제공합니다. 위 코드를 `@deepkit/injector` 패키지의 저수준 API로 작성하면 다음과 같습니다.

```typescript
import { InjectorContext } from '@deepkit/injector';

const injector = InjectorContext.forProviders(
    [UserRepository, HttpClient]
);

const userRepo = injector.get(UserRepository);

const users = await userRepo.getUsers();
```

이 경우 `injector` 객체가 dependency injection 컨테이너입니다. "new UserRepository"를 사용하는 대신, 컨테이너가 `get(UserRepository)`를 통해 UserRepository의 인스턴스를 반환합니다. 컨테이너를 정적으로 초기화하기 위해 `InjectorContext.forProviders` 함수에 provider 목록을 전달합니다(이 경우에는 단순히 클래스들입니다).
DI는 의존성을 제공하는 것이 전부이므로 컨테이너에 의존성을 제공하게 되며, 여기서 "provider"라는 기술 용어가 유래했습니다.

provider에는 ClassProvider, ValueProvider, ExistingProvider, FactoryProvider의 여러 유형이 있습니다. 이들을 모두 함께 사용하면 매우 유연한 아키텍처를 DI 컨테이너로 구성할 수 있습니다.

provider 간의 모든 의존성은 자동으로 resolve되며, `injector.get()` 호출이 발생하는 즉시 객체와 의존성이 생성되고 캐시됩니다. 그리고 constructor argument로 전달되거나(constructor injection), property로 설정되거나(property injection), method 호출에 전달되는(method injection) 방식으로 올바르게 주입됩니다.

이제 HttpClient를 다른 것으로 교체하려면 HttpClient에 대해 다른 provider(여기서는 ValueProvider)를 정의하면 됩니다.

```typescript
const injector = InjectorContext.forProviders([
    UserRepository,
    {provide: HttpClient, useValue: new AnotherHttpClient()},
]);
```

`injector.get(UserRepository)`로 UserRepository를 요청하면 AnotherHttpClient 객체를 전달받습니다. 또는 여기에 ClassProvider를 사용하면 AnotherHttpClient의 모든 의존성도 DI 컨테이너가 관리하게 할 수 있습니다.

```typescript
const injector = InjectorContext.forProviders([
    UserRepository,
    {provide: HttpClient, useClass: AnotherHttpClient},
]);
```

모든 provider 유형은 [Dependency Injection Provider](./dependency-injection/providers.md) 섹션에 나열되어 설명되어 있습니다.

여기서 언급해 둘 점은 Deepkit의 DI 컨테이너가 Deepkit의 런타임 타입에서만 동작한다는 것입니다. 즉, 클래스, 타입, interface, 함수를 포함하는 모든 코드는 런타임에 타입 정보를 사용할 수 있도록 Deepkit Type Compiler로 컴파일되어야 합니다. [런타임 타입](./runtime-types.md) 챕터를 참고하세요.

## Dependency Inversion

앞의 UserRepository 예제는 UserRepository가 더 낮은 수준의 HTTP 라이브러리에 의존하고 있음을 보여 줍니다. 또한 추상화(interface) 대신 구체적인 구현체(class)가 의존성으로 선언되어 있습니다. 언뜻 보면 객체 지향 패러다임에 부합하는 것처럼 보일 수 있지만, 특히 복잡하고 큰 아키텍처에서는 문제로 이어질 수 있습니다.

대안은 HttpClient 의존성을 추상화(interface)로 변환하여 UserRepository에 HTTP 라이브러리의 코드를 import하지 않는 것입니다.

```typescript
interface HttpClientInterface {
   get(path: string): Promise<any>;
}

class UserRepository {
    constructor(
        private http: HttpClientInterface
    ) {}

    async getUsers(): Promise<Users> {
        return await this.http.get('/users');
    }
}
```

이를 dependency inversion 원칙이라고 합니다. UserRepository는 더 이상 HTTP 라이브러리에 직접 의존하지 않고 추상화(interface)에 기반합니다. 이로써 이 원칙의 두 가지 근본적인 목표를 달성합니다.

* 고수준 모듈은 저수준 모듈에서 아무것도 import해서는 안 됩니다.
* 구현은 추상화(interface)에 기반해야 합니다.

이제 두 구현(UserRepository와 HTTP 라이브러리)을 DI 컨테이너를 통해 결합할 수 있습니다.

```typescript
import { InjectorContext } from '@deepkit/injector';
import { HttpClient } from './http-client';
import { UserRepository } from './user-repository';

const injector = InjectorContext.forProviders([
    UserRepository,
    HttpClient,
]);
```

Deepkit의 DI 컨테이너는 이 HttpClientInterface와 같은 추상 의존성(interface)을 resolve할 수 있으므로, HttpClient가 `class HttpClient implements HttpClientInterface`로 선언되어 있기만 하면 UserRepository는 자동으로 HttpClient 구현체를 전달받습니다.

HttpClient가 해당 interface를 구현하지 않으면 DI 컨테이너는 에러를 발생시킵니다(`Undefined dependency "http: HttpClientInterface" of UserRepository(?). Type has no provider.`). 이 경우 두 구현을 결합하려는 사용자가 해결책을 찾아야 합니다. 예를 들어 HttpClientInterface를 구현하고 method 호출을 HttpClient로 올바르게 전달하는 adapter 클래스를 등록할 수 있습니다.

대안으로, HttpClientInterface에 구체적인 구현체를 직접 제공할 수도 있습니다.

```typescript
import { InjectorContext, provide } from '@deepkit/injector';
import { HttpClient } from './http-client';
import { UserRepository, HttpClientInterface } from './user-repository';

const injector = InjectorContext.forProviders([
    UserRepository,
    provide<HttpClientInterface>({useClass: HttpClient}),
]);
```

여기서 유의할 점은 dependency inversion 원칙이 이론적으로는 장점이 있지만 실제로는 상당한 단점도 있다는 것입니다. 작성해야 할 interface가 늘어나므로 코드가 많아질 뿐만 아니라, 각 구현체가 의존성마다 interface를 가지게 되므로 복잡성도 증가합니다. 이러한 대가는 애플리케이션이 일정 규모에 도달하여 이러한 유연성이 필요할 때에만 치를 가치가 있습니다. 다른 모든 디자인 패턴 및 원칙과 마찬가지로 이 원칙에도 비용 대비 효용이 있으므로, 적용하기 전에 충분히 고민해야 합니다.

디자인 패턴은 아주 단순한 코드에까지 맹목적으로 일괄 적용해서는 안 됩니다. 하지만 복잡한 아키텍처, 대규모 애플리케이션, 확장 중인 팀과 같은 전제 조건이 갖춰져 있다면 dependency inversion과 다른 디자인 패턴은 비로소 진정한 힘을 발휘합니다.
