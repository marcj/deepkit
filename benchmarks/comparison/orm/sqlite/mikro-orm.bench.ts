// MikroORM with its SQLite driver, entities defined with EntitySchema. A forked EntityManager per operation,
// as MikroORM requires for separate units of work.
import { EntitySchema, MikroORM } from '@mikro-orm/sqlite';

import { createRows, ormSuite, Row, rowCount, sqliteFile } from '../shared.js';

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

export default async function () {
    const orm = await MikroORM.init({
        dbName: sqliteFile('mikro-orm'),
        entities: [
            new EntitySchema({ class: User, tableName: 'bench_user', properties }),
            new EntitySchema({ class: Inserted, tableName: 'bench_insert', properties }),
        ],
        debug: false,
    });
    await orm.schema.create();

    const insert = async (entity: typeof User | typeof Inserted, rows: Row[]) => {
        const em = orm.em.fork();
        const items = rows.map(row => em.create(entity, row));
        await em.flush();
        return items.map((v: any) => v.id);
    };
    await insert(User, createRows(rowCount));

    return ormSuite('sqlite', 'MikroORM', {
        findOne: id => orm.em.fork().findOne(User, id),
        findAll: () => orm.em.fork().find(User, {}),
        insertMany: rows => orm.em.fork().insertMany(Inserted, rows),
        insertEntities: rows => insert(Inserted, rows),
        deleteInserted: async () => void (await orm.em.fork().nativeDelete(Inserted, {})),
        close: () => orm.close(),
    });
}
