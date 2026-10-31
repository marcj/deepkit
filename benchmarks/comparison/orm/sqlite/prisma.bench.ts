// Prisma 7 with the better-sqlite3 driver adapter. The tables are created with better-sqlite3 like `prisma db push` would.
import { PrismaBetterSqlite3 } from '@prisma/adapter-better-sqlite3';
import Database from 'better-sqlite3';

import { PrismaClient } from '../prisma-generated/sqlite/client.js';
import { createRows, ormSuite, rowCount, sqliteFile } from '../shared.js';

export default async function () {
    const file = sqliteFile('prisma');
    const sqlite = new Database(file);
    sqlite.exec(`
        CREATE TABLE bench_user (id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL, ready BOOLEAN NOT NULL, priority INTEGER NOT NULL);
        CREATE TABLE bench_insert (id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL, ready BOOLEAN NOT NULL, priority INTEGER NOT NULL);
    `);
    sqlite.close();

    const prisma = new PrismaClient({ adapter: new PrismaBetterSqlite3({ url: 'file:' + file }) });
    await prisma.user.createMany({ data: createRows(rowCount) });

    return ormSuite('sqlite', 'Prisma', {
        findOne: id => prisma.user.findUnique({ where: { id } }),
        findAll: () => prisma.user.findMany(),
        insertMany: async rows => void (await prisma.inserted.createMany({ data: rows })),
        deleteInserted: async () => void (await prisma.inserted.deleteMany()),
        close: () => prisma.$disconnect(),
    });
}
