import { describe, expect, test } from '@jest/globals';
import { readFileSync } from 'fs';

import { PostgresClient, PostgresConnectionError, PostgresError, RowMode } from '../../src/client/index.js';

/**
 * Checks authentication and TLS against a real server, and is skipped unless one was set up for it, since the regular
 * test database only allows trust. Needs PG_AUTH_TEST_PORT and PG_AUTH_TEST_CA (the certificate of the server,
 * issued for localhost), and a Postgres with SSL on and these roles, all with an entry in pg_hba.conf for the
 * method in their name:
 * clear_user/clear-pw (password), md5_user/md5-pw (md5), scram_user/scram-pw and scram_utf8/pencil-ä€
 * (scram-sha-256), tls_only/tls-pw (hostssl only, scram-sha-256).
 */
const port = Number(process.env.PG_AUTH_TEST_PORT || 0);
const caPath = process.env.PG_AUTH_TEST_CA;
const suite = port && caPath ? describe : describe.skip;

suite('authentication against a real server', () => {
    const base = { host: '127.0.0.1', port, database: 'postgres' };
    const tls = { rejectUnauthorized: false };

    async function login(options: any) {
        const pool = new PostgresClient({ ...base, ...options });
        try {
            const conn = await pool.acquire();
            const sql = `SELECT current_user AS u, (SELECT ssl FROM pg_stat_ssl WHERE pid = pg_backend_pid()) AS ssl, $1::int AS v`;
            const first = await conn.queryRow(sql, [7], RowMode.object, true);
            const second = await conn.queryRow(sql, [8], RowMode.object, true);
            pool.release(conn);
            return { user: first.u, ssl: first.ssl, values: [first.v, second.v] };
        } finally {
            pool.close();
        }
    }

    test.each([
        ['cleartext', 'clear_user', 'clear-pw'],
        ['md5', 'md5_user', 'md5-pw'],
        ['SCRAM-SHA-256', 'scram_user', 'scram-pw'],
        ['SCRAM-SHA-256 with a non-ASCII password', 'scram_utf8', 'pencil-ä€'],
    ])('%s', async (name, user, password) => {
        expect(await login({ user, password })).toEqual({ user, ssl: false, values: [7, 8] });
        await expect(login({ user, password: 'wrong' })).rejects.toMatchObject({ code: '28P01' });
    });

    test.each([
        ['cleartext', 'clear_user', 'clear-pw'],
        ['md5', 'md5_user', 'md5-pw'],
        ['SCRAM-SHA-256', 'tls_only', 'tls-pw'],
    ])('TLS with %s', async (name, user, password) => {
        expect(await login({ user, password, ssl: tls })).toEqual({ user, ssl: true, values: [7, 8] });
    });

    test('TLS verifies the certificate and the host name', async () => {
        const ca = readFileSync(caPath!).toString();
        expect((await login({ host: 'localhost', user: 'tls_only', password: 'tls-pw', ssl: { ca } })).ssl).toBe(true);
        await expect(login({ user: 'tls_only', password: 'tls-pw', ssl: true })).rejects.toBeInstanceOf(PostgresConnectionError);
        await expect(login({ user: 'tls_only', password: 'tls-pw', ssl: { ca, servername: 'other.example' } })).rejects.toBeInstanceOf(PostgresConnectionError);
    });

    test('a role that requires TLS is refused without', async () => {
        await expect(login({ user: 'tls_only', password: 'tls-pw', ssl: false })).rejects.toBeInstanceOf(PostgresError);
    });

    test('data, pipelining and cancel over TLS', async () => {
        const pool = new PostgresClient({ ...base, user: 'tls_only', password: 'tls-pw', ssl: tls });
        const conn = await pool.acquire();
        try {
            const big = 'ä'.repeat(2 * 1024 * 1024);
            expect((await conn.queryRow('SELECT $1::text AS v', [big])).v).toBe(big);
            const rows = await conn.queryRows(`SELECT generate_series(1, 100000) AS n, repeat('a', 50) AS t`);
            expect(rows).toHaveLength(100000);
            expect(rows[99999].n).toBe(100000);

            const results = await Promise.allSettled([conn.queryRow('SELECT $1::int AS a', [1]), conn.queryRow('SELECT $1::int FROM nope', [2]), conn.queryRow('SELECT $1::int AS a', [3])]);
            expect(results.map(v => v.status)).toEqual(['fulfilled', 'rejected', 'fulfilled']);

            const running = conn.queryRows('SELECT pg_sleep(30)').catch(v => v);
            await new Promise(resolve => setTimeout(resolve, 200));
            await conn.cancel();
            expect((await running).code).toBe('57014');
            expect((await conn.queryRow('SELECT 1 AS a')).a).toBe(1);
        } finally {
            pool.release(conn);
            pool.close();
        }
    });
});
