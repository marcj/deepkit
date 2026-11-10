// Drizzle ORM with better-sqlite3, concurrent users in one process.
import Database from 'better-sqlite3';
import { asc, eq, gt } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/better-sqlite3';
import { integer, sqliteTable, text } from 'drizzle-orm/sqlite-core';

import { ormTarget, pageSize } from '../../orm-load.js';

const columns = {
    id: integer('id').primaryKey({ autoIncrement: true }),
    name: text('name').notNull(),
    ready: integer('ready', { mode: 'boolean' }).notNull(),
    priority: integer('priority').notNull(),
};
const users = sqliteTable('bench_user', columns);
const inserted = sqliteTable('bench_insert', columns);

export const target = ormTarget(async ({ file }) => {
    const db = drizzle(new Database(file!));
    return {
        findOne: async id => db.select().from(users).where(eq(users.id, id)).get(),
        findPage: async afterId =>
            db.select().from(users).where(gt(users.id, afterId)).orderBy(asc(users.id)).limit(pageSize).all(),
        insertOne: async row => db.insert(inserted).values(row).returning({ id: inserted.id }).get().id,
    };
});
