/*
 * Deepkit Framework
 * Copyright (C) 2021 Deepkit UG, Marc J. Schmidt
 *
 * This program is free software: you can redistribute it and/or modify
 * it under the terms of the MIT License.
 *
 * You should have received a copy of the MIT License along with this program.
 */

import { AbstractClassType, ClassType, forwardTypeArguments, getClassName, getClassTypeFromInstance } from '@deepkit/core';
import {
    entityAnnotation,
    EntityOptions,
    getReferenceInfo,
    isReferenceHydrated,
    PrimaryKeyFields,
    ReceiveType,
    ReflectionClass,
    ReflectionKind,
    resolveReceiveType,
    Type,
} from '@deepkit/type';
import { DatabaseAdapter, DatabaseEntityRegistry, MigrateOptions } from './database-adapter.js';
import { DatabaseSession } from './database-session.js';
import { Query } from './query.js';
import { getReference } from './reference.js';
import { OrmEntity } from './type.js';
import { VirtualForeignKeyConstraint } from './virtual-foreign-key-constraint.js';
import { Stopwatch } from '@deepkit/stopwatch';
import { getClassState, getInstanceState, getNormalizedPrimaryKey } from './identity-map.js';
import { EventDispatcher, EventDispatcherUnsubscribe, EventListenerCallback, EventToken } from '@deepkit/event';
import { DatabasePlugin, DatabasePluginRegistry } from './plugin/plugin.js';
import { Logger } from '@deepkit/logger';

/**
 * Hydrates not completely populated item and makes it completely accessible.
 * This is necessary if you want to load fields that were excluded from the query via lazyLoad().
 */
export async function hydrateEntity<T extends OrmEntity>(item: T): Promise<T> {
    const info = getReferenceInfo(item);
    if (info && isReferenceHydrated(item)) return item;

    if (info && info.hydrator) {
        await info.hydrator(item);
        return item;
    }

    const state = getInstanceState<T>(getClassState(ReflectionClass.from(getClassTypeFromInstance(item))), item);
    if (state.hydrator) {
        await state.hydrator(item);
        return item;
    }

    throw new Error(`Given object is not a reference from a database session and thus can not be hydrated.`);
}

/**
 * Type guard for a specialised database adapter. Can be used to
 * use special methods from an adapter on a generic Database object.
 *
 * ```
 * const database = new Database(...); //we don't know the adapter
 *
 * if (isDatabaseOf(database, SQLDatabaseAdapter)) {
 *     // cool, we can use `where(sql)` which is only available for SQLDatabaseAdapter
 *     database.query(User).where(sql`id > 2`).find();
 *
 *     //or raw SQL queries
 *     database.raw(sql`SELECT count(*) FROM ${User}`).find();
 * }
 * ```
 */
export function isDatabaseOf<T extends DatabaseAdapter>(database: Database<any>, adapterClassType: AbstractClassType<T>): database is Database<T> {
    return database.adapter instanceof adapterClassType;
}

function setupVirtualForeignKey(database: Database, virtualForeignKeyConstraint: VirtualForeignKeyConstraint) {
    database.listen(DatabaseSession.onDeletePost, async (event) => {
        await virtualForeignKeyConstraint.onUoWDelete(event);
    });
    database.listen(DatabaseSession.onUpdatePost, async (event) => {
        await virtualForeignKeyConstraint.onUoWUpdate(event);
    });
    database.listen(Query.onPatchPost, async (event) => {
        await virtualForeignKeyConstraint.onQueryPatch(event);
    });
    database.listen(Query.onDeletePost, async (event) => {
        await virtualForeignKeyConstraint.onQueryDelete(event);
    });
}

/**
 * Database abstraction. Use createSession() to create a work session with transaction support.
 *
 * Using this class in your code indicates that you can work with common and most basic database semantics.
 * This means that you can use the deepkit/type database API that works across a variety of database engines
 * like MySQL, PostgreSQL, SQLite, and MongoDB.
 *
 * @reflection never
 */
