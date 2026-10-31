import { expect, test } from '@jest/globals';
import bson, { Binary } from 'bson';
import { deserializeBSON, getBSONDeserializer } from '../src/bson-deserializer.js';
import { BinaryBigInt, copyAndSetParent, MinLength, MongoId, nodeBufferToArrayBuffer, PrimaryKey, Reference, ReflectionKind, SerializedTypes, SignedBinaryBigInt, TypeObjectLiteral, typeOf, uuid, UUID } from '@deepkit/type';
import { getClassName } from '@deepkit/core';
import { getBSONSerializer, serializeBSON, serializeBSONWithoutOptimiser } from '../src/bson-serializer.js';
import { BSONType } from '../src/utils';
import { deserializeBSONWithoutOptimiser } from '../src/bson-parser';
import { getBsonEncoder } from '../src/encoder.js';

const { deserialize, serialize } = bson;

test('basic number', () => {
    const obj = { v: 123 };
    const bson = serialize(obj);

    const schema = typeOf<{
        v: number
    }>();
    expect(getBSONDeserializer(undefined, schema)(bson)).toEqual(obj);
    expect(getBSONDeserializer(undefined, schema)(serialize({ v: '123' }))).toEqual(obj);
    expect(getBSONDeserializer(undefined, schema)(serialize({ v: true }))).toEqual({ v: 1 });
    expect(getBSONDeserializer(undefined, schema)(serialize({ v: false }))).toEqual({ v: 0 });
    expect(getBSONDeserializer(undefined, schema)(serialize({ v: -1234 }))).toEqual({ v: -1234 });
    expect(getBSONDeserializer(undefined, schema)(serialize({ v: {} }))).toEqual({ v: 0 });
});

test('basic bigint', () => {
    const obj = { v: 123n };
    const bson = serialize({ v: 123 });

    const schema = typeOf<{
        v: bigint
    }>();
    expect(getBSONDeserializer(undefined, schema)(bson)).toEqual(obj);
    expect(getBSONDeserializer(undefined, schema)(serialize({ v: '123' }))).toEqual(obj);
    expect(getBSONDeserializer(undefined, schema)(serialize({ v: true }))).toEqual({ v: 1n });
    expect(getBSONDeserializer(undefined, schema)(serialize({ v: false }))).toEqual({ v: 0n });
    expect(getBSONDeserializer(undefined, schema)(serialize({ v: {} }))).toEqual({ v: 0n });
});

test('basic null', () => {
    const schema = typeOf<{
        v: null
    }>();
    expect(getBSONDeserializer(undefined, schema)(serialize({ v: null }))).toEqual({ v: null });
    expect(getBSONDeserializer(undefined, schema)(serialize({ v: undefined }))).toEqual({ v: null });
    expect(getBSONDeserializer(undefined, schema)(serialize({}))).toEqual({ v: null });
    expect(() => getBSONDeserializer(undefined, schema)(serialize({ v: 123 }))).toThrow(`Cannot convert bson type INT to null`);
    expect(() => getBSONDeserializer(undefined, schema)(serialize({ v: {} }))).toThrow(`Cannot convert bson type OBJECT to null`);

    expect(deserializeBSON<{ v: null }>(serialize({ v: null }))).toEqual({ v: null });
    expect(deserializeBSON<{ v?: null }>(serialize({ v: null }))).toEqual({ v: null });
    expect(deserializeBSON<{ v?: null }>(serialize({ v: undefined }))).toEqual({ v: undefined });
});

test('basic undefined', () => {
    const schema = typeOf<{
        v: undefined
    }>();
    expect(getBSONDeserializer(undefined, schema)(serialize({ v: null }))).toEqual({ v: undefined });
    expect(getBSONDeserializer(undefined, schema)(serialize({ v: undefined }))).toEqual({ v: undefined });
    expect(getBSONDeserializer(undefined, schema)(serialize({}))).toEqual({ v: undefined });
    expect(() => getBSONDeserializer(undefined, schema)(serialize({ v: 123 }))).toThrow(`Cannot convert bson type INT to undefined`);
    expect(() => getBSONDeserializer(undefined, schema)(serialize({ v: {} }))).toThrow(`Cannot convert bson type OBJECT to undefined`);
});

test('basic literal', () => {
    expect(deserializeBSON<{ v: 'abc' }>(serialize({ v: null }))).toEqual({ v: 'abc' });
    expect(deserializeBSON<{ v: 'abc' }>(serialize({ v: undefined }))).toEqual({ v: 'abc' });
    expect(deserializeBSON<{ v: 'abc' }>(serialize({}))).toEqual({ v: 'abc' });
    expect(deserializeBSON<{ v: 'abc' }>(serialize({ v: 1234 }))).toEqual({ v: 'abc' });

    expect(deserializeBSON<{ v: 123 }>(serialize({ v: 'abc' }))).toEqual({ v: 123 });
    expect(deserializeBSON<{ v: true }>(serialize({ v: 'abc' }))).toEqual({ v: true });
});

test('basic optional', () => {
    expect(deserializeBSON<{ v?: string }>(serialize({ v: 'abc' }))).toEqual({ v: 'abc' });
    expect(deserializeBSON<{ v?: string }>(serialize({ v: null }))).toEqual({ v: undefined });
    expect(deserializeBSON<{ v?: string }>(serialize({ v: undefined }))).toEqual({ v: undefined });
});

test('basic date', () => {
    const date = new Date;
    expect(deserializeBSON<{ v: Date }>(serialize({ v: date }))).toEqual({ v: date });
    expect(deserializeBSON<{ v: Date }>(serialize({ v: date.toJSON() }))).toEqual({ v: date });
    expect(deserializeBSON<{ v: Date }>(serialize({ v: date.valueOf() }))).toEqual({ v: date });
});

test('basic class with constructor', () => {
    class User {
        id: number = 0;

        constructor(public username: string) {
        }
    }

    {
        const user = deserializeBSON<User>(serialize({ username: 'Peter' }));
        expect(user).toBeInstanceOf(User);
        expect(user.username).toBe('Peter');
        expect(user.id).toBe(0);
    }

    {
        const user = deserializeBSON<User>(serialize({ id: 3, username: 'Peter' }));
        expect(user).toBeInstanceOf(User);
        expect(user.username).toBe('Peter');
        expect(user.id).toBe(3);
    }
});

