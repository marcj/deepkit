import { Database } from '@deepkit/orm';
import { AutoIncrement, PrimaryKey, entity } from '@deepkit/type';
import { expect, jest, test } from '@jest/globals';

import { SQLiteDatabaseAdapter } from '../src/sqlite-adapter.js';

@entity.name('statementItem')
class Item {
    id: number & PrimaryKey & AutoIncrement = 0;
    age: number = 0;

    constructor(public name: string) {}
}

async function setup(maxPreparedStatements?: number) {
    const adapter = new SQLiteDatabaseAdapter(':memory:');
    if (maxPreparedStatements !== undefined) adapter.connectionPool.maxPreparedStatements = maxPreparedStatements;
    const database = new Database(adapter, [Item]);
    await database.migrate();
    await database.persist(new Item('a'), new Item('b'), new Item('c'));

    const connection = await adapter.connectionPool.getConnection();
    connection.release();
    const prepare = jest.spyOn(connection.db, 'prepare');
    const prepared = () => prepare.mock.calls.map(v => v[0] as string).filter(v => v.startsWith('SELECT'));
    return { adapter, database, connection, prepared };
}

test('the same query is prepared once and returns the row of its parameters', async () => {
    const { database, prepared } = await setup();
    const first = await database.query(Item).filter({ id: 1 }).findOne();
    const second = await database.query(Item).filter({ id: 2 }).findOne();
    const third = await database.query(Item).filter({ id: 3 }).findOne();
    expect([first.name, second.name, third.name]).toEqual(['a', 'b', 'c']);
    expect(prepared()).toHaveLength(1);
    database.disconnect();
});

test('different queries are prepared separately', async () => {
    const { database, prepared } = await setup();
    await database.query(Item).filter({ id: 1 }).findOne();
    await database.query(Item).filter({ name: 'a' }).findOne();
    await database.query(Item).filter({ id: 2 }).findOne();
    expect(prepared()).toHaveLength(2);
    database.disconnect();
});

test('count is reused too', async () => {
    const { database, prepared } = await setup();
    expect(await database.query(Item).filter({ age: 0 }).count()).toBe(3);
    expect(await database.query(Item).filter({ age: 1 }).count()).toBe(0);
    expect(prepared()).toHaveLength(1);
    database.disconnect();
});

test('maxPreparedStatements=0 turns it off', async () => {
    const { database, prepared } = await setup(0);
    await database.query(Item).filter({ id: 1 }).findOne();
    await database.query(Item).filter({ id: 2 }).findOne();
    expect(prepared()).toHaveLength(2);
    database.disconnect();
});

test('the least recently used statement is dropped', async () => {
    const { database, prepared } = await setup(2);
    await database.query(Item).filter({ id: 1 }).findOne(); // A
    await database.query(Item).filter({ name: 'a' }).findOne(); // B
    await database.query(Item).filter({ id: 1 }).findOne(); // A is now the most recent
    await database.query(Item).filter({ age: 0 }).limit(1).findOne(); // C drops B
    expect(prepared()).toHaveLength(3);
    await database.query(Item).filter({ id: 1 }).findOne(); // A is still there
    expect(prepared()).toHaveLength(3);
    await database.query(Item).filter({ name: 'a' }).findOne(); // B is prepared again
    expect(prepared()).toHaveLength(4);
    database.disconnect();
});

test('a very long statement is not kept', async () => {
    const { database, prepared } = await setup();
    const ids = Array.from({ length: 5000 }, (_, i) => i + 1);
    await database.query(Item).filter({ id: { $in: ids } }).find();
    await database.query(Item).filter({ id: { $in: ids } }).find();
    expect(prepared()).toHaveLength(2);
    database.disconnect();
});

test('a kept statement sees schema changes', async () => {
    const { adapter, database, connection } = await setup();
    await database.query(Item).filter({ id: 1 }).findOne();
    await connection.run('ALTER TABLE "statementItem" ADD COLUMN "extra" integer');
    expect((await database.query(Item).filter({ id: 1 }).findOne()).name).toBe('a');

    await connection.run('DROP TABLE "statementItem"');
    await expect(database.query(Item).filter({ id: 1 }).findOne()).rejects.toThrow();
    await adapter.createTables(database.entityRegistry);
    await database.persist(new Item('new'));
    expect((await database.query(Item).filter({ id: 1 }).findOne()).name).toBe('new');
    database.disconnect();
});

test('a kept statement works within transactions and after a rollback', async () => {
    const { database } = await setup();
    await database.query(Item).filter({ name: 'd' }).findOneOrUndefined();
    const session = database.createSession();
    session.useTransaction();
    session.add(new Item('d'));
    await session.flush();
    expect((await session.query(Item).filter({ name: 'd' }).findOne()).name).toBe('d');
    await session.rollback();
    expect(await database.query(Item).filter({ name: 'd' }).findOneOrUndefined()).toBeUndefined();
    database.disconnect();
});
