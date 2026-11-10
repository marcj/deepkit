import { afterEach, describe, expect, jest, test } from '@jest/globals';

import { SocketWriter } from '@deepkit/net/node';

import { CompiledBind, PostgresClient, PostgresClientConnection, PostgresConnectionError, PostgresEncoder, PostgresError, RowMode, ScramClient, parsePostgresConnectionString, resolvePostgresOptions } from '../../src/client/index.js';
import { createAuthServer } from './mock-server.js';

const connection = { host: '127.0.0.1', port: 5432, user: 'postgres', database: 'postgres' };

const open: PostgresClient[] = [];
function client(options = {}): PostgresClient {
    const created = new PostgresClient({ ...connection, ...options });
    open.push(created);
    return created;
}

afterEach(() => {
    for (const created of open.splice(0)) created.close();
});

async function withConnection<T>(fn: (conn: PostgresClientConnection, pool: PostgresClient) => Promise<T>, options = {}): Promise<T> {
    const pool = client(options);
    const conn = await pool.acquire();
    try {
        return await fn(conn, pool);
    } finally {
        pool.release(conn);
    }
}

async function schema(conn: PostgresClientConnection, name: string, ddl: string): Promise<void> {
    await conn.query(`DROP SCHEMA IF EXISTS ${name} CASCADE; CREATE SCHEMA ${name}; ${ddl}`);
}

describe('types', () => {
    const cases: [string, any][] = [
        ['1::int2', 1],
        ['-2::int2', -2],
        ['123456::int4', 123456],
        ['-123456::int4', -123456],
        ['2147483647::int4', 2147483647],
        [`'-2147483648'::int4`, -2147483648],
        ['0::int8', 0],
        ['9007199254740991::int8', 9007199254740991],
        ['-9007199254740991::int8', -9007199254740991],
        ['9223372036854775807::int8', 9223372036854775807n],
        [`'-9223372036854775808'::int8`, -9223372036854775808n],
        ['1.5::float4', 1.5],
        ['0.1::float8', 0.1],
        [`'NaN'::float8`, NaN],
        [`'Infinity'::float8`, Infinity],
        ['123.456::numeric', 123.456],
        ['true', true],
        ['false', false],
        [`'abc'::text`, 'abc'],
        [`''::text`, ''],
        [`'äöü€😀'::text`, 'äöü€😀'],
        [`'abcd'::varchar(10)`, 'abcd'],
        [`'a'::char(3)`, 'a  '],
        [`'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11'::uuid`, 'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11'],
        [`'\\xdeadbeef'::bytea`, Buffer.from('deadbeef', 'hex')],
        [`''::bytea`, Buffer.alloc(0)],
        [`'{"a":[1,"ä"]}'::json`, { a: [1, 'ä'] }],
        [`'{"a":[1,"ä"]}'::jsonb`, { a: [1, 'ä'] }],
        [`'[1,2]'::jsonb`, [1, 2]],
        [`'2020-01-02 03:04:05.678+01'::timestamptz`, new Date('2020-01-02T02:04:05.678Z')],
        [`'2020-01-02 03:04:05.678-04:30'::timestamptz`, new Date('2020-01-02T07:34:05.678Z')],
        [`'1999-12-31 23:59:59.9999+00'::timestamptz`, new Date('1999-12-31T23:59:59.999Z')],
        [`'infinity'::timestamptz`, Infinity],
        [`'-infinity'::timestamp`, -Infinity],
        [`'infinity'::date`, Infinity],
        [`ARRAY[1,NULL,3]::int4[]`, [1, null, 3]],
        [`ARRAY[1.5,2.5]::float8[]`, [1.5, 2.5]],
        [`ARRAY['a,b','c"d','e\\f', NULL, 'NULL', '']::text[]`, ['a,b', 'c"d', 'e\\f', null, 'NULL', '']],
        [
            `ARRAY[[1,2],[3,4]]::int4[]`,
            [
                [1, 2],
                [3, 4],
            ],
        ],
        [`ARRAY[true,false]::bool[]`, [true, false]],
        [`'{}'::int4[]`, []],
        [`ARRAY['{"a":1}'::jsonb]`, [{ a: 1 }]],
        [`ARRAY['\\x01ff'::bytea]`, [Buffer.from('01ff', 'hex')]],
        [`ARRAY['2020-01-02 03:04:05+00'::timestamptz]`, [new Date('2020-01-02T03:04:05.000Z')]],
        [`'[2:3]={1,2}'::int4[]`, [1, 2]],
        [`'a'::name`, 'a'],
        [`'1 2'::int2vector`, '1 2'],
        [`null::int4`, null],
        [`null::text`, null],
        [`null::jsonb`, null],
    ];

    test.each(cases)('%s in text and binary format', async (expression, expected) => {
        await withConnection(async conn => {
            const sql = `SELECT ${expression} AS v, $1::int AS marker`;
            // the first run uses text, every later run of the named statement binary where supported
            for (let i = 0; i < 3; i++) {
                const rows = await conn.queryRows(sql, [i], RowMode.object, true);
                expect(rows[0].v).toEqual(expected);
                expect(rows[0].marker).toBe(i);
            }
            // simple protocol, and an unnamed statement
            expect((await conn.queryRows(`SELECT ${expression} AS v`))[0].v).toEqual(expected);
            expect((await conn.queryRows(`SELECT ${expression} AS v, $1::int AS marker`, [9]))[0].v).toEqual(expected);
        });
    });

    test('timestamp and date use the local time zone, also at both formats', async () => {
        await withConnection(async conn => {
            const sql = `SELECT '2021-03-04 05:06:07.890'::timestamp AS ts, '2021-03-04'::date AS d, $1::int AS m`;
            for (let i = 0; i < 3; i++) {
                const [row] = await conn.queryRows(sql, [i], RowMode.object, true);
                expect(row.ts).toEqual(new Date(2021, 2, 4, 5, 6, 7, 890));
                expect(row.d).toEqual(new Date(2021, 2, 4));
            }
            // around changes of daylight saving time, when the time zone of the process has them
            for (const [text, expected] of [
                ['2021-03-14 02:30:00', new Date(2021, 2, 14, 2, 30, 0)],
                ['2021-03-28 02:30:00', new Date(2021, 2, 28, 2, 30, 0)],
                ['2021-10-31 02:30:00', new Date(2021, 9, 31, 2, 30, 0)],
                ['2021-11-07 01:30:00', new Date(2021, 10, 7, 1, 30, 0)],
            ] as const) {
                const statement = `SELECT '${text}'::timestamp AS ts, $1::int AS m`;
                for (let i = 0; i < 3; i++) expect((await conn.queryRows(statement, [i], RowMode.object, true))[0].ts).toEqual(expected);
                expect((await conn.queryRows(`SELECT '${text}'::timestamp AS ts`))[0].ts).toEqual(expected);
            }
            const [bc] = await conn.queryRows(`SELECT '0044-03-15 12:00:00 BC'::timestamp AS ts, '0044-03-15 BC'::date AS d`);
            const expected = new Date(0);
            expected.setFullYear(-43, 2, 15);
            expected.setHours(12, 0, 0, 0);
            expect(bc.ts).toEqual(expected);
            expect(bc.d).toEqual(new Date(expected.getTime() - 12 * 3600000));
        });
    });

    test('a timezone offset with seconds', async () => {
        await withConnection(async conn => {
            await conn.query(`SET timezone = 'Africa/Monrovia'`);
            const [row] = await conn.queryRows(`SELECT '1950-01-01 01:00:00+00'::timestamptz AS ts, '1950-01-01 01:00:00+00'::timestamptz::text AS t`);
            expect(row.t).toMatch(/-00:44:30$/);
            expect(row.ts).toEqual(new Date('1950-01-01T01:00:00.000Z'));
        });
    });

    test('an enum type, also with its array, stays text', async () => {
        await withConnection(async conn => {
            await schema(conn, 'pgc_enum', `CREATE TYPE pgc_enum.mood AS ENUM ('sad', 'happy');`);
            try {
                const [row] = await conn.queryRows(`SELECT 'happy'::pgc_enum.mood AS a, ARRAY['sad']::pgc_enum.mood[] AS b, $1::int AS m`, [1], RowMode.object, true);
                expect(row.a).toBe('happy');
                expect(row.b).toBe('{sad}');
            } finally {
                await conn.query('DROP SCHEMA pgc_enum CASCADE');
            }
        });
    });

    test('parameters', async () => {
        await withConnection(async conn => {
            const date = new Date('2021-03-04T05:06:07.890Z');
            const array = ['a,b', 'c"d', null, 1, true];
            const [row] = await conn.queryRows(
                `SELECT $1::int + 1 AS i, $2::float8 AS f, $3::bigint AS big, $4::text AS s, $5::bool AS b, $6::bytea AS by, $7::timestamptz AS d, $8::jsonb AS j, $9::text[] AS a, $10::text AS n, $11::int AS u, $12::uuid AS id, $13::text AS long`,
                [41, 1.25, 1234567890123456789n, 'ä€', true, Buffer.from([0, 255, 1]), date, { x: [1] }, array, null, undefined, 'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11', 'ä'.repeat(100)],
            );
            expect(row.i).toBe(42);
            expect(row.f).toBe(1.25);
            expect(row.big).toBe(1234567890123456789n);
            expect(row.s).toBe('ä€');
            expect(row.b).toBe(true);
            expect(row.by).toEqual(Buffer.from([0, 255, 1]));
            expect(row.d).toEqual(date);
            expect(row.j).toEqual({ x: [1] });
            expect(row.a).toEqual(['a,b', 'c"d', null, '1', 'true']);
            expect(row.n).toBe(null);
            expect(row.u).toBe(null);
            expect(row.id).toBe('a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11');
            expect(row.long).toBe('ä'.repeat(100));
        });
    });

    test('a Date parameter is written like the former driver, in local time with offset', async () => {
        await withConnection(async conn => {
            const date = new Date(2020, 0, 2, 3, 4, 5, 6);
            const [row] = await conn.queryRows(`SELECT $1::text AS t`, [date]);
            const expected = await conn.queryRows(`SELECT $1::timestamp::text AS w`, [date]);
            expect(row.t).toMatch(/^2020-01-02T03:04:05\.006[+-]\d\d:\d\d$/);
            expect(expected[0].w).toBe('2020-01-02 03:04:05.006');
        });
    });

    test('parseInputDatesAsUTC', async () => {
        await withConnection(
            async conn => {
                const [row] = await conn.queryRows(`SELECT $1::text AS t`, [new Date('2020-01-02T03:04:05.006Z')]);
                expect(row.t).toBe('2020-01-02T03:04:05.006+00:00');
            },
            { parseInputDatesAsUTC: true },
        );
    });

    test('array row mode and the last of a duplicate column', async () => {
        await withConnection(async conn => {
            expect(await conn.queryRows('SELECT 1::int AS a, 2::int AS a', undefined, RowMode.array)).toEqual([[1, 2]]);
            expect(await conn.queryRows('SELECT 1::int AS a, 2::int AS a')).toEqual([{ a: 2 }]);
            const [row] = await conn.queryRows(`SELECT 1::int AS "__proto__", 2::int AS "b c"`);
            expect(Object.keys(row)).toEqual(['__proto__', 'b c']);
            expect(Object.getPrototypeOf(row)).toBe(Object.prototype);
        });
    });
});

