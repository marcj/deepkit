// Baseline: postgres.js directly, queries are prepared automatically.
import postgres from 'postgres';

import { createRows, ormSuite, postgresUrl, resetPostgres, rowCount } from '../shared.js';

export default async function () {
    await resetPostgres(true);
    const sql = postgres(postgresUrl, { onnotice: () => undefined });
    await sql`INSERT INTO bench_user ${sql(createRows(rowCount), 'name', 'ready', 'priority')}`;

    return ormSuite('postgres', 'postgres.js', {
        findOne: async id => (await sql`SELECT * FROM bench_user WHERE id = ${id}`)[0] as { name: string },
        findAll: () => sql`SELECT * FROM bench_user`,
        // quoted: postgres.js reads the word before the helper, and bench_insert ends with "insert"
        insertMany: async rows => void (await sql`INSERT INTO "bench_insert" ${sql(rows, 'name', 'ready', 'priority')}`),
        deleteInserted: async () => void (await sql`DELETE FROM bench_insert`),
        close: () => sql.end(),
    });
}
