import { Database } from '@deepkit/orm';
import { AutoIncrement, BackReference, PrimaryKey, Reference, entity } from '@deepkit/type';
import { expect, jest, test } from '@jest/globals';

import { SQLiteDatabaseAdapter } from '../src/sqlite-adapter.js';

@entity.name('findOneAuthor')
class Author {
    id: number & PrimaryKey & AutoIncrement = 0;
    books: Book[] & BackReference = [];

    constructor(public name: string) {}
}

@entity.name('findOneBook')
class Book {
    id: number & PrimaryKey & AutoIncrement = 0;

    constructor(public title: string, public author: Author & Reference) {}
}

async function setup() {
    const adapter = new SQLiteDatabaseAdapter(':memory:');
    const database = new Database(adapter, [Author, Book]);
    await database.migrate();
    const author = new Author('a');
    await database.persist(author);
    await database.persist(new Book('b1', author), new Book('b2', author));
    const connection = await adapter.connectionPool.getConnection();
    connection.release();
    return { database, connection };
}

test('one row is read as a single row', async () => {
    const { database, connection } = await setup();
    const single = jest.spyOn(connection, 'execAndReturnSingle');
    const all = jest.spyOn(connection, 'execAndReturnAll');
    const author = await database.query(Author).filter({ name: 'a' }).findOne();
    expect(author).toBeInstanceOf(Author);
    expect(author.name).toBe('a');
    expect(single).toHaveBeenCalledTimes(1);
    expect(all).toHaveBeenCalledTimes(0);
    database.disconnect();
});

test('no row', async () => {
    const { database } = await setup();
    expect(await database.query(Author).filter({ name: 'x' }).findOneOrUndefined()).toBe(undefined);
    await expect(database.query(Author).filter({ name: 'x' }).findOne()).rejects.toThrow();
    database.disconnect();
});

test('a join still reads all rows of the entity', async () => {
    const { database } = await setup();
    const author = await database.query(Author).joinWith('books').findOne();
    expect(author.books.map(v => v.title).sort()).toEqual(['b1', 'b2']);
    database.disconnect();
});

test('a found item takes part in the session', async () => {
    const { database } = await setup();
    const session = database.createSession();
    const first = await session.query(Author).filter({ name: 'a' }).findOne();
    const second = await session.query(Author).filter({ name: 'a' }).findOne();
    expect(first).toBe(second);
    first.name = 'changed';
    await session.commit();
    expect((await database.query(Author).findOne()).name).toBe('changed');
    database.disconnect();
});

test('a selection and an aggregation', async () => {
    const { database } = await setup();
    expect(await database.query(Author).select('name').findOne()).toEqual({ name: 'a' });
    expect(await database.query(Book).withCount('id', 'total').findOne()).toEqual({ total: 2 });
    database.disconnect();
});

test('a model emits changes to its subscribers', async () => {
    const { database } = await setup();
    const model = database.query(Author).model;
    let calls = 0;
    model.change.subscribe(() => calls++);
    model.changed();
    expect(calls).toBe(1);
    database.disconnect();
});