export class Database<ADAPTER extends DatabaseAdapter = DatabaseAdapter> {
    public name: string = 'default';

    /**
     * If set, all created Database instances are registered here.
     */
    static registry?: Database[];

    /**
     * The entity schema registry.
     */
    public readonly entityRegistry: DatabaseEntityRegistry = new DatabaseEntityRegistry();

    public stopwatch?: Stopwatch;

    /**
     * Creates a new DatabaseQuery instance which can be used to query data.
     *  - Entity instances ARE NOT cached or tracked.
     *
     * Use a DatabaseSession (createSession()) with its query() in your workflow to enable
     * identity map.
     *
     * ```typescript
     * const session = database.createSession();
     *
     * const item = await session.query(MyType).findOne();
     * item.name = 'changed';
     * await session.commit(); //only necessary when you changed items received by this session
     * ```
     */
    public readonly query: ReturnType<this['adapter']['queryFactory']>['createQuery'];

    public readonly raw: ReturnType<this['adapter']['rawFactory']>['create'];

    protected virtualForeignKeyConstraint: VirtualForeignKeyConstraint = new VirtualForeignKeyConstraint(this);

    public logger: Logger = new Logger;

    public eventDispatcher: EventDispatcher = new EventDispatcher();

    public pluginRegistry: DatabasePluginRegistry = new DatabasePluginRegistry();

    constructor(
        public readonly adapter: ADAPTER,
        schemas: (Type | ClassType | ReflectionClass<any>)[] = [],
    ) {
        this.logger = adapter.logger;
        this.entityRegistry.add(...schemas);
        if (Database.registry) Database.registry.push(this);

        const self = this;

        //we cannot use arrow functions, since they can't have ReceiveType<T>
        function query<T extends OrmEntity>(type?: ReceiveType<T> | ClassType<T> | AbstractClassType<T> | ReflectionClass<T>) {
            const session = self.createSession();
            session.withIdentityMap = false;
            return session.query(type);
        }

        this.query = query;

        this.raw = (...args: any[]) => {
            const session = this.createSession();
            session.withIdentityMap = false;
            if (!session.raw) throw new Error('Adapter has no raw mode');
            forwardTypeArguments(this.raw, session.raw);
            return session.raw(...args);
        };

        this.registerEntity(...schemas);

        if (!this.adapter.isNativeForeignKeyConstraintSupported()) {
            setupVirtualForeignKey(this, this.virtualForeignKeyConstraint);
        }
    }

    setEventDispatcher(eventDispatcher: EventDispatcher) {
        eventDispatcher.mergeContextsFrom(this.eventDispatcher);
        this.eventDispatcher = eventDispatcher;
        this.adapter.setEventDispatcher(eventDispatcher);
    }

    setLogger(logger: Logger) {
        this.logger = logger;
        this.adapter.setLogger(logger);
    }

    registerPlugin(...plugins: DatabasePlugin[]): void {
        for (const plugin of plugins) {
            this.pluginRegistry.add(plugin);
            plugin.onRegister(this);
        }
    }

    static createClass<T extends DatabaseAdapter>(name: string, adapter: T, schemas: (ClassType | ReflectionClass<any>)[] = []): ClassType<Database<T>> {
        class C extends Database<T> {
            bla!: string;

            constructor() {
                super(adapter, schemas);
                this.name = name;
            }
        }

        return C;
    }

    /**
     * Register a new event listener for given token.
     *
     * order: The lower the order, the sooner the listener is called. Default is 0.
     */
    listen<T extends EventToken<any>>(eventToken: T, callback: EventListenerCallback<T>, order: number = 0): EventDispatcherUnsubscribe {
        return this.eventDispatcher.listen(eventToken, callback, order);
    }

    /**
     * Tells the adapter to disconnect. It reconnects automatically when necessary.
     */
    disconnect(force?: boolean): void {
        this.adapter.disconnect(force);
    }

