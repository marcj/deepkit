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
    asAliasName,
    DefaultPlatform,
    getDeepTypeCaster,
    getPreparedEntity,
    LruCache,
    maxPreparedStatementLength,
    prepareBatchUpdate,
    PreparedEntity,
    splitDotPath,
    SqlBuilder,
    SQLConnection,
    SQLConnectionPool,
    SQLDatabaseAdapter,
    SQLDatabaseQuery,
    SQLDatabaseQueryFactory,
    SQLPersistence,
    SQLQueryModel,
    SQLQueryResolver,
    SQLStatement,
} from '@deepkit/sql';
import {
    DatabaseDeleteError,
    DatabaseError,
    DatabasePatchError,
    DatabasePersistenceChangeSet,
    DatabaseSession,
    DatabaseTransaction,
    DatabaseUpdateError,
    DeleteResult,
    ensureDatabaseError,
    OrmEntity,
    PatchResult,
    primaryKeyObjectConverter,
    UniqueConstraintFailure,
} from '@deepkit/orm';
import { PostgresPlatform } from './postgres-platform.js';
import type { Pool, PoolClient, PoolConfig } from 'pg';
import pg from 'pg';
import { AbstractClassType, asyncOperation, ClassType, empty } from '@deepkit/core';
import { FrameCategory, Stopwatch } from '@deepkit/stopwatch';
import {
    Changes,
    getPatchSerializeFunction,
    getSerializeFunction,
    ReceiveType,
    ReflectionClass,
    ReflectionKind,
    ReflectionProperty,
    resolvePath,
} from '@deepkit/type';
import { parseConnectionString } from './config.js';
import { Logger } from '@deepkit/logger';

/**
 * Converts a specific database error to a more specific error, if possible.
 */
function handleSpecificError(session: DatabaseSession, error: DatabaseError): Error {
    let cause: any = error;
    while (cause) {
        if (cause instanceof Error) {
            if (cause.message.includes('duplicate key value')
                && 'table' in cause && 'string' === typeof cause.table
                && 'detail' in cause && 'string' === typeof cause.detail
            ) {
                return new UniqueConstraintFailure(`${cause.message}: ${cause.detail}`, { cause: error });
            }
            cause = cause.cause;
        }
    }

    return error;
}

const scope = 'deepkit:orm:postgres';

/** A statement the server keeps under a name. */
interface PostgresReusableStatement {
    name: string;

    /** Removes it, so the next query prepares it again. */
    forget(): void;
}

/** The server dropped the statement, or the result of its plan changed because a table changed. */
function isStaleStatementError(error: any): boolean {
    return error.code === '26000' || (error.code === '0A000' && String(error.message).includes('cached plan'));
}

export class PostgresStatement extends SQLStatement {
    protected released = false;

    constructor(
        protected logger: Logger,
        protected sql: string,
        protected client: PoolClient,
        protected stopwatch?: Stopwatch,
        protected reusable?: PostgresReusableStatement,
        protected inTransaction: boolean = false,
    ) {
        super();
    }

    protected query(params: any[]): Promise<any> {
        //postgres driver does not maintain error.stack when they throw errors, so
        //we have to manually convert it using asyncOperation.
        return asyncOperation<any>((resolve, reject) => {
            const result = this.reusable
                ? this.client.query({ name: this.reusable.name, text: this.sql, values: params })
                : this.client.query(this.sql, params);
            result.then(resolve).catch(reject);
        });
    }

    protected async execute(params: any[]): Promise<any> {
        if (!this.reusable) return this.query(params);

        try {
            return await this.query(params);
        } catch (error: any) {
            if (!isStaleStatementError(error)) throw error;
            this.reusable.forget();
            this.reusable = undefined;
            //in a transaction this error already aborted it
            if (this.inTransaction) throw error;
            return await this.query(params);
        }
    }

    async get(params: any[] = []) {
        const frame = this.stopwatch ? this.stopwatch.start('Query', FrameCategory.databaseQuery) : undefined;
        try {
            if (frame) frame.data({ sql: this.sql, sqlParams: params });
            this.logger.scoped(scope).debug(this.sql, params);
            const res = await this.execute(params);
            return res.rows[0];
        } catch (error: any) {
            error = ensureDatabaseError(error);
            this.logger.scoped(scope).debug(error, this.sql, params);
            throw error;
        } finally {
            if (frame) frame.end();
        }
    }

