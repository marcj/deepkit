import { expect, test } from '@jest/globals';

import { http } from '../src/decorator.js';
import { HttpQueries, HttpQuery, HttpRequest } from '../src/model.js';
import { parseQueryString } from '../src/query-string.js';
import { createHttpKernel } from './utils.js';

test('flat values', () => {
    expect(parseQueryString('')).toEqual({});
    expect(parseQueryString('a=1&b=2')).toEqual({ a: '1', b: '2' });
    expect(parseQueryString('a')).toEqual({ a: '' });
    expect(parseQueryString('a=')).toEqual({ a: '' });
    expect(parseQueryString('=a')).toEqual({});
    expect(parseQueryString('&&')).toEqual({});
    expect(parseQueryString('a=b=c')).toEqual({ a: 'b=c' });
    expect(parseQueryString('a=1;b=2')).toEqual({ a: '1;b=2' });
});

test('decoding', () => {
    expect(parseQueryString('a+b=c+d')).toEqual({ 'a b': 'c d' });
    expect(parseQueryString('a=%E2%9C%93')).toEqual({ a: '✓' });
    expect(parseQueryString('%61=%20b')).toEqual({ a: ' b' });
    // invalid percent encoding is kept as is
    expect(parseQueryString('a=%')).toEqual({ a: '%' });
    expect(parseQueryString('a=%E2%9C')).toEqual({ a: '%E2%9C' });
    expect(parseQueryString('a%5Bb%5D=1')).toEqual({ a: { b: '1' } });
    expect(parseQueryString('a%5bb%5d=1')).toEqual({ a: { b: '1' } });
});

test('duplicates', () => {
    expect(parseQueryString('a=1&a=2&a=3')).toEqual({ a: ['1', '2', '3'] });
    expect(parseQueryString('a=1&a[]=2')).toEqual({ a: ['1', '2'] });
    expect(parseQueryString('a[]=1&a=2')).toEqual({ a: ['1', '2'] });
    expect(parseQueryString('a=1&a[b]=2')).toEqual({ a: ['1', { b: '2' }] });
    expect(parseQueryString('a[b]=2&a=1')).toEqual({ a: { b: '2', 1: true } });
});

test('nested objects', () => {
    expect(parseQueryString('a[b]=1&a[c]=2')).toEqual({ a: { b: '1', c: '2' } });
    expect(parseQueryString('a[b][c]=1&a[b][d]=2&a[e]=3')).toEqual({ a: { b: { c: '1', d: '2' }, e: '3' } });
    expect(parseQueryString('a[b]')).toEqual({ a: { b: '' } });
    expect(parseQueryString('a]=1')).toEqual({ 'a]': '1' });
    expect(parseQueryString('a[=1')).toEqual({ 'a[': '1' });
    expect(parseQueryString('[a]=b')).toEqual({ a: 'b' });
    expect(parseQueryString('a.b=1')).toEqual({ 'a.b': '1' });
});

test('arrays', () => {
    expect(parseQueryString('a[]=1&a[]=2')).toEqual({ a: ['1', '2'] });
    expect(parseQueryString('a[0]=1&a[1]=2')).toEqual({ a: ['1', '2'] });
    expect(parseQueryString('a[1]=b&a[0]=c')).toEqual({ a: ['c', 'b'] });
    // sparse arrays are compacted
    expect(parseQueryString('a[1]=x')).toEqual({ a: ['x'] });
    expect(parseQueryString('a[0][b]=1&a[0][c]=2')).toEqual({ a: [{ b: '1', c: '2' }] });
    expect(parseQueryString('a[][b]=1&a[][c]=2')).toEqual({ a: [{ b: '1', c: '2' }] });
    expect(parseQueryString('a[0]=1&a[b]=2')).toEqual({ a: { 0: '1', b: '2' } });
    // not an index
    expect(parseQueryString('a[-1]=x')).toEqual({ a: { '-1': 'x' } });
    expect(parseQueryString('a[01]=x')).toEqual({ a: { '01': 'x' } });
    expect(parseQueryString('a[1.5]=x')).toEqual({ a: { '1.5': 'x' } });
});

