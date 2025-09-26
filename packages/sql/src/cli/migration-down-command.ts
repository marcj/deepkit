/*
 * Deepkit Framework
 * Copyright (C) 2021 Deepkit UG, Marc J. Schmidt
 *
 * This program is free software: you can redistribute it and/or modify
 * it under the terms of the MIT License.
 *
 * You should have received a copy of the MIT License along with this program.
 */

import { indent } from '@deepkit/core';
import { cli, Flag } from '@deepkit/app';
import { LoggerInterface } from '@deepkit/logger';
import { MigrationProvider } from '../migration/migration-provider.js';
import { SQLDatabaseAdapter, SqlMigrationHandler } from '../sql-adapter.js';
import { BaseCommand } from './base-command.js';

/**
 * @description Executes down migration, reverting old migration files.
 */
@cli.controller('migration:down')
export class MigrationDownCommand extends BaseCommand {
    constructor(
        protected logger: LoggerInterface,
        protected provider: MigrationProvider,
    ) {
        super();
    }

    async execute(
        /**
         * @description Limit migrations to a specific database.
         */
        database?: string & Flag,
        /**
         * @description Sets the migration version without executing actual SQL commands.
         */
        fake: boolean & Flag = false,
    ): Promise<void> {
        if (this.migrationDir) this.provider.setMigrationDir(this.migrationDir);
        if (this.path) await this.provider.addDatabase(this.path);

        const migrationsPerDatabase = await this.provider.getMigrationsPerDatabase(database);

        for (const [database, migrations] of migrationsPerDatabase.entries()) {
            this.logger.log(`Execute migrations for <yellow>${database.name}</yellow>`);

            if (database.adapter instanceof SQLDatabaseAdapter) {
                const migrationHandler = new SqlMigrationHandler(database);

                try {
                    const latestVersion = await migrationHandler.getLatestMigrationVersion();
                    const migration = migrations.find(v => v.version === latestVersion);
                    if (!migration) {
                        this.logger.log('<red>No migration found to execute</red>');
                        return;
                    }

                    const connection = await database.adapter.connectionPool.getConnection();
                    try {
                        this.logger.log(`    Migration down <yellow>${migration.name}</yellow>`);
                        if (fake) {
                            this.logger.log(`       Faking migration.`);
                        } else {
                            let i = 1;
                            for (const sql of migration.down()) {
                                this.logger.log(`<yellow>    ${i++}. ${indent(4)(sql)}</yellow>`);
                                await connection.run(sql);
                            }
                        }
                        await migrationHandler.removeMigrationVersion(migration.version);
                        this.logger.log(`<green>Successfully migrated down to version ${migration.version}</green>`);
                    } finally {
                        connection.release();
                    }
                } finally {
                    database.disconnect();
                }
            }
        }
    }
}
