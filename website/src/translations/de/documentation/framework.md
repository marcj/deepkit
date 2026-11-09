# TypeScript Backend Framework

Deepkit Framework ist ein TypeScript-Backend-Framework, in dem ein einziger Type zugleich Validator, JSON-Format, Datenbankschema und API-Dokumentation ist. Es vereint HTTP- und RPC-Server, ORM, Dependency Injection, CLI und Konfiguration in einer Anwendung.

```typescript
//app.ts
import { App } from '@deepkit/app';
import { FrameworkModule } from '@deepkit/framework';
import { http, HttpBody } from '@deepkit/http';
import { Logger } from '@deepkit/logger';
import { Email, MinLength } from '@deepkit/type';

interface CreateUser {
    username: string & MinLength<3>;
    email: string & Email;
}

class UserService {
    constructor(private logger: Logger) {}

    create(input: CreateUser) {
        this.logger.log(`New user ${input.username}`);
        return { id: 1, ...input };
    }
}

class UserController {
    constructor(private users: UserService) {}

    @http.POST('/users')
    create(body: HttpBody<CreateUser>) {
        return this.users.create(body);
    }
}

new App({
    controllers: [UserController],
    providers: [UserService],
    imports: [new FrameworkModule()],
}).run();
```

```sh
$ ts-node app.ts server:start

$ curl -X POST localhost:8080/users -H 'content-type: application/json' \
    -d '{"username":"Peter","email":"peter@example.com"}'
{"id":1,"username":"Peter","email":"peter@example.com"}

$ curl -X POST localhost:8080/users -H 'content-type: application/json' \
    -d '{"username":"ab","email":"nope"}'
HTTP/1.1 400 Bad Request
{
  "message": "Validation error: ...",
  "errors": [
    {
      "path": "username",
      "code": "minLength",
      "message": "Min length is 3",
      "value": "ab"
    },
    ...
  ]
}
```

Der Body wird anhand des `CreateUser`-Interfaces validiert, bevor die Methode ausgeführt wird, und `UserService` wird anhand seines Types injiziert. Ein neues Projekt wird mit `npm init @deepkit/app@latest my-app` erstellt.

## Vergleich mit NestJS und Express

|                      | Deepkit Framework              | NestJS                                 | Express oder Fastify      |
| -------------------- | ------------------------------ | -------------------------------------- | ------------------------- |
| Request-Validierung  | Aus dem TypeScript-Type        | Dekorierte Klassen und eine Validator-Pipe | Selbst hinzuzufügen   |
| Dependency Injection | Integriert, keine Decorators nötig | Integriert, mit `@Injectable()`    | Selbst hinzuzufügen       |
| ORM                  | Integriert                     | Selbst hinzuzufügen                    | Selbst hinzuzufügen       |
| RPC                  | Integriert                     | Über einen Transport hinzuzufügen      | Selbst hinzuzufügen       |
| Build-Schritt        | Deepkit Type-Compiler          | TypeScript-Compiler                    | Optional                  |

Deepkit benötigt seinen [Type-Compiler](./runtime-types/getting-started.md) in Ihrem Build, da es Ihre Types zur Laufzeit ausliest. Express und NestJS haben deutlich größere Ökosysteme, was wichtiger sein kann als die integrierten Features. Angaben zur Performance finden Sie auf der [Benchmark-Seite](/benchmarks).

## Was das Framework enthält

Deepkit Framework basiert auf [Deepkit App](./app.md) in `@deepkit/app` und stellt in `@deepkit/framework` das Modul `FrameworkModule` bereit, das Sie in Ihre Anwendung importieren können.

Die `App`-Abstraktion bietet:

- CLI-Befehle
- Laden der Konfiguration (Umgebungsvariablen, Dotfiles, benutzerdefiniert)
- Modulsystem
- Leistungsfähiger Service Container
- Registry und Hooks für Controller, Provider, Listener und mehr

Das Modul `FrameworkModule` bietet zusätzliche Features:

- Application Server
    - HTTP-Server
    - RPC-Server
    - Multi-Process Load Balancing
    - SSL
- CLI-Befehle zum Debuggen
- Konfiguration und Befehle für Datenbankmigrationen
- Debugging-/Profiler-GUI über die Option `{debug: true}`
- Interaktive API-Dokumentation (ähnlich wie Swagger)
- Provider für DatabaseRegistry, ProcessLocking, Broker, Sessions
- APIs für Integrationstests

Sie können Anwendungen mit oder ohne `FrameworkModule` schreiben.

## Installation

Deepkit Framework basiert auf [Deepkit App](./app.md). Stellen Sie sicher, dass Sie dessen Installationsanleitung befolgt haben.
Ist das der Fall, können Sie Deepkit Framework installieren und das `FrameworkModule` in Ihre `App` importieren. 

