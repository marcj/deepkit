/*
 * Deepkit Framework
 * Copyright (C) 2021 Deepkit UG, Marc J. Schmidt
 *
 * This program is free software: you can redistribute it and/or modify
 * it under the terms of the MIT License.
 *
 * You should have received a copy of the MIT License along with this program.
 */

import dotProp from 'dot-prop';
import { isArray, isClass, isClassInstance, isObject, isPlainObject, isSet } from './type-guards.js';
import { pathDirectory } from './path.js';

/**
 * Makes sure the error once printed using console.log contains the actual class name.
 *
 * @example
 * ```
 * class MyApiError extends CustomerError {}
 *
 * throw MyApiError() // prints MyApiError instead of simply "Error".
 * ```
 */
export class CustomError extends Error {
    public name: string;

    constructor(...args: any[]) {
        super(...args);
        this.name = this.constructor.name;
    }
}

/**
 * @internal
 */
export interface CustomError {
    cause?: unknown;
}

export interface ClassType<T = any> {
    new(...args: any[]): T;
}

export type AbstractClassType<T = any> = abstract new (...args: any[]) => T;

export type ExtractClassType<T> = T extends AbstractClassType<infer K> ? K : never;

/**
 * Returns the class name either of the class definition or of the class of an instance.
 *
 * Note when code is minimized/uglified this output will change. You should disable in your compile the
 * className modification.
 *
 * @example
 * ```typescript
 * class User {}
 *
 * expect(getClassName(User)).toBe('User');
 * expect(getClassName(new User())).toBe('User');
 * ```
 */
export function getClassName<T>(classTypeOrInstance: ClassType<T> | Object): string {
    if (!classTypeOrInstance) return 'undefined';
    const proto = (classTypeOrInstance as any)['prototype'] ? (classTypeOrInstance as any)['prototype'] : classTypeOrInstance;
    return proto.constructor.name || 'anonymous class';
}

/**
 * Same as getClassName but appends the propertyName.
 */
export function getClassPropertyName<T>(classType: ClassType<T> | Object, propertyName: string): string {
    const name = getClassName(classType);

    return `${name}.${propertyName}`;
}

export function applyDefaults<T>(classType: ClassType<T>, target: { [k: string]: any }): T {
    const classInstance = new classType();

    for (const [i, v] of Object.entries(target)) {
        (classInstance as any)[i] = v;
    }

    return classInstance;
}

/**
 * Tries to identify the object by normalised result of Object.toString(obj).
 */
export function identifyType(obj: any) {
    return ((({}).toString.call(obj).match(/\s([a-zA-Z]+)/) || [])[1] || '').toLowerCase();
}

/**
 * Returns the ClassType for a given instance.
 */
export function getClassTypeFromInstance<T>(target: T): ClassType<T> {
    if (!isClassInstance(target)) {
        throw new Error(`Value is not a class instance. Got ${stringifyValueWithType(target)}`);
    }

    return (target as any)['constructor'] as ClassType<T>;
}

/**
 * Returns a human-readable string representation from the given value.
 */
export function stringifyValueWithType(value: any, depth: number = 0): string {
    if ('string' === typeof value) return `string(${value})`;
    if ('number' === typeof value) return `number(${value})`;
    if ('boolean' === typeof value) return `boolean(${value})`;
    if ('bigint' === typeof value) return `bigint(${value})`;
    if (isPlainObject(value)) return `object ${depth < 2 ? prettyPrintObject(value, depth) : ''}`;
    if (isArray(value)) return `Array`;
    if (isClass(value)) return `${getClassName(value)}`;
    if (isObject(value)) return `${getClassName(getClassTypeFromInstance(value))} ${depth < 2 ? prettyPrintObject(value, depth) : ''}`;
    if ('function' === typeof value) return `function ${value.name}`;
    if (null === value) return `null`;
    return 'undefined';
}

/**
 * Changes the class of a given instance and returns the new object.
 *
 * @example
 * ```typescript
 *
 *  class Model1 {
 *    id: number = 0;
 *  }
 *
 *  class Model2 {
 *    id: number = 0;
 *  }
 *
 *  const model1 = new Model1();
 *  const model2 = changeClass(model1, Model2);
 *  model2 instanceof Model2; //true
 * ```
 */
export function changeClass<T>(value: object, newClass: ClassType<T>): T {
    return Object.assign(Object.create(newClass.prototype), value);
}

export function prettyPrintObject(object: object, depth: number = 0): string {
    const res: string[] = [];
    for (const i in object) {
        res.push(i + ': ' + stringifyValueWithType((object as any)[i], depth + 1));
    }
    return '{' + res.join(',') + '}';
}


