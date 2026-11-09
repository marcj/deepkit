import { expect, jest, test } from '@jest/globals';

import { getBSONDeserializer } from '../src/bson-deserializer.js';
import { AutoBuffer, getBSONSerializer } from '../src/bson-serializer.js';

type Doc = { v: string };
const serialize = getBSONSerializer<Doc>();
const deserialize = getBSONDeserializer<Doc>();
const doc = (size: number): Doc => ({ v: 'x'.repeat(size) });
const smallSize = 64;
const maxSmall = 256;
const large = 4000;

function create(retention = 10_000, prepend = 0) {
    return new AutoBuffer(prepend, smallSize, maxSmall, retention);
}

function read(buffer: AutoBuffer, prepend = 0): Doc {
    return deserialize(buffer.buffer.subarray(prepend));
}

function wait(ms: number) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

test('an everyday message stays in the small buffer', () => {
    const buffer = create();
    buffer.apply(serialize, doc(10));
    expect(buffer._buffer.byteLength).toBe(smallSize);
    expect(read(buffer)).toEqual(doc(10));
});

test('the small buffer grows up to its limit', () => {
    const buffer = create();
    buffer.apply(serialize, doc(100));
    expect(buffer._buffer.byteLength).toBeGreaterThan(smallSize);
    expect(buffer._buffer.byteLength).toBeLessThanOrEqual(maxSmall);
    expect(read(buffer)).toEqual(doc(100));

    const grown = buffer._buffer;
    buffer.apply(serialize, doc(5));
    expect(buffer._buffer).toBe(grown);
});

test('a large message does not grow the small buffer', () => {
    const buffer = create();
    buffer.apply(serialize, doc(10));
    const small = buffer._buffer;

    buffer.apply(serialize, doc(large));
    expect(buffer._buffer).not.toBe(small);
    expect(buffer._buffer.byteLength).toBeGreaterThan(large);
    expect(read(buffer)).toEqual(doc(large));

    buffer.apply(serialize, doc(10));
    expect(read(buffer)).toEqual(doc(10));
    buffer.apply(serialize, doc(10));
    expect(buffer._buffer).toBe(small);
    expect(small.byteLength).toBe(smallSize);
});

test('repeated large messages reuse the large buffer and are written once', () => {
    const buffer = create();
    buffer.apply(serialize, doc(large));
    const first = buffer._buffer;

    const counted = jest.fn(serialize as any) as any;
    for (let i = 0; i < 5; i++) {
        buffer.apply(counted, doc(large));
        expect(read(buffer)).toEqual(doc(large));
    }
    expect(buffer._buffer).toBe(first);
    expect(counted).toHaveBeenCalledTimes(5);
});

test('a larger message replaces the large buffer', () => {
    const buffer = create();
    buffer.apply(serialize, doc(large));
    buffer.apply(serialize, doc(large * 3));
    expect(read(buffer)).toEqual(doc(large * 3));
    expect(buffer._buffer.byteLength).toBeGreaterThan(large * 3);
});

test('an unused large buffer is released', async () => {
    const buffer = create(20);
    buffer.apply(serialize, doc(10));
    const small = buffer._buffer;
    buffer.apply(serialize, doc(large));
    expect(buffer.hasLargeBuffer).toBe(true);

    await wait(80);
    expect(buffer.hasLargeBuffer).toBe(false);
    expect(buffer._buffer).toBe(small);

    buffer.apply(serialize, doc(10));
    expect(read(buffer)).toEqual(doc(10));
    expect(buffer._buffer).toBe(small);
});

test('a large buffer in use is kept', async () => {
    const buffer = create(40);
    buffer.apply(serialize, doc(large));
    const first = buffer._buffer;
    for (let i = 0; i < 8; i++) {
        await wait(15);
        buffer.apply(serialize, doc(large));
    }
    expect(buffer._buffer).toBe(first);
    expect(buffer.hasLargeBuffer).toBe(true);
    buffer.dispose();
});

test('releaseLarge returns to the small buffer', () => {
    const buffer = create();
    buffer.apply(serialize, doc(10));
    const small = buffer._buffer;
    buffer.apply(serialize, doc(large));
    buffer.releaseLarge();
    expect(buffer.hasLargeBuffer).toBe(false);
    expect(buffer._buffer).toBe(small);
    buffer.apply(serialize, doc(10));
    expect(read(buffer)).toEqual(doc(10));
});

test('dispose stops the release timer', async () => {
    const buffer = create(20);
    buffer.apply(serialize, doc(large));
    buffer.dispose();
    expect(buffer.hasLargeBuffer).toBe(false);
    await wait(50);
    buffer.apply(serialize, doc(10));
    expect(read(buffer)).toEqual(doc(10));
});

test('prepended bytes survive every switch of the buffer', () => {
    const prepend = 21;
    const buffer = create(10_000, prepend);
    for (const size of [10, large, large * 2, 10, 10, 100, large, 10, 10]) {
        buffer.apply(serialize, doc(size));
        expect(buffer.size).toBeGreaterThan(prepend);
        expect(read(buffer, prepend)).toEqual(doc(size));
    }
    buffer.dispose();
});

test('the writer and the buffer always stay in sync', () => {
    const buffer = create();
    for (const size of [10, large, 10, 10, large, large, 100, 10]) {
        buffer.apply(serialize, doc(size));
        expect(buffer.state.writer.buffer).toBe(buffer._buffer);
    }
    buffer.dispose();
});

test('all buffers have the same type', () => {
    const buffer = create();
    buffer.apply(serialize, doc(10));
    const small = buffer._buffer.constructor;
    buffer.apply(serialize, doc(large));
    expect(buffer._buffer.constructor).toBe(small);
    buffer.dispose();
});

test('a message up to exactly the limit stays small', () => {
    const buffer = create();
    let size = 0;
    for (let i = 200; i < 300; i++) {
        buffer.apply(serialize, doc(i));
        expect(read(buffer)).toEqual(doc(i));
        if (buffer.size === maxSmall) size = i;
    }
    expect(size).toBeGreaterThan(0);
    buffer.dispose();
});