    async all(params: any[] = []) {
        const frame = this.stopwatch ? this.stopwatch.start('Query', FrameCategory.databaseQuery) : undefined;
        try {
            if (frame) frame.data({ sql: this.sql, sqlParams: params });
            this.logger.scoped(scope).debug(this.sql, params);
            const res = await this.execute(params);
            return res.rows;
        } catch (error: any) {
            error = ensureDatabaseError(error);
            this.logger.scoped(scope).debug(error, this.sql, params);
            throw error;
        } finally {
            if (frame) frame.end();
        }
    }

    release() {
    }
}

export class PostgresConnection extends SQLConnection {
    protected changes: number = 0;
    public lastReturningRows: any[] = [];

    constructor(
        connectionPool: PostgresConnectionPool,
        public connection: PoolClient,
        logger: Logger,
        transaction?: DatabaseTransaction,
        stopwatch?: Stopwatch,
    ) {
        super(connectionPool, logger, transaction, stopwatch);
    }

    async prepare(sql: string) {
        return new PostgresStatement(this.logger, sql, this.connection, this.stopwatch);
    }

    protected override async prepareReusable(sql: string, params?: any[]): Promise<PostgresStatement> {
        //without parameters the driver uses the simple protocol, which can run several statements at once
        if (!params || !params.length) return this.prepare(sql);
        const reusable = (this.connectionPool as PostgresConnectionPool).getReusableStatement(this.connection, sql);
        return new PostgresStatement(this.logger, sql, this.connection, this.stopwatch, reusable, !!this.transaction);
    }

    async run(sql: string, params: any[] = []) {
        const frame = this.stopwatch ? this.stopwatch.start('Query', FrameCategory.databaseQuery) : undefined;
        try {
            if (frame) frame.data({ sql, sqlParams: params });
            //postgres driver does not maintain error.stack when they throw errors, so
            //we have to manually convert it using asyncOperation.
            const res = await asyncOperation<any>((resolve, reject) => {
                this.connection.query(sql, params).then(resolve).catch(reject);
            });
            this.logger.scoped('deepkit:orm:postgres').debug(sql, params);
            this.lastReturningRows = res.rows;
            this.changes = res.rowCount;
        } catch (error: any) {
            error = ensureDatabaseError(error);
            this.logger.scoped('deepkit:orm:postgres').debug(error, sql, params);
            throw error;
        } finally {
            if (frame) frame.end();
        }
    }

    async getChanges(): Promise<number> {
        return this.changes;
    }
}

export type TransactionTypes = 'REPEATABLE READ' | 'READ COMMITTED' | 'SERIALIZABLE';

export class PostgresDatabaseTransaction extends DatabaseTransaction {
    connection?: PostgresConnection;

    setTransaction?: TransactionTypes;

    /**
     * This is the default for mysql databases.
     */
    repeatableRead(): this {
        this.setTransaction = 'REPEATABLE READ';
        return this;
    }

    readCommitted(): this {
        this.setTransaction = 'READ COMMITTED';
        return this;
    }

    serializable(): this {
        this.setTransaction = 'SERIALIZABLE';
        return this;
    }

    async begin() {
        if (!this.connection) return;
        const set = this.setTransaction ? 'SET TRANSACTION ISOLATION LEVEL ' + this.setTransaction + ';' : '';
        await this.connection.run(set + 'START TRANSACTION');
    }

    async commit() {
        if (!this.connection) return;
        if (this.ended) throw new Error('Transaction ended already');

        await this.connection.run('COMMIT');
        this.ended = true;
        this.connection.release();
    }

    async rollback() {
        if (!this.connection) return;

        if (this.ended) throw new Error('Transaction ended already');
        await this.connection.run('ROLLBACK');
        this.ended = true;
        this.connection.release();
    }
}

export class PostgresConnectionPool extends SQLConnectionPool {
    protected statements = new WeakMap<PoolClient, LruCache<PostgresReusableStatement>>();
    protected statementId = 0;

    constructor(
        protected pool: Pool,
        protected logger: Logger,
        protected stopwatch?: Stopwatch,
    ) {
        super(logger);
    }

    protected removeStatement(client: PoolClient, name: string): void {
        delete (client as any).connection.parsedStatements[name];
        //fails when the server has no such statement, or the transaction is aborted. Then there is nothing to do
        client.query(`DEALLOCATE "${name}"`).catch(() => undefined);
    }