test('basic class no constructor', () => {
    class User {
        id: number = 0;
        username!: string;
    }

    {
        const user = deserializeBSON<User>(serialize({ username: 'Peter' }));
        expect(user).toBeInstanceOf(User);
        expect(user.username).toBe('Peter');
        expect(user.id).toBe(0);
    }

    {
        const user = deserializeBSON<User>(serialize({ id: 3, username: 'Peter' }));
        expect(user).toBeInstanceOf(User);
        expect(user.username).toBe('Peter');
        expect(user.id).toBe(3);
    }
});

test('basic optional property with initializer', () => {
    const defaultValue = new Date;

    class User {
        v: Date = defaultValue;
    }

    expect(deserializeBSON<User>(serialize({ v: new Date(1) }))).toEqual({ v: new Date(1) });
    expect(deserializeBSON<User>(serialize({ v: undefined }))).toEqual({ v: defaultValue });
    expect(deserializeBSON<User>(serialize({ v: null }))).toEqual({ v: defaultValue });
    expect(deserializeBSON<User>(serialize({}))).toEqual({ v: defaultValue });
});

test('basic binary bigint', () => {
    const buffer = Buffer.from([100]);
    const obj = { v: 100n };
    const bson = serialize({ v: new Binary(buffer, Binary.SUBTYPE_DEFAULT) });

    const schema = typeOf<{
        v: BinaryBigInt
    }>();
    expect(getBSONDeserializer(undefined, schema)(bson)).toEqual(obj);
    expect(getBSONDeserializer(undefined, schema)(serialize({ v: '123' }))).toEqual({ v: 123n });
    expect(getBSONDeserializer(undefined, schema)(serialize({ v: true }))).toEqual({ v: 1n });
    expect(getBSONDeserializer(undefined, schema)(serialize({ v: false }))).toEqual({ v: 0n });
    expect(getBSONDeserializer(undefined, schema)(serialize({ v: {} }))).toEqual({ v: 0n });
});

test('basic signed binary bigint', () => {
    const buffer = Buffer.from([0, 100]);
    const obj = { v: 100n };
    const bson = serialize({ v: new Binary(buffer, Binary.SUBTYPE_DEFAULT) });
    const bsonNegative = serialize({ v: new Binary(Buffer.from([255, 100]), Binary.SUBTYPE_DEFAULT) });

    const schema = typeOf<{
        v: SignedBinaryBigInt
    }>();
    expect(getBSONDeserializer(undefined, schema)(bson)).toEqual(obj);
    expect(getBSONDeserializer(undefined, schema)(bsonNegative)).toEqual({ v: -100n });
    expect(getBSONDeserializer(undefined, schema)(serialize({ v: '123' }))).toEqual({ v: 123n });
    expect(getBSONDeserializer(undefined, schema)(serialize({ v: true }))).toEqual({ v: 1n });
    expect(getBSONDeserializer(undefined, schema)(serialize({ v: false }))).toEqual({ v: 0n });
    expect(getBSONDeserializer(undefined, schema)(serialize({ v: {} }))).toEqual({ v: 0n });
});

test('basic string', () => {
    const obj = { v: 'abc' };
    const bson = serialize(obj);

    const schema = typeOf<{
        v: string
    }>();
    expect(getBSONDeserializer(undefined, schema)(bson)).toEqual(obj);
    expect(getBSONDeserializer(undefined, schema)(serialize({ v: 123 }))).toEqual({ v: '123' });
    expect(() => getBSONDeserializer(undefined, schema)(serialize({ v: {} }))).toThrow(`Cannot convert bson type OBJECT to string`);
});

test('basic boolean', () => {
    const obj = { v: true };
    const bson = serialize(obj);

    const schema = typeOf<{
        v: boolean
    }>();
    expect(getBSONDeserializer(undefined, schema)(bson)).toEqual(obj);
    expect(getBSONDeserializer(undefined, schema)(serialize({ v: 123 }))).toEqual({ v: true });
    expect(getBSONDeserializer(undefined, schema)(serialize({ v: 0 }))).toEqual({ v: false });
    expect(getBSONDeserializer(undefined, schema)(serialize({ v: '123' }))).toEqual({ v: true });
});

test('basic array buffer', () => {
    const buffer = Buffer.allocUnsafe(16);
    const obj = { v: nodeBufferToArrayBuffer(buffer) };
    const bson = serialize({ v: new Binary(buffer, Binary.SUBTYPE_DEFAULT) });

    const schema = typeOf<{
        v: ArrayBuffer
    }>();
    expect(getBSONDeserializer(undefined, schema)(bson)).toEqual(obj);
    expect(() => getBSONDeserializer(undefined, schema)(serialize({ v: '123' }))).toThrow(`Cannot convert bson type STRING to ArrayBuffer`);
});

test('basic typed array', () => {
    const buffer = Buffer.allocUnsafe(16);
    const obj = { v: new Uint8Array(buffer) };
    const bson = serialize({ v: new Binary(buffer, Binary.SUBTYPE_DEFAULT) });

    const schema = typeOf<{
        v: Uint8Array
    }>();
    expect(getBSONDeserializer(undefined, schema)(bson)).toEqual(obj);
    expect(() => getBSONDeserializer(undefined, schema)(serialize({ v: '123' }))).toThrow(`Cannot convert bson type STRING to Uint8Array`);
});

test('basic union', () => {
    type t = { v: string | number };
    expect(deserializeBSON<t>(serialize({ v: 'abc' }))).toEqual({ v: 'abc' });
    expect(deserializeBSON<t>(serialize({ v: 123 }))).toEqual({ v: 123 });
});

test('basic union two objects', () => {
    type t = { a: string } | { b: number };
    expect(deserializeBSON<t>(serialize({ a: 'abc' }))).toEqual({ a: 'abc' });
    expect(deserializeBSON<t>(serialize({ b: 123 }))).toEqual({ b: 123 });
});

