import { expect, test } from '@jest/globals';

import { findQueryList, findQuerySatisfied } from '../src/utils.js';

class ObjectIdLike {
    constructor(public id: string) {}

    toJSON() {
        return this.id;
    }

    toString() {
        return this.id;
    }
}

const d1 = new Date('2020-01-01');
const d2 = new Date('2021-01-01');

const items: any[] = [
    { id: 1, name: 'Peter', age: 20, tags: ['a', 'b'], born: d1, nested: { x: 1, y: [1, 2, 3], list: [{ v: 1 }, { v: 2 }] }, oid: new ObjectIdLike('aa'), n: null },
    { id: 2, name: 'peter', age: 30, tags: [], born: d2, nested: { x: 2, y: [], list: [] }, oid: new ObjectIdLike('bb') },
    { id: 3, name: 'Marie', age: null, tags: ['c'], nested: { x: null, list: [{ v: 3, w: { z: 1 } }] } },
    { id: 4, name: '', age: 0, tags: ['a'], born: d1, nested: null },
    { id: 5, age: 25, tags: ['b', 'c', 'a'], nested: {} },
];

function ids(query: any): number[] {
    return findQueryList(items, query).map(v => v.id);
}

test('comparison', () => {
    expect(ids({ id: 2 })).toEqual([2]);
    expect(ids({ id: { $eq: 2 } })).toEqual([2]);
    expect(ids({ id: { $ne: 2 } })).toEqual([1, 3, 4, 5]);
    expect(ids({ age: { $gt: 20 } })).toEqual([2, 5]);
    expect(ids({ age: { $gte: 20 } })).toEqual([1, 2, 5]);
    expect(ids({ age: { $lt: 25 } })).toEqual([1, 4]);
    expect(ids({ age: { $lte: 25 } })).toEqual([1, 4, 5]);
    expect(ids({ age: { $gt: 20, $lt: 30 } })).toEqual([5]);
    expect(ids({ name: { $gt: 'a' } })).toEqual([2]);
    //null % 10 == 0
    expect(ids({ age: { $mod: [10, 0] } })).toEqual([1, 2, 3, 4]);
});

test('null and missing', () => {
    expect(ids({ age: null })).toEqual([3]);
    expect(ids({ name: null })).toEqual([5]);
    expect(ids({ name: { $exists: false } })).toEqual([5]);
    expect(ids({ name: { $exists: true } })).toEqual([1, 2, 3, 4]);
    //nested: null exists, path lookup stops there
    expect(ids({ 'nested.x': { $exists: true } })).toEqual([1, 2, 3, 4]);
    expect(ids({ missing: { $in: [null] } })).toEqual([1, 2, 3, 4, 5]);
});

test('in, nin', () => {
    expect(ids({ id: { $in: [1, 3] } })).toEqual([1, 3]);
    expect(ids({ id: { $nin: [1, 3] } })).toEqual([2, 4, 5]);
    expect(ids({ tags: { $in: ['c'] } })).toEqual([3, 5]);
    expect(ids({ tags: { $nin: ['a'] } })).toEqual([2, 3]);
    expect(ids({ name: { $in: [/^p/, 'Marie'] } })).toEqual([2, 3]);
});

test('arrays', () => {
    expect(ids({ tags: 'a' })).toEqual([1, 4, 5]);
    expect(ids({ tags: [] })).toEqual([2]);
    //array values are compared element-wise, so an array literal never equals an array
    expect(ids({ tags: ['a', 'b'] })).toEqual([]);
    expect(ids({ tags: { $all: ['a', 'b'] } })).toEqual([1, 5]);
    expect(ids({ tags: { $size: 1 } })).toEqual([3, 4]);
    expect(ids({ 'tags.0': 'b' })).toEqual([5]);
    expect(ids({ 'nested.list': { $elemMatch: { v: { $gt: 1 } } } })).toEqual([1, 3]);
    expect(ids({ 'nested.y': { $elemMatch: { $gte: 3 } } })).toEqual([1]);
});

test('nested paths', () => {
    expect(ids({ 'nested.x': 2 })).toEqual([2]);
    expect(ids({ 'nested.list.v': 2 })).toEqual([1]);
    expect(ids({ 'nested.list.v': { $ne: 1 } })).toEqual([2, 3, 4, 5]);
    expect(ids({ 'nested.list.w.z': 1 })).toEqual([3]);
});

test('regex', () => {
    expect(ids({ name: /^p/i })).toEqual([1, 2]);
    expect(ids({ name: { $regex: /^p/ } })).toEqual([2]);
    expect(ids({ name: { $regex: '^p', $options: 'i' } })).toEqual([1, 2]);
    expect(ids({ name: { $not: /^p/i } })).toEqual([3, 4, 5]);
});

test('Date and toJSON values', () => {
    expect(ids({ born: new Date('2020-01-01') })).toEqual([1, 4]);
    expect(ids({ born: { $gt: d1 } })).toEqual([2]);
    expect(ids({ born: { $in: [new Date('2021-01-01')] } })).toEqual([2]);
    expect(ids({ oid: new ObjectIdLike('bb') })).toEqual([2]);
    expect(ids({ oid: { $in: [new ObjectIdLike('aa')] } })).toEqual([1]);
});

test('logical', () => {
    expect(ids({ $and: [{ tags: 'a' }, { age: { $gt: 0 } }] })).toEqual([1, 5]);
    expect(ids({ $or: [{ id: 1 }, { name: 'Marie' }] })).toEqual([1, 3]);
    expect(ids({ $nor: [{ id: 1 }, { name: 'Marie' }] })).toEqual([2, 4, 5]);
    expect(ids({ age: { $not: { $gt: 20 } } })).toEqual([1, 3, 4]);
    expect(ids({ $or: [{ id: 1 }, { $and: [{ tags: 'c' }, { age: 25 }] }] })).toEqual([1, 5]);
});

test('unknown operator', () => {
    expect(() => ids({ name: { $foo: 1 } })).toThrow('Unknown operation $foo');
});

test('findQuerySatisfied', () => {
    expect(findQuerySatisfied(items[0], { name: 'Peter' })).toBe(true);
    expect(findQuerySatisfied(items[0], { name: 'Marie' })).toBe(false);
});