describe('results', () => {
    test('counts, several statements and an empty query', async () => {
        await withConnection(async conn => {
            await schema(conn, 'pgc_res', `CREATE TABLE pgc_res.t (id int);`);
            try {
                expect((await conn.query(`INSERT INTO pgc_res.t VALUES (1), (2)`)).rowCount).toBe(2);
                expect((await conn.query(`UPDATE pgc_res.t SET id = id`)).rowCount).toBe(2);
                expect((await conn.query(`SELECT * FROM pgc_res.t`)).rowCount).toBe(2);
                expect((await conn.query(`DELETE FROM pgc_res.t`)).rowCount).toBe(2);
                expect((await conn.query(`CREATE TEMP TABLE pgc_empty (id int)`)).rowCount).toBe(null);
                expect(await conn.query('')).toEqual({ rows: [], rowCount: null, fields: [] });
                expect((await conn.query('SELECT 1; SELECT 2')).rows).toBe(undefined);
                expect((await conn.query('SELECT 1 AS one')).rows).toEqual([{ one: 1 }]);
            } finally {
                await conn.query('DROP SCHEMA pgc_res CASCADE');
            }
        });
    });

    test('a row larger than the read buffer and many messages split over reads', async () => {
        await withConnection(async conn => {
            const big = 'x'.repeat(3 * 1024 * 1024);
            expect((await conn.queryRows('SELECT $1::text AS v', [big]))[0].v.length).toBe(big.length);
            const rows = await conn.queryRows(`SELECT generate_series(1, 200000) AS n, repeat('a', 50) AS t`);
            expect(rows.length).toBe(200000);
            expect(rows[199999].n).toBe(200000);
        });
    });
});

