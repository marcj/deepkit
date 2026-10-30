/*
 * Deepkit Framework
 * Copyright (C) 2021 Deepkit UG, Marc J. Schmidt
 *
 * This program is free software: you can redistribute it and/or modify
 * it under the terms of the MIT License.
 *
 * You should have received a copy of the MIT License along with this program.
 */

import {
    DatabaseAdapter,
    DatabaseAdapterQueryFactory,
    DatabaseEntityRegistry,
    DatabaseErrorEvent,
    DatabaseSession,
    FindQuery,
    ItemNotFound,
    MigrateOptions,
    onDatabaseError,
    OrmEntity,
    RawFactory,
} from '@deepkit/orm';
import { AbstractClassType, ClassType, formatError, isArray } from '@deepkit/core';
import { MongoDatabaseQuery } from './query.js';
import { MongoPersistence } from './persistence.js';
import { MongoClient } from './client/client.js';
import { DeleteCommand } from './client/command/delete.js';
import { MongoQueryResolver } from './query.resolver.js';
import { MongoDatabaseTransaction, MongoDatabaseTransactionMonitor } from './client/connection.js';
import { CreateIndex, CreateIndexesCommand } from './client/command/createIndexes.js';
import { DropIndexesCommand } from './client/command/dropIndexes.js';
import { CreateCollectionCommand } from './client/command/createCollection.js';
import { entity, ReceiveType, ReflectionClass, resolveReceiveType } from '@deepkit/type';
import { Command } from './client/command/command.js';
import { AggregateCommand } from './client/command/aggregate.js';
import { EventDispatcher } from '@deepkit/event';
import { Logger } from '@deepkit/logger';
import { CommandOptions } from './client/options.js';
import { ExplainCommand } from './client/command/explain.js';
import { FindCommand } from './client/command/find.js';

export type MongoExplainVerbosity = 'queryPlanner' | 'executionStats' | 'allPlansExecution';

export class MongoDatabaseQueryFactory extends DatabaseAdapterQueryFactory {
    constructor(
        private client: MongoClient,
        private databaseSession: DatabaseSession<any>,
    ) {
        super();
    }

    createQuery<T extends OrmEntity>(type?: ReceiveType<T> | ClassType<T> | AbstractClassType<T> | ReflectionClass<T>): MongoDatabaseQuery<T> {
        const schema = ReflectionClass.from(type);
        return new MongoDatabaseQuery(schema, this.databaseSession, new MongoQueryResolver(schema, this.databaseSession, this.client));
    }
}

class MongoRawCommandQuery<T> implements FindQuery<T> {
    constructor(
        protected session: DatabaseSession<MongoDatabaseAdapter>,
        protected client: MongoClient,
        protected command: Command<any>,
    ) {
    }

    /**
     * Sets Mongo specific options for this query like `collation`, `hint`, `readPreference`, `allowDiskUse` and more.
     */
    withOptions(options: CommandOptions): this {
        Object.assign(this.command.options, options);
        return this;
    }

    async explain(verbosity: MongoExplainVerbosity = 'allPlansExecution') {
        if (!(this.command instanceof AggregateCommand) && !(this.command instanceof FindCommand)) {
            throw new Error('Explain is only supported for AggregateCommand and FindCommand. Use ExplainCommand to explain other commands.');
        }
        const command = new ExplainCommand(this.command, verbosity);
        return await this.client.execute(command, this.command.options, this.session.assignedTransaction);
    }

    async find(): Promise<T[]> {
        try {
            const res = await this.client.execute(this.command);
            return res as any;
        } catch (error: any) {
            await this.session.eventDispatcher.dispatch(onDatabaseError, new DatabaseErrorEvent(error, this.session));
            throw error;
        }
    }

    async findOneOrUndefined(): Promise<T | undefined> {
        try {
            const res = await this.client.execute(this.command);
            if (isArray(res)) return res[0];
            return res;
        } catch (error: any) {
            await this.session.eventDispatcher.dispatch(onDatabaseError, new DatabaseErrorEvent(error, this.session));
            throw error;
        }
    }

    async findOne(): Promise<T> {
        try {
            const item = await this.findOneOrUndefined();
            if (!item) throw new ItemNotFound('Could not find item');
            return item;
        } catch (error: any) {
            await this.session.eventDispatcher.dispatch(onDatabaseError, new DatabaseErrorEvent(error, this.session));
            throw error;
        }
    }
}

export class MongoRawFactory implements RawFactory<[Command<any>]> {
    constructor(
        protected session: DatabaseSession<MongoDatabaseAdapter>,
        protected client: MongoClient,
    ) {
    }

