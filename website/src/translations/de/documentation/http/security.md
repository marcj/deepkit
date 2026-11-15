# Sicherheit

Deepkit HTTP validiert alle Eingaben anhand Ihrer TypeScript-Typen und gibt keine internen Fehlerdetails an den Client weiter. Authentifizierung, Autorisierung, CORS, Security-Header und Rate Limiting sind nicht fest im Framework verankert. Stattdessen implementieren Sie diese mit [HTTP-Events](./events.md) oder [Middlewares](./middleware.md), sodass sie genau zu Ihrer Anwendung passen.

Diese Seite zeigt die eingebauten Schutzmechanismen und wie Sie den Rest mit den verfügbaren APIs implementieren.

## Eingabevalidierung

Alle Routen-Parameter (Path, Query, Header, Body) werden in den deklarierten Typ konvertiert und validiert, bevor die Route aufgerufen wird. Ein Request mit ungültigen Daten erreicht Ihren Code nie und wird mit Status 400 beantwortet. Dies ist Ihre erste Verteidigungslinie gegen Injection-Angriffe und fehlerhafte Daten.

```typescript
import { http, HttpBody, HttpQuery } from '@deepkit/http';
import { Email, MaxLength, Maximum, MinLength, Pattern, Positive } from '@deepkit/type';

const slug = /^[a-z0-9-]+$/;

class RegisterBody {
    email!: Email;
    username!: string & MinLength<3> & MaxLength<32> & Pattern<typeof slug>;
}

class UserController {
    @http.POST('/register')
    register(body: HttpBody<RegisterBody>) {
        // body ist garantiert ein gültiger RegisterBody
    }

    @http.GET('/users')
    list(limit: HttpQuery<number & Positive & Maximum<100>> = 20) {
        // limit ist eine Zahl zwischen 1 und 100
    }
}
```

```sh
$ curl -X POST http://localhost:8080/register -H 'Content-Type: application/json' -d '{"email": "nope", "username": "a"}'
{"message":"Validation error:...","errors":[{"path":"email","code":"pattern",...},{"path":"username","code":"minLength",...}]}
```

Properties, die nicht Teil des Typs sind, werden aus dem Body entfernt. Sendet ein Client `{"email": "...", "username": "peter", "isAdmin": true}`, erhält der Controller ein Objekt ohne `isAdmin`. Dies verhindert Mass-Assignment-Schwachstellen, solange der Body-Typ nur die Properties enthält, die der Client setzen darf. Verwenden Sie einen eigenen Body-Typ (oder `Pick<User, 'email' | 'username'>`) statt Ihrer vollständigen Entity.

Begrenzen Sie die Länge von Strings und die Größe von Arrays mit `MaxLength` sowie den Wertebereich von Zahlen mit `Maximum`/`Minimum`, damit Clients keine beliebig großen Werte an Ihre Datenbank oder Business-Logik senden können.

Siehe [Eingabe & Ausgabe](./input-output.md) und [Validierung](../runtime-types/validation.md) für alle verfügbaren Typen.

## Authentifizierung

Authentifizierung erfolgt am besten im Event `httpWorkflow.onAuth`. Es wird ausgeführt, nachdem die Route aufgelöst wurde und bevor die Routen-Parameter aufgelöst werden, sodass Sie Zugriff auf die Route und ihre Metadaten haben. Event-Listener werden vom Dependency-Injection-Container erstellt, daher können Sie Ihre eigenen Services injizieren.

Das folgende Beispiel liest einen Bearer-Token, lädt den Benutzer und speichert ihn in `request.store`. Ein HTTP-scoped Provider stellt den Benutzer den Controllern per Dependency Injection zur Verfügung.

```typescript
import { App } from '@deepkit/app';
import { eventDispatcher } from '@deepkit/event';
import { FrameworkModule } from '@deepkit/framework';
import { http, HttpRequest, HttpUnauthorizedError, httpWorkflow } from '@deepkit/http';

class User {
    constructor(public id: number, public role: 'admin' | 'user') {
    }
}

class UserRepository {
    async findByToken(token: string): Promise<User | undefined> {
        //den Token in Ihrer Datenbank nachschlagen
        return undefined;
    }
}

class AuthListener {
    constructor(private users: UserRepository) {
    }

    @eventDispatcher.listen(httpWorkflow.onAuth)
    async onAuth(event: typeof httpWorkflow.onAuth.event) {
        const header = event.request.headers.authorization;
        if (!header?.startsWith('Bearer ')) return;

        const user = await this.users.findByToken(header.slice('Bearer '.length));
        if (user) event.request.store.user = user;
    }
}

class ProfileController {
    @http.GET('/me')
    me(user: User) {
        return { id: user.id };
    }
}

new App({
    controllers: [ProfileController],
    providers: [
        UserRepository,
        {
            provide: User, scope: 'http',
            useFactory(request: HttpRequest): User {
                if (!request.store.user) throw new HttpUnauthorizedError('Not logged in');
                return request.store.user;
            }
        },
    ],
    listeners: [AuthListener],
    imports: [new FrameworkModule()],
}).run();
```

