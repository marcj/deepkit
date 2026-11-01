# Deepkit App

Die Deepkit App-Abstraktion ist der grundlegendste Baustein einer Deepkit-Anwendung. Hier beginnst du in der Regel mit dem Aufbau deiner Anwendung, wenn du die
Bibliotheken nicht eigenständig verwendest.
Es handelt sich um eine normale TypeScript-Datei, die du mit einer Runtime wie Node.js ausführst. Sie ist der Einstiegspunkt deiner Anwendung und bietet eine Möglichkeit, CLI-Befehle, Services,
Konfiguration, Events und mehr zu definieren.

Command-line Interface (CLI)-Programme sind Programme, die über das Terminal in Form von Texteingabe und Textausgabe interagieren. Der Vorteil, mit der Anwendung in
dieser Variante zu interagieren, besteht darin, dass lediglich ein Terminal vorhanden sein muss, entweder lokal oder über eine SSH-Verbindung.

Es bietet:

- CLI-Befehle
- Modulsystem
- Service-Container
- Dependency Injection
- Event-System
- Logger
- Konfigurationslader (env, dotenv, json)

Ein Befehl in Deepkit hat vollen Zugriff auf den DI-Container und kann somit auf alle Provider und Konfigurationsoptionen zugreifen. Die Argumente und Optionen der CLI-Befehle werden
durch Parameterdeklarationen über TypeScript-Typen gesteuert und automatisch serialisiert und validiert.

[Deepkit Framework](./framework.md) mit `@deepkit/framework` erweitert dies zusätzlich um einen Anwendungsserver für HTTP/RPC, einen Debugger/Profiler und vieles mehr.

Beispiel:

```typescript
import { App, Flag } from '@deepkit/app';
import { Database } from './database';

const app = new App({
    providers: [Database]
});

async function testCommand(
    name: string, // CLI-Argument
    age: number & Flag, // CLI-Flag
    database: Database, // Dependency Injection
) {
    console.log(`Hello ${name}!`);
    const users = await database.query<User>().find();
}

app.command('test', testCommand);

void app.run();
```

```sh
ts-node app.ts test John --age 42
```

## Einfache Installation

Der einfachste Weg, um loszulegen, ist die Verwendung von NPM init, um ein neues Deepkit-Projekt zu erstellen.

```shell
npm init @deepkit/app@latest my-deepkit-app
````

Dadurch wird ein neuer Ordner `my-deepkit-app` mit allen Abhängigkeiten und einer einfachen `app.ts`-Datei erstellt.

```sh
cd my-deepkit-app
npm run app
````

Dies führt die Datei `app.ts` mit `ts-node` aus und zeigt dir die verfügbaren Befehle an. Von hier aus kannst du beginnen und eigene Befehle, Controller usw. hinzufügen.

## Manuelle Installation

Deepkit App basiert auf [Deepkit Runtime Types](./runtime-types.md), also installieren wir alle Abhängigkeiten:

```bash
mkdir my-project && cd my-project

npm install typescript ts-node 
npm install @deepkit/app @deepkit/type @deepkit/type-compiler
```

Als Nächstes stellen wir sicher, dass Deepkits Type-Compiler in das installierte TypeScript-Paket unter `node_modules/typescript` installiert wird, indem wir den folgenden Befehl ausführen:

```sh
./node_modules/.bin/deepkit-type-install
```

Stelle sicher, dass alle Peer-Dependencies installiert sind. Standardmäßig installiert NPM 7+ diese automatisch.

Um deine Anwendung zu kompilieren, benötigen wir den TypeScript-Compiler und empfehlen `ts-node`, um die App einfach auszuführen.

Eine Alternative zur Verwendung von `ts-node` besteht darin, den Quellcode mit dem TypeScript-Compiler zu kompilieren und den JavaScript-Quellcode direkt auszuführen. Dies hat den Vorteil, dass die
Ausführungsgeschwindigkeit bei kurzen Befehlen drastisch steigt. Allerdings entsteht dadurch auch zusätzlicher Workflow-Aufwand, da entweder der Compiler manuell ausgeführt oder ein Watcher eingerichtet werden muss. Aus diesem
Grund wird in allen Beispielen dieser Dokumentation `ts-node` verwendet.

## Erste Anwendung

Da das Deepkit Framework keine Konfigurationsdateien oder eine spezielle Ordnerstruktur verwendet, kannst du dein Projekt beliebig strukturieren. Die einzigen zwei Dateien, die du zum
Starten benötigst, sind die TypeScript-Datei app.ts und die TypeScript-Konfiguration tsconfig.json.

Unser Ziel ist es, die folgenden Dateien in unserem Projektordner zu haben:

```
.
├── app.ts
├── node_modules
├── package-lock.json
└── tsconfig.json
```

Wir richten eine einfache tsconfig-Datei ein und aktivieren Deepkits Type-Compiler, indem wir `reflection` auf `true` setzen.
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

In diesem Code siehst du, dass wir einen Test-Befehl definiert und eine neue App erstellt haben, die wir direkt mit `run()` ausführen. Durch das Ausführen dieses Skripts starten wir die App.

und führen es dann direkt aus.

```sh
$ ./node_modules/.bin/ts-node app.ts
VERSION
  Node

USAGE
  $ ts-node app.ts [COMMAND]

COMMANDS
  test
```

Um nun unseren Test-Befehl auszuführen, führen wir den folgenden Befehl aus.

```sh
$ ./node_modules/.bin/ts-node app.ts test
Hello World
```

In Deepkit geschieht nun alles über diese `app.ts`. Du kannst die Datei beliebig umbenennen oder weitere erstellen. Eigene CLI-Befehle, HTTP/RPC-Server, Migrationsbefehle usw. werden alle
von diesem Einstiegspunkt aus gestartet.

## Argumente & Flags

Deepkit App wandelt Funktionsparameter automatisch in CLI-Argumente und Flags um. Die Reihenfolge der Parameter bestimmt die Reihenfolge der CLI-Argumente.

Parameter können beliebige TypeScript-Typen sein und werden automatisch validiert und deserialisiert.

Weitere Informationen findest du im Kapitel [Argumente & Flags](./app/arguments.md).

## Dependency Injection

Deepkit App richtet einen Service-Container ein und für jedes importierte Modul einen eigenen Dependency-Injection-Container, der von seinen Eltern erbt.
Es bringt standardmäßig folgende Provider mit, die du automatisch in deine Services, Controller und Event-Listener injizieren kannst:

- `Logger` für das Logging
- `EventDispatcher` für die Event-Behandlung
- `CliControllerRegistry` für registrierte CLI-Befehle
- `MiddlewareRegistry` für registrierte Middleware
- `InjectorContext` für den aktuellen Injector-Kontext

Sobald du das Deepkit Framework importierst, erhältst du zusätzliche Provider. Siehe [Deepkit Framework](./framework.md) für weitere Details.

## Exit-Code

Der Exit-Code ist standardmäßig 0, was bedeutet, dass der Befehl erfolgreich ausgeführt wurde. Um den Exit-Code zu ändern, sollte in der execute-Methode oder im Befehls-Callback eine Zahl ungleich 0 zurückgegeben werden.

```typescript

@cli.controller('test')
export class TestCommand {
    async execute() {
        console.error('Error :(');
        return 12;
    }
}
```
