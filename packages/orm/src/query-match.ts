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
 * In-memory matching of Mongo-style filter queries (FilterQuery), as used by the memory adapter.
 *
 * Semantics follow the previously used `sift` v7: array values match when any element matches,
 * nested paths ('a.b.c') traverse arrays, Date and toJSON() values (ObjectId, UUID, ...) are compared by value.
 */

type Operator = (a: any, b: any, k: any, o: any) => boolean;

interface Validator {
    a: any;
    v: Operator;
}

function comparable(value: any): any {
    if (value instanceof Date) return value.getTime();
    if (Array.isArray(value)) return value.map(comparable);
    if (value && typeof value.toJSON === 'function') return value.toJSON();
    return value;
}

function compare(a: any, b: any): number | undefined {
    if (a === b) return 0;
    if (typeof a === typeof b) {
        if (a > b) return 1;
        if (a < b) return -1;
    }
    return undefined;
}

function validate(validator: Validator, b: any, k?: any, o?: any): boolean {
    return validator.v(validator.a, b, k, o);
}

/**
 * Matches if b or any of its elements (when b is a non-empty array) matches.
 */
function or(validator: (a: any, b: any) => boolean): Operator {
    return (a, b) => {
        if (!Array.isArray(b) || !b.length) return validator(a, b);
        for (const item of b) if (validator(a, item)) return true;
        return false;
    };
}

/**
 * Matches if b and all of its elements (when b is a non-empty array) match.
 */
function and(validator: (a: any, b: any) => boolean): Operator {
    return (a, b) => {
        if (!Array.isArray(b) || !b.length) return validator(a, b);
        for (const item of b) if (!validator(a, item)) return false;
        return true;
    };
}

const operators: { [name: string]: Operator } = {
    $eq: or((a, b) => a(b)),
    $ne: and((a, b) => !a(b)),
    $gt: or((a, b) => (compare(comparable(b), a) as number) > 0),
    $gte: or((a, b) => (compare(comparable(b), a) as number) >= 0),
    $lt: or((a, b) => (compare(comparable(b), a) as number) < 0),
    $lte: or((a, b) => (compare(comparable(b), a) as number) <= 0),
    $mod: or((a, b) => b % a[0] == a[1]),
    $in(a: any[], b: any): boolean {
        if (Array.isArray(b)) {
            for (const item of b) if (a.includes(comparable(item))) return true;
            return false;
        }

        const comparableB = comparable(b);
        if (comparableB === b && typeof b === 'object') {
            //objects that are not plain, e.g. {$in: [objectId]}
            for (const item of a) if (String(item) === String(b) && String(b) !== '[object Object]') return true;
        }

        //undefined matches a null in the list
        if (comparableB === undefined) {
            for (const item of a) if (item == null) return true;
        }

        //handles {$in: [/regex1/, /regex2/]}
        for (const item of a) {
            if (validate(parse(item), b) && String(b) !== '[object Object]') return true;
        }

        return a.includes(comparableB);
    },
    $nin: (a, b, k, o) => !operators.$in(a, b, k, o),
    $not: (a, b, k, o) => !validate(a, b, k, o),
    $all: (a, b, k, o) => operators.$and(a, b, k, o),
    $size: (a, b) => (b ? a === b.length : false),
    $or(a: Validator[], b, k, o) {
        for (const validator of a) if (validate(validator, b, k, o)) return true;
        return false;
    },
    $nor: (a, b, k, o) => !operators.$or(a, b, k, o),
    $and(a: Validator[], b, k, o) {
        for (const validator of a) if (!validate(validator, b, k, o)) return false;
        return true;
    },
    $regex: or((a, b) => typeof b === 'string' && a.test(b)),
    $elemMatch(a: Validator, b, k, o) {
        if (Array.isArray(b)) return b.some(item => validate(a, item));
        return validate(a, b, k, o);
    },
    $exists: (a, b, k, o) => (o != null && Object.prototype.hasOwnProperty.call(o, k)) === a,
};

const prepare: { [name: string]: (a: any, query: any) => any } = {
    $eq(a: any) {
        if (a instanceof RegExp) return (b: any) => typeof b === 'string' && a.test(b);
        if (a instanceof Function) return a;
        //{field: []} only matches empty arrays
        if (Array.isArray(a) && !a.length) return (b: any) => Array.isArray(b) && !b.length;
        //null matches null and undefined
        if (a === null) return (b: any) => b == null;
        return (b: any) => compare(comparable(b), comparable(a)) === 0;
    },
    $ne: a => prepare.$eq(a, undefined),
    $and: (a: any[]) => a.map(parse),
    $all: (a: any[]) => a.map(parse),
    $or: (a: any[]) => a.map(parse),
    $nor: (a: any[]) => a.map(parse),
    $not: a => parse(a),
    $regex: (a, query) => new RegExp(a, query.$options),
    $elemMatch: a => parse(a),
    $exists: a => !!a,
};

function findValues(current: any, path: string[], index: number, object: any, values: [any, any, any][]): void {
    if (index === path.length || current == undefined) {
        values.push([current, path[index - 1], object]);
        return;
    }

    const k = path[index];
    //if current is an array and k is not an index, look into each element: {'foo.bar': 1} matches {foo: [{bar: 1}]}
    if (Array.isArray(current) && isNaN(Number(k))) {
        for (const item of current) findValues(item, path, index, current, values);
    } else {
        findValues(current[k], path, index + 1, current, values);
    }
}

function nestedValidator(a: { path: string[]; validator: Validator; query: any }, b: any): boolean {
    const values: [any, any, any][] = [];
    findValues(b, a.path, 0, b, values);

    if (values.length === 1) {
        return validate(a.validator, values[0][0], values[0][1], values[0][2]);
    }

    //$ne needs to hold for all found values, everything else for at least one
    const inclusive = a.query && typeof a.query.$ne !== 'undefined';
    for (const value of values) {
        const valid = validate(a.validator, value[0], value[1], value[2]);
        if (inclusive && !valid) return false;
        if (!inclusive && valid) return true;
    }
    return inclusive;
}

function isPlainObject(value: any): boolean {
    return value && value.constructor === Object;
}

function parse(query: any): Validator {
    query = comparable(query);
    if (!query || !isPlainObject(query)) query = { $eq: query };

    const validators: Validator[] = [];

    for (const key in query) {
        let a = query[key];
        if (key === '$options') continue;

        if (operators[key]) {
            if (prepare[key]) a = prepare[key](a, query);
            validators.push({ a: comparable(a), v: operators[key] });
        } else {
            if (key.charCodeAt(0) === 36) throw new Error('Unknown operation ' + key);
            validators.push({ a: { path: key.split('.'), validator: parse(a), query: a }, v: nestedValidator });
        }
    }

    return validators.length === 1 ? validators[0] : { a: validators, v: operators.$and };
}

/**
 * Returns a function that checks whether an item matches the given filter query.
 */
export function createQueryMatcher(query: any): (item: any) => boolean {
    const validator = parse(query);
    return (item: any) => validate(validator, item);
}
