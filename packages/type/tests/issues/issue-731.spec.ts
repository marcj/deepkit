import { expect, test } from '@jest/globals';

import { ReceiveType, resolveReceiveType } from '../../src/reflection/reflection.js';
import { reflect } from '../../src/reflection/reflection.js';
import { ReflectionKind, Type } from '../../src/reflection/type.js';

//https://github.com/marcj/deepkit/issues/731
function functionType(fn: Function) {
    const type = reflect(fn);
    if (type.kind !== ReflectionKind.function) return undefined;
    return { parameters: type.parameters.map(v => [v.name, v.type.kind]), returns: type.return.kind };
}

test('super works in a method', () => {
    const base = {
        toString() {
            return 'hi';
        },
    };
    const child = {
        __proto__: base,
        toString(): string {
            return super.toString() + '!';
        },
    };
    expect(child.toString()).toBe('hi!');
});

test('a method is not constructible and has no prototype', () => {
    const o = {
        m(x: number) {
            return x;
        },
    };
    expect(() => new (o.m as any)(1)).toThrow('not a constructor');
    expect('prototype' in o.m).toBe(false);
});

test('quoted and numeric keys keep the method name', () => {
    const o = {
        'quoted-key'(x: number) {
            return x;
        },
        1(x: number) {
            return x;
        },
    };
    expect(o['quoted-key'].name).toBe('quoted-key');
    expect(o[1].name).toBe('1');
});

test('a method keeps its type, whatever its key', () => {
    const o = {
        plain(a: string): number {
            return 1;
        },
        'quoted-key'(a: string): number {
            return 1;
        },
        2(a: string): number {
            return 1;
        },
        default(a: string): number {
            return 1;
        },
        async asynchronous(a: string): Promise<number> {
            return 1;
        },
    };
    const expected = { parameters: [['a', ReflectionKind.string]], returns: ReflectionKind.number };
    expect(functionType(o.plain)).toEqual(expected);
    expect(functionType(o['quoted-key'])).toEqual(expected);
    expect(functionType(o[2])).toEqual(expected);
    expect(functionType(o.default)).toEqual(expected);
    expect(functionType(o.asynchronous)).toEqual({ parameters: expected.parameters, returns: ReflectionKind.promise });
});

test('a method can receive its type argument', () => {
    const o = {
        kind<T>(type?: ReceiveType<T>): Type {
            return resolveReceiveType(type);
        },
    };
    expect(o.kind<string>().kind).toBe(ReflectionKind.string);
});

test('a method overwritten by a later spread does not tag the winning function', () => {
    const other = { m: (): void => undefined };
    Object.defineProperty(other.m, '__type', { value: 'untouched', writable: false });
    const o = {
        m(a: string) {
            return a;
        },
        ...other,
    };
    expect(o.m).toBe(other.m);
    expect((o.m as any).__type).toBe('untouched');
});

test('a method overwritten by a later value does not fail', () => {
    const o = {
        m(a: string) {
            return a;
        },
        m2: 1,
        ['m' as string]: 5,
    };
    expect(o.m).toBe(5);
});

test('a later getter of the same name is not invoked', () => {
    let calls = 0;
    // @ts-ignore duplicate on purpose
    const o = {
        m(a: string) {
            return a;
        },
        get m() {
            calls++;
            return () => undefined;
        },
    };
    expect(calls).toBe(0);
    expect(typeof o.m).toBe('function');
    expect(calls).toBe(1);
});

test('super works in a method followed by a spread', () => {
    const base = {
        toString() {
            return 'hi';
        },
    };
    const child = {
        __proto__: base,
        toString(): string {
            return super.toString() + '!';
        },
        ...{ other: 1 },
    };
    expect(child.toString()).toBe('hi!');
});

test('computed keys are evaluated once', () => {
    let calls = 0;
    const key = () => {
        calls++;
        return 'm';
    };
    const o = {
        [key()](a: string) {
            return a;
        },
    };
    expect(calls).toBe(1);
    expect(o.m('x')).toBe('x');
});
