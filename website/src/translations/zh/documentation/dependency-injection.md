# TypeScript 依赖注入

Deepkit 是一个面向 TypeScript 的依赖注入容器，无需在服务上使用装饰器。它根据 TypeScript 类型（包括 interface）解析构造函数参数，因此你的代码不会掺杂容器专用的注解和 token。

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

`Signup` 依赖 `Mailer` interface，而容器能找到 `SmtpMailer`，因为它实现了该 interface。若要使用其他实现（例如在测试中），可通过 `provide<Mailer>({ useClass: TestMailer })` 显式提供。如果某个依赖没有任何 provider 提供，就会报错，并指出其确切位置：`Undefined dependency "mailer: Mailer" of Signup(?). Type has no provider.`

## 与 NestJS、InversifyJS 和 tsyringe 的比较

|                         | Deepkit                 | NestJS                     | InversifyJS                 | tsyringe                    |
| ----------------------- | ----------------------- | -------------------------- | --------------------------- | --------------------------- |
| 服务上的装饰器          | 无                      | `@Injectable()`            | `@injectable()`             | `@injectable()`             |
| 依赖 interface 的方式   | interface 类型          | Token 和 `@Inject()`       | Token 和 `@inject()`        | Token 和 `@inject()`        |
| 类型信息来源            | Deepkit 类型编译器      | `emitDecoratorMetadata`    | `emitDecoratorMetadata`     | `emitDecoratorMetadata`     |

Deepkit 需要在构建流程中使用 [Deepkit 类型编译器](./runtime-types/getting-started.md)，因为它要在运行时读取你的类型。容器解析依赖的速度列在[性能基准页面](/benchmarks)上。安装方法请参阅[入门指南](./dependency-injection/getting-started.md)。

## 什么是依赖注入？

依赖注入（Dependency Injection，DI）是一种设计模式，其中类和函数*接收*它们的依赖。它遵循控制反转（Inversion of Control，IoC）原则，有助于更好地拆分复杂代码，从而显著提升可测试性、模块化程度和清晰度。虽然还有其他可用于实践 IoC 原则的设计模式（例如 service locator 模式），但 DI 已成为主流模式，在企业级软件中尤其如此。

下面通过一个示例来说明 IoC 原则：

```typescript
import { HttpClient } from 'http-library';

class UserRepository {
    async getUsers(): Promise<Users> {
        const client = new HttpClient();
        return await client.get('/users');
    }
}
```

UserRepository 类依赖 HttpClient。这个依赖本身并没有什么特别之处，问题在于 `UserRepository` 自己创建了 HttpClient。
将 HttpClient 的创建过程封装在 UserRepository 中看似是个好主意，实则不然。如果我们想替换 HttpClient 该怎么办？如果我们想在单元测试中测试 UserRepository，又不允许发出真实的 HTTP 请求，该怎么办？我们又如何得知这个类使用了 HttpClient？

## 控制反转

按照控制反转（IoC）的思路，可以采用下面这种替代方案，将 HttpClient 设为构造函数中的显式依赖（也称为构造函数注入）。

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

现在，负责创建 HttpClient 的不再是 UserRepository，而是 UserRepository 的使用者。这就是控制反转（IoC）：控制权被反转了。具体来说，这段代码应用了依赖注入，因为依赖是被接收（注入）的，而不再是自行创建或主动请求的。依赖注入只是 IoC 的一种形式。

## Service Locator

除 DI 之外，Service Locator（SL）也是实践 IoC 原则的一种方式。它通常被视为依赖注入的对立面，因为它是主动请求依赖，而不是接收依赖。如果在上面的代码中按如下方式请求 HttpClient，就称为 Service Locator 模式。

```typescript
class UserRepository {
    async getUsers(): Promise<Users> {
        const client = locator.getHttpClient();
        return await client.get('/users');
    }
}
```

函数 `locator.getHttpClient` 可以使用任意名称。其他形式包括 `useContext(HttpClient)`、`getHttpClient()`、`await import("client")` 这样的函数调用，或 `container.get(HttpClient)`、`container.http` 这样的容器查询。导入全局对象是 service locator 的一种略有不同的形式，它将模块系统本身用作 locator：

