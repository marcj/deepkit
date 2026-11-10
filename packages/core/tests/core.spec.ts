import { expect, test } from '@jest/globals';
import {
    asyncOperation,
    changeClass,
    collectForMicrotask,
    createDynamicClass,
    CustomError,
    escapeRegExp,
    getClassName,
    getClassTypeFromInstance,
    getCurrentDirName,
    getCurrentFileName,
    getObjectKeysSize,
    getParentClass,
    getPathValue,
    iterableSize,
    rangeArray,
    setPathValue,
    sleep,
    stringifyValueWithType,
    zip,
} from '../src/core.js';
import { isArray, isAsyncFunction, isClass, isClassInstance, isConstructable, isFunction, isGlobalClass, isIterable, isNumeric, isObject, isPlainObject, isPromise, isPrototypeOfBase, isUndefined } from '../src/type-guards.js';

class SimpleClass {
    constructor(public name: string) {
    }
}

test('helper getClassName', () => {
    class User {
        constructor(public readonly name: string) {
        }
    }

    class MyError extends Error {
    }

    expect(getClassName(new User('peter'))).toBe('User');
    expect(getClassName(User)).toBe('User');

    expect(getClassName(MyError)).toBe('MyError');
    expect(getClassName(new MyError)).toBe('MyError');
});

test('error', () => {
    const custom = new CustomError('my message', { cause: new Error('that is the cause') });
    expect((custom as any).cause.message).toEqual('that is the cause');
});

test('helper isObject', () => {
    expect(isObject([])).toBe(false);
    expect(isObject(false)).toBe(false);
    expect(isObject(true)).toBe(false);
    expect(isObject(null)).toBe(false);
    expect(isObject(undefined)).toBe(false);
    expect(isObject(() => {
    })).toBe(false);
    expect(isObject(function() {
    })).toBe(false);
    expect(isObject(1)).toBe(false);
    expect(isObject('1')).toBe(false);

    expect(isObject({})).toBe(true);
    expect(isObject(new Date())).toBe(true);
    expect(isObject(new SimpleClass('asd'))).toBe(true);
});

test('helper isPromise', async () => {
    expect(isPromise([])).toBe(false);
    expect(isPromise(false)).toBe(false);
    expect(isPromise(true)).toBe(false);
    expect(isPromise(null)).toBe(false);
    expect(isPromise(undefined)).toBe(false);
    expect(isPromise(() => {
    })).toBe(false);
    expect(isPromise(function() {
    })).toBe(false);
    expect(isPromise(1)).toBe(false);
    expect(isPromise('1')).toBe(false);

    function foo1() {
    }

    const foo2 = () => {
    };
    expect(isPromise(foo1())).toBe(false);
    expect(isPromise(foo2())).toBe(false);

    async function foo3() {
    }

    function foo4() {
        return new Promise((resolve) => {
            resolve(1);
        });
    }

    expect(isObject(foo3())).toBe(true);
    expect(isObject(foo4())).toBe(true);
    expect(isObject(await foo4())).toBe(false);
    expect(isObject((async () => {
    })())).toBe(true);
});

test('helper isFunction', () => {
    expect(isFunction([])).toBe(false);
    expect(isFunction(false)).toBe(false);
    expect(isFunction(true)).toBe(false);
    expect(isFunction(null)).toBe(false);
    expect(isFunction(undefined)).toBe(false);
    expect(isFunction(1)).toBe(false);
    expect(isFunction('1')).toBe(false);
    expect(isFunction({})).toBe(false);
    expect(isFunction(new Date())).toBe(false);
    expect(isFunction(new SimpleClass('asd'))).toBe(false);

    expect(isFunction(isFunction)).toBe(true);
    expect(isFunction(() => {
    })).toBe(true);
    expect(isFunction(async () => {
    })).toBe(true);
    expect(isFunction(function() {
    })).toBe(true);
    expect(isFunction(async function() {
    })).toBe(true);
    expect(isFunction(class Peter {
    })).toBe(false);
    expect(isFunction(class {
    })).toBe(false);
    expect(isFunction(class {
    })).toBe(false);

    const fn = function() {
    };
    fn.toString = () => 'class{}';
    expect(isFunction(fn)).toBe(false);
});

