import { expect, test } from '@jest/globals';

import { AutoBuffer, AutoBufferSerializer, getBSONSerializer, serializeBSON } from '../src/bson-serializer.js';

const write: AutoBufferSerializer = getBSONSerializer<{ value: string }>();

// a Writer that sees more than one buffer type gets slower for every message, in the whole process
test('the buffer has the same type as the one of a serialized document', () => {
    const expected = serializeBSON<{ value: string }>({ value: 'a' }).constructor;
    const buffer = new AutoBuffer(0, 1024);
    expect(buffer._buffer.constructor).toBe(expected);
});

test('the buffer keeps its type when it grows', () => {
    const expected = serializeBSON<{ value: string }>({ value: 'a' }).constructor;
    const buffer = new AutoBuffer(0, 8);
    buffer.apply(write, { value: 'a'.repeat(1000) });
    expect(buffer._buffer.byteLength).toBeGreaterThan(8);
    expect(buffer._buffer.constructor).toBe(expected);
});

test('only the written bytes are exposed', () => {
    const buffer = new AutoBuffer(0, 1024);
    buffer.apply(write, { value: 'abc' });
    expect(Buffer.from(buffer.buffer)).toEqual(Buffer.from(serializeBSON<{ value: string }>({ value: 'abc' })));
});
