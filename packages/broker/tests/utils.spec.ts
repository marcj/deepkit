import { expect, test } from '@jest/globals';

import { parseDuration, parseTime, xxHash32 } from '../src/utils.js';

test('parseDuration', () => {
    expect(parseDuration('100')).toBe(100);
    expect(parseDuration('5ms')).toBe(5);
    expect(parseDuration('1.5s')).toBe(1500);
    expect(parseDuration('10 minutes')).toBe(600_000);
    expect(parseDuration('2h')).toBe(7_200_000);
    expect(parseDuration('1 day')).toBe(86_400_000);
    expect(parseDuration('1w')).toBe(604_800_000);
    expect(parseDuration('1y')).toBe(31_557_600_000);
    expect(parseDuration('-1s')).toBe(-1000);
    expect(parseDuration('abc')).toBe(undefined);
    expect(parseDuration('10 foo')).toBe(undefined);

    expect(parseTime(undefined)).toBe(undefined);
    expect(parseTime('')).toBe(undefined);
    expect(parseTime('invalid')).toBe(0);
    expect(parseTime(250)).toBe(250);
});

test('xxHash32', () => {
    // reference values of the xxHash spec implementation
    const hash = (v: string) => xxHash32(new TextEncoder().encode(v));
    expect(hash('')).toBe(0x02cc5d05);
    expect(hash('a')).toBe(0x550d7456);
    expect(hash('abc')).toBe(0x32d153ff);
    expect(hash('Nobody inspects the spammish repetition')).toBe(0xe2293b2f);
});
