/*
 * Deepkit Framework
 * Copyright (c) Deepkit UG, Marc J. Schmidt
 *
 * This program is free software: you can redistribute it and/or modify
 * it under the terms of the MIT License.
 *
 * You should have received a copy of the MIT License along with this program.
 */
import { expect, test } from '@jest/globals';
import { float, float32, int8, integer, PrimaryKey, Reference } from '../src/reflection/type.js';
import { is } from '../src/typeguard.js';
import { Serializer } from '../src/serializer.js';
import { cast } from '../src/serializer-facade.js';
import { isReferenceInstance } from '../src/reference.js';

test('primitive string', () => {
    expect(is<string>('a')).toEqual(true);
    expect(is<string>(123)).toEqual(false);
    expect(is<string>(true)).toEqual(false);
    expect(is<string>({})).toEqual(false);
});

test('primitive number', () => {
    expect(is<number>('a')).toEqual(false);
    expect(is<number>(123)).toEqual(true);
    expect(is<number>(true)).toEqual(false);
    expect(is<number>({})).toEqual(false);
});

test('primitive number integer', () => {
    expect(is<integer>('a')).toEqual(false);
    expect(is<integer>(123)).toEqual(true);
    expect(is<integer>(123.4)).toEqual(false);
    expect(is<integer>(true)).toEqual(false);
    expect(is<integer>({})).toEqual(false);
});

test('primitive number int8', () => {
    expect(is<int8>('a')).toEqual(false);
    expect(is<int8>(123)).toEqual(true);
    expect(is<int8>(123.4)).toEqual(false);
    expect(is<int8>(true)).toEqual(false);
    expect(is<int8>({})).toEqual(false);
    expect(is<int8>(127)).toEqual(true);
    expect(is<int8>(128)).toEqual(false);
    expect(is<int8>(-128)).toEqual(true);
    expect(is<int8>(-129)).toEqual(false);
    expect(is<int8>(129)).toEqual(false);
});

test('primitive number float', () => {
    expect(is<float>('a')).toEqual(false);
    expect(is<float>(123)).toEqual(true);
    expect(is<float>(123.4)).toEqual(true);
    expect(is<float>(true)).toEqual(false);
    expect(is<float>({})).toEqual(false);
});

test('primitive number float32', () => {
    expect(is<float32>('a')).toEqual(false);
    expect(is<float32>(123)).toEqual(true);
    expect(is<float32>(123.4)).toEqual(true);
    expect(is<float32>(3.40282347e+38)).toEqual(true);
    //JS precision issue:
    expect(is<float32>(3.40282347e+38 + 100000000000000000000000)).toEqual(false);
    expect(is<float32>(-3.40282347e+38)).toEqual(true);
    expect(is<float32>(-3.40282347e+38 - 100000000000000000000000)).toEqual(false);
    expect(is<float32>(true)).toEqual(false);
    expect(is<float32>({})).toEqual(false);
});

test('enum', () => {
    enum MyEnum {
        a, b, c
    }

    expect(is<MyEnum>(0)).toEqual(true);
    expect(is<MyEnum>(1)).toEqual(true);
    expect(is<MyEnum>(2)).toEqual(true);
    expect(is<MyEnum>(3)).toEqual(false);
    expect(is<MyEnum>(undefined)).toEqual(false);
    expect(is<MyEnum>({})).toEqual(false);
    expect(is<MyEnum>(true)).toEqual(false);
});

test('enum const', () => {
    const enum MyEnum {
        a, b, c
    }

    expect(is<MyEnum>(0)).toEqual(true);
    expect(is<MyEnum>(1)).toEqual(true);
    expect(is<MyEnum>(2)).toEqual(true);
    expect(is<MyEnum>(3)).toEqual(false);
    expect(is<MyEnum>(undefined)).toEqual(false);
    expect(is<MyEnum>({})).toEqual(false);
    expect(is<MyEnum>(true)).toEqual(false);
});

test('enum string', () => {
    enum MyEnum {
        a = 'a', b = 'b', c = 'c'
    }

    expect(is<MyEnum>('a')).toEqual(true);
    expect(is<MyEnum>('b')).toEqual(true);
    expect(is<MyEnum>('c')).toEqual(true);
    expect(is<MyEnum>(0)).toEqual(false);
    expect(is<MyEnum>(1)).toEqual(false);
    expect(is<MyEnum>(2)).toEqual(false);
    expect(is<MyEnum>(3)).toEqual(false);
    expect(is<MyEnum>(undefined)).toEqual(false);
    expect(is<MyEnum>({})).toEqual(false);
    expect(is<MyEnum>(true)).toEqual(false);
});

