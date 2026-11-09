# TypeScript-CLI-Framework

Deepkit App ist ein TypeScript-CLI-Framework, bei dem die Funktionssignatur die Command-Definition ist. Argumente, Flags, Standardwerte und Validierung ergeben sich aus deinen TypeScript-Typen, sodass nichts doppelt deklariert werden muss.

```typescript title=app.ts
import { App, Flag } from '@deepkit/app';
import { Logger } from '@deepkit/logger';
import { Maximum } from '@deepkit/type';

class Greeter {
    constructor(private logger: Logger) {}

    greet(name: string) {
        this.logger.log(`Hello ${name}`);
    }
}

function greet(
    name: string,
    times: number & Maximum<5> & Flag = 1,
    greeter: Greeter,
) {
    for (let i = 0; i < times; i++) greeter.greet(name);
}

new App({ providers: [Greeter] })
    .command('greet', greet)
    .run();
```

`name` wird zu einem erforderlichen Argument, `times` wird zum Flag `--times` mit dem Standardwert 1, und `greeter` wird vom Dependency-Injection-Container bereitgestellt.

```sh
$ ts-node app.ts greet Peter --times 2
Hello Peter
Hello Peter

$ ts-node app.ts greet Peter --times 9
Invalid value for option --times: 9.
Number needs to be smaller than or equal to 5

$ ts-node app.ts greet Peter --times abc
Invalid value for option --times: abc.
Cannot convert abc to number [type]

$ ts-node app.ts greet --help
Usage: ts-node app.ts greet [OPTIONS] [name]

Arguments:
  name	[required]
Options:
  --times number [default=1]
```

## Vergleich mit Commander, Yargs und oclif

|                        | Deepkit App                      | Commander                 | Yargs                        | oclif                     |
| ---------------------- | -------------------------------- | ------------------------- | ---------------------------- | ------------------------- |
| Optionen definiert durch | TypeScript-Typen des Commands  | `.option()`-Aufrufe       | Builder-Aufrufe              | Statische `flags` an einer Class |
| Validierung            | Aus dem Type, z. B. `Maximum<5>` | Eigene Parser-Funktionen  | `choices`, `coerce`, `check` | Flag-Optionen und Parser  |
| Dependency Injection   | Integriert                       | Keine                     | Keine                        | Keine                     |
| Konfiguration, Module  | Integriert                       | Keine                     | Nur Konfigurationsdateien    | Plugins                   |

Deepkit benötigt den [Deepkit Type Compiler](./runtime-types/getting-started.md) in deinem Build, da es deine Typen zur Laufzeit ausliest. Für ein kleines Skript ohne Build-Schritt ist eine Library wie Commander die einfachere Wahl.

## Was Deepkit App enthält

Deepkit App ist der grundlegendste Baustein einer Deepkit-Anwendung und üblicherweise der Einstiegspunkt, wenn du die Libraries nicht einzeln verwendest. Es handelt sich um eine gewöhnliche TypeScript-Datei, die du mit einer Runtime wie Node.js ausführst, und sie bietet:

- CLI-Commands
- Modulsystem
- Service-Container
- Dependency Injection
- Event-System
- Logger
- Konfigurations-Loader (env, dotenv, json)

Ein Command hat vollen Zugriff auf den DI-Container und kann somit auf alle Provider und Konfigurationsoptionen zugreifen. Es gibt kein Deepkit-spezifisches globales CLI-Tool: Der HTTP/RPC-Server, Migrationen und deine eigenen Commands werden alle aus derselben Datei gestartet.

[Deepkit Framework](./framework.md) mit `@deepkit/framework` erweitert dies um einen Anwendungsserver für HTTP/RPC, einen Debugger/Profiler und vieles mehr.

## Einfache Installation

Am einfachsten startest du, indem du mit NPM init ein neues Deepkit-Projekt erstellst.

```shell
npm init @deepkit/app@latest my-deepkit-app
```

Dadurch wird ein neuer Ordner `my-deepkit-app` mit allen Abhängigkeiten und einer einfachen `app.ts`-Datei erstellt.

```sh
cd my-deepkit-app
npm run app
```

Dadurch wird die Datei `app.ts` mit `ts-node` ausgeführt und die verfügbaren Commands werden angezeigt. Von hier aus kannst du eigene Commands, Controller usw. hinzufügen.

## Manuelle Installation

Deepkit App basiert auf [Deepkit Runtime Types](./runtime-types.md), daher installieren wir alle Abhängigkeiten:

```bash
mkdir my-project && cd my-project

npm install typescript ts-node 
npm install @deepkit/app @deepkit/type @deepkit/type-compiler
```

Als Nächstes stellen wir mit dem folgenden Befehl sicher, dass Deepkits Type Compiler in das installierte TypeScript-Paket unter `node_modules/typescript` installiert wird:

