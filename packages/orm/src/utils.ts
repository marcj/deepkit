/*
 * Deepkit Framework
 * Copyright (C) 2021 Deepkit UG, Marc J. Schmidt
 *
 * This program is free software: you can redistribute it and/or modify
 * it under the terms of the MIT License.
 *
 * You should have received a copy of the MIT License along with this program.
 */

import { Changes, getSerializeFunction, PrimaryKeyFields, ReflectionClass, TemplateRegistry } from '@deepkit/type';
import { OrmEntity } from './type.js';
import { FilterQuery } from './query.js';
import { getInstanceStateFromItem } from './identity-map.js';
import { createQueryMatcher } from './query-match.js';

export type FlattenIfArray<T> = T extends Array<any> ? T[0] : T;
export type FieldName<T> = keyof T & string;

export function getClassSchemaInstancePairs<T extends OrmEntity>(items: Iterable<[ReflectionClass<any>, T]>): Map<ReflectionClass<any>, T[]> {
    const map = new Map<ReflectionClass<any>, T[]>();

    for (const [classSchema, item] of items) {
        let items = map.get(classSchema);
        if (!items) {
            items = [];
            map.set(classSchema, items);
        }
        items.push(item);
    }

    return map;
}


export function findQuerySatisfied<T extends { [index: string]: any }>(target: T, query: FilterQuery<T>): boolean {
    return createQueryMatcher(query)(target);
}

export function findQueryList<T extends { [index: string]: any }>(items: T[], query: FilterQuery<T>): T[] {
    return items.filter(createQueryMatcher(query));
}

export type Placeholder<T> = () => T;
export type Resolve<T extends { _: Placeholder<any> }> = ReturnType<T['_']>;
export type Replace<T, R> = T & { _: Placeholder<R> };

export function buildChangesFromInstance<T extends object>(item: T): Changes<T> {
    const state = getInstanceStateFromItem(item);
    const lastSnapshot = state.getSnapshot();
    const currentSnapshot = state.classState.snapshot(item);
    return state.classState.changeDetector(lastSnapshot, currentSnapshot, item) || new Changes;
}

/**
 * Converts a scala value to a primary key fields object.
 */
export function primaryKeyObjectConverter(classSchema: ReflectionClass<any>, templateRegistry: TemplateRegistry): (data: any) => PrimaryKeyFields<any> {
    const primary = classSchema.getPrimary();
    const primaryKeyConverted = getSerializeFunction(primary.property, templateRegistry);

    return (data) => {
        return { [primary.name]: primaryKeyConverted(data) };
    };
}