describe('failure semantics', () => {
    test('a Sync after each query isolates failures', async () => {
        await withConnection(async conn => {
            const results = await Promise.allSettled([conn.queryRows('SELECT $1::int AS a', [1]), conn.queryRows('SELECT $1::int FROM nope', [2]), conn.queryRows('SELECT $1::int AS a', [3])]);
            expect(results.map(v => v.status)).toEqual(['fulfilled', 'rejected', 'fulfilled']);
            expect((results[0] as any).value).toEqual([{ a: 1 }]);
            expect((results[2] as any).value).toEqual([{ a: 3 }]);
            expect((results[1] as any).reason).toBeInstanceOf(PostgresError);
            expect((results[1] as any).reason.code).toBe('42P01');
        });
    });

    test('one Sync: nothing after the failure runs, and all of it is rolled back', async () => {
        await withConnection(async conn => {
            await schema(conn, 'pgc_batch', `CREATE TABLE pgc_batch.t (id int);`);
            try {
                let error: any;
                try {
                    await conn.batch([{ sql: 'INSERT INTO pgc_batch.t VALUES ($1)', params: [1] }, { sql: 'SELECT 1 FROM nope' }, { sql: 'INSERT INTO pgc_batch.t VALUES ($1)', params: [3] }]);
                } catch (e) {
                    error = e;
                }
                expect(error).toBeInstanceOf(PostgresError);
                expect(error.batchIndex).toBe(1);
                expect(await conn.queryRows('SELECT count(*)::int AS c FROM pgc_batch.t')).toEqual([{ c: 0 }]);

                const results = await conn.batch([
                    { sql: 'SELECT $1::int AS a', params: [1] },
                    { sql: 'INSERT INTO pgc_batch.t VALUES ($1) RETURNING id', params: [9] },
                ]);
                expect(results[0].rows).toEqual([{ a: 1 }]);
                expect(results[1].rows).toEqual([{ id: 9 }]);
                expect(await conn.batch([])).toEqual([]);
            } finally {
                await conn.query('DROP SCHEMA pgc_batch CASCADE');
            }
        });
    });

    test('errors have the fields of the server', async () => {
        await withConnection(async conn => {
            await schema(conn, 'pgc_err', `CREATE TABLE pgc_err.parent (id int primary key); CREATE TABLE pgc_err.child (parent int references pgc_err.parent(id));`);
            try {
                await conn.query(`INSERT INTO pgc_err.parent VALUES (1)`);
                const unique: any = await conn.query(`INSERT INTO pgc_err.parent VALUES (1)`).catch(e => e);
                expect(unique).toBeInstanceOf(PostgresError);
                expect(unique.code).toBe('23505');
                expect(unique.table).toBe('parent');
                expect(unique.schema).toBe('pgc_err');
                expect(unique.constraint).toBe('parent_pkey');
                expect(unique.detail).toContain('already exists');
                expect(unique.message).toContain('duplicate key value');
                const foreign: any = await conn.query(`INSERT INTO pgc_err.child VALUES (2)`).catch(e => e);
                expect(foreign.code).toBe('23503');
                expect(foreign.table).toBe('child');
            } finally {
                await conn.query('DROP SCHEMA pgc_err CASCADE');
            }
        });
    });

    test('a parameter that can not be written fails only its own query', async () => {
        await withConnection(async conn => {
            const circular: any = {};
            circular.self = circular;
            await expect(conn.queryRows('SELECT $1::text AS v', [circular], RowMode.object, true)).rejects.toThrow();
            expect(await conn.queryRows('SELECT $1::text AS v', ['fine'], RowMode.object, true)).toEqual([{ v: 'fine' }]);
        });
    });
});

describe('prepared statements', () => {
    const count = async (conn: PostgresClientConnection) => (await conn.queryRows("SELECT count(*)::int AS c FROM pg_prepared_statements WHERE name LIKE 'deepkit_%'"))[0].c;

    test('a statement is prepared once and without parameters it is not', async () => {
        await withConnection(async conn => {
            for (let i = 0; i < 3; i++) await conn.queryRows('SELECT $1::int AS v', [i], RowMode.object, true);
            expect(await count(conn)).toBe(1);
            await conn.query('SELECT 1 AS one');
            expect(await count(conn)).toBe(1);
        });
    });

    test('the least recently used one is closed on the server', async () => {
        const pool = client();
        pool.maxPreparedStatements = 2;
        const conn = await pool.acquire();
        try {
            await conn.queryRows('SELECT $1::int AS a', [1], RowMode.object, true);
            await conn.queryRows('SELECT $1::int AS b', [1], RowMode.object, true);
            await conn.queryRows('SELECT $1::int AS c', [1], RowMode.object, true);
            expect(await count(conn)).toBe(2);
            expect(await conn.queryRows('SELECT $1::int AS a', [5], RowMode.object, true)).toEqual([{ a: 5 }]);
        } finally {
            pool.release(conn);
        }
    });

    test('maxPreparedStatements=0 keeps nothing', async () => {
        const pool = client();
        pool.maxPreparedStatements = 0;
        const conn = await pool.acquire();
        try {
            await conn.queryRows('SELECT $1::int AS v', [1], RowMode.object, true);
            await conn.queryRows('SELECT $1::int AS v', [2], RowMode.object, true);
            expect(await count(conn)).toBe(0);
        } finally {
            pool.release(conn);
        }
    });

    test('a statement removed behind our back is prepared again', async () => {
        await withConnection(async conn => {
            await conn.queryRows('SELECT $1::int AS v', [1], RowMode.object, true);
            await conn.queryRows('SELECT $1::int AS v', [2], RowMode.object, true);
            await conn.query('DEALLOCATE ALL');
            expect(await conn.queryRows('SELECT $1::int AS v', [3], RowMode.object, true)).toEqual([{ v: 3 }]);
            expect(await conn.queryRows('SELECT $1::int AS v', [4], RowMode.object, true)).toEqual([{ v: 4 }]);
        });
    });

    test('a changed column type runs the query again with the new type', async () => {
        await withConnection(async conn => {
            await schema(conn, 'pgc_stale', `CREATE TABLE pgc_stale.t (age int); INSERT INTO pgc_stale.t VALUES (7);`);
            try {
                const sql = 'SELECT age, $1::int AS m FROM pgc_stale.t';
                for (let i = 0; i < 2; i++) expect(await conn.queryRows(sql, [i], RowMode.object, true)).toEqual([{ age: 7, m: i }]);
                await conn.query('ALTER TABLE pgc_stale.t ALTER COLUMN age TYPE text');
                expect(await conn.queryRows(sql, [2], RowMode.object, true)).toEqual([{ age: '7', m: 2 }]);
                expect(await conn.queryRows(sql, [3], RowMode.object, true)).toEqual([{ age: '7', m: 3 }]);
            } finally {
                await conn.query('DROP SCHEMA pgc_stale CASCADE');
            }
        });
    });

    test('stale in a transaction fails it, the next query works', async () => {
        await withConnection(async conn => {
            await schema(conn, 'pgc_stale2', `CREATE TABLE pgc_stale2.t (age int); INSERT INTO pgc_stale2.t VALUES (7);`);
            try {
                const sql = 'SELECT age, $1::int AS m FROM pgc_stale2.t';
                await conn.queryRows(sql, [0], RowMode.object, true);
                await conn.query('ALTER TABLE pgc_stale2.t ALTER COLUMN age TYPE text');
                await conn.query('BEGIN');
                await expect(conn.queryRows(sql, [1], RowMode.object, true)).rejects.toThrow('cached plan');
                expect(conn.inTransaction()).toBe(true);
                await conn.query('ROLLBACK');
                expect(conn.inTransaction()).toBe(false);
                expect(await conn.queryRows(sql, [2], RowMode.object, true)).toEqual([{ age: '7', m: 2 }]);
            } finally {
                await conn.query('DROP SCHEMA pgc_stale2 CASCADE');
            }
        });
    });

    test('a parse error while pipelining', async () => {
        await withConnection(async conn => {
            const sql = 'SELEC $1::int';
            const results = await Promise.allSettled([conn.queryRows(sql, [1], RowMode.object, true), conn.queryRows(sql, [2], RowMode.object, true), conn.queryRows('SELECT $1::int AS ok', [3], RowMode.object, true)]);
            expect(results.map(v => v.status)).toEqual(['rejected', 'rejected', 'fulfilled']);
            expect((results[0] as any).reason.code).toBe('42601');
            // the second was sent without Parse and got 26000, then ran again on its own
            expect((results[1] as any).reason.code).toBe('42601');
        });
    });

    test('a failing bind keeps the statement usable', async () => {
        await withConnection(async conn => {
            const sql = 'SELECT $1::int AS v';
            await expect(conn.queryRows(sql, ['not a number'], RowMode.object, true)).rejects.toThrow('invalid input syntax');
            expect(await conn.queryRows(sql, [1], RowMode.object, true)).toEqual([{ v: 1 }]);
            expect(await count(conn)).toBe(1);
        });
    });
});

