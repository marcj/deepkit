import { Database } from '@deepkit/orm';
import { AutoIncrement, PrimaryKey, entity } from '@deepkit/type';
import { afterEach, expect, test } from '@jest/globals';

import { PostgresDatabaseAdapter } from '../src/postgres-adapter.js';

@entity.name('statementItem')
class Item {
    id: number & PrimaryKey & AutoIncrement = 0;
    age: number = 0;

    constructor(public name: string) {}
}

let open: Database | undefined;
afterEach(async () => {
    open?.disconnect();
    open = undefined;
});

async function setup(maxPreparedStatements?: number) {
    // one connection, so that every query sees the statements of the others
    const adapter = new PostgresDatabaseAdapter({ host: 'localhost', database: 'postgres', user: 'postgres', max: 1 });
    if (maxPreparedStatements !== undefined) adapter.connectionPool.maxPreparedStatements = maxPreparedStatements;
    const database = new Database(adapter, [Item]);
    open = database;
    await adapter.createTables(database.entityRegistry);
    await database.query(Item).deleteMany();
    await database.persist(new Item('a'), new Item('b'), new Item('c'));
    const firstId = (await database.query(Item).sort({ id: 'asc' }).findOne()).id;

    const execute = async (sql: string) => {
        const connection = await adapter.connectionPool.getConnection();
        try {
            return (await connection.connection.query(sql)).rows as any[];
        } finally {
            connection.release();
        }
    };
    const statements = async () => {
        const rows = await execute('SELECT statement FROM pg_prepared_statements');
        return rows.map(v => v.statement as string).filter(v => v.includes('statementItem'));
    };
    return { adapter, database, firstId, execute, statements };
}

test('the same query is prepared once and returns the row of its parameters', async () => {
    const { database, firstId, statements } = await setup();
    const first = await database.query(Item).filter({ id: firstId }).findOne();
    const second = await database.query(Item).filter({ id: firstId + 1 }).findOne();
    expect([first.name, second.name]).toEqual(['a', 'b']);
    expect(await statements()).toHaveLength(1);
});

test('a query without parameters stays unnamed', async () => {
    const { database, statements } = await setup();
    expect(await database.query(Item).find()).toHaveLength(3);
    expect(await statements()).toHaveLength(0);
});

test('maxPreparedStatements=0 turns it off', async () => {
    const { database, firstId, statements } = await setup(0);
    expect((await database.query(Item).filter({ id: firstId }).findOne()).name).toBe('a');
    expect(await statements()).toHaveLength(0);
});

test('the least recently used statement is removed from the server', async () => {
    const { database, firstId, statements } = await setup(2);
    await database.query(Item).filter({ id: firstId }).findOne();
    await database.query(Item).filter({ name: 'a' }).findOne();
    await database.query(Item).filter({ age: 0 }).limit(1).findOne();
    const left = await statements();
    expect(left).toHaveLength(2);
    expect(left.some(v => v.includes('"name" = $1'))).toBe(true);
    expect(left.some(v => v.includes('"age" = $1'))).toBe(true);
    // the removed one works again
    expect((await database.query(Item).filter({ id: firstId }).findOne()).name).toBe('a');
});

test('a changed column type does not break a kept statement', async () => {
    const { database, firstId, execute } = await setup();
    await database.query(Item).filter({ id: firstId }).findOne();
    await execute('ALTER TABLE "statementItem" ALTER COLUMN "age" TYPE bigint');
    expect((await database.query(Item).filter({ id: firstId }).findOne()).name).toBe('a');
    expect((await database.query(Item).filter({ id: firstId }).findOne()).name).toBe('a');
    await execute('DROP TABLE "statementItem"');
});

test('a statement removed behind our back is prepared again', async () => {
    const { database, firstId, execute } = await setup();
    await database.query(Item).filter({ id: firstId }).findOne();
    await execute('DEALLOCATE ALL');
    expect((await database.query(Item).filter({ id: firstId }).findOne()).name).toBe('a');
    expect((await database.query(Item).filter({ id: firstId + 1 }).findOne()).name).toBe('b');
});

test('a stale statement in a transaction fails it, and the next query works', async () => {
    const { database, firstId, execute } = await setup();
    await database.query(Item).filter({ id: firstId }).findOne();
    await execute('ALTER TABLE "statementItem" ALTER COLUMN "age" TYPE bigint');

    const session = database.createSession();
    session.useTransaction();
    await expect(session.query(Item).filter({ id: firstId }).findOne()).rejects.toThrow('cached plan');
    await session.rollback();

    expect((await database.query(Item).filter({ id: firstId }).findOne()).name).toBe('a');
    await execute('DROP TABLE "statementItem"');
});

test('a failing query keeps its statement usable', async () => {
    const { database, firstId } = await setup();
    await expect(database.query(Item).filter({ id: 'not a number' as any }).findOne()).rejects.toThrow();
    expect((await database.query(Item).filter({ id: firstId }).findOne()).name).toBe('a');
});