```typescript
import { httpClient } from 'clients'

class UserRepository {
    async getUsers(): Promise<Users> {
        return await httpClient.get('/users');
    }
}
```

这些形式的共同点是：它们都显式请求 HttpClient 依赖，并且代码知道服务容器的存在。这会使你的代码与框架紧密耦合，而为了保持代码整洁，应当避免这种情况。

服务请求不仅可以作为 property 的默认值发生，也可以出现在代码中间的某个位置。由于出现在代码中间意味着它不属于类型接口的一部分，HttpClient 的使用便被隐藏了起来。根据请求 HttpClient 的具体方式，有时很难甚至完全无法将其替换为其他实现。尤其是在单元测试和代码清晰度方面，这可能带来困难，因此 service locator 如今在某些情况下被归为反模式。

## 依赖注入

使用依赖注入时，代码不会主动请求任何东西，依赖由使用者显式提供，代码只负责接收。消费方无法访问任何服务容器，也不知道 `HttpClient` 是如何创建或获取的。其核心在于让你的代码与 IoC 框架解耦，从而更加整洁。

它只是声明自己需要一个 `HttpClient` 类型。依赖注入相对于 Service Locator 的一个关键区别和优势在于：使用依赖注入的代码即使没有任何服务容器和服务标识系统（你无需为服务命名），也能完全正常工作。它只是一个类型声明，在 IoC 框架的上下文之外同样有效。

如前面的示例所示，那里已经应用了依赖注入模式。具体来说，那是构造函数注入，因为依赖是在构造函数中声明的。因此，现在必须按如下方式实例化 UserRepository。

```typescript
const users = new UserRepository(new HttpClient());
```

想要使用 UserRepository 的代码也必须提供（注入）它的所有依赖。是每次创建新的 HttpClient，还是每次都使用同一个，现在由该类的使用者决定，而不再由类本身决定。从类的角度来看，依赖不再像 service locator 那样由它主动请求，也不再像最初的示例那样完全由它自己创建。这种流程的反转带来了多项优势：

* 代码更易于理解，因为所有依赖都清晰可见。
* 代码更易于测试，因为所有依赖都是明确的，并且可以在需要时轻松修改。
* 代码更加模块化，因为依赖可以轻松替换。
* 它促进了关注点分离（Separation of Concern）原则，因为 UserRepository 不再负责自行创建非常复杂的依赖。

但一个明显的缺点也显而易见：我真的需要自己创建或管理 HttpClient 这样的所有依赖吗？答案是既需要，也不需要。需要，是因为在许多情况下，自行管理依赖是完全合理的。优秀 API 的标志是依赖不会失控，并且即便如此使用起来依然顺手。对于许多应用程序或复杂的库来说，情况很可能正是如此。若要以简化的方式向使用者提供一个具有大量依赖、非常复杂的底层 API，facade 模式非常合适。

## 依赖注入容器

不过，对于更复杂的应用程序，无需自己管理所有依赖，因为这正是所谓的依赖注入容器的用途。它不仅会自动创建所有对象，还会自动“注入”依赖，因此不再需要手动调用“new”。注入有多种类型，例如构造函数注入、方法注入或 property 注入。这样一来，即使是具有大量依赖的复杂架构也能轻松管理。

Deepkit 在 `@deepkit/injector` 中提供了依赖注入容器（也称为 DI 容器或 IoC 容器），Deepkit Framework 也已通过 App 模块集成了该容器。使用 `@deepkit/injector` 包的底层 API，上面的代码如下所示。

```typescript
import { InjectorContext } from '@deepkit/injector';

const injector = InjectorContext.forProviders(
    [UserRepository, HttpClient]
);

const userRepo = injector.get(UserRepository);

const users = await userRepo.getUsers();
```

此处的 `injector` 对象就是依赖注入容器。容器通过 `get(UserRepository)` 返回 UserRepository 的实例，而不必使用“new UserRepository”。要静态初始化容器，需要将一个 provider 列表传递给 `InjectorContext.forProviders` 函数（在本例中就是这些类）。
由于 DI 的核心就是提供依赖，而容器正是被提供了这些依赖，因此有了技术术语“provider”。

Provider 有多种类型：ClassProvider、ValueProvider、ExistingProvider、FactoryProvider。它们结合起来，可以借助 DI 容器实现非常灵活的架构。

