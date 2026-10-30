/*
 * Deepkit Framework
 * Copyright (C) 2021 Deepkit UG, Marc J. Schmidt
 *
 * This program is free software: you can redistribute it and/or modify
 * it under the terms of the MIT License.
 *
 * You should have received a copy of the MIT License along with this program.
 */

/**
 * Query string parser compatible with the default behavior of `qs.parse`.
 *
 * Supports nested objects (`a[b]=1`), arrays (`a[]=1`, `a[0]=1`) and duplicate keys (`a=1&a=2` becomes an array).
 *
 * Limits:
 * - at most 1000 parameters are parsed, the rest is ignored
 * - at most 5 levels of nesting, the remainder is used as literal key (`a[b][c][d][e][f][g]` → `a.b.c.d.e.f['[g]']`)
 * - array indices above 20 create object keys instead of sparse arrays (`a[100]=1` → `{a: {100: '1'}}`)
 *
 * Keys that exist on Object.prototype (`__proto__`, `constructor`, `toString`, `hasOwnProperty`, ...) are dropped.
 */
const parameterLimit = 1000;
const depthLimit = 5;
const arrayLimit = 20;

const has = Object.prototype.hasOwnProperty;
const isArray = Array.isArray;

function decode(str: string): string {
    const withoutPlus = str.replace(/\+/g, ' ');
    try {
        return decodeURIComponent(withoutPlus);
    } catch {
        return withoutPlus;
    }
}

function parseValues(str: string): Record<string, any> {
    const obj: Record<string, any> = Object.create(null);
    const parts = str.replace(/%5B/gi, '[').replace(/%5D/gi, ']').split('&', parameterLimit);

    for (const part of parts) {
        const bracketEqualsPos = part.indexOf(']=');
        const pos = bracketEqualsPos === -1 ? part.indexOf('=') : bracketEqualsPos + 1;

        const key = decode(pos === -1 ? part : part.slice(0, pos));
        const val = pos === -1 ? '' : decode(part.slice(pos + 1));

        obj[key] = has.call(obj, key) ? ([] as any[]).concat(obj[key], val) : val;
    }

    return obj;
}

function parseObject(chain: string[], val: any): any {
    let leaf = val;

    for (let i = chain.length - 1; i >= 0; --i) {
        let obj: any;
        const root = chain[i];

        if (root === '[]') {
            obj = ([] as any[]).concat(leaf);
        } else {
            obj = {};
            const cleanRoot = root.charAt(0) === '[' && root.charAt(root.length - 1) === ']' ? root.slice(1, -1) : root;
            const index = parseInt(cleanRoot, 10);
            if (
                !isNaN(index) &&
                root !== cleanRoot &&
                String(index) === cleanRoot &&
                index >= 0 &&
                index <= arrayLimit
            ) {
                obj = [];
                obj[index] = leaf;
            } else if (cleanRoot !== '__proto__') {
                obj[cleanRoot] = leaf;
            }
        }

        leaf = obj;
    }

    return leaf;
}

function parseKeys(key: string, val: any): any {
    if (!key) return;

    const brackets = /(\[[^[\]]*])/;
    const child = /(\[[^[\]]*])/g;

    let segment = brackets.exec(key);
    const parent = segment ? key.slice(0, segment.index) : key;

    const keys: string[] = [];
    if (parent) {
        if (has.call(Object.prototype, parent)) return;
        keys.push(parent);
    }

    let i = 0;
    while ((segment = child.exec(key)) !== null && i < depthLimit) {
        i += 1;
        if (has.call(Object.prototype, segment[1].slice(1, -1))) return;
        keys.push(segment[1]);
    }

    // depth limit reached, the remainder is used as literal key
    if (segment) keys.push('[' + key.slice(segment.index) + ']');

    return parseObject(keys, val);
}

function arrayToObject(source: any[]): Record<string, any> {
    const obj: Record<string, any> = {};
    for (let i = 0; i < source.length; ++i) {
        if (source[i] !== undefined) obj[i] = source[i];
    }
    return obj;
}

function merge(target: any, source: any): any {
    if (!source) return target;

    if (typeof source !== 'object') {
        if (isArray(target)) {
            target.push(source);
        } else if (target && typeof target === 'object') {
            if (!has.call(Object.prototype, source)) target[source] = true;
        } else {
            return [target, source];
        }
        return target;
    }

    if (!target || typeof target !== 'object') {
        return [target].concat(source);
    }

    if (isArray(target) && isArray(source)) {
        source.forEach((item, i) => {
            if (has.call(target, i)) {
                const targetItem = target[i];
                if (targetItem && typeof targetItem === 'object' && item && typeof item === 'object') {
                    target[i] = merge(targetItem, item);
                } else {
                    target.push(item);
                }
            } else {
                target[i] = item;
            }
        });
        return target;
    }

    const mergeTarget = isArray(target) && !isArray(source) ? arrayToObject(target) : target;
    for (const key of Object.keys(source)) {
        mergeTarget[key] = has.call(mergeTarget, key) ? merge(mergeTarget[key], source[key]) : source[key];
    }
    return mergeTarget;
}

/**
 * Removes holes from (sparse) arrays, e.g. `a[1]=x` results in `['x']`, not `[undefined, 'x']`.
 */
function compact(value: Record<string, any>): Record<string, any> {
    const queue: { obj: any; prop: string }[] = [{ obj: { o: value }, prop: 'o' }];
    const refs: any[] = [];

    for (let i = 0; i < queue.length; ++i) {
        const obj = queue[i].obj[queue[i].prop];
        for (const key of Object.keys(obj)) {
            const val = obj[key];
            if (typeof val === 'object' && val !== null && refs.indexOf(val) === -1) {
                queue.push({ obj, prop: key });
                refs.push(val);
            }
        }
    }

    while (queue.length > 1) {
        const item = queue.pop()!;
        const obj = item.obj[item.prop];
        if (isArray(obj)) item.obj[item.prop] = obj.filter(v => v !== undefined);
    }

    return value;
}

/**
 * Parses a query string (without leading `?`) into an object.
 *
 * `a=1&b[c]=2&d[]=3&d[]=4` → `{a: '1', b: {c: '2'}, d: ['3', '4']}`
 */
export function parseQueryString(str: string): Record<string, any> {
    if (!str) return {};

    const values = parseValues(str);
    let obj: Record<string, any> = {};
    for (const key of Object.keys(values)) {
        obj = merge(obj, parseKeys(key, values[key]));
    }

    return compact(obj);
}
