// Baseline: node-postgres directly with named prepared statements and a pool.
import pg from 'pg';

import { createRows, ormSuite, postgresUrl, resetPostgres, Row, rowCount } from '../shared.js';

export default async function () {
    await resetPostgres(true);
    const pool = new pg.Pool({ connectionString: postgresUrl });
    const insert = (table: string, rows: Row[]) =>
        pool.query(`INSERT INTO ${table} (name, ready, priority) SELECT * FROM unnest($1::text[], $2::bool[], $3::int[])`, [
            rows.map(v => v.name),
            rows.map(v => v.ready),
            rows.map(v => v.priority),
        ]);
    await insert('bench_user', createRows(rowCount));

    return ormSuite('postgres', 'pg', {
        findOne: async id => (await pool.query({ name: 'findOne', text: 'SELECT * FROM bench_user WHERE id = $1', values: [id] })).rows[0],
        findAll: async () => (await pool.query({ name: 'findAll', text: 'SELECT * FROM bench_user' })).rows,
        insertMany: async rows => void (await insert('bench_insert', rows)),
        deleteInserted: async () => void (await pool.query('DELETE FROM bench_insert')),
        close: () => pool.end(),
    });
}