export function indexOf<T>(array: T[], item: T): number {
    if (!array) {
        return -1;
    }

    return array.indexOf(item);
}

export async function sleep(seconds: number): Promise<void> {
    return new Promise<void>(resolve => setTimeout(resolve, seconds * 1000));
}

/**
 * Creates a shallow copy of given array.
 */
export function copy<T>(v: T[]): T[] {
    if (isArray(v)) {
        return v.slice(0);
    }

    return v;
}

/**
 * Checks whether given array or object is empty (no keys). If given object is falsy, returns false.
 */
export function empty<T>(value?: T[] | object | {}): boolean {
    if (!value) return true;

    if (isArray(value)) {
        return value.length === 0;
    } else {
        for (const i in value) if (value.hasOwnProperty(i)) return false;
        return true;
    }
}

/**
 * Returns the size of given array or object.
 */
export function size<T>(array: T[] | { [key: string]: T }): number {
    if (!array) {
        return 0;
    }

    if (isArray(array)) {
        return array.length;
    } else {
        return getObjectKeysSize(array);
    }
}

/**
 * Returns the first key of a given object.
 */
export function firstKey(v: { [key: string]: any } | object): string | undefined {
    return Object.keys(v)[0];
}

/**
 * Returns the last key of a given object.
 */
export function lastKey(v: { [key: string]: any } | object): string | undefined {
    const keys = Object.keys(v);
    if (keys.length) {
        return;
    }
    return keys[keys.length - 1];
}

/**
 * Returns the first value of given array or object.
 */
export function first<T>(v: { [key: string]: T } | T[]): T | undefined {
    if (isArray(v)) {
        return v[0];
    }

    const key = firstKey(v);
    if (key) {
        return v[key];
    }
    return;
}

/**
 * Returns the last value of given array or object.
 */
export function last<T>(v: { [key: string]: T } | T[]): T | undefined {
    if (isArray(v)) {
        if (v.length > 0) {
            return v[v.length - 1];
        }
        return;
    }

    const key = firstKey(v);
    if (key) {
        return v[key];
    }
    return;
}

/**
 * Returns the average of a number array.
 */
export function average(array: number[]): number {
    let sum = 0;
    for (const n of array) {
        sum += n;
    }

    return sum / array.length;
}

export function prependObjectKeys(o: { [k: string]: any }, prependText: string): { [k: string]: any } {
    const converted: { [k: string]: any } = {};
    for (const i in o) {
        if (!o.hasOwnProperty(i)) continue;
        converted[prependText + i] = o[i];
    }
    return converted;
}

export function appendObject(origin: { [k: string]: any }, extend: { [k: string]: any }, prependKeyName: string = '') {
    const no = prependObjectKeys(extend, prependKeyName);
    Object.assign(origin, no);
}

/**
 * A better alternative to "new Promise()" that supports error handling and maintains the stack trace for Error.stack.
 *
 * When you use `new Promise()` you need to wrap your code inside a try-catch to call `reject` on error.
 * asyncOperation() does this automatically.
 *
 * When you use `new Promise()` you will lose the stack trace when `reject(new Error())` is called.
 * asyncOperation() makes sure the error stack trace is the correct one.
 *
 * @example
 * ```typescript
 * await asyncOperation(async (resolve, reject) => {
 *     await doSomething(); //if this fails, reject() will automatically be called
 *     stream.on('data', (data) => {
 *         resolve(data); //at some point you MUST call resolve(data)
 *     });
 * });
 * ```
 *
 * @reflection never
 */
export async function asyncOperation<T>(executor: (resolve: (value: T) => void, reject: (error: any) => void) => void | Promise<void>): Promise<T> {
    try {
        return await new Promise<T>(async (resolve, reject) => {
            try {
                await executor(resolve, reject);
            } catch (e) {
                reject(e);
            }
        });
    } catch (error: any) {
        mergeStack(error, createStack());
        throw error;
    }
}

/**
 * When an API is called that returns a promise that loses the stack trace on error, you can use fixAsyncOperation().
 *
 * ```typescript
 * cons storage = new BrokenPromiseStorage();
 * const files = await fixAsyncOperation(storage.files('/'));
 * ```
 */
export function fixAsyncOperation<T>(promise: Promise<T>): Promise<T> {
    return asyncOperation(async (resolve, reject) => {
        resolve(await promise);
    });
}

export function mergePromiseStack<T>(promise: Promise<T>, stack?: string): Promise<T> {
    stack = stack || createStack();
    promise.then(() => {
    }, (error) => {
        mergeStack(error, stack || '');
    });
    return promise;
}