test('array string', () => {
    expect(is<string[]>([])).toEqual(true);
    expect(is<string[]>(['a'])).toEqual(true);
    expect(is<string[]>(['a', 'b'])).toEqual(true);
    expect(is<string[]>([1])).toEqual(false);
    expect(is<string[]>([1, 2])).toEqual(false);
    expect(is<string[]>(['a', 2])).toEqual(false);
});

test('tuple', () => {
    expect(is<[string]>(['a'])).toEqual(true);
    expect(is<[string]>([2])).toEqual(false);
    expect(is<[string, string]>(['a', 'b'])).toEqual(true);
    expect(is<[string, string]>(['a'])).toEqual(false);
    expect(is<[string, number]>(['a', 3])).toEqual(true);
    expect(is<[string, number]>(['a', undefined])).toEqual(false);
    expect(is<[string, ...number[]]>(['a', 3])).toEqual(true);
    expect(is<[string, ...number[]]>(['a', 3, 4])).toEqual(true);
    expect(is<[string, ...number[]]>(['a', 3, 4, 5])).toEqual(true);
    expect(is<[string, ...number[]]>([3, 3, 4, 5])).toEqual(false);
});

test('tuple length', () => {
    //#718, an array with more elements is not the tuple
    expect(is<[]>([])).toEqual(true);
    expect(is<[]>([1])).toEqual(false);
    expect(is<[number]>([1, 2])).toEqual(false);
    expect(is<[string, number]>(['a', 3, 4])).toEqual(false);

    //optional elements
    expect(is<[number, string?]>([1])).toEqual(true);
    expect(is<[number, string?]>([1, 'a'])).toEqual(true);
    expect(is<[number, string?]>([1, 'a', 3])).toEqual(false);
    expect(is<[number?]>([])).toEqual(true);

    //elements with a type that accepts undefined are still required
    expect(is<[any]>([])).toEqual(false);
    expect(is<[unknown, any]>([1])).toEqual(false);

    //rest elements
    expect(is<[...number[]]>([])).toEqual(true);
    expect(is<[string, ...number[]]>(['a'])).toEqual(true);
    expect(is<[string, ...number[]]>([])).toEqual(false);
    expect(is<[string, ...number[], boolean]>(['a', true])).toEqual(true);
    expect(is<[string, ...number[], boolean]>(['a', 1, 2, true])).toEqual(true);
    expect(is<[string, ...number[], boolean]>(['a'])).toEqual(false);
});

test('set', () => {
    expect(is<Set<string>>(new Set(['a']))).toEqual(true);
    expect(is<Set<string>>(new Set(['a', 'b']))).toEqual(true);
    expect(is<Set<string>>(new Set(['a', 2]))).toEqual(false);
    expect(is<Set<string>>(new Set([2, 3]))).toEqual(false);
    expect(is<Set<string>>([2, 3])).toEqual(false);
});

test('map', () => {
    expect(is<Map<string, number>>(new Map([['a', 1]]))).toEqual(true);
    expect(is<Map<string, number>>(new Map([['a', 1], ['b', 2]]))).toEqual(true);
    expect(is<Map<string, number>>(new Map<any, any>([['a', 1], ['b', 'b']]))).toEqual(false);
    expect(is<Map<string, number>>(new Map<any, any>([[2, 1]]))).toEqual(false);
});

test('literal', () => {
    expect(is<1>(1)).toEqual(true);
    expect(is<1>(2)).toEqual(false);
    expect(is<'abc'>('abc')).toEqual(true);
    expect(is<'abc'>('ab')).toEqual(false);
    expect(is<false>(false)).toEqual(true);
    expect(is<false>(true)).toEqual(false);
    expect(is<true>(true)).toEqual(true);
    expect(is<true>(false)).toEqual(false);
});

test('any', () => {
    expect(is<any>(['a'])).toEqual(true);
    expect(is<any>([1])).toEqual(true);
    expect(is<any>([true])).toEqual(true);
    expect(is<any>([false])).toEqual(true);
    expect(is<any>([undefined])).toEqual(true);
    expect(is<any>([null])).toEqual(true);
    expect(is<any>([{}])).toEqual(true);
    expect(is<any>([])).toEqual(true);

    expect(is<any>('a')).toEqual(true);
    expect(is<any>(1)).toEqual(true);
    expect(is<any>(true)).toEqual(true);
    expect(is<any>(false)).toEqual(true);
    expect(is<any>(undefined)).toEqual(true);
    expect(is<any>(null)).toEqual(true);
    expect(is<any>({})).toEqual(true);
    expect(is<any>([])).toEqual(true);
});

