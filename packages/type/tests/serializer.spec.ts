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
import { reflect, ReflectionClass, typeOf } from '../src/reflection/reflection.js';
import {
    assertType,
    AutoIncrement,
    BackReference,
    BinaryBigInt,
    Embedded,
    Excluded,
    Group,
    int8,
    integer,
    isCustomTypeClass,
    isTypeClassOf,
    MapName,
    PrimaryKey,
    Reference,
    ReflectionKind,
    SignedBinaryBigInt,
    stringifyResolvedType,
    Type,
    typeAnnotation,
    TypeProperty,
    TypePropertySignature,
} from '../src/reflection/type.js';
import { createSerializeFunction, getSerializeFunction, NamingStrategy, Serializer, serializer, underscoreNamingStrategy } from '../src/serializer.js';
import { cast, deserialize, patch, serialize } from '../src/serializer-facade.js';
import { getClassName, TypeAnnotation } from '@deepkit/core';
import { entity, t } from '../src/decorator.js';
import { Alphanumeric, MaxLength, MinLength, ValidationError } from '../src/validator.js';
import { StatEnginePowerUnit, StatWeightUnit } from './types.js';
import { parametersToTuple } from '../src/reflection/extends.js';
import { is } from '../src/typeguard.js';
import { isReferenceInstance } from '../src/reference.js';

test('deserializer', () => {
    class User {
        username!: string;
        created!: Date;
    }

    const fn = createSerializeFunction(reflect(User), serializer.deserializeRegistry);
    const o = fn({ username: 'Peter', created: '2021-10-19T00:22:58.257Z' });
    expect(o).toEqual({
        username: 'Peter',
        created: new Date('2021-10-19T00:22:58.257Z')
    });
});

test('cast interface', () => {
    interface User {
        username: string;
        created: Date;
    }

    const user = cast<User>({ username: 'Peter', created: '2021-10-19T00:22:58.257Z' });
    expect(user).toEqual({
        username: 'Peter',
        created: new Date('2021-10-19T00:22:58.257Z')
    });
});

test('cast class', () => {
    class User {
        created: Date = new Date;

        constructor(public username: string) {
        }
    }

    const user = cast<User>({ username: 'Peter', created: '2021-10-19T00:22:58.257Z' });
    expect(user).toBeInstanceOf(User);
    expect(user).toEqual({
        username: 'Peter',
        created: new Date('2021-10-19T00:22:58.257Z')
    });
});

test('groups', () => {
    class Settings {
        weight: string & Group<'privateSettings'> = '12g';
        color: string = 'red';
    }

    class User {
        id: number = 0;
        password: string & Group<'b'> = '';
        settings: Settings = new Settings;

        constructor(public username: string & Group<'a'>) {
        }

    }

    const user = new User('peter');
    expect(serialize<User>(user)).toEqual({ id: 0, username: 'peter', password: '', settings: { weight: '12g', color: 'red' } });
    expect(serialize<User>(user, { groups: ['a'] })).toEqual({ username: 'peter' });
    expect(serialize<User>(user, { groups: ['b'] })).toEqual({ password: '' });
    expect(serialize<User>(user, { groups: ['a', 'b'] })).toEqual({ username: 'peter', password: '' });
    expect(serialize<User>(user, { groupsExclude: ['b'] })).toEqual({ id: 0, username: 'peter', settings: { weight: '12g', color: 'red' } });
    expect(serialize<User>(user, { groupsExclude: ['privateSettings'] })).toEqual({ id: 0, username: 'peter', password: '', settings: { color: 'red' } });
});

test('default value', () => {
    class User {
        logins: number = 0;
    }

    {
        const user = cast<User>({});
        expect(user).toBeInstanceOf(User);
        expect(user).toEqual({
            logins: 0
        });
    }

    {
        const user = cast<User>({ logins: 2 });
        expect(user).toEqual({
            logins: 2
        });
    }
});

test('optional value', () => {
    class User {
        logins?: number;
    }

    {
        const user = cast<User>({});
        expect(user).toEqual({
            logins: undefined
        });
    }

    {
        const user = cast<User>({ logins: 2 });
        expect(user).toEqual({
            logins: 2
        });
    }
});

test('optional default value', () => {
    class User {
        logins?: number = 2;
    }

    {
        const user = cast<User>({});
        expect(user).toEqual({
            logins: 2
        });
    }

    {
        const user = cast<User>({ logins: 2 });
        expect(user).toEqual({
            logins: 2
        });
    }

    {
        const user = cast<User>({ logins: null });
        expect(user).toEqual({
            logins: undefined
        });
    }

    {
        const user = cast<User>({ logins: undefined });
        expect(user).toEqual({
            logins: undefined
        });
    }
});

test('optional literal', () => {
    interface LoginInput {
        mechanism?: 'cookie';
    }

    {
        const input = cast<LoginInput>({});
        expect(input).toEqual({
            mechanism: undefined
        });
    }

    {
        const input = cast<LoginInput>({ mechanism: 'cookie' });
        expect(input).toEqual({
            mechanism: 'cookie'
        });
    }
});

test('cast primitives', () => {
    expect(cast<string>('123')).toBe('123');
    expect(cast<string>(123)).toBe('123');
    expect(cast<number>(123)).toBe(123);
    expect(cast<number>('123')).toBe(123);

    expect(cast<Date>('2021-10-19T00:22:58.257Z')).toEqual(new Date('2021-10-19T00:22:58.257Z'));
    expect(serialize<Date>(new Date('2021-10-19T00:22:58.257Z'))).toEqual('2021-10-19T00:22:58.257Z');
});

test('cast integer', () => {
    expect(cast<integer>(123.456)).toBe(123);
    expect(cast<int8>(1000)).toBe(127);
});

test('tuple 2', () => {
    const value = cast<[string, number]>([12, '13']);
    expect(value).toEqual(['12', 13]);
});

test('tuple rest', () => {
    {
        const value = cast<[...string[], number]>([12, '13']);
        expect(value).toEqual(['12', 13]);
    }
    {
        const value = cast<[...string[], number]>([12, 13, '14']);
        expect(value).toEqual(['12', '13', 14]);
    }
    {
        const value = cast<[boolean, ...string[], number]>([1, 12, '13']);
        expect(value).toEqual([true, '12', 13]);
    }
    {
        const value = cast<[boolean, ...string[], number]>([1, 12, 13, '14']);
        expect(value).toEqual([true, '12', '13', 14]);
    }
    {
        const value = serialize<[boolean, ...string[], number]>([true, '12', 13]);
        expect(value).toEqual([true, '12', 13]);
    }
});

test('set', () => {
    {
        const value = cast<Set<string>>(['a', 'a', 'b']);
        expect(value).toEqual(new Set(['a', 'b']));
    }
    {
        const value = cast<Set<string>>(['a', 2, 'b']);
        expect(value).toEqual(new Set(['a', '2', 'b']));
    }
    {
        const value = serialize<Set<string>>(new Set(['a', 'b']));
        expect(value).toEqual(['a', 'b']);
    }
});

test('map', () => {
    {
        const value = cast<Map<string, number>>([['a', 1], ['a', 2], ['b', 3]]);
        expect(value).toEqual(new Map([['a', 2], ['b', 3]]));
    }
    {
        const value = cast<Map<string, number>>([['a', 1], [2, '2'], ['b', 3]]);
        expect(value).toEqual(new Map([['a', 1], ['2', 2], ['b', 3]]));
    }
    {
        const value = serialize<Map<string, number>>(new Map([['a', 2], ['b', 3]]));
        expect(value).toEqual([['a', 2], ['b', 3]]);
    }
});

