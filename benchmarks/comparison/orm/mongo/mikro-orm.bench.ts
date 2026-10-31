// MikroORM with its MongoDB driver, entities defined with EntitySchema, a forked EntityManager per operation.
import { EntitySchema, MikroORM, ObjectId } from '@mikro-orm/mongodb';

import { createRows, createRowsWithId, mongoUrl, ormSuite, resetMongo, Row, rowCount } from '../shared.js';

class User {
    _id!: number;
    name!: string;
    ready!: boolean;
    priority!: number;
}
class Inserted {
    _id!: ObjectId;
    name!: string;
    ready!: boolean;
    priority!: number;
}

const fields = { name: { type: 'string' }, ready: { type: 'boolean' }, priority: { type: 'number' } } as const;

export default async function () {
    await resetMongo();
    const orm = await MikroORM.init({
        clientUrl: mongoUrl,
        entities: [
            new EntitySchema({ class: User, collection: 'bench_user', properties: { _id: { type: 'number', primary: true }, ...fields } }),
            new EntitySchema({ class: Inserted, collection: 'bench_insert', properties: { _id: { type: 'ObjectId', primary: true }, ...fields } }),
        ],
        debug: false,
    });

    const em = orm.em.fork();
    for (const row of createRowsWithId(rowCount)) em.create(User, row);
    await em.flush();

    return ormSuite('mongo', 'MikroORM', {
        findOne: id => orm.em.fork().findOne(User, id),
        findAll: () => orm.em.fork().find(User, {}),
        insertMany: async (rows: Row[]) => {
            const em = orm.em.fork();
            for (const row of rows) em.create(Inserted, row);
            await em.flush();
        },
        deleteInserted: async () => void (await orm.em.fork().nativeDelete(Inserted, {})),
        close: () => orm.close(),
    });
}
