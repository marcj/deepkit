import { expect, test } from '@jest/globals';

import { Database } from '@deepkit/orm';
import { sql } from '@deepkit/sql';
import { AutoIncrement, Index, PrimaryKey, UUID, entity, uuid } from '@deepkit/type';

import { PostgresDatabaseAdapter } from '../src/postgres-adapter.js';

test('a filter on a UUID column with a value that is not a UUID names the value', async () => {
    @entity.name('uuid_filter_basket')
    class Basket {
        id: number & PrimaryKey & AutoIncrement = 0;
        anonId?: UUID & Index;
    }

    const database = new Database(new PostgresDatabaseAdapter({ host: 'localhost', database: 'postgres', user: 'postgres' }), [Basket]);
    try {
        await database.raw(sql`DROP TABLE IF EXISTS uuid_filter_basket`).execute();
        await database.migrate();
        const basket = new Basket();
        basket.anonId = uuid();
        await database.persist(basket);

        expect(await database.query(Basket).filter({ anonId: basket.anonId }).count()).toBe(1);
        // was a short binary parameter, rejected by PostgreSQL as "insufficient data left in message"
        await expect(database.query(Basket).filter({ anonId: 'verify-123' }).find()).rejects.toThrow("'verify-123' is not a UUID");
    } finally {
        await database
            .raw(sql`DROP TABLE IF EXISTS uuid_filter_basket`)
            .execute()
            .catch(() => undefined);
        database.disconnect();
    }
});