test('number', () => {
    expect(cast<number>(1)).toBe(1);
    expect(cast<number>(-1)).toBe(-1);
    expect(cast<number>(true)).toBe(1);
    expect(cast<number>(false)).toBe(0);
    expect(cast<number>('1')).toBe(1);
    expect(cast<number>('-1')).toBe(-1);
});

test('null undefined and string', () => {
    expect(() => cast<string>(undefined)).toThrow('Validation error');
    expect(() => cast<string>(null)).toThrow('Validation error');
    expect(cast<string>('')).toBe('');
});

test('union string number', () => {
    expect(cast<string | number>('a')).toEqual('a');
    expect(cast<string | number>(2)).toEqual(2);

    expect(cast<string | integer>(2)).toEqual(2);
    expect(cast<string | integer>('3', { loosely: false })).toEqual('3');
    expect(cast<string | integer>('3')).toEqual(3);

    expect(cast<string | integer>(2.2)).toEqual(2);
    expect(cast<string | integer>('2.2', { loosely: false })).toEqual('2.2');
    expect(cast<string | integer>('2.2')).toEqual(2);

    expect(cast<string | integer>(false)).toEqual('false');
    expect(cast<string | integer>(true)).toEqual('true');
});

test('union boolean number', () => {
    expect(cast<boolean | number>(2)).toEqual(2);
    expect(cast<boolean | number>(1)).toEqual(1);
    expect(cast<boolean | number>(0)).toEqual(0);
    expect(cast<boolean | number>(false)).toEqual(false);
    expect(cast<boolean | number>(true)).toEqual(true);
});

test('disabled loosely throws for primitives', () => {
    expect(cast<string>(23)).toEqual('23');
    expect(cast<string>(23)).toEqual('23');
    expect(() => cast<string>(23, { loosely: false })).toThrow('Validation error');

    expect(cast<number>('23')).toEqual(23);
    expect(cast<number>('23')).toEqual(23);
    expect(() => cast<number>('23', { loosely: false })).toThrow('Validation error');

    expect(cast<boolean>(1)).toEqual(true);
    expect(cast<boolean>(1)).toEqual(true);
    expect(() => cast<boolean>(1, { loosely: false })).toThrow('Validation error');
});

test('union loose string number', () => {
    expect(cast<string | number>('a')).toEqual('a');
    expect(cast<string | number>(2)).toEqual(2);
    expect(cast<string | number>(-2)).toEqual(-2);

    expect(cast<string | integer>(2)).toEqual(2);
    expect(cast<string | integer>('3')).toEqual(3);

    expect(cast<string | integer>(2.2)).toEqual(2);
    expect(cast<string | integer>(-2.2)).toEqual(-2);
    expect(cast<string | integer>('2.2')).toEqual(2);
    expect(cast<string | integer>(false)).toEqual('false');
    expect(cast<string | integer>(true)).toEqual('true');
});

test('union loose string boolean', () => {
    expect(cast<string | boolean>('a')).toEqual('a');
    expect(cast<string | boolean>(1)).toEqual(true);
    expect(cast<string | boolean>(0)).toEqual(false);
    expect(cast<string | boolean>(-1)).toEqual('-1');
    expect(cast<string | boolean>(2)).toEqual('2');
    expect(cast<string | boolean>('true')).toEqual(true);
    expect(cast<string | boolean>('true2')).toEqual('true2');
});

test('union loose number boolean', () => {
    expect(() => cast<number | boolean>('a')).toThrow('Validation error for type');
    expect(deserialize<number | boolean>('a')).toEqual(undefined);
    expect(cast<string | boolean>(1)).toEqual(true);
    expect(cast<number | boolean>(1)).toEqual(1);
    expect(cast<string | boolean>('1')).toEqual(true);
    expect(cast<number | boolean>('1')).toEqual(1);
    expect(cast<number | boolean>('1')).toEqual(1);
    expect(cast<string | boolean>(0)).toEqual(false);
    expect(cast<number | boolean>(0)).toEqual(0);
    expect(cast<number | boolean>(-1)).toEqual(-1);
    expect(cast<number | boolean>(2)).toEqual(2);
    expect(cast<number | boolean>('2')).toEqual(2);
    expect(cast<number | boolean>('true')).toEqual(true);
    expect(() => cast<number | boolean>('true', { loosely: false })).toThrow('Validation error for type');
    expect(() => cast<number | boolean>('true2', { loosely: false })).toThrow('Validation error for type');
    expect(deserialize<number | boolean>('true2')).toEqual(undefined);
});

test('union string date', () => {
    expect(cast<string | Date>('a')).toEqual('a');
    expect(cast<string | Date>('2021-11-24T16:21:13.425Z')).toBeInstanceOf(Date);
    expect(cast<string | Date>(1637781902866)).toBeInstanceOf(Date);
    expect(cast<string | Date>('1637781902866')).toBe('1637781902866');
    expect(cast<(string | Date)[]>(['2021-11-24T16:21:13.425Z'])[0]).toBeInstanceOf(Date);
});

test('union string bigint', () => {
    expect(cast<string | bigint>('a')).toEqual('a');
    expect(cast<string | bigint>(2n)).toEqual(2n);
    expect(cast<string | bigint>(2)).toEqual(2n);
    expect(cast<string | bigint>('2', { loosely: false })).toEqual('2');
    expect(cast<string | bigint>('2')).toEqual(2n);
    expect(cast<string | bigint>('2a')).toEqual('2a');
});

test('union loose string bigint', () => {
    expect(cast<string | bigint>('a')).toEqual('a');
    expect(cast<string | bigint>(2n)).toEqual(2n);
    expect(cast<string | bigint>(2)).toEqual(2n);
    expect(cast<string | bigint>('2')).toEqual(2n);
    expect(cast<string | bigint>('2a')).toEqual('2a');
});

test('BinaryBigInt', () => {
    expect(serialize<bigint>(24n)).toBe('24');
    expect(serialize<BinaryBigInt>(24n)).toBe('24');
    expect(serialize<BinaryBigInt>(-4n)).toBe('0');

    expect(deserialize<BinaryBigInt>(24n)).toBe(24n);
    expect(deserialize<BinaryBigInt>('24')).toBe(24n);
    expect(deserialize<BinaryBigInt>(-4n)).toBe(0n);
    expect(deserialize<BinaryBigInt>('-4')).toBe(0n);

    expect(serialize<SignedBinaryBigInt>(24n)).toBe('24');
    expect(serialize<SignedBinaryBigInt>(-4n)).toBe('-4');
    expect(deserialize<SignedBinaryBigInt>(24n)).toBe(24n);
    expect(deserialize<SignedBinaryBigInt>('24')).toBe(24n);
    expect(deserialize<SignedBinaryBigInt>(-4n)).toBe(-4n);
    expect(deserialize<SignedBinaryBigInt>('-4')).toBe(-4n);
});

