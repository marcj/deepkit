import { expect, test } from '@jest/globals';

import { InjectorContext } from '@deepkit/injector';

import { Database } from '../src/database.js';
import { MemoryDatabaseAdapter } from '../src/memory-db.js';

class AppDatabase extends Database {
    constructor() {
        super(new MemoryDatabaseAdapter(), []);
    }
}

class DatabaseService {
    constructor(public db: Database) {}
}

test('a Database subclass provider answers for Database', () => {
    const injector = InjectorContext.forProviders([AppDatabase, DatabaseService]);
    expect(injector.get(DatabaseService).db).toBeInstanceOf(AppDatabase);
});