test('array any', () => {
    expect(is<any[]>(['a'])).toEqual(true);
    expect(is<any[]>([1])).toEqual(true);
    expect(is<any[]>([true])).toEqual(true);
    expect(is<any[]>([false])).toEqual(true);
    expect(is<any[]>([undefined])).toEqual(true);
    expect(is<any[]>([null])).toEqual(true);
    expect(is<any[]>([{}])).toEqual(true);
    expect(is<any[]>([])).toEqual(true);
    expect(is<Array<any>>([])).toEqual(true);
    expect(is<Array<any>>(['a'])).toEqual(true);

    expect(is<any[]>(null)).toEqual(false);
    expect(is<any[]>(undefined)).toEqual(false);
    expect(is<any[]>(1)).toEqual(false);
    expect(is<any[]>(true)).toEqual(false);
    expect(is<any[]>({})).toEqual(false);

    expect(is<any[]>({ length: 1 })).toEqual(false);
    expect(is<any[]>({ length: 0 })).toEqual(false);
    expect(is<any[]>({ length: null })).toEqual(false);
    expect(is<any[]>({ length: undefined })).toEqual(false);
});

test('union', () => {
    expect(is<string | number>(1)).toEqual(true);
    expect(is<string | number>('abc')).toEqual(true);
    expect(is<string | number>(false)).toEqual(false);
});

test('deep union', () => {
    expect(is<string | (number | bigint)[]>(1)).toEqual(false);
    expect(is<string | (number | bigint)[]>('1')).toEqual(true);
    expect(is<string | (number | bigint)[]>([1])).toEqual(true);
    expect(is<string | (number | bigint)[]>([1n])).toEqual(true);
    expect(is<string | (number | bigint)[]>(['1'])).toEqual(false);
});

test('object literal', () => {
    expect(is<{ a: string }>({ a: 'abc' })).toEqual(true);
    expect(is<{ a: string }>({ a: 123 })).toEqual(false);
    expect(is<{ a: string }>({})).toEqual(false);
    expect(is<{ a?: string }>({})).toEqual(true);
    expect(is<{ a?: string }>({ a: 'abc' })).toEqual(true);
    expect(is<{ a?: string }>({ a: 123 })).toEqual(false);
    expect(is<{ a: string, b: number }>({ a: 'a', b: 12 })).toEqual(true);
    expect(is<{ a: string, b: number }>({ a: 'a', b: 'asd' })).toEqual(false);
});

test('function', () => {
    expect(is<(a: string) => void>((a: string): void => undefined)).toEqual(true);
    expect(is<(a: string) => void>((a: string): string => 'asd')).toEqual(false);
    expect(is<(a: string) => void>((a: string): number => 2)).toEqual(false);
    expect(is<(a: string) => void>((a: string): any => 2)).toEqual(true);
    expect(is<(a: string) => void>((a: any): number => 2)).toEqual(false);
    expect(is<Function>((a: any): number => 2)).toEqual(true);
});

test('class', () => {
    class A {
        a!: string;
    }

    class A2 {
        a?: string;
    }

    class A3 {
        a!: string;
        b!: number;
    }

    expect(is<A>({ a: 'abc' })).toEqual(true);
    expect(is<A>({ a: 123 })).toEqual(false);
    expect(is<A>({})).toEqual(false);
    expect(is<A2>({})).toEqual(true);
    expect(is<A2>({ a: 'abc' })).toEqual(true);
    expect(is<A2>({ a: 123 })).toEqual(false);
    expect(is<A3>({ a: 'a', b: 12 })).toEqual(true);
    expect(is<A3>({ a: 'a', b: 'asd' })).toEqual(false);
});

test('index signature', () => {
    expect(is<{ [name: string]: string }>({})).toEqual(true);
    expect(is<{ [name: string]: string }>({ a: 'abc' })).toEqual(true);
    expect(is<{ [name: string]: string }>({ a: 123 })).toEqual(false);

    expect(is<{ [name: number]: string }>({ 1: 'abc' })).toEqual(true);
    expect(is<{ [name: number]: string }>({ 1: 123 })).toEqual(false);
    expect(is<{ [name: number]: string }>({ a: 'abc' })).toEqual(false);
});

