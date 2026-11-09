import { GroupArraySort } from '@deepkit/topsort';
import { PrimaryKey, Reference, entity } from '@deepkit/type';
import { afterEach, expect, jest, test } from '@jest/globals';

import { Database } from '../src/database.js';
import { DatabaseSession } from '../src/database-session.js';
import { MemoryDatabaseAdapter } from '../src/memory-db.js';

afterEach(() => jest.restoreAllMocks());

@entity.name('groupA')
class A {
    constructor(public id: number & PrimaryKey) {}
}

@entity.name('groupB')
class B {
    constructor(public id: number & PrimaryKey) {}
}

@entity.name('groupOwner')
class Owner {
    constructor(public id: number & PrimaryKey) {}
}

@entity.name('groupOwned')
class Owned {
    constructor(
        public id: number & PrimaryKey,
        public owner: Owner & Reference,
    ) {}
}

function capture(database: Database) {
    const inserts: [string, number[]][] = [];
    database.listen(DatabaseSession.onInsertPre, event => {
        inserts.push([event.classSchema.getName()!, event.items.map(v => (v as any).id)]);
    });
    return inserts;
}

test('without references no sort is needed, items are grouped by entity in first seen order', async () => {
    const add = jest.spyOn(GroupArraySort.prototype, 'add');
    const database = new Database(new MemoryDatabaseAdapter(), [A, B]);
    const inserts = capture(database);
    const session = database.createSession();
    session.add(new B(1), new A(2), new B(3), new A(4));
    await session.commit();

    expect(add).toHaveBeenCalledTimes(0);
    expect(inserts).toEqual([['groupB', [1, 3]], ['groupA', [2, 4]]]);
});

test('with references the dependency is inserted first', async () => {
    const database = new Database(new MemoryDatabaseAdapter(), [Owner, Owned]);
    const inserts = capture(database);
    const session = database.createSession();
    const owner = new Owner(1);
    session.add(new Owned(2, owner), owner);
    await session.commit();

    expect(inserts).toEqual([['groupOwner', [1]], ['groupOwned', [2]]]);
});

test('a referenced entity is added automatically', async () => {
    const database = new Database(new MemoryDatabaseAdapter(), [Owner, Owned]);
    const session = database.createSession();
    session.add(new Owned(2, new Owner(1)));
    await session.commit();
    expect(await database.query(Owner).count()).toBe(1);
});

test('an item added twice is inserted once', async () => {
    const database = new Database(new MemoryDatabaseAdapter(), [A]);
    const inserts = capture(database);
    const session = database.createSession();
    const a = new A(1);
    session.add(a);
    session.add(a);
    await session.commit();
    expect(inserts).toEqual([['groupA', [1]]]);
});

test('instances of different classes are resolved to their own entity', async () => {
    const database = new Database(new MemoryDatabaseAdapter(), [A, B]);
    const session = database.createSession();
    session.add(new A(1));
    session.add(new B(2));
    session.add(new A(3));
    await session.commit();
    expect(await database.query(A).count()).toBe(2);
    expect(await database.query(B).count()).toBe(1);
});