test('literal', () => {
    expect(cast<'a'>('a')).toEqual('a');
    expect(serialize<'a'>('a')).toEqual('a');
    expect(cast<'a'>('b')).toEqual('a');
    expect(cast<'a'>(123)).toEqual('a');
    expect(cast<1>(123)).toEqual(1);
    expect(cast<1>('123')).toEqual(1);
    expect(cast<true>('123')).toEqual(true);
    expect(cast<1n>('123')).toEqual(1n);
    expect(cast<1n>('123')).toEqual(1n);

    expect(serialize<1n>(1n)).toEqual(1n);
});

test('cast runs validators', () => {
    type Username = string & MinLength<3> & MaxLength<23> & Alphanumeric;
    expect(() => cast<Username>('ab')).toThrow('Validation error for type');
    expect(() => cast<Username>('$ab')).toThrow('Validation error for type');
    expect(cast<Username>('Peter')).toBe('Peter');
});

test('union literal', () => {
    expect(cast<'a' | number>('a')).toEqual('a');
    expect(cast<'a' | number>(23)).toEqual(23);
    expect(serialize<'a' | number>('a')).toEqual('a');
    expect(serialize<'a' | number>(23)).toEqual(23);

    expect(cast<3 | number>(23)).toEqual(23);
    expect(cast<3 | number>(3)).toEqual(3);
    expect(serialize<3 | number>(23)).toEqual(23);
    expect(serialize<3 | number>(3)).toEqual(3);

    expect(cast<3 | boolean>(3)).toEqual(3);
    expect(cast<true | boolean>(true)).toEqual(true);
    expect(cast<true | boolean>(false)).toEqual(false);
    expect(cast<false | boolean>(true)).toEqual(true);
    expect(cast<false | boolean>(false)).toEqual(false);
});

test('union primitive and class', () => {
    class User {
        id!: number;
    }

    expect(cast<number | User>(2)).toEqual(2);
    expect(cast<number | User>('2')).toEqual(2);
    expect(cast<number | User>({ id: 23 })).toEqual({ id: 23 });
    expect(cast<number | User>({ id: 23 })).toBeInstanceOf(User);
    expect(() => cast<number | User>('2asd')).toThrow('Validation error for type');

    expect(serialize<number | User>(2)).toEqual(2);
    expect(serialize<number | User>({ id: 23 })).toEqual({ id: 23 });
    expect(serialize<number | User>({ id: 23 })).toBeInstanceOf(Object);
});

test('union multiple classes', () => {
    class User {
        id!: number;
        username!: string;
    }

    class Picture {
        id!: number;
        path!: string;
    }

    expect(cast<Picture | User>({ id: 23, username: 'peter' })).toEqual({ id: 23, username: 'peter' });
    expect(cast<Picture | User>({ id: 23, username: 'peter' })).toBeInstanceOf(User);

    expect(cast<Picture | User>({ id: 23, path: 'src/path' })).toEqual({ id: 23, path: 'src/path' });
    expect(cast<Picture | User>({ id: 23, path: 'src/path' })).toBeInstanceOf(Picture);

    expect(cast<number | User>(23)).toEqual(23);
    expect(cast<number | User>({ id: 23, username: 'peter' })).toBeInstanceOf(User);

    expect(serialize<Picture | User>({ id: 23, username: 'peter' })).toEqual({ id: 23, username: 'peter' });
    expect(serialize<Picture | User>({ id: 23, username: 'peter' })).toBeInstanceOf(Object);

    expect(serialize<Picture | User>({ id: 23, path: 'src/path' })).toEqual({ id: 23, path: 'src/path' });
    expect(serialize<Picture | User>({ id: 23, path: 'src/path' })).toBeInstanceOf(Object);

    expect(serialize<number | User>(23)).toEqual(23);
    expect(serialize<number | User>({ id: 23, username: 'peter' })).toBeInstanceOf(Object);
    expect(serialize<number | User>({ id: 23, username: 'peter' })).toEqual({ id: 23, username: 'peter' });
});

test('brands', () => {
    expect(cast<number & PrimaryKey>(2)).toEqual(2);
    expect(cast<number & PrimaryKey>('2')).toEqual(2);

    expect(serialize<number & PrimaryKey>(2)).toEqual(2);
});

test('throw', () => {
    expect(() => cast<number>('123abc')).toThrow('Cannot convert 123abc to number');
    expect(() => cast<{ a: string }>(false)).toThrow('Cannot convert false to {a: string}');
    expect(() => cast<{ a: number }>({ a: 'abc' })).toThrow('Cannot convert abc to number');
    expect(() => cast<{ a: { b: number } }>({ a: 'abc' })).toThrow('Cannot convert abc to {b: number}');
    expect(() => cast<{ a: { b: number } }>({ a: { b: 'abc' } })).toThrow('Cannot convert abc to number');
});

test('index signature ', () => {
    interface BagOfNumbers {
        [name: string]: number;
    }

    interface BagOfStrings {
        [name: string]: string;
    }

    expect(cast<BagOfNumbers>({ a: 1 })).toEqual({ a: 1 });
    expect(cast<BagOfNumbers>({ a: 1, b: 2 })).toEqual({ a: 1, b: 2 });
    expect(() => cast<BagOfNumbers>({ a: 'b' })).toThrow(ValidationError as any);
    expect(() => cast<BagOfNumbers>({ a: 'b' })).toThrow('Cannot convert b to number');
    expect(cast<BagOfNumbers>({ a: '1' })).toEqual({ a: 1 });
    expect(() => cast<BagOfNumbers>({ a: 'b', b: 'c' })).toThrow(ValidationError as any);
    expect(() => cast<BagOfNumbers>({ a: 'b', b: 'c' })).toThrow('Cannot convert b to number');

    expect(cast<BagOfStrings>({ a: 1 })).toEqual({ a: '1' });
    expect(cast<BagOfStrings>({ a: 1, b: 2 })).toEqual({ a: '1', b: '2' });
    expect(cast<BagOfStrings>({ a: 'b' })).toEqual({ a: 'b' });
    expect(cast<BagOfStrings>({ a: 'b', b: 'c' })).toEqual({ a: 'b', b: 'c' });

    expect(serialize<BagOfNumbers>({ a: 1 })).toEqual({ a: 1 });
    expect(serialize<BagOfStrings>({ a: '1' })).toEqual({ a: '1' });
});

test('exclude', () => {
    class User {
        username!: string;

        password?: string & Excluded<'*'>;
    }

    const reflection = ReflectionClass.from(User);
    expect(reflection.getProperty('password')?.getExcluded()).toEqual(['*']);

    expect(cast<User>({ username: 'peter', password: 'nope' })).toEqual({ username: 'peter', password: undefined });
    expect(serialize<User>({ username: 'peter', password: 'nope' })).toEqual({ username: 'peter', password: undefined });
});

test('regexp direct', () => {
    expect(cast<RegExp>(/abc/).toString()).toEqual('/abc/');
    expect(cast<RegExp>('/abc/').toString()).toEqual('/abc/');
    expect(cast<RegExp>('abc').toString()).toEqual('/abc/');
    expect(serialize<RegExp>(/abc/).toString()).toEqual('/abc/');
});

test('regexp union', () => {
    expect(cast<string | { $regex: RegExp }>({ $regex: /abc/ })).toEqual({ $regex: /abc/ });
    expect(cast<Record<string, string | { $regex: RegExp }>>({ a: { $regex: /abc/ } })).toEqual({ a: { $regex: /abc/ } });
});

