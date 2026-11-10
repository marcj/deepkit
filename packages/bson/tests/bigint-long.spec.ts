import { expect, test } from '@jest/globals';

import { BinaryBigInt } from '@deepkit/type';

import { getBSONDeserializer } from '../src/bson-deserializer.js';
import { deserializeBSONWithoutOptimiser } from '../src/bson-parser.js';
import { getBSONSerializer, serializeBSONWithoutOptimiser } from '../src/bson-serializer.js';

test('a bigint is a 64 bit long, the full range of it', () => {
    const serialize = getBSONSerializer<{ v: bigint }>();
    const deserialize = getBSONDeserializer<{ v: bigint }>();
    // negative multiples of 2^32 lost the carry of the low half
    for (const v of [0n, 1n, -1n, 2n ** 32n, -(2n ** 32n), -(2n ** 33n), -(2n ** 32n) - 1n, 2n ** 63n - 1n, -(2n ** 63n)]) {
        expect(deserialize(serialize({ v }))).toEqual({ v });
    }
});

test('a bigint beyond 64 bit is rejected instead of wrapped around', () => {
    const serialize = getBSONSerializer<{ v: bigint }>();
    // was written as 2^63 - 2^64 = -9223372036854775808
    expect(() => serialize({ v: 2n ** 63n })).toThrow('does not fit into a 64 bit BSON long');
    expect(() => serialize({ v: -(2n ** 63n) - 1n })).toThrow('does not fit into a 64 bit BSON long');
    // the same without a type
    expect(() => serializeBSONWithoutOptimiser({ v: 2n ** 64n })).toThrow('does not fit into a 64 bit BSON long');

    // what to use instead
    const binary = getBSONSerializer<{ v: BinaryBigInt }>();
    expect(getBSONDeserializer<{ v: BinaryBigInt }>()(binary({ v: 2n ** 70n }))).toEqual({ v: 2n ** 70n });
});

test('dates before 1970 at multiples of 2^32 ms', () => {
    const serialize = getBSONSerializer<{ d: Date }>();
    const deserialize = getBSONDeserializer<{ d: Date }>();
    // came back 2^32 ms earlier, the carry of the low half was lost
    for (const ms of [-1, -4294967296, -8589934592, -4294967297, 0, 1700000000000, -62135596800000]) {
        expect(deserialize(serialize({ d: new Date(ms) })).d.getTime()).toBe(ms);
        expect(deserializeBSONWithoutOptimiser(serializeBSONWithoutOptimiser({ d: new Date(ms) })).d.getTime()).toBe(ms);
    }
});
