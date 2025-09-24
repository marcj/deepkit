/*
 * Deepkit Framework
 * Copyright (C) 2021 Deepkit UG, Marc J. Schmidt
 *
 * This program is free software: you can redistribute it and/or modify
 * it under the terms of the MIT License.
 *
 * You should have received a copy of the MIT License along with this program.
 */

import type { DatabaseAdapter, DatabasePersistence, DatabasePersistenceChangeSet } from './database-adapter.js';
import { DatabaseEntityRegistry } from './database-adapter.js';
import { DatabaseValidationError, OrmEntity } from './type.js';
import { AbstractClassType, ClassType, CustomError, forwardTypeArguments } from '@deepkit/core';
import { getPrimaryKeyExtractor, getTypeJitContainer, isReferenceInstance, markAsHydrated, PrimaryKeyFields, ReceiveType, ReflectionClass, ReflectionKind, stringifyType, Type, typeSettings, UnpopulatedCheck, validate } from '@deepkit/type';
import { GroupArraySort } from '@deepkit/topsort';
import { getClassState, getInstanceState, getNormalizedPrimaryKey, IdentityMap } from './identity-map.js';
import { getClassSchemaInstancePairs } from './utils.js';
import { HydratorFn } from './formatter.js';
import { getReference } from './reference.js';
import { DatabaseErrorInsertEvent, DatabaseErrorUpdateEvent, onDatabaseError, UnitOfWorkCommitEvent, UnitOfWorkEvent, UnitOfWorkUpdateEvent } from './event.js';
import { Stopwatch } from '@deepkit/stopwatch';
import { EventDispatcher, EventToken } from '@deepkit/event';
import { DatabasePluginRegistry } from './plugin/plugin.js';
import { Logger } from '@deepkit/logger';

function resolveReferenceToEntity(type: Type, entityRegistry: DatabaseEntityRegistry): ReflectionClass<any> {
    if (type.kind === ReflectionKind.class) {
        return getTypeJitContainer(type).resolveReferenceEntity ||= ReflectionClass.from(type.classType);
    }

    // object literals have no reference to the nominal type,
    // so we look it up in the EntityRegistry
    if (type.kind === ReflectionKind.objectLiteral) {
        return getTypeJitContainer(type).resolveReferenceEntity ||= entityRegistry.get(type);
    }

    throw new Error(`Could not resolve reference to entity for ${stringifyType(type)}`);
}

let SESSION_IDS = 0;

export class DatabaseSessionRound<ADAPTER extends DatabaseAdapter> {
    protected addQueue = new Set<OrmEntity>();
    protected removeQueue = new Set<OrmEntity>();

    protected addQueueResolved: [ReflectionClass<any>, OrmEntity][] = [];
    protected removeQueueResolved: [ReflectionClass<any>, OrmEntity][] = [];

    protected inCommit: boolean = false;
    protected committed: boolean = false;

    constructor(
        protected round: number = 0,
        protected session: DatabaseSession<any>,
        protected eventDispatcher: EventDispatcher,
        public logger: Logger,
        protected identityMap?: IdentityMap,
    ) {

    }

    public isInCommit() {
        return this.inCommit;
    }

    public isCommitted() {
        return this.committed;
    }

    public add(items: Iterable<OrmEntity>, classSchema?: ReflectionClass<any>): void {
        if (this.isInCommit()) throw new Error('Already in commit. Can not change queues.');

        const old = typeSettings.unpopulatedCheck;
        typeSettings.unpopulatedCheck = UnpopulatedCheck.None;
        try {
            for (const item of items) {
                if (this.removeQueue.has(item)) continue;
                if (this.addQueue.has(item)) continue;

                this.addQueue.add(item);

                const thisClassSchema = classSchema || this.session.entityRegistry.getFromInstance(item);
                this.addQueueResolved.push([thisClassSchema, item]);

                for (const [schema, dep] of this.getReferenceDependenciesWithSchema(thisClassSchema, item)) {
                    this.add([dep], schema);
                }
            }
        } finally {
            typeSettings.unpopulatedCheck = old;
        }
    }

