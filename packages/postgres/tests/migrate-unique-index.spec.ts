import { expect, test } from '@jest/globals';

import { Database } from '@deepkit/orm';
import { sql } from '@deepkit/sql';
import { PrimaryKey, Unique, entity } from '@deepkit/type';

import { PostgresDatabaseAdapter } from '../src/postgres-adapter.js';

@entity.name('migrate_unique_account')
class AccountV1 {
    constructor(
        public id: number & PrimaryKey,
        public email: string & Unique,
        public username: string,
    ) {}
}

@entity.name('migrate_unique_account')
class AccountV2 {
    constructor(
        public id: number & PrimaryKey,
        public email: string,
        public username: string & Unique,
    ) {}
}

const adapter = () => new PostgresDatabaseAdapter({ host: 'localhost', database: 'postgres', user: 'postgres' });

test('dropIndex removes a unique index that moved to another column', async () => {
    const v1 = new Database(adapter(), [AccountV1]);
    await v1.raw(sql`DROP TABLE IF EXISTS migrate_unique_account`).execute();
    await v1.migrate();
    await v1.persist(new AccountV1(1, 'shared@example.com', 'alice'));

    const v2 = new Database(adapter(), [AccountV2]);
    await v2.migrate({ dropIndex: true });
    await v2.persist(new AccountV2(2, 'shared@example.com', 'bob'));
    expect(await v2.query(AccountV2).count()).toBe(2);

    v1.disconnect();
    v2.disconnect();
});
