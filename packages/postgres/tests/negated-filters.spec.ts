import { expect, test } from '@jest/globals';

import { Database, FilterQuery } from '@deepkit/orm';
import { PostgresDatabaseAdapter } from '@deepkit/postgres';
import { sql } from '@deepkit/sql';
import { PrimaryKey, entity } from '@deepkit/type';

test('field-level $not and $nor select the rows outside their conditions', async () => {
    @entity.name('negated_filter_user')
    class User {
        constructor(
            public id: number & PrimaryKey,
            public name: string,
            public age: number,
        ) {}
    }

    type UserFilter = FilterQuery<User>;

    const database = new Database(new PostgresDatabaseAdapter({ host: 'localhost', database: 'postgres', user: 'postgres' }), [User]);
    const dropTable = () => database.raw(sql`DROP TABLE IF EXISTS negated_filter_user`).execute();

    // A filter that throws is recorded as its error message, so each case shows what happened.
    const findUserNamesOrError = (filter: UserFilter) =>
        database
            .query(User)
            .filter(filter)
            .orderBy('id')
            .find()
            .then(
                users => users.map(user => user.name),
                (error: Error) => error.message,
            );

    try {
        await dropTable();
        await database.migrate();
        await database.persist(new User(1, 'apple', 1), new User(2, 'banana', 3), new User(3, 'cherry', 5));

        expect({
            '{ name: /an/ }': await findUserNamesOrError({ name: /an/ }),
            '{ name: { $not: /an/ } }': await findUserNamesOrError({ name: { $not: /an/ } }),
            '{ age: { $not: { $gt: 3 } } }': await findUserNamesOrError({ age: { $not: { $gt: 3 } } }),
            '{ $nor: [{ name: /an/ }, { age: { $gt: 3 } }] }': await findUserNamesOrError({ $nor: [{ name: /an/ }, { age: { $gt: 3 } }] }),
        }).toEqual({
            '{ name: /an/ }': ['banana'],
            '{ name: { $not: /an/ } }': ['apple', 'cherry'],
            '{ age: { $not: { $gt: 3 } } }': ['apple', 'banana'],
            '{ $nor: [{ name: /an/ }, { age: { $gt: 3 } }] }': ['apple'],
        });
    } finally {
        await dropTable().catch(() => undefined);
        database.disconnect();
    }
});
