import { expect, test } from '@jest/globals';

import { deserializeBSON } from '../src/bson-deserializer.js';
import { serializeBSON } from '../src/bson-serializer.js';
import { ObjectId } from '../src/model.js';
import { MongoId } from '@deepkit/type';

test('a generated id is 24 lower case hex characters', () => {
    for (let i = 0; i < 1000; i++) expect(ObjectId.generate()).toMatch(/^[0-9a-f]{24}$/);
});

test('the id starts with the time in seconds', () => {
    expect(ObjectId.generate(0x12ab34cd).slice(0, 8)).toBe('12ab34cd');
    expect(ObjectId.generate(0x00000001).slice(0, 8)).toBe('00000001');
    expect(ObjectId.generate(0x7fffffff).slice(0, 8)).toBe('7fffffff');
});

test('the time defaults to now', () => {
    const before = Math.floor(Date.now() / 1000);
    const time = parseInt(ObjectId.generate().slice(0, 8), 16);
    expect(time).toBeGreaterThanOrEqual(before);
    expect(time).toBeLessThanOrEqual(before + 2);
});

test('the process part is the same and the counter increases by one', () => {
    const a = ObjectId.generate(1);
    const b = ObjectId.generate(1);
    expect(a.slice(8, 18)).toBe(b.slice(8, 18));
    expect((parseInt(a.slice(18), 16) + 1) % 0xffffff).toBe(parseInt(b.slice(18), 16));
});

test('generated ids are unique', () => {
    const ids = new Set<string>();
    for (let i = 0; i < 10000; i++) ids.add(ObjectId.generate());
    expect(ids.size).toBe(10000);
});

test('a generated id survives BSON', () => {
    const v = ObjectId.generate();
    expect(deserializeBSON<{ v: MongoId }>(serializeBSON<{ v: MongoId }>({ v }))).toEqual({ v });
});