```sh
$ curl http://localhost:8080/me
{"message":"Not logged in"}  # Status 401
$ curl http://localhost:8080/me -H 'Authorization: Bearer secret-token'
{"id":2}
```

Jede Route, die einen `User`-Parameter deklariert, erfordert nun einen angemeldeten Benutzer; Routen ohne diesen bleiben öffentlich. Der in der Factory geworfene `HttpUnauthorizedError` wird in eine 401-Response umgewandelt.

Statt eines Bearer-Tokens können Sie auf die gleiche Weise ein Session-Cookie oder einen API-Key-Header lesen oder ein JWT verifizieren. Um den Request-Body in einem Listener zu lesen (z. B. für ein Login-Formular), verwenden Sie `HttpRequestParser<T>`, da der Body asynchron geparst wird:

```typescript
import { HttpRequestParser, httpWorkflow } from '@deepkit/http';

app.listen(httpWorkflow.onAuth, async (event, parser: HttpRequestParser<{ apiKey?: string }>) => {
    const data = await parser();
    //data.apiKey stammt aus Headern, Body oder Query
});
```

Eine weitere Möglichkeit ist ein [Parameter-Resolver](./input-output.md#resolver), der den Benutzer nur für Routen auflöst, die ihn verwenden.

## Autorisierung

Um eine Route auf bestimmte Benutzer zu beschränken, hängen Sie Metadaten an die Route an und prüfen diese in einem Listener. Routen unterstützen Gruppen via `.group()` und beliebige Werte via `.data()`. Beides ist in allen HTTP-Events über `event.route` verfügbar.

```typescript
class AdminController {
    @http.GET('/admin/stats').data('role', 'admin')
    stats(user: User) {
        return { users: 1000 };
    }

    @http.GET('/admin/users').group('admin')
    users(user: User) {
        return [];
    }
}

app.listen(httpWorkflow.onAuth, (event) => {
    const user: User | undefined = event.request.store.user;

    const role = event.route.data.get('role');
    if (role && user?.role !== role) {
        event.accessDenied();
        return;
    }

    if (event.route.groups.includes('admin') && user?.role !== 'admin') {
        event.accessDenied();
    }
}, 10);
```

Das dritte Argument ist die Reihenfolge des Listeners. Mit `10` läuft er nach dem Authentifizierungs-Listener (Standard-Reihenfolge `0`), sodass `request.store.user` bereits gesetzt ist, und vor dem Standard-Handler des HTTP-Moduls (Reihenfolge `100`). Alternativ erledigen Sie beides im selben Listener.

Für den funktionalen Router verwenden Sie die Optionen `groups` und `data`:

```typescript
router.get({ path: '/admin/stats', data: { role: 'admin' }, groups: ['admin'] }, (user: User) => {
    return { users: 1000 };
});
```

`event.accessDenied()` springt in den Workflow-Zustand `accessDenied`, der standardmäßig mit Status 403 antwortet. Innerhalb eines Controllers erreichen Sie dasselbe, indem Sie `HttpAccessDeniedError` werfen. Für Prüfungen, die von den geladenen Daten abhängen (z. B. „Ist dieser Benutzer der Eigentümer dieses Dokuments?“), führen Sie die Prüfung im Controller oder Service durch:

```typescript
import { HttpAccessDeniedError, HttpNotFoundError } from '@deepkit/http';

class DocumentController {
    @http.GET('/document/:id')
    async get(id: number, user: User, documents: DocumentRepository) {
        const document = await documents.find(id);
        if (!document) throw new HttpNotFoundError();
        if (document.ownerId !== user.id) throw new HttpAccessDeniedError();
        return document;
    }
}
```

Um die Response bei verweigertem Zugriff zu ändern, lauschen Sie auf `httpWorkflow.onAccessDenied`:

```typescript
import { httpWorkflow, JSONResponse } from '@deepkit/http';

app.listen(httpWorkflow.onAccessDenied, (event) => {
    if (event.sent) return;
    event.send(new JSONResponse({ message: 'Access denied' }, 403));
});
```

## Fehlerbehandlung

Fehler, die keine HTTP-Fehler sind (z. B. eine fehlschlagende Datenbankabfrage), werden auf dem Server geloggt und mit einem generischen `500 Internal error` beantwortet. Stack-Traces und Fehlermeldungen werden unabhängig von der Umgebung niemals an den Client gesendet.

```typescript
class MyController {
    @http.GET('/crash')
    crash() {
        throw new Error('Connection to db.internal:5432 failed');
    }
}
```

```sh
$ curl http://localhost:8080/crash
Internal error
```

Die Meldungen von HTTP-Fehlern wie `HttpNotFoundError` oder `HttpBadRequestError` *werden* an den Client gesendet, da sie für den Client bestimmt sind. Schreiben Sie keine internen Informationen hinein. Validierungsfehler enthalten den Pfad, den Fehlercode und den ungültigen Wert.

Um die Fehler-Responses zu ändern, lauschen Sie auf `httpWorkflow.onControllerError` (im Controller geworfene Fehler) und `httpWorkflow.onParametersFailed` (Fehler beim Auflösen der Parameter, z. B. Validierungsfehler). Siehe [HTTP-Fehler](./input-output.md#http-errors).

## Request-Größe und Timeouts

Bodies von `multipart/form-data`- und `application/x-www-form-urlencoded`-Requests werden mit Limits geparst, die Sie über die Option `parser` der HTTP-Konfiguration einstellen können:

```typescript
new App({
    imports: [
        new FrameworkModule({
            http: {
                parser: {
                    maxFileSize: 10 * 1024 * 1024,      //pro Datei, Standard 200 MB
                    maxTotalFileSize: 20 * 1024 * 1024, //alle Dateien eines Requests, Standard maxFileSize
                    maxFiles: 5,                        //Standard Infinity
                    maxFields: 100,                     //Standard 1000
                    maxFieldsSize: 1024 * 1024,         //alle Nicht-Datei-Felder zusammen, Standard 20 MB
                },
            },
        }),
    ],
}).run();
```

Wenn Sie `HttpModule` ohne das Framework verwenden, übergeben Sie dieselben Optionen an `new HttpModule({ parser: {...} })`. Ein Request, der ein Datei-Limit überschreitet, wird mit `413 Payload Too Large` (`HttpPayloadTooLargeError`) abgelehnt, bevor der Controller aufgerufen wird.

JSON-Bodies haben kein eingebautes Größenlimit. Begrenzen Sie sie mit einer Middleware, die den `Content-Length`-Header prüft. Middlewares laufen, bevor der Body gelesen wird, sodass ein zu großer Body nie geparst wird:

```typescript
import { httpMiddleware, HttpRequest, HttpResponse } from '@deepkit/http';

function bodyLimit(maxBytes: number) {
    return (request: HttpRequest, response: HttpResponse, next: (err?: any) => void) => {
        const length = Number(request.headers['content-length'] || 0);
        if (length > maxBytes) {
            response.writeHead(413, { 'Content-Type': 'text/plain' });
            response.end('Payload too large');
            return;
        }
        next();
    };
}

new App({
    middlewares: [httpMiddleware.for(bodyLimit(1024 * 1024))],
    imports: [new FrameworkModule()],
}).run();
```

Requests mit `Transfer-Encoding: chunked` haben keinen `Content-Length`-Header. Begrenzen Sie in Produktion die Body-Größe zusätzlich in Ihrem Reverse Proxy (z. B. `client_max_body_size` in nginx).

Wenn der Node.js-Server des Deepkit Frameworks direkt erreichbar ist, konfigurieren Sie dessen Timeouts und Limits, um sich vor langsamen Clients zu schützen:

```typescript
new FrameworkModule({
    http: {
        headersTimeout: 20_000,  //ms, um die vollständigen Header zu empfangen
        requestTimeout: 60_000,  //ms, um den vollständigen Request zu empfangen
        keepAliveTimeout: 5_000,
        maxHeadersCount: 100,
        maxRequestsPerSocket: 1000,
    },
})
```

## Datei-Uploads

Hochgeladene Dateien sind als `UploadedFile` verfügbar (siehe [Datei-Upload](./input-output.md#file-upload)). Ein `UploadedFile` kann nur vom Body-Parser des Frameworks erstellt werden. Sendet ein Client ein JSON-Objekt, das wie eine hochgeladene Datei aussieht (z. B. mit `path: '/etc/passwd'`), schlägt die Validierung mit dem Fehlercode `uploadSecurity` fehl.

Hochgeladene Dateien werden in einem temporären Verzeichnis gespeichert und nach dem Request gelöscht. Beachten Sie, dass `name` und `type` vom Client gesendet werden und nicht vertrauenswürdig sind: Verwenden Sie `name` nicht als Dateipfad und prüfen Sie den Dateiinhalt, wenn der Typ relevant ist.

```typescript
import { http, HttpBadRequestError, HttpBody, UploadedFile } from '@deepkit/http';
import { copyFile } from 'fs/promises';
import { randomUUID } from 'crypto';

class AvatarController {
    @http.POST('/avatar')
    async upload(body: HttpBody<{ file: UploadedFile }>) {
        if (body.file.size > 2 * 1024 * 1024) throw new HttpBadRequestError('File too large');
        //body.file.name niemals als Pfad verwenden
        await copyFile(body.file.path, `/var/uploads/${randomUUID()}`);
    }
}
```

## CORS

Es gibt keine eingebaute CORS-Behandlung. Fügen Sie die Header in einem `onRequest`-Listener hinzu und beantworten Sie Preflight-Requests (`OPTIONS`) in einem `onRoute`-Listener, bevor der Router läuft. Da der Listener vor dem Router läuft, funktioniert dies auch für Routen, die keine `OPTIONS`-Methode definieren.

```typescript
import { httpWorkflow, Response } from '@deepkit/http';

const allowedOrigins = ['https://app.example.com'];

app.listen(httpWorkflow.onRequest, (event) => {
    const origin = event.request.headers.origin;
    if (origin && allowedOrigins.includes(origin)) {
        event.response.setHeader('Access-Control-Allow-Origin', origin);
        event.response.setHeader('Access-Control-Allow-Credentials', 'true');
        event.response.setHeader('Vary', 'Origin');
    }
});

app.listen(httpWorkflow.onRoute, (event) => {
    if (event.request.method !== 'OPTIONS') return;
    event.response.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, PATCH, DELETE');
    event.response.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
    event.response.setHeader('Access-Control-Max-Age', '600');
    event.send(new Response('', 'text/plain').status(204));
});
```

Spiegeln Sie nur Origins aus einer Allowlist zurück. Wird jeder beliebige `Origin`-Header zusammen mit `Access-Control-Allow-Credentials: true` zurückgespiegelt, kann jede Website authentifizierte Requests an Ihre API senden.

Alternativ kann eine Express/Connect-CORS-Middleware mit `httpMiddleware.for()` registriert werden, siehe [Middleware](./middleware.md). Beachten Sie, dass Middlewares nur für Requests laufen, die auf eine Route passen.

## Security-Header

Header, die in einem `onRequest`-Listener auf `event.response` gesetzt werden, werden mit jeder Response gesendet, einschließlich Fehler-Responses:

```typescript
import { httpWorkflow } from '@deepkit/http';

app.listen(httpWorkflow.onRequest, (event) => {
    event.response.setHeader('X-Content-Type-Options', 'nosniff');
    event.response.setHeader('X-Frame-Options', 'DENY');
    event.response.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
    event.response.setHeader('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
    event.response.setHeader('Content-Security-Policy', "default-src 'self'");
});
```

Für eine einzelne Route verwenden Sie `.header()` auf einem Response-Objekt:

```typescript
import { HtmlResponse } from '@deepkit/http';

router.get('/embed', () => {
    return new HtmlResponse('<p>Embeddable</p>')
        .header('Content-Security-Policy', "frame-ancestors https://partner.example.com");
});
```

## Rate Limiting

Rate Limiting ist nicht eingebaut. Da `onRoute`-Listener laufen, bevor die Route aufgelöst und der Body gelesen wird, sind sie eine kostengünstige Stelle, um Requests abzulehnen:

```typescript
import { httpWorkflow, JSONResponse } from '@deepkit/http';

const limit = 100; //Requests pro Minute
const hits = new Map<string, { count: number, reset: number }>();

app.listen(httpWorkflow.onRoute, (event) => {
    const key = event.request.getRemoteAddress();
    const now = Date.now();

    let entry = hits.get(key);
    if (!entry || entry.reset < now) {
        entry = { count: 0, reset: now + 60_000 };
        hits.set(key, entry);
    }

    if (++entry.count > limit) {
        event.response.setHeader('Retry-After', String(Math.ceil((entry.reset - now) / 1000)));
        event.send(new JSONResponse({ message: 'Too many requests' }, 429));
    }
});
```

Dieser In-Memory-Store funktioniert nur für einen einzelnen Prozess und wächst mit der Anzahl der Clients. Für mehrere Prozesse oder Server verwenden Sie einen gemeinsamen Store wie Redis oder führen Sie das Rate Limiting in Ihrem Reverse Proxy durch. Hinter einem Reverse Proxy liefert `getRemoteAddress()` die Adresse des Proxys; lesen Sie die Client-Adresse aus dem Header, den Ihr Proxy setzt (z. B. `X-Forwarded-For`), aber nur, wenn der Request tatsächlich von Ihrem Proxy kam.

Innerhalb eines Controllers können Sie `HttpTooManyRequestsError` (Status 429) für Limits werfen, die vom Benutzer oder der Aktion abhängen, z. B. Login-Versuche pro Account.

## Cookies

Deepkit HTTP hat keinen eingebauten Cookie-Parser und kein Session-System. Lesen Sie Cookies aus dem `Cookie`-Header und setzen Sie sie mit dem `Set-Cookie`-Header:

```typescript
import { http, HttpHeader, JSONResponse } from '@deepkit/http';

function parseCookies(header: string = ''): Record<string, string> {
    const cookies: Record<string, string> = {};
    for (const part of header.split(';')) {
        const index = part.indexOf('=');
        if (index === -1) continue;
        cookies[part.slice(0, index).trim()] = decodeURIComponent(part.slice(index + 1).trim());
    }
    return cookies;
}

class SessionController {
    @http.POST('/login')
    login() {
        const sessionId = createSession(); //Ihr Session-Store
        return new JSONResponse({ ok: true })
            .header('Set-Cookie', `session=${sessionId}; HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=86400`);
    }

    @http.GET('/session')
    session(cookie?: HttpHeader<string, { name: 'cookie' }>) {
        const { session } = parseCookies(cookie);
        //...
    }
}
```

In einem `onAuth`-Listener lesen Sie den Header über `event.request.headers.cookie`.

Setzen Sie bei Session-Cookies immer `HttpOnly` (nicht per JavaScript lesbar), `Secure` (nur über HTTPS gesendet) und `SameSite=Lax` oder `Strict` (schützt bei den meisten Requests vor CSRF). Wenn Ihre API Cookies zur Authentifizierung verwendet und zustandsändernde Requests von Browsern akzeptiert, schützen Sie sie zusätzlich gegen CSRF, z. B. durch Prüfung des `Origin`-Headers oder mit einem CSRF-Token.

## HTML-Ausgabe

Beim Rendern von HTML mit [JSX-Views](./views.md) werden Textinhalte und Attributwerte automatisch escaped. Verwenden Sie `html()` nur für HTML, dem Sie vertrauen, und validieren Sie URLs, die Sie in `href` oder `src` einsetzen. Siehe [Escaping](./views.md#escaping).

## Statische Dateien

Die Auslieferung statischer Dateien des Frameworks (`publicDir`) lehnt Pfade, die `..` enthalten, mit Status 403 ab und liefert keine Dotfiles (z. B. `.env`) oder Dateien in Dot-Verzeichnissen aus. Legen Sie dennoch nur Dateien in das öffentliche Verzeichnis, die auch öffentlich sein sollen.

## Produktions-Checkliste

- Deaktivieren Sie den Debug-Modus (`FrameworkModule({ debug: false })`, der Standard). Der Debugger legt interne Informationen Ihrer Anwendung unter `/_debug` offen, und RPC-Fehler enthalten im Debug-Modus Stack-Traces.
- Setzen Sie `httpRpcBasePath` nur, wenn RPC-Actions über HTTP aufrufbar sein sollen.
- Betreiben Sie die Anwendung hinter einem Reverse Proxy, der TLS terminiert und Body-Größe sowie Request-Raten begrenzt, oder konfigurieren Sie die oben beschriebenen Server-Timeouts.
- Verwenden Sie eigene Typen für Request-Bodies und begrenzen Sie Strings, Arrays und Zahlen mit Validierungstypen.
- Übergeben Sie niemals Benutzereingaben an `html()`.
