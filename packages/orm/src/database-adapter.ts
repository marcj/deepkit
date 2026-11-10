/*
 * Deepkit Framework
 * Copyright (C) 2021 Deepkit UG, Marc J. Schmidt
 *
 * This program is free software: you can redistribute it and/or modify
 * it under the terms of the MIT License.
 *
 * You should have received a copy of the MIT License along with this program.
 */

import { OrmEntity } from './type.js';
import {
    AbstractClassType,
    arrayRemoveItem,
    ClassType,
    getClassName,
    getClassTypeFromInstance,
    isClass,
    stringifyValueWithType,
} from '@deepkit/core';
import { is, isSameType, ItemChanges, PrimaryKeyFields, ReceiveType, ReflectionClass, ReflectionKind, stringifyType, Type } from '@deepkit/type';
import { Query } from './query.js';
import { DatabaseSession, DatabaseTransaction } from './database-session.js';
import { EventDispatcher } from '@deepkit/event';
import { Logger } from '@deepkit/logger';
import { Stopwatch } from '@deepkit/stopwatch';

export abstract class DatabaseAdapterQueryFactory {
    abstract createQuery<T extends OrmEntity>(type?: ReceiveType<T> | ClassType<T> | AbstractClassType<T> | ReflectionClass<T>): Query<T>;
}

export interface DatabasePersistenceChangeSet<T extends object> {
    changes: ItemChanges<T>;
    item: T;
    primaryKey: PrimaryKeyFields<T>;
}

export abstract class DatabasePersistence {
    abstract remove<T extends OrmEntity>(classSchema: ReflectionClass<T>, items: T[]): Promise<void>;

    /**
     * @param options.returnPrimaryKeys Whether generated primary keys are read back into the items, default true.
     */
    abstract insert<T extends OrmEntity>(classSchema: ReflectionClass<T>, items: T[], options?: { returnPrimaryKeys?: boolean }): Promise<void>;

    abstract update<T extends OrmEntity>(classSchema: ReflectionClass<T>, changeSets: DatabasePersistenceChangeSet<T>[]): Promise<void>;

    /**
     * When DatabasePersistence instance is not used anymore, this function will be called.
     * Good place to release a connection for example.
     */
    abstract release(): void;
}

export class RawFactory<A extends Array<any>> {
    create<T = any>(...args: A): any {
        throw new Error(`Current database adapter does not support raw mode.`);
    }
}

export class MigrateOptions {
    /**
     * Whether drop statements should be issued, like DROP TABLE, DROP INDEX, etc.
     *
     * Default false.
     */
    drop: boolean = false;

    /**
     * Whether drop statements should be issued for indexes/uniques, like DROP INDEX.
     */
    dropIndex: boolean = false;

    /**
     * Whether create/drop statements should be issued for indexes/uniques, like CREATE/ INDEX/DROP INDEX.
     */
    skipIndex: boolean = false;

    /**
     * Whether foreign key constraints should be created/dropped.
     */
    skipForeignKey: boolean = false;

    isDropIndex() {
        if (this.skipIndex) return false;
        return this.skipIndex || this.dropIndex || this.drop;
    }

    isIndex() {
        return !this.skipIndex;
    }

    isForeignKey() {
        return !this.skipForeignKey;
    }

    isDropSchema() {
        return this.drop;
    }
}

/**
 * A generic database adapter you can use if the API of `Query` is sufficient.
 *
 * You can specify a more specialized adapter like MysqlDatabaseAdapter/MongoDatabaseAdapter with special API for MySQL/Mongo.
 */
export abstract class DatabaseAdapter {
    eventDispatcher: EventDispatcher = new EventDispatcher();
    logger: Logger = new Logger();
    stopwatch?: Stopwatch;

    setEventDispatcher(eventDispatcher: EventDispatcher) {
        this.eventDispatcher = eventDispatcher;
    }

    setLogger(logger: Logger) {
        this.logger = logger;
    }

    abstract queryFactory(session: DatabaseSession<this>): DatabaseAdapterQueryFactory;

