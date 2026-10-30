import { expect, test } from '@jest/globals';

import { deletePathValue, getPathValue, setPathValue } from '../src/core.js';

test('get, set and delete path values', () => {
    const bag: any = { a: { b: { c: 1 } }, 'x.y': 2, 'p.q': { r: 3 } };
    expect(getPathValue(bag, 'a.b.c')).toBe(1);
    expect(getPathValue(bag, 'x.y')).toBe(2);
    expect(getPathValue(bag, 'p\\.q.r')).toBe(3);
    expect(getPathValue(bag, 'a.missing.c', 'default')).toBe('default');
    expect(getPathValue(bag, 'a.b.missing', 'default')).toBe('default');
    expect(getPathValue(bag, '')).toBe(bag);

    setPathValue(bag, 'a.b.d', 4);
    setPathValue(bag, 'new.deep.value', 5);
    expect(bag.a.b.d).toBe(4);
    expect(bag.new.deep.value).toBe(5);

    deletePathValue(bag, 'a.b.c');
    deletePathValue(bag, 'not.existing');
    expect(bag.a.b).toEqual({ d: 4 });
});

test('path values cannot pollute prototypes', () => {
    const bag: any = {};
    setPathValue(bag, '__proto__.polluted', true);
    setPathValue(bag, 'constructor.prototype.polluted', true);
    setPathValue(bag, 'a.__proto__.polluted', true);
    expect(({} as any).polluted).toBe(undefined);
    expect(getPathValue(bag, '__proto__')).toBe(undefined);
    expect(getPathValue(bag, 'constructor')).toBe(undefined);
    // inherited, non-enumerable properties are not readable
    expect(getPathValue({ a: {} }, 'a.toString')).toBe(undefined);
});