test('helper isAsyncFunction', () => {
    expect(isAsyncFunction([])).toBe(false);
    expect(isAsyncFunction(false)).toBe(false);
    expect(isAsyncFunction(true)).toBe(false);
    expect(isAsyncFunction(null)).toBe(false);
    expect(isAsyncFunction(undefined)).toBe(false);
    expect(isAsyncFunction(1)).toBe(false);
    expect(isAsyncFunction('1')).toBe(false);
    expect(isAsyncFunction({})).toBe(false);
    expect(isAsyncFunction(new Date())).toBe(false);
    expect(isAsyncFunction(new SimpleClass('asd'))).toBe(false);

    expect(isAsyncFunction(isFunction)).toBe(false);
    expect(isAsyncFunction(() => {
    })).toBe(false);
    expect(isAsyncFunction(async () => {
    })).toBe(true);
    expect(isAsyncFunction(function() {
    })).toBe(false);
    expect(isAsyncFunction(async function() {
    })).toBe(true);
});

test('helper isClass', () => {
    expect(isClass([])).toBe(false);
    expect(isClass(false)).toBe(false);
    expect(isClass(true)).toBe(false);
    expect(isClass(null)).toBe(false);
    expect(isClass(undefined)).toBe(false);
    expect(isClass(1)).toBe(false);
    expect(isClass('1')).toBe(false);
    expect(isClass({})).toBe(false);
    expect(isClass(new Date())).toBe(false);
    expect(isClass(new SimpleClass('asd'))).toBe(false);
    expect(isClass(isFunction)).toBe(false);
    expect(isClass(() => {
    })).toBe(false);
    expect(isClass(async () => {
    })).toBe(false);
    expect(isClass(function() {
    })).toBe(false);
    expect(isClass(async function() {
    })).toBe(false);

    expect(isClass(SimpleClass)).toBe(true);
});

test('helper isPlainObject', () => {
    expect(isPlainObject([])).toBe(false);
    expect(isPlainObject(false)).toBe(false);
    expect(isPlainObject(true)).toBe(false);
    expect(isPlainObject(null)).toBe(false);
    expect(isPlainObject(undefined)).toBe(false);
    expect(isPlainObject(1)).toBe(false);
    expect(isPlainObject('1')).toBe(false);
    expect(isPlainObject(() => {
    })).toBe(false);
    expect(isPlainObject(function() {
    })).toBe(false);

    expect(isPlainObject(new Date())).toBe(false);
    expect(isPlainObject(new SimpleClass('asd'))).toBe(false);

    class O extends Object {
    }

    expect(isPlainObject(new O)).toBe(false);

    expect(isPlainObject({})).toBe(true);
    expect(isPlainObject(new Object)).toBe(true);
});

test('helper is array', () => {
    expect(isArray({})).toBe(false);
    expect(isArray(new Date())).toBe(false);
    expect(isArray(new SimpleClass('asd'))).toBe(false);
    expect(isArray(false)).toBe(false);
    expect(isArray(true)).toBe(false);
    expect(isArray(null)).toBe(false);
    expect(isArray(undefined)).toBe(false);
    expect(isArray(1)).toBe(false);
    expect(isArray('1')).toBe(false);

    expect(isArray([])).toBe(true);
});

test('helper is isUndefined', () => {
    expect(isUndefined({})).toBe(false);
    expect(isUndefined(new Date())).toBe(false);
    expect(isUndefined(new SimpleClass('asd'))).toBe(false);
    expect(isUndefined(false)).toBe(false);
    expect(isUndefined(true)).toBe(false);
    expect(isUndefined(null)).toBe(false);
    expect(isUndefined(1)).toBe(false);
    expect(isUndefined('1')).toBe(false);
    expect(isUndefined([])).toBe(false);

    expect(isUndefined(undefined)).toBe(true);
});

test('test getPathValue', () => {
    expect(getPathValue({
        bla: 3,
    }, 'bla')).toBe(3);

    expect(getPathValue({
        bla: 3,
    }, 'bla2', null)).toBe(null);

    expect(getPathValue({}, 'bla', 'another')).toBe('another');

});

