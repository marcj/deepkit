# Seeding

Database Seeding bezeichnet das initiale Befüllen einer Datenbank mit Daten. Es ist eine Form der initialen Datenbankbefüllung, gedacht für die Verwendung während der Entwicklung, beim Testen oder bei der Initialisierung einer Produktionsdatenbank.

Deepkit ORM hat keine spezielle Seeding-API. Ein Seed ist eine normale Function, die eine `Database` erhält und Entities mit `database.persist()` oder einer [Session](session.md) einfügt. Dadurch ist derselbe Seed in einem CLI-Befehl, beim Start der Anwendung und in Tests verwendbar.

## Seed-Function

Die folgenden Entities werden in den Beispielen dieser Seite verwendet:

```typescript
import { AutoIncrement, entity, PrimaryKey, Reference, Unique } from '@deepkit/type';

@entity.name('author')
export class Author {
    id: number & PrimaryKey & AutoIncrement = 0;

    constructor(public username: string & Unique) {
    }
}

@entity.name('book')
export class Book {
    id: number & PrimaryKey & AutoIncrement = 0;

    constructor(public title: string, public author: Author & Reference) {
    }
}
```

Eine Seed-Function fügt alle Entities einer Session hinzu und committet sie auf einmal. Die Unit of Work sortiert die Inserts nach ihren Abhängigkeiten, sodass der Autor vor den Büchern eingefügt wird, die ihn referenzieren, und die Auto-Increment-ID des Autors den Büchern automatisch zugewiesen wird.

```typescript
import { Database } from '@deepkit/orm';

export async function seed(database: Database) {
    const session = database.createSession();

    const peter = new Author('peter');
    session.add(peter);

    for (let i = 1; i <= 3; i++) {
        session.add(new Book(`Book ${i}`, peter));
    }

    await session.commit();
}
```

Für einige wenige, voneinander unabhängige Entities reicht `database.persist()` aus:

```typescript
await database.persist(new Author('peter'), new Author('marie'));
```

## Idempotentes Seeding

Ein Seed, der mehr als einmal ausgeführt wird (z. B. bei jedem Start eines Entwicklungsservers), sollte dieselben Daten nicht doppelt einfügen oder mit einem Unique-Constraint-Error fehlschlagen. Prüfe vor dem Einfügen, ob die Daten bereits existieren:

```typescript
export async function seed(database: Database) {
    const exists = await database.query(Author).filter({ username: 'peter' }).has();
    if (exists) return;

    const session = database.createSession();
    const peter = new Author('peter');
    session.add(peter, new Book('Book 1', peter));
    await session.commit();
}
```

Um stattdessen mit einem sauberen Zustand zu beginnen, lösche zuerst die vorhandenen Datensätze. Lösche Entities, die andere referenzieren, vor den referenzierten:

```typescript
await database.query(Book).deleteMany();
await database.query(Author).deleteMany();
```

Wenn der Seed entweder vollständig oder gar nicht angewendet werden muss, führe ihn in einer [Transaktion](transactions.md) mit `database.transaction(async (session) => { ... })` aus.

## CLI-Befehl

In einer Deepkit-Anwendung wird das Seeding typischerweise in einem CLI-Befehl durchgeführt. Die Datenbank-Class wird wie jeder andere Service per Dependency Injection injiziert. Siehe [CLI](../cli/getting-started.md) für weitere Informationen zu Befehlen.

```typescript
import { App, cli, Flag } from '@deepkit/app';
import { FrameworkModule } from '@deepkit/framework';
import { Logger } from '@deepkit/logger';
import { Database } from '@deepkit/orm';
import { SQLiteDatabaseAdapter } from '@deepkit/sqlite';

class AppDatabase extends Database {
    constructor() {
        super(new SQLiteDatabaseAdapter('./app.sqlite'), [Author, Book]);
    }
}

@cli.controller('db:seed', {
    description: 'Seed the database with initial data',
})
class SeedCommand {
    constructor(
        protected database: AppDatabase,
        protected logger: Logger,
    ) {
    }

    async execute(reset: boolean & Flag = false) {
        if (reset) {
            await this.database.query(Book).deleteMany();
            await this.database.query(Author).deleteMany();
        }

        await seed(this.database);
        this.logger.log(`Database seeded, ${await this.database.query(Book).count()} books.`);
    }
}

new App({
    providers: [AppDatabase],
    controllers: [SeedCommand],
    imports: [new FrameworkModule()],
}).run();
```

```sh
$ ts-node app.ts db:seed
$ ts-node app.ts db:seed --reset
```

Die Tabellen müssen vor dem Seeding existieren. Erstelle sie mit [Migrationen](migrations.md) (oder während des Prototypings mit `database.migrate()` / `migrateOnStartup`).

## Fixture-Daten

Seed-Daten müssen nicht von einer Fake-Data-Bibliothek generiert werden. Einfache Objektliterale in einer Fixture-Datei sind leichter zu lesen und erzeugen bei jedem Durchlauf dieselben Daten, was Tests deterministisch macht. Verwende `cast` aus `@deepkit/type`, um sie in Entity-Instanzen umzuwandeln. `cast` validiert die Daten außerdem, sodass ungültige Fixtures frühzeitig fehlschlagen.

```typescript
import { cast } from '@deepkit/type';

const authorFixtures = [
    { username: 'peter' },
    { username: 'marie' },
];

await database.persist(...authorFixtures.map(v => cast<Author>(v)));
```

Für größere Datenmengen generiere sie mit einer einfachen Schleife:

```typescript
const session = database.createSession();
for (let i = 0; i < 1000; i++) {
    session.add(new Author(`user${i}`));
}
await session.commit();
```

## Seeding in Tests

Verwende in Tests den `MemoryDatabaseAdapter` aus `@deepkit/orm`. Er benötigt keinen laufenden Datenbankserver und keine Migration, und jeder Test erhält eine frische, isolierte Datenbank.

```typescript
import { expect, test } from '@jest/globals';
import { Database, MemoryDatabaseAdapter } from '@deepkit/orm';

test('books by author', async () => {
    const database = new Database(new MemoryDatabaseAdapter(), [Author, Book]);
    await seed(database);

    const peter = await database.query(Author).filter({ username: 'peter' }).findOne();
    const books = await database.query(Book).filter({ author: peter }).find();
    expect(books.map(book => book.title)).toEqual(['Book 1', 'Book 2', 'Book 3']);
});
```

Wenn du eine Deepkit-Anwendung mit `createTestingApp` testest, übergib die Entities als zweites Argument. Dies registriert eine `Database` mit einem `MemoryDatabaseAdapter`, die du vor der Ausführung des Tests seeden kannst. Siehe [Testing](../framework/testing.md).

```typescript
import { createTestingApp } from '@deepkit/framework';
import { Database } from '@deepkit/orm';

test('seeded app', async () => {
    const testing = createTestingApp({ controllers: [BookController] }, [Author, Book]);
    await seed(testing.app.get(Database));

    // ...
});
```

Der Memory-Adapter unterstützt keine Joins und führt kein SQL aus. Für Tests, die von Joins oder datenbankspezifischem Verhalten (Constraints, Collations, Raw SQL) abhängen, verwende `new SQLiteDatabaseAdapter(':memory:')` aus `@deepkit/sqlite` (rufe `database.migrate()` vor dem Seeding auf) oder deinen echten Datenbank-Adapter.