    /**
     * Creates a new database session. This is the preferred way of working with the database
     * and to enjoy all ORM features. Call DatabaseSession.commit to persist changes all at once
     * in the most performant way possible. The creation of a DatabaseSession is very low cost,
     * so creating many or often is the preferred way.
     **
     * All entity instances fetched/stored during this session are cached and tracked automatically.
     *
     * Note: This is not equal to a database transaction. A session means a work block
     * where you need to fetch, change, and save entity instances. Every instance fetched
     * stays in the identity-map of that session and keeps it alive, so make sure
     * to not keep a session for too long (especially not cross requests).

     * @example
     * ```typescript
     * const database = new Database(...);
     *
     * express.on('request', async (req) => {
     *     const session = database.createSession();
     *     const user = session.query(User).filter({id: req.params.id}).findOne();
     *     user.name = req.params.name;
     *     await session.commit(); //session will be garbage collected and should NOT be stored for the next request
     * });
     * ```
     */
    public createSession(): DatabaseSession<ADAPTER> {
        return new DatabaseSession(this.adapter, this.entityRegistry, this.eventDispatcher, this.pluginRegistry, this.logger, this.stopwatch);
    }

    /**
     * Executes given callback in a new session and automatically commits it when executed successfully.
     * This has the same semantics as `createSession`.
     */
    public async session<T>(worker: (session: DatabaseSession<ADAPTER>) => Promise<T>): Promise<T> {
        const session = this.createSession();
        const res = await worker(session);
        await session.commit();
        return res;
    }

    /**
     * Executes an async callback inside of a new transactional session. If the callback succeeds (not throwing), the
     * session is automatically committed (and thus its transaction committed and all changes flushed).
     * If the callback throws, the session executes rollback() automatically, and the error is rethrown.
     *
     * ```typescript
     * await database.transaction(async (session) => {
     *     await session.query(...);
     *     session.add(...);
     *
     *     //...
     * });
     * ```
     */
    async transaction<T>(callback: (session: DatabaseSession<ADAPTER>) => Promise<T>): Promise<T> {
        const session = this.createSession();
        session.useTransaction();
        try {
            const result = await callback(session);
            await session.commit();
            return result;
        } catch (error) {
            await session.rollback();
            throw error;
        }
    }

    /**
     * Creates a new reference.
     *
     * If you work with a DatabaseSession, use DatabaseSession.getReference instead to
     * maintain object identity.
     *
     * ```
     * const user = database.getReference(User, 1);
     * ```
     */
    public getReference<T>(classType: ClassType<T> | ReflectionClass<any>, primaryKey: PrimaryKeyFields<T>): T {
        const schema = ReflectionClass.from(classType);
        const pk = getNormalizedPrimaryKey(schema, primaryKey);
        return getReference(schema, pk);
    }

    /**
     * Registers a new entity to this database.
     * This is mainly used for db migration utilities and active record.
     * If you want to use active record, you have to assign your entities first to a database using this method.
     */
    registerEntity(...entities: (Type | AbstractClassType | ReflectionClass<any>)[]): void {
        for (const entity of entities) {
            const schema = ReflectionClass.from(entity);

            this.entityRegistry.add(schema);

            schema.data['orm.database'] = this;
            if (isActiveRecordClassType(entity)) entity.registerDatabase(this);
        }
    }

    register<T>(options?: EntityOptions, type?: ReceiveType<T>): this {
        type = resolveReceiveType(type);
        const existingEntityOptions: EntityOptions = entityAnnotation.getFirst(type) || {};
        Object.assign(existingEntityOptions, options);
        entityAnnotation.replaceType(type, [existingEntityOptions]);

        const schema = ReflectionClass.from(type);
        this.entityRegistry.add(schema);
        schema.data['orm.database'] = this;

        if (schema.type.kind === ReflectionKind.class && isActiveRecordClassType(schema.type.classType)) schema.type.classType.registerDatabase(this);
        return this;
    }

    getEntity(name: string): ReflectionClass<any> {
        for (const entity of this.entityRegistry.all()) {
            if (entity.getName() === name) return entity;
        }

        throw new Error(`No entity with name ${name} registered in database ${this.name}`);
    }

