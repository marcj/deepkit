// Drizzle ORM with better-sqlite3.
import Database from 'better-sqlite3';
import { eq } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/better-sqlite3';
import { integer, sqliteTable, text } from 'drizzle-orm/sqlite-core';

import { createRows, ormSuite, rowCount, sqliteFile } from '../shared.js';

const columns = {
    id: integer('id').primaryKey({ autoIncrement: true }),
    name: text('name').notNull(),
    ready: integer('ready', { mode: 'boolean' }).notNull(),
    priority: integer('priority').notNull(),
};
const users = sqliteTable('bench_user', columns);
const inserted = sqliteTable('bench_insert', columns);

export default async function () {
    const sqlite = new Database(sqliteFile('drizzle'));
    sqlite.exec(`
        CREATE TABLE bench_user (id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL, ready INTEGER NOT NULL, priority INTEGER NOT NULL);
        CREATE TABLE bench_insert (id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL, ready INTEGER NOT NULL, priority INTEGER NOT NULL);
    `);
    const db = drizzle(sqlite);
    await db.insert(users).values(createRows(rowCount));

    return ormSuite('sqlite', 'Drizzle', {
        findOne: async id => db.select().from(users).where(eq(users.id, id)).get(),
        findAll: async () => db.select().from(users).all(),
        insertMany: async rows => void (await db.insert(inserted).values(rows)),
        insertEntities: async rows => (await db.insert(inserted).values(rows).returning({ id: inserted.id })).map(v => v.id),
        deleteInserted: async () => void (await db.delete(inserted)),
        close: async () => sqlite.close(),
    });
}