test('basic union with typed array', () => {
    const buffer = Buffer.allocUnsafe(16);
    expect(deserializeBSON<{
        v: string | Uint8Array
    }>(serialize({ v: new Binary(buffer, Binary.SUBTYPE_DEFAULT) }))).toEqual({ v: new Uint8Array(buffer) });
    expect(deserializeBSON<{ v: string | Uint8Array }>(serialize({ v: 'abc' }))).toEqual({ v: 'abc' });
    expect(() => deserializeBSON<{ v: string | Uint8Array }>(serialize({ v: {} }))).toThrow('v(type): Expected string | Uint8Array');
});

test('basic union with arraybuffer', () => {
    const buffer = Buffer.allocUnsafe(16);
    expect(deserializeBSON<{
        v: string | ArrayBuffer
    }>(serialize({ v: new Binary(buffer, Binary.SUBTYPE_DEFAULT) }))).toEqual({ v: nodeBufferToArrayBuffer(buffer) });
    expect(deserializeBSON<{ v: string | ArrayBuffer }>(serialize({ v: 'abc' }))).toEqual({ v: 'abc' });
    expect(() => deserializeBSON<{
        v: string | ArrayBuffer
    }>(serialize({ v: {} }))).toThrow('v(type): Expected string | ArrayBuffer');
});

test('basic union ', () => {
    expect(deserializeBSON<{ v: string | number }>(serialize({ v: 'abc' }))).toEqual({ v: 'abc' });
    expect(deserializeBSON<{ v: string | number }>(serialize({ v: 123 }))).toEqual({ v: 123 });
    expect(() => deserializeBSON<{ v: string | number }>(serialize({ v: undefined }))).toThrow('Cannot convert undefined value to string | number');
    expect(() => deserializeBSON<{ v: string | number }>(serialize({}))).toThrow('Cannot convert undefined value to string | number');
    expect(deserializeBSON<{ v?: string | number }>(serialize({ v: undefined }))).toEqual({ v: undefined });
    expect(deserializeBSON<{ v?: string | number }>(serialize({ v: null }))).toEqual({ v: undefined });
    expect(deserializeBSON<{ v?: string | number }>(serialize({}))).toEqual({ v: undefined });
});

test('basic union with null', () => {
    expect(deserializeBSON<{ v: string | null }>(serialize({ v: 'abc' }))).toEqual({ v: 'abc' });
    expect(deserializeBSON<{ v: string | null }>(serialize({ v: null }))).toEqual({ v: null });
    expect(deserializeBSON<{ v?: string | null }>(serialize({ v: null }))).toEqual({ v: null });
    expect(deserializeBSON<{ v?: string | null }>(serialize({ v: undefined }))).toEqual({ v: undefined });
});

test('basic union with literals', () => {
    expect(deserializeBSON<{ v: 'a' | 'b' }>(serialize({ v: 'a' }))).toEqual({ v: 'a' });
    expect(deserializeBSON<{ v: 'a' | string }>(serialize({ v: 'a' }))).toEqual({ v: 'a' });
    expect(deserializeBSON<{ v: 'a' | string }>(serialize({ v: 'abc' }))).toEqual({ v: 'abc' });

    expect(deserializeBSON<{ v: 'a' | 2 }>(serialize({ v: 'a' }))).toEqual({ v: 'a' });
    expect(deserializeBSON<{ v: 'a' | 2 }>(serialize({ v: 'a' }))).toEqual({ v: 'a' });
    expect(deserializeBSON<{ v: 'a' | 2, num: number }>(serialize({ v: 2, num: 5 }))).toEqual({ v: 2, num: 5 });
    expect(deserializeBSON<{ v: true | number }>(serialize({ v: 2 }))).toEqual({ v: 2 });
    expect(deserializeBSON<{ v: true | number }>(serialize({ v: true }))).toEqual({ v: true });
    expect(deserializeBSON<{ v: true | number }>(serialize({ v: false }))).toEqual({ v: 0 });
});

test('basic union with template literals', () => {
    expect(deserializeBSON<{ v: `a${number}` | number }>(serialize({ v: 'a123' }))).toEqual({ v: 'a123' });
    expect(deserializeBSON<{ v: `a${number}` | number }>(serialize({ v: 123 }))).toEqual({ v: 123 });
    expect(deserializeBSON<{ v?: `a${number}` | number }>(serialize({ v: undefined }))).toEqual({ v: undefined });
});

test('basic template literal', () => {
    expect(deserializeBSON<{ v: `a${number}` }>(serialize({ v: 'a123' }))).toEqual({ v: 'a123' });
    expect(deserializeBSON<{ v: `a${number}` }>(serialize({ v: 'a1' }))).toEqual({ v: 'a1' });
    expect(() => deserializeBSON<{ v: `a${number}` }>(serialize({ v: 'a' }))).toThrow('Cannot convert a to `a${number}`');
    expect(() => deserializeBSON<{ v: `a${number}` }>(serialize({ v: 'abc' }))).toThrow('Cannot convert abc to `a${number}`');
    expect(() => deserializeBSON<{ v: `a${number}` }>(serialize({ v: false }))).toThrow('Cannot convert bson type BOOLEAN to `a${number}`');
    expect(() => deserializeBSON<{ v: `a${number}` }>(serialize({ v: 234 }))).toThrow('Cannot convert bson type INT to `a${number}`');
});

test('basic uuid', () => {
    const myUuid = uuid();
    expect(deserializeBSON<{ v: UUID }>(serialize({ v: myUuid }))).toEqual({ v: myUuid });
    expect(() => deserializeBSON<{ v: UUID }>(serialize({ v: 'asd' }))).toThrow('Cannot convert asd to UUID');
    expect(() => deserializeBSON<{ v: UUID }>(serialize({ v: 0 }))).toThrow('Cannot convert 0 to UUID');
    expect(deserializeBSON<{ v: string }>(serialize({ v: 23 }))).toEqual({ v: '23' });
});

