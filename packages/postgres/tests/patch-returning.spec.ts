import { expect, test } from '@jest/globals';

import { Database, PatchResult } from '@deepkit/orm';
import { PostgresDatabaseAdapter } from '@deepkit/postgres';
import { sql } from '@deepkit/sql';
import { PrimaryKey, entity } from '@deepkit/type';

test('patchOne with returning() gives the patched field or the primary key', async () => {
    @entity.name('patch_returning_article')
    class Article {
        counter: number = 0;
        constructor(
            public id: number & PrimaryKey,
            public title: string,
        ) {}
    }

    const database = new Database(new PostgresDatabaseAdapter({ host: 'localhost', database: 'postgres', user: 'postgres' }), [Article]);
    const dropTable = () => database.raw(sql`DROP TABLE IF EXISTS patch_returning_article`).execute();

    // A failed patch is recorded as PostgreSQL's own message (the error's cause), so the diff stays readable.
    const resultOrDatabaseError = (patch: Promise<PatchResult<Article>>) => patch.catch((error: Error) => (error.cause as Error)?.message ?? error.message);

    try {
        await dropTable();
        await database.migrate();
        await database.persist(new Article(1, 'Draft'));
        const article = () => database.query(Article).filter({ id: 1 });

        expect({
            'returning a set field': await resultOrDatabaseError(article().returning('title').patchOne({ title: 'Published' })),
            'returning an incremented field': await resultOrDatabaseError(
                article()
                    .returning('counter')
                    .patchOne({ $inc: { counter: 5 } }),
            ),
            'returning the primary key': await resultOrDatabaseError(article().returning('id').patchOne({ title: 'Published' })),
        }).toEqual({
            'returning a set field': { modified: 1, returning: { title: ['Published'] }, primaryKeys: [{ id: 1 }] },
            'returning an incremented field': { modified: 1, returning: { counter: [5] }, primaryKeys: [{ id: 1 }] },
            'returning the primary key': { modified: 1, returning: { id: [1] }, primaryKeys: [{ id: 1 }] },
        });
    } finally {
        await dropTable().catch(() => undefined);
        database.disconnect();
    }
});