Provider 之间的所有依赖都会自动解析。一旦调用 `injector.get()`，对象及其依赖就会被创建和缓存，并以正确的方式传递：作为构造函数参数传入（称为构造函数注入）、设置为 property（称为 property 注入），或传递给方法调用（称为方法注入）。

现在，要将 HttpClient 替换为另一个实现，可以为 HttpClient 定义另一个 provider（这里使用 ValueProvider）：

```typescript
const injector = InjectorContext.forProviders([
    UserRepository,
    {provide: HttpClient, useValue: new AnotherHttpClient()},
]);
```

一旦通过 `injector.get(UserRepository)` 请求 UserRepository，它就会收到 AnotherHttpClient 对象。此外，这里也很适合使用 ClassProvider，这样 AnotherHttpClient 的所有依赖也会由 DI 容器管理。

```typescript
const injector = InjectorContext.forProviders([
    UserRepository,
    {provide: HttpClient, useClass: AnotherHttpClient},
]);
```

所有类型的 provider 都在 [依赖注入 Provider](./dependency-injection/providers.md) 一节中列出并加以说明。

这里需要指出的是，Deepkit 的 DI 容器仅适用于 Deepkit 的运行时类型。这意味着，任何包含类、类型、interface 和函数的代码都必须由 Deepkit 类型编译器编译，才能在运行时获得类型信息。请参阅[运行时类型](./runtime-types.md)一章。

## 依赖倒置

前面的 UserRepository 示例表明，UserRepository 依赖于一个较低层级的 HTTP 库。此外，它声明的依赖是具体实现（class），而不是抽象（interface）。乍看之下，这似乎符合面向对象范式，但可能会带来问题，在复杂的大型架构中尤其如此。

另一种方案是将 HttpClient 依赖转换为抽象（interface），这样就不必将 HTTP 库的代码导入 UserRepository。

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

这称为依赖倒置原则。UserRepository 不再直接依赖 HTTP 库，而是基于抽象（interface）。由此，它实现了该原则中的两个基本目标：

* 高层模块不应从低层模块导入任何内容。
* 实现应基于抽象（interface）。

现在，可以通过 DI 容器将这两个实现（UserRepository 与 HTTP 库）组合起来。

```typescript
import { InjectorContext } from '@deepkit/injector';
import { HttpClient } from './http-client';
import { UserRepository } from './user-repository';

const injector = InjectorContext.forProviders([
    UserRepository,
    HttpClient,
]);
```

由于 Deepkit 的 DI 容器能够解析抽象依赖（interface），例如这里的 HttpClientInterface，因此只要 HttpClient 通过 `class HttpClient implements HttpClientInterface` 进行声明，UserRepository 就会自动获得 HttpClient 这一实现。

如果 HttpClient 没有实现该 interface，DI 容器就会抛出错误（`Undefined dependency "http: HttpClientInterface" of UserRepository(?). Type has no provider.`）。此时，需要将这两个实现组合在一起的使用者有责任找到解决方案。例如，可以在这里注册一个适配器类，让它实现 HttpClientInterface，并将方法调用正确转发给 HttpClient。

另一种做法是直接为 HttpClientInterface 提供一个具体实现。

```typescript
import { InjectorContext, provide } from '@deepkit/injector';
import { HttpClient } from './http-client';
import { UserRepository, HttpClientInterface } from './user-repository';

const injector = InjectorContext.forProviders([
    UserRepository,
    provide<HttpClientInterface>({useClass: HttpClient}),
]);
```

需要注意的是，尽管依赖倒置原则在理论上有其优势，但在实践中也存在明显的缺点。它不仅会导致代码量增加（因为必须编写更多 interface），还会增加复杂性（因为现在每个实现的每个依赖都有一个 interface）。只有当应用程序达到一定规模并且确实需要这种灵活性时，付出这样的代价才是值得的。与任何设计模式和原则一样，它也有成本与收益的权衡，在应用之前应当仔细考虑。

设计模式不应盲目地、不加区分地用于哪怕最简单的代码。不过，只有在具备复杂架构、大型应用程序或团队不断扩大等前提条件时，依赖倒置和其他设计模式才能发挥出真正的威力。
