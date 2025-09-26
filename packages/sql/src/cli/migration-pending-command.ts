/*
 * Deepkit Framework
 * Copyright (C) 2021 Deepkit UG, Marc J. Schmidt
 *
 * This program is free software: you can redistribute it and/or modify
 * it under the terms of the MIT License.
 *
 * You should have received a copy of the MIT License along with this program.
 */

import { cli, Flag } from '@deepkit/app';
import { empty } from '@deepkit/core';
import { LoggerInterface } from '@deepkit/logger';
import { MigrationProvider } from '../migration/migration-provider.js';
import { SqlMigrationHandler } from '../sql-adapter.js';
import { BaseCommand } from './base-command.js';

/**
 * @description Shows pending migration files.
 */
@cli.controller('migration:pending')
export class MigrationPendingCommand extends BaseCommand {
    constructor(
        protected logger: LoggerInterface,
        protected provider: MigrationProvider,
    ) {
        super();
    }

    async execute(
        /**
         * @description Show SQL commands.
         */
        verbose: boolean & Flag = false,
        /**
         * @description Limit migrations to a specific database.
         */
        database?: string & Flag<{ char: 'db' }>,
    ): Promise<void> {
        if (this.migrationDir) this.provider.setMigrationDir(this.migrationDir);
        if (this.path) await this.provider.addDatabase(this.path);

        const migrationsPerDatabase = await this.provider.getMigrationsPerDatabase(database);

        if (empty(migrationsPerDatabase)) this.logger.log(`No migrations in ${this.provider.getMigrationDir()} found.`);

        for (const [database, migrations] of migrationsPerDatabase.entries()) {
            const migrationHandler = new SqlMigrationHandler(database);
            const latestVersion = await migrationHandler.getLatestMigrationVersion();
            const migrationsToApply = migrations.filter(v => v.version > latestVersion);
            if (migrationsToApply.length) {
                this.logger.log(`Database <green>${database.name}</green>: Pending migrations`);
                let i = 1;
                for (const migration of migrationsToApply) {
                    this.logger.log(` <yellow>${i++}. ${migration.name}</yellow> version=${migration.version} <yellow>${migration.up().length} UP</yellow> statements`);
                    if (verbose) {
                        let i = 1;
                        for (const sql of migration.up()) {
                            this.logger.log('   ' + i++ + '.' + (' '.repeat(8)) + sql);
                        }
                    }
                }
            } else {
                this.logger.log(`Database <green>${database.name}</green>: No pending migrations. Everything is up to date.`);
            }
        }
    }
}
