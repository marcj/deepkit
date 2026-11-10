/*
 * Deepkit Framework
 * Copyright (C) 2021 Deepkit UG, Marc J. Schmidt
 *
 * This program is free software: you can redistribute it and/or modify
 * it under the terms of the MIT License.
 *
 * You should have received a copy of the MIT License along with this program.
 */
import { ClassType, arrayRemoveItem, deletePathValue, getPathValue, setPathValue } from '@deepkit/core';
import { ReflectionClass, TypeObjectLiteral, getPartialSerializeFunction, serializer } from '@deepkit/type';

import {
    EntityPatch,
    EntitySubject,
    IdType,
    IdVersionInterface,
    RpcError,
    rpcEntityPatch,
    rpcEntityRemove,
} from '../model.js';

export class EntitySubjectStore<T extends IdVersionInterface> {
    store = new Map<IdType, { item: T; forks: EntitySubject<T>[] }>();
    onCreation = new Map<IdType, { calls: Function[] }>();

    protected partialDeserializer = getPartialSerializeFunction(
        ReflectionClass.from(this.classType).type,
        serializer.deserializeRegistry,
    );

    constructor(protected classType: ClassType) {}

    public isRegistered(id: IdType): boolean {
        return this.store.has(id);
    }

    public register(item: T): void {
        this.store.set(item.id, { item: item, forks: [] });
        const store = this.onCreation.get(item.id);
        if (store) {
            for (const c of store.calls) c();
            this.onCreation.delete(item.id);
        }
    }

    public deregister(id: IdType): void {
        this.store.delete(id);
    }

    public getItem(id: IdType): T | undefined {
        return this.store.get(id)?.item;
    }

    protected registerOnCreation(id: IdType, call: Function) {
        let store = this.onCreation.get(id);
        if (!store) {
            store = { calls: [] };
            this.onCreation.set(id, store);
        }
        store.calls.push(call);
    }

    public onDelete(id: IdType): void {
        const store = this.store.get(id);
        if (!store) return;
        for (const fork of store.forks) {
            fork.delete.next(true);
        }
        this.deregister(id);
    }

    public onSet(id: IdType, item: T): void {
        const store = this.store.get(id);
        if (!store) {
            this.registerOnCreation(id, () => this.onSet(id, item));
            return;
        }

        store.item = item;
        for (const fork of store.forks) {
            fork.next(item);
        }
    }

    public onPatch(id: IdType, version: number, patch: EntityPatch): void {
        const store = this.store.get(id);
        if (!store) {
            //it might happen that we receive patches before we actually have the entity registered
            //in this case, we schedule the same call for later, when the actual item is registered.
            this.registerOnCreation(id, () => this.onPatch(id, version, patch));
            return;
        }

        if (store.item.version === version) {
            return;
        }

        store.item.version = version;

        if (patch.$set) {
            //todo: this needs a patch version, with dotted path support like we did before
            const $set = this.partialDeserializer(patch.$set);

            for (const i in $set) {
                setPathValue(store.item, i, $set[i]);
            }
        }

        if (patch.$inc)
            for (const i in patch.$inc) {
                if (i === 'version') continue;
                setPathValue(store.item, i, getPathValue(store.item, i) + patch.$inc[i]);
            }

        if (patch.$unset)
            for (const i in patch.$unset) {
                deletePathValue(store.item, i);
            }

        for (const fork of store.forks) {
            fork.patches.next(patch);
            fork.next(store.item);
        }
    }

    protected forkUnregistered(id: IdType, fork: EntitySubject<T>) {
        const store = this.store.get(id);
        if (!store) return;
        arrayRemoveItem(store.forks, fork);

        if (store.forks.length === 0) {
            this.deregister(id);
        }
    }

    /**
     * Before calling createFork you must be sure the item is already registered.
     */
    public createFork(id: IdType): EntitySubject<T> {
        let store = this.store.get(id);
        if (!store) throw new RpcError('Could not create fork from unknown item ' + id);

        const fork = new EntitySubject<T>(store.item, () => {
            this.forkUnregistered(id, fork);
        });
        store.forks.push(fork);

        return fork;
    }

    public getForkCount(id: IdType): number {
        const store = this.store.get(id);
        return store ? store.forks.length : 0;
    }

    public getEntitySubjectCount(): number {
        return this.store.size;
    }
}

export class EntityState {
    private readonly store = new Map<ClassType, EntitySubjectStore<any>>();
    private readonly storeByName = new Map<string, EntitySubjectStore<any>>();

    public getStore<T extends IdVersionInterface>(classType: ClassType<T>): EntitySubjectStore<T> {
        let store = this.store.get(classType);

        if (!store) {
            store = new EntitySubjectStore(classType);
            this.store.set(classType, store);
            this.storeByName.set(ReflectionClass.from(classType).getName(), store);
        }

        return store;
    }

    public getStoreByName<T extends IdVersionInterface>(name: string): EntitySubjectStore<T> {
        let store = this.storeByName.get(name);
        if (!store) throw new RpcError(`No store for entity ${name}`);

        return store;
    }

    public onEntityPatch(body: rpcEntityPatch): void {
        //todo, use specialized ClassSchema, so we get correct instance types returned. We need however first deepkit/bson patch support
        // at the moment this happens in onPatch using jsonSerializer
        this.getStoreByName(body.entityName).onPatch(body.id, body.version, body.patch);
    }

    public onEntityRemove(body: rpcEntityRemove): void {
        const store = this.getStoreByName(body.entityName);
        for (const id of body.ids) store.onDelete(id);
    }
}
