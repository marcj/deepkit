# Session / Unit Of Work

Eine Session ist so etwas wie eine Unit of Work. Sie verfolgt alles, was Sie tun, und speichert die Änderungen automatisch, sobald `commit()` aufgerufen wird. Sie ist der bevorzugte Weg, Änderungen in der Datenbank auszuführen, da sie Statements so bündelt, dass die Ausführung sehr schnell ist. Eine Session ist sehr leichtgewichtig und kann problemlos zum Beispiel in einem Request-Response-Lifecycle erstellt werden.

```typescript
import { SQLiteDatabaseAdapter } from '@deepkit/sqlite';
import { entity, PrimaryKey, AutoIncrement } from '@deepkit/type';
import { Database } from '@deepkit/orm';

async function main() {

    @entity.name('user')
    class User {
        id: number & PrimaryKey & AutoIncrement = 0;
        created: Date = new Date;

        constructor(public name: string) {
        }
    }

    const database = new Database(new SQLiteDatabaseAdapter(':memory:'), [User]);
    await database.migrate();

    const session = database.createSession();
    session.add(new User('User1'), new User('User2'), new User('User3'));

    await session.commit();

    const users = await session.query(User).find();
    console.log(users);
}

main();
```

Fügen Sie der Session mit `session.add(T)` neue Instanzen hinzu oder entfernen Sie vorhandene Instanzen mit `session.remove(T)`. Sobald Sie das Session-Objekt nicht mehr benötigen, entfernen Sie einfach überall die Referenzen darauf, damit der Garbage Collector es beseitigen kann.

Änderungen an Entity-Instanzen, die über das Session-Objekt abgerufen wurden, werden automatisch erkannt.

```typescript
const users = await session.query(User).find();
for (const user of users) {
    user.name += ' changed';
}

await session.commit();//speichert alle Benutzer
```

## Identity Map

Sessions stellen eine Identity Map bereit, die sicherstellt, dass es pro Datenbankeintrag immer nur ein einziges JavaScript-Objekt gibt. Wenn Sie beispielsweise `session.query(User).find()` zweimal innerhalb derselben Session ausführen, erhalten Sie zwei verschiedene Arrays, die jedoch dieselben Entity-Instanzen enthalten.

Wenn Sie mit `session.add(entity1)` eine neue Entity hinzufügen und diese erneut abrufen, erhalten Sie genau dieselbe Entity-Instanz `entity1`.

Wichtig: Sobald Sie Sessions verwenden, sollten Sie deren Methode `session.query` anstelle von `database.query` nutzen. Nur bei Session-Queries ist das Identity Mapping aktiviert.

## Change Detection


Nach jedem Commit wird von jedem Element ein Snapshot erstellt, anhand dessen der nächste Commit Änderungen erkennt. Wenn eine Session Elemente nur einfügt und sie danach nicht mehr ändert, überspringt `disableChangeDetection()` die Snapshots. Der nächste Commit erkennt dann keine Änderungen an ihren Elementen.

```typescript
const session = database.createSession().disableChangeDetection();
session.add(...rows);
await session.commit();
```

## Request/Response