describe('transactions', () => {
    test('isolation level and rollback on one connection', async () => {
        await withConnection(async conn => {
            await schema(conn, 'pgc_tx', `CREATE TABLE pgc_tx.t (id int);`);
            try {
                await conn.query('SET TRANSACTION ISOLATION LEVEL SERIALIZABLE; START TRANSACTION');
                await conn.query('SET TRANSACTION ISOLATION LEVEL SERIALIZABLE');
                expect((await conn.queryRows('SHOW transaction_isolation'))[0].transaction_isolation).toBe('serializable');
                expect(conn.inTransaction()).toBe(true);
                await conn.query('INSERT INTO pgc_tx.t VALUES (1)');
                await conn.query('ROLLBACK');
                expect(conn.inTransaction()).toBe(false);
                expect(await conn.queryRows('SELECT count(*)::int AS c FROM pgc_tx.t')).toEqual([{ c: 0 }]);
            } finally {
                await conn.query('DROP SCHEMA pgc_tx CASCADE');
            }
        });
    });
});

describe('lost connections', () => {
    test('everything in flight fails, and the pool recovers', async () => {
        const pool = client({ max: 2 });
        const killer = await pool.acquire();
        const conn = await pool.acquire();
        const [{ pid }] = await conn.queryRows('SELECT pg_backend_pid() AS pid');
        const running = [conn.queryRows('SELECT pg_sleep(30), 1 AS a'), conn.queryRows('SELECT 2 AS b'), conn.queryRows('SELECT 3 AS c', [1] as any)];
        // handled before the kill: the closed connection can reject them before the killer's reply arrives
        const settled = Promise.allSettled(running);
        await new Promise(resolve => setTimeout(resolve, 50));
        await killer.query('SELECT pg_terminate_backend($1)', [pid]);
        const results = await settled;
        expect(results.map(v => v.status)).toEqual(['rejected', 'rejected', 'rejected']);
        expect((results[0] as any).reason.code).toBe('57P01');
        expect(conn.isConnected()).toBe(false);
        await expect(conn.queryRows('SELECT 1')).rejects.toBeInstanceOf(PostgresError);

        pool.release(conn);
        pool.release(killer);
        const fresh = await pool.acquire();
        expect(await fresh.queryRows('SELECT 1 AS a')).toEqual([{ a: 1 }]);
        pool.release(fresh);
    });

    test('a refused connection rejects', async () => {
        const pool = client({ port: 1, connectionTimeoutMillis: 1000 });
        await expect(pool.acquire()).rejects.toBeInstanceOf(PostgresConnectionError);
    });
});

describe('cancellation, timeouts and server messages', () => {
    test('cancel stops a running query', async () => {
        await withConnection(async conn => {
            const running = conn.queryRows('SELECT pg_sleep(30)').catch(e => e);
            await new Promise(resolve => setTimeout(resolve, 100));
            await conn.cancel();
            const error: any = await running;
            expect(error.code).toBe('57014');
            expect(await conn.queryRows('SELECT 1 AS a')).toEqual([{ a: 1 }]);
        });
    });

    test('query_timeout rejects and the connection keeps working', async () => {
        await withConnection(
            async conn => {
                const started = Date.now();
                await expect(conn.queryRows('SELECT pg_sleep(30)')).rejects.toThrow('Query read timeout');
                expect(Date.now() - started).toBeLessThan(5000);
                const before = Date.now();
                expect(await conn.queryRows('SELECT 1 AS a')).toEqual([{ a: 1 }]);
                expect(Date.now() - before).toBeLessThan(5000);
            },
            { query_timeout: 200 },
        );
    });

    test('notices, settings and notifications', async () => {
        await withConnection(async conn => {
            const notices: any[] = [];
            conn.onNotice = v => notices.push(v);
            await conn.query(`DO $$ BEGIN RAISE NOTICE 'hello'; END $$;`);
            expect(notices.map(v => v.message)).toEqual(['hello']);

            await conn.query(`SET application_name = 'pgc-test'`);
            expect(conn.parameters.get('application_name')).toBe('pgc-test');

            const received: any[] = [];
            conn.onNotification = (channel, payload) => received.push([channel, payload]);
            await conn.query('LISTEN pgc_channel');
            await conn.query(`NOTIFY pgc_channel, 'data'`);
            expect(received).toEqual([['pgc_channel', 'data']]);
        });
    });

    test('options reach the server', async () => {
        await withConnection(
            async conn => {
                expect((await conn.queryRows('SHOW application_name'))[0].application_name).toBe('pgc-app');
                expect((await conn.queryRows('SHOW statement_timeout'))[0].statement_timeout).toBe('12345ms');
            },
            { application_name: 'pgc-app', statement_timeout: 12345, connectionString: undefined },
        );
    });
});

describe('pool', () => {
    test('idle connections are used first and new ones opened up to max', async () => {
        const pool = client({ max: 2 });
        const a = await pool.acquire(false);
        pool.release(a);
        const b = await pool.acquire(false);
        expect(b).toBe(a);
        const c = await pool.acquire(false);
        expect(c).not.toBe(a);
        expect(pool.size).toBe(2);
        pool.release(b);
        pool.release(c);
    });

    test('at max, shared users pipeline and exclusive users wait', async () => {
        const pool = client({ max: 1, maxPipelineDepth: 4 });
        const first = await pool.acquire(false);
        const shared = await pool.acquire(false);
        expect(shared).toBe(first);
        expect(first.load).toBe(2);

        let exclusiveAcquired = false;
        const exclusive = pool.acquire(true).then(c => {
            exclusiveAcquired = true;
            return c;
        });
        await new Promise(resolve => setTimeout(resolve, 20));
        expect(exclusiveAcquired).toBe(false);
        pool.release(first);
        await new Promise(resolve => setTimeout(resolve, 20));
        expect(exclusiveAcquired).toBe(false);
        pool.release(shared);
        const conn = await exclusive;
        expect(conn).toBe(first);
        expect(conn.exclusive).toBe(true);

        // others can't share an exclusive connection
        const other = pool.acquire(false);
        let acquired = false;
        other.then(() => (acquired = true));
        await new Promise(resolve => setTimeout(resolve, 20));
        expect(acquired).toBe(false);
        pool.release(conn);
        pool.release(await other);
    });

    test('many pipelined callers share few connections in order', async () => {
        const pool = client({ max: 2, maxPipelineDepth: 64 });
        const results = await Promise.all(
            Array.from({ length: 200 }, async (_, i) => {
                const conn = await pool.acquire(false);
                try {
                    return (await conn.queryRows('SELECT $1::int AS v', [i], RowMode.object, true))[0].v;
                } finally {
                    pool.release(conn);
                }
            }),
        );
        expect(results).toEqual(Array.from({ length: 200 }, (_, i) => i));
        expect(pool.size).toBe(2);
    });

    test('waiters that accept sharing are served as soon as a connection exists', async () => {
        const pool = client({ max: 1, maxPipelineDepth: 16 });
        const connections = await Promise.all(Array.from({ length: 10 }, () => pool.acquire(false)));
        expect(new Set(connections).size).toBe(1);
        expect(connections[0].load).toBe(10);
        for (const conn of connections) pool.release(conn);
    });

    test('waiting for a connection times out', async () => {
        const pool = client({ max: 1, connectionTimeoutMillis: 100 });
        const conn = await pool.acquire();
        await expect(pool.acquire()).rejects.toThrow('Timeout waiting');
        pool.release(conn);
    });

    test('idle connections are closed', async () => {
        const pool = client({ max: 2, idleTimeoutMillis: 150 });
        const conn = await pool.acquire();
        pool.release(conn);
        await new Promise(resolve => setTimeout(resolve, 500));
        expect(conn.isConnected()).toBe(false);
        expect(pool.size).toBe(0);
        const again = await pool.acquire();
        expect(again).not.toBe(conn);
        pool.release(again);
    });

    test('closing the pool rejects waiters', async () => {
        const pool = client({ max: 1 });
        const conn = await pool.acquire();
        const waiting = pool.acquire();
        pool.close();
        await expect(waiting).rejects.toBeInstanceOf(PostgresConnectionError);
        pool.release(conn);
    });
});

