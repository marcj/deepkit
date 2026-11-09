import { expect, test } from '@jest/globals';

import { getBSONDeserializer } from '../src/bson-deserializer.js';
import { getBSONSerializer } from '../src/bson-serializer.js';
import { decodeUTF8 } from '../src/strings.js';

function bytes(text: string): Buffer {
    return Buffer.from(text, 'utf8');
}

test('ASCII of every length around the short string limit', () => {
    for (let length = 0; length <= 40; length++) {
        const text = 'x'.repeat(length);
        const buffer = bytes(text);
        expect(decodeUTF8(buffer, 0, buffer.length)).toBe(text);
    }
});

test('the same bytes in a Uint8Array', () => {
    for (const text of ['short', 'a string that is longer than sixteen bytes', 'länger als sechzehn Zeichen ü']) {
        const buffer = new Uint8Array(bytes(text));
        expect(decodeUTF8(buffer, 0, buffer.length)).toBe(text);
    }
});

test('offsets are respected', () => {
    const buffer = bytes('..hello..');
    expect(decodeUTF8(buffer, 2, 7)).toBe('hello');
    const long = bytes('..a string with more than sixteen bytes..');
    expect(decodeUTF8(long, 2, long.length - 2)).toBe('a string with more than sixteen bytes');
});

test('multi-byte characters in short and long strings', () => {
    for (const text of ['ü', 'äöü', '日本語', '😀', 'a😀b', 'ü'.repeat(30), '日本語'.repeat(10), '😀'.repeat(10)]) {
        const buffer = bytes(text);
        expect(decodeUTF8(buffer, 0, buffer.length)).toBe(text);
    }
});

test('a null byte ends a short string', () => {
    const buffer = Buffer.from([97, 98, 0, 99]);
    expect(decodeUTF8(buffer, 0, buffer.length)).toBe('ab');
});

test('a leading byte order mark is kept', () => {
    const text = '﻿' + 'x'.repeat(30);
    const buffer = bytes(text);
    expect(decodeUTF8(buffer, 0, buffer.length)).toBe(text);
});

test('strings survive serialization', () => {
    type T = { v: string };
    const serialize = getBSONSerializer<T>();
    const deserialize = getBSONDeserializer<T>();
    const texts = ['', 'a', 'ascii', 'x'.repeat(100), 'ü', 'aü', 'üa', '日本語', '😀', 'a😀b', 'ab😀', '\uD83D', 'ascii then ü then ascii'];
    for (const v of texts) {
        const buffer = serialize({ v });
        const expected = Buffer.from(v, 'utf8').toString('utf8');
        if (v === '\uD83D') {
            expect(deserialize(buffer).v.length).toBeGreaterThan(0);
            continue;
        }
        expect(deserialize(buffer)).toEqual({ v: expected });
    }
});

test('array keys are the indexes', () => {
    type T = { v: number[] };
    const serialize = getBSONSerializer<T>();
    const deserialize = getBSONDeserializer<T>();
    for (const size of [0, 1, 9, 10, 11, 99, 100, 101, 1000]) {
        const v = Array.from({ length: size }, (_, i) => i);
        const buffer = serialize({ v });
        expect(deserialize(buffer)).toEqual({ v });
        if (size === 11) {
            //the key of the item at index 10 is "10"
            const text = Buffer.from(buffer).toString('latin1');
            expect(text).toContain('\x1010\0');
        }
    }
});