    protected getReferenceDependenciesWithSchema<T extends OrmEntity>(classSchema: ReflectionClass<any>, item: T): [ReflectionClass<any>, OrmEntity][] {
        const result: [ReflectionClass<any>, OrmEntity][] = [];

        for (const reference of classSchema.getReferences()) {
            if (reference.isBackReference()) continue;
            const v = item[reference.getNameAsString() as keyof T] as any;
            if (v == undefined) continue;
            if (!isReferenceInstance(v)) {
                result.push([resolveReferenceToEntity(reference.type, this.session.entityRegistry), v]);
            }
        }

        return result;
    }

    protected getReferenceDependencies<T extends OrmEntity>(classSchema: ReflectionClass<any>, item: T): OrmEntity[] {
        const result: OrmEntity[] = [];

        for (const reference of classSchema.getReferences()) {
            if (reference.isBackReference()) continue;
            const v = item[reference.getNameAsString() as keyof T] as any;
            if (v == undefined) continue;

            // if (reference.isArray) {
            //     if (isArray(v)) {
            //         for (const i of v) {
            //             if (isReference(v)) continue;
            //             if (i instanceof reference.getResolvedClassType()) result.push(i);
            //         }
            //     }
            // } else {
            if (!isReferenceInstance(v)) result.push(v);
            // }
        }

        return result;
    }

    public remove(items: OrmEntity[], schema?: ReflectionClass<any>) {
        if (this.isInCommit()) throw new Error('Already in commit. Can not change queues.');

        const removeAdded: OrmEntity[] = [];

        for (const item of items) {
            this.removeQueue.add(item);
            this.removeQueueResolved.push([schema || this.session.entityRegistry.getFromInstance(item), item]);

            if (this.addQueue.has(item)) {
                this.addQueue.delete(item);
                removeAdded.push(item);
            }
        }

        if (removeAdded.length) {
            this.addQueueResolved = this.addQueueResolved.filter(v => !removeAdded.includes(v[1]));
        }
    }

    public async commit(persistence: DatabasePersistence) {
        if (!this.removeQueue.size && !this.addQueue.size) return;

        this.inCommit = true;

        try {
            await this.doDelete(persistence);
            await this.doPersist(persistence);
            this.committed = true;
        } finally {
            this.inCommit = false;
        }
    }

    protected async doDelete(persistence: DatabasePersistence) {
        for (const [classSchema, items] of getClassSchemaInstancePairs(this.removeQueueResolved)) {
            if (this.eventDispatcher.hasListeners(DatabaseSession.onDeletePre)) {
                const event = new UnitOfWorkEvent(classSchema, this.session, items);
                await this.eventDispatcher.dispatch(DatabaseSession.onDeletePre, event);
                if (event.defaultPrevented) continue;
            }

            await persistence.remove(classSchema, items);
            if (this.identityMap) this.identityMap.deleteMany(classSchema, items);

            if (this.eventDispatcher.hasListeners(DatabaseSession.onDeletePost)) {
                const event = new UnitOfWorkEvent(classSchema, this.session, items);
                await this.eventDispatcher.dispatch(DatabaseSession.onDeletePost, event);
            }
        }
    }