test('object literal methods', () => {
    expect(is<{ m: () => void }>({ m: (): void => undefined })).toEqual(true);
    expect(is<{ m: () => void }>({ m: false })).toEqual(false);
    expect(is<{ m: (name: string) => void }>({ m: () => undefined })).toEqual(true); //`() => undefined` has no types, so no __type emitted. Means return=any
    expect(is<{ m: (name: string) => void }>({ m: (name: string): void => undefined })).toEqual(true);
    expect(is<{ m: (name: string) => string }>({ m: (name: string): string => 'asd' })).toEqual(true);
    expect(is<{ m: (name: string) => string }>({ m: (name: string) => 'asd' })).toEqual(true);
    expect(is<{ m: (name: string) => string }>({ m: (name: number): string => 'asd' })).toEqual(false);
    expect(is<{ m: (name: string) => string }>({ m: (name: string): number => 2 })).toEqual(false);
    expect(is<{ m: (name: string) => any }>({ m: (name: string): number => 2 })).toEqual(true);
    expect(is<{ m: (name: any) => number }>({ m: (name: string): number => 2 })).toEqual(true);
});

test('multiple index signature', () => {
    expect(is<{ [name: string]: string | number, [name: number]: string }>({})).toEqual(true);
    expect(is<{ [name: string]: string | number, [name: number]: number }>({ a: 'abc' })).toEqual(true);
    expect(is<{ [name: string]: string | number, [name: number]: number }>({ a: 123 })).toEqual(true);
    expect(is<{ [name: string]: string | number, [name: number]: number }>({ 1: 123 })).toEqual(true);
    expect(is<{ [name: string]: string | number, [name: number]: number }>({ 1: 'abc' })).toEqual(false);
});

test('brands', () => {
    expect(is<number & PrimaryKey>(2)).toEqual(true);
    expect(is<number & PrimaryKey>('2')).toEqual(false);
});

test('generic interface', () => {
    interface List<T> {
        items: T[];
    }

    expect(is<List<number>>({ items: [1] })).toEqual(true);
    expect(is<List<string>>({ items: [1] })).toEqual(false);
    expect(is<List<string>>({ items: null })).toEqual(false);
    expect(is<List<string>>({ items: ['abc'] })).toEqual(true);
});

test('generic alias', () => {
    type List<T> = T[];

    expect(is<List<number>>([1])).toEqual(true);
    expect(is<List<string>>([1])).toEqual(false);
    expect(is<List<string>>(null)).toEqual(false);
    expect(is<List<string>>(['abc'])).toEqual(true);
});

test('index signature ', () => {
    interface BagOfNumbers {
        [name: string]: number;
    }

    interface BagOfStrings {
        [name: string]: string;
    }

    expect(is<BagOfNumbers>({ a: 1 })).toEqual(true);
    expect(is<BagOfNumbers>({ a: 1, b: 2 })).toEqual(true);
    expect(is<BagOfNumbers>({ a: 'b' })).toEqual(false);
    expect(is<BagOfNumbers>({ a: 'b', b: 'c' })).toEqual(false);

    expect(is<BagOfStrings>({ a: 1 })).toEqual(false);
    expect(is<BagOfStrings>({ a: 1, b: 2 })).toEqual(false);
    expect(is<BagOfStrings>({ a: 'b' })).toEqual(true);
    expect(is<BagOfStrings>({ a: 'b', b: 'c' })).toEqual(true);
});

test('reference', () => {
    class Image {
        id: number = 0;
    }

    class User {
        image?: Image & Reference;
    }

    expect(is<Image>({})).toEqual(false);
    expect(is<Image>({ id: 0 })).toEqual(true);

    expect(is<User>({})).toEqual(true);
    expect(is<User>({ image: undefined })).toEqual(true);
    expect(is<User>({ image: null })).toEqual(true);
    expect(is<User>({ image: { id: 1 } })).toEqual(true);
    expect(is<User>({ image: { id: false } })).toEqual(false);
    expect(is<User>({ image: false })).toEqual(false);
    expect(is<User>({ image: {} })).toEqual(false);
});

