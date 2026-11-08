import { expect, test } from '@jest/globals';

import { Database } from '@deepkit/orm';
import { SqlPlaceholderStrategy, sql } from '@deepkit/sql';

import { SQLiteDatabaseAdapter } from '../src/sqlite-adapter.js';
import { SQLitePlatform } from '../src/sqlite-platform.js';

//https://github.com/marcj/deepkit/issues/723
function convert(query: ReturnType<typeof sql>) {
    return query.convertToSQL(new SQLitePlatform(), new SqlPlaceholderStrategy());
}

test('control: a flat template with a parameter', () => {
    expect(convert(sql`SELECT 1 WHERE name = ${'bob'}`)).toEqual({ sql: 'SELECT 1 WHERE name = ?', params: ['bob'] });
});

test('nested template is inlined with its parameters', () => {
    const byName = (name: string) => sql`name = ${name}`;
    expect(convert(sql`SELECT * FROM "user" WHERE ${byName('bob')}`)).toEqual({
        sql: 'SELECT * FROM "user" WHERE name = ?',
        params: ['bob'],
    });
});

test('nested template keeps the parameter order', () => {
    const inner = sql`b = ${2}`;
    expect(convert(sql`a = ${1} AND ${inner} AND c = ${3}`)).toEqual({
        sql: 'a = ? AND b = ? AND c = ?',
        params: [1, 2, 3],
    });
});

test('nested template runs against a real database', async () => {
    const database = new Database(new SQLiteDatabaseAdapter(':memory:'));
    const fragment = sql`value = ${42}`;
    const result = await database.raw<{ value: number }>(sql`SELECT * FROM (SELECT 42 AS value) WHERE ${fragment}`).find();
    expect(result).toEqual([{ value: 42 }]);
    database.disconnect();
});
