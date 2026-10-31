// Drizzle ORM with node-postgres.
import { eq } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/node-postgres';
import { boolean, integer, pgTable, serial, text } from 'drizzle-orm/pg-core';
import pg from 'pg';

import { createRows, ormSuite, postgresUrl, resetPostgres, rowCount } from '../shared.js';

const columns = () => ({
    id: serial('id').primaryKey(),
    name: text('name').notNull(),
    ready: boolean('ready').notNull(),
    priority: integer('priority').notNull(),
});
const users = pgTable('bench_user', columns());
const inserted = pgTable('bench_insert', columns());

export default async function () {
    await resetPostgres(true);
    const pool = new pg.Pool({ connectionString: postgresUrl });
    const db = drizzle({ client: pool });
    await db.insert(users).values(createRows(rowCount));

    return ormSuite('postgres', 'Drizzle', {
        findOne: async id => (await db.select().from(users).where(eq(users.id, id)))[0],
        findAll: () => db.select().from(users),
        insertMany: async rows => void (await db.insert(inserted).values(rows)),
        deleteInserted: async () => void (await db.delete(inserted)),
        close: () => pool.end(),
    });
}
