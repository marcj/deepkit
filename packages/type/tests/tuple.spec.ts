import { expect, test } from '@jest/globals';

import { cast, deserialize, serialize } from '../src/serializer-facade.js';
import { is } from '../src/typeguard.js';
import { validate } from '../src/validator.js';

//#718: a tuple only matches an array with the same number of elements. In unions, exact matches win.
//When no member matches exactly, deserialization falls back to members with a tuple of a different length,
//like deserialization of a plain tuple drops additional elements.

test('union of tuples picks the tuple with the matching length', () => {
    type A = { v: [number] | [number, number] };
    expect(cast<A>({ v: [1] })).toEqual({ v: [1] });
    expect(cast<A>({ v: [1, 2] })).toEqual({ v: [1, 2] });
    expect(deserialize<A>({ v: [1, 2] })).toEqual({ v: [1, 2] });
    expect(serialize<A>({ v: [1, 2] })).toEqual({ v: [1, 2] });

    type B = { v: [number, number] | [number] };
    expect(cast<B>({ v: [1] })).toEqual({ v: [1] });
    expect(cast<B>({ v: [1, 2] })).toEqual({ v: [1, 2] });
});

test('union of tuples falls back to a tuple with a different length', () => {
    type A = { v: [number] | [number, number] };
    expect(cast<A>({ v: [1, 2, 3] })).toEqual({ v: [1] });
    expect(validate<A>({ v: [1, 2, 3] })).toHaveLength(1);
    expect(is<A>({ v: [1, 2, 3] })).toBe(false);

    interface C {
        d: true;
    }

    type B = { v: [string, number] | C | string };
    expect(cast<B>({ v: ['a', 1, 2] })).toEqual({ v: ['a', 1] });
    expect(cast<B>({ v: 'x' })).toEqual({ v: 'x' });
    expect(cast<B>({ v: { d: true } })).toEqual({ v: { d: true } });

    //loose element conversion still works in both passes
    type L = { v: [number, number] | boolean };
    expect(deserialize<L>({ v: ['1', '2'] })).toEqual({ v: [1, 2] });
    expect(deserialize<L>({ v: ['1', '2', '3'] })).toEqual({ v: [1, 2] });
});

test('union of tuples and arrays', () => {
    type A = { v: [string] | string[] | string };
    expect(cast<A>({ v: ['a'] })).toEqual({ v: ['a'] });
    expect(cast<A>({ v: ['a', 'b'] })).toEqual({ v: ['a', 'b'] });
    expect(is<A>({ v: ['a', 'b'] })).toBe(true);

    type B = { v: [number, number] | number[] };
    expect(cast<B>({ v: [1, 2, 3] })).toEqual({ v: [1, 2, 3] });
    expect(cast<B>({ v: [1] })).toEqual({ v: [1] });
});

test('union of tuples with optional and rest elements', () => {
    type A = { v: [number, string?] | [number, string, number] };
    expect(cast<A>({ v: [1] })).toEqual({ v: [1] });
    expect(cast<A>({ v: [1, 'a'] })).toEqual({ v: [1, 'a'] });
    expect(cast<A>({ v: [1, 'a', 2] })).toEqual({ v: [1, 'a', 2] });

    type B = { v: [string] | [string, ...number[]] };
    expect(cast<B>({ v: ['a'] })).toEqual({ v: ['a'] });
    expect(cast<B>({ v: ['a', 1, 2] })).toEqual({ v: ['a', 1, 2] });
});

test('union of objects with tuples picks the object with the matching tuple', () => {
    type A = { v: { a: [number] } | { a: [number, number] } };
    expect(cast<A>({ v: { a: [1] } })).toEqual({ v: { a: [1] } });
    expect(cast<A>({ v: { a: [1, 2] } })).toEqual({ v: { a: [1, 2] } });
    expect(serialize<A>({ v: { a: [1, 2] } })).toEqual({ v: { a: [1, 2] } });
    expect(is<A>({ v: { a: [1, 2, 3] } })).toBe(false);
    expect(validate<A>({ v: { a: [1, 2, 3] } })).toHaveLength(1);

    type B = { v: { a: [number, number] } | { a: [number] } };
    expect(cast<B>({ v: { a: [1] } })).toEqual({ v: { a: [1] } });
    expect(cast<B>({ v: { a: [1, 2] } })).toEqual({ v: { a: [1, 2] } });

    class Short {
        a: [number] = [0];
    }

    class Long {
        a: [number, number] = [0, 0];
    }

    class LongChild extends Long {
        b?: string;
    }

    type C = { v: Short | LongChild };
    expect(cast<C>({ v: { a: [1, 2] } }).v).toBeInstanceOf(LongChild);
    expect(cast<C>({ v: { a: [1] } }).v).toBeInstanceOf(Short);
});

