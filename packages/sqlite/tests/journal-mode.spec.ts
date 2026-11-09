import { Database } from '@deepkit/orm';
import { AutoIncrement, PrimaryKey, entity } from '@deepkit/type';
import { afterEach, expect, jest, test } from '@jest/globals';
import sqlite3 from 'better-sqlite3';
import { mkdtempSync, rmSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';

import { SQLiteDatabaseAdapter } from '../src/sqlite-adapter.js';

@entity.name('journalItem')
class Item {
    id: number & PrimaryKey & AutoIncrement = 0;

    constructor(public name: string) {}
}

const dirs: string[] = [];
afterEach(() => {
    for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true });
});

function databaseFile(): string {
    const dir = mkdtempSync(join(tmpdir(), 'deepkit-journal-'));
    dirs.push(dir);
    return join(dir, 'test.sqlite');
}

async function journalMode(adapter: SQLiteDatabaseAdapter) {
    const connection = await adapter.connectionPool.getConnection();
    connection.release();
    return connection.db.pragma('journal_mode', { simple: true });
}

test('a file database uses WAL', async () => {
    const adapter = new SQLiteDatabaseAdapter(databaseFile());
    const database = new Database(adapter, [Item]);
    expect(await journalMode(adapter)).toBe('wal');
    await database.migrate();
    await database.persist(new Item('a'));
    expect((await database.query(Item).findOne()).name).toBe('a');
    database.disconnect();
});

test('WAL can be turned off', async () => {
    const adapter = new SQLiteDatabaseAdapter(databaseFile());
    adapter.connectionPool.walMode = false;
    expect(await journalMode(adapter)).toBe('delete');
    adapter.disconnect();
});

test('a memory database stays in memory', async () => {
    const adapter = new SQLiteDatabaseAdapter(':memory:');
    expect(await journalMode(adapter)).toBe('memory');
    adapter.disconnect();
});

test('a database that is locked by someone else still opens', async () => {
    const file = databaseFile();
    const other = new sqlite3(file);
    other.exec('CREATE TABLE a (id INTEGER); BEGIN EXCLUSIVE');

    const adapter = new SQLiteDatabaseAdapter(file);
    const warning = jest.spyOn(adapter.logger, 'warn');
    adapter.connectionPool.setLogger(adapter.logger);
    const connection = await adapter.connectionPool.getConnection();
    connection.release();
    expect(warning).toHaveBeenCalledTimes(1);

    other.exec('COMMIT');
    other.close();
    adapter.disconnect();
});
