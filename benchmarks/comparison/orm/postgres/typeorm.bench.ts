// TypeORM with PostgreSQL, entities defined with EntitySchema.
import { DataSource, EntitySchema } from 'typeorm';

import { createRows, ormSuite, postgresUrl, resetPostgres, Row, rowCount } from '../shared.js';

interface Entity extends Row {
    id: number;
}

const columns = {
    id: { type: Number, primary: true, generated: true },
    name: { type: String },
    ready: { type: Boolean },
    priority: { type: Number },
} as const;
const User = new EntitySchema<Entity>({ name: 'User', tableName: 'bench_user', columns });
const Inserted = new EntitySchema<Entity>({ name: 'Inserted', tableName: 'bench_insert', columns });

export default async function () {
    await resetPostgres(false);
    const dataSource = new DataSource({ type: 'postgres', url: postgresUrl, entities: [User, Inserted], synchronize: true });
    await dataSource.initialize();
    const users = dataSource.getRepository(User);
    const inserted = dataSource.getRepository(Inserted);
    await users.insert(createRows(rowCount));

    return ormSuite('postgres', 'TypeORM', {
        findOne: id => users.findOneBy({ id }),
        findAll: () => users.find(),
        insertMany: async rows => void (await inserted.insert(rows)),
        deleteInserted: async () => void (await dataSource.createQueryBuilder().delete().from(Inserted).execute()),
        close: () => dataSource.destroy(),
    });
}
