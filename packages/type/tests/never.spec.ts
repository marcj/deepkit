import { expect, test } from '@jest/globals';

import { typeOf } from '../src/reflection/reflection.js';
import { ReflectionKind } from '../src/reflection/type.js';
import { cast } from '../src/serializer-facade.js';
import { is } from '../src/typeguard.js';
import { ValidationError, validate } from '../src/validator.js';

test('no value is never', () => {
    expect(is<never>(1)).toBe(false);
    expect(is<never>(undefined)).toBe(false);
    expect(is<never>(null)).toBe(false);
    expect(validate<never>(1).length).toBe(1);
});

test('cast to never fails', () => {
    expect(() => cast<never>(1)).toThrow(ValidationError);
});

test('never[] only accepts an empty array', () => {
    expect(is<never[]>([])).toBe(true);
    expect(is<never[]>([1])).toBe(false);
    expect(validate<never[]>([1]).length).toBe(1);
});

test('a never property is kept in an object literal', () => {
    const type = typeOf<{ a: never }>();
    expect(type.kind === ReflectionKind.objectLiteral && type.types.length).toBe(1);
});

test('a required never property accepts nothing', () => {
    expect(is<{ a: never }>({ a: 1 })).toBe(false);
    expect(is<{ a: never }>({})).toBe(false);
});

test('an optional never property forbids the key, the common exclusive-or pattern', () => {
    type Exclusive = { a: string; b?: never } | { b: number; a?: never };
    expect(is<{ a?: never }>({})).toBe(true);
    expect(is<{ a?: never }>({ a: 1 })).toBe(false);
    expect(is<Exclusive>({ a: 'x' })).toBe(true);
    expect(is<Exclusive>({ b: 1 })).toBe(true);
    expect(is<Exclusive>({ a: 'x', b: 1 })).toBe(false);
});

test('control: a class field the compiler has no type for stays permissive', () => {
    class Options {
        name: string = '';
        cache = new Map<string, number>();
    }
    expect(cast<Options>({ name: 'a' })).toBeInstanceOf(Options);
    expect(is<Options>(cast<Options>({ name: 'a' }))).toBe(true);
});

test('never adds nothing to a union', () => {
    expect(is<string | never>('a')).toBe(true);
    expect(is<string | never>(1)).toBe(false);
});

test('control: a mapped type still filters a key by never', () => {
    type Strings<T> = { [K in keyof T as T[K] extends string ? K : never]: T[K] };
    const type = typeOf<Strings<{ a: string; b: number }>>();
    expect(type.kind === ReflectionKind.objectLiteral && type.types.length).toBe(1);
});