    getReusableStatement(client: PoolClient, sql: string): PostgresReusableStatement | undefined {
        if (!this.maxPreparedStatements || sql.length > maxPreparedStatementLength) return undefined;

        let statements = this.statements.get(client);
        if (!statements) {
            statements = new LruCache(this.maxPreparedStatements, (key, statement) => this.removeStatement(client, statement.name));
            this.statements.set(client, statements);
        }

        let statement = statements.get(sql);
        if (!statement) {
            const name = 'deepkit_' + ++this.statementId;
            statement = {
                name,
                forget: () => {
                    statements.delete(sql);
                    this.removeStatement(client, name);
                },
            };
            statements.set(sql, statement);
        }
        return statement;
    }

    async getConnection(transaction?: PostgresDatabaseTransaction): Promise<PostgresConnection> {
        //when a transaction object is given, it means we make the connection sticky exclusively to that transaction
        //and only release the connection when the transaction is commit/rollback is executed.

        if (transaction && transaction.connection) return transaction.connection;

        const poolClient = await this.pool.connect();
        this.activeConnections++;
        const connection = new PostgresConnection(this, poolClient, this.logger, transaction, this.stopwatch);
        if (transaction) {
            transaction.connection = connection;
            try {
                await transaction.begin();
            } catch (error) {
                transaction.ended = true;
                connection.release();
                throw new Error('Could not start transaction: ' + error);
            }
        }
        return connection;
    }

    release(connection: PostgresConnection) {
        //connections attached to a transaction are not automatically released.
        //only with commit/rollback actions
        if (connection.transaction && !connection.transaction.ended) return;

        super.release(connection);
        connection.connection.release();
    }
}

function typeSafeDefaultValue(property: ReflectionProperty): any {
    if (property.type.kind === ReflectionKind.string) return '';
    if (property.type.kind === ReflectionKind.number) return 0;
    if (property.type.kind === ReflectionKind.boolean) return false;
    if (property.type.kind === ReflectionKind.class && property.type.classType === Date) return false;

    return null;
}

export class PostgresPersistence extends SQLPersistence {
    constructor(protected platform: DefaultPlatform, public connectionPool: PostgresConnectionPool, session: DatabaseSession<any>) {
        super(platform, connectionPool, session);
    }

    override handleSpecificError(error: Error): Error {
        return handleSpecificError(this.session, error);
    }

