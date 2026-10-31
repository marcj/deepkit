# Eingabe & Ausgabe

Die Eingabe und Ausgabe einer HTTP-Route sind die Daten, die an den Server gesendet werden und die Daten, die an den Client zurückgesendet werden. Dazu gehören die Path-Parameter, Query-Parameter, der Body, Header und die Response selbst. In diesem Kapitel betrachten wir, wie man Daten in einer HTTP-Route liest, deserialisiert, validiert und schreibt.

## Input

Alle folgenden Eingabevarianten funktionieren sowohl für die funktionale API als auch für die Controller-API identisch. Sie ermöglichen es, Daten typsicher und entkoppelt aus einer HTTP-Request zu lesen. Das führt nicht nur zu deutlich erhöhter Sicherheit, sondern vereinfacht auch Unit-Tests, da streng genommen nicht einmal ein HTTP-Request-Objekt existieren muss, um die Route zu testen.

Alle Parameter werden automatisch in den definierten TypeScript Type konvertiert (deserialisiert) und validiert. Dies geschieht über Deepkit Runtime Types und dessen Features [Serialisierung](../runtime-types/serialization.md) und [Validierung](../runtime-types/validation).

Der Einfachheit halber sind unten alle Beispiele mit der funktionalen API gezeigt.

### Path-Parameter