    protected async doPersist(persistence: DatabasePersistence) {
        const sorter = new GroupArraySort<OrmEntity, ReflectionClass<any>>();
        sorter.sameTypeExtraGrouping = true;
        sorter.throwOnNonExistingDependency = false;
        const unpopulatedCheck = typeSettings.unpopulatedCheck;
        typeSettings.unpopulatedCheck = UnpopulatedCheck.None;

        try {
            for (const [classSchema, item] of this.addQueueResolved) {
                sorter.add(item, classSchema, this.getReferenceDependencies(classSchema, item));
            }

            sorter.sort();
            const groups = sorter.getGroups();

            for (const group of groups) {
                const inserts: OrmEntity[] = [];
                const changeSets: DatabasePersistenceChangeSet<OrmEntity>[] = [];
                const classState = getClassState(group.type);

                for (const item of group.items) {
                    const state = getInstanceState(classState, item);
                    const errors = validate(item, classState.classSchema.type);
                    if (errors.length) {
                        throw new DatabaseValidationError(classState.classSchema, errors);
                    }

                    if (state.isKnownInDatabase()) {
                        const lastSnapshot = state.getSnapshot();
                        const currentSnapshot = classState.snapshot(item);
                        const changeSet = classState.changeDetector(lastSnapshot, currentSnapshot, item);
                        if (!changeSet) {
                            continue;
                        }
                        changeSets.push({
                            changes: changeSet,
                            item: item,
                            primaryKey: state.getLastKnownPK(),
                        });
                    } else {
                        inserts.push(item);
                    }
                }

                if (inserts.length) {
                    let doInsert = true;
                    if (this.eventDispatcher.hasListeners(DatabaseSession.onInsertPre)) {
                        const event = new UnitOfWorkEvent(group.type, this.session, inserts);
                        await this.eventDispatcher.dispatch(DatabaseSession.onInsertPre, event);
                        if (event.defaultPrevented) doInsert = false;
                    }
                    if (doInsert) {
                        try {
                            await persistence.insert(group.type, inserts);
                        } catch (error: any) {
                            await this.eventDispatcher.dispatch(onDatabaseError, Object.assign(
                                new DatabaseErrorInsertEvent(error, this.session, classState.classSchema),
                                { inserts },
                            ));
                            throw error;
                        }

                        if (this.eventDispatcher.hasListeners(DatabaseSession.onInsertPost)) {
                            await this.eventDispatcher.dispatch(DatabaseSession.onInsertPost, new UnitOfWorkEvent(group.type, this.session, inserts));
                        }
                    }
                }

                if (changeSets.length) {
                    let doUpdate = true;
                    if (this.eventDispatcher.hasListeners(DatabaseSession.onUpdatePre)) {
                        const event = new UnitOfWorkUpdateEvent(group.type, this.session, changeSets);
                        await this.eventDispatcher.dispatch(DatabaseSession.onUpdatePre, event);
                        if (event.defaultPrevented) doUpdate = false;
                    }

                    if (doUpdate) {
                        try {
                            await persistence.update(group.type, changeSets);
                        } catch (error: any) {
                            await this.eventDispatcher.dispatch(onDatabaseError, Object.assign(
                                new DatabaseErrorUpdateEvent(error, this.session, classState.classSchema),
                                { changeSets },
                            ));
                            throw error;
                        }

                        if (this.eventDispatcher.hasListeners(DatabaseSession.onUpdatePost)) {
                            await this.eventDispatcher.dispatch(DatabaseSession.onUpdatePost, new UnitOfWorkUpdateEvent(group.type, this.session, changeSets));
                        }
                    }
                }

                if (this.identityMap) {
                    this.identityMap.storeMany(group.type, group.items);
                } else {
                    for (const item of group.items) {
                        const state = getInstanceState(classState, item);
                        state.markAsPersisted();
                    }
                }
            }
        } finally {
            typeSettings.unpopulatedCheck = unpopulatedCheck;
        }
    }
}

export class SessionClosedException extends CustomError {
}

export interface DatabaseSessionHookConstructor<C> {
    new<T extends DatabaseSession<any>>(session: T): C;
}

export interface DatabaseSessionHook<T extends DatabaseSession<any>> {
}

export abstract class DatabaseTransaction {
    static transactionCounter: number = 0;

    public ended: boolean = false;

    abstract begin(): Promise<void>;

    abstract commit(): Promise<void>;

    abstract rollback(): Promise<void>;

    constructor(public id: number = DatabaseTransaction.transactionCounter++) {
    }
}

