# 中间件

HTTP 中间件允许你挂接到请求/响应周期中，作为 HTTP 事件的一种替代方案。其 API 允许你使用 Express/Connect 框架中的所有中间件。

中间件既可以是一个类（由依赖注入容器实例化），也可以是一个简单的函数。

```typescript
import { HttpMiddleware, httpMiddleware, HttpRequest, HttpResponse } from '@deepkit/http';

class MyMiddleware implements HttpMiddleware {
    async execute(request: HttpRequest, response: HttpResponse, next: (err?: any) => void) {
        response.setHeader('middleware', '1');
        next();
    }
}


function myMiddlewareFunction(request: HttpRequest, response: HttpResponse, next: (err?: any) => void) {
    response.setHeader('middleware', '1');
    next();
}

new App({
    providers: [MyMiddleware],
    middlewares: [
        httpMiddleware.for(MyMiddleware),
        httpMiddleware.for(myMiddlewareFunction),
    ],
    imports: [new FrameworkModule]
}).run();
```

## 全局

通过使用 httpMiddleware.for(MyMiddleware)，中间件会被全局注册到所有路由。

```typescript
import { httpMiddleware } from '@deepkit/http';

new App({
    providers: [MyMiddleware],
    middlewares: [
        httpMiddleware.for(MyMiddleware)
    ],
    imports: [new FrameworkModule]
}).run();
```

## 按 Controller

你可以通过两种方式将中间件限制在一个或多个 controller 上：使用 `@http.controller`，或使用 `httpMiddleware.for(T).forControllers()`。`excludeControllers` 允许你排除某些 controller。

```typescript
@http.middleware(MyMiddleware)
class MyFirstController {

}
new App({
    providers: [MyMiddleware],
    controllers: [MainController, UsersCommand],
    middlewares: [
        httpMiddleware.for(MyMiddleware).forControllers(MyFirstController, MySecondController)
    ],
    imports: [new FrameworkModule]
}).run();
```

## 按路由名称

`forRouteNames` 及其对应的 `excludeRouteNames` 允许你按路由名称过滤中间件的执行。

```typescript
class MyFirstController {
    @http.GET('/hello').name('firstRoute')
    myAction() {
    }

    @http.GET('/second').name('secondRoute')
    myAction2() {
    }
}
new App({
    controllers: [MainController, UsersCommand],
    providers: [MyMiddleware],
    middlewares: [
        httpMiddleware.for(MyMiddleware).forRouteNames('firstRoute', 'secondRoute')
    ],
    imports: [new FrameworkModule]
}).run();
```


## 按 Action/路由

若要仅针对某个特定路由执行中间件，你可以使用 `@http.GET().middleware()`，或者使用
`httpMiddleware.for(T).forRoute()`，其中 forRoute 提供了多种过滤路由的选项。

```typescript
class MyFirstController {
    @http.GET('/hello').middleware(MyMiddleware)
    myAction() {
    }
}
new App({
    controllers: [MainController, UsersCommand],
    providers: [MyMiddleware],
    middlewares: [
        httpMiddleware.for(MyMiddleware).forRoutes({
            path: 'api/*'
        })
    ],
    imports: [new FrameworkModule]
}).run();
```

`forRoutes()` 的第一个参数支持多种过滤路由的方式。

```typescript
{
    path?: string;
    pathRegExp?: RegExp;
    httpMethod?: 'GET' | 'HEAD' | 'POST' | 'PATCH' | 'PUT' | 'DELETE' | 'OPTIONS' | 'TRACE';
    category?: string;
    excludeCategory?: string;
    group?: string;
    excludeGroup?: string;
}
```

## 路径模式

`path` 支持通配符 *。

```typescript
httpMiddleware.for(MyMiddleware).forRoutes({
    path: 'api/*'
})
```

## RegExp

```typescript
httpMiddleware.for(MyMiddleware).forRoutes({
    pathRegExp: /'api/.*'/
})
```

## HTTP 方法

按 HTTP 方法过滤所有路由。

```typescript
httpMiddleware.for(MyMiddleware).forRoutes({
    httpMethod: 'GET'
})
```

## 类别

`category` 及其对应的 `excludeCategory` 允许你按路由类别进行过滤。

```typescript
@http.category('myCategory')
class MyFirstController {

}

class MySecondController {
    @http.GET().category('myCategory')
    myAction() {
    }
}
httpMiddleware.for(MyMiddleware).forRoutes({
    category: 'myCategory'
})
```

## 分组

`group` 及其对应的 `excludeGroup` 允许你按路由分组进行过滤。

```typescript
@http.group('myGroup')
class MyFirstController {

}

class MySecondController {
    @http.GET().group('myGroup')
    myAction() {
    }
}
httpMiddleware.for(MyMiddleware).forRoutes({
    group: 'myGroup'
})
```

## 按模块

你可以将中间件的执行限制在整个模块范围内。

```typescript
httpMiddleware.for(MyMiddleware).forModule(ApiModule)
```


## 按自身模块

若要针对注册该中间件的模块中的所有 controller/路由执行中间件，请使用 `forSelfModules()`。

```typescript
const ApiModule = new AppModule({}, {
    controllers: [MainController, UsersCommand],
    providers: [MyMiddleware],
    middlewares: [
        //适用于同一模块中注册的所有 controller
        httpMiddleware.for(MyMiddleware).forSelfModules(),
    ],
});
```

## 调用 next()

中间件要么调用 `next()` 以继续执行下一个中间件并最终执行 controller，要么自行结束响应，例如使用 `response.end()`。此时 controller 不会被执行，并且不得再调用 `next()`。`onResponse` 监听器和 HTTP 日志记录器仍会运行。

```typescript
function authentication(request: HttpRequest, response: HttpResponse, next: (err?: any) => void) {
    if (!request.headers['authorization']) {
        response.statusCode = 401;
        response.end();
        return;
    }
    next();
}
```

调用 `next(error)` 或抛出错误（在异步中间件中同样适用）会使请求失败：

- 像 `HttpUnauthorizedError` 这样的 `HttpError` 会以其状态码作出响应，并将其消息以 JSON 形式返回，与在 controller 中的行为一致。
- 任何其他错误都会被记录到日志中，并以 500 "Internal error" 作出响应。

如果中间件已经结束了响应，则响应将保持原样。

## 超时

默认情况下，中间件没有超时限制。使用 `timeout(milliseconds)` 后，如果中间件在该时间内既没有调用 `next()` 也没有结束响应，请求将以 `HttpGatewayTimeoutError`（504）失败，并记录一条警告。之后对 `next()` 的调用将被忽略。

```typescript
const ApiModule = new AppModule({}, {
    controllers: [MainController, UsersCommand],
    providers: [MyMiddleware],
    middlewares: [
        //适用于同一模块中注册的所有 controller
        httpMiddleware.for(MyMiddleware).timeout(15_000),
    ],
});
```

## 多重规则

若要组合多个过滤条件，可以链式调用方法。

```typescript
const ApiModule = new AppModule({}, {
    controllers: [MyController],
    providers: [MyMiddleware],
    middlewares: [
        httpMiddleware.for(MyMiddleware).forControllers(MyController).excludeRouteNames('secondRoute')
    ],
});
```

## Express 中间件

几乎所有 Express 中间件都受支持。那些访问 Express 特定请求方法的中间件目前尚不支持。

```typescript
import * as compression from 'compression';

const ApiModule = new AppModule({}, {
    middlewares: [
        httpMiddleware.for(compress()).forControllers(MyController)
    ],
});
```
