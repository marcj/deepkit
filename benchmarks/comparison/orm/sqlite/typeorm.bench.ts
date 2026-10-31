// TypeORM with better-sqlite3, entities defined with EntitySchema (no decorator metadata needed).
import { DataSource, EntitySchema } from 'typeorm';

import { createRows, ormSuite, Row, rowCount, sqliteFile } from '../shared.js';

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
    const dataSource = new DataSource({ type: 'better-sqlite3', database: sqliteFile('typeorm'), entities: [User, Inserted], synchronize: true });
    await dataSource.initialize();
    const users = dataSource.getRepository(User);
    const inserted = dataSource.getRepository(Inserted);
    await users.insert(createRows(rowCount));

    return ormSuite('sqlite', 'TypeORM', {
        findOne: id => users.findOneBy({ id }),
        findAll: () => users.find(),
        insertMany: async rows => void (await inserted.insert(rows)),
        deleteInserted: () => inserted.clear(),
        close: () => dataSource.destroy(),
    });
}
