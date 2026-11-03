import { expect, test } from '@jest/globals';

import { App } from '@deepkit/app';
import { Database, DatabaseRegistry, MemoryDatabaseAdapter } from '@deepkit/orm';

import { appModule } from '../src/app.module.js';

test('the standalone migration app disconnects its databases on shutdown', async () => {
    const app = App.fromModule(appModule);
    const database = new Database(new MemoryDatabaseAdapter());
    let disconnected = false;
    database.disconnect = () => {
        disconnected = true;
    };
    app.get(DatabaseRegistry).addDatabaseInstance(database);

    await app.execute(['migration:pending', '--migrationDir', 'nonexistent-migrations']);
    expect(disconnected).toBe(true);
});
