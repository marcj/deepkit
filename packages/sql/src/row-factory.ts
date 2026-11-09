/*
 * Deepkit Framework
 * Copyright (C) 2021 Deepkit UG, Marc J. Schmidt
 *
 * This program is free software: you can redistribute it and/or modify
 * it under the terms of the MIT License.
 *
 * You should have received a copy of the MIT License along with this program.
 */

import { CompilerContext } from '@deepkit/core';

import { LruCache } from './lru-cache.js';

export type RowFactory = (values: any[]) => any;

const rowFactories = new LruCache<RowFactory>(1024);

/**
 * Returns a function that turns the column values of a row into an object with the given column names.
 *
 * Drivers are faster when they return arrays, and all rows of a factory share one object shape,
 * which makes reading them in the deserializer faster too. As with a driver that returns objects,
 * the last column wins when a name is used twice.
 */
export function getRowFactory(names: string[]): RowFactory {
    //column names never contain a NUL byte
    const key = names.join('\0');
    let factory = rowFactories.get(key);
    if (factory) return factory;

    const properties = names.map((name, i) => {
        //a plain `__proto__: x` in an object literal would set the prototype
        const key = name === '__proto__' ? '["__proto__"]' : JSON.stringify(name);
        return `${key}: values[${i}]`;
    });
    factory = new CompilerContext().build(`return {${properties.join(', ')}};`, 'values') as RowFactory;
    rowFactories.set(key, factory);
    return factory;
}

/**
 * Replaces each array in rows, in place, with its object.
 */
export function createRows(rows: any[][], factory: RowFactory): any[] {
    for (let i = 0; i < rows.length; i++) rows[i] = factory(rows[i]);
    return rows;
}
