import { expect, test } from '@jest/globals';
import { join, relative } from 'path';

import { InjectorContext } from '@deepkit/injector';
import { DatabaseRegistry } from '@deepkit/orm';

import { MigrationProvider } from '../src/migration/migration-provider.js';

class InspectableMigrationProvider extends MigrationProvider {
    listMigrationFiles(migrationDir: string) {
        return this.findMigrationFiles(migrationDir);
    }
}

const provider = new InspectableMigrationProvider(new DatabaseRegistry(InjectorContext.forProviders([])));
const migrationDir = join(__dirname, 'fixtures/migrations');

test('migration files include compiled JavaScript, skip declaration files and prefer the TypeScript source', async () => {
    expect(await provider.listMigrationFiles(migrationDir)).toEqual(['20250101-0000.ts', '20250102-0000.js']);
});

test('compiled JavaScript migrations are loaded with the name of their file', async () => {
    const migrations = await provider.getMigrations(migrationDir);
    expect(migrations.map(v => [v.name, v.version])).toEqual([
        ['20250101-0000', 1735689600],
        ['20250102-0000', 1735776000],
    ]);
    expect(migrations[0].up()).toEqual(['CREATE TABLE "source" ("id" integer PRIMARY KEY)']);
});

test('migrations are loaded from a relative and an absolute directory', async () => {
    expect(await provider.getMigrations(relative(process.cwd(), migrationDir))).toHaveLength(2);
    expect(await provider.getMigrations(migrationDir)).toHaveLength(2);
});
