/*
 * Deepkit Framework
 * Copyright (C) 2021 Deepkit UG, Marc J. Schmidt
 *
 * This program is free software: you can redistribute it and/or modify
 * it under the terms of the MIT License.
 *
 * You should have received a copy of the MIT License along with this program.
 */

import { DatabaseSession, DatabaseTransaction } from './database-session.js';
import { DatabaseQueryModel, GenericQueryResolver, Query } from './query.js';
import { Changes, getSerializeFunction, ReceiveType, ReflectionClass, resolvePath, serialize, Serializer } from '@deepkit/type';
import { AbstractClassType, deletePathValue, getPathValue, setPathValue } from '@deepkit/core';
import { DatabaseAdapter, DatabaseAdapterQueryFactory, DatabaseEntityRegistry, DatabasePersistence, DatabasePersistenceChangeSet, MigrateOptions } from './database-adapter.js';
import { DeleteResult, OrmEntity, PatchResult } from './type.js';
import { findQueryList } from './utils.js';
import { convertQueryFilter } from './query-filter.js';
import { Formatter } from './formatter.js';

type SimpleStore<T> = { items: Map<any, T>, autoIncrement: number };

class MemorySerializer extends Serializer {
    name = 'memory';
}

const memorySerializer = new MemorySerializer();

// memorySerializer.fromClass.register('undefined', (property: PropertySchema, state: CompilerState) => {
//     //mongo does not support 'undefined' as column type, so we convert automatically to null
//     state.addSetter(`null`);
// });
//
// memorySerializer.toClass.register('undefined', (property: PropertySchema, state: CompilerState) => {
//     //mongo does not support 'undefined' as column type, so we store always null. depending on the property definition
//     //we convert back to undefined or keep it null
//     if (property.isOptional) return state.addSetter(`undefined`);
//     if (property.isNullable) return state.addSetter(`null`);
// });
//
// memorySerializer.fromClass.register('null', (property: PropertySchema, state: CompilerState) => {
//     //mongo does not support 'undefined' as column type, so we convert automatically to null
//     state.addSetter(`null`);
// });
//
// memorySerializer.toClass.register('null', (property: PropertySchema, state: CompilerState) => {
//     //mongo does not support 'undefined' as column type, so we store always null. depending on the property definition
//     //we convert back to undefined or keep it null
//     if (property.isOptional) return state.addSetter(`undefined`);
//     if (property.isNullable) return state.addSetter(`null`);
// });

function sortAsc(a: any, b: any) {
    if (a > b) return +1;
    if (a < b) return -1;
    return 0;
}

function sortDesc(a: any, b: any) {
    if (a > b) return -1;
    if (a < b) return +1;
    return 0;
}

function sort(items: any[], field: string, sortFn: typeof sortAsc | typeof sortAsc): void {
    items.sort((a, b) => {
        return sortFn(a[field], b[field]);
    });
}

export class MemoryQuery<T extends OrmEntity> extends Query<T> {
    protected isMemory = true;

    isMemoryDb() {
        return this.isMemory;
    }
}

const find = <T extends OrmEntity>(adapter: MemoryDatabaseAdapter, classSchema: ReflectionClass<any>, model: DatabaseQueryModel<T>): T[] => {
    const rawItems = [...adapter.getStore(classSchema).items.values()];
    const serializer = getSerializeFunction(classSchema.type, memorySerializer.deserializeRegistry);
    const items = rawItems.map(v => serializer(v));

    if (model.filter) {
        model.filter = convertQueryFilter(classSchema, model.filter, (convertClassType: ReflectionClass<any>, path: string, value: any) => {
            //this is important to convert relations to its foreignKey value
            return serialize(value, undefined, memorySerializer, undefined, resolvePath(path, classSchema.type));
        }, {}, {
            $parameter: (name, value) => {
                if (undefined === model.parameters[value]) {
                    throw new Error(`Parameter ${value} not defined in ${classSchema.getClassName()} query.`);
                }
                return model.parameters[value];
            }
        });
    }

    let filtered = model.filter ? findQueryList<T>(items, model.filter) : items;

    if (model.hasJoins()) {
        console.log('MemoryDatabaseAdapter does not support joins. Please use another lightweight adapter like SQLite.');
    }

    if (model.sort) {
        for (const [name, direction] of Object.entries(model.sort)) {
            sort(filtered, name, direction === 'asc' ? sortAsc : sortDesc);
        }
    }

    if (model.skip && model.limit) {
        filtered = filtered.slice(model.skip, model.skip + model.limit);
    } else if (model.limit) {
        filtered = filtered.slice(0, model.limit);
    } else if (model.skip) {
        filtered = filtered.slice(model.skip);
    }
    return filtered;
};

