/*
 * Deepkit Framework
 * Copyright (C) 2021 Deepkit UG, Marc J. Schmidt
 *
 * This program is free software: you can redistribute it and/or modify
 * it under the terms of the MIT License.
 *
 * You should have received a copy of the MIT License along with this program.
 */

import { ClassType, getClassName } from '@deepkit/core';
import { Database, DatabaseError, DatabaseRegistry } from '@deepkit/orm';
import glob from 'fast-glob';
import { createRequire } from 'module';
import { basename, isAbsolute, join } from 'path';
import { Migration } from './migration.js';

export class MigrationProvider {
    protected databaseMap = new Map<string, Database<any>>();
    protected migrationDir: string = 'migrations/';

    constructor(
        public databases: DatabaseRegistry,
    ) {
    }

    getMigrationDir(): string {
        return this.migrationDir;
    }

    setMigrationDir(dir: string) {
        this.migrationDir = dir;
    }

    /**
     * Registers the Database instances exported by the given files (e.g. `export const database = new Database(...)`),
     * for using the migration commands without the FrameworkModule (deepkit-sql --path database.ts).
     *
     * TypeScript files are loaded with ts-node (registered if it is not already), so that entities get runtime types.
     */
    addDatabasesFromFiles(paths: string[]): void {
        // createRequire works in the CommonJS and the ESM build
        const load = createRequire(join(process.cwd(), 'noop.js'));

        // Node's own TypeScript support only strips types, entities need the type compiler (via ts-node)
        const tsNodeRegistered = !!(process as any)[Symbol.for('ts-node.register.instance')];
        if (paths.some(v => /\.[cm]?tsx?$/.test(v)) && !tsNodeRegistered) {
            let tsNode: any;
            try {
                tsNode = load('ts-node');
            } catch {
                throw new DatabaseError(`Loading TypeScript files (${paths.join(', ')}) requires ts-node. Install it or run deepkit-sql with a TypeScript loader.`);
            }
            // the files are loaded synchronously as CommonJS
            tsNode.register({ compilerOptions: { module: 'commonjs', moduleResolution: 'node', experimentalDecorators: true } });
        }

        for (const path of paths) {
            const file = isAbsolute(path) ? path : join(process.cwd(), path);
            const exports = load(file);
            const values: any[] = exports && typeof exports === 'object' ? Object.values(exports) : [];
            const databases = values.filter((v): v is Database => v instanceof Database);
            if (!databases.length) {
                const classes = values.filter(v => typeof v === 'function' && v.prototype instanceof Database);
                throw new DatabaseError(classes.length
                    ? `${path} exports the Database class ${getClassName(classes[0])}, but not an instance of it. Export one, e.g. export const database = new ${getClassName(classes[0])}();`
                    : `${path} exports no Database instance. Export one, e.g. export const database = new Database(adapter, [entities]);`);
            }
            for (const database of databases) this.databases.addDatabaseInstance(database);
        }
    }

    async getMigrationsPerDatabase(limitDatabase?: string) {
        const migrationsPerDatabase = new Map<Database<any>, Migration[]>();

        for (const migration of await this.getMigrations(this.migrationDir)) {
            const database = this.databases.getDatabaseByName(migration.databaseName);
            if (!database) continue;
            if (limitDatabase && database.name !== limitDatabase) continue;

            let dbMigrations = migrationsPerDatabase.get(database);
            if (!dbMigrations) {
                dbMigrations = [];
                migrationsPerDatabase.set(database, dbMigrations);
            }

            dbMigrations.push(migration);
        }

        return migrationsPerDatabase;
    }

    async getMigrations(migrationDir: string): Promise<Migration[]> {
        let migrations: Migration[] = [];

        const files = await glob('**/*.ts', { cwd: migrationDir });

        for (const file of files) {
            const path = join(process.cwd(), migrationDir, file);
            const name = basename(file.replace('.ts', ''));
            const migration = await import(path);
            if (migration && migration.SchemaMigration) {
                const jo = new class extends (migration.SchemaMigration as ClassType<Migration>) {
                    constructor() {
                        super();
                        if (!this.name) this.name = name;
                    }
                };
                migrations.push(jo);
            }
        }

        migrations.sort((a, b) => {
            if (a.version > b.version) return +1;
            if (a.version < b.version) return -1;
            return 0;
        });

        return migrations;
    }
}
