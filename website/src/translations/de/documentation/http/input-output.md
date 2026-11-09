# Input & Output

Input und Output einer HTTP-Route sind die Daten, die an den Server gesendet werden, und die Daten, die an den Client zurückgesendet werden. Dazu gehören die Path-Parameter, Query-Parameter, der Body, die Header und die Response selbst. In diesem Kapitel sehen wir uns an, wie Daten in einer HTTP-Route gelesen, deserialisiert, validiert und geschrieben werden.

## Input

Alle folgenden Input-Varianten funktionieren sowohl für die funktionale API als auch für die Controller-API auf die gleiche Weise. Sie ermöglichen es, Daten typsicher und entkoppelt aus einem HTTP-Request zu lesen. Das führt nicht nur zu deutlich erhöhter Sicherheit, sondern vereinfacht auch das Unit-Testing, da streng genommen nicht einmal ein HTTP-Request-Objekt existieren muss, um die Route zu testen.

Alle Parameter werden automatisch in den definierten TypeScript-Type konvertiert (deserialisiert) und validiert. Dies geschieht über Deepkit Runtime Types und deren Features [Serialisierung](../runtime-types/serialization.md) und [Validierung](../runtime-types/validation).

Der Einfachheit halber werden im Folgenden alle Beispiele mit der funktionalen API gezeigt.

### Path-Parameter

