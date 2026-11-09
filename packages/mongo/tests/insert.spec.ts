import { afterEach, expect, jest, test } from '@jest/globals';

import { DatabaseField, MongoId, PrimaryKey, entity } from '@deepkit/type';

import { InsertCommand } from '../src/client/command/insert.js';
import { databaseFactory } from './factory.js';

jest.setTimeout(30000);
afterEach(() => jest.restoreAllMocks());

@entity.name('insert_plain')
class Plain {
    _id: MongoId & PrimaryKey = '';

    constructor(public name: string) {}
}

@entity.name('insert_skipped')
class WithSkipped {
    _id: MongoId & PrimaryKey = '';
    local: string & DatabaseField<{ skip: true }> = 'not stored';

    constructor(public name: string) {}
}

function documents(spy: any) {
    return spy.mock.contexts[0].documents as any[];
}

test('entities are serialized directly when nothing has to be left out', async () => {
    const database = await databaseFactory([Plain]);
    const spy = jest.spyOn(InsertCommand.prototype, 'execute');
    const item = new Plain('a');
    await database.persist(item);

    expect(documents(spy)[0]).toBe(item);
    const raw = await database.query(Plain).filter({ name: 'a' }).findOne();
    expect(raw._id).toBe(item._id);
    database.disconnect();
});

test('skipped properties are not stored', async () => {
    const database = await databaseFactory([WithSkipped]);
    const spy = jest.spyOn(InsertCommand.prototype, 'execute');
    await database.persist(new WithSkipped('a'));

    expect(documents(spy)[0]).not.toHaveProperty('local');
    expect(documents(spy)[0].name).toBe('a');
    database.disconnect();
});
