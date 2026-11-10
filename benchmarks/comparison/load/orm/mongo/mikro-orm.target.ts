// MikroORM with its MongoDB driver under load, entities defined with EntitySchema, a forked EntityManager per operation.
import { EntitySchema, MikroORM, ObjectId } from '@mikro-orm/mongodb';

import { mongoUrl } from '../../../orm/shared.js';
import { ormTarget, pageSize } from '../../orm-load.js';

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

export const target = ormTarget(async ({ poolSize }) => {
    const orm = await MikroORM.init({
        clientUrl: mongoUrl,
        pool: { max: poolSize },
        entities: [
            new EntitySchema({
                class: User,
                collection: 'bench_user',
                properties: { _id: { type: 'number', primary: true }, ...fields },
            }),
            new EntitySchema({
                class: Inserted,
                collection: 'bench_insert',
                properties: { _id: { type: 'ObjectId', primary: true }, ...fields },
            }),
        ],
        debug: false,
    });
    return {
        findOne: id => orm.em.fork().findOne(User, id),
        findPage: afterId =>
            orm.em.fork().find(User, { _id: { $gt: afterId } }, { orderBy: { _id: 'asc' }, limit: pageSize }),
        insertOne: async row => {
            const em = orm.em.fork();
            const item = em.create(Inserted, row);
            await em.flush();
            return item._id;
        },
    };
});