/**
 * @beta
 */
export function createStack(removeCallee: boolean = true): string {
    if (Error.stackTraceLimit === 10) Error.stackTraceLimit = 100;
    let stack = new Error().stack || '';

    /*
    at createStack (/file/path)
    at promiseToObservable (/file/path)
    at userLandCode1 (/file/path)
    at userLandCode2 (/file/path)
     */

    //remove "at createStack"
    stack = stack.slice(stack.indexOf('   at ') + 6);
    stack = stack.slice(stack.indexOf('   at ') - 1);

    if (removeCallee) {
        //remove callee
        stack = stack.slice(stack.indexOf('   at ') + 6);
        stack = stack.slice(stack.indexOf('   at ') - 1);
    }

    return stack;
}

/**
 * @beta
 */
export function mergeStack(error: Error, stack: string) {
    if (error instanceof Error && error.stack) {
        error.stack += '\n' + stack;
    }
}

/**
 * Makes sure the given value is an error. If it's not an error, it creates a new error with the given value as message.
 */
export function ensureError(error?: any, classType: ClassType = Error): Error {
    return error instanceof Error || error instanceof AggregateError ? error : new classType(error);
}

export function collectForMicrotask<T>(callback: (args: T[]) => void): (arg: T) => void {
    let items: T[] = [];
    let taskScheduled = false;

    return (arg: T) => {
        items.push(arg);
        if (!taskScheduled) {
            taskScheduled = true;
            queueMicrotask(() => {
                taskScheduled = false;
                callback(items);
                items.length = 0;
            });
        }
    };
}

export function getPathValue(bag: { [field: string]: any }, parameterPath: string, defaultValue?: any): any {
    if (parameterPath === '' || parameterPath === undefined) return bag;
    if (isSet(bag[parameterPath])) {
        return bag[parameterPath];
    }

    const result = dotProp.get(bag, parameterPath);

    return isSet(result) ? result : defaultValue;
}

export function setPathValue(bag: object, parameterPath: string, value: any) {
    dotProp.set(bag, parameterPath, value);
}

export function deletePathValue(bag: object, parameterPath: string) {
    dotProp.delete(bag, parameterPath);
}

/**
 * Returns the human-readable byte representation.
 */
export function humanBytes(bytes: number, si: boolean = false): string {
    const thresh = si ? 1000 : 1024;
    if (Math.abs(bytes) < thresh) {
        return bytes + ' B';
    }
    const units = si
        ? ['kB', 'MB', 'GB', 'TB', 'PB', 'EB', 'ZB', 'YB']
        : ['KiB', 'MiB', 'GiB', 'TiB', 'PiB', 'EiB', 'ZiB', 'YiB'];
    let u = -1;
    do {
        bytes /= thresh;
        ++u;
    } while (Math.abs(bytes) >= thresh && u < units.length - 1);

    return bytes.toFixed(2) + ' ' + units[u];
}

/**
 * Returns the number of properties on `obj`. This is 20x faster than Object.keys(obj).length.
 */
export function getObjectKeysSize(obj: object): number {
    let size = 0;
    for (let i in obj) if (obj.hasOwnProperty(i)) size++;
    return size;
}

export function getParentClass(classType: ClassType): ClassType | undefined {
    const parent = Object.getPrototypeOf(classType);
    if (parent === Object.prototype || Object.getPrototypeOf(parent) === Object.prototype) return;
    return parent;
}

export function getInheritanceChain(classType: ClassType): ClassType[] {
    const chain: ClassType[] = [classType];
    let current = classType;
    while (current = getParentClass(current) as ClassType) {
        chain.push(current);
    }
    return chain;
}

declare var v8debug: any;
declare var process: {
    execArgv: string[];
    platform: string;
} | undefined;

export function inDebugMode() {
    return typeof v8debug === 'object' ||
        (typeof process !== 'undefined' && /--debug|--inspect/.test(process.execArgv.join(' ')));
}

/**
 * Create a new class with the given name.
 * This is currently the only know way to make it workable in browsers too.
 */
export function createDynamicClass(name: string, base?: ClassType): ClassType {
    if (base) {
        let baseName = getClassName(base);
        if (baseName === name) baseName += 'Base';
        return new Function(baseName, `return class ${name} extends ${baseName} {}`)(base);
    }
    return new Function(`return class ${name} {}`)();
}

export function iterableSize(value: Array<unknown> | Set<unknown> | Map<unknown, unknown>): number {
    return isArray(value) ? value.length : value.size || 0;
}

/**
 * Returns __filename, works in both cjs and esm.
 */
