import { expect, test } from '@jest/globals';

import { PrimaryKey, entity } from '@deepkit/type';

import { databaseFactory } from './factory.js';

@entity.name('session_patch_note')
class Note {
    constructor(
        public id: number & PrimaryKey,
        public title: string,
    ) {}
}

test('patchOne in a session updates the loaded entity', async () => {
    const database = await databaseFactory([Note]);
    await database.persist(new Note(1, 'Draft'));

    const session = database.createSession();
    const note = await session.query(Note).filter({ id: 1 }).findOne();
    await session.query(Note).filter({ id: 1 }).patchOne({ title: 'Published' });

    expect(note.title).toBe('Published');
    expect((await session.query(Note).filter({ id: 1 }).findOne()).title).toBe('Published');
    expect((await database.query(Note).filter({ id: 1 }).findOne()).title).toBe('Published');
    database.disconnect();
});

test('patchMany in a session updates all loaded entities', async () => {
    const database = await databaseFactory([Note]);
    await database.persist(new Note(1, 'a'), new Note(2, 'b'));

    const session = database.createSession();
    const notes = await session.query(Note).orderBy('id').find();
    await session.query(Note).patchMany({ title: 'c' });

    expect(notes.map(v => v.title)).toEqual(['c', 'c']);
    database.disconnect();
});

@entity.name('session_patch_article')
class Article {
    constructor(
        public id: number & PrimaryKey,
        public title: string,
        public body: string = 'body',
    ) {}
}

test('commit does not write back what a patch already wrote', async () => {
    const database = await databaseFactory([Article]);
    await database.persist(new Article(1, 'Draft'));

    const session = database.createSession();
    const article = await session.query(Article).filter({ id: 1 }).findOne();
    await session.query(Article).filter({ id: 1 }).patchOne({ title: 'Published' });

    await database.query(Article).filter({ id: 1 }).patchOne({ title: 'Changed elsewhere' });
    await session.commit();

    expect(article.title).toBe('Published');
    expect((await database.query(Article).filter({ id: 1 }).findOne()).title).toBe('Changed elsewhere');
    database.disconnect();
});

test('commit still writes other changes of a patched entity', async () => {
    const database = await databaseFactory([Article]);
    await database.persist(new Article(1, 'Draft'));

    const session = database.createSession();
    const article = await session.query(Article).filter({ id: 1 }).findOne();
    article.body = 'edited';
    await session.query(Article).filter({ id: 1 }).patchOne({ title: 'Published' });
    await session.commit();

    const stored = await database.query(Article).filter({ id: 1 }).findOne();
    expect(stored.title).toBe('Published');
    expect(stored.body).toBe('edited');
    database.disconnect();
});
