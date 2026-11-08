import { PrimaryKey, entity } from '@deepkit/type';
import { expect, test } from '@jest/globals';

import { Database } from '../src/database.js';
import { getClassState, getInstanceState } from '../src/identity-map.js';
import { MemoryDatabaseAdapter } from '../src/memory-db.js';
import { ReflectionClass } from '@deepkit/type';

@entity.name('lazyIdentity')
class Item {
    name: string = '';

    constructor(public id: number & PrimaryKey) {}
}

async function committed() {
    const database = new Database(new MemoryDatabaseAdapter(), [Item]);
    const session = database.createSession();
    const item = new Item(1);
    session.add(item, new Item(2));
    await session.commit();
    return { database, session, item };
}

test('an insert does not fill the map', async () => {
    const { session } = await committed();
    expect(session.identityMap.registry.size).toBe(0);
});

test('inserted items are known as soon as somebody asks', async () => {
    const { session, item } = await committed();
    expect(session.identityMap.hasItems(ReflectionClass.from(Item))).toBe(true);
    expect(session.identityMap.isKnown(item)).toBe(true);
});

test('a query of the session returns the inserted instance', async () => {
    const { session, item } = await committed();
    const found = await session.query(Item).filter({ id: 1 }).findOne();
    expect(found).toBe(item);
});

test('getByHash finds an inserted item', async () => {
    const { session, item } = await committed();
    const schema = ReflectionClass.from(Item);
    const hash = getClassState(schema).primaryKeyHashGenerator(item);
    expect(session.identityMap.getByHash(schema, hash)).toBe(item);
});

test('the next commit of the session detects changes of inserted items', async () => {
    const { database, session, item } = await committed();
    item.name = 'changed';
    await session.commit();
    expect((await database.query(Item).filter({ id: 1 }).findOne()).name).toBe('changed');
});

test('deleting removes a not yet registered item', async () => {
    const { session, item } = await committed();
    await session.query(Item).filter({ id: 1 }).deleteMany();
    expect(session.identityMap.isKnown(item)).toBe(false);
    expect(getInstanceState(getClassState(ReflectionClass.from(Item)), item).isKnownInDatabase()).toBe(false);
});

test('session.remove removes a not yet registered item', async () => {
    const { session, item } = await committed();
    session.remove(item);
    await session.commit();
    expect(session.identityMap.isKnown(item)).toBe(false);
});

test('clear also forgets not yet registered items', async () => {
    const { session, item } = await committed();
    session.identityMap.clear();
    expect(session.identityMap.isKnown(item)).toBe(false);
    expect(session.identityMap.hasItems(ReflectionClass.from(Item))).toBe(false);
});