test('test getPathValue deep', () => {
    expect(getPathValue({
        bla: {
            mowla: 5,
        },
    }, 'bla.mowla')).toBe(5);

    expect(getPathValue({
        'bla.mowla': 5,
    }, 'bla.mowla')).toBe(5);

    expect(getPathValue({
        bla: {
            mowla: {
                evenDeeper: true,
            },
        },
    }, 'bla.mowla.evenDeeper')).toBe(true);

    expect(getPathValue({
        bla: {
            mowla: {
                evenDeeper: true,
            },
        },
    }, 'bla.mowla')['evenDeeper']).toBe(true);
});

test('test setPathValue ', () => {
    {
        const obj: any = {};
        setPathValue(obj, 'bla2', 5);
        expect(obj['bla2']).toBe(5);
    }

    {
        const obj: any = {};
        setPathValue(obj, 'bla.mowla', 6);
        expect(obj['bla']['mowla']).toBe(6);
    }
});


test('asyncOperation maintain error stack trace', async () => {
    class MyError extends Error {
    }

    let fetched = false;
    try {
        async function doIt() {
            await asyncOperation((resolve, reject) => {
                setTimeout(() => {
                    reject(new MyError('MyError1'));
                });
            });
        }

        await doIt();
    } catch (error: any) {
        fetched = true;
        expect(error).toBeInstanceOf(MyError);
        expect(error.stack).toContain('MyError1');
        expect(error.stack).toContain('doIt');
    }
    expect(fetched).toBe(true);
});

test('asyncOperation catches async errors', async () => {
    class MyError extends Error {
    }

    let fetched = false;
    try {
        async function doIt() {
            await asyncOperation(async (resolve) => {
                await sleep(0.2);
                throw new MyError('MyError1');
            });
        }

        await doIt();
    } catch (error: any) {
        fetched = true;
        expect(error).toBeInstanceOf(MyError);
        expect(error.stack).toContain('MyError1');
        expect(error.stack).toContain('doIt');
    }
    expect(fetched).toBe(true);
});

test('asyncOperation deep', async () => {
    let fetched = false;
    try {
        async function doIt1() {
            await asyncOperation(async (resolve) => {
                await sleep(0.2);

                async function doIt2() {
                    await asyncOperation(async (resolve) => {
                        await sleep(0.2);
                        throw new Error('MyError2');
                    });
                };
                await doIt2();
            });
        }

        await doIt1();
    } catch (error: any) {
        fetched = true;
        expect(error.stack).toContain('MyError2');
        expect(error.stack).toContain('doIt1');
        expect(error.stack).toContain('doIt2');
    }
    expect(fetched).toBe(true);
});


test('getObjectKeysSize', async () => {
    expect(getObjectKeysSize({})).toBe(0);
    expect(getObjectKeysSize({ a: true })).toBe(1);
    expect(getObjectKeysSize({ a: 1, b: 1, c: 3, d: 4, e: {} })).toBe(5);
});


test('isPrototypeOfBase', () => {
    class Base {
    }

    class Child1 extends Base {
    }

    class Child2 extends Base {
    }

    class Child1_1 extends Child1 {
    }

    class Child1_1_1 extends Child1_1 {
    }

    expect(isPrototypeOfBase(Base, Base)).toBe(true);
    expect(isPrototypeOfBase(Child1, Base)).toBe(true);
    expect(isPrototypeOfBase(Child2, Base)).toBe(true);
    expect(isPrototypeOfBase(Child1_1, Base)).toBe(true);
    expect(isPrototypeOfBase(Child1_1, Child1)).toBe(true);
    expect(isPrototypeOfBase(Child1_1_1, Base)).toBe(true);
    expect(isPrototypeOfBase(Child1_1_1, Child1_1)).toBe(true);
});

test('isConstructable', () => {
    expect(isConstructable(class {
    })).toBe(true);
    expect(isConstructable(class {
    }.bind(undefined))).toBe(true);
    expect(isConstructable(function() {
    })).toBe(true);
    expect(isConstructable(function() {
    }.bind(undefined))).toBe(true);
    expect(isConstructable(() => {
    })).toBe(false);
    expect(isConstructable((() => {
    }).bind(undefined))).toBe(false);
    expect(isConstructable(async () => {
    })).toBe(false);
    expect(isConstructable(async function() {
    })).toBe(false);
    expect(isConstructable(function* () {
    })).toBe(false);
    //the runtime type transformer converts this to `{foo: function() {}}.foo` which is constructable again :(
    // expect(isConstructable({foo() {}}.foo)).toBe(false);
    expect(isConstructable(URL)).toBe(true);
});