test('array index limit', () => {
    expect(parseQueryString('a[20]=x')).toEqual({ a: ['x'] });
    // higher indices create an object instead of a huge sparse array
    expect(parseQueryString('a[21]=x')).toEqual({ a: { 21: 'x' } });
    expect(parseQueryString('a[99999999]=x')).toEqual({ a: { 99999999: 'x' } });
    expect(parseQueryString('a[0]=x&a[21]=y')).toEqual({ a: { 0: 'x', 21: 'y' } });
});

test('depth limit', () => {
    expect(parseQueryString('a[b][c][d][e][f]=1')).toEqual({ a: { b: { c: { d: { e: { f: '1' } } } } } });
    expect(parseQueryString('a[b][c][d][e][f][g][h]=1')).toEqual({ a: { b: { c: { d: { e: { f: { '[g][h]': '1' } } } } } } });
});

test('parameter limit', () => {
    const query = Array.from({ length: 1500 }, (_, i) => `k${i}=${i}`).join('&');
    const result = parseQueryString(query);
    expect(Object.keys(result).length).toBe(1000);
    expect(result.k999).toBe('999');
    expect(result.k1000).toBe(undefined);

    const array = parseQueryString(Array.from({ length: 1500 }, (_, i) => `a[]=${i}`).join('&'));
    expect(array.a.length).toBe(1000);
});

test('prototype pollution', () => {
    const queries = [
        '__proto__[polluted]=1',
        '__proto__=1',
        'a[__proto__][polluted]=1',
        'a[__proto__]=1',
        'constructor[prototype][polluted]=1',
        'a[constructor][prototype][polluted]=1',
        'a[0][__proto__][polluted]=1',
        'a[]=1&a[__proto__][polluted]=1',
        '%5F%5Fproto%5F%5F[polluted]=1',
        'a[%5F%5Fproto__][polluted]=1',
        'a=__proto__&a[b]=1',
    ];
    for (const query of queries) {
        const result = parseQueryString(query);
        expect(({} as any).polluted).toBe(undefined);
        expect((Object.prototype as any).polluted).toBe(undefined);
        expect(Object.getPrototypeOf(result)).toBe(Object.prototype);
        expect(JSON.stringify(result)).not.toContain('polluted');
        if (result.a) expect(Object.getPrototypeOf(result.a)).toBe(Array.isArray(result.a) ? Array.prototype : Object.prototype);
    }

    expect(parseQueryString('__proto__[polluted]=1&a=1')).toEqual({ a: '1' });
    expect(parseQueryString('a[__proto__][polluted]=1&a[b]=1')).toEqual({ a: { b: '1' } });
    expect(parseQueryString('constructor=1&a=1')).toEqual({ a: '1' });

    // keys of Object.prototype would shadow methods and are dropped
    expect(parseQueryString('toString=1&hasOwnProperty=1&valueOf=1')).toEqual({});
    expect(parseQueryString('a[hasOwnProperty]=1')).toEqual({});
    expect(parseQueryString('a[b]=1&a=hasOwnProperty')).toEqual({ a: { b: '1' } });

    // `prototype` is no property of Object.prototype and harmless as regular key
    const result = parseQueryString('prototype[polluted]=1');
    expect(result).toEqual({ prototype: { polluted: '1' } });
    expect(({} as any).polluted).toBe(undefined);
});

test('router uses query string parser', async () => {
    class Filter {
        name?: string;
        tags?: string[];
        range?: { from: number; to: number };
    }

    class Controller {
        @http.GET('list')
        list(filter: HttpQueries<Filter>, page: HttpQuery<number> = 1) {
            return { filter, page };
        }
    }

    const httpKernel = createHttpKernel([Controller]);
    const response = await httpKernel.request(HttpRequest.GET('/list?name=Peter&tags[]=a&tags[]=b&range[from]=1&range[to]=5&page=2&__proto__[polluted]=1'));
    expect(response.json).toEqual({ filter: { name: 'Peter', tags: ['a', 'b'], range: { from: 1, to: 5 } }, page: 2 });
    expect(({} as any).polluted).toBe(undefined);
});