```sh
npm install @deepkit/framework
```

```typescript
import { App } from '@deepkit/app';
import { FrameworkModule } from '@deepkit/framework';
import { Logger } from '@deepkit/logger';

const app = new App({
    imports: [new FrameworkModule({ debug: true })]
});

app.command('test', (logger: Logger) => {
    logger.log('Hello World!');
});

app.run();
```

Da die App nun das `FrameworkModule` importiert, stehen weitere Befehle zur Verfügung, die nach Themen gruppiert sind.

Einer davon ist `server:start`, der den HTTP-Server startet. Um ihn zu verwenden, müssen wir mindestens eine HTTP-Route registrieren.

```typescript
import { App } from '@deepkit/app';
import { FrameworkModule } from '@deepkit/framework';
import { HttpRouterRegistry } from '@deepkit/http';
import { Logger } from '@deepkit/logger';

const app = new App({
    imports: [new FrameworkModule({ debug: true })]
});

app.command('test', (logger: Logger) => {
    logger.log('Hello World!');
});


const router = app.get(HttpRouterRegistry);

router.get('/', () => {
    return 'Hello World';
})

app.run();
```

Wenn Sie den Befehl `server:start` erneut ausführen, sehen Sie, dass der HTTP-Server nun gestartet und die Route `/` verfügbar ist.

```sh
$ ts-node app.ts server:start
```

```sh
$ curl http://localhost:8080/
Hello World
```

Wie Sie Requests verarbeiten, erfahren Sie in den Kapiteln [HTTP](http.md) und [RPC](rpc.md). Im Kapitel [App](app.md) erfahren Sie mehr über CLI-Befehle.

## App

Die Klasse `App` ist der Haupteinstiegspunkt Ihrer Anwendung. Sie ist dafür zuständig, alle Module und die Konfiguration zu laden und die Anwendung zu starten.
Außerdem lädt sie alle CLI-Befehle und führt sie aus. Module wie FrameworkModule stellen zusätzliche Befehle bereit, registrieren Event Listener,
stellen Controller für HTTP/RPC, Service Provider und so weiter bereit.

Über dieses `app`-Objekt können Sie auch auf den Dependency-Injection-Container zugreifen, ohne einen CLI-Controller auszuführen.

```typescript
const app = new App({
    imports: [new FrameworkModule]
});

//Zugriff auf alle registrierten Services erhalten
const eventDispatcher = app.get(EventDispatcher);
```

Sie können den `EventDispatcher` abrufen, weil das `FrameworkModule` ihn wie viele andere (Logger, ApplicationServer und [vieles mehr](https://github.com/deepkit/deepkit-framework/blob/master/packages/framework/src/module.ts)) als Service Provider registriert.

Sie können auch Ihren eigenen Service registrieren.

```typescript

class MyService {
    constructor(private logger: Logger) {
    }

    helloWorld() {
        this.logger.log('Hello World');
    }
}

const app = new App({
    providers: [MyService],
    imports: [new FrameworkModule]
});

const service = app.get(MyService);

service.helloWorld();
```

### Debugger

Die Konfigurationswerte Ihrer Anwendung und aller Module können im Debugger angezeigt werden. Aktivieren Sie die Option `debug` im `FrameworkModule` und öffnen Sie `http://localhost:8080/_debug/configuration`.

```typescript
import { App } from '@deepkit/app';
import { FrameworkModule } from '@deepkit/framework';

new App({
    imports: [
        new FrameworkModule({
            debug: true,
        })
    ]
}).run();
```

![Debugger-Konfiguration](/assets/documentation/framework/debugger-configuration.png)

Mit `ts-node app.ts debug:config` können Sie außerdem alle verfügbaren Konfigurationsoptionen mit ihrem aktiven Wert, Standardwert, ihrer Beschreibung und ihrem Datentyp anzeigen.

## Events

Deepkit Framework bringt verschiedene Event Tokens mit, für die Event Listener registriert werden können.

Im Kapitel [Events](./app/events.md) erfahren Sie mehr darüber, wie Events funktionieren.

### Events versenden

Events werden über die Klasse `EventDispatcher` versendet. In einer Deepkit-App kann diese per Dependency Injection bereitgestellt werden.

```typescript
import { cli, Command } from '@deepkit/app';
import { BaseEvent, EventDispatcher, EventToken } from '@deepkit/event';

class UserEvent extends BaseEvent {
    constructor(public user: { username: string }) {
        super();
    }
}

const UserAdded = new EventToken<UserEvent>('user.added');

@cli.controller('test')
export class TestCommand implements Command {
    constructor(protected eventDispatcher: EventDispatcher) {
    }

    async execute() {
        const event = new UserEvent({ username: 'Peter' });
        await this.eventDispatcher.dispatch(UserAdded, event);
    }
}
```