export class DatabaseSession<ADAPTER extends DatabaseAdapter = DatabaseAdapter> {
    public readonly id = SESSION_IDS++;
    public round: number = 0;
    public withIdentityMap = true;

    /**
     * When this session belongs to a transaction, then this is set.
     * All connection handlers should make sure that when a query/persistence object
     * requests a connection, it should always be the same for a given transaction.
     * (that's how transaction work). The connection between a transaction
     * and connection should be unlinked when the transaction commits/rollbacks.
     */
    public assignedTransaction?: ReturnType<this['adapter']['createTransaction']>;

    public readonly identityMap = new IdentityMap();

    /**
     * Creates a new DatabaseQuery instance which can be used to query and manipulate data.
     */
    public readonly query: ReturnType<this['adapter']['queryFactory']>['createQuery'];

    public readonly raw!: ReturnType<this['adapter']['rawFactory']>['create'];

    protected rounds: DatabaseSessionRound<ADAPTER>[] = [];

    protected inCommit: boolean = false;

    protected currentPersistence?: DatabasePersistence = undefined;

    public static readonly onUpdatePre: EventToken<UnitOfWorkUpdateEvent<any>> = new EventToken('orm.session.update.pre');
    public static readonly onUpdatePost: EventToken<UnitOfWorkUpdateEvent<any>> = new EventToken('orm.session.update.post');

    public static readonly onInsertPre: EventToken<UnitOfWorkEvent<any>> = new EventToken('orm.session.insert.pre');
    public static readonly onInsertPost: EventToken<UnitOfWorkEvent<any>> = new EventToken('orm.session.insert.post');

    public static readonly onDeletePre: EventToken<UnitOfWorkEvent<any>> = new EventToken('orm.session.delete.pre');
    public static readonly onDeletePost: EventToken<UnitOfWorkEvent<any>> = new EventToken('orm.session.delete.post');

    public static readonly onCommitPre: EventToken<UnitOfWorkCommitEvent<any>> = new EventToken('orm.session.commit.pre');

    constructor(
        public readonly adapter: ADAPTER,
        public readonly entityRegistry: DatabaseEntityRegistry,
        public readonly eventDispatcher: EventDispatcher,
        public pluginRegistry: DatabasePluginRegistry,
        public logger: Logger,
        public stopwatch?: Stopwatch,
    ) {
        const queryFactory = this.adapter.queryFactory(this);

        //we cannot use arrow functions, since they can't have ReceiveType<T>
        function query<T extends OrmEntity>(type?: ReceiveType<T> | ClassType<T> | AbstractClassType<T> | ReflectionClass<T>) {
            const result = queryFactory.createQuery(type);
            result.model.adapterName = adapter.getName();
            return result;
        }

        this.query = query as any;

        const factory = this.adapter.rawFactory(this);
        this.raw = (...args: any[]) => {
            forwardTypeArguments(this.raw, factory.create);
            return factory.create(...args);
        };
    }

    /**
     * Marks this session as transactional. On the next query or flush()/commit() a transaction on the database adapter is started.
     * Use flush(), commit(), and rollback() to control the transaction behavior. All created query objects from this session
     * are running in this transaction as well.
     *
     * The transaction is released when commit()/rollback() is executed.
     *
     * YOU MUST USE COMMIT() OR ROLLBACK() TO RELEASE THE TRANSACTION.
     *
     * When the transaction is released then
     * this session is not marked as transactional anymore. You have to use useTransaction() again if you want to
     * have a new transaction on this session.
     *
     * @example
     * ```typescript
     * const session = database.createSession();
     * session.useTransaction();
     * try {
     *    // add some data
     *    session.add(new User('New User'));
     *
     *    // flush in-between changes to the database
     *    // without closing the transaction
     *    await session.flush();
     *
     *    // query some data
     *    const users = await session.query(User).filter({ id: 1 }).find();
     *
     *    // finish transaction
     *    await session.commit();
     * } catch (error) {
     *     await session.rollback();
     *     throw error;
     * }
     *```
     */
    useTransaction(): ReturnType<this['adapter']['createTransaction']> {
        if (!this.assignedTransaction) {
            this.assignedTransaction = this.adapter.createTransaction(this) as ReturnType<this['adapter']['createTransaction']>;
        }
        return this.assignedTransaction;
    }