```sh
./node_modules/.bin/deepkit-type-install
```

Stelle sicher, dass alle Peer Dependencies installiert sind. Standardmäßig installiert NPM 7+ diese automatisch.

Um deine Anwendung zu kompilieren, benötigen wir den TypeScript-Compiler und empfehlen `ts-node`, um die App einfach auszuführen.

Eine Alternative zu `ts-node` besteht darin, den Quellcode mit dem TypeScript-Compiler zu kompilieren und den JavaScript-Quellcode direkt auszuführen. Das hat den Vorteil, dass die Ausführungsgeschwindigkeit bei kurzen Commands drastisch
steigt. Allerdings entsteht dadurch auch zusätzlicher Workflow-Overhead, da entweder der Compiler manuell ausgeführt oder ein Watcher eingerichtet werden muss. Aus diesem
Grund wird `ts-node` in allen Beispielen dieser Dokumentation verwendet.

## Erste Anwendung

Da das Deepkit Framework keine Konfigurationsdateien oder spezielle Ordnerstruktur verwendet, kannst du dein Projekt beliebig strukturieren. Die einzigen beiden Dateien, die du für den
Einstieg benötigst, sind die TypeScript-Datei app.ts und die TypeScript-Konfiguration tsconfig.json.

Unser Ziel ist es, die folgenden Dateien in unserem Projektordner zu haben:

```
.
├── app.ts
├── node_modules
├── package-lock.json
└── tsconfig.json
```

Wir richten eine einfache tsconfig-Datei ein und aktivieren Deepkits Type Compiler, indem wir `reflection` auf `true` setzen.
Dies ist erforderlich, um den Dependency-Injection-Container und andere Features zu verwenden.

```json title=tsconfig.json
{
  "compilerOptions": {
    "outDir": "./dist",
    "experimentalDecorators": true,
    "strict": true,
    "esModuleInterop": true,
    "target": "es2020",
    "module": "CommonJS",
    "moduleResolution": "node"
  },
  "reflection": true,
  "files": [
    "app.ts"
  ]
}
```

```typescript title=app.ts
import { App } from '@deepkit/app';
import { Logger } from '@deepkit/logger';

const app = new App();

app.command('test', (logger: Logger) => {
    logger.log('Hello World!');
});

app.run();
```

In diesem Code siehst du, dass wir einen Test-Command definiert und eine neue App erstellt haben, die wir direkt mit `run()` ausführen. Indem wir dieses Skript ausführen, starten wir die App.

Anschließend führen wir es direkt aus.

```sh
$ ./node_modules/.bin/ts-node app.ts
VERSION
  Node

USAGE
  $ ts-node app.ts [COMMAND]

COMMANDS
  test
```

Um unseren Test-Command auszuführen, verwenden wir nun den folgenden Befehl.

```sh
$ ./node_modules/.bin/ts-node app.ts test
Hello World
```

In Deepkit läuft nun alles über diese `app.ts`. Du kannst die Datei beliebig umbenennen oder weitere erstellen. Eigene CLI-Commands, der HTTP/RPC-Server, Migrations-Commands usw. werden alle
von diesem Einstiegspunkt aus gestartet.

## Argumente & Flags

Deepkit App wandelt Funktionsparameter automatisch in CLI-Argumente und Flags um. Die Reihenfolge der Parameter bestimmt die Reihenfolge der CLI-Argumente.

Parameter können jeden beliebigen TypeScript-Type haben und werden automatisch validiert und deserialisiert.

Weitere Informationen findest du im Kapitel [Argumente & Flags](./app/arguments.md).

## Dependency Injection

Deepkit App richtet einen Service-Container ein sowie für jedes importierte Modul einen eigenen Dependency-Injection-Container, der von seinen übergeordneten Containern erbt.
Standardmäßig stehen die folgenden Provider zur Verfügung, die du automatisch in deine Services, Controller und Event-Listener injizieren kannst:

- `Logger` für das Logging
- `EventDispatcher` für die Event-Verarbeitung
- `CliControllerRegistry` für registrierte CLI-Commands
- `MiddlewareRegistry` für registrierte Middleware
- `InjectorContext` für den aktuellen Injector-Kontext

Sobald du Deepkit Framework importierst, erhältst du zusätzliche Provider. Weitere Details findest du unter [Deepkit Framework](./framework.md).

## Exit-Code

Der Exit-Code ist standardmäßig 0, was bedeutet, dass der Command erfolgreich ausgeführt wurde. Um den Exit-Code zu ändern, sollte in der execute-Methode oder im Command-Callback eine andere Zahl als 0 zurückgegeben werden.

```typescript
import { cli } from '@deepkit/app';

@cli.controller('test')
export class TestCommand {
    async execute() {
        console.error('Error :(');
        return 12;
    }
}
```
