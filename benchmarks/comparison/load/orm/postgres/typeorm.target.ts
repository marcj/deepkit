// TypeORM with PostgreSQL under load, entities defined with EntitySchema.
import { DataSource, EntitySchema, MoreThan } from 'typeorm';

import { Row, postgresUrl } from '../../../orm/shared.js';
import { ormTarget, pageSize } from '../../orm-load.js';

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

export const target = ormTarget(async ({ poolSize }) => {
    const dataSource = new DataSource({
        type: 'postgres',
        url: postgresUrl,
        entities: [User, Inserted],
        synchronize: false,
        poolSize,
    });
    await dataSource.initialize();
    const users = dataSource.getRepository(User);
    const inserted = dataSource.getRepository(Inserted);
    return {
        findOne: id => users.findOneBy({ id }),
        findPage: afterId => users.find({ where: { id: MoreThan(afterId) }, order: { id: 'ASC' }, take: pageSize }),
        insertOne: async row => (await inserted.insert(row)).identifiers[0].id,
    };
});
