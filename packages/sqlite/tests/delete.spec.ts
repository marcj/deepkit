import { expect, jest, test } from '@jest/globals';

import { Database, DeleteResult } from '@deepkit/orm';
import { SQLQueryResolver } from '@deepkit/sql';
import { entity, PrimaryKey } from '@deepkit/type';

import { SQLiteDatabaseAdapter } from '../src/sqlite-adapter.js';

@entity.name('delete_generic')
class Item {
    constructor(public id: number & PrimaryKey) {}
}

async function setup() {
    const database = new Database(new SQLiteDatabaseAdapter(':memory:'), [Item]);
    await database.migrate();
    await database.persist(new Item(1), new Item(2), new Item(3));
    return database;
}

test('generic SQL path counts without keys', async () => {
    const database = await setup();
    const query = database.query(Item).filter({ id: 1 });
    const result = new DeleteResult<Item>('Item');

    await SQLQueryResolver.prototype.delete.call(query.resolver, query.model, result);

    expect(result.modified).toBe(1);
    expect(result.loadedPrimaryKeys).toEqual([]);
    expect(await database.query(Item).count()).toBe(2);
    database.disconnect();
});

test('generic SQL path fills the keys', async () => {
    const database = await setup();
    const query = database.query(Item).filter({ id: { $gt: 1 } });
    const result = new DeleteResult<Item>('Item');
    result.returnPrimaryKeys();

    await SQLQueryResolver.prototype.delete.call(query.resolver, query.model, result);

    expect(result.modified).toBe(2);
    expect(result.primaryKeys).toEqual([{ id: 2 }, { id: 3 }]);
    expect(await database.query(Item).count()).toBe(1);
    database.disconnect();
});

test('plain delete is one statement', async () => {
    const database = await setup();
    const connection = await database.adapter.connectionPool.getConnection();
    connection.release();
    const run = jest.spyOn(Object.getPrototypeOf(connection), 'run');
    const exec = jest.spyOn(Object.getPrototypeOf(connection), 'exec');

    const result = await database.query(Item).filter({ id: 1 }).deleteMany();

    expect(result.modified).toBe(1);
    expect(exec).toHaveBeenCalledTimes(0);
    expect(run).toHaveBeenCalledTimes(1);
    run.mockRestore();
    exec.mockRestore();
    database.disconnect();
});
