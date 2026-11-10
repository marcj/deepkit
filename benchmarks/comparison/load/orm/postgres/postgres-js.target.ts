// Baseline under load: postgres.js directly, queries are prepared automatically.
import postgres from 'postgres';

import { postgresUrl } from '../../../orm/shared.js';
import { ormTarget, pageSize } from '../../orm-load.js';

export const target = ormTarget(async ({ poolSize }) => {
    const sql = postgres(postgresUrl, { max: poolSize, onnotice: () => undefined });
    return {
        findOne: async id => (await sql`SELECT * FROM bench_user WHERE id = ${id}`)[0] as { name: string },
        findPage: async afterId =>
            (await sql`SELECT * FROM bench_user WHERE id > ${afterId} ORDER BY id LIMIT ${pageSize}`) as unknown as {
                name: string;
            }[],
        // quoted: postgres.js reads the word before the helper, and bench_insert ends with "insert"
        insertOne: async row =>
            (await sql`INSERT INTO "bench_insert" ${sql(row, 'name', 'ready', 'priority')} RETURNING id`)[0].id,
    };
});