const remove = <T>(adapter: MemoryDatabaseAdapter, classSchema: ReflectionClass<T>, toDelete: T[]) => {
    const items = adapter.getStore(classSchema).items;

    const primaryKey = classSchema.getPrimary().name;
    for (const item of toDelete) {
        items.delete(item[primaryKey as keyof T] as any);
    }
};

export class MemoryQueryFactory extends DatabaseAdapterQueryFactory {
    constructor(protected adapter: MemoryDatabaseAdapter, protected databaseSession: DatabaseSession<any>) {
        super();
    }

    get scopedLogger() {
        return this.adapter.logger.scoped('deepkit:orm:memory');
    }

    createQuery<T extends OrmEntity>(classType?: ReceiveType<T> | AbstractClassType<T> | ReflectionClass<T>): MemoryQuery<T> {
        const schema = ReflectionClass.from(classType);
        const adapter = this.adapter;
        const self = this;

        class Resolver extends GenericQueryResolver<T> {
            protected createFormatter(withIdentityMap: boolean = false) {
                return new Formatter(
                    this.classSchema,
                    memorySerializer,
                    this.session.getHydrator(),
                    withIdentityMap ? this.session.identityMap : undefined
                );
            }

            async count(model: DatabaseQueryModel<T>): Promise<number> {
                self.scopedLogger.debug('count', model.filter);
                const items = find(adapter, schema, model);
                return items.length;
            }

            async delete(model: DatabaseQueryModel<T>, deleteResult: DeleteResult<T>): Promise<void> {
                self.scopedLogger.debug('delete', model.filter);
                const items = find(adapter, schema, model);
                for (const item of items) {
                    deleteResult.primaryKeys.push(item);
                }
                deleteResult.modified = items.length;
                remove(adapter, schema, items);
            }

            async find(model: DatabaseQueryModel<T>): Promise<T[]> {
                const items = find(adapter, schema, model);
                self.scopedLogger.debug('find', model.filter);
                const formatter = this.createFormatter(model.withIdentityMap);
                return items.map(v => formatter.hydrate(model, v));
            }

            async findOneOrUndefined(model: DatabaseQueryModel<T>): Promise<T | undefined> {
                const items = find(adapter, schema, model);

                if (items[0]) return this.createFormatter(model.withIdentityMap).hydrate(model, items[0]);
                return undefined;
            }

            async has(model: DatabaseQueryModel<T>): Promise<boolean> {
                const items = find(adapter, schema, model);
                return items.length > 0;
            }

            async patch(model: DatabaseQueryModel<T>, changes: Changes<T>, patchResult: PatchResult<T>): Promise<void> {
                const items = find(adapter, schema, model);
                const store = adapter.getStore(schema);
                const primaryKey = schema.getPrimary().name as keyof T;
                const serializer = getSerializeFunction(schema.type, memorySerializer.serializeRegistry);

                patchResult.modified = items.length;
                for (const item of items) {
                    const oldPrimary = item[primaryKey];
                    if (changes.$inc) {
                        for (const [path, v] of Object.entries(changes.$inc)) {
                            setPathValue(item, path, getPathValue(item, path) + v);
                        }
                    }

                    if (changes.$unset) {
                        for (const path of Object.keys(changes.$unset)) {
                            deletePathValue(item, path);
                        }
                    }

                    if (changes.$set) {
                        for (const [path, v] of Object.entries(changes.$set)) {
                            setPathValue(item, path, v);
                        }
                    }

                    if (model.returning) {
                        for (const f of model.returning) {
                            if (!patchResult.returning[f]) patchResult.returning[f] = [];
                            const v = patchResult.returning[f];
                            if (v) v.push(item[f]);
                        }
                    }

                    patchResult.primaryKeys.push(item);
                    store.items.set(item[primaryKey] as any, serializer(item));
                    if (oldPrimary !== item[primaryKey]) {
                        // we changed the primary key, so we need to remove the old one
                        store.items.delete(oldPrimary as any);
                    }
                }
            }
        }


        return new MemoryQuery(ReflectionClass.from(classType), this.databaseSession, new Resolver(ReflectionClass.from(classType), this.databaseSession));
    }
}