test('index signature with template literal', () => {
    type a1 = { [index: `a${number}`]: number };
    expect(cast<a1>({ a123: '123' })).toEqual({ a123: 123 });
    expect(cast<a1>({ a123: '123', b: 123 })).toEqual({ a123: 123, b: undefined });
    expect(cast<a1>({ a123: '123', a124: 123 })).toEqual({ a123: 123, a124: 123 });
});

test('class circular reference', () => {
    class User {
        constructor(public username: string) {
        }

        manager?: User;
    }

    const res = cast<User>({ username: 'Horst', manager: { username: 'Peter' } });
    expect(res).toEqual({ username: 'Horst', manager: { username: 'Peter' } });
    expect(res).toBeInstanceOf(User);
    expect(res.manager).toBeInstanceOf(User);
});

test('class with reference', () => {
    class User {
        id: number & PrimaryKey = 0;

        constructor(public username: string) {
        }
    }

    interface Team {
        lead: User & Reference;
    }

    {
        const res = cast<Team>({ lead: { id: 1, username: 'Peter' } });
        expect(res).toEqual({ lead: { id: 1, username: 'Peter' } });
        expect(res.lead).toBeInstanceOf(User);
        expect(isReferenceInstance(res.lead)).toBe(false);
    }

    {
        const res = cast<Team>({ lead: { id: 1 } });
        expect(res).toEqual({ lead: { id: 1 } });
        expect(res.lead).toBeInstanceOf(User);
        expect(isReferenceInstance(res.lead)).toBe(true);
    }

    {
        const res = cast<Team>({ lead: { username: 'Peter' } });
        expect(res).toEqual({ lead: { id: 0, username: 'Peter' } });
        expect(res.lead).toBeInstanceOf(User);
    }

    {
        const res = cast<Team>({ lead: 23 });
        expect(res).toEqual({ lead: { id: 23 } });
        expect(res.lead).toBeInstanceOf(User);
        expect(getClassName(res.lead)).toBe('UserReference');
    }
});

test('class with back reference', () => {
    class User {
        id: number & PrimaryKey = 0;

        constructor(public username: string) {
        }
    }

    interface Team {
        leads: User[] & BackReference;
    }

    const res = cast<Team>({ leads: [{ username: 'Peter' }] });
    expect(res).toEqual({ leads: [{ id: 0, username: 'Peter' }] });
    expect(res.leads[0]).toBeInstanceOf(User);
});

test('embedded single', () => {
    class Price {
        constructor(public amount: integer) {
        }
    }

    class Product {
        constructor(public title: string, public price: Embedded<Price>) {
        }
    }

    expect(serialize<Embedded<Price>>(new Price(34))).toEqual(34);
    expect(serialize<Embedded<Price>[]>([new Price(34)])).toEqual([34]);
    expect(serialize<Embedded<Price, { prefix: '' }>[]>([new Price(34)])).toEqual([34]);
    expect(serialize<Embedded<Price, { prefix: 'price_' }>[]>([new Price(34)])).toEqual([34]);
    expect(serialize<{ a: Embedded<Price> }>({ a: new Price(34) })).toEqual({ a: 34 });
    expect(serialize<{ a: Embedded<Price, { prefix: '' }> }>({ a: new Price(34) })).toEqual({ amount: 34 });
    expect(serialize<{ a: Embedded<Price, { prefix: 'price_' }> }>({ a: new Price(34) })).toEqual({ price_amount: 34 });
    expect(serialize<Product>(new Product('Brick', new Price(34)))).toEqual({ title: 'Brick', price: 34 });

    expect(deserialize<Embedded<Price>>(34)).toEqual(new Price(34));
    expect(deserialize<Embedded<Price>[]>([34])).toEqual([new Price(34)]);
    expect(deserialize<(Embedded<Price> | string)[]>([34])).toEqual([new Price(34)]);
    expect(deserialize<(Embedded<Price> | string)[]>(['abc'])).toEqual(['abc']);
    expect(deserialize<Embedded<Price, { prefix: '' }>[]>([34])).toEqual([new Price(34)]);
    expect(deserialize<Embedded<Price, { prefix: 'price_' }>[]>([34])).toEqual([new Price(34)]);
    expect(deserialize<{ a: Embedded<Price> }>({ a: 34 })).toEqual({ a: new Price(34) });
    expect(deserialize<{ a: Embedded<Price, { prefix: '' }> }>({ amount: 34 })).toEqual({ a: new Price(34) });
    expect(deserialize<{ a: Embedded<Price, { prefix: 'price_' }> }>({ price_amount: 34 })).toEqual({ a: new Price(34) });
    expect(deserialize<Product>({ title: 'Brick', price: 34 })).toEqual(new Product('Brick', new Price(34)));

    // check if union works correctly
    expect(serialize<{ v: Embedded<Price> | string }>({ v: new Price(34) })).toEqual({ v: 34 });
    expect(serialize<{ v: Embedded<Price> | string }>({ v: '123' })).toEqual({ v: '123' });
    expect(serialize<(Embedded<Price> | string)[]>([new Price(34)])).toEqual([34]);
    expect(serialize<(Embedded<Price> | string)[]>(['abc'])).toEqual(['abc']);
    expect(serialize<{ v: Embedded<Price, { prefix: '' }> | string }>({ v: new Price(34) })).toEqual({ amount: 34 });
    expect(serialize<{ v: Embedded<Price, { prefix: '' }> | string }>({ v: '34' })).toEqual({ v: '34' });
    expect(serialize<{ v: Embedded<Price, { prefix: 'price_' }> | string }>({ v: new Price(34) })).toEqual({ price_amount: 34 });
    expect(serialize<{ v: Embedded<Price, { prefix: 'price_' }> | string }>({ v: '34' })).toEqual({ v: '34' });

    expect(deserialize<{ v: Embedded<Price> | string }>({ v: 34 })).toEqual({ v: new Price(34) });
    expect(deserialize<{ v: Embedded<Price> | string }>({ v: '123' })).toEqual({ v: '123' });
    expect(deserialize<{ v: Embedded<Price, { prefix: '' }> | string }>({ amount: 34 })).toEqual({ v: new Price(34) });
    expect(deserialize<{ v: Embedded<Price, { prefix: '' }> | string }>({ v: '34' })).toEqual({ v: '34' });
    expect(deserialize<{ v: Embedded<Price, { prefix: 'price_' }> | string }>({ price_amount: 34 })).toEqual({ v: new Price(34) });
    expect(deserialize<{ v: Embedded<Price, { prefix: 'price_' }> | string }>({ v: '34' })).toEqual({ v: '34' });

});