test('template literal', () => {
    expect(is<`abc`>('abc')).toBe(true);
    expect(is<`abc`>('abce')).toBe(false);

    expect(is<`ab${string}`>('abc')).toBe(true);
    expect(is<`ab${string}`>('ab3')).toBe(true);

    type a = 'ab3' extends `ab${string}` ? true : false;
    type a2 = 'ab' extends `ab${string}` ? true : false;
    type a3 = 'a' extends `ab${string}` ? true : false;

    expect(is<`ab${string}`>('ab3')).toBe(true);
    expect(is<`ab${string}`>('ab')).toBe(true);
    expect(is<`ab${string}`>('a')).toBe(false);

    type b = 'ab3' extends `ab${number}` ? true : false;
    type b2 = 'ab' extends `ab${number}` ? true : false;
    type b3 = 'a' extends `ab${number}` ? true : false;
    type b4 = 'abc' extends `ab${number}` ? true : false;

    expect(is<`ab${number}`>('ab3')).toBe(true);
    expect(is<`ab${number}`>('ab')).toBe(false);
    expect(is<`ab${number}`>('a')).toBe(false);
    expect(is<`ab${number}`>('abc')).toBe(false);
});

test('template literal bigint', () => {
    //#718, a bigint span only accepts integers, like in TypeScript
    expect(is<`${bigint}`>('1')).toBe(true);
    expect(is<`${bigint}`>('-12')).toBe(true);
    expect(is<`${bigint}`>('0x1f')).toBe(true);
    expect(is<`${bigint}`>('0b101')).toBe(true);
    expect(is<`${bigint}`>('0o17')).toBe(true);
    expect(is<`${bigint}`>('abc')).toBe(false);
    expect(is<`${bigint}`>('1.5')).toBe(false);
    expect(is<`${bigint}`>('1e3')).toBe(false);
    expect(is<`${bigint}`>('')).toBe(false);
    expect(is<`${bigint}`>(' 1')).toBe(false);
    expect(is<`${bigint}`>('1_000')).toBe(false);
    expect(is<`${bigint}`>(1)).toBe(false);

    expect(is<`a${bigint}`>('a1')).toBe(true);
    expect(is<`a${bigint}`>('ax')).toBe(false);
    expect(is<`a${bigint}`>('a')).toBe(false);
    expect(is<`${bigint}px`>('10px')).toBe(true);
    expect(is<`${bigint}px`>('1.5px')).toBe(false);
    expect(is<`${bigint}-${bigint}`>('1-2')).toBe(true);
    expect(is<`${bigint}-${bigint}`>('1-x')).toBe(false);
    expect(is<`${bigint}${string}`>('1x')).toBe(true);
    expect(is<`${bigint}${string}`>('x')).toBe(false);
    expect(is<`${string}${bigint}`>('x1')).toBe(true);
    expect(is<`${string}${bigint}`>('x')).toBe(false);

    //unchanged
    expect(is<`${number}`>('1.5')).toBe(true);
    expect(is<`${number}`>('x')).toBe(false);
});

test('union template literal', () => {
    expect(is<`abc${number}` | number>('abc2')).toBe(true);
    expect(is<`abc${number}` | number>(23)).toBe(true);
    expect(is<`abc${number}` | number>('abcd')).toBe(false);
    expect(is<`abc${number}` | number>('abc')).toBe(false);
});

test('class with literal and default', () => {
    class ConnectionOptions {
        readConcernLevel: 'local' = 'local';
    }

    expect(is<ConnectionOptions>({ readConcernLevel: 'local' })).toBe(true);
    expect(is<ConnectionOptions>({ readConcernLevel: 'local2' })).toBe(false);
});

test('union literal', () => {
    class ConnectionOptions {
        readConcernLevel: 'local' | 'majority' | 'linearizable' | 'available' = 'majority';
    }

    expect(is<ConnectionOptions>({ readConcernLevel: 'majority' })).toBe(true);
    expect(is<ConnectionOptions>({ readConcernLevel: 'majority2' })).toBe(false);
});

test('union classes with generic', () => {
    class Group {
        id: number & PrimaryKey = 0;
        second: string = '';
    }

    class User {
        id: number = 0;
        groups: (Group & Reference)[] = [];
    }

    const serializer = new Serializer();

    const newGroup = cast<Group>({ id: 1, second: 'a' });

    const a = cast<User>({
        id: 1,
        groups: [newGroup],
    }, undefined, serializer);

    expect(a.groups[0]).toBeInstanceOf(Group);
    expect(isReferenceInstance(a.groups[0])).toBe(false);

    const b = cast<User>({
        id: 1,
        groups: [1],
    }, undefined, serializer);

    expect(b.groups[0]).toBeInstanceOf(Group);
    expect(isReferenceInstance(b.groups[0])).toBe(true);
    if (isReferenceInstance(b.groups[0])) {
        //do something with this instance and fully load it
    }
});
