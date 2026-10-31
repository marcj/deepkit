// Baseline: better-sqlite3 directly with prepared statements, objects as the driver returns them.
import Database from 'better-sqlite3';

import { createRows, ormSuite, Row, rowCount, sqliteFile } from '../shared.js';

export default async function () {
    const db = new Database(sqliteFile('better-sqlite3'));
    db.exec(`
        CREATE TABLE bench_user (id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL, ready INTEGER NOT NULL, priority INTEGER NOT NULL);
        CREATE TABLE bench_insert (id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL, ready INTEGER NOT NULL, priority INTEGER NOT NULL);
    `);
    const insertUser = db.prepare('INSERT INTO bench_user (name, ready, priority) VALUES (?, ?, ?)');
    const insertRow = db.prepare('INSERT INTO bench_insert (name, ready, priority) VALUES (?, ?, ?)');
    const insertAll = (statement: Database.Statement, rows: Row[]) =>
        db.transaction(() => {
            for (const row of rows) statement.run(row.name, row.ready ? 1 : 0, row.priority);
        })();
    insertAll(insertUser, createRows(rowCount));

    const findOne = db.prepare('SELECT * FROM bench_user WHERE id = ?');
    const findAll = db.prepare('SELECT * FROM bench_user');
    const deleteAll = db.prepare('DELETE FROM bench_insert');

    return ormSuite('sqlite', 'better-sqlite3', {
        findOne: async id => findOne.get(id) as { name: string },
        findAll: async () => findAll.all(),
        insertMany: async rows => insertAll(insertRow, rows),
        deleteInserted: async () => void deleteAll.run(),
        close: async () => db.close(),
    });
}
