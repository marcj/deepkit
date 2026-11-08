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
import { DatabaseSession } from '../database-session.js';
import { Database } from '../database.js';
import { Query } from '../query.js';
import { AutoIncrement, entity, InlineRuntimeType, PrimaryKey, PrimaryKeyFields, ReflectionClass, ResetAnnotation } from '@deepkit/type';
import { DatabasePlugin } from './plugin.js';
import { OrmEntity } from '../type.js';

export enum LogType {
    Added,
    Deleted,
    Updated,
}

export class LogEntity {
    id: number & PrimaryKey & AutoIncrement = 0;
    created: Date = new Date;
    author: string = '';
    changedFields: string[] = [];
    reference: any; // will be overridden in log entity for schema

    constructor(public type: LogType) {
    }
}

export class LogSession {
    protected author: any = '';
    protected authorForInstance = new Map<any, any>();

    constructor(session: DatabaseSession<any>) {
        const plugin = session.pluginRegistry.getPlugin(LogPlugin);
        if (!plugin) return;

        session.eventDispatcher.listen(DatabaseSession.onInsertPre, event => {
            if (!event.classSchema.isSchemaOf(plugin.options.entity)) return;
            for (const item of event.items) {
                item.author = this.authorForInstance.get(item) || this.author;
            }
        });
    }

    setAuthor(author: any): this {
        this.author = author;
        return this;
    }

    setAuthorForInstance(instance: any, author: any): this {
        this.authorForInstance.set(instance, author);
        return this;
    }
}

export class LogQuery<T extends OrmEntity> extends Query<T> {
    logAuthor?: any;

    byLogAuthor(author?: any): this {
        this.logAuthor = author;
        return this;
    }

    clone(): this {
        const c = super.clone();
        c.logAuthor = this.logAuthor;
        return c;
    }
}

interface LoginPluginOptions {
    entity: ClassType;

    /**
     * If defined, limits the logging to this particular entities only. Otherwise, all entities will be logged.
     */
    entities: (ClassType | ReflectionClass<any>)[];

    /**
     * Disable tracking of deleting items.
     */
    disableDelete?: true;

    /**
     * Disable tracking of updating items.
     */
    disableUpdate?: true;

    /**
     * Disable tracking of inserting items.
     */
    disableInsert?: true;
}

const IsLogEntity = 'orm/logPluginEntity';

export class LogPlugin implements DatabasePlugin {
    protected entities = new Set<ReflectionClass<any>>();
    protected logEntities = new Map<ReflectionClass<any>, ReflectionClass<any>>();
    public options: LoginPluginOptions = { entity: LogEntity, entities: [] };

    constructor(options: Partial<LoginPluginOptions> = {}) {
        Object.assign(this.options, options);
    }

    isIncluded(classType: ReflectionClass<any>) {
        if (this.entities.size === 0) return true;
        return this.entities.has(classType);
    }

    getLogEntityCollectionName(schema: ReflectionClass<any>): string {
        return schema.getCollectionName() + '_log';
    }

    getLogEntity(schema: ReflectionClass<any> | ClassType): ClassType<LogEntity> {
        schema = ReflectionClass.from(schema);
        let entry = this.logEntities.get(schema);
        if (!entry) {
            const primaryKey = { ...schema.getPrimary().type };

            @entity.collection(this.getLogEntityCollectionName(schema))
            class LogEntityForSchema extends this.options.entity {
                //we can not work with references since that would mean we can not delete the parent without deleting the log entry.
                reference: InlineRuntimeType<typeof primaryKey> & ResetAnnotation<'primaryKey'> & ResetAnnotation<'autoIncrement'>;
            }

            entry = ReflectionClass.from(LogEntityForSchema);
            this.logEntities.set(schema, entry);
        }
        entry.data[IsLogEntity] = true;
        return entry.getClassType();
    }

    createLog(databaseSession: DatabaseSession<any>, type: LogType, reflectionClass: ReflectionClass<any>, primaryKey: PrimaryKeyFields<any>): LogEntity {
        const entity = this.getLogEntity(reflectionClass);
        const log = new entity(type);
        log.reference = primaryKey[reflectionClass.getPrimary().name];
        return log;
    }

    onRegister(database: Database<any>): void {
        if (this.entities.size === 0) {
            for (const entity of database.entityRegistry.all()) {
                if (entity.data[IsLogEntity]) continue;
                this.entities.add(entity);
                database.entityRegistry.add(this.getLogEntity(entity));
            }
        }

        database.listen(Query.onDeletePre, event => {
            if (!this.isIncluded(event.classSchema)) return;
            if (this.options.disableDelete) return;
            event.deleteResult.loadPrimaryKeys();
        });

        database.listen(Query.onDeletePost, async event => {
            if (!this.isIncluded(event.classSchema)) return;
            if (this.options.disableDelete) return;

            for (const primaryKey of event.deleteResult.loadedPrimaryKeys) {
                const log = this.createLog(event.databaseSession, LogType.Deleted, event.classSchema, primaryKey);
                if (Query.is(event.query, LogQuery)) log.author = event.query.logAuthor as any;
                event.databaseSession.add(log);
            }
            await event.databaseSession.commit();
        });

        database.listen(Query.onPatchPost, async event => {
            if (!this.isIncluded(event.classSchema)) return;
            if (this.options.disableUpdate) return;

            for (const primaryKey of event.patchResult.primaryKeys) {
                const log = this.createLog(event.databaseSession, LogType.Updated, event.classSchema, primaryKey);
                if (Query.is(event.query, LogQuery)) log.author = event.query.logAuthor as any;
                log.changedFields = event.patch.fieldNames;
                event.databaseSession.add(log);
            }
            await event.databaseSession.commit();
        });

        database.listen(DatabaseSession.onDeletePost, async event => {
            if (!this.isIncluded(event.classSchema)) return;
            if (this.options.disableDelete) return;

            for (const item of event.items) {
                const log = this.createLog(event.databaseSession, LogType.Deleted, event.classSchema, item);
                //author is set in LogSession listeners
                event.databaseSession.add(log);
            }
        });

        database.listen(DatabaseSession.onUpdatePost, async event => {
            if (!this.isIncluded(event.classSchema)) return;
            if (this.options.disableUpdate) return;

            for (const change of event.changeSets) {
                const log = this.createLog(event.databaseSession, LogType.Updated, event.classSchema, change.primaryKey);
                log.changedFields = change.changes.fieldNames;
                //author is set in LogSession listeners
                event.databaseSession.add(log);
            }
        });

        database.listen(DatabaseSession.onInsertPost, async event => {
            if (!this.isIncluded(event.classSchema)) return;
            if (this.options.disableInsert) return;

            for (const item of event.items) {
                const log = this.createLog(event.databaseSession, LogType.Added, event.classSchema, item);
                //author is set in LogSession listeners
                event.databaseSession.add(log);
            }
        });
    }
}