    async batchUpdate<T extends OrmEntity>(entity: PreparedEntity, changeSets: DatabasePersistenceChangeSet<T>[]): Promise<void> {
        const prepared = prepareBatchUpdate(this.platform, entity, changeSets);
        if (!prepared) return;

        const placeholderStrategy = new this.platform.placeholderStrategy();
        const params: any[] = [];
        const selects: string[] = [];
        const valuesValues: string[] = [];
        const valuesSetValues: string[] = [];
        const valuesNames: string[] = [];
        const valuesSetNames: string[] = [];
        for (const fieldName of prepared.changedFields) {
            valuesNames.push(fieldName);
            valuesSetNames.push('_changed_' + fieldName);
        }

        for (let i = 0; i < changeSets.length; i++) {
            params.push(prepared.primaryKeys[i]);
            let pkValue = entity.primaryKey.sqlTypeCast(placeholderStrategy.getPlaceholder());

            valuesValues.push('(' + pkValue + ',' + prepared.changedProperties.map(property => {
                params.push(prepared.values[property.name][i]);
                return property.sqlTypeCast(placeholderStrategy.getPlaceholder());
            }).join(',') + ')');
        }

        for (let i = 0; i < changeSets.length; i++) {
            params.push(prepared.primaryKeys[i]);
            let valuesSetValueSql = entity.primaryKey.sqlTypeCast(placeholderStrategy.getPlaceholder());
            for (const fieldName of prepared.changedFields) {
                valuesSetValueSql += ', ' + prepared.valuesSet[fieldName][i];
            }
            valuesSetValues.push('(' + valuesSetValueSql + ')');
        }

        for (const i of prepared.changedFields) {
            const col = entity.fieldMap[i].columnNameEscaped;
            const colChanged = '_changed_' + i;
            if (prepared.aggregateSelects[i]) {
                const select: string[] = [];
                select.push('CASE');
                for (const item of prepared.aggregateSelects[i]) {
                    select.push(`WHEN _.${prepared.originPkField} = ${item.id} THEN ${item.sql}`);
                }

                select.push(`ELSE (CASE WHEN ${colChanged} = 0 THEN _origin.${col} ELSE _.${col} END) END as ${col}`);
                selects.push(select.join(' '));
            } else {
                //if(check, true, false) => COALESCE(NULLIF(check, true), false)
                selects.push(`(CASE WHEN ${colChanged} = 0 THEN _origin.${col} ELSE _.${col} END) as ${col}`);
            }
        }

        const returningSelect: string[] = [];
        returningSelect.push(prepared.tableName + '.' + prepared.pkField);
        if (!empty(prepared.setReturning)) {
            for (const i in prepared.setReturning) {
                returningSelect.push(prepared.tableName + '.' + this.platform.quoteIdentifier(i));
            }
        }

        const escapedValuesNames = valuesNames.map(v => entity.fieldMap[v].columnNameEscaped);

        const sql = `
              WITH _b(${prepared.originPkField}, ${escapedValuesNames.join(', ')}) AS (
                SELECT _.${prepared.originPkField}, ${selects.join(', ')} FROM
                    (VALUES ${valuesValues.join(', ')}) as _(${prepared.originPkField}, ${escapedValuesNames.join(', ')})
                    INNER JOIN (VALUES ${valuesSetValues.join(', ')}) as _set(${prepared.pkField}, ${valuesSetNames.join(', ')}) ON (_.${prepared.originPkField} = _set.${prepared.pkField})
                    INNER JOIN ${prepared.tableName} as _origin ON (_origin.${prepared.pkField} = _.${prepared.originPkField})
              )
              UPDATE ${prepared.tableName}
              SET ${prepared.setNames.join(', ')}
              FROM _b
              WHERE ${prepared.tableName}.${prepared.pkField} = _b.${prepared.originPkField}
              RETURNING ${returningSelect.join(', ')};
        `;

        try {
            const connection = await this.getConnection(); //will automatically be released in SQLPersistence
            const result = await connection.execAndReturnAll(sql, params);
            for (const returning of result) {
                const r = prepared.assignReturning[returning[prepared.pkName]];
                if (!r) continue;

                for (const name of r.names) {
                    r.item[name] = returning[name];
                }
            }
        } catch (error: any) {
            const reflection = ReflectionClass.from(entity.type);
            error = new DatabaseUpdateError(
                reflection,
                changeSets,
                `Could not update ${reflection.getClassName()} in database`,
                { cause: error },
            );
            throw this.handleSpecificError(error);
        }
    }

    protected async populateAutoIncrementFields<T>(classSchema: ReflectionClass<T>, items: T[]) {
        const autoIncrement = classSchema.getAutoIncrement();
        if (!autoIncrement) return;
        const connection = await this.getConnection(); //will automatically be released in SQLPersistence

        //We adjusted the INSERT SQL with additional RETURNING which returns all generated
        //auto-increment values. We read the result and simply assign the value.
        const name = autoIncrement.name;
        const insertedRows = connection.lastReturningRows;
        if (!insertedRows.length) return;

        for (let i = 0; i < items.length; i++) {
            items[i][name] = insertedRows[i][name];
        }
    }

    protected getInsertSQL(classSchema: ReflectionClass<any>, fields: string[], values: string[]): string {
        const autoIncrement = classSchema.getAutoIncrement();
        const returning = autoIncrement ? ` RETURNING ${this.platform.quoteIdentifier(autoIncrement.name)}` : '';

        if (fields.length === 0) {
            const pkName = this.platform.quoteIdentifier(classSchema.getPrimary().name);
            fields.push(pkName);
            values.fill('DEFAULT');
        }

        return `INSERT INTO ${this.platform.getTableIdentifier(classSchema)} (${fields.join(', ')}) VALUES (${values.join('), (')}) ${returning}`;
    }
}

