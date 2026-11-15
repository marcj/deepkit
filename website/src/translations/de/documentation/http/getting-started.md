# Erste Schritte

Da Deepkit HTTP auf Runtime Types basiert, ist es notwendig, Runtime Types bereits korrekt installiert zu haben. Siehe [Runtime Type Installation](../runtime-types/getting-started.md).

Wenn dies erfolgreich erledigt ist, kann `@deepkit/app` installiert werden oder das Deepkit Framework, welches die Library bereits unter der Haube verwendet.

```sh
npm install @deepkit/http
```

Beachte, dass `@deepkit/http` für die Controller-API auf TypeScript-Annotationen basiert und dieses Feature entsprechend mit `experimentalDecorators` aktiviert werden muss, sobald die Controller-API verwendet wird.
Wenn du keine Klassen verwendest, musst du dieses Feature nicht aktivieren.

_Datei: tsconfig.json_

```json
{
  "compilerOptions": {
    "module": "CommonJS",
    "target": "es6",
    "moduleResolution": "node",
    "experimentalDecorators": true
  },
  "reflection": true
}
```

Sobald die Library installiert ist, kann ihre API direkt verwendet werden.

## Funktionale API

Die funktionale API basiert auf Funktionen und kann über die Router-Registry registriert werden, die über den DI-Container der App bezogen werden kann.

```typescript
import { App } from '@deepkit/app';
import { FrameworkModule } from '@deepkit/framework';
import { HttpRouterRegistry } from '@deepkit/http';

const app = new App({
    imports: [new FrameworkModule]
});

const router = app.get(HttpRouterRegistry);

router.get('/', () => {
    return "Hello World!";
});

app.run();
```

Sobald Module verwendet werden, können funktionale Routen auch dynamisch von Modulen bereitgestellt werden.

```typescript
import { App, createModuleClass } from '@deepkit/app';
import { FrameworkModule } from '@deepkit/framework';
import { HttpRouterRegistry } from '@deepkit/http';

class MyModule extends createModuleClass({}) {
  override process() {
    this.configureProvider<HttpRouterRegistry>(router => {
      router.get('/', () => {
        return "Hello World!";
      });
    });
  }
}

const app = new App({
  imports: [new FrameworkModule, new MyModule]
});
```

Siehe [Framework-Module](../app/modules), um mehr über App-Module zu erfahren.

## Controller-API

Die Controller-API basiert auf Klassen und kann über die App-API unter der Option `controllers` registriert werden.

```typescript
import { App } from '@deepkit/app';
import { FrameworkModule } from '@deepkit/framework';
import { http } from '@deepkit/http';

class MyPage {
    @http.GET('/')
    helloWorld() {
        return "Hello World!";
    }
}

new App({
    controllers: [MyPage],
    imports: [new FrameworkModule]
}).run();
```

Sobald Module verwendet werden, können Controller auch von Modulen bereitgestellt werden.

```typescript
import { App, createModuleClass } from '@deepkit/app';
import { FrameworkModule } from '@deepkit/framework';
import { http } from '@deepkit/http';

class MyPage {
  @http.GET('/')
  helloWorld() {
    return "Hello World!";
  }
}

class MyModule extends createModuleClass({}) {
  override process() {
    this.addController(MyPage);
  }
}

const app = new App({
  imports: [new FrameworkModule, new MyModule]
});
```

Um Controller dynamisch bereitzustellen (zum Beispiel abhängig von der Konfigurationsoption), kann der `process`-Hook verwendet werden.

```typescript
class MyModuleConfiguration {
    debug: boolean = false;
}

class MyModule extends createModuleClass({
    config: MyModuleConfiguration
}) {
    override process() {
        if (this.config.debug) {
            class DebugController {
                @http.GET('/debug/')
                root() {
                    return 'Hello Debugger';
                }
            }
            this.addController(DebugController);
        }
    }
}
```

Siehe [Framework-Module](../app/modules), um mehr über App-Module zu erfahren.

## HTTP-Server

Wenn das Deepkit Framework verwendet wird, ist bereits ein HTTP-Server integriert. Die HTTP-Library kann jedoch auch mit einem eigenen HTTP-Server ohne das Deepkit Framework verwendet werden, innerhalb von Express, mit `Bun.serve`, `Deno.serve`, Cloudflare Workers oder AWS Lambda.

