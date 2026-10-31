# Datenbank

Deepkit verfügt über eine eigene, leistungsfähige Datenbank-Abstraktionsbibliothek namens Deepkit ORM. Sie ist eine Object-Relational Mapping (ORM) Bibliothek, die die Arbeit mit SQL-Datenbanken und MongoDB erleichtert.

Obwohl Sie jede beliebige Datenbankbibliothek verwenden können, empfehlen wir Deepkit ORM, da es die schnellste TypeScript-Datenbank-Abstraktionsbibliothek ist, die perfekt in das Deepkit Framework integriert ist und viele Features bietet, die Ihren Workflow und Ihre Effizienz verbessern.

Dieses Kapitel erklärt, wie Sie Deepkit ORM mit Ihrer Deepkit App verwenden. Alle Informationen zu Deepkit ORM finden Sie im Kapitel [ORM](../orm.md).

## Datenbank-Klassen

Die einfachste Möglichkeit, das Objekt `Database` von Deepkit ORM innerhalb der Anwendung zu verwenden, besteht darin, eine davon abgeleitete Klasse zu registrieren.

```typescript
import { Database } from '@deepkit/orm';
import { SQLiteDatabaseAdapter } from '@deepkit/sqlite';
import { User } from './models';

export class SQLiteDatabase extends Database {
    constructor() {
        super(
            new SQLiteDatabaseAdapter('/tmp/myapp.sqlite'), 
            [User]
        );
    }
}
```

Erstellen Sie eine neue Klasse und geben Sie in deren Konstruktor den Adapter mit seinen Parametern an und fügen Sie als zweiten Parameter alle Entity-Modelle hinzu, die mit dieser Datenbank verbunden werden sollen.

Sie können diese Datenbankklasse nun als Provider registrieren. Außerdem aktivieren wir `migrateOnStartup`, wodurch beim Bootstrap automatisch alle Tabellen in Ihrer Datenbank erstellt werden. Das ist ideal für schnelles Prototyping, wird jedoch für ein ernsthaftes Projekt oder den Produktionseinsatz nicht empfohlen. Verwenden Sie dort reguläre Datenbank-Migrationen.

Wir aktivieren außerdem `debug`, womit Sie beim Start des Servers der Anwendung den Debugger öffnen und Ihre Datenbank-Modelle direkt im integrierten ORM Browser verwalten können.

```typescript
import { App } from '@deepkit/app';
import { FrameworkModule } from '@deepkit/framework';
import { SQLiteDatabase } from './database.ts';

new App({
    providers: [SQLiteDatabase],
    imports: [
        new FrameworkModule({
            migrateOnStartup: true,
            debug: true,
        })
    ]
}).run();
```

Sie können nun überall mittels Dependency Injection auf `SQLiteDatabase` zugreifen:

```typescript
import { SQLiteDatabase } from './database.ts';

export class Controller {
    constructor(protected database: SQLiteDatabase) {}

    @http.GET()
    async startPage(): Promise<User[]> {
        // alle Benutzer zurückgeben
        return await this.database.query(User).find();
    }
}
```

## Konfiguration

In vielen Fällen sollen Ihre Verbindungs-Credentials konfigurierbar sein. Beispielsweise möchten Sie für Tests eine andere Datenbank verwenden als für die Produktion. Das können Sie mithilfe der Option `config` der Klasse `Database` tun.

```typescript
//database.ts
import { Database } from '@deepkit/orm';
import { PostgresDatabaseAdapter } from '@deepkit/sqlite';
import { User } from './models';

type DbConfig = Pick<AppConfig, 'databaseHost', 'databaseUser', 'databasePassword'>;

export class MainDatabase extends Database {
    constructor(config: DbConfig) {
        super(new PostgresDatabaseAdapter({
            host: config.databaseHost,
            user: config.databaseUser,
            password: config.databasePassword,
        }), [User]);
    }
}
```

```typescript
//config.ts
export class AppConfig {
    databaseHost: string = 'localhost';
    databaseUser: string = 'postgres';
    databasePassword: string = '';
}
```

```typescript
//app.ts
import { App } from '@deepkit/app';
import { FrameworkModule } from '@deepkit/framework';
import { MainDatabase } from './database.ts';
import { AppConfig } from './config.ts';

const app = new App({
    config: AppConfig,
    providers: [MainDatabase],
    imports: [
        new FrameworkModule({
            migrateOnStartup: true,
            debug: true,
        })
    ]
});
app.loadConfigFromEnv({prefix: 'APP_', namingStrategy: 'upper', envFilePath: ['local.env', 'prod.env']});
app.run();
```

Da wir nun `loadConfigFromEnv` verwenden, können wir die Datenbank-Zugangsdaten über Umgebungsvariablen setzen.

```sh
APP_DATABASE_HOST=localhost APP_DATABASE_USER=postgres ts-node app.ts server:start
```

oder in der Datei `local.env` und `ts-node app.ts server:start` ohne zuvor gesetzte Umgebungsvariablen starten.

```sh
APP_DATABASE_HOST=localhost
APP_DATABASE_USER=postgres
```

## Mehrere Datenbanken

Sie können beliebig viele Datenbank-Klassen hinzufügen und frei benennen. Achten Sie darauf, den Namen jeder Datenbank zu ändern, damit es bei der Verwendung des Deepkit ORM Browser nicht zu Konflikten kommt.

## Daten verwalten

Sie haben nun alles eingerichtet, um Ihre Datenbankdaten mit dem Deepkit ORM Browser zu verwalten. Um den Deepkit ORM Browser zu öffnen und den Inhalt zu managen, schreiben Sie alle Schritte von oben in die Datei `app.ts` und starten Sie den Server.