test('basic mongoId', () => {
    const myObjectId = '507f1f77bcf86cd799439011';
    const bson = serializeBSON<{ v: MongoId }>({ v: myObjectId });
    expect(deserializeBSON<{ v: string }>(bson)).toEqual({ v: myObjectId });
    expect(deserializeBSON<{ v: MongoId }>(serialize({ v: myObjectId }))).toEqual({ v: myObjectId });
    expect(() => deserializeBSON<{ v: MongoId }>(serialize({ v: 'asd' }))).toThrow('Cannot convert asd to MongoId.');
    expect(() => deserializeBSON<{ v: MongoId }>(serialize({ v: 0 }))).toThrow('Cannot convert 0 to MongoId.');
});

test('basic union with string | uuid', () => {
    const myUuid = uuid();
    expect(deserializeBSON<{ v: string | UUID }>(serialize({ v: 'abc' }))).toEqual({ v: 'abc' });
    expect(deserializeBSON<{ v: string | UUID }>(serialize({ v: myUuid }))).toEqual({ v: myUuid });
    expect(deserializeBSON<{ v: string }>(serialize({ v: 23 }))).toEqual({ v: '23' });
    expect(deserializeBSON<{ v: string | UUID }>(serialize({ v: 23 }))).toEqual({ v: '23' });
});

test('basic union with number | uuid', () => {
    const myUuid = uuid();
    expect(deserializeBSON<{ v: number | UUID }>(serialize({ v: myUuid }))).toEqual({ v: myUuid });
    expect(deserializeBSON<{ v: number | UUID }>(serialize({ v: 23 }))).toEqual({ v: 23 });
    expect(() => deserializeBSON<{ v: number | UUID }>(serialize({ v: 'asdad' }))).toThrow('Cannot convert bson type STRING to number');
});

test('basic union with null | uuid', () => {
    const myUuid = uuid();
    expect(deserializeBSON<{ v: null | UUID }>(serialize({ v: myUuid }))).toEqual({ v: myUuid });
    expect(deserializeBSON<{ v: null | UUID }>(serialize({ v: null }))).toEqual({ v: null });
    expect(() => deserializeBSON<{ v: null | UUID }>(serialize({ v: 'asdad' }))).toThrow('v(type): Expected null | UUID');
});

test('basic union with uuid', () => {
    const myUuid = uuid();
    expect(deserializeBSON<{ v: number | UUID }>(serialize({ v: 23 }))).toEqual({ v: 23 });
    expect(deserializeBSON<{ v: number | UUID }>(serialize({ v: myUuid }))).toEqual({ v: myUuid });
    expect(() => deserializeBSON<{ v: UUID | undefined }>(serialize({ v: 'asdad' }))).toThrow('Cannot convert asdad to UUID');
    expect(() => deserializeBSON<{ v: number | UUID }>(serialize({ v: 'asdad' }))).toThrow('Cannot convert bson type STRING to number');
});

test('basic union with Date', () => {
    const value = new Date;
    expect(deserializeBSON<{ v: number | Date }>(serialize({ v: 23 }))).toEqual({ v: 23 });
    expect(deserializeBSON<{ v: number | Date }>(serialize({ v: value }))).toEqual({ v: value });
    expect(deserializeBSON<{ v: number | Date }>(serialize({ v: true }))).toEqual({ v: 1 });
    expect(() => deserializeBSON<{ v: number | Date }>(serialize({}))).toThrow('Cannot convert undefined value to number | Date');
});

test('basic regexp', () => {
    const myRegexp = /abc/gmi;
    expect(deserializeBSON<{ v: RegExp }>(serialize({ v: myRegexp }))).toEqual({ v: myRegexp });
    expect(() => deserializeBSON<{ v: RegExp }>(serialize({ v: 'abc' }))).toThrow('Cannot convert bson type STRING to RegExp');
    expect(() => deserializeBSON<{ v: RegExp }>(serialize({ v: 23 }))).toThrow('Cannot convert bson type INT to RegExp');
    expect(() => deserializeBSON<{ v: RegExp }>(serialize({}))).toThrow('Cannot convert undefined value to RegExp');
});

test('basic union with regexp', () => {
    const myRegexp = /abc/gmi;
    expect(deserializeBSON<{ v: number | RegExp }>(serialize({ v: myRegexp }))).toEqual({ v: myRegexp });
    expect(deserializeBSON<{ v: number | RegExp }>(serialize({ v: 23 }))).toEqual({ v: 23 });
    expect(() => deserializeBSON<{ v: number | RegExp }>(serialize({ v: {} }))).toThrow('v(type): Expected number | RegExp');
    expect(() => deserializeBSON<{ v: number | RegExp }>(serialize({}))).toThrow('Cannot convert undefined value to number | RegExp');
});

test('basic array', () => {
    const value = ['a', 'b', 'c'];
    expect(deserializeBSON<{ v: string[] }>(serialize({ v: value }))).toEqual({ v: value });
    expect(deserializeBSON<{ v: string[] }>(serialize({ v: [1, 'b'] }))).toEqual({ v: ['1', 'b'] });
    expect(() => deserializeBSON<{ v: string[] }>(serialize({ v: 123 }))).toThrow('Cannot convert bson type INT to Array<string>');
    expect(() => deserializeBSON<{ v: string[] }>(serialize({ v: [{}] }))).toThrow('Cannot convert bson type OBJECT to string');
});

test('basic array union', () => {
    const value = ['a', 'b', false, 'c', true];
    expect(deserializeBSON<{ v: (string | boolean)[] }>(serialize({ v: value }))).toEqual({ v: value });
    expect(() => deserializeBSON<{
        v: (string | boolean)[]
    }>(serialize({ v: 123 }))).toThrow('Cannot convert bson type INT to Array<string | boolean>');
    expect(() => deserializeBSON<{
        v: (string | boolean)[]
    }>(serialize({ v: ['a', {}] }))).toThrow('v.1(type): Expected string | boolean');
});

