# 미들웨어

HTTP 미들웨어를 사용하면 HTTP 이벤트의 대안으로 request/response 사이클에 hook할 수 있습니다. 이 API를 통해 Express/Connect 프레임워크의 모든 미들웨어를 사용할 수 있습니다.

미들웨어는 class(dependency injection 컨테이너에 의해 인스턴스화됨)이거나 간단한 function일 수 있습니다.

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

## 전역

httpMiddleware.for(MyMiddleware)를 사용하면 미들웨어가 모든 route에 대해 전역으로 등록됩니다.

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

## 컨트롤러별

두 가지 방법으로 미들웨어를 하나 또는 여러 컨트롤러로 제한할 수 있습니다. `@http.controller`를 사용하거나 `httpMiddleware.for(T).forControllers()`를 사용하는 것입니다. `excludeControllers`를 사용하면 컨트롤러를 제외할 수 있습니다.

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

## Route 이름별

`forRouteNames`와 그 반대인 `excludeRouteNames`를 사용하면 route 이름별로 미들웨어의 실행을 필터링할 수 있습니다.

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


## Action/Route별

특정 route에 대해서만 미들웨어를 실행하려면 `@http.GET().middleware()` 또는
`httpMiddleware.for(T).forRoute()`를 사용할 수 있으며, forRoute에는 route를 필터링하기 위한 여러 옵션이 있습니다.

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

`forRoutes()`는 첫 번째 argument로 route를 필터링하는 여러 방법을 허용합니다.

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

## Path 패턴

`path`는 와일드카드 *를 지원합니다.

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

## HTTP Method

HTTP method로 모든 route를 필터링합니다.

```typescript
httpMiddleware.for(MyMiddleware).forRoutes({
    httpMethod: 'GET'
})
```

## Category

`category`와 그 반대인 `excludeCategory`를 사용하면 route category별로 필터링할 수 있습니다.

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

## Group

`group`과 그 반대인 `excludeGroup`을 사용하면 route group별로 필터링할 수 있습니다.

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

## 모듈별

모듈 전체에 대해 모듈의 실행을 제한할 수 있습니다.

```typescript
httpMiddleware.for(MyMiddleware).forModule(ApiModule)
```


## 자체 모듈별

미들웨어가 등록된 모듈의 모든 컨트롤러/route에 대해 미들웨어를 실행하려면 `forSelfModules()`를 사용하세요.

```typescript
const ApiModule = new AppModule({}, {
    controllers: [MainController, UsersCommand],
    providers: [MyMiddleware],
    middlewares: [
        //같은 모듈에 등록된 모든 컨트롤러에 대해
        httpMiddleware.for(MyMiddleware).forSelfModules(),
    ],
});
```

## next() 호출

미들웨어는 `next()`를 호출하여 다음 미들웨어와 최종적으로 컨트롤러로 계속 진행하거나, 예를 들어 `response.end()`로 response를 직접 종료합니다. 이 경우 컨트롤러는 실행되지 않으며 `next()`를 호출해서는 안 됩니다. `onResponse` 리스너와 HTTP 로거는 여전히 실행됩니다.

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

`next(error)`를 호출하거나 error를 throw하면(async 미들웨어에서도) request가 실패합니다:

- `HttpUnauthorizedError`와 같은 `HttpError`는 컨트롤러에서와 마찬가지로 해당 status code와 메시지를 JSON으로 응답합니다.
- 그 외의 모든 error는 로그에 기록되고 500 "Internal error"로 응답합니다.

미들웨어가 이미 response를 종료한 경우, response는 그대로 유지됩니다.

## Timeout

기본적으로 미들웨어에는 timeout이 없습니다. `timeout(milliseconds)`를 사용하면, 해당 시간 내에 `next()`를 호출하지도 않고 response를 종료하지도 않는 미들웨어는 `HttpGatewayTimeoutError`(504)로 request를 실패시키며, 경고가 로그에 기록됩니다. 이후의 `next()` 호출은 무시됩니다.

```typescript
const ApiModule = new AppModule({}, {
    controllers: [MainController, UsersCommand],
    providers: [MyMiddleware],
    middlewares: [
        //같은 모듈에 등록된 모든 컨트롤러에 대해
        httpMiddleware.for(MyMiddleware).timeout(15_000),
    ],
});
```

## 여러 규칙

여러 필터를 결합하려면 method 호출을 체이닝할 수 있습니다.

```typescript
const ApiModule = new AppModule({}, {
    controllers: [MyController],
    providers: [MyMiddleware],
    middlewares: [
        httpMiddleware.for(MyMiddleware).forControllers(MyController).excludeRouteNames('secondRoute')
    ],
});
```

## Express 미들웨어

거의 모든 express 미들웨어가 지원됩니다. express의 특정 request method에 접근하는 미들웨어는 아직 지원되지 않습니다.

```typescript
import * as compression from 'compression';

const ApiModule = new AppModule({}, {
    middlewares: [
        httpMiddleware.for(compress()).forControllers(MyController)
    ],
});
```