test('union of objects with tuples falls back to a tuple with a different length', () => {
    type A = { v: { a: [number] } | { a: number } };
    expect(cast<A>({ v: { a: [1, 2] } })).toEqual({ v: { a: [1] } });
    expect(cast<A>({ v: { a: 1 } })).toEqual({ v: { a: 1 } });

    //string accepts any value loosely (like `cast<{ a: string }>({ a: [1, 2] })`), which is an exact match before the fallback
    type S = { v: { a: [number] } | { a: string } };
    expect(cast<S>({ v: { a: [1, 2] } })).toEqual({ v: { a: '1,2' } });

    type D = { v: { k: 'x', a: [number] } | { k: 'y', a: [number, number] } };
    expect(cast<D>({ v: { k: 'y', a: [1, 2] } })).toEqual({ v: { k: 'y', a: [1, 2] } });
    expect(cast<D>({ v: { k: 'x', a: [1, 2] } })).toEqual({ v: { k: 'x', a: [1] } });
    expect(validate<D>({ v: { k: 'x', a: [1, 2] } })).toEqual([{ code: 'type', message: 'Expected 1 element', path: 'v.a', value: [1, 2] }]);
});

test('unions in members of unions', () => {
    //the inner union is checked in the type guard of the outer member, it inherits the pass of the outer union
    type A = { v: { a: [number] | [number, number] } | { b: string } };
    expect(cast<A>({ v: { a: [1, 2] } })).toEqual({ v: { a: [1, 2] } });
    expect(cast<A>({ v: { a: [1, 2, 3] } })).toEqual({ v: { a: [1] } });

    type B = { v: { a: [number] | string } | { b: string } };
    expect(cast<B>({ v: { a: [1, 2] } })).toEqual({ v: { a: [1] } });

    type N1 = { v: [[number] | [number, number]] | string };
    expect(cast<N1>({ v: [[1, 2]] })).toEqual({ v: [[1, 2]] });

    type N2 = { v: Array<[number] | [number, number]> };
    expect(cast<N2>({ v: [[1], [1, 2], [1, 2, 3]] })).toEqual({ v: [[1], [1, 2], [1]] });
});

test('union with a circular type containing tuples', () => {
    interface Node {
        pos: [number, number];
        children: Node[];
    }

    type A = { v: Node | [number] };
    expect(cast<A>({ v: { pos: [1, 2], children: [{ pos: [3, 4], children: [] }] } })).toEqual({ v: { pos: [1, 2], children: [{ pos: [3, 4], children: [] }] } });
    expect(cast<A>({ v: [1] })).toEqual({ v: [1] });
    expect(cast<A>({ v: [1, 2] })).toEqual({ v: [1] });
});

test('tuple with optional elements', () => {
    //a missing optional element stays missing
    expect(cast<[number, string?]>([1])).toEqual([1]);
    expect(cast<[number, string?]>([1])).toHaveLength(1);
    expect(cast<[number, string?]>([1, 'a'])).toEqual([1, 'a']);
    expect(cast<[number, string?, number?]>([1])).toHaveLength(1);
    expect(cast<[number, string?, number?]>([1, 'a', 2])).toEqual([1, 'a', 2]);
    expect(cast<[number, (string | undefined)?]>([1])).toHaveLength(1);
    //an optional element that is in the value stays in the value
    expect(cast<[number, string?]>([1, undefined])).toHaveLength(2);
    expect(serialize<[number, string?]>([1])).toHaveLength(1);

    //a required element that accepts undefined is always set
    expect(cast<[number, string | undefined]>([1])).toHaveLength(2);
    expect(cast<[number, string | undefined]>([1])).toEqual([1, undefined]);
    expect(cast<[number, string | undefined]>([1, 'a'])).toEqual([1, 'a']);
});
