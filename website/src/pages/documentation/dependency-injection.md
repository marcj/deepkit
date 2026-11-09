# TypeScript Dependency Injection

Deepkit is a dependency injection container for TypeScript that works without decorators on your services. It resolves constructor parameters from their TypeScript types, including interfaces, so your code stays free of container-specific annotations and tokens.

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

`Signup` depends on the `Mailer` interface, and the container finds `SmtpMailer` because it implements that interface. To use another implementation, for example in a test, provide it explicitly with `provide<Mailer>({ useClass: TestMailer })`. A dependency nobody provides is an error with its exact location: `Undefined dependency "mailer: Mailer" of Signup(?). Type has no provider.`

## Comparison with NestJS, InversifyJS and tsyringe

|                         | Deepkit                 | NestJS                     | InversifyJS                 | tsyringe                    |
| ----------------------- | ----------------------- | -------------------------- | --------------------------- | --------------------------- |
| Decorator on a service  | None                    | `@Injectable()`            | `@injectable()`             | `@injectable()`             |
| Depending on interfaces | The interface type      | Token and `@Inject()`      | Token and `@inject()`       | Token and `@inject()`       |
| Type information from   | Deepkit type compiler   | `emitDecoratorMetadata`    | `emitDecoratorMetadata`     | `emitDecoratorMetadata`     |

Deepkit needs the [Deepkit type compiler](./runtime-types/getting-started.md) in your build, because it reads your types at runtime. How fast the container resolves dependencies is listed on the [benchmarks page](/benchmarks). See [Getting Started](./dependency-injection/getting-started.md) for the installation.

## What is Dependency Injection?

Dependency Injection (DI) is a design pattern in which classes and functions _receive_ their dependencies. It follows the principle of Inversion of Control (IoC) and helps to better separate complex code in order to significantly improve testability, modularity and clarity. Although there are other design patterns, such as the service locator pattern, for applying the principle of IoC, DI has established itself as the dominant pattern, especially in enterprise software.

To illustrate the principle of IoC, here is an example:

```typescript
import { HttpClient } from 'http-library';

class UserRepository {
    async getUsers(): Promise<Users> {
        const client = new HttpClient();
        return await client.get('/users');
    }
}
```

The UserRepository class has an HttpClient as a dependency. This dependency in itself is nothing remarkable, but it is problematic that `UserRepository` creates the HttpClient itself.
It seems to be a good idea to encapsulate the creation of the HttpClient in the UserRepository, but this is not the case. What if we want to replace the HttpClient? What if we want to test UserRepository in a unit test without allowing real HTTP requests to go out? How do we know that the class even uses an HttpClient?

## Inversion of Control

In the thought of Inversion of Control (IoC) is the following alternative variant that sets the HttpClient as an explicit dependency in the constructor (also known as constructor injection).

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

Now UserRepository is no longer responsible for creating the HttpClient, but the user of UserRepository. This is Inversion of Control (IoC). The control has been reversed or inverted. Specifically, this code applies dependency injection, because dependencies are received (injected) and no longer created or requested. Dependency Injection is only one variant of IoC.

## Service Locator

Besides DI, Service Locator (SL) is also a way to apply the IoC principle. This is commonly considered the counterpart to Dependency Injection, as it requests dependencies rather than receiving them. If HttpClient were requested in the above code as follows, it would be called a Service Locator pattern.

```typescript
class UserRepository {
    async getUsers(): Promise<Users> {
        const client = locator.getHttpClient();
        return await client.get('/users');
    }
}
```

The function `locator.getHttpClient` can have any name. Alternatives would be function calls like `useContext(HttpClient)`, `getHttpClient()`, `await import("client"),` or a container queries like `container.get(HttpClient)` or `container.http`. An import of a global is a slightly different variant of a service locator, using the module system itself as the locator:

