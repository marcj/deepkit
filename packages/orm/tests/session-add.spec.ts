import { PrimaryKey, Reference, UnpopulatedCheck, createReference, entity, typeSettings } from '@deepkit/type';
import { afterEach, expect, test } from '@jest/globals';

import { Database } from '../src/database.js';
import { MemoryDatabaseAdapter } from '../src/memory-db.js';

@entity.name('sessionAddPlain')
class Plain {
    constructor(public id: number & PrimaryKey) {}
}

@entity.name('sessionAddOwner')
class Owner {
    constructor(public id: number & PrimaryKey) {}
}

@entity.name('sessionAddOwned')
class Owned {
    constructor(
        public id: number & PrimaryKey,
        public owner: Owner & Reference,
    ) {}
}

const descriptor = Object.getOwnPropertyDescriptor(typeSettings, 'unpopulatedCheck')!;

afterEach(() => {
    Object.defineProperty(typeSettings, 'unpopulatedCheck', descriptor);
});

function countWrites(): { writes: number } {
    const result = { writes: 0 };
    let value = typeSettings.unpopulatedCheck;
    Object.defineProperty(typeSettings, 'unpopulatedCheck', {
        configurable: true,
        get: () => value,
        set: v => {
            result.writes++;
            value = v;
        },
    });
    return result;
}

test('adding an entity without references does not touch the type settings', () => {
    const session = new Database(new MemoryDatabaseAdapter(), [Plain]).createSession();
    session.add(new Plain(1));
    const counter = countWrites();
    session.add(new Plain(2), new Plain(3));
    expect(counter.writes).toBe(0);
});

test('an unloaded reference can be added', async () => {
    const database = new Database(new MemoryDatabaseAdapter(), [Owner, Owned]);
    const session = database.createSession();
    session.add(new Owned(1, createReference(Owner, { id: 2 })));
    expect(typeSettings.unpopulatedCheck).toBe(UnpopulatedCheck.Throw);
    await session.commit();
    expect(await database.query(Owned).count()).toBe(1);
});

test('references of an added entity are added too', async () => {
    const database = new Database(new MemoryDatabaseAdapter(), [Owner, Owned]);
    const session = database.createSession();
    session.add(new Owned(1, new Owner(2)));
    await session.commit();
    expect(await database.query(Owner).count()).toBe(1);
});

test('a plain object with an unloaded reference is matched without reading it', () => {
    const session = new Database(new MemoryDatabaseAdapter(), [Owner, Owned]).createSession();
    session.add({ id: 1, owner: createReference(Owner, { id: 2 }) });
    expect(typeSettings.unpopulatedCheck).toBe(UnpopulatedCheck.Throw);
});

test('the type settings are restored when no entity is found', () => {
    const session = new Database(new MemoryDatabaseAdapter(), [Plain]).createSession();
    expect(() => session.add({ unknown: true })).toThrow('No entity');
    expect(typeSettings.unpopulatedCheck).toBe(UnpopulatedCheck.Throw);
});

test('the same item is added once, across calls', async () => {
    const database = new Database(new MemoryDatabaseAdapter(), [Plain]);
    const session = database.createSession();
    const item = new Plain(1);
    session.add(item, item);
    session.add(item);
    await session.commit();
    expect(await database.query(Plain).count()).toBe(1);
});

test('an item added after a commit goes into a new round', async () => {
    const database = new Database(new MemoryDatabaseAdapter(), [Plain]);
    const session = database.createSession();
    session.add(new Plain(1));
    await session.commit();
    session.add(new Plain(2));
    await session.commit();
    expect(await database.query(Plain).count()).toBe(2);
});
