import { expect, test } from '@jest/globals';

import { Database } from '@deepkit/orm';
import { PostgresDatabaseAdapter } from '@deepkit/postgres';
import { sql } from '@deepkit/sql';
import { AutoIncrement, BackReference, PrimaryKey, Reference, entity } from '@deepkit/type';

test('orderBy inside useJoinWith on a camelCase relation', async () => {
    @entity.name('join_order_alias_profile')
    class Profile {
        id: number & PrimaryKey & AutoIncrement = 0;
        gearItems?: GearItem[] & BackReference;
        constructor(public name: string) {}
    }

    @entity.name('join_order_alias_gear_item')
    class GearItem {
        id: number & PrimaryKey & AutoIncrement = 0;
        constructor(
            public profile: Profile & Reference,
            public title: string,
            public sortOrder: number,
        ) {}
    }

    const database = new Database(new PostgresDatabaseAdapter({ host: 'localhost', database: 'postgres', user: 'postgres' }), [Profile, GearItem]);
    const dropTables = () => database.raw(sql`DROP TABLE IF EXISTS join_order_alias_gear_item, join_order_alias_profile`).execute();

    // The loaded gear item titles, in the order the query returned them, or the error message.
    const gearItemTitlesOrError = (profile: Promise<Profile>) =>
        profile.then(
            loaded => (loaded.gearItems ?? []).map(item => item.title),
            (error: Error) => error.message,
        );

    try {
        await dropTables();
        await database.migrate();
        const alice = new Profile('Alice');
        await database.persist(alice, new GearItem(alice, 'Helmet', 2), new GearItem(alice, 'Boots', 1));

        expect({
            useJoinWith: await gearItemTitlesOrError(database.query(Profile).useJoinWith('gearItems').end().findOne()),
            'useJoinWith + orderBy': await gearItemTitlesOrError(database.query(Profile).useJoinWith('gearItems').orderBy('sortOrder').end().findOne()),
        }).toEqual({
            useJoinWith: expect.arrayContaining(['Boots', 'Helmet']),
            'useJoinWith + orderBy': ['Boots', 'Helmet'],
        });
    } finally {
        await dropTables().catch(() => undefined);
        database.disconnect();
    }
});
