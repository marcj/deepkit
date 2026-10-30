import { expect, test } from '@jest/globals';
import { spawnSync } from 'child_process';
import { mkdtempSync, readdirSync, readFileSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';

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
