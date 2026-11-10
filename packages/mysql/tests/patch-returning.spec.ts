import { expect, test } from '@jest/globals';

import { Database } from '@deepkit/orm';
import { PrimaryKey, entity } from '@deepkit/type';

import { MySQLDatabaseAdapter } from '../src/mysql-adapter.js';

test('#742 patchOne with returning() a patched field or the primary key', async () => {
    @entity.name('patch_returning_article')
    class Article {
        counter: number = 0;
        constructor(
            public id: number & PrimaryKey,
            public title: string,
        ) {}
    }

    const adapter = new MySQLDatabaseAdapter({ host: '127.0.0.1', user: 'root', database: 'default', password: process.env.MYSQL_PW });
    const database = new Database(adapter, [Article]);
    try {
        await adapter.createTables(database.entityRegistry);
        await database.query(Article).deleteMany();
        await database.persist(new Article(1, 'Draft'));
        const article = () => database.query(Article).filter({ id: 1 });

        expect(await article().returning('title').patchOne({ title: 'Published' })).toEqual({ modified: 1, returning: { title: ['Published'] }, primaryKeys: [{ id: 1 }] });
        expect(
            await article()
                .returning('counter')
                .patchOne({ $inc: { counter: 5 } }),
        ).toEqual({ modified: 1, returning: { counter: [5] }, primaryKeys: [{ id: 1 }] });
        expect(await article().returning('id').patchOne({ title: 'Published' })).toEqual({ modified: 1, returning: { id: [1] }, primaryKeys: [{ id: 1 }] });
    } finally {
        database.disconnect();
    }
});