export class PostgresSQLQueryResolver<T extends OrmEntity> extends SQLQueryResolver<T> {
    async delete(model: SQLQueryModel<T>, deleteResult: DeleteResult<T>): Promise<void> {
        const primaryKey = this.classSchema.getPrimary();
        const pkField = this.platform.quoteIdentifier(primaryKey.name);
        const primaryKeyConverted = primaryKeyObjectConverter(this.classSchema, this.platform.serializer.deserializeRegistry);

        const sqlBuilder = new SqlBuilder(this.adapter);
        const tableName = this.platform.getTableIdentifier(this.classSchema);
        const select = sqlBuilder.select(this.classSchema, model, { select: [`${tableName}.${pkField}`] });

        const connection = await this.connectionPool.getConnection(this.session.assignedTransaction);
        try {
            const sql = `
                WITH _ AS (${select.sql})
                DELETE
                FROM ${tableName} USING _
                WHERE ${tableName}.${pkField} = _.${pkField}
                ${deleteResult.shouldLoadPrimaryKeys ? `RETURNING ${tableName}.${pkField}` : ''}
            `;

            await connection.run(sql, select.params);
            deleteResult.modified = await connection.getChanges();
            if (deleteResult.shouldLoadPrimaryKeys) {
                for (const row of (connection as PostgresConnection).lastReturningRows) {
                    deleteResult.addPrimaryKey(primaryKeyConverted(row[primaryKey.name]));
                }
            }
        } catch (error: any) {
            error = new DatabaseDeleteError(this.classSchema, 'Could not delete in database', { cause: error });
            error.query = model;
            throw this.handleSpecificError(error);
        } finally {
            connection.release();
        }
    }

    override handleSpecificError(error: Error): Error {
        return handleSpecificError(this.session, error);
    }

    async patch(model: SQLQueryModel<T>, changes: Changes<T>, patchResult: PatchResult<T>): Promise<void> {
        const select: string[] = [];
        const selectParams: any[] = [];
        const entity = getPreparedEntity(this.session.adapter as SQLDatabaseAdapter, this.classSchema);
        const tableName = entity.tableNameEscaped;
        const primaryKey = this.classSchema.getPrimary();
        const primaryKeyConverted = primaryKeyObjectConverter(this.classSchema, this.platform.serializer.deserializeRegistry);

        const fieldsSet: { [name: string]: 1 } = {};
        const aggregateFields: { [name: string]: { converted: (v: any) => any } } = {};

        const patchSerialize = getPatchSerializeFunction(this.classSchema.type, this.platform.serializer.serializeRegistry);
        const $set = changes.$set ? patchSerialize(changes.$set, undefined) : undefined;
        const set: string[] = [];

        if ($set) for (const i in $set) {
            if (!$set.hasOwnProperty(i)) continue;
            if ($set[i] === undefined || $set[i] === null) {
                set.push(`${this.platform.quoteIdentifier(i)} = NULL`);
            } else {
                fieldsSet[i] = 1;
                select.push(`$${selectParams.length + 1} as ${this.platform.quoteIdentifier(asAliasName(i))}`);
                selectParams.push($set[i]);
            }
        }

        if (changes.$unset) for (const i in changes.$unset) {
            if (!changes.$unset.hasOwnProperty(i)) continue;
            fieldsSet[i] = 1;
            select.push(`NULL as ${this.platform.quoteIdentifier(i)}`);
        }

        for (const i of model.returning) {
            aggregateFields[i] = { converted: getSerializeFunction(resolvePath(i, this.classSchema.type), this.platform.serializer.deserializeRegistry) };
            select.push(`(${this.platform.quoteIdentifier(i)} ) as ${this.platform.quoteIdentifier(i)}`);
        }

        if (changes.$inc) for (const i in changes.$inc) {
            if (!changes.$inc.hasOwnProperty(i)) continue;
            fieldsSet[i] = 1;
            aggregateFields[i] = { converted: getSerializeFunction(resolvePath(i, this.classSchema.type), this.platform.serializer.serializeRegistry) };
            const sqlTypeCast = getDeepTypeCaster(entity, i);
            select.push(`(${sqlTypeCast('(' + this.platform.getColumnAccessor('', i) + ')')} + ${this.platform.quoteValue(changes.$inc[i])}) as ${this.platform.quoteIdentifier(asAliasName(i))}`);
        }

        for (const i in fieldsSet) {
            if (i.includes('.')) {
                let [firstPart, secondPart] = splitDotPath(i);
                const path = '{' + secondPart.replace(/\./g, ',').replace(/[\]\[]/g, '') + '}';
                set.push(`${this.platform.quoteIdentifier(firstPart)} = jsonb_set(${this.platform.quoteIdentifier(firstPart)}, '${path}', to_jsonb(_b.${this.platform.quoteIdentifier(asAliasName(i))}))`);
            } else {
                const property = entity.fieldMap[i];
                const ref = '_b.' + this.platform.quoteIdentifier(asAliasName(i));
                set.push(`${this.platform.quoteIdentifier(i)} = ${property.sqlTypeCast(ref)}`);
            }
        }
        let bPrimaryKey = primaryKey.name;
        //we need a different name because primaryKeys could be updated as well
        if (fieldsSet[primaryKey.name]) {
            select.unshift(this.platform.quoteIdentifier(primaryKey.name) + ' as __' + primaryKey.name);
            bPrimaryKey = '__' + primaryKey.name;
        } else {
            select.unshift(this.platform.quoteIdentifier(primaryKey.name));
        }

        const returningSelect: string[] = [];
        returningSelect.push(tableName + '.' + this.platform.quoteIdentifier(primaryKey.name));

        if (!empty(aggregateFields)) {
            for (const i in aggregateFields) {
                returningSelect.push(this.platform.getColumnAccessor(tableName, i));
            }
        }

        const sqlBuilder = new SqlBuilder(this.adapter, selectParams);
        const selectSQL = sqlBuilder.select(this.classSchema, model, { select });

        const sql = `
            WITH _b AS (${selectSQL.sql})
            UPDATE
                ${tableName}
            SET ${set.join(', ')}
            FROM _b
            WHERE ${tableName}.${this.platform.quoteIdentifier(primaryKey.name)} = _b.${this.platform.quoteIdentifier(bPrimaryKey)}
                RETURNING ${returningSelect.join(', ')}
        `;

        const connection = await this.connectionPool.getConnection(this.session.assignedTransaction);
        try {
            const result = await connection.execAndReturnAll(sql, selectSQL.params);

            patchResult.modified = result.length;
            for (const i in aggregateFields) {
                patchResult.returning[i] = [];
            }

            for (const returning of result) {
                patchResult.primaryKeys.push(primaryKeyConverted(returning[primaryKey.name]));
                for (const i in aggregateFields) {
                    patchResult.returning[i].push(aggregateFields[i].converted(returning[i]));
                }
            }
        } catch (error: any) {
            error = new DatabasePatchError(this.classSchema, model, changes, `Could not patch ${this.classSchema.getClassName()} in database`, { cause: error });
            throw this.handleSpecificError(error);
        } finally {
            connection.release();
        }
    }
}

