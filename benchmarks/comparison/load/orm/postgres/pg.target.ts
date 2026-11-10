// Baseline under load: node-postgres directly with named prepared statements and a pool.
import pg from 'pg';

import { postgresUrl } from '../../../orm/shared.js';
import { ormTarget, pageSize } from '../../orm-load.js';

export const target = ormTarget(async ({ poolSize }) => {
    const pool = new pg.Pool({ connectionString: postgresUrl, max: poolSize });
    return {
        findOne: async id =>
            (await pool.query({ name: 'findOne', text: 'SELECT * FROM bench_user WHERE id = $1', values: [id] }))
                .rows[0],
        findPage: async afterId =>
            (
                await pool.query({
                    name: 'findPage',
                    text: 'SELECT * FROM bench_user WHERE id > $1 ORDER BY id LIMIT ' + pageSize,
                    values: [afterId],
                })
            ).rows,
        insertOne: async row =>
            (
                await pool.query({
                    name: 'insertOne',
                    text: 'INSERT INTO bench_insert (name, ready, priority) VALUES ($1, $2, $3) RETURNING id',
                    values: [row.name, row.ready, row.priority],
                })
            ).rows[0].id,
    };
});
