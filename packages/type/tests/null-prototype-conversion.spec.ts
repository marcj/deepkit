import { expect, test } from '@jest/globals';

import { integer } from '../src/reflection/type.js';
import { cast, deserialize, serialize } from '../src/serializer-facade.js';
import { ValidationError } from '../src/validator.js';

const noPrototype = () => Object.create(null);

test.each([
    ['string', () => cast<string>(noPrototype())],
    ['number', () => cast<number>(noPrototype())],
    ['integer', () => cast<integer>(noPrototype())],
    ['bigint', () => cast<bigint>(noPrototype())],
    ['boolean', () => cast<boolean>(noPrototype())],
    ['Date', () => cast<Date>(noPrototype())],
    ['nested string', () => cast<{ s: string }>({ s: noPrototype() })],
    ['array of numbers', () => cast<number[]>([noPrototype()])],
    ['union', () => cast<string | number>(noPrototype())],
])('cast to %s reports a validation error instead of a TypeError', (name, fn) => {
    expect(fn).toThrow(ValidationError);
});

test.each([
    ['string', () => deserialize<string>(noPrototype())],
    ['bigint', () => deserialize<bigint>(noPrototype())],
    ['boolean', () => deserialize<boolean>(noPrototype())],
    ['Date', () => deserialize<Date>(noPrototype())],
    ['serialize to string', () => serialize<string>(noPrototype() as any)],
])('%s leaves the value unconverted instead of a TypeError', (name, fn) => {
    expect(fn()).toEqual(noPrototype());
});

test('deserialize to number reports a validation error instead of a TypeError', () => {
    expect(() => deserialize<number>(noPrototype())).toThrow(ValidationError);
});

test('control: an object with a null prototype is still a valid object', () => {
    const value = Object.assign(noPrototype(), { a: 'x' });
    expect(cast<{ a: string }>(value)).toEqual({ a: 'x' });
});

test('control: conversions of normal values work', () => {
    expect(cast<string>(1)).toBe('1');
    expect(cast<string>({ toString: () => 'custom' })).toBe('custom');
    expect(cast<number>('2')).toBe(2);
    expect(cast<boolean>('true')).toBe(true);
    expect(cast<bigint>('3')).toBe(3n);
    expect(cast<Date>('2020-01-01T00:00:00.000Z')).toEqual(new Date('2020-01-01T00:00:00.000Z'));
});