export class PostgresSQLDatabaseQuery<T extends OrmEntity> extends SQLDatabaseQuery<T> {
}

export class PostgresSQLDatabaseQueryFactory extends SQLDatabaseQueryFactory {
    createQuery<T extends OrmEntity>(type?: ReceiveType<T> | ClassType<T> | AbstractClassType<T> | ReflectionClass<T>): PostgresSQLDatabaseQuery<T> {
        return new PostgresSQLDatabaseQuery<T>(ReflectionClass.from(type), this.databaseSession,
            new PostgresSQLQueryResolver<T>(this.connectionPool, this.platform, ReflectionClass.from(type), this.databaseSession.adapter, this.databaseSession),
        );
    }
}

export class PostgresDatabaseAdapter extends SQLDatabaseAdapter {
    protected options: PoolConfig;
    protected pool: pg.Pool;
    public connectionPool : PostgresConnectionPool;
    public platform = new PostgresPlatform();
    closed = false;

    constructor(options: PoolConfig | string, additional: Partial<PoolConfig> = {}) {
        super();
        const defaults: PoolConfig = {};
        options = 'string' === typeof options ? parseConnectionString(options) : options;
        this.options = Object.assign(defaults, options, additional);
        this.pool = new pg.Pool(this.options);
        this.connectionPool = new PostgresConnectionPool(this.pool, this.logger, this.stopwatch);

        pg.types.setTypeParser(1700, parseFloat);
        pg.types.setTypeParser(20, parseInt);
    }

    setLogger(logger: Logger) {
        this.logger = logger;
        this.connectionPool.setLogger(logger);
    }

    getName(): string {
        return 'postgres';
    }

    getSchemaName(): string {
        //todo extract schema name from connection options. This acts as default when a table has no schemaName defined.
        return '';
    }

    createPersistence(session: DatabaseSession<this>): SQLPersistence {
        return new PostgresPersistence(this.platform, this.connectionPool, session);
    }

    createTransaction(session: DatabaseSession<this>): PostgresDatabaseTransaction {
        return new PostgresDatabaseTransaction;
    }

    queryFactory(session: DatabaseSession<any>): SQLDatabaseQueryFactory {
        return new PostgresSQLDatabaseQueryFactory(this.connectionPool, this.platform, session);
    }

    disconnect(force?: boolean): void {
        if (this.closed) return;
        this.closed = true;
        this.pool.end().catch(console.error);
    }
}
