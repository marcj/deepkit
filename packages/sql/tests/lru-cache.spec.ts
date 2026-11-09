import { expect, test } from '@jest/globals';

import { LruCache } from '../src/lru-cache.js';

function filled() {
    const evicted: string[] = [];
    const cache = new LruCache<number>(2, key => evicted.push(key));
    return { cache, evicted };
}

test('the least recently used is evicted', () => {
    const { cache, evicted } = filled();
    cache.set('a', 1);
    cache.set('b', 2);
    expect(cache.get('a')).toBe(1);
    cache.set('c', 3);
    expect(evicted).toEqual(['b']);
});

test('reading the same key twice keeps the order', () => {
    const { cache, evicted } = filled();
    cache.set('a', 1);
    cache.set('b', 2);
    cache.get('a');
    cache.get('a');
    cache.get('b');
    cache.get('b');
    cache.set('c', 3);
    expect(evicted).toEqual(['a']);
});

test('a key that was deleted and set again is the newest', () => {
    const { cache, evicted } = filled();
    cache.set('a', 1);
    cache.set('b', 2);
    cache.delete('b');
    cache.set('c', 3);
    cache.set('b', 2);
    expect(evicted).toEqual(['a']);
    expect(cache.get('b')).toBe(2);
});

test('an evicted last key is forgotten', () => {
    const cache = new LruCache<number>(1);
    cache.set('a', 1);
    cache.set('b', 2);
    expect(cache.get('a')).toBe(undefined);
    expect(cache.get('b')).toBe(2);
});
