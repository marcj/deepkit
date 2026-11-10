import { afterEach, expect, test } from '@jest/globals';

import { Database } from '@deepkit/orm';
import { AutoIncrement, PrimaryKey, entity } from '@deepkit/type';

import { PostgresError } from '../../src/client/errors.js';
import { PostgresConnection, PostgresDatabaseAdapter } from '../../src/postgres-adapter.js';

@entity.name('clientAdapterItem')
class Item {
    id: number & PrimaryKey & AutoIncrement = 0;
    big: bigint = 0n;
    value: number = 0;
    created: Date = new Date('2020-01-01T00:00:00.000Z');

    constructor(public name: string = '') {}
}

let open: Database | undefined;
afterEach(() => {
    open?.disconnect();
    open = undefined;
});

async function setup(max: number = 10) {
    const adapter = new PostgresDatabaseAdapter({ host: 'localhost', database: 'postgres', user: 'postgres', max });
    const database = new Database(adapter, [Item]);
    open = database;
    await adapter.createTables(database.entityRegistry);
    await database.query(Item).deleteMany();
    return { adapter, database };
}

test('a bigint beyond 2^53 keeps every digit in text and binary format', async () => {
    const { database } = await setup();
    const item = new Item('a');
    item.big = 9007199254740993n;
    await database.persist(item);
    for (let i = 0; i < 3; i++) {
        const read = await database.query(Item).filter({ name: 'a' }).findOne();
        expect(read.big).toBe(9007199254740993n);
    }
});

test('queries wait for a connection held exclusively', async () => {
    const { adapter, database } = await setup(1);
    await database.persist(new Item('a'), new Item('b'));
    const busy = await adapter.connectionPool.getConnection();
    const client = (busy as PostgresConnection).connection;

    const blocked = client.queryRows('SELECT pg_sleep(0.05)');
    // at the maximum of connections and the connection is exclusive to `busy`, so these wait behind it
    const limited = database.query(Item).filter({ name: 'a' }).limit(1).find();
    const unlimited = database.query(Item).find();
    await new Promise(resolve => setTimeout(resolve, 10));
    expect(client.load).toBe(1);
    busy.release();
    await blocked;
    expect((await limited).map(v => v.name)).toEqual(['a']);
    expect(await unlimited).toHaveLength(2);
    expect(adapter.connectionPool.getActiveConnections()).toBe(0);
});

test('shared connections pipeline at the maximum, exclusive ones do not', async () => {
    const { adapter } = await setup(1);
    const pool = adapter.connectionPool;
    const first = await pool.getConnection(undefined, true);
    const second = await pool.getConnection(undefined, true);
    expect((second as PostgresConnection).connection).toBe((first as PostgresConnection).connection);

    let acquired = false;
    const exclusive = pool.getConnection().then(v => {
        acquired = true;
        return v;
    });
    await new Promise(resolve => setTimeout(resolve, 20));
    expect(acquired).toBe(false);
    first.release();
    await new Promise(resolve => setTimeout(resolve, 20));
    expect(acquired).toBe(false);
    second.release();
    (await exclusive).release();
});

test('many concurrent queries over a single connection', async () => {
    const { database } = await setup(1);
    await database.persist(new Item('a'));
    const results = await Promise.all(Array.from({ length: 300 }, () => database.query(Item).filter({ name: 'a' }).limit(1).findOne()));
    expect(results.every(v => v.name === 'a')).toBe(true);
});

test('releasing a connection twice does not corrupt the pool', async () => {
    const { adapter } = await setup(1);
    const connection = await adapter.connectionPool.getConnection();
    connection.release();
    connection.release();
    expect(adapter.connectionPool.getActiveConnections()).toBe(0);
    const next = await adapter.connectionPool.getConnection();
    const again = await Promise.race([adapter.connectionPool.getConnection().then(() => 'second'), new Promise(resolve => setTimeout(() => resolve('blocked'), 50))]);
    expect(again).toBe('blocked');
    next.release();
});

test('the error of the server is the cause, with its fields', async () => {
    const { adapter } = await setup();
    const connection = await adapter.connectionPool.getConnection();
    try {
        const error: any = await connection.run('SELECT 1 FROM clientAdapterMissing').catch(v => v);
        expect(error.cause).toBeInstanceOf(PostgresError);
        expect(error.cause.code).toBe('42P01');
    } finally {
        connection.release();
    }
});

test('a query with an error keeps the pool usable', async () => {
    const { adapter, database } = await setup(1);
    const session = database.createSession();
    await expect(database.query(Item).filter({ name: 'a' }).findOne()).rejects.toThrow();
    expect(adapter.connectionPool.getActiveConnections()).toBe(0);
    session.add(new Item('b'));
    await session.commit();
    expect(await database.query(Item).count()).toBe(1);
});
