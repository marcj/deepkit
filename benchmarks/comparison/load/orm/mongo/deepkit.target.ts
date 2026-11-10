// Deepkit ORM with the MongoDB adapter under load (own driver and BSON parser).
import { createRequire } from 'module';

// runtime type information of the annotations, the classes come from the CommonJS build below
import { MongoId, PrimaryKey } from '@deepkit/type';

import { mongoUrl } from '../../../orm/shared.js';
import { ormTarget, pageSize } from '../../orm-load.js';

// The ESM build of @deepkit/mongo 1.0.19 can't be loaded, so the CommonJS builds are used for all versions.
const require = createRequire(import.meta.url);
const { Database } = require('@deepkit/orm') as typeof import('@deepkit/orm');
const { entity } = require('@deepkit/type') as typeof import('@deepkit/type');
const { MongoDatabaseAdapter } = require('@deepkit/mongo') as typeof import('@deepkit/mongo');

@entity.name('bench_user')
class User {
    ready: boolean = false;
    priority: number = 0;

    constructor(
        public _id: number & PrimaryKey,
        public name: string,
    ) {}
}

@entity.name('bench_insert')
class Inserted {
    _id: MongoId & PrimaryKey = '';
    ready: boolean = false;
    priority: number = 0;

    constructor(public name: string) {}
}

export const target = ormTarget(async ({ poolSize }) => {
    const database = new Database(
        new MongoDatabaseAdapter(mongoUrl + (mongoUrl.includes('?') ? '&' : '?') + `maxPoolSize=${poolSize}`),
        [User, Inserted],
    );
    return {
        findOne: _id => database.query(User).filter({ _id }).findOneOrUndefined(),
        // no change detection afterwards, the other libraries only load too
        findPage: afterId =>
            database
                .query(User)
                .disableChangeDetection()
                .filter({ _id: { $gt: afterId } })
                .sort({ _id: 'asc' })
                .limit(pageSize)
                .find(),
        insertOne: async row => {
            const session = database.createSession();
            session.disableChangeDetection?.();
            const item = Object.assign(new Inserted(row.name), row);
            session.add(item);
            await session.commit();
            return item._id;
        },
    };
});
