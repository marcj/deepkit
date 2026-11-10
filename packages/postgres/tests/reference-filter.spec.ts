import { expect, test } from '@jest/globals';

import { AutoIncrement, PrimaryKey, Reference, entity } from '@deepkit/type';

import { databaseFactory } from './factory.js';

@entity.name('reference_filter_author')
class Author {
    id: number & PrimaryKey & AutoIncrement = 0;

    constructor(public name: string) {}
}

@entity.name('reference_filter_book')
class Book {
    id: number & PrimaryKey & AutoIncrement = 0;

    constructor(
        public title: string,
        public author: Author & Reference,
    ) {}
}

async function setup() {
    const database = await databaseFactory([Author, Book]);
    const alice = new Author('alice');
    const bob = new Author('bob');
    await database.persist(alice, bob);
    await database.persist(new Book('a1', alice), new Book('b1', bob));
    const titles = async (filter: any) => (await database.query(Book).filter(filter).find()).map(v => v.title).sort();
    return { database, bob, titles };
}

test('a reference filters by entity, primary key and operators on the primary key', async () => {
    const { database, bob, titles } = await setup();
    expect(await titles({ author: database.getReference(Author, bob.id) })).toEqual(['b1']);
    expect(await titles({ author: { id: bob.id } })).toEqual(['b1']);
    expect(await titles({ author: bob.id })).toEqual(['b1']);
    expect(await titles({ author: { $ne: bob.id } })).toEqual(['a1']);
    expect(await titles({ author: { $in: [bob.id] } })).toEqual(['b1']);
    database.disconnect();
});

test('a filter on another field of a reference is an error instead of being dropped', async () => {
    const { database, bob, titles } = await setup();
    await expect(titles({ author: { name: bob.name } })).rejects.toThrow('author');
    database.disconnect();
});
