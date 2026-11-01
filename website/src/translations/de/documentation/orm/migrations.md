# Migrationen

Migrationen sind eine Möglichkeit, Änderungen am Datenbankschema strukturiert und organisiert vorzunehmen. Sie werden als TypeScript-Dateien in einem Verzeichnis gespeichert und können mit dem Kommandozeilen-Tool ausgeführt werden.

Deepkit ORM-Migrationen sind standardmäßig aktiviert, wenn das Deepkit Framework verwendet wird. 

## Befehle

- `migration:create` - Generiert eine neue Migrationsdatei basierend auf einem Datenbank-Diff
- `migration:pending` - Zeigt ausstehende Migrationsdateien an
- `migration:up` - Führt ausstehende Migrationsdateien aus.
- `migration:down` - Führt eine Down-Migration aus und macht alte Migrationsdateien rückgängig

Diese Befehle sind entweder in der Anwendung verfügbar, wenn Sie das `FrameworkModule` importieren, oder über das Kommandozeilen-Tool `deepkit-sql` aus `@deepkit/sql`.

Die [Migrationsintegration des FrameworkModule](../framework/database.md#migration) liest Ihre Datenbanken automatisch ein (Sie müssen diese als Provider definieren), während Sie bei `deepkit-sql` die TypeScript-Datei angeben müssen, die die Datenbank exportiert. Letzteres ist nützlich, wenn Sie Deepkit ORM eigenständig ohne das Deepkit Framework verwenden.

## Eine Migration erstellen

```typescript
//database.ts
import { Database } from '@deepkit/orm';
import { SQLiteDatabaseAdapter } from '@deepkit/sqlite';
import { User } from './models';

export class SQLiteDatabase extends Database {
    name = 'default';
    constructor() {
        super(new SQLiteDatabaseAdapter('/tmp/myapp.sqlite'), [User]);
    }
}

export const database = new SQLiteDatabase();
```

```sh
./node_modules/.bin/deepkit-sql migration:create --path database.ts --migrationDir src/migrations
```

`--path` akzeptiert Dateien, die `Database`-Instanzen exportieren (die Option kann mehrfach angegeben werden). TypeScript-Dateien werden mit `ts-node` geladen, das installiert sein muss, damit die Entities ihre Runtime-Types erhalten.

Eine neue Migrationsdatei wird in `src/migrations` erstellt. 

Die neu erstellte Migrationsdatei enthält nun die Methoden up und down, basierend auf dem Unterschied zwischen den in Ihrer TypeScript-App definierten Entities und der konfigurierten Datenbank. 
Sie können die up-Methode nun nach Ihren Bedürfnissen anpassen. Die down-Methode wird automatisch basierend auf der up-Methode generiert.
Sie committen diese Datei in Ihr Repository, damit auch andere Entwickler sie ausführen können.

## Ausstehende Migrationen

```sh
./node_modules/.bin/deepkit-sql migration:pending --path database.ts --migrationDir src/migrations
```

Dies zeigt alle ausstehenden Migrationen an. Wenn Sie eine neue Migrationsdatei haben, die noch nicht ausgeführt wurde, wird sie hier aufgelistet.

## Migrationen ausführen

```sh
./node_modules/.bin/deepkit-sql migration:up --path database.ts --migrationDir src/migrations
```

Dies führt die nächste ausstehende Migration aus. 

## Migrationen rückgängig machen

```sh
./node_modules/.bin/deepkit-sql migration:down --path database.ts --migrationDir src/migrations
```

Dies macht die zuletzt ausgeführte Migration rückgängig.

## Fake-Migrationen

Angenommen, Sie wollten eine Migration (up oder down) ausführen, aber sie ist fehlgeschlagen. Sie haben das Problem manuell behoben, können die Migration nun aber nicht erneut ausführen, da sie bereits ausgeführt wurde. Sie können die Option `--fake` verwenden, um die Migration vorzutäuschen, sodass sie in der Datenbank als ausgeführt markiert wird, ohne tatsächlich ausgeführt zu werden. Auf diese Weise können Sie die nächste ausstehende Migration ausführen.

```sh
./node_modules/.bin/deepkit-sql migration:up --path database.ts --migrationDir src/migrations --fake
```