describe('COPY', () => {
    test('copyFrom, a failing source, and COPY without copyFrom', async () => {
        await withConnection(async conn => {
            await schema(conn, 'pgc_copy', `CREATE TABLE pgc_copy.t (id int, s text);`);
            try {
                expect(await conn.copyFrom('COPY pgc_copy.t FROM STDIN', ['1\ta\n', Buffer.from('2\tb\n')])).toBe(2);
                expect(await conn.queryRows('SELECT count(*)::int AS c FROM pgc_copy.t')).toEqual([{ c: 2 }]);

                async function* failing() {
                    yield '3\tc\n';
                    throw new Error('source failed');
                }
                await expect(conn.copyFrom('COPY pgc_copy.t FROM STDIN', failing())).rejects.toThrow('source failed');

                await expect(conn.query('COPY pgc_copy.t FROM STDIN')).rejects.toThrow('only supported via copyFrom');
                expect(await conn.queryRows('SELECT count(*)::int AS c FROM pgc_copy.t')).toEqual([{ c: 2 }]);

                const out = await conn.query(`COPY pgc_copy.t TO STDOUT`);
                expect(out.rows).toEqual([]);
                expect(out.rowCount).toBe(2);
            } finally {
                await conn.query('DROP SCHEMA pgc_copy CASCADE');
            }
        });
    });
});

describe('authentication', () => {
    const user = 'alice';
    const password = 'pencil-ä';

    async function authenticate(method: any, give: any = password) {
        const { port, server, accepted } = await createAuthServer(method, user, password);
        const pool = client({ host: '127.0.0.1', port, user, database: 'db', password: give });
        try {
            const conn = await pool.acquire();
            pool.release(conn);
            return accepted();
        } finally {
            pool.close();
            server.close();
        }
    }

    test('trust', async () => {
        expect(await authenticate('trust')).toEqual([]);
    });

    test('cleartext, also with a password function', async () => {
        expect(await authenticate('cleartext')).toEqual([password]);
        expect(await authenticate('cleartext', async () => password)).toEqual([password]);
        await expect(authenticate('cleartext', 'wrong')).rejects.toThrow('password authentication failed');
        await expect(authenticate('cleartext', null)).rejects.toThrow('none was configured');
    });

    test('md5', async () => {
        expect(await authenticate('md5')).toHaveLength(1);
        await expect(authenticate('md5', 'wrong')).rejects.toThrow('password authentication failed');
    });

    test('SCRAM-SHA-256', async () => {
        expect(await authenticate('scram')).toEqual(['valid']);
        await expect(authenticate('scram', 'wrong')).rejects.toThrow('password authentication failed');
        await expect(authenticate('scram-bad-signature')).rejects.toThrow('invalid server signature');
    });

    test('an unsupported method is reported', async () => {
        await expect(authenticate('unsupported')).rejects.toThrow('not supported: 7');
    });

    test('SCRAM-SHA-256 against the test vector of RFC 7677', async () => {
        const scram = new ScramClient('rOprNGfwEbeRWgbNEkqO');
        (scram as any).clientFirstBareOverride = true;
        // the vector uses n=user in the bare message, which the server ignores in the postgres flavor
        const bare = 'n=user,r=rOprNGfwEbeRWgbNEkqO';
        Object.defineProperty(scram, 'clientFirstBare', { value: bare });
        const final = await scram.clientFinal('r=rOprNGfwEbeRWgbNEkqO%hvYDpWUa2RaTCAfuxFIlj)hNlF$k0,s=W22ZaJ0SNY7soEsUEjb6gQ==,i=4096', 'pencil');
        expect(final).toBe('c=biws,r=rOprNGfwEbeRWgbNEkqO%hvYDpWUa2RaTCAfuxFIlj)hNlF$k0,p=dHzbZapWIk4jUhN+Ute9ytag9zjfMHgsqmmiz7AndVQ=');
        scram.verifyServerFinal('v=6rriTRBi23WpRR/wtup+mMhUZUn/dB5nLTJRsjl95G4=');
    });

    test('a connection upgraded to TLS', async () => {
        const { port, server } = await createAuthServer('scram', user, password, true);
        const pool = client({ host: '127.0.0.1', port, user, database: 'db', password, ssl: { rejectUnauthorized: false } });
        try {
            const conn = await pool.acquire();
            expect(conn.isConnected()).toBe(true);
            await conn.query('SELECT anything');
            pool.release(conn);
        } finally {
            pool.close();
            server.close();
        }
    });

    test('a certificate that is not trusted is rejected', async () => {
        const { port, server } = await createAuthServer('trust', user, password, true);
        const pool = client({ host: '127.0.0.1', port, user, database: 'db', ssl: { rejectUnauthorized: true } });
        await expect(pool.acquire()).rejects.toBeInstanceOf(PostgresConnectionError);
        pool.close();
        server.close();
    });

    test('SSL refused by the server, cancellation of a connection without key is a no-op', async () => {
        const { port, server } = await createAuthServer('trust', user, password);
        // the trust server answers the 8 bytes SSLRequest as if it was the startup message, with an AuthenticationOk starting with R
        const pool = client({ host: '127.0.0.1', port, user, database: 'db', ssl: { rejectUnauthorized: false } });
        await expect(pool.acquire()).rejects.toThrow('does not support SSL');
        pool.close();
        server.close();
    });
});

describe('options', () => {
    test('a connection string', () => {
        expect(parsePostgresConnectionString('postgres://u%40:p%3Aw@db.example:1234/name?application_name=app&sslmode=no-verify')).toEqual({
            host: 'db.example',
            port: 1234,
            user: 'u@',
            password: 'p:w',
            database: 'name',
            application_name: 'app',
            ssl: { rejectUnauthorized: false },
        });
        const options = resolvePostgresOptions({ connectionString: 'postgres://u:p@h:1/d?application_name=x', max: 5, statement_timeout: 7 });
        expect(options.host).toBe('h');
        expect(options.port).toBe(1);
        expect(options.user).toBe('u');
        expect(options.database).toBe('d');
        expect(options.max).toBe(5);
        expect(options.startupParameters).toMatchObject({ user: 'u', database: 'd', application_name: 'x', statement_timeout: '7', client_encoding: 'UTF8' });
    });

    test('a unix socket directory', () => {
        expect(resolvePostgresOptions({ host: '/var/run/postgresql/', port: 5433 }).socketPath).toBe('/var/run/postgresql/.s.PGSQL.5433');
        expect(resolvePostgresOptions({ host: 'localhost' }).socketPath).toBe(undefined);
    });

    test('ssl sets the server name for a host, not an IP', () => {
        expect(resolvePostgresOptions({ host: 'db', ssl: true }).ssl).toEqual({ servername: 'db' });
        expect(resolvePostgresOptions({ host: '127.0.0.1', ssl: true }).ssl).toEqual({});
        expect(resolvePostgresOptions({ host: 'db', ssl: false }).ssl).toBe(undefined);
    });
});

