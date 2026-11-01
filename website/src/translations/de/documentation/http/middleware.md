# Middleware

HTTP-Middlewares ermöglichen es dir, dich als Alternative zu HTTP-Events in den Request/Response-Zyklus einzuklinken. Die API erlaubt es dir, alle Middlewares aus dem Express/Connect-Framework zu verwenden.

Eine Middleware kann entweder eine Klasse (die vom Dependency Injection Container instanziiert wird) oder eine einfache Funktion sein.

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

## Global

Mit httpMiddleware.for(MyMiddleware) wird eine Middleware global für alle Routen registriert.

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

## Pro Controller

Du kannst Middlewares auf zwei Arten auf einen oder mehrere Controller beschränken. Entweder mit `@http.controller` oder mit `httpMiddleware.for(T).forControllers()`. Mit `excludeControllers` kannst du Controller ausschließen.

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

## Pro Routenname

Mit `forRouteNames` und dem Gegenstück `excludeRouteNames` kannst du die Ausführung einer Middleware nach Routennamen filtern.

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


## Pro Action/Route

Um eine Middleware nur für eine bestimmte Route auszuführen, kannst du entweder `@http.GET().middleware()` oder
`httpMiddleware.for(T).forRoute()` verwenden, wobei forRoute mehrere Optionen zum Filtern von Routen bietet.

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

`forRoutes()` erlaubt als erstes Argument mehrere Möglichkeiten, Routen zu filtern.

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

## Pfadmuster

`path` unterstützt die Wildcard *.

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

## HTTP-Methode

Filtere alle Routen nach einer HTTP-Methode.

```typescript
httpMiddleware.for(MyMiddleware).forRoutes({
    httpMethod: 'GET'
})
```

## Kategorie

Mit `category` und dem Gegenstück `excludeCategory` kannst du nach Routenkategorie filtern.

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

## Gruppe

Mit `group` und dem Gegenstück `excludeGroup` kannst du nach Routengruppe filtern.

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

## Pro Modul

Du kannst die Ausführung einer Middleware auf ein ganzes Modul beschränken.

```typescript
httpMiddleware.for(MyMiddleware).forModule(ApiModule)
```


## Pro eigenem Modul

Um eine Middleware für alle Controller/Routen des Moduls auszuführen, in dem die Middleware registriert wurde, verwende `forSelfModules()`.

```typescript
const ApiModule = new AppModule({}, {
    controllers: [MainController, UsersCommand],
    providers: [MyMiddleware],
    middlewares: [
        //für alle registrierten Controller desselben Moduls
        httpMiddleware.for(MyMiddleware).forSelfModules(),
    ],
});
```

## next() aufrufen

Eine Middleware ruft entweder `next()` auf, um mit der nächsten Middleware und schließlich dem Controller fortzufahren, oder sie beendet die Response selbst, zum Beispiel mit `response.end()`. Dann wird der Controller nicht ausgeführt und `next()` darf nicht aufgerufen werden. `onResponse`-Listener und der HTTP-Logger laufen trotzdem.

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

Der Aufruf von `next(error)` oder das Werfen eines Errors (auch in einer asynchronen Middleware) lässt den Request fehlschlagen:

- Ein `HttpError` wie `HttpUnauthorizedError` wird, wie in einem Controller, mit seinem Statuscode und seiner Nachricht als JSON beantwortet.
- Jeder andere Error wird geloggt und mit 500 "Internal error" beantwortet.

Hat die Middleware die Response bereits beendet, bleibt die Response unverändert.

## Timeout

Standardmäßig hat eine Middleware kein Timeout. Mit `timeout(milliseconds)` lässt eine Middleware, die innerhalb dieser Zeit weder `next()` aufruft noch die Response beendet, den Request mit `HttpGatewayTimeoutError` (504) fehlschlagen, und es wird eine Warnung geloggt. Ein späterer Aufruf von `next()` wird ignoriert.

```typescript
const ApiModule = new AppModule({}, {
    controllers: [MainController, UsersCommand],
    providers: [MyMiddleware],
    middlewares: [
        //für alle registrierten Controller desselben Moduls
        httpMiddleware.for(MyMiddleware).timeout(15_000),
    ],
});
```

## Mehrere Regeln

Um mehrere Filter zu kombinieren, kannst du Methodenaufrufe verketten.

```typescript
const ApiModule = new AppModule({}, {
    controllers: [MyController],
    providers: [MyMiddleware],
    middlewares: [
        httpMiddleware.for(MyMiddleware).forControllers(MyController).excludeRouteNames('secondRoute')
    ],
});
```

## Express-Middleware

Fast alle Express-Middlewares werden unterstützt. Solche, die auf bestimmte Request-Methoden von Express zugreifen, werden noch nicht unterstützt.

```typescript
import * as compression from 'compression';

const ApiModule = new AppModule({}, {
    middlewares: [
        httpMiddleware.for(compress()).forControllers(MyController)
    ],
});
```
