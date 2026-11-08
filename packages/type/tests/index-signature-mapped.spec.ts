import { expect, test } from '@jest/globals';

import { typeOf } from '../src/reflection/reflection.js';
import { ReflectionKind, stringifyType, Type, TypeIndexSignature } from '../src/reflection/type.js';
import { deserializeType, serializeType } from '../src/type-serialization.js';
import { validate } from '../src/validator.js';

function indexSignature(type: Type): TypeIndexSignature {
    if (type.kind !== ReflectionKind.objectLiteral) throw new TypeError('objectLiteral expected');
    const found = type.types.find(v => v.kind === ReflectionKind.indexSignature);
    if (!found) throw new TypeError(`no index signature in ${stringifyType(type)}`);
    return found as TypeIndexSignature;
}

function allowsUndefined(type: TypeIndexSignature): boolean {
    return type.type.kind === ReflectionKind.undefined || (type.type.kind === ReflectionKind.union && type.type.types.some(v => v.kind === ReflectionKind.undefined));
}

test('keyof includes the index signature', () => {
    const type = typeOf<keyof { [k: string]: number }>();
    expect(type.kind === ReflectionKind.union && type.types.some(v => v.kind === ReflectionKind.string)).toBe(true);
    expect(validate<keyof { [k: string]: number }>('a')).toEqual([]);
});

test('Partial of a Record keeps validating its values', () => {
    expect(validate<Partial<Record<string, number>>>({ a: 1 })).toEqual([]);
    expect(validate<Partial<Record<string, number>>>({ a: 'x' }).length).toBeGreaterThan(0);
});

test('index access with the type of an index signature', () => {
    expect(typeOf<{ [k: string]: number }[string]>().kind).toBe(ReflectionKind.number);
    expect(typeOf<{ [k: string]: boolean }[number]>().kind).toBe(ReflectionKind.boolean);
    expect(typeOf<{ [k: number]: number }[string]>().kind).toBe(ReflectionKind.never);
});

test('Partial of an index signature allows undefined', () => {
    expect(allowsUndefined(indexSignature(typeOf<Partial<Record<string, number>>>()))).toBe(true);
    expect(validate<Partial<Record<string, number>>>({ a: undefined })).toEqual([]);
});

test('Readonly of a Record keeps its values and is readonly', () => {
    const type = indexSignature(typeOf<Readonly<Record<string, number>>>());
    expect(type.readonly).toBe(true);
    expect(validate<Readonly<Record<string, number>>>({ a: 'x' }).length).toBeGreaterThan(0);
});

test('a declared readonly index signature', () => {
    expect(indexSignature(typeOf<{ readonly [k: string]: number }>()).readonly).toBe(true);
});

test('modifiers on a mapped index signature', () => {
    expect(indexSignature(typeOf<{ readonly [K in string]: number }>()).readonly).toBe(true);
    expect(indexSignature(typeOf<{ [K in string]: number }>()).readonly).toBeUndefined();
    expect(allowsUndefined(indexSignature(typeOf<{ [K in string]?: number }>()))).toBe(true);
});

test('a homomorphic mapped type preserves readonly', () => {
    type Keep<T> = { [K in keyof T]: T[K] };
    expect(indexSignature(typeOf<Keep<{ readonly [k: string]: number }>>()).readonly).toBe(true);
});

test('-readonly and -? remove the modifiers', () => {
    type Mutable<T> = { -readonly [K in keyof T]: T[K] };
    expect(indexSignature(typeOf<Mutable<{ readonly [k: string]: number }>>()).readonly).toBeUndefined();
    const required = indexSignature(typeOf<Required<{ [k: string]: number | undefined }>>());
    expect(allowsUndefined(required)).toBe(false);
    expect(required.type.kind).toBe(ReflectionKind.number);
});

test('properties next to an index signature stay', () => {
    type Mixed = Partial<{ a: string; [k: string]: string }>;
    const type = typeOf<Mixed>();
    expect(indexSignature(type).index.kind).toBe(ReflectionKind.string);
    expect(type.kind === ReflectionKind.objectLiteral && type.types.some(v => v.kind === ReflectionKind.propertySignature && v.name === 'a' && v.optional)).toBe(true);
});

test('readonly is part of the printed and serialized type', () => {
    const type = typeOf<{ readonly [k: string]: number }>();
    expect(stringifyType(type)).toContain('readonly [index: string]');
    expect(indexSignature(deserializeType(serializeType(type))).readonly).toBe(true);
});
