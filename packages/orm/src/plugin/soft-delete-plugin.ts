/*
 * Deepkit Framework
 * Copyright (C) 2021 Deepkit UG, Marc J. Schmidt
 *
 * This program is free software: you can redistribute it and/or modify
 * it under the terms of the MIT License.
 *
 * You should have received a copy of the MIT License along with this program.
 */

import { ClassType } from '@deepkit/core';
import { EventDispatcherUnsubscribe } from '@deepkit/event';
import { DatabaseSession } from '../database-session.js';
import { Database } from '../database.js';
import { DatabaseAdapter } from '../database-adapter.js';
import { Query } from '../query.js';
import { OrmEntity } from '../type.js';
import { ReflectionClass } from '@deepkit/type';
import { DatabasePlugin } from './plugin.js';

interface SoftDeleteEntity extends OrmEntity {
    deletedAt?: Date;
    deletedBy?: any;
}

const deletedAtName = 'deletedAt';

export class SoftDeleteSession {
    protected deletedBy = new Map<ReflectionClass<any>, any>();
    protected restoreItems: SoftDeleteEntity[] = [];

    constructor(protected session: DatabaseSession<any>) {
        session.eventDispatcher.listen(DatabaseSession.onDeletePre, event => {
            const deletedBy = this.deletedBy.get(event.classSchema);
            if (!deletedBy) return;
            for (const item of event.items) {
                item.deletedBy = deletedBy;
            }
        });

        session.eventDispatcher.listen(DatabaseSession.onCommitPre, event => {
            for (const item of this.restoreItems) {
                item.deletedAt = undefined;
                item.deletedBy = undefined;
            }

            event.databaseSession.add(...this.restoreItems);
            this.restoreItems.length = 0;
        });
    }

    setDeletedBy<T extends SoftDeleteEntity>(classType: ClassType<T> | ReflectionClass<T>, deletedBy: T['deletedBy']): this {
        this.deletedBy.set(ReflectionClass.from(classType), deletedBy);
        return this;
    }

    restore<T extends SoftDeleteEntity>(item: T): this {
        this.restoreItems.push(item);
        return this;
    }
}

export class SoftDeleteQuery<T extends SoftDeleteEntity> extends Query<T> {
    includeSoftDeleted: boolean = false;
    setDeletedBy?: T['deletedBy'];

    clone(): this {
        const c = super.clone();
        c.includeSoftDeleted = this.includeSoftDeleted;
        c.setDeletedBy = this.setDeletedBy;
        return c;
    }

    /**
     * Enables fetching, updating, and deleting of soft-deleted records.
     */
    withSoftDeleted(): this {
        const m = this.clone();
        m.includeSoftDeleted = true;
        return m;
    }

    /**
     * Includes only soft deleted records.
     */
    isSoftDeleted(): this {
        const m = this.clone();
        m.includeSoftDeleted = true;
        return m.filterField('deletedAt', { $ne: undefined });
    }

    deletedBy(value: T['deletedBy']): this {
        const c = this.clone();
        c.setDeletedBy = value;
        return c;
    }

    async restoreOne() {
        const patch = { [deletedAtName]: undefined } as Partial<T>;
        if (this.classSchema.hasProperty('deletedBy')) patch['deletedBy'] = undefined;
        return this.withSoftDeleted().patchOne(patch);
    }

    async restoreMany() {
        const patch = { [deletedAtName]: undefined } as Partial<T>;
        if (this.classSchema.hasProperty('deletedBy')) patch['deletedBy'] = undefined;
        return this.withSoftDeleted().patchMany(patch);
    }

    async hardDeleteOne() {
        return this.withSoftDeleted().deleteOne();
    }

    async hardDeleteMany() {
        return this.withSoftDeleted().deleteMany();
    }
}