    /**
     * Whether a transaction is assigned to this session.
     */
    hasTransaction(): boolean {
        return !!this.assignedTransaction;
    }

    /**
     * Saves all open changes (pending inserts, updates, deletions) in optimized batches to the database.
     *
     * If a transaction is assigned, this will automatically call a transaction commit and the transaction released.
     *
     * Use flush() if you don't want to end the transaction and keep making changes to the current transaction.
     */
    public async commit() {
        await this.flush();
        if (!this.assignedTransaction) return;
        await this.assignedTransaction.commit();
        this.assignedTransaction = undefined;
    }

    /**
     * If a transaction is assigned, a transaction rollback is executed and the transaction released.
     * You have to use useTransaction() again or create a new session with useTransaction() to start a new transaction.
     *
     * This does not roll back changes made to objects in memory.
     */
    async rollback(): Promise<void> {
        if (!this.assignedTransaction) return;
        await this.assignedTransaction.rollback();
        this.assignedTransaction = undefined;
    }

    /**
     * If a transaction is assigned, a transaction commit is executed.
     *
     * This does not commit changes made to your objects in memory. Use commit() for that instead (which executes commitTransaction() as well).
     */
    async commitTransaction(): Promise<void> {
        if (!this.assignedTransaction) return;
        await this.assignedTransaction.commit();
        this.assignedTransaction = undefined;
    }

    /**
     * Executes an async callback inside of a new transaction. If the callback succeeds (not throwing), the
     * session is automatically committed (and thus its transaction committed and all changes flushed).
     * If the callback throws, the session executes rollback() automatically, and the error is rethrown.
     *
     * ```typescript
     * await session.transaction(async (session) => {
     *     await session.query(...);
     *     session.add(...);
     *
     *     //...
     * });
     * ```
     */
    async transaction<T>(callback: (session: this) => Promise<T>): Promise<T> {
        this.useTransaction();

        try {
            const result = await callback(this);
            await this.commit();
            return result;
        } catch (error) {
            await this.rollback();
            throw error;
        }
    }

    from<T>(hook: DatabaseSessionHookConstructor<T>): T {
        return new hook(this);
    }

    /**
     * Creates or returns an existing reference.
     *
     * If no instance is known in the identity map, it creates a proxy reference (where only primary keys are populated).
     * You can work with this entity instance to assign new references, but reading for not-hydrated values is not possible.
     * Writing not-hydrated is possible and lead to a change in the change-detection. Completely hydrate the object using
     * the `hydrateEntity` function.
     *
     * ```
     * const user = session.getReference(User, 1);
     * ```
     */
    public getReference<T>(classType: ClassType<T> | ReflectionClass<T>, primaryKey: any | PrimaryKeyFields<T>): T {
        const schema = ReflectionClass.from(classType);
        const pk = getNormalizedPrimaryKey(schema, primaryKey);
        return getReference(schema, pk, this.identityMap);
    }

    protected getCurrentRound(): DatabaseSessionRound<ADAPTER> {
        if (!this.rounds.length) this.enterNewRound();

        return this.rounds[this.rounds.length - 1];
    }

    protected enterNewRound() {
        this.rounds.push(new DatabaseSessionRound(this.round++, this, this.eventDispatcher, this.logger, this.withIdentityMap ? this.identityMap : undefined));
    }

    /**
     * Adds a single or multiple items to the to add/update queue. Use session.commit() to persist all queued items to the database.
     *
     * This works like Git: you add files, and later commit all in one batch.
     */
    public add(...items: OrmEntity[]): this {
        if (this.getCurrentRound().isInCommit()) {
            this.enterNewRound();
        }

        this.getCurrentRound().add(items);
        return this;
    }

