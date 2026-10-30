import { observeChanges } from './state';

class Nested {
    n = 1;
    list: number[] = [1, 2];

    inc() {
        this.n++;
    }
}

class TestState {
    shop = 0;
    media = { view: 'icons' };
    items = [{ id: 1 }, { id: 2 }];
    nested = new Nested();
    date = new Date(2020, 0, 1);
    map = new Map<string, { x: number }>([['a', { x: 1 }]]);
    set = new Set<number>([1]);
    volatile = { files: [] as number[] };
    frozen = Object.freeze({ a: 1 });
}

describe('observeChanges', () => {
    function changes(fn: (state: TestState) => void): number {
        let count = 0;
        const state = observeChanges(new TestState(), () => count++, ['volatile']);
        fn(state);
        return count;
    }

    it('reports property changes', () => {
        expect(changes(s => (s.shop = 1))).toBe(1);
        expect(changes(s => (s.shop = 0))).toBe(0);
        expect(changes(s => (s.media.view = 'list'))).toBe(1);
        expect(changes(s => (s.media.view = 'icons'))).toBe(0);
        expect(changes(s => (s.media = { view: 'icons' }))).toBe(1);
        expect(changes(s => delete (s as any).shop)).toBe(1);
        expect(changes(s => delete (s as any).nope)).toBe(0);
        expect(changes(s => s.nested.inc())).toBe(1);
    });

    it('reports array changes', () => {
        expect(changes(s => s.items.push({ id: 3 }))).toBeGreaterThan(0);
        expect(changes(s => s.items.splice(0, 1))).toBeGreaterThan(0);
        expect(changes(s => (s.items[0].id = 5))).toBe(1);
        expect(changes(s => s.nested.list.push(3))).toBeGreaterThan(0);
        expect(changes(s => s.items.map(v => v.id))).toBe(0);
    });

    it('reports changes of built-ins', () => {
        expect(changes(s => s.date.setFullYear(2021))).toBe(1);
        expect(changes(s => s.date.getTime())).toBe(0);
        expect(changes(s => s.map.set('b', { x: 2 }))).toBe(1);
        expect(changes(s => (s.map.get('a')!.x = 2))).toBe(1);
        expect(changes(s => s.map.size)).toBe(0);
        expect(changes(s => s.set.add(2))).toBe(1);
        expect(changes(s => s.set.has(1))).toBe(0);
    });

    it('ignores keys', () => {
        expect(changes(s => s.volatile.files.push(1))).toBe(0);
        expect(changes(s => (s.volatile = { files: [] }))).toBe(0);
    });

    it('keeps identity and type', () => {
        const state = observeChanges(new TestState(), () => undefined);
        expect(state instanceof TestState).toBe(true);
        expect(state.date instanceof Date).toBe(true);
        expect(state.media).toBe(state.media);
        expect(state.frozen.a).toBe(1);
        const raw = new TestState();
        const proxy = observeChanges(raw, () => undefined);
        proxy.media = proxy.items as any;
        expect(raw.media).toBe(raw.items as any);
    });
});