```typescript
import { httpClient } from 'clients'

class UserRepository {
    async getUsers(): Promise<Users> {
        return await httpClient.get('/users');
    }
}
```

All these variants have in common that they explicitly request the HttpClient dependency and the code is aware that there is a service container. It tightly couples your code to the framework and is something you want to avoid to keep the code clean. 

The service request can happen not only to properties as a default value, but also somewhere in the middle of the code. Since in the middle of the code means that it is not part of a type interface, the use of the HttpClient is hidden. Depending on the variant of how the HttpClient is requested, it can sometimes be very difficult or completely impossible to replace it with another implementation. Especially in the area of unit tests and for the sake of clarity, difficulties can arise here, so that the service locator is now classified as an anti-pattern in certain situations.

## Dependency Injection

With Dependency Injection, nothing is requested, but it is explicitly provided by the user or received by the code. The consumer does not have access to any service container, does not know how `HttpClient` is created or retrieved. In its core it allows your code to be decoupled from the IoC framework making it cleaner. 

It just declares that it needs an `HttpClient` as a type. One key differentiator and advantage of Dependency Injection over Service Locator is that the code using Dependency Injection works perfectly fine without any kind of service container and service identification system (you don't have to give your service a name). It is just a type declaration that works out of the IoC framework context as well.

As can be seen in the example earlier, the dependency injection pattern has already been applied there. Specifically, constructor injection can be seen there, since the dependency is declared in the constructor. So UserRepository must now be instantiated as follows.

```typescript
const users = new UserRepository(new HttpClient());
```

The code that wants to use UserRepository must also provide (inject) all its dependencies. Whether HttpClient should be created each time or the same one should be used each time is now decided by the user of the class and no longer by the class itself. It is no longer requested (from the class's point of view) as in the case of the service locator, or created entirely by itself in the initial example. This inversion of the flow has various advantages:

* The code is easier to understand because all dependencies are explicitly visible.
* The code is easier to test because all dependencies are unique and can be easily modified if needed.
* The code is more modular, as dependencies can be easily exchanged.
* It promotes the Separation of Concern principle, as UserRepository is no longer responsible for creating very complex dependencies itself.

But an obvious disadvantage can also be seen directly: Do I really need to create or manage all dependencies like the HttpClient myself? Yes and No. Yes, there are many cases where it is perfectly legitimate to manage the dependencies yourself. The hallmark of a good API is that dependencies don't get out of hand, and that even then they are pleasant to use. For many applications or complex libraries, this may well be the case. To provide a very complex low-level API with many dependencies in a simplified way to the user, the facade pattern is wonderfully suitable.

## Dependency Injection Container

For more complex applications, however, it is not necessary to manage all dependencies yourself, because that is exactly what a so-called dependency injection container is for. This not only creates all objects automatically, but also "injects" the dependencies automatically, so that a manual "new" call is no longer necessary. There are various types of injection, such as constructor injection, method injection, or property injection. This makes it easy to manage even complicated architectures with many dependencies.

A dependency injection container (also called DI container or IoC container) brings Deepkit in `@deepkit/injector` or already ready integrated via App modules in the Deepkit Framework. The above code would look like this using a low-level API from the `@deepkit/injector` package.

```typescript
import { InjectorContext } from '@deepkit/injector';

const injector = InjectorContext.forProviders(
    [UserRepository, HttpClient]
);

const userRepo = injector.get(UserRepository);

const users = await userRepo.getUsers();
```

The `injector` object in this case is the dependency injection container. Instead of using "new UserRepository", the container returns an instance of UserRepository using `get(UserRepository)`. To statically initialize the container, a list of providers is passed to the `InjectorContext.forProviders` function (in this case, simply the classes).
Since DI is all about providing dependencies, the container is provided with the dependencies, hence the technical term "provider". 

There are several types of providers: ClassProvider, ValueProvider, ExistingProvider, FactoryProvider. All together, they allow very flexible architectures to be mapped with a DI container.

All dependencies between providers are automatically resolved and as soon as an `injector.get()` call occurs, the objects and dependencies are created, cached, and correctly passed either as a constructor argument (which is known as constructor injection), set as a property (which is known as property injection), or passed to a method call (which is known as method injection).

Now to exchange the HttpClient with another one, another provider (here the ValueProvider) can be defined for HttpClient:

```typescript
const injector = InjectorContext.forProviders([
    UserRepository,
    {provide: HttpClient, useValue: new AnotherHttpClient()},
]);
```

As soon as UserRepository is requested via `injector.get(UserRepository)`, it receives the AnotherHttpClient object. Alternatively, a ClassProvider can be used here very well, so that all dependencies of AnotherHttpClient are also managed by the DI container.

```typescript
const injector = InjectorContext.forProviders([
    UserRepository,
    {provide: HttpClient, useClass: AnotherHttpClient},
]);
```

All types of providers are listed and explained in the [Dependency Injection Providers](./dependency-injection/providers.md) section.

It should be mentioned here that Deepkit's DI container only works with Deepkit's runtime types. This means that any code that contains classes, types, interfaces, and functions must be compiled by the Deepkit Type Compiler in order to have the type information available at runtime. See the chapter [Runtime Types](./runtime-types.md).

## Dependency Inversion

The example of UserRepository earlier shows that UserRepository depends on a lower level HTTP library. In addition, a concrete implementation (class) is declared as a dependency instead of an abstraction (interface). At first glance, this may seem to be in line with the object-oriented paradigms, but it can lead to problems, especially in complex and large architectures.

An alternative variant would be to convert the HttpClient dependency into an abstraction (interface) and thus not import code from an HTTP library into UserRepository.

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

This is called the dependency inversion principle. UserRepository no longer has a dependency directly on an HTTP library and is instead based on an abstraction (interface). It thus solves two fundamental goals in this principle:

* High-level modules should not import anything from low-level modules.
* Implementations should be based on abstractions (interfaces).

Merging the two implementations (UserRepository with an HTTP library) can now be done via the DI container.

```typescript
import { InjectorContext } from '@deepkit/injector';
import { HttpClient } from './http-client';
import { UserRepository } from './user-repository';

const injector = InjectorContext.forProviders([
    UserRepository,
    HttpClient,
]);
```

Since Deepkit's DI container is capable of resolving abstract dependencies (interfaces) such as this one of HttpClientInterface, UserRepository automatically gets the implementation of HttpClient, as long as HttpClient declares it with `class HttpClient implements HttpClientInterface`.

If HttpClient doesn't implement the interface, the DI container throws an error (`Undefined dependency "http: HttpClientInterface" of UserRepository(?). Type has no provider.`). Here the user, who wants to bring both implementations together, is in the obligation to find a solution. As an example, an adapter class could be registered here that implements HttpClientInterface and correctly forwards the method calls to HttpClient.

As an alternative, the HttpClientInterface can be provided directly with a concrete implementation.

```typescript
import { InjectorContext, provide } from '@deepkit/injector';
import { HttpClient } from './http-client';
import { UserRepository, HttpClientInterface } from './user-repository';

const injector = InjectorContext.forProviders([
    UserRepository,
    provide<HttpClientInterface>({useClass: HttpClient}),
]);
```

It should be noted here that although in theory the dependency inversion principle has its advantages, in practice it also has significant disadvantages. It not only leads to more code (since more interfaces have to be written), but also to more complexity (since each implementation now has an interface for each dependency). This price to pay is only worth it when the application reaches a certain size and this flexibility is needed. Like any design pattern and principle, this one has its cost-use factor, which should be thought through before it is applied.

Design patterns should not be used blindly and across the board for even the simplest code. However, if the prerequisites such as a complex architecture, large applications, or a scaling team are given, dependency inversion and other design patterns only unfold their true strength.

