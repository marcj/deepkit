// Drizzle ORM with node-postgres under load.
import { asc, eq, gt } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/node-postgres';
import { boolean, integer, pgTable, serial, text } from 'drizzle-orm/pg-core';
import pg from 'pg';

import { postgresUrl } from '../../../orm/shared.js';
import { ormTarget, pageSize } from '../../orm-load.js';

const columns = () => ({
    id: serial('id').primaryKey(),
    name: text('name').notNull(),
    ready: boolean('ready').notNull(),
    priority: integer('priority').notNull(),
});
const users = pgTable('bench_user', columns());
const inserted = pgTable('bench_insert', columns());

export const target = ormTarget(async ({ poolSize }) => {
    const pool = new pg.Pool({ connectionString: postgresUrl, max: poolSize });
    const db = drizzle({ client: pool });
    return {
        findOne: async id => (await db.select().from(users).where(eq(users.id, id)))[0],
        findPage: afterId =>
            db.select().from(users).where(gt(users.id, afterId)).orderBy(asc(users.id)).limit(pageSize),
        insertOne: async row => (await db.insert(inserted).values(row).returning({ id: inserted.id }))[0].id,
    };
});
