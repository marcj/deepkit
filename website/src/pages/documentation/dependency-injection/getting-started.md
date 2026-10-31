# Getting Started

Since Dependency Injection in Deepkit is based on Runtime Types, it is necessary to have Runtime Types already installed correctly. See [Runtime Type](../runtime-types/getting-started.md).

If this is done successfully, `@deepkit/injector` can be installed or the Deepkit framework which already uses the library under the hood.

```sh
	npm install @deepkit/injector
```

Once the library is installed, the API of it can be used directly.


## Usage

To use Dependency Injection now, there are three ways.

* Injector API (Low Level)
* Module API
* App API (Deepkit Framework)

If `@deepkit/injector` is to be used without the Deepkit Framework, the first two variants are recommended.

### Injector API

The Injector API has already been introduced in the [introduction to Dependency Injection](../dependency-injection). It is characterized by a very simple usage by means of a single class `InjectorContext` that creates a single DI container and is particularly suitable for simpler applications without modules.

```typescript
import { InjectorContext } from '@deepkit/injector';

const injector = InjectorContext.forProviders([
    UserRepository,
    HttpClient,
]);

const repository = injector.get(UserRepository);
```

The `injector` object in this case is the dependency injection container. The function `InjectorContext.forProviders` takes an array of providers. See the section [Dependency Injection Providers](providers.md) to learn which values can be passed.

### Module API

A more complex API is the `InjectorModule` class, which allows to store the providers in different modules to create multiple encapsulated DI containers per module. Also this allows using configuration classes per module, which makes it easier to provide configuration values automatically validated to the providers. Modules can import themselves among themselves, providers export, in order to build up a hierarchy and nicely separated architecture.

This API should be used if the application is more complex and the Deepkit Framework is not used.

```typescript
import { InjectorModule, InjectorContext } from '@deepkit/injector';

const lowLevelModule = new InjectorModule([HttpClient])
     .addExport(HttpClient);

const rootModule = new InjectorModule([UserRepository])
     .addImport(lowLevelModule);

const injector = new InjectorContext(rootModule);
```

The `injector` object in this case is the dependency injection container. Providers can be split into different modules and then imported again in different places using module imports. This creates a natural hierarchy that reflects the hierarchy of the application or architecture.
The InjectorContext should always be given the top module in the hierarchy, also called root module or app module. The InjectorContext then only has an intermediary role: calls to `injector.get()` are simply forwarded to the root module. However, it is also possible to get providers from non-root modules by passing the module as a second argument.

```typescript
const repository = injector.get(UserRepository);

const httpClient = injector.get(HttpClient, lowLevelModule);
```

All non-root modules are encapsulated by default, so that all providers in this module are only available to itself. If a provider is to be available to other modules, this provider must be exported. By exporting, the provider moves to the parent module of the hierarchy and can be used that way.

To export all providers by default to the top level, the root module, the option `forRoot` can be used. This allows all providers to be used by all other modules.

```typescript
const lowLevelModule = new InjectorModule([HttpClient])
     .forRoot(); //export all Providers to the root
```

### App API

Once the Deepkit framework is used, modules are defined with the `@deepkit/app` API. This is based on the Module API, so the capabilities from there are also available. In addition, it is possible to work with powerful hooks and define configuration loaders to map even more dynamic architectures.

The [Framework Modules](../app/modules.md) chapter describes this in more detail.

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
