import { AutoIncrement, isReferenceInstance, PrimaryKey, Reference } from '@deepkit/type';
import { expect, test } from '@jest/globals';

import { Database } from '../src/database.js';
import { MemoryDatabaseAdapter } from '../src/memory-db.js';

class Author {
    id: number & PrimaryKey & AutoIncrement = 0;
    created: Date = new Date;

    constructor(public name: string) {
    }
}

class Book {
    id: number & PrimaryKey & AutoIncrement = 0;

    constructor(public title: string, public author: Author & Reference) {
    }
}

async function setup() {
    const database = new Database(new MemoryDatabaseAdapter(), [Author, Book]);
    const peter = new Author('peter');
    const marc = new Author('marc');
    marc.created = new Date(peter.created.getTime() + 1000);
    await database.persist(peter, marc, new Book('b1', peter), new Book('b2', peter), new Book('b3', marc));
    return { database, peter, marc };
}

test('memory adapter stores references as foreign key', async () => {
    const { database, peter, marc } = await setup();

    const books = await database.query(Book).sort({ id: 'asc' }).find();
    expect(books.map(v => v.title)).toEqual(['b1', 'b2', 'b3']);
    expect(books.map(v => v.author.id)).toEqual([peter.id, peter.id, marc.id]);
    expect(books[0].author).toBeInstanceOf(Author);
    expect(isReferenceInstance(books[0].author)).toBe(true);

    const book = await database.query(Book).filter({ title: 'b3' }).findOne();
    expect(book.author.id).toBe(marc.id);

    //author loaded in the same session is the same instance (identity map)
    const session = database.createSession();
    const author = await session.query(Author).filter({ id: peter.id }).findOne();
    const sessionBook = await session.query(Book).filter({ title: 'b1' }).findOne();
    expect(sessionBook.author).toBe(author);
    expect(sessionBook.author.name).toBe('peter');
});

test('memory adapter filter by reference', async () => {
    const { database, peter, marc } = await setup();

    expect(await database.query(Book).filter({ author: peter }).count()).toBe(2);
    expect(await database.query(Book).filter({ author: marc }).count()).toBe(1);
    expect((await database.query(Book).filter({ author: marc }).find()).map(v => v.title)).toEqual(['b3']);
    expect((await database.query(Book).filter({ author: peter }).sort({ title: 'desc' }).find()).map(v => v.title)).toEqual(['b2', 'b1']);
    expect(await database.query(Book).filter({ author: database.getReference(Author, marc.id) }).count()).toBe(1);
    expect(await database.query(Book).filter({ author: { $in: [peter, marc] } }).count()).toBe(3);
    expect(await database.query(Book).filter({ author: marc }).has()).toBe(true);
});

test('memory adapter filter by date', async () => {
    const { database, peter, marc } = await setup();
    expect(await database.query(Author).filter({ created: peter.created }).count()).toBe(1);
    expect(await database.query(Author).filter({ created: { $gt: new Date(peter.created.getTime() - 1000) } }).count()).toBe(2);
    expect((await database.query(Author).filter({ created: { $gt: peter.created } }).find()).map(v => v.name)).toEqual(['marc']);
    expect((await database.query(Author).sort({ created: 'desc' }).find()).map(v => v.name)).toEqual(['marc', 'peter']);
    expect((await database.query(Author).filter({ id: marc.id }).findOne()).created).toEqual(marc.created);
    expect(await database.query(Author).filter({ created: { $gt: new Date(peter.created.getTime() + 60000) } }).count()).toBe(0);
});

test('memory adapter patch and update of reference', async () => {
    const { database, marc } = await setup();

    const patched = await database.query(Book).filter({ title: 'b1' }).patchOne({ author: marc });
    expect(patched.modified).toBe(1);
    expect((await database.query(Book).filter({ author: marc }).sort({ title: 'asc' }).find()).map(v => v.title)).toEqual(['b1', 'b3']);

    const session = database.createSession();
    const b2 = await session.query(Book).filter({ title: 'b2' }).findOne();
    b2.author = session.getReference(Author, marc.id);
    await session.commit();
    expect(await database.query(Book).filter({ author: marc }).count()).toBe(3);

    const b3 = await database.query(Book).filter({ title: 'b3' }).findOne();
    expect(b3.author.id).toBe(marc.id);
});

test('memory adapter delete by reference', async () => {
    const { database, peter, marc } = await setup();

    const result = await database.query(Book).filter({ author: peter }).deleteMany();
    expect(result.modified).toBe(2);
    expect((await database.query(Book).find()).map(v => v.title)).toEqual(['b3']);

    const b3 = await database.query(Book).findOne();
    await database.remove(b3);
    expect(await database.query(Book).count()).toBe(0);
    expect(await database.query(Author).filter({ id: marc.id }).count()).toBe(1);
});