    /**
     * Makes sure the schemas types, indices, uniques, etc are reflected in the database.
     *
     * WARNING: DON'T USE THIS IN PRODUCTION AS THIS CAN CAUSE EASILY DATA LOSS.
     * SEE THE MIGRATION DOCUMENTATION TO UNDERSTAND ITS IMPLICATIONS.
     */
    async migrate(options: Partial<MigrateOptions> = {}) {
        const o = new MigrateOptions();
        Object.assign(o, options);
        await this.adapter.migrate(o, this.entityRegistry);
    }

    /**
     * Simple direct persist. The persistence layer (batch) inserts or updates the record
     * depending on the state of the given items. This is different to createSession()+add() in a way
     * that `DatabaseSession.add` adds the given items to the queue (which is then committed using commit())
     * while this `database.persist` just simply inserts/updates the given items immediately,
     * completely bypassing the advantages of the unit of work for multiple items.
     *
     * You should prefer the add/remove and commit() workflow to fully utilizing database performance.
     */
    public async persist(...items: OrmEntity[]) {
        const session = this.createSession();
        session.withIdentityMap = false;
        session.add(...items);
        await session.commit();
    }

    /**
     * Same as persist(), but allows to specify the type that should be used for the given items.
     */
    public async persistAs<T extends OrmEntity>(items: T[], type?: ReceiveType<T>) {
        const session = this.createSession();
        session.withIdentityMap = false;
        session.addAs(items, ReflectionClass.from(type));
        await session.commit();
    }

    /**
     * Simple direct remove. The persistence layer (batch) removes all given items.
     * This is different to createSession()+remove() in a way that `DatabaseSession.remove` adds the given items to the queue
     * (which is then committed using commit()) while this `database.remove` just simply removes the given items immediately,
     * completely bypassing the advantages of the unit of work for multiple items.
     *
     * You should prefer the add/remove and commit() workflow to fully utilizing database performance.
     */
    public async remove(...items: OrmEntity[]) {
        const session = this.createSession();
        session.withIdentityMap = false;
        session.remove(...items);
        await session.commit();
    }

    /**
     * Same as remove(), but allows to specify the type that should be used for the given items.
     */
    public async removeAs<T extends OrmEntity>(items: T[], type?: ReceiveType<T>) {
        const session = this.createSession();
        session.withIdentityMap = false;
        session.removeAs(items, ReflectionClass.from(type));
        await session.commit();
    }
}

export interface ActiveRecordClassType {
    new(...args: any[]): ActiveRecord;

    getDatabase(): Database<any>;

    registerDatabase(database: Database<any>): void;

    query(): any;
}

export function isActiveRecordClassType(entity: any): entity is ActiveRecordClassType {
    return 'function' === entity.getDatabase || 'function' === entity.registerDatabase || 'function' === entity.query;
}

/**
 * @reflection never
 */
export class ActiveRecord {
    constructor(...args: any[]) {
    }

    public static getDatabase(): Database<any> {
        const database = ReflectionClass.from(this).data['orm.database'] as Database<any> | undefined;
        if (!database) throw new Error(`No database assigned to ${getClassName(this)}. Use Database.registerEntity(${getClassName(this)}) first.`);
        return database;
    }

    public static registerDatabase(database: Database<any>): void {
        ReflectionClass.from(this).data['orm.database'] = database;
    }

    public async save(): Promise<void> {
        const db = ((this as any).constructor as ActiveRecordClassType).getDatabase();
        await db.persist(this);
    }

    public async remove(): Promise<void> {
        const db = ((this as any).constructor as ActiveRecordClassType).getDatabase();
        await db.remove(this);
    }

    public static query<T extends typeof ActiveRecord>(this: T): Query<InstanceType<T>> {
        return this.getDatabase().query(this);
    }

    public static reference<T extends typeof ActiveRecord>(this: T, primaryKey: any | PrimaryKeyFields<InstanceType<T>>): InstanceType<T> {
        return this.getDatabase().getReference(this, primaryKey) as InstanceType<T>;
    }
}
