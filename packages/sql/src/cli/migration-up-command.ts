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
import { Migration } from '../migration/migration.js';
import { Database } from '@deepkit/orm';

/**
 * @description Executes pending migration files. Use migration:pending to see which are pending.
 */
@cli.controller('migration:up')
export class MigrationUpCommand extends BaseCommand {
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
        /**
         * @description Per default only the next migration is executed. With this flag all pending migrations are executed.
         */
        all: boolean & Flag = false,
    ): Promise<void> {
        if (this.migrationDir) this.provider.setMigrationDir(this.migrationDir);
        if (this.path) await this.provider.addDatabase(this.path);

        const migrationsPerDatabase = await this.provider.getMigrationsPerDatabase(database);

        for (const [database, migrations] of migrationsPerDatabase.entries()) {
            this.logger.log(`Execute migrations for <yellow>${database.name}</yellow>`);

            if (database.adapter instanceof SQLDatabaseAdapter) {
                const migrationHandler = new SqlMigrationHandler(database);
                const latestVersion = await migrationHandler.getLatestMigrationVersion();
                const migrationToApply = migrations.filter(v => v.version > latestVersion);

                if (!migrationToApply.length) {
                    this.logger.log('<green>All migrations executed</green>');
                    return;
                }

                if (all) {
                    while (migrationToApply.length) {
                        await this.executeNextMigration(database, migrationHandler, fake, migrationToApply);
                    }
                } else {
                    await this.executeNextMigration(database, migrationHandler, fake, migrationToApply);
                }

                if (migrationToApply.length) {
                    this.logger.log(`<yellow>${migrationToApply.length} migration/s left. Run migration:up again to execute the next migration.</yellow>`);
                } else {
                    this.logger.log('<green>All migrations executed</green>');
                }
            }
        }
    }

    async executeNextMigration(database: Database<SQLDatabaseAdapter>, migrationHandler: SqlMigrationHandler, fake: boolean, migrationToApply: Migration[]) {
        try {
            const migration = migrationToApply.shift();
            if (!migration) return;

            const connection = await database.adapter.connectionPool.getConnection();
            try {
                this.logger.log(`    Migration up <yellow>${migration.name}</yellow>`);
                if (fake) {
                    this.logger.log(`       Faking migration.`);
                } else {
                    let i = 1;
                    for (const sql of migration.up()) {
                        this.logger.log(`<yellow>    ${i++}. ${indent(4)(sql)}</yellow>`);
                        await connection.run(sql);
                    }
                }
                await migrationHandler.setLatestMigrationVersion(migration.version);
                this.logger.log(`<green>Successfully migrated up to version ${migration.version}</green>`);
            } finally {
                connection.release();
            }
        } finally {
            database.disconnect();
        }
    }
}
