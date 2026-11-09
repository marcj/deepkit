import { expect, test } from '@jest/globals';

import { createRows, getRowFactory } from '../src/row-factory.js';

test('assigns the values to their columns', () => {
    expect(getRowFactory(['id', 'name'])([1, 'a'])).toEqual({ id: 1, name: 'a' });
});

test('the same columns share one factory, a different order does not', () => {
    expect(getRowFactory(['id', 'name'])).toBe(getRowFactory(['id', 'name']));
    expect(getRowFactory(['name', 'id'])(['a', 1])).toEqual({ id: 1, name: 'a' });
    expect(getRowFactory(['name', 'id'])).not.toBe(getRowFactory(['id', 'name']));
});

test('column names with special characters', () => {
    const names = ['a"b', "c'd", 'e\\f', 'g h', 'i\nj', '1', 'count(*)'];
    const row = getRowFactory(names)([1, 2, 3, 4, 5, 6, 7]);
    expect(names.map(v => row[v])).toEqual([1, 2, 3, 4, 5, 6, 7]);
});

test('the last column of a name wins', () => {
    expect(getRowFactory(['a', 'a'])([1, 2])).toEqual({ a: 2 });
});

test('a column named __proto__ does not change the prototype', () => {
    const row = getRowFactory(['__proto__', 'a'])([{ polluted: true }, 1]);
    expect(Object.getPrototypeOf(row)).toBe(Object.prototype);
    expect(row.polluted).toBe(undefined);
    expect(row.a).toBe(1);
});

test('rows are replaced in place', () => {
    const rows = [[1], [2]];
    expect(createRows(rows, getRowFactory(['a']))).toBe(rows);
    expect(rows).toEqual([{ a: 1 }, { a: 2 }]);
});
