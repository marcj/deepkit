import { expect, test } from '@jest/globals';

import { Database } from '@deepkit/orm';
import { AutoIncrement, PrimaryKey, entity } from '@deepkit/type';

import { SQLiteDatabaseAdapter } from '../src/sqlite-adapter.js';

test('a string in a JSON union column', async () => {
    @entity.name('json_union_item')
    class Item {
        id: number & PrimaryKey & AutoIncrement = 0;
        union: string | number = '';
        unionNullable?: string | number | null = null;
        anything: any = null;
    }

    const database = new Database(new SQLiteDatabaseAdapter(':memory:'), [Item]);
    await database.migrate();
    const a = new Item();
    a.union = 'text';
    a.anything = 'just a string';
    const b = new Item();
    b.union = 5;
    b.unionNullable = 'set';
    await database.persist(a);
    await database.persist(b);
    // the string was stored without JSON quotes, reading it failed with "Unexpected token"
    expect((await database.query(Item).orderBy('id').find()).map(v => [v.union, v.unionNullable, v.anything])).toEqual([
        ['text', null, 'just a string'],
        [5, 'set', null],
    ]);
    expect(await database.query(Item).filter({ unionNullable: null }).count()).toBe(1);
    database.disconnect();
});