test('collectForMicrotask', async () => {
    let got: string[] = [];
    const collected = (strings: string[]) => {
        got.length = 0;
        got.push(...strings);
    };
    const fn = collectForMicrotask(collected);

    fn('a');
    fn('b');
    fn('c');

    await sleep(0.1);
    expect(got).toEqual(['a', 'b', 'c']);
    fn('d');

    await sleep(0.1);
    expect(got).toEqual(['d']);
});

test('stringifyValueWithType', async () => {
    class Peter {
        id = 1;
    }

    expect(stringifyValueWithType(new Peter)).toBe(`Peter {id: number(1)}`);
    expect(stringifyValueWithType({ id: 1 })).toBe(`object {id: number(1)}`);
    expect(stringifyValueWithType('foo')).toBe(`string(foo)`);
    expect(stringifyValueWithType(2)).toBe(`number(2)`);
    expect(stringifyValueWithType(true)).toBe(`boolean(true)`);
    expect(stringifyValueWithType(function Peter() {
    })).toBe(`function Peter`);
});

test('getClassTypeFromInstance', async () => {
    class Peter {
    }

    expect(getClassTypeFromInstance(new Peter)).toBe(Peter);
    expect(() => getClassTypeFromInstance({})).toThrow('Value is not a class instance');
    expect(() => getClassTypeFromInstance('asd')).toThrow('Value is not a class instance');
    expect(() => getClassTypeFromInstance(23)).toThrow('Value is not a class instance');
    expect(() => getClassTypeFromInstance(undefined)).toThrow('Value is not a class instance');
});

test('isClassInstance', async () => {
    class Peter {
    }

    expect(isClassInstance(new Peter)).toBe(true);
    expect(isClassInstance({})).toBe(false);
    expect(isClassInstance('asd')).toBe(false);
    expect(isClassInstance(undefined)).toBe(false);
    expect(isClassInstance(null)).toBe(false);
    expect(isClassInstance(3223)).toBe(false);
});

test('isClassInstance', async () => {
    class Model1 {
        id: number = 0;
    }

    class Base {
    }

    class Model2 extends Base {
        id: number = 0;

        model2() {
            return true;
        }
    }

    const model1 = new Model1;
    model1.id = 22;

    changeClass(model1, Model2);
    expect(model1 instanceof Model1).toBe(true);

    expect(changeClass(model1, Model2) instanceof Model2).toBe(true);
    expect(changeClass(model1, Model2) instanceof Base).toBe(true);
    expect(changeClass(model1, Model2) instanceof Model1).toBe(false);
    expect(changeClass(model1, Model2).model2()).toBe(true);
});

test('createDynamicClass', () => {
    const class1 = createDynamicClass('Model');
    expect(getClassName(class1)).toBe('Model');
    expect(getClassName(new class1)).toBe('Model');
    expect(class1.toString()).toBe('class Model {}');

    class Base {
    }

    const class2 = createDynamicClass('Model2', Base);
    expect(getClassName(class2)).toBe('Model2');
    expect(getClassName(new class2)).toBe('Model2');
    expect(new class2).toBeInstanceOf(Base);
    expect(class2.toString()).toBe('class Model2 extends Base {}');
});

test('isNumeric', () => {
    expect(isNumeric(12)).toBe(true);
    expect(isNumeric(12.2)).toBe(true);
    expect(isNumeric('12')).toBe(true);
    expect(isNumeric('')).toBe(false);
    expect(isNumeric('.')).toBe(false);
    expect(isNumeric('.5')).toBe(true);
    expect(isNumeric('12.2')).toBe(true);
    expect(isNumeric('12.2 ')).toBe(false);
    expect(isNumeric('12..2')).toBe(false);
});

test('getParentClass', () => {
    class User {
    }

    class Admin extends User {
    }

    class SuperAdmin extends Admin {
    }

    expect(getParentClass({} as any)).toBe(undefined);
    expect(getParentClass(Object)).toBe(undefined);
    expect(getParentClass(User)).toBe(undefined);
    expect(getParentClass(Admin)).toBe(User);
    expect(getParentClass(SuperAdmin)).toBe(Admin);
});

