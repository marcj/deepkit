# ミドルウェア

HTTP ミドルウェアを使用すると、HTTP イベントの代わりにリクエスト/レスポンスサイクルにフックできます。その API により、Express/Connect フレームワークのすべてのミドルウェアを使用できます。

ミドルウェアは、クラス（依存性注入コンテナによってインスタンス化されます）または単純な関数のいずれかです。

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

## グローバル

httpMiddleware.for(MyMiddleware) を使用すると、ミドルウェアはすべてのルートに対してグローバルに登録されます。

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

## コントローラーごと

ミドルウェアを 1 つまたは複数のコントローラーに限定する方法は 2 つあります。`@http.controller` を使用するか、`httpMiddleware.for(T).forControllers()` を使用します。`excludeControllers` を使用すると、コントローラーを除外できます。

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

## ルート名ごと

`forRouteNames` とその対となる `excludeRouteNames` を使用すると、ルート名ごとにミドルウェアの実行をフィルタリングできます。

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


## アクション/ルートごと

特定のルートに対してのみミドルウェアを実行するには、`@http.GET().middleware()` または
`httpMiddleware.for(T).forRoute()` を使用できます。forRoute にはルートをフィルタリングするための複数のオプションがあります。

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

`forRoutes()` は、最初の Argument としてルートをフィルタリングするためのいくつかの方法を受け付けます。

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

## パスパターン

`path` はワイルドカード * をサポートしています。

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

## HTTP メソッド

HTTP メソッドですべてのルートをフィルタリングします。

```typescript
httpMiddleware.for(MyMiddleware).forRoutes({
    httpMethod: 'GET'
})
```

## カテゴリー

`category` とその対となる `excludeCategory` を使用すると、ルートのカテゴリーごとにフィルタリングできます。

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

## グループ

`group` とその対となる `excludeGroup` を使用すると、ルートのグループごとにフィルタリングできます。

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

## モジュールごと

モジュール全体に対してミドルウェアの実行を限定できます。

```typescript
httpMiddleware.for(MyMiddleware).forModule(ApiModule)
```


## 自身のモジュールごと

ミドルウェアが登録されたモジュールのすべてのコントローラー/ルートに対してミドルウェアを実行するには、`forSelfModules()` を使用します。

```typescript
const ApiModule = new AppModule({}, {
    controllers: [MainController, UsersCommand],
    providers: [MyMiddleware],
    middlewares: [
        //同じモジュールに登録されたすべてのコントローラーに対して
        httpMiddleware.for(MyMiddleware).forSelfModules(),
    ],
});
```

## next() の呼び出し

ミドルウェアは、`next()` を呼び出して次のミドルウェア、そして最終的にコントローラーへと処理を続けるか、例えば `response.end()` を使って自らレスポンスを終了します。後者の場合、コントローラーは実行されず、`next()` を呼び出してはいけません。`onResponse` リスナーと HTTP ロガーは引き続き実行されます。

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

`next(error)` を呼び出すか、Error をスローする（非同期ミドルウェアでも同様）と、リクエストは失敗します:

- `HttpUnauthorizedError` のような `HttpError` は、コントローラーの場合と同様に、そのステータスコードとメッセージを JSON として返します。
- その他の Error はログに記録され、500 "Internal error" が返されます。

ミドルウェアがすでにレスポンスを終了している場合、レスポンスはそのまま維持されます。

## タイムアウト

デフォルトでは、ミドルウェアにタイムアウトはありません。`timeout(milliseconds)` を使用すると、その時間内に `next()` を呼び出さず、レスポンスも終了しないミドルウェアは、`HttpGatewayTimeoutError`（504）でリクエストを失敗させ、警告がログに記録されます。その後の `next()` の呼び出しは無視されます。

```typescript
const ApiModule = new AppModule({}, {
    controllers: [MainController, UsersCommand],
    providers: [MyMiddleware],
    middlewares: [
        //同じモジュールに登録されたすべてのコントローラーに対して
        httpMiddleware.for(MyMiddleware).timeout(15_000),
    ],
});
```

## 複数のルール

複数のフィルターを組み合わせるには、メソッド呼び出しをチェーンできます。

```typescript
const ApiModule = new AppModule({}, {
    controllers: [MyController],
    providers: [MyMiddleware],
    middlewares: [
        httpMiddleware.for(MyMiddleware).forControllers(MyController).excludeRouteNames('secondRoute')
    ],
});
```

## Express ミドルウェア

ほぼすべての Express ミドルウェアがサポートされています。Express 固有のリクエストメソッドにアクセスするものは、まだサポートされていません。

```typescript
import * as compression from 'compression';

const ApiModule = new AppModule({}, {
    middlewares: [
        httpMiddleware.for(compress()).forControllers(MyController)
    ],
});
```