```typescript
import { createServer } from 'http';
import { HttpKernel, HttpRequest, HttpResponse } from '@deepkit/http';

const app = new App({
    controllers: [MyPage],
    imports: [new HttpModule]
});

const httpKernel = app.get(HttpKernel);

createServer(
    { IncomingMessage: HttpRequest, ServerResponse: HttpResponse as any },
    (req, res) => httpKernel.handleRequestMaybeSync(req, res),
).listen(8080, () => {
    console.log('listen at 8080');
});
```

Siehe [Server & Runtimes](./runtimes.md) für alle Möglichkeiten, den HTTP-Kernel auszuführen.

## HTTP-Client

Deepkit HTTP benötigt keinen speziellen Client. Jeder HTTP-Client funktioniert, zum Beispiel die `fetch`-API, die in Browsern, Node.js, Bun und Deno verfügbar ist.

Eine JSON-Response enthält nur JSON-Typen, daher kommt ein `Date` als String an und nichts garantiert die Struktur der Daten. Wenn du die Types zwischen Server und Client teilst, konvertiert und validiert `@deepkit/type` die Response mit demselben Type, den auch der Server verwendet.

```typescript
import { cast } from '@deepkit/type';

interface User {
    id: number;
    username: string;
    created: Date;
}

const response = await fetch('http://localhost:8080/user/1');
if (!response.ok) throw new Error(`Request failed with status ${response.status}`);

// konvertiert "created" von einem ISO-String in ein Date und validiert das Ergebnis.
// Wirft einen ValidationError, wenn die Daten nicht zu User passen.
const user = cast<User>(await response.json());
```

Je nach Bedarf gibt es einige Funktionen:

| Funktion               | Beschreibung                                                                                                 |
|------------------------|--------------------------------------------------------------------------------------------------------------|
| `cast<T>(data)`        | Konvertiert die Daten (z. B. ISO-String zu `Date`, `'2'` zu `2`) und validiert sie. Wirft `ValidationError`, wenn ungültig. |
| `deserialize<T>(data)` | Konvertiert die Daten, ohne sie zu validieren. Nur für vertrauenswürdige Quellen verwenden.                  |
| `is<T>(data)`          | Type Guard. Gibt `true` zurück, wenn die Daten bereits dem Type entsprechen, ohne sie zu konvertieren.       |
| `assert<T>(data)`      | Wie `is`, wirft aber einen `ValidationError`, anstatt `false` zurückzugeben.                                 |
| `validate<T>(data)`    | Gibt ein Array von `ValidationErrorItem` zurück, leer, wenn die Daten gültig sind.                           |

Dieselben Types können verwendet werden, um einen Request-Body vor dem Senden zu prüfen, zum Beispiel um Fehler in einem Formular frühzeitig anzuzeigen. Der Server validiert den Body ohnehin (siehe [Eingabe & Ausgabe](./input-output.md)).

```typescript
import { MinLength, validate } from '@deepkit/type';

interface CreateUser {
    username: string & MinLength<3>;
}

const body: CreateUser = { username: 'Pe' };
const errors = validate<CreateUser>(body);
if (errors.length) {
    // [{ path: 'username', code: 'minLength', message: 'Min length is 3', ... }]
} else {
    await fetch('http://localhost:8080/user', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
    });
}
```

Wenn der Server einen Request aufgrund ungültiger Eingaben ablehnt, antwortet er mit Status 400 und einem JSON-Body `{ message: string, errors: { path, code, message }[] }`.

Siehe [Serialisierung](../runtime-types/serialization.md) und [Validierung](../runtime-types/validation.md) für alle Details.

## Routennamen

Routen kann ein eindeutiger Name gegeben werden, auf den beim Weiterleiten verwiesen werden kann. Je nach API unterscheidet sich die Art, wie ein Name definiert wird.

```typescript
//funktionale API
router.get({
    path: '/user/:id',
    name: 'userDetail'
}, (id: number) => {
    return {userId: id};
});

//Controller-API
class UserController {
    @http.GET('/user/:id').name('userDetail')
    userDetail(id: number) {
        return {userId: id};
    }
}
```

Von allen Routen mit einem Namen kann die URL über `Router.resolveUrl()` abgefragt werden.

```typescript
import { HttpRouter } from '@deepkit/http';
const router = app.get(HttpRouter);
router.resolveUrl('userDetail', {id: 2}); //=> '/user/2'
```

## Sicherheit

## Sessions
