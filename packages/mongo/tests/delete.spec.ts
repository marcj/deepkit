import { afterEach, expect, jest, test } from '@jest/globals';

import { Query } from '@deepkit/orm';
import { AutoIncrement, entity, PrimaryKey, Reference } from '@deepkit/type';

import { AggregateCommand } from '../src/client/command/aggregate.js';
import { DeleteCommand } from '../src/client/command/delete.js';
import { FindCommand } from '../src/client/command/find.js';
import { databaseFactory } from './factory.js';

jest.setTimeout(30000);

afterEach(() => jest.restoreAllMocks());

function commands() {
    return {
        find: jest.spyOn(FindCommand.prototype, 'execute'),
        aggregate: jest.spyOn(AggregateCommand.prototype, 'execute'),
        delete: jest.spyOn(DeleteCommand.prototype, 'execute'),
    };
}

@entity.name('delete_item')
class Item {
    constructor(
        public id: number & PrimaryKey,
        public group: string = 'a',
    ) {}
}

async function setup() {
    const database = await databaseFactory([Item]);
    await database.persist(new Item(1), new Item(2), new Item(3), new Item(4, 'b'));
    return database;
}

async function left(database: Awaited<ReturnType<typeof setup>>) {
    const items = await database.query(Item).orderBy('id').find();
    database.disconnect();
    return items.map(v => v.id);
}

test('plain deleteMany is a single delete command', async () => {
    const database = await setup();
    const spy = commands();

    const result = await database.query(Item).filter({ group: 'a' }).deleteMany();

    expect(result.modified).toBe(3);
    expect(spy.find).toHaveBeenCalledTimes(0);
    expect(spy.aggregate).toHaveBeenCalledTimes(0);
    expect(spy.delete).toHaveBeenCalledTimes(1);
    expect(await left(database)).toEqual([4]);
});

test('plain deleteMany without filter is a single delete command', async () => {
    const database = await setup();
    const spy = commands();

    expect((await database.query(Item).deleteMany()).modified).toBe(4);
    expect(spy.find).toHaveBeenCalledTimes(0);
    expect(await left(database)).toEqual([]);
});

test('plain deleteOne is a single delete command', async () => {
    const database = await setup();
    const spy = commands();

    expect((await database.query(Item).filter({ id: 2 }).deleteOne()).modified).toBe(1);
    expect(spy.find).toHaveBeenCalledTimes(0);
    expect(await left(database)).toEqual([1, 3, 4]);
});

test('returnPrimaryKeys reads the keys', async () => {
    const database = await setup();
    const spy = commands();

    const result = await database.query(Item).filter({ group: 'b' }).returnPrimaryKeys().deleteMany();

    expect(result.primaryKeys).toEqual([{ id: 4 }]);
    expect(spy.find).toHaveBeenCalledTimes(1);
    expect(await left(database)).toEqual([1, 2, 3]);
});

test('a limit above one', async () => {
    const database = await setup();
    expect((await database.query(Item).orderBy('id').limit(2).deleteMany()).modified).toBe(2);
    expect(await left(database)).toEqual([3, 4]);
});

test('skip', async () => {
    const database = await setup();
    expect((await database.query(Item).orderBy('id').skip(3).deleteMany()).modified).toBe(1);
    expect(await left(database)).toEqual([1, 2, 3]);
});

test('sort with a limit of one', async () => {
    const database = await setup();
    expect((await database.query(Item).orderBy('id', 'desc').deleteOne()).modified).toBe(1);
    expect(await left(database)).toEqual([1, 2, 3]);
});

test('the post event is dispatched and a listener can not read the keys', async () => {
    const database = await setup();
    const errors: any[] = [];
    database.listen(Query.onDeletePost, event => {
        try {
            event.deleteResult.primaryKeys;
        } catch (error) {
            errors.push(error);
        }
    });

    await database.query(Item).filter({ id: 1 }).deleteMany();
    expect(errors).toHaveLength(1);
    database.disconnect();
});

test('entities known to the session read the keys', async () => {
    const database = await setup();
    const session = database.createSession();
    const items = await session.query(Item).filter({ id: 1 }).find();
    const spy = commands();

    await session.query(Item).filter({ id: 1 }).deleteMany();

    expect(spy.find).toHaveBeenCalledTimes(1);
    expect(session.identityMap.isKnown(items[0])).toBe(false);
    database.disconnect();
});

test('virtual foreign keys read the keys only for referenced entities', async () => {
    @entity.name('delete_author')
    class Author {
        id: number & PrimaryKey & AutoIncrement = 0;
    }

    @entity.name('delete_book')
    class Book {
        id: number & PrimaryKey & AutoIncrement = 0;

        constructor(public author: Author & Reference) {}
    }

    const database = await databaseFactory([Author, Book]);
    const author = new Author();
    await database.persist(author);
    await database.persist(new Book(author));
    const spy = commands();

    // Book is referenced by nothing, even though the virtual foreign key listener is registered
    await database.query(Book).filter({ id: 999 }).deleteMany();
    expect(spy.find).toHaveBeenCalledTimes(0);

    const result = await database.query(Author).deleteMany();
    expect(result.modified).toBe(1);
    expect(spy.find).toHaveBeenCalledTimes(1);
    expect(await database.query(Book).count()).toBe(0);
    database.disconnect();
});