export function getCurrentFileName(offset: number = 0): string {
    const e = new Error;
    const initiator = e.stack!.split('\n').slice(2 + offset, 3 + offset)[0];
    let path = /(?<path>[^(\s]+):[0-9]+:[0-9]+/.exec(initiator)!.groups!.path;
    if (path.indexOf('file') >= 0) {
        path = new URL(path).pathname;
    }
    if (path[0] === '/' && 'undefined' !== typeof process && process.platform === 'win32') {
        path = path.slice(1);
    }
    return path;
}

/**
 * Returns the directory name of the current file (__dirname), works in both cjs and esm.
 */
export function getCurrentDirName(): string {
    return pathDirectory(getCurrentFileName(1));
}

/**
 * Escape special characters in a regex string, so it can be used as a literal string.
 */
export function escapeRegExp(string: string): string {
    return string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'); // $& means the whole matched string
}

export function hasProperty(object: any, property: any): boolean {
    return Object.prototype.hasOwnProperty.call(object, property);
}

/**
 * Returns an iterator of numbers from start (inclusive) to stop (exclusive) by step.
 */
export function* range(startOrLength: number, stop: number = 0, step: number = 1): IterableIterator<number> {
    let i = startOrLength;
    let end = stop;
    if (stop === 0) {
        i = 0;
        end = startOrLength;
    }

    for (; i < end; i += step) {
        yield i;
    }
}

/**
 * Returns an array of numbers from start (inclusive) to stop (exclusive) by step.
 *
 * Works the same as python's range function.
 */
export function rangeArray(startOrLength: number, stop: number = 0, step: number = 1): number[] {
    return [...range(startOrLength, stop, step)];
}

/**
 * Returns a combined array of the given arrays.
 *
 * Works the same as python's zip function.
 */
export function zip<T extends (readonly unknown[])[]>(
    ...args: T
): { [K in keyof T]: T[K] extends (infer V)[] ? V : never }[] {
    const minLength = Math.min(...args.map((arr) => arr.length));
    //@ts-ignore
    return Array.from({ length: minLength }).map((_, i) => args.map((arr) => arr[i]));
}

/**
 * Forwards the runtime type arguments from function x to function y.
 * This is necessary when a generic function is overridden and forwarded to something else.
 *
 * ```typescript
 * let generic = <T>(type?: ReceiveType<T>) => undefined;
 *
 * let forwarded<T> = () => {
 *     forwardTypeArguments(forwarded, generic); //all type arguments are forwarded to generic()
 *     generic(); //call as usual
 * }
 *
 * forwarded<any>(); //generic receives any in runtime.
 * ```
 *
 * Note that generic.bind(this) will not work, as bind() creates a new function and forwarded type arguments can not
 * reach the original function anymore.
 *
 * ```typescript
 * let forwarded<T> = () => {
 *     const bound = generic.bind(this);
 *     forwardTypeArguments(forwarded, bound); //can not be forwarded anymore
 *     bound(); //fails
 * }
 * ```
 *
 *  This is a limitation of JavaScript. In this case you have to manually forward type arguments.
 *
 *  ```typescript
 *  let forwarded<T> = (type?: ReceiveType<T>) => {
 *     const bound = generic.bind(this);
 *     bound(type);
 *  }
 *  ```
 */
export function forwardTypeArguments(x: any, y: any): void {
    y.Ω = x.Ω;
    x.Ω = undefined;
}

export function formatError(error: any, withStack: boolean = false): string {
    if (error && error.name === 'AggregateError' && 'errors' in error) {
        return `${(withStack && error.stack) || `AggregateError: ${error.message}`}\nErrors:\n${error.errors.map((v: any) => formatError(v)).join('\n')}`;
    }

    if (error instanceof Error) {
        let current: any = error.cause;
        let errors: string[] = [(withStack && error.stack) || error.message || 'Error'];
        while (current) {
            errors.push(`cause by ${formatError(current)}`);
            current = current.cause;
        }
        return errors.join('\n');
    }

    if (withStack && error.stack) return error.stack;
    return String(error);
}

/**
 * Asserts that the given object is an instance of the given class.
 */
export function assertInstanceOf<T>(object: any, constructor: { new(...args: any[]): T }): asserts object is T {
    if (!(object instanceof constructor)) {
        throw new Error(`Object ${getClassName(object)} is not an instance of the expected class ${getClassName(constructor)}`);
    }
}

/**
 * Asserts that the given value is defined (not null and not undefined).
 */
export function assertDefined<T>(value: T): asserts value is NonNullable<T> {
    if (value === null || value === undefined) {
        throw new Error(`Value is not defined`);
    }
}

export function isEsm(): boolean {
    return typeof require === 'undefined';
}
