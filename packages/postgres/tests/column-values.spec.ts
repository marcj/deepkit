import { expect, test } from '@jest/globals';

import { Database } from '@deepkit/orm';
import { sql } from '@deepkit/sql';
import { AutoIncrement, BinaryBigInt, PrimaryKey, entity } from '@deepkit/type';

import { PostgresDatabaseAdapter } from '../src/postgres-adapter.js';

@entity.name('column_values_item')
class Item {
    id: number & PrimaryKey & AutoIncrement = 0;
    huge: BinaryBigInt = 0n;
    union: string | number = '';
    unionDate: string | Date = '';
    unionObject: string | { x: number } = '';
    unionNullable?: string | number | null = null;
    anything: any = null;

    constructor(public name: string) {}
}

async function withDatabase(fn: (database: Database) => Promise<void>) {
    const database = new Database(new PostgresDatabaseAdapter({ host: 'localhost', database: 'postgres', user: 'postgres' }), [Item]);
    try {
        await database.raw(sql`DROP TABLE IF EXISTS column_values_item`).execute();
        await database.migrate();
        await fn(database);
    } finally {
        await database
            .raw(sql`DROP TABLE IF EXISTS column_values_item`)
            .execute()
            .catch(() => undefined);
        database.disconnect();
    }
}

test('BinaryBigInt beyond 64 bit', async () => {
    // was a bigint column: "out of range for type bigint"
    await withDatabase(async database => {
        const item = new Item('a');
        item.huge = 2n ** 80n + 1n;
        await database.persist(item);
        expect((await database.query(Item).filter({ id: item.id }).findOne()).huge).toBe(2n ** 80n + 1n);
    });
});

test('string, date, object and null in a JSON union column, single and batch insert', async () => {
    // a string member was written as it is, invalid JSON; reading parsed the already parsed value again
    await withDatabase(async database => {
        const items = [new Item('a'), new Item('b'), new Item('c')];
        items[0].union = 'text';
        items[0].unionDate = new Date('2026-01-01T00:00:00Z');
        items[0].unionObject = { x: 1 };
        items[0].anything = 'just a string';
        items[1].union = 5;
        items[1].unionNullable = 'set';
        items[1].anything = { deep: [1, 'x'] };
        items[2].unionNullable = 7;
        await database.persist(items[0]);
        await database.persist(items[1], items[2]);

        const loaded = await database.query(Item).orderBy('id').find();
        expect(loaded.map(v => [v.union, v.unionDate, v.unionObject, v.unionNullable, v.anything])).toEqual([
            ['text', new Date('2026-01-01T00:00:00Z'), { x: 1 }, null, 'just a string'],
            [5, '', '', 'set', { deep: [1, 'x'] }],
            ['', '', '', 7, null],
        ]);
        // null stays SQL NULL
        expect(await database.query(Item).filter({ unionNullable: null }).count()).toBe(1);
    });
});

test('numeric keeps its digits', async () => {
    await withDatabase(async database => {
        const [row] = await database.raw<any>(sql`SELECT 1.5::numeric AS small, 12345678901234567890::numeric AS whole, 12345678901234567890.123456789::numeric AS fraction, 'NaN'::numeric AS nan`).find();
        expect(row).toEqual({ small: 1.5, whole: 12345678901234567890n, fraction: '12345678901234567890.123456789', nan: NaN });
    });
});

test('$regex with a string', async () => {
    await withDatabase(async database => {
        await database.persist(new Item('apple'), new Item('banana'));
        // read source and flags of a RegExp: "Cannot read properties of undefined (reading 'includes')"
        expect(
            (
                await database
                    .query(Item)
                    .filter({ name: { $regex: '^ba' } as any })
                    .find()
            ).map(v => v.name),
        ).toEqual(['banana']);
    });
});
