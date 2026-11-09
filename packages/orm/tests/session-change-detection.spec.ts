import { PrimaryKey, ReflectionClass, entity } from '@deepkit/type';
import { expect, test } from '@jest/globals';

import { Database } from '../src/database.js';
import { DatabaseSession } from '../src/database-session.js';
import { getClassState, getInstanceState } from '../src/identity-map.js';
import { MemoryDatabaseAdapter } from '../src/memory-db.js';

@entity.name('noChangeDetection')
class Item {
    name: string = 'initial';

    constructor(public id: number & PrimaryKey) {}
}

function stateOf(item: Item) {
    return getInstanceState(getClassState(ReflectionClass.from(Item)), item);
}

async function committed(configure: (session: DatabaseSession<any>) => void = () => undefined) {
    const database = new Database(new MemoryDatabaseAdapter(), [Item]);
    const session = database.createSession();
    configure(session);
    const item = new Item(1);
    session.add(item);
    await session.commit();
    return { database, session, item };
}

test('no snapshot is taken of inserted items', async () => {
    const { item } = await committed(session => session.disableChangeDetection());
    expect(stateOf(item).snapshot).toBeUndefined();
    expect(stateOf(item).isKnownInDatabase()).toBe(true);
});

test('also without identity map', async () => {
    const { item } = await committed(session => {
        session.withIdentityMap = false;
        session.disableChangeDetection();
    });
    expect(stateOf(item).snapshot).toBeUndefined();
    expect(stateOf(item).isKnownInDatabase()).toBe(true);
});

test('by default a snapshot is taken', async () => {
    const { item } = await committed();
    expect(stateOf(item).snapshot).toBeDefined();
});

test('an item is not inserted again and its changes are not detected', async () => {
    const { database, session, item } = await committed(session => session.disableChangeDetection());
    item.name = 'changed';
    await session.commit();
    const items = await database.query(Item).find();
    expect(items.length).toBe(1);
    expect(items[0].name).toBe('initial');
});

test('an item can be removed, its primary key comes from the item', async () => {
    const { database, session, item } = await committed(session => session.disableChangeDetection());
    session.remove(item);
    await session.commit();
    expect(await database.query(Item).count()).toBe(0);
});

test('the identity map still knows the item', async () => {
    const { session, item } = await committed(session => session.disableChangeDetection());
    expect(session.identityMap.isKnown(item)).toBe(true);
});

test('queries of the session do not take snapshots either', async () => {
    const { session } = await committed(session => session.disableChangeDetection());
    expect(session.query(Item).model.withChangeDetection).toBe(false);
});
