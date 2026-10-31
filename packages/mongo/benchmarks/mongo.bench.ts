// MongoDB ORM operations against a real database (docker compose up -d mongo, or MONGO_URL),
// and the query conversion without a database.
import { createRequire } from 'module';

import { BenchSuite } from '@deepkit/bench';
// runtime type information of the annotations, the classes come from the CommonJS build below
import { Index, MongoId, PrimaryKey } from '@deepkit/type';

// The ESM build of @deepkit/mongo 1.0.19 can't be loaded, so the CommonJS builds are used for all versions.
const require = createRequire(import.meta.url);
const { Database } = require('@deepkit/orm') as typeof import('@deepkit/orm');
const { entity } = require('@deepkit/type') as typeof import('@deepkit/type');
const { convertClassQueryToMongo, MongoDatabaseAdapter } = require('@deepkit/mongo') as typeof import('@deepkit/mongo');

@entity.name('bench_user')
class User {
    _id: MongoId & PrimaryKey = '';
    created: Date = new Date;
    logins: number = 0;
    tags: string[] = ['a', 'b'];
    address?: { street: string; city: string };

    constructor(public name: string & Index, public email: string) {}
}

export default async function () {
    const suite = new BenchSuite('mongo');
    const database = new Database(new MongoDatabaseAdapter(process.env.MONGO_URL || 'mongodb://127.0.0.1/deepkit-bench'), [User]);
    await database.adapter.client.dropDatabase('deepkit-bench');
    await database.migrate();

    const users: User[] = [];
    for (let i = 0; i < 1000; i++) {
        const user = new User('user' + i, `user${i}@example.com`);
        user.address = { street: 'Street ' + i, city: 'Berlin' };
        users.push(user);
    }
    await database.persist(...users);
    const ids = users.map(v => v._id);
    let i = 0;

    suite.add('convert filter (no database)', () => convertClassQueryToMongo(User, { _id: ids[i++ % 1000], logins: { $gt: 5 } }));

    suite.add('findOne by _id', async () => {
        await database.query(User).filter({ _id: ids[i++ % 1000] }).findOne();
    });
    suite.add('find 100 with hydration', async () => {
        await database.query(User).limit(100).find();
    });
    suite.add('find 100 without hydration (lean)', async () => {
        await database.query(User).limit(100).disableIdentityMap().find();
    });
    suite.add('count with filter', async () => {
        await database.query(User).filter({ logins: 0 }).count();
    });
    suite.add('insert one', async () => {
        await database.persist(new User('new', 'new@example.com'));
    });
    suite.add('insert 100 in one session', async () => {
        const session = database.createSession();
        for (let k = 0; k < 100; k++) session.add(new User('batch' + k, 'batch@example.com'));
        await session.commit();
    });
    suite.add('patchOne', async () => {
        await database.query(User).filter({ _id: ids[i++ % 1000] }).patchOne({ logins: 1 });
    });
    suite.add('change detection + update of a loaded entity', async () => {
        const session = database.createSession();
        const user = await session.query(User).filter({ _id: ids[i++ % 1000] }).findOne();
        user.logins++;
        await session.commit();
    });

    // closes the connection after the suite ran
    const runAsync = suite.runAsync.bind(suite);
    suite.runAsync = async (...args) => {
        try {
            return await runAsync(...args);
        } finally {
            database.disconnect();
        }
    };
    return suite;
}