test('embedded single optional', () => {
    class Price {
        constructor(public amount: integer) {
        }
    }

    expect(deserialize<{ v?: Embedded<Price> }>({ v: 34 })).toEqual({ v: new Price(34) });
    expect(deserialize<{ v?: Embedded<Price> }>({})).toEqual({});
    expect(deserialize<{ v?: Embedded<Price, { prefix: '' }> }>({ amount: 34 })).toEqual({ v: new Price(34) });
    expect(deserialize<{ v?: Embedded<Price, { prefix: '' }> }>({})).toEqual({});
    expect(deserialize<{ v?: Embedded<Price, { prefix: 'price_' }> }>({ price_amount: 34 })).toEqual({ v: new Price(34) });
    expect(deserialize<{ v?: Embedded<Price, { prefix: 'price_' }> }>({})).toEqual({});

    class Product1 {
        constructor(public title: string, public price: Embedded<Price> = new Price(15)) {
        }
    }

    class Product2 {
        constructor(public title: string, public price?: Embedded<Price>) {
        }
    }

    class Product3 {
        public price: Embedded<Price> | undefined = new Price(15);
    }

    class Product4 {
        public price: Embedded<Price> | null = new Price(15);
    }

    expect(deserialize<{ a?: Embedded<Price> }>({})).toEqual({});
    expect(deserialize<{ a?: Embedded<Price> }>({ a: undefined })).toEqual({});
    expect(deserialize<{ a?: Embedded<Price, { prefix: '' }> }>({})).toEqual({});
    expect(deserialize<{ a?: Embedded<Price, { prefix: '' }> }>({ amount: undefined })).toEqual({});
    expect(deserialize<{ a?: Embedded<Price, { prefix: 'price_' }> }>({})).toEqual({});
    expect(deserialize<{ a?: Embedded<Price, { prefix: 'price_' }> }>({ price_amount: undefined })).toEqual({});
    expect(deserialize<Product1>({ title: 'Brick' })).toEqual(new Product1('Brick'));
    expect(deserialize<Product2>({ title: 'Brick' })).toEqual(new Product2('Brick'));
    expect(deserialize<Product3>({})).toEqual({ price: new Price(15) });
    expect(deserialize<Product3>({ price: null })).toEqual({ price: undefined });
    expect(deserialize<Product4>({ price: undefined })).toEqual({ price: null });
    expect(deserialize<Product4>({})).toEqual({ price: null });
    expect(deserialize<Product4>({ price: null })).toEqual({ price: null });
});

test('embedded multi parameter', () => {
    class Price {
        constructor(public amount: integer, public currency: string = 'EUR') {
        }
    }

    class Product {
        constructor(public title: string, public price: Embedded<Price>) {
        }
    }

    expect(serialize<Embedded<Price>>(new Price(34))).toEqual({ amount: 34, currency: 'EUR' });
    expect(serialize<Embedded<Price>[]>([new Price(34)])).toEqual([{ amount: 34, currency: 'EUR' }]);
    expect(serialize<Embedded<Price, { prefix: '' }>[]>([new Price(34)])).toEqual([{ amount: 34, currency: 'EUR' }]);
    expect(serialize<Embedded<Price, { prefix: 'price_' }>[]>([new Price(34)])).toEqual([{ price_amount: 34, price_currency: 'EUR' }]);
    expect(serialize<{ a: Embedded<Price> }>({ a: new Price(34) })).toEqual({ a_amount: 34, a_currency: 'EUR' });
    expect(serialize<{ a: Embedded<Price, { prefix: '' }> }>({ a: new Price(34) })).toEqual({ amount: 34, currency: 'EUR' });
    expect(serialize<{ a: Embedded<Price, { prefix: 'price_' }> }>({ a: new Price(34) })).toEqual({ price_amount: 34, price_currency: 'EUR' });
    expect(serialize<Product>(new Product('Brick', new Price(34)))).toEqual({ title: 'Brick', price_amount: 34, price_currency: 'EUR' });

    expect(deserialize<Embedded<Price>>({ amount: 34 })).toEqual(new Price(34));
    expect(deserialize<Embedded<Price>>({ amount: 34, currency: '$' })).toEqual(new Price(34, '$'));
    expect(deserialize<Embedded<Price>[]>([{ amount: 34 }])).toEqual([new Price(34)]);
    expect(deserialize<Embedded<Price>[]>([{ amount: 34, currency: '$' }])).toEqual([new Price(34, '$')]);
    expect(deserialize<Embedded<Price, { prefix: '' }>[]>([{ amount: 34 }])).toEqual([new Price(34)]);
    expect(deserialize<Embedded<Price, { prefix: 'price_' }>[]>([{ price_amount: 34 }])).toEqual([new Price(34)]);
    expect(deserialize<{ a: Embedded<Price> }>({ a_amount: 34 })).toEqual({ a: new Price(34) });
    expect(deserialize<{ a: Embedded<Price, { prefix: '' }> }>({ amount: 34 })).toEqual({ a: new Price(34) });
    expect(deserialize<{ a: Embedded<Price, { prefix: '' }> }>({ amount: 34, currency: '$' })).toEqual({ a: new Price(34, '$') });
    expect(deserialize<{ a: Embedded<Price, { prefix: '' }> }>({ amount: 34, currency: undefined })).toEqual({ a: new Price(34) });
    expect(deserialize<{ a: Embedded<Price, { prefix: 'price_' }> }>({ price_amount: 34 })).toEqual({ a: new Price(34) });
    expect(deserialize<{ a: Embedded<Price, { prefix: 'price_' }> }>({ price_amount: 34, price_currency: '$' })).toEqual({ a: new Price(34, '$') });
    expect(deserialize<Product>({ title: 'Brick', price_amount: 34 })).toEqual(new Product('Brick', new Price(34)));

    //check if union works correctly
    expect(serialize<{ v: Embedded<Price> | string }>({ v: new Price(34) })).toEqual({ v_amount: 34, v_currency: 'EUR' });
    expect(serialize<{ v: Embedded<Price> | string }>({ v: new Price(34, '$') })).toEqual({ v_amount: 34, v_currency: '$' });
    expect(serialize<{ v: Embedded<Price> | string }>({ v: '123' })).toEqual({ v: '123' });
    expect(serialize<{ v: Embedded<Price, { prefix: '' }> | string }>({ v: new Price(34) })).toEqual({ amount: 34, currency: 'EUR' });
    expect(serialize<{ v: Embedded<Price, { prefix: '' }> | string }>({ v: '34' })).toEqual({ v: '34' });
    expect(serialize<{ v: Embedded<Price, { prefix: 'price_' }> | string }>({ v: new Price(34) })).toEqual({ price_amount: 34, price_currency: 'EUR' });
    expect(serialize<{ v: Embedded<Price, { prefix: 'price_' }> | string }>({ v: '34' })).toEqual({ v: '34' });

    expect(deserialize<{ v: Embedded<Price> | string }>({ v_amount: 34 })).toEqual({ v: new Price(34) });
    expect(deserialize<{ v: Embedded<Price> | string }>({ v_amount: 34, v_currency: '$' })).toEqual({ v: new Price(34, '$') });
    expect(deserialize<{ v: Embedded<Price> | string }>({ v: '123' })).toEqual({ v: '123' });
    expect(deserialize<{ v: Embedded<Price, { prefix: '' }> | string }>({ amount: 34 })).toEqual({ v: new Price(34) });
    expect(deserialize<{ v: Embedded<Price, { prefix: '' }> | string }>({ v: '34' })).toEqual({ v: '34' });
    expect(deserialize<{ v: Embedded<Price, { prefix: 'price_' }> | string }>({ price_amount: 34 })).toEqual({ v: new Price(34) });
    expect(deserialize<{ v: Embedded<Price, { prefix: 'price_' }> | string }>({ v: '34' })).toEqual({ v: '34' });
});

