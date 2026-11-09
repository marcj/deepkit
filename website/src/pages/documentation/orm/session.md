# Session / Unit Of Work

A session is something like a unit of work. It keeps track of everything you do and automatically records the changes whenever `commit()` is called. It is the preferred way to execute changes in the database because it bundles statements in a way that makes it very fast. A session is very lightweight and can easily be created in a request-response lifecycle, for example.

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

Add new instance to the session with `session.add(T)` or remove existing instances with `session.remove(T)`. Once you are done with the Session object, simply dereference it everywhere so that the garbage collector can remove it.

Changes are automatically detected for entity instances fetched via the Session object.

```typescript
const users = await session.query(User).find();
for (const user of users) {
    user.name += ' changed';
}

await session.commit();//saves all users
```

## Identity Map

Sessions provide an identity map that ensures there is only ever one javascript object per database entry. For example, if you run `session.query(User).find()` twice within the same session, you get two different arrays, but with the same entity instances in them.

If you add a new entity with `session.add(entity1)` and retrieve it again, you get exactly the same entity instance `entity1`.

Important: Once you start using sessions, you should use their `session.query` method instead of `database.query`. Only session queries have the identity mapping feature enabled.

## Change Detection


After each commit a snapshot of every item is taken, on which the next commit detects changes. If a session only inserts items and doesn't change them afterwards, `disableChangeDetection()` skips the snapshots. The next commit then doesn't detect any changes of its items.

```typescript
const session = database.createSession().disableChangeDetection();
session.add(...rows);
await session.commit();
```

## Request/Response
