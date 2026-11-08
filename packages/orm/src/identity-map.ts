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
    changeSetSymbol,
    getChangeDetector,
    getConverterForSnapshot,
    getPrimaryKeyExtractor,
    getPrimaryKeyHashGenerator,
    getSimplePrimaryKeyHashGenerator,
    JSONPartial,
    PrimaryKeyFields,
    ReflectionClass
} from '@deepkit/type';
import { OrmEntity } from './type.js';
import { getClassTypeFromInstance, isObject, toFastProperties } from '@deepkit/core';

export function getNormalizedPrimaryKey(schema: ReflectionClass<any>, primaryKey: any) {
    const primaryFields = schema.getPrimaries();

    if (primaryFields.length > 1) {
        if (!isObject(primaryKey)) {
            throw new Error(`Entity ${schema.getClassName()} has composite primary key. Please provide primary key as object, e.g. {pk1: value, pk2: value2}.`);
        }
        const res: { [name: string]: any } = {};
        for (const primaryField of primaryFields) {
            res[primaryField.getNameAsString()] = primaryKey[primaryField.getNameAsString()];
        }
        return res;
    } else {
        const first = primaryFields[0];
        if (isObject(primaryKey) && (primaryKey as any)[first.getNameAsString()] !== undefined) {
            return { [first.getNameAsString()]: (primaryKey as any)[first.getNameAsString()] };
        } else {
            return { [first.getNameAsString()]: primaryKey };
        }
    }
}

export class ClassState<T = any> {
    public snapshot = getConverterForSnapshot(this.classSchema);
    public primaryKeyExtractor = getPrimaryKeyExtractor(this.classSchema);
    public primaryKeyHashGenerator = getPrimaryKeyHashGenerator(this.classSchema);
    public simplePrimaryKeyHashGenerator = getSimplePrimaryKeyHashGenerator(this.classSchema);
    public changeDetector = getChangeDetector(this.classSchema);

    constructor(public classSchema: ReflectionClass<T>) {
    }
}

export function getClassState<T>(classSchema: ReflectionClass<T>): ClassState<T> {
    if (classSchema.data.classState) return classSchema.data.classState;
    classSchema.data.classState = new ClassState(classSchema);
    toFastProperties(classSchema.data);
    return classSchema.data.classState;
}

class InstanceState<T extends OrmEntity> {
    /**
     * Whether current state is known in database.
     */
    knownInDatabase: boolean = false;

    /**
     * This represents the last known values known to be in the database.
     * The data is used for change-detection + last known primary key extraction.
     * References store only its primary keys.
     */
    snapshot?: JSONPartial<T>;

    hydrator?: (item: T) => Promise<T>

    /**
     * Whether the item was originally from the database (and thus PK are known there).
     */
    fromDatabase: boolean = false;
    protected lastPKHash?: string;

    constructor(public classState: ClassState<T>, public item: T) {
    }

    //we support browser environment, so there is `inspect` not available
    [Symbol.for('nodejs.util.inspect.custom')]() {
        return `InstanceState<knownInDatabase=${this.knownInDatabase}, fromDatabase=${this.fromDatabase}>`;
    }

    toString(): string {
        return `knownInDatabase: ${this.knownInDatabase}`;
    }

    getSnapshot(): JSONPartial<T> {
        if (!this.snapshot) this.snapshot = this.classState.snapshot(this.item);
        return this.snapshot!;
    }

    isFromDatabase() {
        return this.fromDatabase;
    }

    isKnownInDatabase(): boolean {
        return this.knownInDatabase;
    }

    markAsFromDatabase() {
        this.fromDatabase = true;
    }

    markAsPersisted() {
        this.knownInDatabase = true;
        this.lastPKHash = undefined; //mark it for generation on-demand

        //This is pretty heavy and only necessary when the user works with the objects
        //but that is not always the case. So we need a way to postpone those
        //calls to a place where we know we need them. For example return
        //not the real object but a Proxy and detect write-operations. As soon
        //a write operation is detected, we create a snapshot. Essentially implement copy-on-write,
        //or in our case snapshot-on-write.
        this.snapshot = this.classState.snapshot(this.item);

        if ((this.item as any)[changeSetSymbol]) (this.item as any)[changeSetSymbol].clear();
    }

    getLastKnownPK(): Partial<T> {
        return this.classState.primaryKeyExtractor(this.snapshot);
    }

