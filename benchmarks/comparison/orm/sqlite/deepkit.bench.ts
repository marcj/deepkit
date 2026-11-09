// Deepkit ORM with the SQLite adapter, entities as classes.
import { BenchSuite } from '@deepkit/bench';
import { Database } from '@deepkit/orm';
import { SQLiteDatabaseAdapter } from '@deepkit/sqlite';
import { AutoIncrement, entity, PrimaryKey } from '@deepkit/type';

import { createRows, ormSuite, rowCount, sqliteFile } from '../shared.js';

@entity.name('bench_user')
class User {
    id: number & PrimaryKey & AutoIncrement = 0;
    ready: boolean = false;
    priority: number = 0;

    constructor(public name: string) {}
}

@entity.name('bench_insert')
class Inserted {
    id: number & PrimaryKey & AutoIncrement = 0;
    ready: boolean = false;
    priority: number = 0;

    constructor(public name: string) {}
}

export default async function (): Promise<BenchSuite> {
    const database = new Database(new SQLiteDatabaseAdapter(sqliteFile('deepkit')), [User, Inserted]);
    await database.migrate();

    const session = database.createSession();
    for (const row of createRows(rowCount)) session.add(Object.assign(new User(row.name), row));
    await session.commit();

    return ormSuite('sqlite', 'Deepkit', {
        findOne: id => database.query(User).filter({ id }).findOneOrUndefined(),
        findAll: () => database.query(User).find(),
        insertMany: async rows => {
            // no change detection afterwards, the other libraries only insert too. Older versions don't have this.
            const session = database.createSession();
            session.disableChangeDetection?.();
            for (const row of rows) session.add(Object.assign(new Inserted(row.name), row));
            await session.commit();
        },
        deleteInserted: async () => void (await database.query(Inserted).deleteMany()),
        close: async () => database.disconnect(),
    });
}