    rawFactory(session: DatabaseSession<this>): RawFactory<any> {
        return new RawFactory();
    };

    abstract createPersistence(session: DatabaseSession<this>): DatabasePersistence;

    abstract createTransaction(session: DatabaseSession<this>): DatabaseTransaction;

    abstract disconnect(force?: boolean): void;

    abstract migrate(options: MigrateOptions, entityRegistry: DatabaseEntityRegistry): Promise<void>;

    /**
     * Unique adapter name to be used in DatabaseField to apply certain adapter specific behavior per field.
     */
    abstract getName(): string;

    abstract getSchemaName(): string;

    abstract isNativeForeignKeyConstraintSupported(): boolean;
}

/**
 * This is a container knowing what entities are registered. It is able to register and resolve based on Type | ReflectionClass | ClassType.
 *
 * This container is necessary since TypeScript interfaces have no identity (TypeObjectLiteral) and property types are not equal by identity.
 * This means there can be multiple ReflectionClass describing the same structure/type.
 * We need to do type comparison to get always the correct (registered) ReflectionClass.
 */
export class DatabaseEntityRegistry {
    protected entities: ReflectionClass<any>[] = [];

    static from(items: (Type | ReflectionClass<any> | ClassType)[]) {
        const e = new DatabaseEntityRegistry();
        e.add(...items);
        return e;
    }

    all(): ReflectionClass<any>[] {
        return this.entities;
    }

    forMigration(): ReflectionClass<any>[] {
        return this.entities.filter(v => !v.data['excludeMigration']);
    }

    add(...types: (Type | ReflectionClass<any> | ClassType)[]): void {
        for (const type of types) {
            const reflection = ReflectionClass.from(type);

            if (this.entities.indexOf(reflection) === -1) this.entities.push(reflection);
        }
    }

    remove(type: Type | ReflectionClass<any> | ClassType): void {
        const reflection = ReflectionClass.from(type);

        arrayRemoveItem(this.entities, reflection);
    }

    getFromInstance<T>(item: T): ReflectionClass<any> {
        if ((item as any).constructor === Object) {
            //search using type guards
            for (const entity of this.entities) {
                if (is(item, undefined, undefined, entity.type)) return entity;
            }

        } else {
            //it's a regular class
            return ReflectionClass.from(getClassTypeFromInstance(item));
        }

        throw new Error(`No entity for item ${stringifyValueWithType(item)} registered.`);
    }

    get(type: Type | ReflectionClass<any> | ClassType): ReflectionClass<any> {
        if (isClass(type)) {
            for (const entity of this.entities) {
                if (entity.type.kind === ReflectionKind.class && entity.type.classType === type) return entity;
            }
            throw new Error(`No entity for ${getClassName(type)} registered`);
        }

        type = type instanceof ReflectionClass ? type.type : type;
        if (type.kind !== ReflectionKind.class && type.kind !== ReflectionKind.objectLiteral) {
            throw new Error(`Only TypeClass|TypeObjectLiteral expected, but got kind ${type.kind}`);
        }

        // exact matches or nominal type match have priority
        for (const entity of this.entities) {
            if (entity.type === type) return entity;
            if (entity.type.id === type.id) return entity;
        }

        for (const entity of this.entities) {
            if (type.kind === ReflectionKind.class && entity.type.kind === ReflectionKind.class) {
                if (type.classType === entity.type.classType) {
                    //if both don't use generic, return directly
                    if (!type.typeArguments && !entity.type.typeArguments) return entity;

                    //check if generic type is compatible
                    //we could cache the result for faster lookups
                    if (isSameType(type, entity.type)) return entity;
                }
            }
            if (type.kind === ReflectionKind.objectLiteral && entity.type.kind === ReflectionKind.objectLiteral) {
                //check if type is compatible
                if (type.types.length === entity.type.types.length) {
                    //we could cache the result for faster lookups
                    if (isSameType(type, entity.type)) return entity;
                }
            }
        }
        throw new Error(`No entity for ${stringifyType(type)} registered`);
    }
}