test('class inheritance', () => {
    abstract class Person {
        id: number & PrimaryKey & AutoIncrement = 0;
        firstName?: string;
        lastName?: string;
        abstract type: string;
    }

    class Employee extends Person {
        email?: string;
        type: 'employee' = 'employee';
    }

    class Freelancer extends Person {
        @t budget: number = 10_000;
        type: 'freelancer' = 'freelancer';
    }

    const employee = ReflectionClass.from(Employee);
    expect(employee.getProperty('firstName').getKind()).toBe(ReflectionKind.string);
    const scopeSerializer = getSerializeFunction(employee.type, serializer.serializeRegistry);

    expect(scopeSerializer({ type: 'employee', firstName: 'Peter', email: 'test@example.com' })).toEqual({ type: 'employee', firstName: 'Peter', email: 'test@example.com' });
});

test('class with union literal', () => {
    class ConnectionOptions {
        readConcernLevel: 'local' | 'majority' | 'linearizable' | 'available' = 'majority';
    }

    expect(cast<ConnectionOptions>({ readConcernLevel: 'majority' })).toEqual({ readConcernLevel: 'majority' });
    expect(cast<ConnectionOptions>({ readConcernLevel: 'linearizable' })).toEqual({ readConcernLevel: 'linearizable' });
    expect(cast<ConnectionOptions>({ readConcernLevel: 'unknown' })).toEqual({ readConcernLevel: 'majority' });
});

test('named tuple in error message', () => {
    expect(cast<[age: number]>([23])).toEqual([23]);
    expect(() => cast<{ v: [age: number] }>({ v: ['123abc'] })).toThrow('v.age(type): Cannot convert 123abc to number');
});

test('intersected mapped type key', () => {
    type SORT_ORDER = 'asc' | 'desc' | any;
    type Sort<T, ORDER extends SORT_ORDER = SORT_ORDER> = { [P in keyof T & string]?: ORDER };

    interface A {
        username: string;
        id: number;
    }

    type sortA = Sort<A>;

    expect(cast<sortA>({ username: 'asc' })).toEqual({ username: 'asc' });
    expect(cast<sortA>({ id: 'desc', username: 'asc' })).toEqual({ id: 'desc', username: 'asc' });

    type sortAny = Sort<any>;
    expect(cast<sortAny>({ username: 'asc' })).toEqual({ username: 'asc' });
    expect(cast<sortAny>({ id: 'desc', username: 'asc' })).toEqual({ id: 'desc', username: 'asc' });
});

test('wild property names', () => {
    interface A {
        ['asd-344']: string;
        ['#$%^^x']: number;
    }

    expect(deserialize<A>({ 'asd-344': 'abc', '#$%^^x': 3 })).toEqual({ 'asd-344': 'abc', '#$%^^x': 3 });
});

test('embedded with lots of properties', () => {
    interface LotsOfIt {
        a?: string;
        lot?: string;
        of?: string;
        additional?: string;
        properties?: string;
    }

    class A {
        constructor(public options: Embedded<LotsOfIt, { prefix: '' }> = {}) {
        }
    }

    const back1 = deserialize<A>({ a: 'abc', lot: 'string' });
    expect(back1.options).toEqual({ a: 'abc', lot: 'string' });

    class A2 {
        public options: Embedded<LotsOfIt, { prefix: '' }> = {};
    }

    const back2 = deserialize<A2>({ a: 'abc', lot: 'string' });
    expect(back2.options).toEqual({ a: 'abc', lot: 'string' });
});

test('embedded in super class', () => {
    class Thread {
        public parentThreadId?: string;
        public senderOrder?: number;

        constructor(
            public id: string & MapName<'~thread'>
        ) {
        }
    }

    class ComposedMessage {
        thread?: Embedded<Thread, { prefix: '' }>;
    }

    class Message extends ComposedMessage {
        public readonly type: string = Message.type;
        public static readonly type = 'my-id';

        public routingKeys?: string[];
        public endpoint?: string;
    }

    const back1 = deserialize<Message>({ '~thread': 'foo' });
    expect(back1).toEqual({ type: Message.type, thread: { id: 'foo' } });

    const plain = serialize<Message>(back1);
    expect(plain).toEqual({ type: Message.type, parentThreadId: null, senderOrder: null, '~thread': 'foo' });
});

test('disabled constructor', () => {
    let called = false;

    @entity.disableConstructor()
    class User {
        id: number = 0;
        title: string = 'id:' + this.id;

        constructor(public type: string) {
            called = true;
        }
    }

    expect(ReflectionClass.from(User).disableConstructor).toBe(true);

    const user = deserialize<User>({ type: 'nix' });
    expect(called).toBe(false);
    expect(user).toBeInstanceOf(User);
    expect(user).toEqual({ id: 0, title: 'id:' + 0, type: 'nix' });
});

test('readonly constructor properties', () => {
    class Pilot {
        constructor(readonly name: string, readonly age: number) {
        }
    }

    expect(cast<Pilot>({ name: 'Peter', age: 32 })).toEqual({ name: 'Peter', age: 32 });
    expect(cast<Pilot>({ name: 'Peter', age: '32' })).toEqual({ name: 'Peter', age: 32 });
});

test('naming strategy prefix', () => {
    class MyNamingStrategy extends NamingStrategy {
        constructor() {
            super('my');
        }

        override getPropertyName(type: TypeProperty | TypePropertySignature, forSerializer: string): string | undefined {
            return '_' + super.getPropertyName(type, forSerializer);
        }
    }

    interface Post {
        id: number;
        likesCount: number;
    }

    interface User {
        readonly id: number;
        readonly posts: readonly Post[];
    }

    {
        const res = serialize<User>({ id: 2, posts: [{ id: 3, likesCount: 1 }, { id: 4, likesCount: 2 }] }, undefined, undefined, new MyNamingStrategy);
        expect(res).toEqual({ _id: 2, _posts: [{ _id: 3, _likesCount: 1 }, { _id: 4, _likesCount: 2 }] });
    }

    {
        const res = deserialize<User>({ _id: 2, _posts: [{ _id: 3, _likesCount: 1 }, { _id: 4, _likesCount: 2 }] }, undefined, undefined, new MyNamingStrategy);
        expect(res).toEqual({ id: 2, posts: [{ id: 3, likesCount: 1 }, { id: 4, likesCount: 2 }] });
    }
});

test('naming strategy camel case', () => {
    const camelCaseToSnakeCase = (str: string) =>
        str.replace(/[A-Z]/g, (letter) => `_${letter.toLowerCase()}`);

    class CamelCaseToSnakeCaseNamingStrategy extends NamingStrategy {
        constructor() {
            super('snake-case-to-camel-case');
        }

        override getPropertyName(
            type: TypeProperty | TypePropertySignature,
            forSerializer: string
        ): string | undefined {
            const propertyName = super.getPropertyName(type, forSerializer);
            return propertyName ? camelCaseToSnakeCase(propertyName) : undefined;
        }
    }

    interface Post {
        id: number;
        likesCount: number;
    }

    interface User {
        id: number;
        posts: Post[];
    }

    {
        const res = serialize<User>({ id: 2, posts: [{ id: 3, likesCount: 1 }, { id: 4, likesCount: 2 }] }, undefined, undefined, new CamelCaseToSnakeCaseNamingStrategy);
        expect(res).toEqual({ id: 2, posts: [{ id: 3, likes_count: 1 }, { id: 4, likes_count: 2 }] });
    }

    {
        const res = deserialize<User>({ id: 2, posts: [{ id: 3, likes_count: 1 }, { id: 4, likes_count: 2 }] }, undefined, undefined, new CamelCaseToSnakeCaseNamingStrategy);
        expect(res).toEqual({ id: 2, posts: [{ id: 3, likesCount: 1 }, { id: 4, likesCount: 2 }] });
    }
});

