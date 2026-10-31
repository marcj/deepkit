# Scopes

By default, all providers of the DI container are singletons and are therefore instantiated only once. This means that in the example of UserRepository there is always only one instance of UserRepository during the entire runtime. At no time is a second instance created, unless the user does this manually with the "new" keyword.

However, there are various use cases where a provider should only be instantiated for a short time or only during a certain event. Such an event could be, for example, an HTTP request or an RPC call. This would mean that a new instance is created for each event and after this instance is no longer used it is automatically removed (by the garbage collector).

An HTTP request is a classic example of a scope. For example, providers such as a session, a user object, or other request-related providers can be registered to this scope. To create a scope, simply choose an arbitrary scope name and then specify it with the providers.

```typescript
import { InjectorContext } from '@deepkit/injector';

class UserSession {}

const injector = InjectorContext.forProviders([
    {provide: UserSession, scope: 'http'}
]);
```

Once a scope is specified, this provider cannot be obtained directly from the DI container, so the following call will fail:

```typescript
const session = injector.get(UserSession); //throws
```

Instead, a scoped DI container must be created. This would happen every time an HTTP request comes in:

```typescript
const httpScope = injector.createChildScope('http');
```

Providers that are also registered in this scope can now be requested on this scoped DI container, as well as all providers that have not defined a scope.

```typescript
const session = httpScope.get(UserSession); //works
```

Since all providers are singleton by default, each call to `get(UserSession)` will always return the same instance per scoped container. If you create multiple scoped containers, multiple UserSessions will be created.

Scoped DI containers have the ability to set values dynamically from the outside. For example, in an HTTP scope, it is easy to set the HttpRequest and HttpResponse objects.

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

Applications using the Deepkit framework have by default an `http`, an `rpc`, and a `cli` scope. See respectively the chapter [CLI](../app.md), [HTTP](../http.md), or [RPC](../rpc.md).
