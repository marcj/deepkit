import { expect, test } from '@jest/globals';
import { createTestingApp } from '@deepkit/framework';
import { Database, MemoryDatabaseAdapter } from '@deepkit/orm';
import { AutoIncrement, PrimaryKey } from '@deepkit/type';

import { OrmBrowserModule } from '../src/module.js';

class User {
    id: number & PrimaryKey & AutoIncrement = 0;
    name: string = '';
}

class AppDatabase extends Database {
    name = 'app';

    constructor() {
        super(new MemoryDatabaseAdapter(), [User]);
    }
}

test('lists the app databases without forDatabases()', async () => {
    // The controller factory ignored the DatabaseRegistry: without forDatabases() the browser showed no database.
    const testing = createTestingApp({
        providers: [AppDatabase],
        imports: [new OrmBrowserModule({ path: '/data' })],
    });
    await testing.startServer();
    try {
        const client = testing.createRpcClient();
        const databases = await client.controller<any>('.deepkit/orm-browser//data').getDatabases();
        expect(databases.map((v: any) => v.name)).toEqual(['app']);
        client.disconnect();
    } finally {
        await testing.stopServer(true);
    }
});

test('forDatabases() limits the databases', async () => {
    const other = new Database(new MemoryDatabaseAdapter(), [User]);
    other.name = 'other';
    const testing = createTestingApp({
        providers: [AppDatabase],
        imports: [new OrmBrowserModule({ path: '/data' }).forDatabases([other])],
    });
    await testing.startServer();
    try {
        const client = testing.createRpcClient();
        const databases = await client.controller<any>('.deepkit/orm-browser//data').getDatabases();
        expect(databases.map((v: any) => v.name)).toEqual(['other']);
        client.disconnect();
    } finally {
        await testing.stopServer(true);
    }
});
