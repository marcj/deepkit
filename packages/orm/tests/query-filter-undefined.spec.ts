import { expect, test } from '@jest/globals';

import { AutoIncrement, PrimaryKey, cast, entity } from '@deepkit/type';

import { Database } from '../src/database.js';
import { MemoryDatabaseAdapter } from '../src/memory-db.js';
import { convertQueryFilter } from '../src/query-filter.js';

@entity.name('filter_undefined')
class Item {
    id: number & PrimaryKey & AutoIncrement = 0;
    name: string = '';
    opt?: string;
}

test('convertQueryFilter keeps fields set to undefined (#692)', () => {
    const converted = convertQueryFilter(Item, { name: undefined, opt: undefined } as any, (schema, path, value) => value);
    expect(Object.keys(converted)).toEqual(['name', 'opt']);
});

test('memory adapter: a filter field set to undefined does not match everything (#692)', async () => {
    const database = new Database(new MemoryDatabaseAdapter(), [Item]);
    await database.persist(cast<Item>({ id: 1, name: 'a' }), cast<Item>({ id: 2, name: 'b', opt: 'x' }));
    const names = async (filter: any) => (await database.query(Item).filter(filter).orderBy('name').find()).map(v => v.name);

    expect(await names({})).toEqual(['a', 'b']);
    expect(await names({ name: undefined })).toEqual([]);
    expect(await names({ id: undefined })).toEqual([]);
    expect(await names({ opt: undefined })).toEqual(['a']);
    expect(
        await database
            .query(Item)
            .filter({ id: undefined } as any)
            .count(),
    ).toBe(0);

    await database
        .query(Item)
        .filter({ id: undefined } as any)
        .deleteMany();
    await database
        .query(Item)
        .filter({ name: undefined } as any)
        .patchMany({ name: 'changed' });
    expect(await names({})).toEqual(['a', 'b']);
});