test('escapeRegExp', () => {
    expect(escapeRegExp('a')).toBe('a');
    expect(escapeRegExp('a.')).toBe('a\\.');
    expect(escapeRegExp('a.\\')).toBe('a\\.\\\\');
    expect(escapeRegExp('a.\\b')).toBe('a\\.\\\\b');
    expect(escapeRegExp('a.\\b\\')).toBe('a\\.\\\\b\\\\');
    expect(escapeRegExp('a.\\b\\c')).toBe('a\\.\\\\b\\\\c');

    expect(new RegExp('^' + escapeRegExp('a[.](c')).exec('a[.](c')![0]).toEqual('a[.](c');
    expect(new RegExp('^' + escapeRegExp('a[.](c')).exec('da[.](c')).toEqual(null);
});

test('range', () => {
    expect(rangeArray(2)).toEqual([0, 1]);
    expect(rangeArray(0, 1)).toEqual([0]);
    expect(rangeArray(0, 2)).toEqual([0, 1]);
    expect(rangeArray(1, 2)).toEqual([1]);
    expect(rangeArray(1, 2, 2)).toEqual([1]);
    expect(rangeArray(1, 4, 2)).toEqual([1, 3]);
    expect(rangeArray(2, 4)).toEqual([2, 3]);
});

test('zip', () => {
    expect(zip([1, 2, 3], ['a', 'b', 'c'])).toEqual([[1, 'a'], [2, 'b'], [3, 'c']]);
    expect(zip([1, 2, 3], ['a', 'b'])).toEqual([[1, 'a'], [2, 'b']]);
    expect(zip([1, 2], ['a', 'b', 'c'])).toEqual([[1, 'a'], [2, 'b']]);
    expect(zip([1, 2, 3], ['a', 'b', 'c'], [true, false, true])).toEqual([[1, 'a', true], [2, 'b', false], [3, 'c', true]]);
});

test('isIterable', () => {
    expect(isIterable([])).toBe(true);
    expect(isIterable({})).toBe(false);
    expect(isIterable(new Map())).toBe(true);
    expect(isIterable(new Set())).toBe(true);
    expect(isIterable(new WeakMap())).toBe(false);
    expect(isIterable(new WeakSet())).toBe(false);
    expect(isIterable(new Uint8Array())).toBe(false);
    expect(isIterable(new Error())).toBe(false);
});

test('iterableSize', () => {
    expect(iterableSize([])).toBe(0);
    expect(iterableSize([1, 2, 3])).toBe(3);
    expect(iterableSize(new Map())).toBe(0);
    expect(iterableSize(new Map([[1, 2], [3, 4]]) as any)).toBe(2);
    expect(iterableSize(new Set())).toBe(0);
    expect(iterableSize(new Set([1, 2, 3]) as any)).toBe(3);
});

test('isGlobalClass', () => {
    expect(isGlobalClass(undefined)).toBe(false);
    expect(isGlobalClass({})).toBe(false);

    expect(isGlobalClass(Date)).toBe(true);
    expect(isGlobalClass(Array)).toBe(true);
    expect(isGlobalClass(TextDecoder)).toBe(true);

    class MyError extends Error {
    }

    expect(isGlobalClass(Error)).toBe(true);
    expect(isGlobalClass(MyError)).toBe(false);

    expect(isGlobalClass(Uint8Array)).toBe(true);
});

test('current file', () => {
    expect(getCurrentFileName().endsWith('packages/core/tests/core.spec.ts')).toBe(true);
    expect(getCurrentDirName().endsWith('packages/core/tests')).toBe(true);
});

test('asyncOperation', async () => {
    expect(await asyncOperation<number>(resolve => resolve(1))).toBe(1);
    expect(await asyncOperation<number>(async resolve => resolve(2))).toBe(2);
    await expect(asyncOperation(() => { throw new Error('sync'); })).rejects.toThrow('sync');
    await expect(asyncOperation(async () => { throw new Error('async'); })).rejects.toThrow('async');
    await expect(asyncOperation((resolve, reject) => reject(new Error('rejected')))).rejects.toThrow('rejected');
});