```sh
$ ts-node app.ts server:start
2021-06-11T15:08:54.330Z [LOG] Start HTTP server, using 1 workers.
2021-06-11T15:08:54.333Z [LOG] Migrate database default
2021-06-11T15:08:54.336Z [LOG] RPC DebugController deepkit/debug/controller
2021-06-11T15:08:54.337Z [LOG] RPC OrmBrowserController orm-browser/controller
2021-06-11T15:08:54.337Z [LOG] HTTP OrmBrowserController
2021-06-11T15:08:54.337Z [LOG]     GET /_orm-browser/query httpQuery
2021-06-11T15:08:54.337Z [LOG] HTTP StaticController
2021-06-11T15:08:54.337Z [LOG]     GET /_debug/:any serviceApp
2021-06-11T15:08:54.337Z [LOG] HTTP listening at http://localhost:8080/
```

Sie können nun http://localhost:8080/_debug/database/default öffnen.

![Debugger Datenbank](/assets/documentation/framework/debugger-database.png)

Sie sehen das ER-Diagramm (Entity-Relationship). Im Moment ist nur eine Entity verfügbar. Wenn Sie weitere mit Relationen hinzufügen, sehen Sie alle Informationen auf einen Blick.

Wenn Sie in der linken Seitenleiste auf `User` klicken, können Sie dessen Inhalte verwalten. Klicken Sie auf das `+`-Symbol und ändern Sie den Titel des neuen Datensatzes. Nachdem Sie die erforderlichen Werte (wie den Benutzernamen) geändert haben, klicken Sie auf `Confirm`. Dadurch werden alle Änderungen in die Datenbank übernommen und dauerhaft gemacht. Die Auto-Increment-ID wird automatisch vergeben.

![Debugger Datenbank User](/assets/documentation/framework/debugger-database-user.png)

## Mehr erfahren

Um mehr darüber zu erfahren, wie `SQLiteDatabase` funktioniert, lesen Sie bitte das Kapitel [Datenbank](../orm.md) und dessen Unterkapitel, wie das Abfragen von Daten, das Manipulieren von Daten über Sessions, das Definieren von Relationen und vieles mehr.
Bitte beachten Sie, dass sich die Kapitel dort auf die eigenständige Bibliothek `@deepkit/orm` beziehen und keine Dokumentation über den Teil des Deepkit Frameworks enthalten, den Sie oben in diesem Kapitel gelesen haben. In der Standalone-Bibliothek instanziieren Sie Ihre Datenbankklasse manuell, zum Beispiel über `new SQLiteDatabase()`. In Ihrer Deepkit App geschieht dies jedoch automatisch mithilfe des Dependency-Injection-Containers.

## Migration

Das Deepkit Framework verfügt über ein leistungsfähiges Migration-System, mit dem Sie Migrationen erstellen, ausführen und zurücksetzen können. Das Migrationssystem basiert auf der Deepkit ORM Bibliothek und ist daher perfekt in das Framework integriert.

Das `FrameworkModule` stellt mehrere Befehle zur Verwaltung von Migrationen bereit.

- `migration:create` - Generiert eine neue Migrationsdatei basierend auf einem Datenbank-Diff
- `migration:pending` - Zeigt ausstehende Migrationsdateien
- `migration:up` - Führt ausstehende Migrationsdateien aus.
- `migration:down` - Führt Down-Migration aus und macht ältere Migrationsdateien rückgängig


```sh
ts-node app.ts migration:create --migrationDir src/migrations
```

Eine neue Migrationsdatei wird in `migrations` erstellt. Dieser Ordner ist das standardmäßig im FrameworkModule konfigurierte Verzeichnis. Um es zu ändern, passen Sie die Konfiguration entweder über Umgebungsvariablen an (wie im Kapitel [Konfiguration](../app/configuration.md) beschrieben) oder indem Sie die Option `migrationDir` an den Konstruktor von `FrameworkModule` übergeben.

```typescript
new FrameworkModule({
    migrationDir: 'src/migrations',
})
```

Die neu erstellte Migrationsdatei enthält nun die up- und down-Methoden basierend auf dem Unterschied zwischen den in Ihrer TypeScript App definierten Entities und der konfigurierten Datenbank. 
Sie können nun die up-Methode nach Ihren Bedürfnissen anpassen. Die down-Methode wird basierend auf der up-Methode automatisch generiert.
Committen Sie diese Datei in Ihr Repository, damit andere Entwickler sie ebenfalls ausführen können.

### Ausstehende Migrationen

```sh
ts-node app.ts migration:pending --migrationDir src/migrations
```

Dies zeigt alle ausstehenden Migrationen. Wenn Sie eine neue Migrationsdatei haben, die noch nicht ausgeführt wurde, wird sie hier aufgelistet.

### Migrationen ausführen

```sh
ts-node app.ts migration:up --migrationDir src/migrations
```

Dies führt die nächste ausstehende Migration aus.

### Migrationen zurückrollen

```sh
ts-node app.ts migration:down --migrationDir src/migrations
```

Dies macht die zuletzt ausgeführte Migration rückgängig.

### Fake-Migrationen

Angenommen, Sie wollten eine Migration (up oder down) ausführen, aber sie ist fehlgeschlagen. Sie haben das Problem manuell behoben, können die Migration nun jedoch nicht erneut ausführen, weil sie bereits ausgeführt wurde. Sie können die Option `--fake` verwenden, um die Migration zu faken, sodass sie in der Datenbank als ausgeführt markiert wird, ohne sie tatsächlich auszuführen. Auf diese Weise können Sie die nächste ausstehende Migration ausführen.

```sh
ts-node app.ts migration:up --migrationDir src/migrations --fake
```