// Deepkit ORM with the MongoDB adapter (own driver and BSON parser), entities as classes.
import { createRequire } from 'module';

import { BenchSuite } from '@deepkit/bench';
// runtime type information of the annotations, the classes come from the CommonJS build below
import { MongoId, PrimaryKey } from '@deepkit/type';

// The ESM build of @deepkit/mongo 1.0.19 can't be loaded, so the CommonJS builds are used for all versions.
const require = createRequire(import.meta.url);
const { Database } = require('@deepkit/orm') as typeof import('@deepkit/orm');
const { entity } = require('@deepkit/type') as typeof import('@deepkit/type');
const { MongoDatabaseAdapter } = require('@deepkit/mongo') as typeof import('@deepkit/mongo');

import { createRowsWithId, mongoUrl, ormSuite, resetMongo, rowCount } from '../shared.js';

@entity.name('bench_user')
class User {
    ready: boolean = false;
    priority: number = 0;

    constructor(public _id: number & PrimaryKey, public name: string) {}
}

@entity.name('bench_insert')
class Inserted {
    _id: MongoId & PrimaryKey = '';
    ready: boolean = false;
    priority: number = 0;

    constructor(public name: string) {}
}

export default async function (): Promise<BenchSuite> {
    await resetMongo();
    const database = new Database(new MongoDatabaseAdapter(mongoUrl), [User, Inserted]);

    const session = database.createSession();
    for (const row of createRowsWithId(rowCount)) session.add(Object.assign(new User(row._id, row.name), row));
    await session.commit();

    return ormSuite('mongo', 'Deepkit', {
        findOne: _id => database.query(User).filter({ _id }).findOneOrUndefined(),
        // no change detection afterwards, the other libraries only load too
        findAll: () => database.query(User).disableChangeDetection().find(),
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