test('enum mixed case', () => {
    enum Units {
        MILLIGRAM = 'm',
        GRAM = 'g',
        KILOGRAM = 'k',
    }

    expect(cast<Units>('milligram')).toBe('m');
    expect(cast<Units>('milligram')).toBe(Units.MILLIGRAM);

    expect(cast<Units>('MilliGRAM')).toBe(Units.MILLIGRAM);

    expect(cast<Units>('gram')).toBe('g');
    expect(cast<Units>('gram')).toBe(Units.GRAM);

    expect(cast<number | Units>('GRAM')).toBe(Units.GRAM);
    expect(cast<number | Units>(23)).toBe(23);
    expect(cast<number | Units>('Gram')).toBe(Units.GRAM);
});

test('onLoad call', () => {
    class Target {
        id: number = 0;
        loaded = false;

        onLoad(): void {
            this.loaded = true;
        }
    }

    const serializer = new class extends Serializer {
        override registerSerializers() {
            super.registerSerializers();
            this.deserializeRegistry.addDecorator(
                (type: Type) => type.kind === ReflectionKind.class && type.classType === Target,
                (type, state) => {
                    state.addCode(`${state.setter}.onLoad();`);
                }
            )
        }
    }

    const target = cast<Target>({id: 1}, undefined, serializer);
    expect(target.loaded).toBe(true);
});

test('onLoad call2', () => {
    class Target {
        id: number = 0;
        loaded = false;

        onLoad(): void {
            this.loaded = true;
        }
    }

    const serializer = new class extends Serializer {
        override registerSerializers() {
            super.registerSerializers();
            this.deserializeRegistry.addDecorator(
                isTypeClassOf(Target),
                (type, state) => {
                    state.touch((target: Target) => target.onLoad())
                }
            )
        }
    }

    const target = cast<Target>({id: 1}, undefined, serializer);
    expect(target.loaded).toBe(true);
});

test('onLoad call3', () => {
    class Target {
        id: number = 0;
        loaded = false;

        onLoad(): void {
            this.loaded = true;
        }
    }

    const serializer = new class extends Serializer {
        override registerSerializers() {
            super.registerSerializers();
            this.deserializeRegistry.addDecorator(
                isCustomTypeClass,
                (type, state) => {
                    state.touch((value) => {
                        if ('onLoad' in value) value.onLoad();
                    });
                }
            );
        }
    }

    const target = cast<Target>({id: 1}, undefined, serializer);
    expect(target.loaded).toBe(true);
});

test('enum union', () => {
    enum StatEnginePowerUnit {
        Hp = 'hp',
    }

    enum StatWeightUnit {
        Lbs = 'lbs',
        Kg = 'kg',
    }

    type StatMeasurementUnit = StatEnginePowerUnit | StatWeightUnit;
    const type = typeOf<StatMeasurementUnit>();
    assertType(type, ReflectionKind.union);
    expect(type.types.length).toBe(2);

    expect(deserialize<StatMeasurementUnit>(StatWeightUnit.Kg)).toBe(StatWeightUnit.Kg);
    expect(deserialize<StatMeasurementUnit>(StatWeightUnit.Lbs)).toBe(StatWeightUnit.Lbs);
    expect(deserialize<StatMeasurementUnit>(StatEnginePowerUnit.Hp)).toBe(StatEnginePowerUnit.Hp);
});

test('union literals in union', () => {
    type StatWeightUnit = 'lbs' | 'kg';
    type StatEnginePowerUnit = 'hp';

    type StatMeasurementUnit = StatEnginePowerUnit | StatWeightUnit;
    const type = typeOf<StatMeasurementUnit>();
    assertType(type, ReflectionKind.union);
    expect(type.types.length).toBe(3);

    expect(deserialize<StatMeasurementUnit>('kg')).toBe('kg');
    expect(deserialize<StatMeasurementUnit>('lbs')).toBe('lbs');
    expect(deserialize<StatMeasurementUnit>('hp')).toBe('hp');
});

test('union literals in union imported', () => {
    type StatMeasurementUnit = StatEnginePowerUnit | StatWeightUnit;
    const type = typeOf<StatMeasurementUnit>();
    assertType(type, ReflectionKind.union);
    expect(type.types.length).toBe(3);

    expect(deserialize<StatMeasurementUnit>('kg')).toBe('kg');
    expect(deserialize<StatMeasurementUnit>('lbs')).toBe('lbs');
    expect(deserialize<StatMeasurementUnit>('hp')).toBe('hp');
});

test('function rest parameters', () => {
    type t = (start: number, ...rest: string[]) => void;
    const fn = typeOf<t>();
    assertType(fn, ReflectionKind.function);
    {
        const type = typeOf<Parameters<never>>([fn]); //same as Parameters<t>
        expect(deserialize([2, '33', 44], undefined, undefined, undefined, type)).toEqual([2, '33', '44']);
    }
    {
        const type = parametersToTuple(fn.parameters);
        expect(deserialize([2, '33', 44], undefined, undefined, undefined, type)).toEqual([2, '33', '44']);
    }
});

test('discriminated union with string date in type guard', () => {
    expect(is<number | string>(12)).toBe(true);
    expect(is<number | string>('abc')).toBe(true);
    expect(is<number | string>(false)).toBe(false);
    expect(is<number | (string | bigint)[]>([false])).toBe(false);

    {
        type ModelB = { kind: 'b', date: Date };
        const b1 = cast<ModelB>({ kind: 'b', date: '2020-08-05T00:00:00.000Z' });
        expect(b1).toEqual({ kind: 'b', date: new Date('2020-08-05T00:00:00.000Z') });
    }

    {
        type ModelA = { id: number, title: string };
        type ModelB = { id: number, date: Date };
        type Union = ModelA | ModelB;

        const b2 = cast<Union>({ id: 1, date: '2020-08-05T00:00:00.000Z' });
        expect(b2).toEqual({ id: 1, date: new Date('2020-08-05T00:00:00.000Z') });
    }

    {
        type ModelA = { kind: 'a', title: string };
        type ModelB = { kind: 'b', date: Date };
        type Union = ModelA | ModelB;

        const b2 = cast<Union>({ kind: 'b', date: '2020-08-05T00:00:00.000Z' });
        expect(b2).toEqual({ kind: 'b', date: new Date('2020-08-05T00:00:00.000Z') });
    }

    {
        type ModelA = { kind: 'a', title: string };
        type ModelB = { kind: 'b', date: number | Date };
        type Union = ModelA | ModelB;
        const b2 = cast<Union>({ kind: 'b', date: '2020-08-05T00:00:00.000Z' });
        expect(b2).toEqual({ kind: 'b', date: new Date('2020-08-05T00:00:00.000Z') });
    }
});

test('date format', () => {
    const date = cast<number | Date>('2020-07-02T12:00:00Z');
    expect(date).toEqual(new Date('2020-07-02T12:00:00Z'));
});


