import { Database } from '@deepkit/orm';
import { AutoIncrement, PrimaryKey, entity } from '@deepkit/type';
import { afterEach, expect, test } from '@jest/globals';

import { PostgresDatabaseAdapter } from '../src/postgres-adapter.js';

@entity.name('arrayRowItem')
class Item {
    id: number & PrimaryKey & AutoIncrement = 0;
    ready: boolean = false;
    created: Date = new Date('2020-01-01T00:00:00.000Z');
    data: { a: number } = { a: 1 };

    constructor(public name: string) {}
}

let open: Database | undefined;
afterEach(async () => {
    open?.disconnect();
    open = undefined;
});

async function setup() {
    const adapter = new PostgresDatabaseAdapter({ host: 'localhost', database: 'postgres', user: 'postgres', max: 1 });
    const database = new Database(adapter, [Item]);
    open = database;
    await adapter.createTables(database.entityRegistry);
    await database.query(Item).deleteMany();
    const a = new Item('a');
    a.ready = true;
    await database.persist(a, new Item('b'));
    const connection = await adapter.connectionPool.getConnection();
    connection.release();
    return { database, connection };
}

test('entities are converted from the columns', async () => {
    const { database } = await setup();
    const items = await database.query(Item).sort({ id: 'asc' }).find();
    expect(items[0]).toBeInstanceOf(Item);
    expect(items.map(v => [v.name, v.ready, v.created, v.data])).toEqual([
        ['a', true, new Date('2020-01-01T00:00:00.000Z'), { a: 1 }],
        ['b', false, new Date('2020-01-01T00:00:00.000Z'), { a: 1 }],
    ]);
});

test('with parameters, also when run again', async () => {
    const { connection } = await setup();
    const sql = 'SELECT name AS "my name", 1::int AS one FROM "arrayRowItem" WHERE name = $1';
    for (let i = 0; i < 2; i++) {
        expect(await connection.execAndReturnAll(sql, ['a'])).toEqual([{ 'my name': 'a', one: 1 }]);
    }
});

test('values are parsed by their type', async () => {
    const { connection } = await setup();
    const [row] = await connection.execAndReturnAll(`SELECT 1::int AS i, true AS b, '{"a":1}'::jsonb AS j, '2020-01-01T00:00:00Z'::timestamptz AS d, null AS n`);
    expect(row).toEqual({ i: 1, b: true, j: { a: 1 }, d: new Date('2020-01-01T00:00:00.000Z'), n: null });
});

test('no row', async () => {
    const { connection } = await setup();
    expect(await connection.execAndReturnAll(`SELECT name FROM "arrayRowItem" WHERE name = $1`, ['nope'])).toEqual([]);
});

test('the same name twice returns the last column', async () => {
    const { connection } = await setup();
    expect(await connection.execAndReturnAll('SELECT 1::int AS a, 2::int AS a')).toEqual([{ a: 2 }]);
});

test('a statement without rows', async () => {
    const { connection } = await setup();
    expect(await connection.execAndReturnAll(`DELETE FROM "arrayRowItem" WHERE name = 'nope'`)).toEqual([]);
});

test('several statements at once do not fail', async () => {
    const { connection } = await setup();
    await expect(connection.execAndReturnAll('SELECT 1; SELECT 2')).resolves.toBe(undefined);
});
