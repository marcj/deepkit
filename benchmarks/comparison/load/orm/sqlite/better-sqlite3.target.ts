// Baseline: better-sqlite3 directly with prepared statements, concurrent users in one process.
import Database from 'better-sqlite3';

import { ormTarget, pageSize } from '../../orm-load.js';

export const target = ormTarget(async ({ file }) => {
    const db = new Database(file!);
    const findOne = db.prepare('SELECT * FROM bench_user WHERE id = ?');
    const findPage = db.prepare(`SELECT * FROM bench_user WHERE id > ? ORDER BY id LIMIT ${pageSize}`);
    const insert = db.prepare('INSERT INTO bench_insert (name, ready, priority) VALUES (?, ?, ?)');
    return {
        findOne: async id => findOne.get(id) as { name: string },
        findPage: async afterId => findPage.all(afterId) as { name: string }[],
        insertOne: async row => insert.run(row.name, row.ready ? 1 : 0, row.priority).lastInsertRowid,
    };
});