Path-Parameter sind Werte, die aus der URL der Route extrahiert werden. Der Type des Wertes hängt vom Type des zugehörigen Parameters der Function oder Method ab. Die Konvertierung erfolgt automatisch mit dem Feature [Soft Type Conversion](../runtime-types/serialization#soft-type-conversion).

```typescript
router.get('/:text', (text: string) => {
    return 'Hello ' + text;
});
```

```sh
$ curl http://localhost:8080/galaxy
Hello galaxy
```

Wenn ein Path-Parameter mit einem anderen Type als string definiert ist, wird er korrekt konvertiert.

```typescript
router.get('/user/:id', (id: number) => {
    return `${id} ${typeof id}`;
});
```

```sh
$ curl http://localhost:8080/user/23
23 number
```

Auf die Types können auch zusätzliche Validierungs-Constraints angewendet werden.

```typescript
import { Positive } from '@deepkit/type';

router.get('/user/:id', (id: number & Positive) => {
    return `${id} ${typeof id}`;
});
```

Alle Validierungs-Types aus `@deepkit/type` können angewendet werden. Mehr dazu unter [HTTP-Validierung](#validation).

Für die Path-Parameter ist beim URL-Matching standardmäßig `[^]+` als regulärer Ausdruck gesetzt. Die RegExp dafür kann wie folgt angepasst werden:

```typescript
import { HttpRegExp } from '@deepkit/http';
import { Positive } from '@deepkit/type';

router.get('/user/:id', (id: HttpRegExp<number & Positive, '[0-9]+'>) => {
    return `${id} ${typeof id}`;
});
```

Dies ist nur in Ausnahmefällen notwendig, da die Types in Kombination mit Validierungs-Types die möglichen Werte oft bereits selbst korrekt einschränken.

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

Auch Query-Parameter werden automatisch deserialisiert und validiert.

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

Alle Validierungs-Types aus `@deepkit/type` können angewendet werden. Mehr dazu unter [HTTP-Validierung](#validation).

Warnung: Parameterwerte werden nicht escaped/sanitized. Werden sie in einer Route direkt in einem String als HTML zurückgegeben, entsteht eine Sicherheitslücke (XSS). Stellen Sie sicher, dass externen Eingaben niemals vertraut wird, und filtern/bereinigen/konvertieren Sie Daten, wo immer dies notwendig ist.

### Query-Model

Bei einer großen Anzahl von Query-Parametern kann es schnell unübersichtlich werden. Um hier wieder Ordnung zu schaffen, kann ein Model (Class oder Interface) verwendet werden, das alle möglichen Query-Parameter zusammenfasst.

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

Die Properties im angegebenen Model können alle TypeScript-Types und Validierungs-Types enthalten, die `@deepkit/type` unterstützt. Siehe die Kapitel [Serialisierung](../runtime-types/serialization.md) und [Validierung](../runtime-types/validation.md).

### Body

Für HTTP-Methoden, die einen HTTP-Body erlauben, kann auch ein Body-Model angegeben werden. Der Body-Content-Type des HTTP-Requests muss entweder `application/x-www-form-urlencoded`, `multipart/form-data` oder `application/json` sein, damit Deepkit diesen automatisch in JavaScript-Objekte konvertieren kann.

```typescript
import { HttpBody } from '@deepkit/http';

class HelloWorldBody {
    text!: string;
}

router.post('/', (body: HttpBody<HelloWorldBody>) => {
    return 'Hello ' + body.text;
}
```

### Header

### Stream

### Manuelle Behandlung der Validierung

Um die Validierung des Body-Models manuell zu übernehmen, kann der spezielle Type `HttpBodyValidation<T>` verwendet werden. Er ermöglicht es, auch ungültige Body-Daten zu empfangen und sehr gezielt auf Fehlermeldungen zu reagieren.

```typescript
import { HttpBodyValidation } from '@deepkit/http';

class HelloWorldBody {
    text!: string;
}

router.post('/', (body: HttpBodyValidation<HelloWorldBody>) => {
    if (!body.valid()) {
        // Houston, wir haben ein paar Fehler.
        const textError = body.getErrorMessageForPath('text');
        return 'Text is invalid, please fix it. ' + textError;
    }

    return 'Hello ' + body.text;
})
```

Sobald `valid()` den Wert `false` zurückgibt, können sich die Werte im angegebenen Model in einem fehlerhaften Zustand befinden. Das bedeutet, dass die Validierung fehlgeschlagen ist. Wird `HttpBodyValidation` nicht verwendet und ein fehlerhafter HTTP-Request empfangen, würde der Request direkt abgebrochen und der Code in der Function niemals ausgeführt. Verwenden Sie `HttpBodyValidation` nur, wenn beispielsweise Fehlermeldungen zum Body in derselben Route manuell verarbeitet werden sollen.

Die Properties im angegebenen Model können alle TypeScript-Types und Validierungs-Types enthalten, die `@deepkit/type` unterstützt. Siehe die Kapitel [Serialisierung](../runtime-types/serialization.md) und [Validierung](../runtime-types/validation.md).

### Datei-Upload

Mit einem speziellen Property-Type auf dem Body-Model kann dem Client das Hochladen von Dateien ermöglicht werden. Es können beliebig viele `UploadedFile` verwendet werden.

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

Standardmäßig speichert der Router alle hochgeladenen Dateien in einem temporären Ordner und entfernt sie, sobald der Code in der Route ausgeführt wurde. Es ist daher notwendig, die Datei unter dem in `path` angegebenen Pfad zu lesen und an einem dauerhaften Ort (lokale Festplatte, Cloud Storage, Datenbank) zu speichern.

## Validation

Validierung ist in einem HTTP-Server eine unverzichtbare Funktionalität, da fast immer mit Daten gearbeitet wird, die nicht vertrauenswürdig sind. Je mehr Stellen Daten validieren, desto stabiler ist der Server. Die Validierung in HTTP-Routen lässt sich bequem über Types und Validierungs-Constraints nutzen und wird mit einem hochoptimierten Validator aus `@deepkit/type` geprüft, sodass es diesbezüglich keine Performance-Probleme gibt. Es wird daher dringend empfohlen, diese Validierungsmöglichkeiten auch zu nutzen. Lieber einmal zu viel als einmal zu wenig.

Alle Eingaben wie Path-Parameter, Query-Parameter und Body-Parameter werden automatisch gegen den angegebenen TypeScript-Type validiert. Werden zusätzliche Constraints über Types aus `@deepkit/type` angegeben, werden auch diese geprüft.

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

Weitere Informationen dazu finden Sie unter [Validierung](../runtime-types/validation.md).

## Output

Eine Route kann verschiedene Datenstrukturen zurückgeben. Einige davon werden auf besondere Weise behandelt, wie etwa Redirects und Templates, während andere, wie einfache Objekte, schlicht als JSON gesendet werden.

### JSON

Standardmäßig werden normale JavaScript-Werte als JSON mit dem Header `applicationjson; charset=utf-8` an den Client zurückgegeben.

```typescript
router.get('/', () => {
    // wird als application/json gesendet
    return { hello: 'world' }
});
```

Wenn für die Function oder Method ein expliziter Return-Type angegeben ist, werden die Daten entsprechend diesem Type mit dem Deepkit JSON Serializer zu JSON serialisiert.

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

Um HTML zu senden, gibt es zwei Möglichkeiten. Entweder wird das Objekt `HtmlResponse` oder die Template Engine mit JSX verwendet.

```typescript
import { HtmlResponse } from '@deepkit/http';

router.get('/', () => {
    // wird als Content-Type: text/html gesendet
    return new HtmlResponse('<b>Hello World</b>');
});
```

```typescript
router.get('/', () => {
    // wird als Content-Type: text/html gesendet
    return <b>Hello
    World < /b>;
});
```

Die Template-Engine-Variante mit JSX hat den Vorteil, dass verwendete Variablen automatisch HTML-escaped werden. Siehe auch [Template](../template.md).

### Benutzerdefinierter Content-Type

Neben HTML und JSON ist es auch möglich, Text oder Binärdaten mit einem bestimmten Content-Type zu senden. Dies geschieht über das Objekt `Response`.

```typescript
import { Response } from '@deepkit/http';

router.get('/', () => {
    return new Response('<title>Hello World</title>', 'text/xml');
});
```

### HTTP-Errors

Durch das Werfen verschiedener HTTP-Errors ist es möglich, die Verarbeitung eines HTTP-Requests sofort zu unterbrechen und den entsprechenden HTTP-Status des Errors auszugeben.

```typescript
import { HttpNotFoundError } from '@deepkit/http';

router.get('/user/:id', async (id: number, database: Database) => {
    const user = await database.query(User).filter({ id }).findOneOrUndefined();
    if (!user) throw new HttpNotFoundError('User not found');
    return user;
});
```

Standardmäßig werden alle Errors als JSON an den Client zurückgegeben. Dieses Verhalten kann im Event-System unter dem Event `httpWorkflow.onControllerError` angepasst werden. Siehe den Abschnitt [HTTP-Events](./events.md).

| Error-Class               | Status |
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

Der Error `HttpAccessDeniedError` ist ein Sonderfall. Sobald er geworfen wird, springt der HTTP-Workflow (siehe [HTTP-Events](./events.md)) nicht zu `controllerError`, sondern zu `accessDenied`.

Benutzerdefinierte HTTP-Errors können mit `createHttpError` erstellt und geworfen werden.

```typescript
export class HttpMyError extends createHttpError(412, 'My Error Message') {
}
```

Geworfene Errors in einer Controller-Action werden vom HTTP-Workflow-Event `onControllerError` behandelt. Die Standardimplementierung gibt eine JSON-Response mit der Fehlermeldung und dem Statuscode zurück. Dies kann angepasst werden, indem auf dieses Event gehört und eine andere Response zurückgegeben wird.

```typescript
import { httpWorkflow } from '@deepkit/http';

new App()
    .listen(httpWorkflow.onControllerError, (event) => {
        if (event.error instanceof HttpMyError) {
            event.send(new Response('My Error Message', 'text/plain').status(500));
        } else {
            //für alle anderen Errors eine generische Fehlermeldung zurückgeben
            event.send(new Response('Something went wrong. Sorry about that.', 'text/plain').status(500));
        }
    })
    .listen(httpWorkflow.onAccessDenied, (event) => {
        event.send(new Response('Access denied. Try to login first.', 'text/plain').status(403));
    });
```

### Zusätzliche Header

Um den Header einer HTTP-Response zu ändern, können zusätzliche Methods auf den Objekten `Response`, `JSONResponse` und `HTMLResponse` aufgerufen werden.

```typescript
import { Response } from '@deepkit/http';

router.get('/', () => {
    return new Response('Access Denied', 'text/plain')
        .header('X-Reason', 'unknown')
        .status(403);
});
```

### Redirect

Um einen 301- oder 302-Redirect als Response zurückzugeben, können `Redirect.toRoute` oder `Redirect.toUrl` verwendet werden.

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

Die Method `Redirect.toRoute` verwendet hier den Routennamen. Wie ein Routenname festgelegt wird, ist im Abschnitt [HTTP-Routennamen](./getting-started.md#route-names) zu sehen. Enthält diese referenzierte Route Parameter (Query oder Path), können diese über das zweite Argument angegeben werden:

```typescript
router.get({ path: '/user/:id', name: 'user_detail' }, (id: number) => {

});

router.post('/user', (user: HttpBody<User>) => {
    //... User speichern und zu seiner Detailseite weiterleiten
    return Redirect.toRoute('user_detail', { id: 23 });
});
```

Alternativ kann mit `Redirect.toUrl` auf eine URL weitergeleitet werden.

```typescript
router.post('/user', (user: HttpBody<User>) => {
    //... User speichern und zu seiner Detailseite weiterleiten
    return Redirect.toUrl('/user/' + 23);
});
```

Standardmäßig verwenden beide eine 302-Weiterleitung. Dies kann über das Argument `statusCode` angepasst werden.

## Resolver

Der Router unterstützt eine Möglichkeit, komplexe Parameter-Types aufzulösen. Bei einer Route wie `/user/:id` kann diese `id` beispielsweise mithilfe eines Resolvers außerhalb der Route zu einem `user`-Objekt aufgelöst werden. Dies entkoppelt die HTTP-Abstraktion und den Routen-Code zusätzlich und vereinfacht so Testing und Modularität weiter.

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

Der Decorator `@http.resolveParameter` gibt an, welche Class mit dem `UserResolver` aufgelöst werden soll. Sobald die angegebene Class `User` als Parameter in der Function oder Method angegeben wird, wird der Resolver verwendet, um sie bereitzustellen.

Wird `@http.resolveParameter` an der Class angegeben, erhalten alle Methods dieser Class diesen Resolver. Der Decorator kann auch pro Method angewendet werden:

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

Das `User`-Objekt muss nicht zwingend von einem Parameter abhängen. Es könnte genauso gut von einer Session oder einem HTTP-Header abhängen und nur bereitgestellt werden, wenn der Benutzer angemeldet ist. In `RouteParameterResolverContext` stehen viele Informationen über den HTTP-Request zur Verfügung, sodass sich viele Anwendungsfälle abbilden lassen.

Grundsätzlich ist es auch möglich, komplexe Parameter-Types über den Dependency-Injection-Container aus dem `http`-Scope bereitstellen zu lassen, da diese ebenfalls in der Route-Function oder -Method verfügbar sind. Dies hat jedoch den Nachteil, dass keine asynchronen Function-Aufrufe verwendet werden können, da der DI-Container durchgehend synchron ist.