export class SoftDeletePlugin implements DatabasePlugin {
    protected listeners = new Map<ReflectionClass<any>, {
        queryFetch: EventDispatcherUnsubscribe, queryPatch: EventDispatcherUnsubscribe,
        queryDelete: EventDispatcherUnsubscribe, uowDelete: EventDispatcherUnsubscribe
    }>();

    protected database?: Database<DatabaseAdapter>;

    onRegister(database: Database<any>): void {
        this.database = database;
        for (const type of database.entityRegistry.all()) this.enableForSchema(type);
    }

    enable<T extends SoftDeleteEntity>(...classSchemaOrTypes: (ReflectionClass<T> | ClassType<T>)[]) {
        for (const type of classSchemaOrTypes) this.enableForSchema(type);
    }

    disable(...classSchemaOrTypes: (ReflectionClass<any> | ClassType)[]) {
        for (const type of classSchemaOrTypes) this.disableForSchema(type);
    }

    protected disableForSchema(classSchemaOrType: ReflectionClass<any> | ClassType) {
        const schema = ReflectionClass.from(classSchemaOrType);
        const listener = this.listeners.get(schema);
        if (listener) {
            listener.queryFetch();
            listener.queryPatch();
            listener.queryDelete();
            listener.uowDelete();
            this.listeners.delete(schema);
        }
    }

    protected getDatabase(): Database<any> {
        if (!this.database) throw new Error('Plugin not registered yet');
        return this.database;
    }

    protected enableForSchema<T extends SoftDeleteEntity>(classSchemaOrType: ReflectionClass<T> | ClassType<T>) {
        const schema = ReflectionClass.from(classSchemaOrType);
        const hasDeletedBy = schema.hasProperty('deletedBy');

        if (!schema.hasProperty(deletedAtName)) {
            throw new Error(`Entity ${schema.getClassName()} has no ${deletedAtName} property. Please define one as type '${deletedAtName}: t.date.optional'`);
        }

        function queryFilter(event: { classSchema: ReflectionClass<any>, query: Query<any> }) {
            //this is for each query method: count, find, findOne(), etc.

            //we don't change SoftDeleteQuery instances as they operate on the raw records without filter
            if (Query.is(event.query, SoftDeleteQuery) && event.query.includeSoftDeleted === true) return;

            if (event.classSchema !== schema) return; //do nothing

            //attach the filter to exclude deleted records
            event.query = event.query.filterField(deletedAtName, undefined);
        }

        const queryFetch = this.getDatabase().listen(Query.onFetch, queryFilter);
        const queryPatch = this.getDatabase().listen(Query.onPatchPre, queryFilter);

        const queryDelete = this.getDatabase().listen(Query.onDeletePre, async event => {
            if (event.classSchema !== schema) return; //do nothing

            //we don't change SoftDeleteQuery instances as they operate on the raw records without filter
            if (Query.is(event.query, SoftDeleteQuery) && event.query.includeSoftDeleted === true) return;

            //stop actual query delete query
            event.preventDefault();

            const patch = { [deletedAtName]: new Date } as Partial<T>;
            if (hasDeletedBy && Query.is(event.query, SoftDeleteQuery) && event.query.setDeletedBy !== undefined) {
                patch.deletedBy = event.query.setDeletedBy;
            }

            await event.query.patchMany(patch);
        });

        const uowDelete = this.getDatabase().listen(DatabaseSession.onDeletePre, async event => {
            if (event.classSchema !== schema) return; //do nothing

            //stop actual query delete query
            event.preventDefault();

            //instead of removing, we move it into the current session (creating a new SessionRound)
            //to let the current commit know we want to rather update it, instead of deleting.
            for (const item of event.items) {
                item[deletedAtName] = new Date;
            }

            //this creates a new SessionRound, and commits automatically once the current is done (in the same transaction).
            event.databaseSession.add(...event.items);
        });

        this.listeners.set(schema, { queryFetch, queryPatch, queryDelete, uowDelete });
    }
}