    create<Entity = any, ResultSchema = Entity>(
        commandOrPipeline: Command<ResultSchema> | any[],
        type?: ReceiveType<Entity>,
        resultType?: ReceiveType<ResultSchema>,
    ): MongoRawCommandQuery<ResultSchema> {
        type = resolveReceiveType(type);
        const resultSchema = resultType ? resolveReceiveType(resultType) : undefined;

        const command = isArray(commandOrPipeline) ? new AggregateCommand(ReflectionClass.from(type), commandOrPipeline, resultSchema) : commandOrPipeline;
        return new MongoRawCommandQuery<ResultSchema>(this.session, this.client, command as Command<any>);
    }
}

export class MongoDatabaseAdapter extends DatabaseAdapter {
    public readonly client: MongoClient;

    protected ormSequences: ReflectionClass<any>;
    transactionMonitor: MongoDatabaseTransactionMonitor;

    constructor(
        connection: string | MongoClient,
    ) {
        super();
        this.client = connection instanceof MongoClient ? connection : new MongoClient(connection, this.eventDispatcher, this.logger);
        this.transactionMonitor = new MongoDatabaseTransactionMonitor(this.logger);

        @entity.name(this.getAutoIncrementSequencesCollection())
        class OrmSequence {
            name!: string;
            value!: number;
        }

        this.ormSequences = ReflectionClass.from(OrmSequence);
    }

    setEventDispatcher(eventDispatcher: EventDispatcher) {
        super.setEventDispatcher(eventDispatcher);
        this.client.setEventDispatcher(eventDispatcher);
    }

    setLogger(logger: Logger) {
        super.setLogger(logger);
        this.client.setLogger(logger);
        this.transactionMonitor.setLogger(logger);
    }

    rawFactory(session: DatabaseSession<this>): MongoRawFactory {
        return new MongoRawFactory(session, this.client);
    }

    getName(): string {
        return 'mongo';
    }

    getSchemaName(): string {
        return '';
    }

    createPersistence(session: DatabaseSession<this>): MongoPersistence {
        return new MongoPersistence(this.client, this.ormSequences, session);
    }

    createTransaction(session: DatabaseSession<this>): MongoDatabaseTransaction {
        return new MongoDatabaseTransaction(this.transactionMonitor);
    }

    isNativeForeignKeyConstraintSupported() {
        return false;
    }

    queryFactory(databaseSession: DatabaseSession<any>): MongoDatabaseQueryFactory {
        return new MongoDatabaseQueryFactory(this.client, databaseSession);
    }

    disconnect(force?: boolean): void {
        this.client.close();
    }

    getAutoIncrementSequencesCollection(): string {
        return 'orm_sequences';
    }

    async resetAutoIncrementSequences() {
        await this.client.execute(new DeleteCommand(this.ormSequences));
    }

    async migrate(options: MigrateOptions, entityRegistry: DatabaseEntityRegistry) {
        await this.client.connect(); //manually connect to catch connection errors
        let withOrmSequences = true;
        for (const schema of entityRegistry.forMigration()) {
            await this.migrateClassSchema(options, schema);
            for (const property of schema.getProperties()) {
                if (property.isAutoIncrement()) withOrmSequences = true;
            }
        }

        if (withOrmSequences) {
            await this.migrateClassSchema(options, this.ormSequences);
        }
    };

    async migrateClassSchema(options: MigrateOptions, schema: ReflectionClass<any>) {
        try {
            await this.client.execute(new CreateCollectionCommand(schema));
        } catch (error) {
            //it's fine to fail
        }

        for (const index of schema.indexes) {
            const fields: { [name: string]: 1 } = {};

            if (index.names.length === 1 && index.names[0] === '_id') continue;

            //todo: namingStrategy
            for (const f of index.names) {
                fields[f] = 1;
            }

            const indexName = index.options.name || index.names.join('_');
            const createIndex: CreateIndex = {
                name: indexName,
                key: fields,
                unique: !!index.options.unique,
                sparse: !!index.options.sparse,
            };
            if (index.options.expireAfterSeconds) {
                createIndex.expireAfterSeconds = Number(index.options.expireAfterSeconds);
            }

            try {
                await this.client.execute(new CreateIndexesCommand(schema, [createIndex]));
            } catch (error) {
                this.logger.warn(
                    `Failed to create index "${indexName}" on collection "${schema.getCollectionName()}", recreating it.`,
                    { fields, unique: createIndex.unique, sparse: createIndex.sparse, expireAfterSeconds: createIndex.expireAfterSeconds },
                    formatError(error),
                );
                //failed (because perhaps of incompatibilities). Dropping and creating a fresh index
                //can resolve that. If the second create also fails, then it throws.
                try {
                    await this.client.execute(new DropIndexesCommand(schema, [indexName]));
                } catch (error) {
                }

                await this.client.execute(new CreateIndexesCommand(schema, [createIndex]));
            }
        }
    }
}