test('basic two array union', () => {
    const value = ['a', 'b', false, 'c', true];
    type MyType = number[] | (string | boolean)[];
    expect(deserializeBSON<{ v: MyType }>(serialize({ v: value }))).toEqual({ v: value });
    expect(deserializeBSON<{ v: MyType }>(serialize({ v: [1, 2] }))).toEqual({ v: [1, 2] });
    expect(() => deserializeBSON<{ v: MyType }>(serialize({ v: 123 }))).toThrow('v(type): Expected Array<number> | Array<string | boolean>');
    //the closest member reports the wrong element
    expect(() => deserializeBSON<{ v: MyType }>(serialize({ v: ['a', {}] }))).toThrow('v.1(type): Expected string | boolean');
});

test('basic loosely array union', () => {
    const value = ['a', 'b', false, 'c', true];
    type MyType = (string | boolean)[] | number;
    expect(deserializeBSON<{ v: MyType }>(serialize({ v: value }))).toEqual({ v: value });

    expect(deserializeBSON<{ v: MyType }>(serialize({ v: [1, 2] }))).toEqual({ v: ['1', '2'] });

    expect(deserializeBSON<{ v: MyType }>(serialize({ v: 123 }))).toEqual({ v: 123 });
    //the closest member reports the wrong element
    expect(() => deserializeBSON<{ v: MyType }>(serialize({ v: ['a', {}] }))).toThrow('v.1(type): Expected string | boolean');
});

test('basic class array union', () => {
    class A {
        type!: 'a';
        b?: number;
    }

    class B {
        type!: 'b';
    }

    class C {
        c!: string;
    }

    type MyType = (A)[] | (B)[] | (C)[];
    {
        const items = deserializeBSON<{ v: MyType }>(serialize({ v: [{ type: 'a' }] }));
        expect(items.v[0]).toBeInstanceOf(A);
        expect((items.v[0] as A).type).toBe('a');
    }

    {
        const items = deserializeBSON<{ v: MyType }>(serialize({ v: [{ type: 'b' }] }));
        expect(items.v[0]).toBeInstanceOf(B);
        expect((items.v[0] as B).type).toBe('b');
    }

    {
        const items = deserializeBSON<{ v: MyType }>(serialize({ v: [{ c: 'yes' }] }));
        expect(items.v[0]).toBeInstanceOf(C);
        expect((items.v[0] as C).c).toBe('yes');
    }

    {
        expect(() => deserializeBSON<{ v: MyType }>(serialize({ v: [{ nope: 'no' }] }))).toThrow('v(type): Expected Array<A> | Array<B> | Array<C>');
    }
});

test('constructor parameters', () => {
    class A {
        id: number = 0;

        constructor(public username: string) {
        }
    }

    expect(deserializeBSON<{ v: A }>(serialize({ v: new A('Peter') }))).toEqual({ v: { id: 0, username: 'Peter' } });
});

test('reference', () => {
    class A {
        id: number & PrimaryKey = 0;

        constructor(public username: string) {
        }
    }

    {
        const item = deserializeBSON<{ v: A & Reference }>(serialize({ v: 23 }));
        expect(item).toEqual({ v: { id: 23 } });
        expect(item.v).toBeInstanceOf(A);
        expect(getClassName(item.v)).toBe('AReference');
    }

    {
        const item = deserializeBSON<{ v: A & Reference }>(serialize({ v: { id: 34, username: 'Peter' } }));
        expect(item).toEqual({ v: { id: 34, username: 'Peter' } });
        expect(item.v).toBeInstanceOf(A);
        expect(getClassName(item.v)).toBe('A');
    }
});

test('reference in union', () => {
    class A {
        id: number & PrimaryKey = 0;

        constructor(public username: string) {
        }
    }

    type t = { v: (A & Reference) | string[] };

    {
        const item = deserializeBSON<t>(serialize({ v: 23 }));
        expect(item).toEqual({ v: { id: 23 } });
        expect(item.v).toBeInstanceOf(A);
        expect(getClassName(item.v)).toBe('AReference');
    }

    {
        const item = deserializeBSON<t>(serialize({ v: { id: 34, username: 'Peter' } }));
        expect(item).toEqual({ v: { id: 34, username: 'Peter' } });
        expect(item.v).toBeInstanceOf(A);
        expect(getClassName(item.v)).toBe('A');
    }
});

test('tuple', () => {
    {
        type t = { v: [string, number] };
        expect(deserializeBSON<t>(serialize({ v: ['abc', 34] }))).toEqual({ v: ['abc', 34] });
        expect(deserializeBSON<t>(serialize({ v: ['abc', 34, 55] }))).toEqual({ v: ['abc', 34] });
        expect(deserializeBSON<t>(serialize({ v: ['abc', '44'] }))).toEqual({ v: ['abc', 44] });
    }
    {
        type t = { v: [number] };
        expect(deserializeBSON<t>(serialize({ v: [34] }))).toEqual({ v: [34] });
        expect(deserializeBSON<t>(serialize({ v: ['44'] }))).toEqual({ v: [44] });
    }
    {
        type t = { v: [...number[]] };
        expect(deserializeBSON<t>(serialize({ v: [34] }))).toEqual({ v: [34] });
        expect(deserializeBSON<t>(serialize({ v: ['44'] }))).toEqual({ v: [44] });
        expect(deserializeBSON<t>(serialize({ v: [34, 55] }))).toEqual({ v: [34, 55] });
        expect(deserializeBSON<t>(serialize({ v: ['44', 55] }))).toEqual({ v: [44, 55] });
    }
    {
        type t = { v: [string, ...number[]] };
        expect(deserializeBSON<t>(serialize({ v: [34] }))).toEqual({ v: ['34'] });
        expect(deserializeBSON<t>(serialize({ v: ['44'] }))).toEqual({ v: ['44'] });
        expect(deserializeBSON<t>(serialize({ v: [34, 55] }))).toEqual({ v: ['34', 55] });
        expect(deserializeBSON<t>(serialize({ v: ['44', 55, 66] }))).toEqual({ v: ['44', 55, 66] });
    }
    {
        type t = { v: [...number[], string] };
        expect(deserializeBSON<t>(serialize({ v: [34] }))).toEqual({ v: ['34'] });
        expect(deserializeBSON<t>(serialize({ v: ['44'] }))).toEqual({ v: ['44'] });
        expect(deserializeBSON<t>(serialize({ v: [34, '55'] }))).toEqual({ v: [34, '55'] });
        expect(deserializeBSON<t>(serialize({ v: ['44', 55, '66'] }))).toEqual({ v: [44, 55, '66'] });
    }
    {
        type t = { v: [...number[], string, boolean] };
        expect(deserializeBSON<t>(serialize({ v: [true] }))).toEqual({ v: [true] });
        expect(deserializeBSON<t>(serialize({ v: [34, true] }))).toEqual({ v: ['34', true] });
        expect(deserializeBSON<t>(serialize({ v: ['44', 55, '66', true] }))).toEqual({ v: [44, 55, '66', true] });
    }
    {
        type t = { v: [string, ...number[], boolean] };
        expect(deserializeBSON<t>(serialize({ v: ['abc', true] }))).toEqual({ v: ['abc', true] });
        expect(deserializeBSON<t>(serialize({ v: ['abc', 12, true] }))).toEqual({ v: ['abc', 12, true] });
        expect(deserializeBSON<t>(serialize({ v: ['abc', 12, 23, true] }))).toEqual({ v: ['abc', 12, 23, true] });
    }
});

