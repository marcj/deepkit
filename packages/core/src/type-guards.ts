/*
 * Deepkit Framework
 * Copyright (C) 2021 Deepkit UG, Marc J. Schmidt
 *
 * This program is free software: you can redistribute it and/or modify
 * it under the terms of the MIT License.
 *
 * You should have received a copy of the MIT License along with this program.
 */
/** @group Type Guards */

import { AbstractClassType, ClassType, getClassName, identifyType } from './core.js';

/**
 * Returns true if the given obj is a plain object, and no class instance.
 *
 * isPlainObject(\{\}) === true
 * isPlainObject(new ClassXY) === false
 */
export function isPlainObject(obj: any): obj is object {
    return Boolean(obj && typeof obj === 'object' && obj.constructor instanceof obj.constructor);
}

/**
 * Returns true when target is a class instance.
 */
export function isClassInstance(target: any): boolean {
    return target !== undefined && target !== null
        && target['constructor']
        && Object.getPrototypeOf(target) === (target as any)['constructor'].prototype
        && !isPlainObject(target)
        && isObject(target);
}

/**
 * Returns true if given obj is a function.
 */
export function isFunction(obj: any): obj is Function {
    return 'function' === typeof obj && !isClassSource(obj);
}

const classSources = new WeakMap<Function, boolean>();

/**
 * Whether a function is declared with `class`. Functions without prototype (arrow functions, methods, async
 * functions) are no classes. For the others, the source is checked once: Function.prototype.toString() builds the
 * source string on every call, which made isFunction() and isClass() slow in hot paths like resolveReceiveType().
 */
function isClassSource(fn: Function): boolean {
    // the prototype of a class is not writable, so it can't be removed
    if (!fn.prototype) return false;
    let result = classSources.get(fn);
    if (result === undefined) {
        const source = fn.toString();
        result = source.startsWith('class ') || source.startsWith('class{');
        classSources.set(fn, result);
    }
    return result;
}

export const AsyncFunction = (async () => {
}).constructor as { new(...args: string[]): Function };

/**
 * Returns true if given obj is a async function.
 */
export function isAsyncFunction(obj: any): obj is (...args: any[]) => Promise<any> {
    return obj instanceof AsyncFunction;
}

/**
 * Returns true if given obj is a promise like object.
 *
 * Note: There's no way to check if it's actually a Promise using instanceof since
 * there are a lot of different implementations around.
 */
export function isPromise<T>(obj: any | Promise<T>): obj is Promise<T> {
    return obj !== null && typeof obj === 'object' && typeof obj.then === 'function'
        && typeof obj.catch === 'function' && typeof obj.finally === 'function';
}

/**
 * Returns true if given obj is a ES6 class (ES5 fake classes are not supported).
 */
export function isClass(obj: any): obj is AbstractClassType {
    return 'function' === typeof obj && isClassSource(obj);
}

declare var global: any;
declare var window: any;

export function isGlobalClass(obj: any): obj is AbstractClassType {
    if ('function' !== typeof obj) return false;

    if ('undefined' !== typeof window) {
        return (window as any)[getClassName(obj)] === obj;
    }
    if ('undefined' !== typeof global) {
        return (global as any)[getClassName(obj)] === obj;
    }
    return false;
}

/**
 * Returns true for real objects: object literals ({}) or class instances (new MyClass).
 */
export function isObject(obj: any): obj is { [key: string]: any } {
    if (obj === null) {
        return false;
    }
    return (typeof obj === 'object' && !isArray(obj));
}

/**
 * Returns true if given obj is a plain object, and no Date, Array, Map, Set, etc.
 *
 * This is different to isObject and used in the type system to differentiate
 * between JS objects in general and what we define as ReflectionKind.objectLiteral.
 * Since we have Date, Set, Map, etc. in the type system, we need to differentiate
 * between them and all other object literals.
 */
export function isObjectLiteral(obj: any): obj is { [key: string]: any } {
    return isObject(obj) && !(obj instanceof Date) && !(obj instanceof Map) && !(obj instanceof Set);
}

export const isArray: (obj: any) => obj is any[] = Array.isArray;

export function isNull(obj: any): obj is null {
    return null === obj;
}

export function isUndefined(obj: any): obj is undefined {
    return undefined === obj;
}

/**
 * Checks if obj is not null and not undefined.
 */
export function isSet(obj: any): boolean {
    return !isNull(obj) && !isUndefined(obj);
}

/**
 * Check if it is a real number (not NaN/Infinite).
 */
export function isNumber(obj: any): obj is number {
    return 'number' === typeof obj && !isNaN(obj) && isFinite(obj);
}

/**
 * Returns true if given value is strictly a numeric string value (or a number).
 *
 * ```typescript
 * isNumeric(12); //true
 * isNumeric('12'); //true
 * isNumeric('12.3'); //true
 * isNumeric('12.3 '); //false
 * isNumeric('12px'); //false
 * ```
 */
export function isNumeric(s: string | number): boolean {
    if ('number' === typeof s) return true;
    let points = 0;
    for (let i = s.length - 1; i >= 0; i--) {
        const d = s.charCodeAt(i);
        if (d === 46) {
            //46 = .
            if (points++ > 0) return false;
            continue;
        }
        if (d < 48 || d > 57) return false;
    }
    return true;
}

export const isInteger: (obj: any) => obj is number = Number.isInteger as any || function(obj: any) {
    return (obj % 1) === 0;
};

export function isString(obj: any): obj is string {
    return 'string' === identifyType(obj);
}

export function isConstructable(fn: any): boolean {
    try {
        new new Proxy(fn, { construct: () => ({}) });
        return true;
    } catch (err) {
        return false;
    }
}

export function isPrototypeOfBase(prototype: AbstractClassType | undefined, base: ClassType): boolean {
    if (!prototype) return false;
    if (prototype === base) return true;
    let currentProto = Object.getPrototypeOf(prototype);
    while (currentProto && currentProto !== Object.prototype) {
        if (currentProto === base) return true;
        currentProto = Object.getPrototypeOf(currentProto);
    }
    return false;
}

export function isIterable(value: any): boolean {
    return isArray(value) || value instanceof Set || value instanceof Map;
}
