import { expect, test } from '@jest/globals';

import { arrayBufferFrom, arrayBufferTo, arrayBufferToBase64, base64ToArrayBuffer, typedArrayToBase64, typedArrayToBuffer } from '../src/core.js';
import { stringifyUuid, uuid, writeUuid } from '../src/utils.js';

test('uuid v4', () => {
    const id = uuid();
    expect(id).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
    expect(uuid()).not.toBe(id);

    const buffer = new Uint8Array(20);
    writeUuid(buffer, 2);
    expect(buffer[0]).toBe(0);
    expect(buffer[1]).toBe(0);
    expect(stringifyUuid(buffer, 2)).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4/);

    const fixed = new Uint8Array([0x6b, 0xa7, 0xb8, 0x10, 0x9d, 0xad, 0x11, 0xd1, 0x80, 0xb4, 0x00, 0xc0, 0x4f, 0xd4, 0x30, 0xc8]);
    expect(stringifyUuid(fixed)).toBe('6ba7b810-9dad-11d1-80b4-00c04fd430c8');
});

function withoutBuffer(fn: () => void) {
    // browsers have no global Buffer, the helpers fall back to atob/btoa and TextEncoder/TextDecoder
    const original = (globalThis as any).Buffer;
    (globalThis as any).Buffer = undefined;
    try {
        fn();
    } finally {
        (globalThis as any).Buffer = original;
    }
}

for (const env of ['with Buffer', 'without Buffer']) {
    test(`binary helpers ${env}`, () => {
        const run = () => {
            const text = 'Hällo 🌍 world';
            const utf8 = arrayBufferFrom(text, 'utf8');
            expect(utf8.byteLength).toBe(new TextEncoder().encode(text).byteLength);
            expect(arrayBufferTo(utf8, 'utf8')).toBe(text);
            expect(arrayBufferTo(utf8)).toBe(text);
            expect(arrayBufferTo(arrayBufferFrom('AACAQ+Tqs0Y=', 'base64'), 'base64')).toBe('AACAQ+Tqs0Y=');
            expect(arrayBufferTo(arrayBufferFrom('00ff7f', 'hex'), 'hex')).toBe('00ff7f');
            expect(arrayBufferTo(arrayBufferFrom('abc', 'ascii'), 'ascii')).toBe('abc');

            const floats = new Float32Array([256, 23029.4453125]);
            expect(typedArrayToBase64(floats)).toBe('AACAQ+Tqs0Y=');
            expect(arrayBufferToBase64(floats.buffer)).toBe('AACAQ+Tqs0Y=');
            expect(new Float32Array(base64ToArrayBuffer('AACAQ+Tqs0Y='))).toEqual(floats);

            // views into a larger buffer only use their own bytes
            const big = new Uint8Array([1, 2, 3, 4, 5]);
            const view = big.subarray(1, 3);
            expect(arrayBufferTo(view, 'hex')).toBe('0203');
            expect(Array.from(typedArrayToBuffer(view))).toEqual([2, 3]);

            // larger than the String.fromCharCode chunk size
            const large = new Uint8Array(100_000).map((v, i) => i % 256);
            expect(new Uint8Array(base64ToArrayBuffer(arrayBufferToBase64(large.buffer)))).toEqual(large);
        };
        if (env === 'with Buffer') run();
        else withoutBuffer(run);
    });
}