test('tuple on union', () => {
    interface C {
        d: true;
    }

    {
        type t = { v: [string, number] | [C] };
        expect(deserializeBSON<t>(serialize({ v: ['abc', 34] }))).toEqual({ v: ['abc', 34] });
        expect(deserializeBSON<t>(serialize({ v: [{ d: true }] }))).toEqual({ v: [{ d: true }] });
        expect(deserializeBSON<t>(serialize({ v: ['abc', 34, 55] }))).toEqual({ v: ['abc', 34] });
        expect(() => deserializeBSON<t>(serialize({ v: ['abc', '44'] }))).toThrow('v(type): Expected [string, number] | [C]'); //union type guard are strict
    }
    {
        type t = { v: [number] | [C] };
        expect(deserializeBSON<t>(serialize({ v: [34] }))).toEqual({ v: [34] });
        expect(() => deserializeBSON<t>(serialize({ v: ['44'] }))).toThrow('v(type): Expected [number] | [C]'); //union type guard are strict
    }
    {
        type t = { v: [...number[]] | [C] };
        expect(deserializeBSON<t>(serialize({ v: [34] }))).toEqual({ v: [34] });
        expect(() => deserializeBSON<t>(serialize({ v: ['44'] }))).toThrow('v(type): Expected [...number[]] | [C]');
        expect(deserializeBSON<t>(serialize({ v: [34, 55] }))).toEqual({ v: [34, 55] });
        expect(() => deserializeBSON<t>(serialize({ v: ['44', 55] }))).toThrow('v(type): Expected [...number[]] | [C]');
    }
    {
        type t = { v: [string, ...number[]] | [C] };
        expect(deserializeBSON<t>(serialize({ v: ['44'] }))).toEqual({ v: ['44'] });
        expect(() => deserializeBSON<t>(serialize({ v: [34] }))).toThrow();
        expect(() => deserializeBSON<t>(serialize({ v: [34, 55] }))).toThrow();
        expect(deserializeBSON<t>(serialize({ v: ['44', 55, 66] }))).toEqual({ v: ['44', 55, 66] });
    }
    {
        type t = { v: [...number[], string] | [C] };
        expect(deserializeBSON<t>(serialize({ v: ['44'] }))).toEqual({ v: ['44'] });
        expect(() => deserializeBSON<t>(serialize({ v: [34] }))).toThrow();
        expect(deserializeBSON<t>(serialize({ v: [34, '55'] }))).toEqual({ v: [34, '55'] });
        expect(() => deserializeBSON<t>(serialize({ v: ['44', 55, '66'] }))).toThrow();
    }
    {
        type t = { v: [...number[], string, boolean] | [C] };
        expect(deserializeBSON<t>(serialize({ v: [true] }))).toEqual({ v: [true] });
        expect(() => deserializeBSON<t>(serialize({ v: [34, true] }))).toThrow();
        expect(deserializeBSON<t>(serialize({ v: [44, 55, '66', true] }))).toEqual({ v: [44, 55, '66', true] });
    }
    {
        type t = { v: [string, ...number[], boolean] | [C] };
        expect(deserializeBSON<t>(serialize({ v: ['abc', true] }))).toEqual({ v: ['abc', true] });
        expect(deserializeBSON<t>(serialize({ v: ['abc', 12, true] }))).toEqual({ v: ['abc', 12, true] });
        expect(deserializeBSON<t>(serialize({ v: ['abc', 12, 23, true] }))).toEqual({ v: ['abc', 12, 23, true] });
    }
});

test('set', () => {
    {
        type t = { v: Set<string> };
        expect(deserializeBSON<t>(serialize({ v: ['abc', 34] }))).toEqual({ v: new Set(['abc', '34']) });
    }
});

test('set in union', () => {
    interface C {
        d: true;
    }

    {
        type t = { v: Set<string> | [C] };
        expect(deserializeBSON<t>(serialize({ v: ['abc', '34'] }))).toEqual({ v: new Set(['abc', '34']) });
        expect(deserializeBSON<t>(serialize({ v: [{ d: true }] }))).toEqual({ v: [{ d: true }] });
    }
});

test('map', () => {
    {
        type t = { v: Map<string, number> };
        expect(deserializeBSON<t>(serialize({ v: [['a', 23], ['b', 34]] }))).toEqual({ v: new Map<any, any>([['a', 23], ['b', 34]]) });
    }
});

test('map union', () => {
    interface C {
        d: true;
    }

    {
        type t = { v: Map<string, number> | [C] };
        expect(deserializeBSON<t>(serialize({ v: [['a', 23], ['b', 34]] }))).toEqual({ v: new Map<any, any>([['a', 23], ['b', 34]]) });
        expect(deserializeBSON<t>(serialize({ v: [{ d: true }] }))).toEqual({ v: [{ d: true }] });
    }
});

test('index signature', () => {
    interface A {
        [name: string]: number;
    }

    expect(deserializeBSON<A>(serialize({ a: 1 }))).toEqual({ a: 1 });
    expect(deserializeBSON<A>(serialize({ a: 1, b: 2 }))).toEqual({ a: 1, b: 2 });
});