describe('compiled bind', () => {
    const sqlFor = (type: string) => `SELECT $1::${type} AS v, $1::${type}::text AS t`;

    /** The first run sends text with unknown types, the runs after it use the compiled Bind. */
    async function runs(conn: PostgresClientConnection, type: string, value: any) {
        const out: any[] = [];
        for (let i = 0; i < 3; i++) {
            try {
                const row = await conn.queryRow(sqlFor(type), [value], RowMode.object, true);
                out.push({ v: row.v, t: row.t });
            } catch (error: any) {
                out.push({ code: error.code });
            }
        }
        return out;
    }

    const date = new Date('2021-07-08T09:10:11.123Z');
    const cases: [string, any[]][] = [
        ['int4', [1, -1, 2147483647, -2147483648, 2147483648, 1.5, '7', 'nope', null, undefined, true, 12n]],
        ['int2', [1, -32768, 32767, 32768]],
        ['int8', [1, -1, 9007199254740991, -9007199254740991, 9007199254740992, 9223372036854775807n, -9223372036854775808n, 9223372036854775808n, 1.5, '123']],
        ['oid', [4294967295, -1, 0]],
        ['float8', [1.5, 0, -0, NaN, Infinity, -Infinity, 1, '2.5', 1e300]],
        ['float4', [1.5, 1.1, 0, NaN, Infinity, 1e40, 1e-50, '2.5']],
        ['bool', [true, false, 'true', 'f', 1, 0, 'nope']],
        [
            'timestamp',
            [
                date,
                new Date(2021, 2, 14, 2, 30),
                new Date(2021, 9, 31, 2, 30),
                new Date('1950-06-01T12:00:00.500Z'),
                new Date('1000-01-01T00:00:00.000Z'),
                new Date('0044-03-15T00:00:00.000Z'),
                new Date(NaN),
                '2021-01-02 03:04:05',
                new Date(253402300799000),
            ],
        ],
        ['timestamptz', [date, new Date('1950-06-01T12:00:00.500Z'), new Date('3000-01-01T00:00:00Z'), new Date(NaN), '2021-01-02 03:04:05+00', new Date(253402300799000)]],
        ['date', [date, new Date(2021, 2, 14), new Date('1950-06-01T00:00:00Z'), new Date(NaN), '2021-01-02']],
        ['bytea', [Buffer.from([0, 1, 255]), new Uint8Array([9, 8]), Buffer.alloc(0), '\\xdeadbeef', new Uint8Array([1, 2]).buffer]],
        ['text', ['abc', 'ä€😀', '', 'x'.repeat(5000), 5, 1.5, true, 12n, Buffer.from('raw')]],
        ['varchar(20)', ['abc', 5]],
        ['uuid', ['a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11', 'nope']],
        ['jsonb', ['{"a":1}', { a: [1, 'b'] }, [1, 2], 'nope']],
        ['json', ['{"a":1}', { a: 1 }, 'nope']],
        ['numeric', [1.5, '12345678901234567890.123', 10n]],
        ['int4[]', [[1, 2, null], '{3,4}']],
        ['text[]', [['a,b', 'c"d', null], ['ä']]],
    ];

    test.each(cases)('%s behaves the same in text and compiled', async (type, values) => {
        await withConnection(async conn => {
            for (const value of values) {
                const out = await runs(conn, type, value);
                // the first run with unknown types and the two compiled ones
                expect({ value, run: out[1] }).toEqual({ value, run: out[0] });
                expect({ value, run: out[2] }).toEqual({ value, run: out[0] });
            }
        });
    });

    test('values are written by the compiled Bind after the first run, parameters only once', async () => {
        await withConnection(async conn => {
            const encode = jest.spyOn(CompiledBind.prototype, 'encode');
            const bind = jest.spyOn(PostgresEncoder.prototype, 'writeBind');
            try {
                const sql = 'SELECT $1::int AS a, $2::text AS b';
                await conn.queryRow(sql, [1, 'x'], RowMode.object, true);
                expect(bind).toHaveBeenCalledTimes(1);
                expect(encode).toHaveBeenCalledTimes(0);
                expect(await conn.queryRow(sql, [2, 'y'], RowMode.object, true)).toEqual({ a: 2, b: 'y' });
                expect(await conn.queryRow(sql, [3, 'z'], RowMode.object, true)).toEqual({ a: 3, b: 'z' });
                expect(bind).toHaveBeenCalledTimes(1);
                expect(encode).toHaveBeenCalledTimes(2);
            } finally {
                encode.mockRestore();
                bind.mockRestore();
            }
        });
    });

    test('a wrong number of parameters is still reported by the server', async () => {
        await withConnection(async conn => {
            const sql = 'SELECT $1::int AS a, $2::int AS b';
            expect(await conn.queryRow(sql, [1, 2], RowMode.object, true)).toEqual({ a: 1, b: 2 });
            expect(await conn.queryRow(sql, [3, 4], RowMode.object, true)).toEqual({ a: 3, b: 4 });
            await expect(conn.queryRow(sql, [1], RowMode.object, true)).rejects.toThrow('bind message supplies 1 parameters');
            await expect(conn.queryRow(sql, [1, 2, 3], RowMode.object, true)).rejects.toThrow('bind message supplies 3 parameters');
            expect(await conn.queryRow(sql, [5, 6], RowMode.object, true)).toEqual({ a: 5, b: 6 });
        });
    });

    test('many parameters and long strings between fixed ones grow the buffer', async () => {
        await withConnection(async conn => {
            const count = 600;
            const parameters = Array.from({ length: count }, (_, i) => `$${i + 1}::${i % 2 ? 'text' : 'int8'}`).join(', ');
            const sql = `SELECT ${parameters}`;
            const values = Array.from({ length: count }, (_, i) => (i % 2 ? 'x'.repeat(1000 + i) : i * 1000000));
            const compare = async () => {
                const rows = await conn.queryRows(sql, values, RowMode.array, true);
                expect(rows[0]).toEqual(values);
            };
            await compare();
            await compare();
            await compare();
        });
    });

    test('statements with an enum type and a parameter of an unknown type', async () => {
        await withConnection(async conn => {
            await schema(conn, 'pgc_enum2', `CREATE TYPE pgc_enum2.mood AS ENUM ('sad', 'happy');`);
            try {
                const sql = `SELECT $1::pgc_enum2.mood::text AS m, $2::int AS i`;
                for (let i = 0; i < 3; i++) expect(await conn.queryRow(sql, ['sad', i], RowMode.object, true)).toEqual({ m: 'sad', i });
                await expect(conn.queryRow(sql, ['nope', 1], RowMode.object, true)).rejects.toMatchObject({ code: '22P02' });
            } finally {
                await conn.query('DROP SCHEMA pgc_enum2 CASCADE');
            }
        });
    });

    test('a statement without a result still compiles', async () => {
        await withConnection(async conn => {
            await schema(conn, 'pgc_bind', `CREATE TABLE pgc_bind.t (id int, name text);`);
            try {
                const sql = 'INSERT INTO pgc_bind.t VALUES ($1, $2)';
                for (let i = 0; i < 3; i++) expect((await conn.query(sql, [i, 'n'], RowMode.object, true)).rowCount).toBe(1);
                expect(await conn.queryRows('SELECT id FROM pgc_bind.t ORDER BY id')).toEqual([{ id: 0 }, { id: 1 }, { id: 2 }]);
            } finally {
                await conn.query('DROP SCHEMA pgc_bind CASCADE');
            }
        });
    });

    test('a parameter that can not be written after compiling leaves the connection usable', async () => {
        await withConnection(async conn => {
            const circular: any = {};
            circular.self = circular;
            const sql = 'SELECT $1::jsonb AS j, $2::int AS i';
            expect(await conn.queryRow(sql, [{ a: 1 }, 1], RowMode.object, true)).toEqual({ j: { a: 1 }, i: 1 });
            expect(await conn.queryRow(sql, [{ a: 2 }, 2], RowMode.object, true)).toEqual({ j: { a: 2 }, i: 2 });
            await expect(conn.queryRow(sql, [circular, 3], RowMode.object, true)).rejects.toThrow();
            expect(await conn.queryRow(sql, [{ a: 4 }, 4], RowMode.object, true)).toEqual({ j: { a: 4 }, i: 4 });
        });
    });
});