test('patch', () => {
    class Address {
        street!: string & MinLength<3>;
        streetNo!: string;
        additional: { [name: string]: string } = {};
    }

    class Order {
        id!: number;
        shippingAddress!: Address;
    }

    {
        const data = patch<Order>({ id: 5, 'shippingAddress.street': 123 }, undefined, undefined, underscoreNamingStrategy);
        expect(data).toEqual({ id: 5, 'shipping_address.street': '123' });
    }

    //no validation for the moment until object reference->primary key validation is implemented for the ORM
    // {
    //     expect(() => patch<Order>({ 'shippingAddress.street': 12 }, undefined, undefined, underscoreNamingStrategy)).toThrow('Min length is 3');
    // }

    {
        //index signature are not touched by naming strategy
        const data = patch<Order>({ id: 5, 'shippingAddress.additional.randomName': 12 }, undefined, undefined, underscoreNamingStrategy);
        expect(data).toEqual({ id: 5, 'shipping_address.additional.randomName': '12' });
    }
});

test('extend with custom type', () => {
    type StringifyTransport = TypeAnnotation<'stringifyTransport'>;

    function isStringifyTransportType(type: Type): boolean {
        return !!typeAnnotation.getType(type, 'stringifyTransport');
    }

    serializer.serializeRegistry.addPostHook((type, state) => {
        if (!isStringifyTransportType(type)) return;
        state.addSetter(`JSON.stringify(${state.accessor})`);
    });
    serializer.deserializeRegistry.addPreHook((type, state) => {
        if (!isStringifyTransportType(type)) return;
        state.addSetter(`JSON.parse(${state.accessor})`);
    });

    class MyType {
        test!: string;
    }

    class Entity {
        obj: MyType & StringifyTransport = { test: 'abc' };
    }

    const e = new Entity();
    const s = serialize<Entity>(e, undefined, serializer);
    expect(s.obj).toBe('{"test":"abc"}');
    const d = deserialize<Entity>(s, undefined, serializer);
    expect(d.obj).toEqual({ test: 'abc' });
});

test('issue-415: serialize literal types in union', () => {
    enum MyEnum {
        VALUE_0 = 0,
        VALUE_180 = 180
    }

    class Data {
        rotate: MyEnum.VALUE_180 | MyEnum.VALUE_0 = MyEnum.VALUE_0;
    }

    expect(deserialize<Data>({ rotate: 0 }, { loosely: true }).rotate).toBe(0);
    expect(deserialize<Data>({ rotate: '0' }, { loosely: true }).rotate).toBe(0);
    expect(deserialize<Data>({ rotate: 180 }, { loosely: true }).rotate).toBe(180);
    expect(deserialize<Data>({ rotate: '180' }, { loosely: true }).rotate).toBe(180);
    expect(deserialize<Data>({ rotate: 123456 }, { loosely: true }).rotate).toBe(0);
});

test('union with optional property', () => {
    type A = { type: 'a', value?: string } | null;

    {
        const a = deserialize<A>({ type: 'a' });
        expect(a).toEqual({ type: 'a' });
    }
    {
        const a = deserialize<A>({ type: 'a', value: 'b' });
        expect(a).toEqual({ type: 'a', value: 'b' });
    }
    {
        const a = deserialize<A>(null);
        expect(a).toEqual(null);
    }
    {
        const a = deserialize<A>({ type: 'a', value: null });
        expect(a).toEqual({ type: 'a', value: undefined });
    }
});

test("parcel search input deserialization", async () => {
    class GeoLocation {
        locality?: string;
        postalCode?: string;

        hasCoords() {
            return true;
        }
    }

    interface AdTitleAndBasicAttributes {
        title: string;
        attributes: {
            plotSurface?: number,
            buildingSurface: number,
            ges?: string,
            energyRate?: string,
        };
        location: GeoLocation,
    }

    class ParcelSearchParams {
        ad: AdTitleAndBasicAttributes | null = null;
    }

    const data: any = {
        "ad": {
            "title": "Maison 4 pièces 92 m²",
            "attributes": {
                "buildingSurface": 92,
                "energyRate": "D",
                "ges": "E"
            },
            "location": {
                "locality": "Paris",
                "postalCode": "75000"
            }
        }
    } as any;

    const location = cast<GeoLocation>(data.ad.location);
    expect(location).toBeInstanceOf(GeoLocation);
    expect(location.locality).toBe("Paris");

    const search = cast<ParcelSearchParams>(data);
    expect(search.ad).not.toBeUndefined();
    expect(search.ad!.location).toBeInstanceOf(GeoLocation);
    expect(search?.ad?.attributes?.buildingSurface).toBe(92);
    expect(search?.ad?.location.hasCoords()).toBeTruthy();
});

test('skip parameter name resolving', () => {
    class Guest {
        constructor(public id: number) {
        }
    }

    class Vehicle {
        constructor(public Guest: Guest) {
        }
    }

    console.log(stringifyResolvedType(typeOf<Vehicle>()));

    expect(cast<Vehicle>({ Guest: { id: '1' } })).toEqual(new Vehicle(new Guest(1)));
});

test('union with almost same member, additional properties', () => {
    type T = { a: string } | { a: string, b: number };
    const t1 = cast<T>({ a: '3' });
    expect(t1).toEqual({ a: '3' });
    const t2 = cast<T>({ a: '3', b: '4' });
    expect(t2).toEqual({ a: '3', b: 4 });
});

test('union with almost same member, optional properties', () => {
    type T = { a: string; c?: number } | { a: string, b?: number };
    const t1 = cast<T>({ a: '3' });
    expect(t1).toEqual({ a: '3' });
    const t2 = cast<T>({ a: '3', b: 4 });
    expect(t2).toEqual({ a: '3', b: 4 });
});

test('union with less specific last', () => {
    type T = { a: string; c?: number } | { a: string };
    const t1 = cast<T>({ a: '3' });
    expect(t1).toEqual({ a: '3' });
    const t2 = cast<T>({ a: '3', c: 4 });
    expect(t2).toEqual({ a: '3', c: 4 });
});

test('union same member, optional', () => {
    type T = { a: number, b?: number } | { a: number; b: string; };
    const t1 = serialize<T>({ a: 3 });
    expect(t1).toEqual({ a: 3 });
    const t2 = serialize<T>({ a: 3, b: '4' });
    expect(t2).toEqual({ a: 3, b: '4' });
    const t3 = serialize<T>({ a: 3, b: 4 });
    expect(t3).toEqual({ a: 3, b: 4 });
});

test('large literal union does not create a guard per member (#478)', () => {
    type Hour = '00' | '01' | '02' | '03' | '04' | '05' | '06' | '07' | '08' | '09' | '10' | '11'
        | '12' | '13' | '14' | '15' | '16' | '17' | '18' | '19' | '20' | '21' | '22' | '23';
    type Digit = '0' | '1' | '2' | '3' | '4' | '5' | '6' | '7' | '8' | '9';
    type Minute = `${'0' | '1' | '2' | '3' | '4' | '5'}${Digit}`;
    type Clock = `${Hour}:${Minute}:${Minute}`;

    expect(deserialize<Clock>('01:01:59')).toBe('01:01:59');
    expect(is<Clock>('01:01:59')).toBe(true);
    expect(is<Clock>('25:01:59')).toBe(false);
    expect(() => cast<{ v: Clock }>({ v: '24:00:00' })).toThrow('v(type): No valid union member found');

    //loose conversion of grouped number literals
    type Numbers = 0 | 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10 | 11;
    expect(cast<Numbers>('3')).toBe(3);
    expect(is<Numbers>('3')).toBe(false);
});
