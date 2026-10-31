# 入门

由于 Deepkit 中的依赖注入基于运行时类型（Runtime Types），因此需要先正确安装运行时类型。参见 [运行时类型](../runtime-types/getting-started.md)。

一旦完成，便可安装 `@deepkit/injector`，或者安装已在内部使用该库的 Deepkit 框架。

```sh
	npm install @deepkit/injector
```

安装完成后，即可直接使用其 API。


## 用法

现在使用依赖注入有三种方式。

* 注入器 API（底层）
* 模块 API
* 应用 API（Deepkit 框架）

如果在不使用 Deepkit 框架的情况下使用 `@deepkit/injector`，推荐前两种方式。

### 注入器 API

注入器 API 已在[依赖注入简介](../dependency-injection)中介绍。其特点是通过单个类 `InjectorContext` 简单使用，创建一个 DI 容器，特别适合无模块的简单应用。

```typescript
import { InjectorContext } from '@deepkit/injector';

const injector = InjectorContext.forProviders([
    UserRepository,
    HttpClient,
]);

const repository = injector.get(UserRepository);
```

在此情况下，`injector` 对象即为依赖注入容器。函数 `InjectorContext.forProviders` 接受一个提供者数组。参见[依赖注入提供者](providers.md)了解可传递的值。

### 模块 API

更复杂的 API 是 `InjectorModule` 类，它允许将提供者存放在不同模块中，从而为每个模块创建多个封装的 DI 容器。此外，它还允许为每个模块使用配置类，使得向提供者提供经过自动验证的配置值更容易。模块之间可以相互导入，提供者可导出，从而构建层次化、良好分离的架构。

如果应用更复杂且未使用 Deepkit 框架，应使用此 API。

```typescript
import { InjectorModule, InjectorContext } from '@deepkit/injector';

const lowLevelModule = new InjectorModule([HttpClient])
     .addExport(HttpClient);

const rootModule = new InjectorModule([UserRepository])
     .addImport(lowLevelModule);

const injector = new InjectorContext(rootModule);
```

在此情况下，`injector` 对象即为依赖注入容器。提供者可以拆分到不同模块中，并通过模块导入在不同位置再次引入。这样就会形成一个自然的层次结构，反映应用或架构的层级。
应始终将层级中的顶层模块（也称根模块或应用模块）传给 InjectorContext。此时 InjectorContext 仅充当中间角色：对 `injector.get()` 的调用会被简单地转发到根模块。不过，也可以通过将模块作为第二个参数传入，从非根模块获取提供者。

```typescript
const repository = injector.get(UserRepository);

const httpClient = injector.get(HttpClient, lowLevelModule);
```

所有非根模块默认都是封装的，因此该模块中的所有提供者仅对自身可用。若希望某个提供者可供其他模块使用，必须将其导出。导出后，该提供者会提升到层级中的父模块，从而以这种方式被使用。

若要默认将所有提供者导出到顶层（根模块），可使用 `forRoot` 选项。这样所有提供者即可被其他模块使用。

```typescript
const lowLevelModule = new InjectorModule([HttpClient])
     .forRoot(); //将所有提供者导出到根模块
```

### 应用 API

一旦使用 Deepkit 框架，模块将通过 `@deepkit/app` API 定义。它基于模块 API，因此前述能力同样适用。此外，还可以使用强大的钩子并定义配置加载器，以实现更为动态的架构。

详见[框架模块](../app/modules.md)一章。

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