describe('compiled bind', () => {
    const sqlFor = (type: string) => `SELECT $1::${type} AS v, $1::${type}::text AS t`;

    /** The first run sends text with unknown types, the runs after it use the compiled Bind. */
    async function runs(conn: PostgresClientConnection, type: string, value: any) {
        const out: any[] = [];
        for (let i = 0; i < 3; i++) {
            try {
                const row = await conn.queryRow(sqlFor(type), [value], RowMode.object, true);
                out.push({ v: row.v, t: row.t });
            } catch (error: any) {
                out.push({ code: error.code });
            }
        }
        return out;
    }

    const date = new Date('2021-07-08T09:10:11.123Z');
    const cases: [string, any[]][] = [
        ['int4', [1, -1, 2147483647, -2147483648, 2147483648, 1.5, '7', 'nope', null, undefined, true, 12n]],
        ['int2', [1, -32768, 32767, 32768]],
        ['int8', [1, -1, 9007199254740991, -9007199254740991, 9007199254740992, 9223372036854775807n, -9223372036854775808n, 9223372036854775808n, 1.5, '123']],
        ['oid', [4294967295, -1, 0]],
        ['float8', [1.5, 0, -0, NaN, Infinity, -Infinity, 1, '2.5', 1e300]],
        ['float4', [1.5, 1.1, 0, NaN, Infinity, 1e40, 1e-50, '2.5']],
        ['bool', [true, false, 'true', 'f', 1, 0, 'nope']],
        [
            'timestamp',
            [
                date,
                new Date(2021, 2, 14, 2, 30),
                new Date(2021, 9, 31, 2, 30),
                new Date('1950-06-01T12:00:00.500Z'),
                new Date('1000-01-01T00:00:00.000Z'),
                new Date('0044-03-15T00:00:00.000Z'),
                new Date(NaN),
                '2021-01-02 03:04:05',
                new Date(253402300799000),
            ],
        ],
        ['timestamptz', [date, new Date('1950-06-01T12:00:00.500Z'), new Date('3000-01-01T00:00:00Z'), new Date(NaN), '2021-01-02 03:04:05+00', new Date(253402300799000)]],
        ['date', [date, new Date(2021, 2, 14), new Date('1950-06-01T00:00:00Z'), new Date(NaN), '2021-01-02']],
        ['bytea', [Buffer.from([0, 1, 255]), new Uint8Array([9, 8]), Buffer.alloc(0), '\\xdeadbeef', new Uint8Array([1, 2]).buffer]],
        ['text', ['abc', 'ä€😀', '', 'x'.repeat(5000), 5, 1.5, true, 12n, Buffer.from('raw')]],
        ['varchar(20)', ['abc', 5]],
        ['uuid', ['a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11', 'nope']],
        ['jsonb', ['{"a":1}', { a: [1, 'b'] }, [1, 2], 'nope']],
        ['json', ['{"a":1}', { a: 1 }, 'nope']],
        ['numeric', [1.5, '12345678901234567890.123', 10n]],
        ['int4[]', [[1, 2, null], '{3,4}']],
        ['text[]', [['a,b', 'c"d', null], ['ä']]],
    ];

    test.each(cases)('%s behaves the same in text and compiled', async (type, values) => {
        await withConnection(async conn => {
            for (const value of values) {
                const out = await runs(conn, type, value);
                // the first run with unknown types and the two compiled ones
                expect({ value, run: out[1] }).toEqual({ value, run: out[0] });
                expect({ value, run: out[2] }).toEqual({ value, run: out[0] });
            }
        });
    });

    test('values are written by the compiled Bind after the first run, parameters only once', async () => {
        await withConnection(async conn => {
            const encode = jest.spyOn(CompiledBind.prototype, 'encode');
            const bind = jest.spyOn(PostgresEncoder.prototype, 'writeBind');
            try {
                const sql = 'SELECT $1::int AS a, $2::text AS b';
                await conn.queryRow(sql, [1, 'x'], RowMode.object, true);
                expect(bind).toHaveBeenCalledTimes(1);
                expect(encode).toHaveBeenCalledTimes(0);
                expect(await conn.queryRow(sql, [2, 'y'], RowMode.object, true)).toEqual({ a: 2, b: 'y' });
                expect(await conn.queryRow(sql, [3, 'z'], RowMode.object, true)).toEqual({ a: 3, b: 'z' });
                expect(bind).toHaveBeenCalledTimes(1);
                expect(encode).toHaveBeenCalledTimes(2);
            } finally {
                encode.mockRestore();
                bind.mockRestore();
            }
        });
    });

    test('a wrong number of parameters is still reported by the server', async () => {
        await withConnection(async conn => {
            const sql = 'SELECT $1::int AS a, $2::int AS b';
            expect(await conn.queryRow(sql, [1, 2], RowMode.object, true)).toEqual({ a: 1, b: 2 });
            expect(await conn.queryRow(sql, [3, 4], RowMode.object, true)).toEqual({ a: 3, b: 4 });
            await expect(conn.queryRow(sql, [1], RowMode.object, true)).rejects.toThrow('bind message supplies 1 parameters');
            await expect(conn.queryRow(sql, [1, 2, 3], RowMode.object, true)).rejects.toThrow('bind message supplies 3 parameters');
            expect(await conn.queryRow(sql, [5, 6], RowMode.object, true)).toEqual({ a: 5, b: 6 });
        });
    });

    test('many parameters and long strings between fixed ones grow the buffer', async () => {
        await withConnection(async conn => {
            const count = 600;
            const parameters = Array.from({ length: count }, (_, i) => `$${i + 1}::${i % 2 ? 'text' : 'int8'}`).join(', ');
            const sql = `SELECT ${parameters}`;
            const values = Array.from({ length: count }, (_, i) => (i % 2 ? 'x'.repeat(1000 + i) : i * 1000000));
            const compare = async () => {
                const rows = await conn.queryRows(sql, values, RowMode.array, true);
                expect(rows[0]).toEqual(values);
            };
            await compare();
            await compare();
            await compare();
        });
    });

    test('statements with an enum type and a parameter of an unknown type', async () => {
        await withConnection(async conn => {
            await schema(conn, 'pgc_enum2', `CREATE TYPE pgc_enum2.mood AS ENUM ('sad', 'happy');`);
            try {
                const sql = `SELECT $1::pgc_enum2.mood::text AS m, $2::int AS i`;
                for (let i = 0; i < 3; i++) expect(await conn.queryRow(sql, ['sad', i], RowMode.object, true)).toEqual({ m: 'sad', i });
                await expect(conn.queryRow(sql, ['nope', 1], RowMode.object, true)).rejects.toMatchObject({ code: '22P02' });
            } finally {
                await conn.query('DROP SCHEMA pgc_enum2 CASCADE');
            }
        });
    });

    test('a statement without a result still compiles', async () => {
        await withConnection(async conn => {
            await schema(conn, 'pgc_bind', `CREATE TABLE pgc_bind.t (id int, name text);`);
            try {
                const sql = 'INSERT INTO pgc_bind.t VALUES ($1, $2)';
                for (let i = 0; i < 3; i++) expect((await conn.query(sql, [i, 'n'], RowMode.object, true)).rowCount).toBe(1);
                expect(await conn.queryRows('SELECT id FROM pgc_bind.t ORDER BY id')).toEqual([{ id: 0 }, { id: 1 }, { id: 2 }]);
            } finally {
                await conn.query('DROP SCHEMA pgc_bind CASCADE');
            }
        });
    });

    test('a parameter that can not be written after compiling leaves the connection usable', async () => {
        await withConnection(async conn => {
            const circular: any = {};
            circular.self = circular;
            const sql = 'SELECT $1::jsonb AS j, $2::int AS i';
            expect(await conn.queryRow(sql, [{ a: 1 }, 1], RowMode.object, true)).toEqual({ j: { a: 1 }, i: 1 });
            expect(await conn.queryRow(sql, [{ a: 2 }, 2], RowMode.object, true)).toEqual({ j: { a: 2 }, i: 2 });
            await expect(conn.queryRow(sql, [circular, 3], RowMode.object, true)).rejects.toThrow();
            expect(await conn.queryRow(sql, [{ a: 4 }, 4], RowMode.object, true)).toEqual({ j: { a: 4 }, i: 4 });
        });
    });
});

