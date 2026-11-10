import { expect, test } from '@jest/globals';

import { deserializeBSON } from '../src/bson-deserializer.js';
import { serializeBSON } from '../src/bson-serializer.js';

//#718: see packages/type/tests/tuple.spec.ts, the same rules apply to BSON deserialization.

const bson = (v: any) => serializeBSON<{ v: any }>({ v });

test('union of tuples picks the tuple with the matching length', () => {
    type A = { v: [number] | [number, number] };
    expect(deserializeBSON<A>(bson([1]))).toEqual({ v: [1] });
    expect(deserializeBSON<A>(bson([1, 2]))).toEqual({ v: [1, 2] });

    type B = { v: [number, number] | [number] };
    expect(deserializeBSON<B>(bson([1]))).toEqual({ v: [1] });
    expect(deserializeBSON<B>(bson([1, 2]))).toEqual({ v: [1, 2] });
});

test('union of tuples falls back to a tuple with a different length', () => {
    type A = { v: [number] | [number, number] };
    expect(deserializeBSON<A>(bson([1, 2, 3]))).toEqual({ v: [1] });

    interface C {
        d: true;
    }

    type B = { v: [string, number] | C | string };
    expect(deserializeBSON<B>(bson(['a', 1, 2]))).toEqual({ v: ['a', 1] });
    expect(deserializeBSON<B>(bson('x'))).toEqual({ v: 'x' });
});

test('union of tuples and arrays', () => {
    type A = { v: [string] | string[] | string };
    expect(deserializeBSON<A>(bson(['a', 'b']))).toEqual({ v: ['a', 'b'] });

    type B = { v: [number, number] | number[] };
    expect(deserializeBSON<B>(bson([1, 2, 3]))).toEqual({ v: [1, 2, 3] });
    expect(deserializeBSON<B>(bson([1]))).toEqual({ v: [1] });

    type C = { v: [string, string] | string[] };
    expect(deserializeBSON<C>(bson(['a']))).toEqual({ v: ['a'] });
});

test('union of tuples with optional and rest elements', () => {
    type A = { v: [number, string?] | [number, string, number] };
    expect(deserializeBSON<A>(bson([1]))).toEqual({ v: [1] });
    expect(deserializeBSON<A>(bson([1, 'a', 2]))).toEqual({ v: [1, 'a', 2] });

    type B = { v: [string] | [string, ...number[]] };
    expect(deserializeBSON<B>(bson(['a', 1, 2]))).toEqual({ v: ['a', 1, 2] });
});

test('union of objects with tuples', () => {
    type A = { v: { a: [number] } | { a: [number, number] } };
    expect(deserializeBSON<A>(bson({ a: [1] }))).toEqual({ v: { a: [1] } });
    expect(deserializeBSON<A>(bson({ a: [1, 2] }))).toEqual({ v: { a: [1, 2] } });

    type B = { v: { a: [number, number] } | { a: [number] } };
    expect(deserializeBSON<B>(bson({ a: [1] }))).toEqual({ v: { a: [1] } });

    //fallback
    type C = { v: { a: [number] } | { a: string } };
    expect(deserializeBSON<C>(bson({ a: [1, 2] }))).toEqual({ v: { a: [1] } });
    expect(deserializeBSON<C>(bson({ a: 'x' }))).toEqual({ v: { a: 'x' } });
});

test('unions in members of unions', () => {
    type A = { v: { a: [number] | [number, number] } | { b: string } };
    expect(deserializeBSON<A>(bson({ a: [1, 2] }))).toEqual({ v: { a: [1, 2] } });
    expect(deserializeBSON<A>(bson({ a: [1, 2, 3] }))).toEqual({ v: { a: [1] } });

    type N1 = { v: [[number] | [number, number]] | string };
    expect(deserializeBSON<N1>(bson([[1, 2]]))).toEqual({ v: [[1, 2]] });

    type N2 = { v: Array<[number] | [number, number]> };
    expect(deserializeBSON<N2>(bson([[1], [1, 2], [1, 2, 3]]))).toEqual({ v: [[1], [1, 2], [1]] });
});

test('tuple with optional elements', () => {
    type A = { v: [number, string?] };
    expect(deserializeBSON<A>(bson([1])).v).toHaveLength(1);
    expect(deserializeBSON<A>(bson([1, 'a'])).v).toEqual([1, 'a']);
    //BSON stores undefined in arrays as null
    expect(deserializeBSON<A>(bson([1, null])).v).toHaveLength(2);
    expect(deserializeBSON<A>(bson([1, null])).v[1]).toBe(undefined);

    type B = { v: [number, string?, number?] };
    expect(deserializeBSON<B>(bson([1])).v).toHaveLength(1);
    expect(deserializeBSON<B>(bson([1, 'a', 2])).v).toEqual([1, 'a', 2]);

    //a required element that accepts undefined is always set
    type C = { v: [number, string | undefined] };
    expect(deserializeBSON<C>(bson([1])).v).toHaveLength(2);
    expect(deserializeBSON<C>(bson([1])).v).toEqual([1, undefined]);
    expect(deserializeBSON<C>(bson([1, null])).v).toEqual([1, undefined]);
    expect(deserializeBSON<C>(bson([1, 'a'])).v).toEqual([1, 'a']);
});

test('undefined optional element keeps the position of the following elements (#722)', () => {
    //like the arguments of an RPC action: updateUser(1, undefined, 'peter@example.com')
    type A = { args: [id: number, name?: string, email?: string] };
    const roundTrip = (args: A['args']) => deserializeBSON<A>(serializeBSON<A>({ args })).args;

    expect(roundTrip([1, undefined, 'peter@example.com'])).toStrictEqual([1, undefined, 'peter@example.com']);
    expect(roundTrip([1, 'Peter', 'peter@example.com'])).toStrictEqual([1, 'Peter', 'peter@example.com']);
    expect(roundTrip([1, undefined, undefined])).toStrictEqual([1, undefined, undefined]);
    expect(roundTrip([1, undefined])).toStrictEqual([1, undefined]);
    //a missing optional element at the end stays missing
    expect(roundTrip([1])).toStrictEqual([1]);
    expect(roundTrip([1, 'Peter'])).toStrictEqual([1, 'Peter']);

    //in unions the tuple with the undefined optional element is still picked
    type U = { args: [id: number, name?: string, email?: string] | string };
    expect(deserializeBSON<U>(serializeBSON<A>({ args: [1, undefined, 'e'] })).args).toStrictEqual([1, undefined, 'e']);

    //a required element that accepts undefined was already written as null
    type R = { args: [id: number, name: string | undefined, email?: string] };
    expect(deserializeBSON<R>(serializeBSON<R>({ args: [1, undefined, 'e'] })).args).toStrictEqual([1, undefined, 'e']);
});

test('nullable optional element keeps null (#722)', () => {
    type N = { args: [id: number, name?: string | null] };
    expect(deserializeBSON<N>(serializeBSON<N>({ args: [1, null] })).args).toStrictEqual([1, null]);
});
