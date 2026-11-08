import { expect, test } from '@jest/globals';

import { reflect } from '../../src/reflection/reflection.js';
import { ReflectionKind } from '../../src/reflection/type.js';

//https://github.com/marcj/deepkit/issues/725
test('control: a method with a different name reads the outer variable', () => {
    const pending = new Map<string, number>([['a', 1]]);
    const tracker = {
        list(): string[] {
            return [...pending.keys()];
        },
    };
    expect(tracker.list()).toEqual(['a']);
});

test('method body sees the outer variable of the same name', () => {
    const pending = new Map<string, number>([['a', 1]]);
    const tracker = {
        pending(): string[] {
            return [...pending.keys()];
        },
    };
    expect(tracker.pending()).toEqual(['a']);
});

test('async method body sees the outer variable of the same name', async () => {
    const load = () => 'loaded';
    const service = {
        async load(): Promise<string> {
            return load();
        },
    };
    await expect(service.load()).resolves.toBe('loaded');
});

test('control: a method keeps its name', () => {
    const tracker = {
        pending(): void {},
    };
    expect(tracker.pending.name).toBe('pending');
});

test('parameter default and generator see the outer variable of the same name', () => {
    const limit = 3;
    const items = [1, 2];
    const config = {
        limit(value: number = limit): number {
            return value;
        },
        *items(): Generator<number> {
            yield* items;
        },
    };
    expect(config.limit()).toBe(3);
    expect([...config.items()]).toEqual([1, 2]);
});

test('a method that shadowed an outer variable keeps its name and type', () => {
    const pending = 1;
    const tracker = {
        pending(a: string): number {
            return pending + a.length;
        },
    };
    expect(tracker.pending.name).toBe('pending');
    expect(tracker.pending('ab')).toBe(3);
    expect(reflect(tracker.pending)).toMatchObject({ kind: ReflectionKind.function, name: 'pending', return: { kind: ReflectionKind.number } });
});