test('index signature in union', () => {
    interface A {
        [name: string]: number;
    }

    type t = A | { another: true };

    expect(deserializeBSON<t>(serialize({ a: 1 }))).toEqual({ a: 1 });
    expect(deserializeBSON<t>(serialize({ another: true }))).toEqual({ another: true });
    expect(deserializeBSON<t>(serialize({ a: 1, b: 2 }))).toEqual({ a: 1, b: 2 });
});

test('index signature template literal', () => {
    interface A {
        [name: `a${number}`]: number;
    }

    expect(deserializeBSON<A>(serialize({ a23: 1 }))).toEqual({ a23: 1 });
    expect(deserializeBSON<A>(serialize({ add: 1 }))).toEqual({});
    expect(deserializeBSON<A>(serialize({ a23: 1, a3: 3 }))).toEqual({ a23: 1, a3: 3 });
});

test('index signature multiple', () => {
    interface A {
        [name: number]: boolean;

        [name2: `a${number}`]: number;
    }

    expect(deserializeBSON<A>(serialize({ a23: 1 }))).toEqual({ a23: 1 });
    expect(deserializeBSON<A>(serialize({ 12: true }))).toEqual({ 12: true });
    expect(deserializeBSON<A>(serialize({ a23: 2, 12: true }))).toEqual({ a23: 2, 12: true });
});

test('index signature + object literal', () => {
    interface A {
        [name: number]: boolean;

        [name2: `a${number}`]: number;
    }

    type t = A & { [P in 'abc']: string };

    expect(deserializeBSON<t>(serialize({ abc: 'yes' }))).toEqual({ abc: 'yes' });
    expect(() => deserializeBSON<t>(serialize({ a23: 1 }))).toThrow('Cannot convert undefined value to string');
    expect(deserializeBSON<t>(serialize({ abc: 'yes', 12: true }))).toEqual({ abc: 'yes', 12: true });
    expect(deserializeBSON<t>(serialize({ abc: 'yes', 12: true, a23: 23 }))).toEqual({ abc: 'yes', 12: true, a23: 23 });
});


test('any', () => {
    const data = {
        lastErrorObject: { n: 1, updatedExisting: true },
        value: {
            _id: '61df83e58a5e3ba77f8f1c0f',
            id: 'bdcfb3a0-034a-4f07-8aff-b78e2822a5a8',
        },
        ok: 1,
        '$clusterTime': {
            clusterTime: 7052500565351202817n,
            signature: {
                hash: Buffer.alloc(16),
                keyId: 0n,
            },
        },
        operationTime: 7052500565351202817n,
    };

    const type: TypeObjectLiteral = copyAndSetParent({
        kind: ReflectionKind.objectLiteral,
        types: [
            { kind: ReflectionKind.propertySignature, name: 'value', type: { kind: ReflectionKind.any } },
        ],
    });

    const bson = serializeBSONWithoutOptimiser(data);
    const deserializer = getBSONDeserializer(undefined, type);
    const back: any = deserializer(bson);
    expect(back.value).toEqual(data.value);
});

test('circular', () => {
    class Model {
        id: number = 0;
        child?: Model;
    }

    const bson = serializeBSONWithoutOptimiser({ items: [{ id: 0, child: { id: 2 } }] } as Response);

    interface Response {
        items: Model[];
    }

    const fn = getBSONDeserializer<Response>();
    const back = fn(bson);
    expect(back).toEqual({ items: [{ id: 0, child: { id: 2 } }] });
});


test('additional are ignored', () => {
    const data = {
        setVersion: 1,
        ismaster: true,
    };
    const bson = serializeBSONWithoutOptimiser(data);

    interface IsMasterResponse {
        ismaster: boolean;
    }

    const fn = getBSONDeserializer<IsMasterResponse>();
    const back = fn(bson);
    expect(back).toEqual({ ismaster: true });
});

test('invalid buffer, string parse', () => {
    const buffer = Buffer.from([
        28, 0, 0, 0, //size
        BSONType.BINARY, //just some type
        112, 111, 115, 105, 116, 105, 111, 110, // 0, /'/position\n' without ending
        // to simulate a buffer that is not correctly serialized
    ]);

    expect(() => deserializeBSONWithoutOptimiser(buffer)).toThrow('Unexpected end of buffer');

    const deserialize = getBSONDeserializer<{ position: Uint8Array }>();
    expect(() => deserialize(buffer)).toThrow('Cannot convert undefined value to Uint8Array');

    const deserialize2 = getBSONDeserializer<{ [name: string]: Uint8Array }>();
    expect(() => deserialize2(buffer)).toThrow('Serialization failed. Unexpected end of buffer');
});

test('complex union', () => {
    type T = {
        [controllerName: string]: [actionName: string, action: number, mode: string, parameters: SerializedTypes, type: SerializedTypes][]
    }

    const serialize = getBSONSerializer<T>();
    const deserialize = getBSONDeserializer<T>();

    const buffer = serialize({
        bla: [['actionName', 1, 'arbitrary',
            [{ 'kind': 26, 'types': [{ 'kind': 27, 'name': 'value', 'type': 1 }] }, { 'kind': 5 }],
            [{
                kind: ReflectionKind.bigint,
            }]]],
    });

    const back = deserialize(buffer);
    expect(back).toEqual({
        bla: [['actionName', 1, 'arbitrary',
            [{
                kind: ReflectionKind.tuple,
                types: [{ kind: ReflectionKind.tupleMember, name: 'value', type: 1 }],
            }, { kind: ReflectionKind.string }],
            [{ kind: ReflectionKind.bigint }]]],
    });
});