export class MemoryDatabaseTransaction extends DatabaseTransaction {
    async begin(): Promise<void> {
    }

    async commit(): Promise<void> {
    }

    async rollback(): Promise<void> {
    }
}

export class MemoryPersistence extends DatabasePersistence {
    constructor(private adapter: MemoryDatabaseAdapter) {
        super();
    }

    async remove<T extends OrmEntity>(classSchema: ReflectionClass<T>, items: T[]): Promise<void> {
        const store = this.adapter.getStore(classSchema);

        const primaryKey = classSchema.getPrimary().name as keyof T;
        for (const item of items) {
            store.items.delete(item[primaryKey] as any);
        }
    }

    async insert<T extends OrmEntity>(classSchema: ReflectionClass<T>, items: T[]): Promise<void> {
        const store = this.adapter.getStore(classSchema);
        const serializer = getSerializeFunction(classSchema.type, memorySerializer.serializeRegistry);
        const autoIncrement = classSchema.getAutoIncrement();

        const primaryKey = classSchema.getPrimary().name as keyof T;
        for (const item of items) {
            if (autoIncrement) {
                store.autoIncrement++;
                item[autoIncrement.name as keyof T & string] = store.autoIncrement as any;
            }
            store.items.set(item[primaryKey] as any, serializer(item));
        }
    }

    async update<T extends OrmEntity>(classSchema: ReflectionClass<T>, changeSets: DatabasePersistenceChangeSet<T>[]): Promise<void> {
        const store = this.adapter.getStore(classSchema);
        const serializer = getSerializeFunction(classSchema.type, memorySerializer.serializeRegistry);
        const primaryKey = classSchema.getPrimary().name as keyof T;

        for (const changeSet of changeSets) {
            store.items.set(changeSet.item[primaryKey] as any, serializer(changeSet.item));
        }
    }

    async release() {

    }
}

export class MemoryDatabaseAdapter extends DatabaseAdapter {
    protected store = new Map<ReflectionClass<any>, SimpleStore<any>>();

    async migrate(options: MigrateOptions, entityRegistry: DatabaseEntityRegistry) {
    }

    isNativeForeignKeyConstraintSupported(): boolean {
        return false;
    }

    createTransaction(session: DatabaseSession<this>): MemoryDatabaseTransaction {
        return new MemoryDatabaseTransaction();
    }

    getStore<T>(classSchema: ReflectionClass<T>): SimpleStore<T> {
        let store = this.store.get(classSchema);
        if (!store) {
            store = { items: new Map, autoIncrement: 0 };
            this.store.set(classSchema, store);
        }
        return store;
    }

    createPersistence(): DatabasePersistence {
        return new MemoryPersistence(this);
    }

    disconnect(force?: boolean): void {
    }

    getName(): string {
        return 'memory';
    }

    getSchemaName(): string {
        return '';
    }

    queryFactory(databaseSession: DatabaseSession<this>): MemoryQueryFactory {
        return new MemoryQueryFactory(this, databaseSession);
    }
}