describe('pool safety', () => {
    test('a connection left inside a transaction is not handed out again', async () => {
        const pool = client({ max: 1 });
        const conn = await pool.acquire();
        await conn.query('BEGIN');
        pool.release(conn);
        expect(conn.isConnected()).toBe(false);

        const next = await pool.acquire();
        expect(next).not.toBe(conn);
        expect(next.inTransaction()).toBe(false);
        pool.release(next);
    });
});

test('messages are passed to the socket writer as a range, without a view', async () => {
    await withConnection(async conn => {
        const write = jest.spyOn(SocketWriter.prototype, 'write');
        const range = jest.spyOn(SocketWriter.prototype, 'writeRange');
        try {
            await conn.query('SELECT 1');
            expect(range).toHaveBeenCalled();
            expect(write).not.toHaveBeenCalled();
        } finally {
            write.mockRestore();
            range.mockRestore();
        }
    });
});

describe('binary array parameters', () => {
    const cases: [string, any[], any[] | undefined][] = [
        ['int4[]', [1, -2, null, 2147483647], undefined],
        ['int2[]', [1, -2, null], undefined],
        // numbers like a single int8, they were strings
        ['int8[]', [1, -2, null, 9007199254740993n], [1, -2, null, 9007199254740993n]],
        ['float8[]', [1.5, -2, null, 0.1], undefined],
        ['float4[]', [1.5, -2, null], undefined],
        ['bool[]', [true, false, null], undefined],
        ['text[]', ['a', 'ü"\\,{}', 'NULL', '', null, '🎉'], undefined],
        ['varchar[]', ['a', null, 'ü'], undefined],
        ['bytea[]', [Buffer.from([0, 1, 255]), null], undefined],
        ['timestamptz[]', [new Date(1700000000000), null], undefined],
        [
            'uuid[]',
            ['251d1c655b174f9288cb2b4f82f42e4d', '251d1c65-5b17-4f92-88cb-2b4f82f42e4d', null],
            ['251d1c65-5b17-4f92-88cb-2b4f82f42e4d', '251d1c65-5b17-4f92-88cb-2b4f82f42e4d', null],
        ],
    ];

    async function roundtrip(conn: PostgresClientConnection, type: string, value: any[]) {
        const sql = `SELECT $1::${type} AS v`;
        // the first run doesn't know the types yet
        await conn.queryRow(sql, [value], RowMode.object, true);
        return (await conn.queryRow(sql, [value], RowMode.object, true)).v;
    }

    test.each(cases)('%s is sent in binary and comes back the same', async (type, value, expected) => {
        await withConnection(async conn => {
            await conn.queryRow(`SELECT $1::${type} AS v`, [value], RowMode.object, true);
            const fallback = jest.spyOn(PostgresEncoder.prototype, 'writeFallbackParameter');
            try {
                const result = (await conn.queryRow(`SELECT $1::${type} AS v`, [value], RowMode.object, true)).v;
                expect(fallback).not.toHaveBeenCalled();
                expect(result).toEqual(expected ?? value);
            } finally {
                fallback.mockRestore();
            }
        });
    });

    test('an empty array', async () => {
        await withConnection(async conn => {
            expect(await roundtrip(conn, 'int4[]', [])).toEqual([]);
        });
    });

    test('a value that does not fit the element type falls back to text', async () => {
        await withConnection(async conn => {
            expect(await roundtrip(conn, 'int4[]', ['1', 2])).toEqual([1, 2]);
            expect(await roundtrip(conn, 'text[]', ['a', 2])).toEqual(['a', '2']);
        });
    });

    test('a large array grows the buffer', async () => {
        await withConnection(async conn => {
            const value = Array.from({ length: 50_000 }, (_, i) => 'value ' + i);
            expect(await roundtrip(conn, 'text[]', value)).toEqual(value);
        });
    });

    test('unnest inserts with binary arrays', async () => {
        await withConnection(async conn => {
            await schema(conn, 'binary_arrays', 'CREATE TABLE binary_arrays.t (id SERIAL PRIMARY KEY, name TEXT, ready BOOL, n INT)');
            const sql = 'INSERT INTO binary_arrays.t (name, ready, n) SELECT * FROM unnest($1::text[], $2::bool[], $3::int[]) RETURNING id';
            const rows = [['a', 'b'], [true, false], [1, 2]];
            await conn.query(sql, rows, RowMode.object, true);
            const result = await conn.query(sql, rows, RowMode.object, true);
            expect(result.rows.map(v => v.id)).toEqual([3, 4]);
        });
    });
});
