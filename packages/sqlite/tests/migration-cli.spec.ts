import { afterEach, expect, test } from '@jest/globals';
import { spawnSync } from 'child_process';
import { mkdtempSync, readFileSync, readdirSync, rmSync } from 'fs';
import { tmpdir } from 'os';
import { join, relative } from 'path';

import { Logger } from '@deepkit/logger';
import { Database, DatabaseRegistry } from '@deepkit/orm';
import { SqlMigrationHandler, sql } from '@deepkit/sql';
import { MigrationDownCommand, MigrationProvider, MigrationUpCommand } from '@deepkit/sql/commands';

import { SQLiteDatabaseAdapter } from '../src/sqlite-adapter.js';

// `deepkit-sql` (standalone, without FrameworkModule) reads the databases from the files given with --path.
const cli = join(__dirname, '../../sql/bin/deepkit-sql.js');
const fixtures = join(__dirname, 'fixtures/migration');

function migrationCreate(...args: string[]) {
    const migrationDir = mkdtempSync(join(tmpdir(), 'dk-migrations-'));
    const result = spawnSync(process.execPath, [cli, 'migration:create', '--migrationDir', migrationDir, ...args], { cwd: fixtures, encoding: 'utf8' });
    const files = readdirSync(migrationDir);
    return { output: result.stdout + result.stderr, files, read: () => readFileSync(join(migrationDir, files[0]), 'utf8') };
}

test('migration:create --path loads the database from a JavaScript file', () => {
    const { output, files } = migrationCreate('--path', 'database.js', '--empty');
    expect(output).not.toContain('No databases detected');
    expect(files).toHaveLength(1);
});

test('migration:create --path loads a TypeScript file with entities', () => {
    const { output, files, read } = migrationCreate('--path', 'database.ts');
    expect(output).not.toContain('No databases detected');
    expect(files).toHaveLength(1);
    expect(read()).toContain('CREATE TABLE "MigrationUser"');
}, 30_000);

test('migration:create --path reports a file that exports no database', () => {
    const { output, files } = migrationCreate('--path', 'migration-cli-nothing.js');
    expect(output).toContain('migration-cli-nothing.js');
    expect(files).toHaveLength(0);
});

async function expectFixtureMigrationsApplied(database: Database) {
    expect(await new SqlMigrationHandler(database).getLatestMigrationVersion()).toBe(1735776000);
    const tables = await database.raw<{ name: string }>(sql`SELECT name FROM sqlite_master WHERE type = 'table'`).find();
    expect(tables.map(v => v.name)).toEqual(expect.arrayContaining(['first', 'second']));
}

const temporaryDirectories: string[] = [];

afterEach(() => {
    for (const directory of temporaryDirectories.splice(0)) rmSync(directory, { recursive: true, force: true });
});

function temporaryDatabasePath() {
    const directory = mkdtempSync(join(tmpdir(), 'dk-migrations-'));
    temporaryDirectories.push(directory);
    return join(directory, 'database.sqlite');
}

test('migration:up --all executes all pending migrations', async () => {
    const path = temporaryDatabasePath();
    const result = spawnSync(process.execPath, [cli, 'migration:up', '--all', '--path', 'database.js', '--migrationDir', 'migrations-up'], {
        cwd: fixtures,
        encoding: 'utf8',
        env: { ...process.env, MIGRATION_DATABASE_PATH: path },
    });
    expect(result.stdout + result.stderr).toContain('All migrations executed');
    expect(result.status).toBe(0);

    const database = new Database(new SQLiteDatabaseAdapter(path));
    try {
        await expectFixtureMigrationsApplied(database);
    } finally {
        database.disconnect();
    }
}, 30_000);

function migrationProvider(...databases: Database[]) {
    const registry = new DatabaseRegistry({} as never);
    for (const database of databases) registry.addDatabaseInstance(database);
    const provider = new MigrationProvider(registry);
    provider.setMigrationDir(relative(process.cwd(), join(fixtures, 'migrations-up')));
    return provider;
}

function otherDatabase(path: string) {
    const database = new Database(new SQLiteDatabaseAdapter(`${path}-other`));
    database.name = 'other';
    return database;
}

test('MigrationUpCommand keeps the database connected for later queries', async () => {
    const path = temporaryDatabasePath();
    const database = new Database(new SQLiteDatabaseAdapter(path));
    const provider = migrationProvider(database);

    try {
        await new MigrationUpCommand(new Logger(), provider).execute(undefined, false, true);
        await expectFixtureMigrationsApplied(database);
    } finally {
        database.disconnect();
    }
});

test('migration:up continues with the next database when one is up to date', async () => {
    const path = temporaryDatabasePath();
    const database = new Database(new SQLiteDatabaseAdapter(path));
    const other = otherDatabase(path);
    const command = new MigrationUpCommand(new Logger(), migrationProvider(database, other));

    try {
        await command.execute('default', false, true);
        await command.execute(undefined, false, true);
        expect(await new SqlMigrationHandler(other).getLatestMigrationVersion()).toBe(1735862400);
    } finally {
        database.disconnect();
        other.disconnect();
    }
});

test('migration:down continues with the next database when one has nothing to revert', async () => {
    const path = temporaryDatabasePath();
    const database = new Database(new SQLiteDatabaseAdapter(path));
    const other = otherDatabase(path);
    const provider = migrationProvider(database, other);

    try {
        await new MigrationUpCommand(new Logger(), provider).execute('other');
        await new MigrationDownCommand(new Logger(), provider).execute();
        expect(await new SqlMigrationHandler(other).getLatestMigrationVersion()).toBe(0);
    } finally {
        database.disconnect();
        other.disconnect();
    }
});