test('serialize types', () => {
    const serialize = getBSONSerializer<SerializedTypes>();
    const deserialize = getBSONDeserializer<SerializedTypes>();

    {
        const bson = serialize([{ kind: ReflectionKind.string }]);
        const back = deserialize(bson);
        expect(back).toEqual([{ kind: ReflectionKind.string }]);
    }
    {
        const bson = serialize([
            {
                kind: ReflectionKind.objectLiteral,
                types: [1, 2],
            },
            { kind: ReflectionKind.propertySignature, name: 'a', type: 3 },
            { kind: ReflectionKind.propertySignature, name: 'b', type: 4 },
            { kind: ReflectionKind.string },
            { kind: ReflectionKind.number },
        ]);
        const back = deserialize(bson);
        expect(back).toEqual([
            {
                kind: ReflectionKind.objectLiteral,
                types: [1, 2],
            },
            { kind: ReflectionKind.propertySignature, name: 'a', type: 3 },
            { kind: ReflectionKind.propertySignature, name: 'b', type: 4 },
            { kind: ReflectionKind.string },
            { kind: ReflectionKind.number },
        ]);
    }
});

test('Encoder', () => {
    {
        type T = string;
        const encoder = getBsonEncoder(typeOf<T>());
        expect(encoder.decode(encoder.encode('abc'))).toEqual('abc');
    }
    {
        type T = number;
        const encoder = getBsonEncoder(typeOf<T>());
        expect(encoder.decode(encoder.encode(123))).toEqual(123);
    }
    {
        type T = [number, string];
        const encoder = getBsonEncoder(typeOf<T>());
        expect(encoder.decode(encoder.encode([123, 'abc']))).toEqual([123, 'abc']);
    }
    {
        type T = { a: number, b: string };
        const encoder = getBsonEncoder(typeOf<T>());
        expect(encoder.decode(encoder.encode({ a: 123, b: 'abc' }))).toEqual({ a: 123, b: 'abc' });
    }
    {
        type T = string | number;
        const encoder = getBsonEncoder(typeOf<T>());
        expect(encoder.decode(encoder.encode('abc'))).toEqual('abc');
        expect(encoder.decode(encoder.encode(123))).toEqual(123);
    }
    {
        type T = string & MinLength<3>;
        const encoder = getBsonEncoder(typeOf<T>());
        expect(() => encoder.encode('ab')).toThrow('Min length is 3');
        const bson = serializeBSONWithoutOptimiser({ v: 'b' });
        expect(() => encoder.decode(bson)).toThrow('Min length is 3');
    }
    {
        type T = { v: string & MinLength<3> };
        const encoder = getBsonEncoder(typeOf<T>());
        expect(() => encoder.encode({ v: 'ab' })).toThrow('Min length is 3');
        const bson = serializeBSONWithoutOptimiser({ v: 'b' });
        expect(() => encoder.decode(bson)).toThrow('Min length is 3');
    }
});

test('createParserLookup from invalid object', () => {
    const bson = serializeBSONWithoutOptimiser({ v: { a: 1 } });
    expect(deserializeBSON<{ v: number }>(bson).v).toEqual(0);
    expect(deserializeBSON<{ v: bigint }>(bson).v).toEqual(BigInt(0));
    expect(deserializeBSON<{ v: boolean }>(bson).v).toEqual(false);
});

test('union almost same member', () => {
    type T = { a: number } | { a: number; b: string; };
    const serialize = getBSONSerializer<T>();
    const deserialize = getBSONDeserializer<T>();
    const data1: T = { a: 1 };
    expect(deserialize(serialize(data1))).toEqual(data1);
    const data2: T = { a: 1, b: '2' };
    const bson2 = serialize(data2);
    expect(deserializeBSONWithoutOptimiser(bson2)).toEqual(data2);
    const back2 = deserialize(bson2);
    expect(back2).toEqual(data2);
});

test('union same member, optional', () => {
    type T = { a: number, b?: number } | { a: number; b: string; };
    const serialize = getBSONSerializer<T>();
    const deserialize = getBSONDeserializer<T>();
    const data1: T = { a: 1 };
    expect(deserialize(serialize(data1))).toEqual(data1);
    const data2: T = { a: 1, b: 3 };
    const bson2 = serialize(data2);
    expect(deserializeBSONWithoutOptimiser(bson2)).toEqual(data2);
    const back2 = deserialize(bson2);
    expect(back2).toEqual(data2);
    const data3: T = { a: 1, b: '2' };
    const bson3 = serialize(data3);
    expect(deserializeBSONWithoutOptimiser(bson3)).toEqual(data3);
    const back3 = deserialize(bson3);
    expect(back3).toEqual(data3);
});

test('union mismatch reports errors of the closest member (#676)', () => {
    interface ChatMessage {
        id: string;
    }

    type MessageEvent = { channel: string, type: 'message', message: ChatMessage };
    type MessageUpdateEvent = { channel: string, type: 'message-update', message: ChatMessage };
    type BusMessage = { v: MessageEvent | MessageUpdateEvent };
    const deserialize = getBSONDeserializer<BusMessage>();

    expect(() => deserialize(serialize({ v: { channel: '1', type: 'message', message: undefined } }))).toThrow('v.message(type): Not an object');
    //unknown discriminator
    expect(() => deserialize(serialize({ v: { channel: '1', type: 'unknown', message: { id: '1' } } })))
        .toThrow(`v.type(type): Expected 'message' | 'message-update'`);
});

test('union errors are the same as in validate()', () => {
    interface Circle { kind: 'circle'; radius: number }
    interface Square { kind: 'square'; size: number }
    type Shape = { v: Circle | Square };

    expect(() => deserializeBSON<Shape>(serialize({ v: { kind: 'circle', radius: 'x' } }))).toThrow('v.radius(type): Not a number');
    expect(() => deserializeBSON<Shape>(serialize({ v: { kind: 'triangle' } }))).toThrow(`v.kind(type): Expected 'circle' | 'square', got string`);
    expect(() => deserializeBSON<Shape>(serialize({ v: 'circle' }))).toThrow('v(type): Expected Circle | Square, got string');
    expect(() => deserializeBSON<Shape>(serialize({ v: [1] }))).toThrow('v(type): Expected Circle | Square, got array');
    expect(() => deserializeBSON<{ v: 'a' | 'b' }>(serialize({ v: 3 }))).toThrow(`v(type): Expected 'a' | 'b', got number`);
    expect(() => deserializeBSON<{ v: string[] | number }>(serialize({ v: ['a', 2] }))).toThrow('v.1(type): Not a string');
});
