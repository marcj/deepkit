/*
 * Deepkit Framework
 * Copyright (C) 2021 Deepkit UG, Marc J. Schmidt
 *
 * This program is free software: you can redistribute it and/or modify
 * it under the terms of the MIT License.
 *
 * You should have received a copy of the MIT License along with this program.
 */

import { Changes, PrimaryKeyFields, PrimaryKeyType, ReflectionClass, ValidationErrorItem } from '@deepkit/type';
import { CustomError } from '@deepkit/core';
import { DatabasePersistenceChangeSet } from './database-adapter.js';
import { DatabaseQueryModel } from './query.js';

export interface OrmEntity {
}

export type PatchResult<T> = { modified: number, returning: { [name in keyof T & string]?: T[name][] }, primaryKeys: PrimaryKeyType<T>[] };
export class DatabaseError extends CustomError {
}

/**
 * Thrown when DeleteResult.primaryKeys is read without the query having called returnPrimaryKeys().
 */
export class PrimaryKeysNotReturnedError extends DatabaseError {
}

/**
 * The result of a delete query. It is also what a database adapter fills in its delete().
 */
export class DeleteResult<T> {
    /**
     * How many items were deleted.
     */
    modified: number = 0;

    /**
     * The primary keys of the deleted items. Reading this throws PrimaryKeysNotReturnedError
     * if the query did not call returnPrimaryKeys().
     */
    declare readonly primaryKeys: PrimaryKeyFields<T>[];

    #load: boolean = false;
    #keys: PrimaryKeyFields<T>[] = [];

    constructor(entityName: string) {
        // own and enumerable, so that spreading or serializing the result can't silently lose the keys
        Object.defineProperty(this, 'primaryKeys', {
            enumerable: true,
            configurable: true,
            get(): never {
                throw new PrimaryKeysNotReturnedError(`The primary keys of the deleted ${entityName} items are not available. Call returnPrimaryKeys() on the query.`);
            },
        });
    }

    /**
     * Loads the primary keys and makes them readable in `primaryKeys`.
     * Called for queries with returnPrimaryKeys().
     */
    returnPrimaryKeys(): void {
        this.#load = true;
        Object.defineProperty(this, 'primaryKeys', { value: this.#keys, enumerable: true, configurable: true });
    }

    /**
     * Loads the primary keys for internal use without making `primaryKeys` readable, so that whether
     * user code may read them does not depend on the session state or the registered plugins.
     * A listener of Query.onDeletePre calls this to get them in `loadedPrimaryKeys` in Query.onDeletePost.
     */
    loadPrimaryKeys(): void {
        this.#load = true;
    }

    /**
     * Whether the database adapter has to report the deleted primary keys with addPrimaryKey().
     * When false, it should not read them at all.
     */
    get shouldLoadPrimaryKeys(): boolean {
        return this.#load;
    }

    addPrimaryKey(primaryKey: PrimaryKeyFields<T>): void {
        this.#keys.push(primaryKey);
    }

    /**
     * The keys loaded so far. Empty when nothing requested them. Never throws.
     */
    get loadedPrimaryKeys(): PrimaryKeyFields<T>[] {
        return this.#keys;
    }
}

/**
 * Wraps whatever error into a DatabaseError, if it's not already a DatabaseError.
 */
export function ensureDatabaseError(error: Error | string): Error {
    if ('string' === typeof error) return new DatabaseError(error);
    if (error instanceof DatabaseError) return error;

    return new DatabaseError(error.message, { cause: error });
}

export class DatabaseInsertError extends DatabaseError {
    constructor(
        public readonly entity: ReflectionClass<any>,
        public readonly items: OrmEntity[],
        ...args: ConstructorParameters<typeof DatabaseError>
    ) {
        super(...args);
    }
}

export class DatabaseUpdateError extends DatabaseError {
    constructor(
        public readonly entity: ReflectionClass<any>,
        public readonly changeSets: DatabasePersistenceChangeSet<any>[],
        ...args: ConstructorParameters<typeof DatabaseError>
    ) {
        super(...args);
    }
}

export class DatabasePatchError extends DatabaseError {
    constructor(
        public readonly entity: ReflectionClass<any>,
        public readonly query: DatabaseQueryModel<any>,
        public readonly changeSets: Changes<any>,
        ...args: ConstructorParameters<typeof DatabaseError>
    ) {
        super(...args);
    }
}

export class DatabaseDeleteError extends DatabaseError {
    public readonly query?: DatabaseQueryModel<any>;
    public readonly items?: OrmEntity[];

    constructor(
        public readonly entity: ReflectionClass<any>,
        ...args: ConstructorParameters<typeof DatabaseError>
    ) {
        super(...args);
    }
}

export class DatabaseValidationError extends DatabaseError {
    constructor(
        public readonly classSchema: ReflectionClass<any>,
        public readonly errors: ValidationErrorItem[],
    ) {
        super(`Validation error for class ${classSchema.name || classSchema.getClassName()}:\n${errors.map(v => v.toString()).join(',\n')}`);
    }
}

export class UniqueConstraintFailure extends DatabaseError {
}
