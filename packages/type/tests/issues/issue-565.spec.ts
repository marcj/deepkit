import { expect, test } from '@jest/globals';

import { ReceiveType, typeOf } from '../../src/reflection/reflection.js';
import { ReflectionKind } from '../../src/reflection/type.js';
import { cast, deserialize, serialize } from '../../src/serializer-facade.js';
import { assert as assertType, is } from '../../src/typeguard.js';
import { NoTypeReceived, UnresolvedTypeParameter } from '../../src/utils.js';
import { validate } from '../../src/validator.js';

//https://github.com/marcj/deepkit/issues/565
interface User {
    id: number;
    name: string;
}

const rows = [{ id: 1 }];

test('validate of an unresolved array element throws instead of passing', () => {
    const fn = <T>() => validate<T[]>(rows);
    expect(() => fn<User>()).toThrow(UnresolvedTypeParameter);
    expect(() => fn<User>()).toThrow('ReceiveType<T>');
});

test('the name of the type parameter is in the message', () => {
    const fn = <Row>() => validate<Row>(rows);
    expect(() => fn<User>()).toThrow('ReceiveType<Row>');
});

test('can be caught as NoTypeReceived', () => {
    const fn = <T>() => validate<T>(rows);
    expect(() => fn<User>()).toThrow(NoTypeReceived);
});

test.each([
    ['is', <T>() => is<T>(rows)],
    ['assert', <T>() => assertType<T>(rows)],
    ['cast', <T>() => cast<T>(rows)],
    ['deserialize', <T>() => deserialize<T>(rows)],
    ['serialize', <T>() => serialize<T>(rows as any)],
    ['nested in an object', <T>() => validate<{ a: T }>({ a: 1 })],
    ['nested in an array of objects', <T>() => validate<{ a: T }[]>([{ a: 1 }])],
])('%s throws', (name, fn) => {
    expect(() => (fn as any)()).toThrow(UnresolvedTypeParameter);
});

test('a generic class without ReceiveType throws', () => {
    class Repository<T> {
        check() {
            return validate<T>(rows);
        }
    }
    expect(() => new Repository<User>().check()).toThrow(UnresolvedTypeParameter);
});

test('control: with ReceiveType the generic is validated', () => {
    function query<T>(type?: ReceiveType<T>) {
        return validate<T[]>(rows);
    }
    expect(query<User>().length).toBeGreaterThan(0);
    expect(query<{ id: number }>()).toEqual([]);
});

test('control: the type is inferred from an argument', () => {
    function check<T>(value: T, row: unknown) {
        return validate<T>(row);
    }
    expect(check('a', 'a')).toEqual([]);
    expect(check('a', 1).length).toBeGreaterThan(0);
});

test('control: the constraint is used', () => {
    const fn = <T extends string>() => validate<T>(1);
    expect(fn().length).toBeGreaterThan(0);
});

test('control: a real never does not throw', () => {
    expect(validate<never>(1).length).toBeGreaterThanOrEqual(0);
});

test('control: an arrow function without a block receives its type', () => {
    const query = <T>(row: unknown, type?: ReceiveType<T>) => validate<T>(row);
    expect(query<string>('a')).toEqual([]);
    expect(query<string>(1).length).toBeGreaterThan(0);
});

test('control: an arrow function without a block infers from an argument', () => {
    const check = <T>(value: T, row: unknown) => validate<T>(row);
    expect(check('a', 'a')).toEqual([]);
    expect(check('a', 1).length).toBeGreaterThan(0);
});

test('control: reflection alone still gives never', () => {
    const fn = <T>() => typeOf<T>();
    expect(fn<User>().kind).toBe(ReflectionKind.never);
});