    getLastKnownPKHash(): string {
        if (this.lastPKHash === undefined) {
            this.lastPKHash = this.classState.primaryKeyHashGenerator(this.snapshot);
        }
        return this.lastPKHash;
    }

    markAsDeleted() {
        this.knownInDatabase = false;
    }
}

const instanceStateSymbol = Symbol('state');

export function getInstanceStateFromItem<T extends OrmEntity>(item: T): InstanceState<T> {
    return getInstanceState(getClassState(ReflectionClass.from(getClassTypeFromInstance(item))), item);
}

export function getInstanceState<T extends OrmEntity>(classState: ClassState<T>, item: T): InstanceState<T> {
    //this approach is up to 60-90x faster than a WeakMap
    if (!(item as any)['constructor'].prototype.hasOwnProperty(instanceStateSymbol)) {
        Object.defineProperty((item as any)['constructor'].prototype, instanceStateSymbol, {
            writable: true,
            enumerable: false,
            value: null
        });
    }

    if (!(item as any)['constructor'].prototype.hasOwnProperty(changeSetSymbol)) {
        Object.defineProperty((item as any)['constructor'].prototype, changeSetSymbol, {
            writable: true,
            enumerable: false,
            value: null
        });
    }

    if (!(item as any)[instanceStateSymbol]) {
        (item as any)[instanceStateSymbol] = new InstanceState(classState, item);
    }
    return (item as any)[instanceStateSymbol];
}

export type PKHash = string;
type Store = {
    ref: any,
    stale: boolean
};

export class IdentityMap {
    registry = new Map<ReflectionClass<any>, Map<PKHash, Store>>();

    deleteMany<T>(classSchema: ReflectionClass<T>, pks: Partial<T>[]) {
        const store = this.getStore(classSchema);
        const state = getClassState(classSchema);
        for (const pk of pks) {
            const pkHash = state.primaryKeyHashGenerator(pk);
            let item = store.get(pkHash);

            if (item) {
                store.delete(pkHash);
                getInstanceState(state, item.ref).markAsDeleted();
            }
        }
    }

    deleteManyBySimplePK<T>(classSchema: ReflectionClass<T>, pks: PrimaryKeyFields<any>[]) {
        const store = this.getStore(classSchema);
        const state = getClassState(classSchema);

        for (const pk of pks) {
            const pkHash = state.simplePrimaryKeyHashGenerator(pk);
            let item = store.get(pkHash);
            if (item) {
                store.delete(pkHash);
                getInstanceState(state, item.ref).markAsDeleted();
            }
        }
    }

    /**
     * Whether items of this entity are known, and thus have to be removed when they are deleted.
     */
    hasItems(classSchema: ReflectionClass<any>): boolean {
        const store = this.registry.get(classSchema);
        return store !== undefined && store.size > 0;
    }

    clear<T>() {
        this.registry.clear();
    }

    isKnown<T extends OrmEntity>(item: T): boolean {
        const classSchema = ReflectionClass.from(getClassTypeFromInstance(item));
        const store = this.getStore(classSchema);
        const state = getClassState(classSchema);

        const pkHash = getInstanceState(state, item).getLastKnownPKHash();

        return store.has(pkHash);
    }

    storeMany<T>(classSchema: ReflectionClass<T>, items: T[]) {
        if (!classSchema.hasPrimary()) throw new Error(`Entity ${classSchema.getClassName()} has no primary field defined. Use @f.primary to defined one.`);
        const store = this.getStore(classSchema);
        const state = getClassState(classSchema);

        for (const item of items) {
            const pkHash = state.primaryKeyHashGenerator(item);
            store.set(pkHash, { ref: item, stale: false });
            getInstanceState(state as ClassState<any>, item).markAsPersisted();
        }
    }

    store<T>(classSchema: ReflectionClass<T>, item: T) {
        this.storeMany(classSchema, [item]);
    }

    getByHash<T>(classSchema: ReflectionClass<T>, pk: PKHash): T | undefined {
        const store = this.getStore(classSchema);

        return store.has(pk) ? store.get(pk)!.ref : undefined;
    }

    protected getStore(classSchema: ReflectionClass<any>): Map<PKHash, Store> {
        const store = this.registry.get(classSchema);
        if (store) {
            return store;
        }

        const newStore = new Map();
        this.registry.set(classSchema, newStore);
        return newStore;
    }
}