Path-Parameter sind Werte, die aus der URL der Route extrahiert werden. Der Type des Werts hängt vom Type am zugehörigen Parameter der Function oder Method ab. Die Konvertierung erfolgt automatisch mit dem Feature [Soft Type Conversion](../runtime-types/serialization#soft-type-conversion).

```typescript
router.get('/:text', (text: string) => {
    return 'Hello ' + text;
});
```

```sh
$ curl http://localhost:8080/galaxy
Hello galaxy
```

Wenn ein Path-Parameter als ein anderer Type als string definiert ist, wird er korrekt konvertiert.

```typescript
router.get('/user/:id', (id: number) => {
    return `${id} ${typeof id}`;
});
```

```sh
$ curl http://localhost:8080/user/23
23 number
```

Zusätzliche Validierungs-Constraints können ebenfalls auf die Types angewendet werden.

```typescript
import { Positive } from '@deepkit/type';

router.get('/user/:id', (id: number & Positive) => {
    return `${id} ${typeof id}`;
});
```

Alle Validation Types aus `@deepkit/type` können angewendet werden. Mehr dazu siehe [HTTP-Validierung](#validation).

Die Path-Parameter haben standardmäßig `[^]+` als regulären Ausdruck im URL-Matching gesetzt. Die RegExp kann dafür wie folgt angepasst werden:

```typescript
import { HttpRegExp } from '@deepkit/http';
import { Positive } from '@deepkit/type';

router.get('/user/:id', (id: HttpRegExp<number & Positive, '[0-9]+'>) => {
    return `${id} ${typeof id}`;
});
```

Dies ist nur in Ausnahmefällen notwendig, da häufig die Types in Kombination mit Validation Types bereits mögliche Werte korrekt einschränken.

### Query-Parameter

Query-Parameter sind Werte aus der URL nach dem Zeichen `?` und können mit dem Type `HttpQuery<T>` gelesen werden. Der Name des Parameters entspricht dem Namen des Query-Parameters.

```typescript
import { HttpQuery } from '@deepkit/http';

router.get('/', (text: HttpQuery<number>) => {
    return `Hello ${text}`;
});
```

```sh
$ curl http://localhost:8080/\?text\=galaxy
Hello galaxy
```

Query-Parameter werden ebenfalls automatisch deserialisiert und validiert.

```typescript
import { HttpQuery } from '@deepkit/http';
import { MinLength } from '@deepkit/type';

router.get('/', (text: HttpQuery<string> & MinLength<3>) => {
    return 'Hello ' + text;
}
```

```sh
$ curl http://localhost:8080/\?text\=galaxy
Hello galaxy
$ curl http://localhost:8080/\?text\=ga
error
```

Alle Validation Types aus `@deepkit/type` können angewendet werden. Mehr dazu siehe [HTTP-Validierung](#validation).

Warnung: Parameterwerte sind nicht escaped/sanitized. Deren direkte Rückgabe in einem String in einer Route als HTML eröffnet eine Sicherheitslücke (XSS). Stelle sicher, dass externen Eingaben niemals vertraut wird und filtere/sanitisieren/konvertiere Daten wo notwendig.

### Query-Modell

Bei einer großen Anzahl von Query-Parametern kann es schnell unübersichtlich werden. Um wieder Ordnung zu schaffen, kann ein Modell (Class oder Interface) verwendet werden, das alle möglichen Query-Parameter zusammenfasst.

```typescript
import { HttpQueries } from '@deepkit/http';

class HelloWorldQuery {
    text!: string;
    page: number = 0;
}

router.get('/', (query: HttpQueries<HelloWorldQuery>)
{
    return 'Hello ' + query.text + ' at page ' + query.page;
}
```

```sh
$ curl http://localhost:8080/\?text\=galaxy&page=1
Hello galaxy at page 1
```

Die Properties im angegebenen Modell können alle TypeScript Types und Validation Types enthalten, die `@deepkit/type` unterstützt. Siehe die Kapitel [Serialisierung](../runtime-types/serialization.md) und [Validierung](../runtime-types/validation.md).

### Body

Für HTTP-Methoden, die einen HTTP-Body erlauben, kann ebenfalls ein Body-Modell angegeben werden. Der Body Content-Type des HTTP-Requests muss entweder `application/x-www-form-urlencoded`, `multipart/form-data` oder `application/json` sein, damit Deepkit dies automatisch in JavaScript-Objekte konvertieren kann.

```typescript
import { HttpBody } from '@deepkit/type';

class HelloWorldBody {
    text!: string;
}

router.post('/', (body: HttpBody<HelloWorldBody>) => {
    return 'Hello ' + body.text;
}
```

### Header

### Stream

### Manuelles Validierungs-Handling

Um die Validierung des Body-Modells manuell zu übernehmen, kann ein spezieller Type `HttpBodyValidation<T>` verwendet werden. Er ermöglicht es, auch invalide Body-Daten zu empfangen und sehr spezifisch auf Fehlermeldungen zu reagieren.

```typescript
import { HttpBodyValidation } from '@deepkit/type';

class HelloWorldBody {
    text!: string;
}

router.post('/', (body: HttpBodyValidation<HelloWorldBody>) => {
    if (!body.valid()) {
        // Houston, wir haben einige Fehler.
        const textError = body.getErrorMessageForPath('text');
        return 'Text is invalid, please fix it. ' + textError;
    }

    return 'Hello ' + body.text;
})
```

Sobald `valid()` `false` zurückgibt, können die Werte im angegebenen Modell in einem fehlerhaften Zustand sein. Das bedeutet, dass die Validierung fehlgeschlagen ist. Wenn `HttpBodyValidation` nicht verwendet wird und ein fehlerhafter HTTP-Request empfangen wird, würde die Request direkt abgebrochen und der Code in der Function würde niemals ausgeführt werden. Verwende `HttpBodyValidation` nur, wenn z. B. Fehlermeldungen bezüglich des Bodys in derselben Route manuell verarbeitet werden sollen.

Die Properties im angegebenen Modell können alle TypeScript Types und Validation Types enthalten, die `@deepkit/type` unterstützt. Siehe die Kapitel [Serialisierung](../runtime-types/serialization.md) und [Validierung](../runtime-types/validation.md).

### Datei-Upload

Ein spezieller Property Type im Body-Modell kann verwendet werden, um dem Client das Hochladen von Dateien zu erlauben. Es können beliebig viele `UploadedFile` verwendet werden.

```typescript
import { UploadedFile, HttpBody } from '@deepkit/http';
import { readFileSync } from 'fs';

class HelloWordBody {
    file!: UploadedFile;
}

router.post('/', (body: HttpBody<HelloWordBody>) => {
    const content = readFileSync(body.file.path);

    return {
        uploadedFile: body.file
    };
})
```

```sh
$ curl http://localhost:8080/ -X POST -H "Content-Type: multipart/form-data" -F "file=@Downloads/23931.png"
{
    "uploadedFile": {
        "size":6430,
        "path":"/var/folders/pn/40jxd3dj0fg957gqv_nhz5dw0000gn/T/upload_dd0c7241133326bf6afddc233e34affa",
        "name":"23931.png",
        "type":"image/png",
        "lastModifiedDate":"2021-06-11T19:19:14.775Z"
    }
}
```

Standardmäßig speichert der Router alle hochgeladenen Dateien in einem temporären Ordner und entfernt sie, sobald der Code in der Route ausgeführt wurde. Es ist daher notwendig, die Datei im angegebenen Pfad in `path` zu lesen und an einem dauerhaften Ort (lokale Festplatte, Cloud-Speicher, Datenbank) zu speichern.

## Validierung

Validierung in einem HTTP-Server ist eine zwingend notwendige Funktionalität, denn fast immer wird mit nicht vertrauenswürdigen Daten gearbeitet. Je mehr Stellen Daten validiert werden, desto stabiler ist der Server. Validierung in HTTP-Routen kann bequem über Types und Validierungs-Constraints genutzt werden und wird mit einem hochoptimierten Validator aus `@deepkit/type` geprüft, sodass es diesbezüglich keine Performance-Probleme gibt. Es wird daher dringend empfohlen, diese Validierungsmöglichkeiten zu nutzen. Lieber einmal zu viel als einmal zu wenig.

Alle Inputs wie Path-Parameter, Query-Parameter und Body-Parameter werden automatisch für den angegebenen TypeScript Type validiert. Wenn zusätzliche Constraints über Types von `@deepkit/type` angegeben sind, werden diese ebenfalls geprüft.

```typescript
import { HttpQuery, HttpQueries, HttpBody } from '@deepkit/http';
import { MinLength } from '@deepkit/type';

router.get('/:text', (text: string & MinLength<3>) => {
    return 'Hello ' + text;
}

router.get('/', (text: HttpQuery<string> & MinLength<3>) => {
    return 'Hello ' + text;
}

interface MyQuery {
    text: string & MinLength<3>;
}

router.get('/', (query: HttpQueries<MyQuery>) => {
    return 'Hello ' + query.text;
});

router.post('/', (body: HttpBody<MyQuery>) => {
    return 'Hello ' + body.text;
});
```

Siehe [Validierung](../runtime-types/validation.md) für weitere Informationen dazu.

## Ausgabe

Eine Route kann verschiedene Datenstrukturen zurückgeben. Einige davon werden speziell behandelt, wie Redirects und Templates, und andere, wie einfache Objekte, werden einfach als JSON gesendet.

### JSON

Standardmäßig werden normale JavaScript-Werte als JSON mit dem Header `applicationjson; charset=utf-8` an den Client zurückgegeben.

```typescript
router.get('/', () => {
    // wird als application/json gesendet
    return { hello: 'world' }
});
```

Wenn für die Function oder Method ein expliziter Return Type angegeben ist, werden die Daten mit dem Deepkit JSON Serializer gemäß diesem Type zu JSON serialisiert.

```typescript
interface ResultType {
    hello: string;
}

router.get('/', (): ResultType => {
    // wird als application/json gesendet und additionalProperty wird entfernt
    return { hello: 'world', additionalProperty: 'value' };
});
```

### HTML

Zum Senden von HTML gibt es zwei Möglichkeiten. Entweder wird das Objekt `HtmlResponse` oder die Template-Engine mit JSX verwendet.

```typescript
import { HtmlResponse } from '@deepkit/http';

router.get('/', () => {
    // wird mit Content-Type: text/html gesendet
    return new HtmlResponse('<b>Hello World</b>');
});
```

```typescript
router.get('/', () => {
    // wird mit Content-Type: text/html gesendet
    return <b>Hello
    World < /b>;
});
```

Die Template-Engine-Variante mit JSX hat den Vorteil, dass verwendete Variablen automatisch HTML-escaped werden. Siehe auch [Template](../template.md).

### Benutzerdefinierter Content-Type

Neben HTML und JSON ist es auch möglich, Text- oder Binärdaten mit einem bestimmten Content-Type zu senden. Dies geschieht über das Objekt `Response`.

```typescript
import { Response } from '@deepkit/http';

router.get('/', () => {
    return new Response('<title>Hello World</title>', 'text/xml');
});
```

### HTTP-Fehler

Durch Werfen verschiedener HTTP-Fehler ist es möglich, die Verarbeitung eines HTTP-Requests sofort zu unterbrechen und den entsprechenden HTTP-Status des Fehlers auszugeben.

```typescript
import { HttpNotFoundError } from '@deepkit/http';

router.get('/user/:id', async (id: number, database: Database) => {
    const user = await database.query(User).filter({ id }).findOneOrUndefined();
    if (!user) throw new HttpNotFoundError('User not found');
    return user;
});
```

Standardmäßig werden alle Fehler als JSON an den Client zurückgegeben. Dieses Verhalten kann im Event-System unter dem Event `httpWorkflow.onControllerError` angepasst werden. Siehe den Abschnitt [HTTP-Events](./events.md).

| Error Class               | Status |
|---------------------------|--------|
| HttpBadRequestError       | 400    |
| HttpUnauthorizedError     | 401    |
| HttpAccessDeniedError     | 403    |
| HttpNotFoundError         | 404    |
| HttpMethodNotAllowedError | 405    |
| HttpNotAcceptableError    | 406    |
| HttpTimeoutError          | 408    |
| HttpConflictError         | 409    |
| HttpGoneError             | 410    |
| HttpTooManyRequestsError  | 429    |
| HttpInternalServerError   | 500    |
| HttpNotImplementedError   | 501    |

Der Fehler `HttpAccessDeniedError` ist ein Spezialfall. Sobald er geworfen wird, springt der HTTP-Workflow (siehe [HTTP-Events](./events.md)) nicht zu `controllerError`, sondern zu `accessDenied`.

Eigene HTTP-Fehler können mit `createHttpError` erstellt und geworfen werden.

```typescript
export class HttpMyError extends createHttpError(412, 'My Error Message') {
}
```

Geworfene Fehler in einer Controller-Action werden vom HTTP-Workflow-Event `onControllerError` behandelt. Die Standardimplementierung besteht darin, eine JSON-Response mit der Fehlermeldung und dem Statuscode zurückzugeben. Dies kann angepasst werden, indem man auf dieses Event lauscht und eine andere Response zurückgibt.

```typescript
import { httpWorkflow } from '@deepkit/http';

new App()
    .listen(httpWorkflow.onControllerError, (event) => {
        if (event.error instanceof HttpMyError) {
            event.send(new Response('My Error Message', 'text/plain').status(500));
        } else {
            // für alle anderen Fehler eine generische Fehlermeldung zurückgeben
            event.send(new Response('Something went wrong. Sorry about that.', 'text/plain').status(500));
        }
    })
    .listen(httpWorkflow.onAccessDenied, (event) => {
        event.send(new Response('Access denied. Try to login first.', 'text/plain').status(403));
    });
```

### Zusätzliche Header

Um den Header einer HTTP-Response zu ändern, können zusätzliche Methods an den Objekten `Response`, `JSONResponse` und `HTMLResponse` aufgerufen werden.

```typescript
import { Response } from '@deepkit/http';

router.get('/', () => {
    return new Response('Access Denied', 'text/plain')
        .header('X-Reason', 'unknown')
        .status(403);
});
```

### Redirect

Um eine 301- oder 302-Weiterleitung als Response zurückzugeben, können `Redirect.toRoute` oder `Redirect.toUrl` verwendet werden.

```typescript
import { Redirect } from '@deepkit/http';

router.get({ path: '/', name: 'homepage' }, () => {
    return <b>Hello
    World < /b>;
});

router.get({ path: '/registration/complete' }, () => {
    return Redirect.toRoute('homepage');
});
```

Die Method `Redirect.toRoute` verwendet hier den Routenname. Wie man einen Routenname setzt, ist im Abschnitt [HTTP-Routennamen](./getting-started.md#route-names) zu sehen. Wenn diese referenzierte Route (Query oder Path) Parameter enthält, können diese über das zweite Argument angegeben werden:

```typescript
router.get({ path: '/user/:id', name: 'user_detail' }, (id: number) => {

});

router.post('/user', (user: HttpBody<User>) => {
    //... store user and redirect to its detail page
    return Redirect.toRoute('user_detail', { id: 23 });
});
```

Alternativ kann mit `Redirect.toUrl` auf eine URL weitergeleitet werden.

```typescript
router.post('/user', (user: HttpBody<User>) => {
    //... store user and redirect to its detail page
    return Redirect.toUrl('/user/' + 23);
});
```

Standardmäßig verwenden beide eine 302-Weiterleitung. Dies kann über das Argument `statusCode` angepasst werden.

## Resolver

Der Router unterstützt eine Möglichkeit, komplexe Parameter Types zu resolven. Beispiel: Bei einer Route wie `/user/:id` kann diese `id` mittels eines Resolvers außerhalb der Route zu einem `user`-Objekt aufgelöst werden. Das entkoppelt die HTTP-Abstraktion und den Routen-Code weiter und vereinfacht Tests und Modularität zusätzlich.

```typescript
import { App } from '@deepkit/app';
import { FrameworkModule } from '@deepkit/framework';
import { http, RouteParameterResolverContext, RouteParameterResolver } from '@deepkit/http';

class UserResolver implements RouteParameterResolver {
    constructor(protected database: Database) {
    }

    async resolve(context: RouteParameterResolverContext) {
        if (!context.parameters.id) throw new Error('No :id given');
        return await this.database.getUser(parseInt(context.parameters.id, 10));
    }
}

@http.resolveParameter(User, UserResolver)
class MyWebsite {
    @http.GET('/user/:id')
    getUser(user: User) {
        return 'Hello ' + user.username;
    }
}

new App({
    controllers: [MyWebsite],
    providers: [UserDatabase, UserResolver],
    imports: [new FrameworkModule]
})
    .run();
```

Der Decorator in `@http.resolveParameter` gibt an, welche Class mit dem `UserResolver` aufzulösen ist. Sobald die angegebene Class `User` als Parameter in der Function oder Method angegeben ist, wird der Resolver verwendet, um sie bereitzustellen.

Wenn `@http.resolveParameter` an der Class angegeben ist, erhalten alle Methods dieser Class diesen Resolver. Der Decorator kann auch pro Method angewendet werden:

```typescript
class MyWebsite {
    @http.GET('/user/:id').resolveParameter(User, UserResolver)
    getUser(user: User) {
        return 'Hello ' + user.username;
    }
}
```

Auch die funktionale API kann verwendet werden:

```typescript

router.add(
    http.GET('/user/:id').resolveParameter(User, UserResolver),
    (user: User) => {
        return 'Hello ' + user.username;
    }
);
```

Das `User`-Objekt muss nicht zwingend von einem Parameter abhängen. Es könnte ebenso von einer Session oder einem HTTP-Header abhängen und nur bereitgestellt werden, wenn der Benutzer eingeloggt ist. In `RouteParameterResolverContext` stehen viele Informationen über den HTTP-Request zur Verfügung, sodass viele Anwendungsfälle abgebildet werden können.

Grundsätzlich ist es auch möglich, komplexe Parameter Types über den Dependency Injection-Container aus dem `http`-Scope bereitstellen zu lassen, da diese ebenfalls in der Routen-Function oder -Method verfügbar sind. Dies hat jedoch den Nachteil, dass keine asynchronen Function-Aufrufe verwendet werden können, da der DI-Container durchgängig synchron ist.