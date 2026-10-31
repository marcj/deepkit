# 作用域

默认情况下，DI 容器的所有提供者都是单例，因此只会被实例化一次。这意味着在 UserRepository 的示例中，整个运行期间始终只有一个 UserRepository 实例。除非用户使用“new”关键字手动创建，否则在任何时候都不会创建第二个实例。

然而，在各种用例中，提供者应该只在短时间内或仅在某个特定事件期间被实例化。这样的事件例如可以是 HTTP 请求或 RPC 调用。这意味着每个事件都会创建一个新实例，并且当该实例不再被使用时会自动移除（由垃圾回收器完成）。

HTTP 请求是作用域的经典示例。例如，会话、用户对象或其他与请求相关的提供者可以注册到该作用域。要创建一个作用域，只需选择任意作用域名称，然后在提供者中为其指定该作用域。

```typescript
import { InjectorContext } from '@deepkit/injector';

class UserSession {}

const injector = InjectorContext.forProviders([
    {provide: UserSession, scope: 'http'}
]);
```

一旦指定了作用域，该提供者就不能直接从 DI 容器中获取，因此下面的调用会失败：

```typescript
const session = injector.get(UserSession); // 抛出错误
```

相反，必须创建一个带作用域的 DI 容器。这会在每次收到 HTTP 请求时发生：

```typescript
const httpScope = injector.createChildScope('http');
```

在该作用域中注册的提供者现在可以通过这个带作用域的 DI 容器获取，也包括所有未定义作用域的提供者。

```typescript
const session = httpScope.get(UserSession); // 可行
```

由于所有提供者默认都是单例，对于每个带作用域的容器，每次调用 `get(UserSession)` 都会返回同一个实例。如果你创建多个带作用域的容器，将会创建多个 UserSession 实例。

带作用域的 DI 容器可以从外部动态设置值。例如，在 HTTP 作用域中，可以很容易地设置 HttpRequest 和 HttpResponse 对象。

```typescript
const injector = InjectorContext.forProviders([
    {provide: HttpResponse, scope: 'http'},
    {provide: HttpRequest, scope: 'http'},
]);

httpServer.on('request', (req, res) => {
    const httpScope = injector.createChildScope('http');
    httpScope.set(HttpRequest, req);
    httpScope.set(HttpResponse, res);
});
```

使用 Deepkit 框架的应用默认拥有 `http`、`rpc` 和 `cli` 作用域。分别参见章节 [CLI](../app.md)、[HTTP](../http.md) 或 [RPC](../rpc.md)。