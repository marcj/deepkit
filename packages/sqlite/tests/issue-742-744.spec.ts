import { expect, test } from '@jest/globals';

import { Database } from '@deepkit/orm';
import { AutoIncrement, BackReference, PrimaryKey, Reference, entity } from '@deepkit/type';

import { SQLiteDatabaseAdapter } from '../src/sqlite-adapter.js';

test('#742 patchOne with returning() a patched field or the primary key', async () => {
    @entity.name('article')
    class Article {
        counter: number = 0;
        constructor(
            public id: number & PrimaryKey,
            public title: string,
        ) {}
    }

    const database = new Database(new SQLiteDatabaseAdapter(':memory:'), [Article]);
    await database.migrate();
    await database.persist(new Article(1, 'Draft'));
    const article = () => database.query(Article).filter({ id: 1 });

    expect(await article().returning('title').patchOne({ title: 'Published' })).toEqual({ modified: 1, returning: { title: ['Published'] }, primaryKeys: [{ id: 1 }] });
    expect(
        await article()
            .returning('counter')
            .patchOne({ $inc: { counter: 5 } }),
    ).toEqual({ modified: 1, returning: { counter: [5] }, primaryKeys: [{ id: 1 }] });
    expect(await article().returning('id').patchOne({ title: 'Published' })).toEqual({ modified: 1, returning: { id: [1] }, primaryKeys: [{ id: 1 }] });
    database.disconnect();
});

test('#743 field-level $not and $nor, and conditions next to $or', async () => {
    @entity.name('user')
    class User {
        constructor(
            public id: number & PrimaryKey,
            public name: string,
            public age: number,
        ) {}
    }

    const database = new Database(new SQLiteDatabaseAdapter(':memory:'), [User]);
    await database.migrate();
    await database.persist(new User(1, 'apple', 1), new User(2, 'banana', 3), new User(3, 'cherry', 5));
    const names = async (filter: any) => (await database.query(User).filter(filter).orderBy('id').find()).map(v => v.name);

    expect(await names({ age: { $not: { $gt: 3 } } })).toEqual(['apple', 'banana']);
    expect(await names({ $nor: [{ name: 'banana' }, { age: { $gt: 3 } }] })).toEqual(['apple']);
    expect(await names({ $not: [{ name: 'banana' }] })).toEqual(['apple', 'cherry']);
    // the condition next to $or was dropped
    expect(await names({ $or: [{ name: 'apple' }, { name: 'cherry' }], age: 5 })).toEqual(['cherry']);
    database.disconnect();
});

test('#744 orderBy inside useJoinWith on a camelCase relation', async () => {
    @entity.name('profile')
    class Profile {
        id: number & PrimaryKey & AutoIncrement = 0;
        gearItems?: GearItem[] & BackReference;
        constructor(public name: string) {}
    }

    @entity.name('gear_item')
    class GearItem {
        id: number & PrimaryKey & AutoIncrement = 0;
        constructor(
            public profile: Profile & Reference,
            public title: string,
            public sortOrder: number,
        ) {}
    }

    const database = new Database(new SQLiteDatabaseAdapter(':memory:'), [Profile, GearItem]);
    await database.migrate();
    const profile = new Profile('Alice');
    await database.persist(profile, new GearItem(profile, 'Helmet', 2), new GearItem(profile, 'Boots', 1));

    const loaded = await database.query(Profile).useJoinWith('gearItems').orderBy('sortOrder').end().findOne();
    expect(loaded.gearItems!.map(v => v.title)).toEqual(['Boots', 'Helmet']);
    database.disconnect();
});
