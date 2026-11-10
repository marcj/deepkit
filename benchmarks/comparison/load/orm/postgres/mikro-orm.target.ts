// MikroORM with PostgreSQL under load, entities defined with EntitySchema, a forked EntityManager per operation.
import { EntitySchema, MikroORM } from '@mikro-orm/postgresql';

import { postgresUrl } from '../../../orm/shared.js';
import { ormTarget, pageSize } from '../../orm-load.js';

class User {
    id!: number;
    name!: string;
    ready!: boolean;
    priority!: number;
}
class Inserted {
    id!: number;
    name!: string;
    ready!: boolean;
    priority!: number;
}

const properties = {
    id: { type: 'number', primary: true, autoincrement: true },
    name: { type: 'string' },
    ready: { type: 'boolean' },
    priority: { type: 'number' },
} as const;

export const target = ormTarget(async ({ poolSize }) => {
    const orm = await MikroORM.init({
        clientUrl: postgresUrl,
        pool: { max: poolSize },
        entities: [
            new EntitySchema({ class: User, tableName: 'bench_user', properties }),
            new EntitySchema({ class: Inserted, tableName: 'bench_insert', properties }),
        ],
        debug: false,
    });
    return {
        findOne: id => orm.em.fork().findOne(User, id),
        findPage: afterId =>
            orm.em.fork().find(User, { id: { $gt: afterId } }, { orderBy: { id: 'asc' }, limit: pageSize }),
        insertOne: async row => {
            const em = orm.em.fork();
            const item = em.create(Inserted, row);
            await em.flush();
            return item.id;
        },
    };
});
