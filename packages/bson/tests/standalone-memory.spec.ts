import { expect, test } from '@jest/globals';

import { deserializeBSONWithoutOptimiser } from '../src/bson-parser.js';
import { getBSONSerializer, serializeBSONWithoutOptimiser } from '../src/bson-serializer.js';

// serializers without a writer write into reused memory and return copies
test('messages without a writer stay intact when more are serialized', () => {
    type T = { id: number; name: string; tags: string[] };
    const serialize = getBSONSerializer<T>();
    const messages: Uint8Array[] = [];
    const values: T[] = [];
    for (let i = 0; i < 2000; i++) {
        const value = { id: i, name: 'name ' + i, tags: Array.from({ length: i % 7 }, (_, j) => 'tag' + j) };
        values.push(value);
        messages.push(serialize(value));
    }
    for (let i = 0; i < messages.length; i++) expect(deserializeBSONWithoutOptimiser(messages[i])).toEqual(values[i]);

    // a message is not shared with another one
    const a = serialize({ id: 1, name: 'a', tags: [] });
    const b = serialize({ id: 2, name: 'b', tags: [] });
    a.fill(0);
    expect(deserializeBSONWithoutOptimiser(b)).toEqual({ id: 2, name: 'b', tags: [] });
});

test('large messages, and small ones after them', () => {
    type T = { items: string[] };
    const serialize = getBSONSerializer<T>();
    const large = { items: Array.from({ length: 5000 }, (_, i) => 'item number ' + i) };
    const first = serialize(large);
    const second = serialize(large);
    expect(second).not.toBe(first);
    expect(deserializeBSONWithoutOptimiser(first)).toEqual(large);
    expect(deserializeBSONWithoutOptimiser(second)).toEqual(large);

    // the same serializer with small messages again
    const small = serialize({ items: ['a'] });
    expect(deserializeBSONWithoutOptimiser(small)).toEqual({ items: ['a'] });
    expect(deserializeBSONWithoutOptimiser(first)).toEqual(large);
});

test('a serializer called while another one runs', () => {
    class Lazy {
        get value(): string {
            // serializes another message in the middle of this one
            return 'inner:' + serializeBSONWithoutOptimiser({ x: 1 }).byteLength;
        }
    }
    type T = { a: string; value: string; b: string };
    const serialize = getBSONSerializer<T>();
    const message = serialize({ a: 'before', value: new Lazy().value, b: 'after' });
    const object: any = { a: 'before', b: 'after' };
    Object.defineProperty(object, 'value', { get: () => 'inner:' + serializeBSONWithoutOptimiser({ x: 1 }).byteLength, enumerable: true });
    const nested = serialize(object);
    expect(deserializeBSONWithoutOptimiser(nested)).toEqual(deserializeBSONWithoutOptimiser(message));
});

test('a serializer that throws leaves the memory usable', () => {
    type T = { id: number };
    const serialize = getBSONSerializer<T>();
    expect(() => serialize({ id: 'x' as any })).toThrow();
    expect(deserializeBSONWithoutOptimiser(serialize({ id: 5 }))).toEqual({ id: 5 });
    expect(deserializeBSONWithoutOptimiser(serializeBSONWithoutOptimiser({ ok: true }))).toEqual({ ok: true });
});
