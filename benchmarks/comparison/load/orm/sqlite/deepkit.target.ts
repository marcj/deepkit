// Deepkit ORM with the SQLite adapter, concurrent users in one process.
import { Database } from '@deepkit/orm';
import { SQLiteDatabaseAdapter } from '@deepkit/sqlite';
import { AutoIncrement, PrimaryKey, entity } from '@deepkit/type';

import { ormTarget, pageSize } from '../../orm-load.js';

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

export const target = ormTarget(async ({ file }) => {
    const database = new Database(new SQLiteDatabaseAdapter(file!), [User, Inserted]);
    return {
        findOne: id => database.query(User).filter({ id }).findOneOrUndefined(),
        // no change detection afterwards, the other libraries only load too
        findPage: afterId =>
            database
                .query(User)
                .disableChangeDetection()
                .filter({ id: { $gt: afterId } })
                .sort({ id: 'asc' })
                .limit(pageSize)
                .find(),
        insertOne: async row => {
            const session = database.createSession();
            session.disableChangeDetection?.();
            const item = Object.assign(new Inserted(row.name), row);
            session.add(item);
            await session.commit();
            return item.id;
        },
    };
});