    /**
     * Adds a single or multiple items for a particular type to the to add/update queue. Use session.commit() to persist all queued items to the database.
     *
     * This works like Git: you add files, and later commit all in one batch.
     */
    public addAs<T extends OrmEntity>(items: T[], type?: ReceiveType<T> | ReflectionClass<any>): this {
        if (this.getCurrentRound().isInCommit()) {
            this.enterNewRound();
        }

        this.getCurrentRound().add(items, ReflectionClass.from(type));
        return this;
    }

    /**
     * Adds item to the remove queue. Use session.commit() to remove queued items from the database all at once.
     */
    public remove(...items: OrmEntity[]): this {
        if (this.getCurrentRound().isInCommit()) {
            this.enterNewRound();
        }

        this.getCurrentRound().remove(items);
        return this;
    }

    /**
     * Adds item to the remove queue for a particular type. Use session.commit() to remove queued items from the database all at once.
     */
    public removeAs<T extends OrmEntity>(items: T[], type?: ReceiveType<T> | ReflectionClass<any>): this {
        if (this.getCurrentRound().isInCommit()) {
            this.enterNewRound();
        }

        this.getCurrentRound().remove(items, ReflectionClass.from(type));
        return this;
    }


    /**
     * Resets all scheduled changes (add() and remove() calls).
     *
     * This does not reset changes made to your objects in memory.
     */
    public reset() {
        this.inCommit = false;
        this.rounds = [];
        if (this.currentPersistence) {
            this.currentPersistence.release();
            this.currentPersistence = undefined;
        }
    }

    public getHydrator(): HydratorFn {
        return this.hydrateEntity.bind(this);
    }

    public async hydrateEntity<T extends object>(item: T) {
        const classSchema = this.entityRegistry.getFromInstance(item);
        const pk = getPrimaryKeyExtractor(classSchema)(item);

        const itemDB = await this.query(classSchema).filter(pk).findOne();

        for (const property of classSchema.getProperties()) {
            if (property.isPrimaryKey()) continue;
            if (property.isReference() || property.isBackReference()) continue;

            //we set only not overwritten values
            if (!item.hasOwnProperty(property.symbol)) {
                Object.defineProperty(item, property.symbol, {
                    enumerable: false,
                    configurable: true,
                    value: itemDB[property.getNameAsString() as keyof T],
                });
            }
        }

        markAsHydrated(item);
    }

    /**
     * Saves all open changes (pending inserts, updates, deletions) in optimized batches to the database.
     *
     * The transaction (if there is any) is still alive. You can call flush() multiple times in an active transaction.
     * commit() does the same as flush() but also automatically commits and closes the transaction.
     */
    public async flush() {
        if (!this.currentPersistence) {
            this.currentPersistence = this.adapter.createPersistence(this);
        }

        try {
            if (!this.rounds.length) {
                //we create a new round
                this.enterNewRound();
            }

            //make sure all stuff in the identity-map is known
            const round = this.getCurrentRound();
            if (this.withIdentityMap) {
                for (const map of this.identityMap.registry.values()) {
                    for (const item of map.values()) {
                        round.add([item.ref]);
                    }
                }
            }

            if (this.eventDispatcher.hasListeners(DatabaseSession.onCommitPre)) {
                const event = new UnitOfWorkCommitEvent(this);
                await this.eventDispatcher.dispatch(DatabaseSession.onCommitPre, event);
                if (event.defaultPrevented) return;
            }

            //we need to iterate via for i, because hooks might add additional rounds dynamically
            for (let i = 0; i < this.rounds.length; i++) {
                const round = this.rounds[i];
                if (round.isCommitted() || round.isInCommit()) continue;
                await round.commit(this.currentPersistence);
            }
        } finally {
            this.currentPersistence.release();
            this.currentPersistence = undefined;
            this.rounds = [];
        }
    }
}
