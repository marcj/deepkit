import { afterEach, expect, test } from '@jest/globals';

import { PostgresClient } from '../../src/client/index.js';

const open: PostgresClient[] = [];
afterEach(() => {
    for (const created of open.splice(0)) created.close();
});

async function roundtrip(cast: string, value: any): Promise<[unprepared: any, prepared: any]> {
    const pool = new PostgresClient({ host: '127.0.0.1', port: 5432, user: 'postgres', database: 'postgres' });
    open.push(pool);
    const conn = await pool.acquire();
    try {
        const sql = `SELECT $1::${cast} AS v`;
        return [(await conn.queryRow(sql, [value])).v, (await conn.queryRow(sql, [value], undefined, true)).v];
    } finally {
        pool.release(conn);
    }
}

test('-0 keeps its sign', async () => {
    // String(-0) is '0'
    const [unprepared, prepared] = await roundtrip('float8', -0);
    expect(Object.is(unprepared, -0)).toBe(true);
    expect(Object.is(prepared, -0)).toBe(true);
});

test('a date whose zone offset has seconds', async () => {
    // before 1893 Europe/Berlin is local mean time, +00:53:28, which getTimezoneOffset() rounds to minutes.
    // A date sent as text came back 28 seconds off.
    const zone = process.env.TZ;
    process.env.TZ = 'Europe/Berlin';
    try {
        for (const iso of ['0001-01-01T00:00:00.000Z', '1850-06-15T12:30:45.123Z', '1969-12-31T23:59:59.999Z']) {
            const [unprepared, prepared] = await roundtrip('timestamptz', new Date(iso));
            expect([iso, unprepared.toISOString(), prepared.toISOString()]).toEqual([iso, iso, iso]);
        }
    } finally {
        if (zone === undefined) delete process.env.TZ;
        else process.env.TZ = zone;
    }
});

test('int8[] has numbers and bigints like a single int8', async () => {
    const value = [1, -2, null, 9007199254740993n];
    expect(await roundtrip('int8[]', value)).toEqual([value, value]);
    expect(await roundtrip('int8', 9007199254740993n)).toEqual([9007199254740993n, 9007199254740993n]);
});

test('a cached statement keeps working after its column changes the type', async () => {
    const pool = new PostgresClient({ host: '127.0.0.1', port: 5432, user: 'postgres', database: 'postgres' });
    open.push(pool);
    const conn = await pool.acquire();
    try {
        await conn.query('CREATE TEMP TABLE type_change (a int)');
        await conn.query('INSERT INTO type_change VALUES (1)');
        const select = 'SELECT a FROM type_change WHERE a = $1';
        expect(await conn.queryRows(select, [1], undefined, true)).toEqual([{ a: 1 }]);
        expect(await conn.queryRows(select, [1], undefined, true)).toEqual([{ a: 1 }]);

        // the statement kept $1 as integer: "operator does not exist: text = integer"
        await conn.query('ALTER TABLE type_change ALTER COLUMN a TYPE text');
        expect(await conn.queryRows(select, ['1'], undefined, true)).toEqual([{ a: '1' }]);

        // a query that never worked is not repeated
        await expect(conn.queryRows('SELECT a FROM type_change WHERE a = $1::int', [1], undefined, true)).rejects.toThrow('operator does not exist');
    } finally {
        pool.release(conn);
    }
});
