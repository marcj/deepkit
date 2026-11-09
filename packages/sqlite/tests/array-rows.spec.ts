import { Database } from '@deepkit/orm';
import { AutoIncrement, PrimaryKey, entity } from '@deepkit/type';
import { expect, test } from '@jest/globals';

import { SQLiteDatabaseAdapter } from '../src/sqlite-adapter.js';

@entity.name('arrayRowItem')
class Item {
    id: number & PrimaryKey & AutoIncrement = 0;
    ready: boolean = false;
    data: { a: number } = { a: 1 };

    constructor(public name: string) {}
}

async function setup() {
    const adapter = new SQLiteDatabaseAdapter(':memory:');
    const database = new Database(adapter, [Item]);
    await database.migrate();
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
    expect(items.map(v => [v.id, v.name, v.ready, v.data])).toEqual([
        [1, 'a', true, { a: 1 }],
        [2, 'b', false, { a: 1 }],
    ]);
    database.disconnect();
});

test('rows are objects with the names of the columns, also when run again', async () => {
    const { database, connection } = await setup();
    const sql = 'SELECT id AS "my id", name FROM arrayRowItem WHERE id = ?';
    for (let i = 0; i < 2; i++) {
        expect(await connection.execAndReturnAll(sql, [1])).toEqual([{ 'my id': 1, name: 'a' }]);
        expect(await connection.execAndReturnSingle(sql, [2])).toEqual({ 'my id': 2, name: 'b' });
    }
    database.disconnect();
});

test('no row', async () => {
    const { database, connection } = await setup();
    const sql = 'SELECT id FROM arrayRowItem WHERE id = ?';
    expect(await connection.execAndReturnAll(sql, [100])).toEqual([]);
    expect(await connection.execAndReturnSingle(sql, [100])).toBe(undefined);
    expect(await database.query(Item).filter({ id: 100 }).findOneOrUndefined()).toBe(undefined);
    database.disconnect();
});

test('the same name twice returns the last column', async () => {
    const { database, connection } = await setup();
    expect(await connection.execAndReturnSingle('SELECT 1 AS a, 2 AS a')).toEqual({ a: 2 });
    database.disconnect();
});

test('a * sees a column that was added after the query was first run', async () => {
    const { database, connection } = await setup();
    const sql = 'SELECT * FROM arrayRowItem WHERE id = ?';
    expect(Object.keys(await connection.execAndReturnSingle(sql, [1]))).not.toContain('added');
    await connection.run('ALTER TABLE arrayRowItem ADD COLUMN added INTEGER DEFAULT 5');
    expect(await connection.execAndReturnSingle(sql, [1])).toMatchObject({ id: 1, name: 'a', added: 5 });
    expect((await connection.execAndReturnAll(sql, [1]))[0]).toMatchObject({ id: 1, name: 'a', added: 5 });
    database.disconnect();
});

test('INSERT with RETURNING returns its rows', async () => {
    const { database, connection } = await setup();
    const sql = `INSERT INTO arrayRowItem (name, ready, data) VALUES (?, 0, '{}') RETURNING id, name`;
    expect(await connection.execAndReturnAll(sql, ['c'])).toEqual([{ id: 3, name: 'c' }]);
    expect(await connection.execAndReturnAll(sql, ['d'])).toEqual([{ id: 4, name: 'd' }]);
    database.disconnect();
});

test('a statement that returns no data fails like before', async () => {
    const { database, connection } = await setup();
    await expect(connection.execAndReturnAll(`DELETE FROM arrayRowItem`)).rejects.toThrow('does not return data');
    database.disconnect();
});
