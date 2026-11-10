/**
 * First in, first out queue on a ring buffer. Taking the oldest item is O(1) at any length and does not allocate.
 *
 * Used for replies that arrive in request order, and for waiters of a connection pool.
 */
export class RequestQueue<T> {
    private items: (T | undefined)[];
    private mask: number;
    private head: number = 0;
    private tail: number = 0;

    /**
     * @param capacity Start capacity, a power of two.
     */
    constructor(capacity: number = 16) {
        this.items = new Array(capacity).fill(undefined);
        this.mask = capacity - 1;
    }

    get size(): number {
        return this.tail - this.head;
    }

    push(item: T): void {
        if (this.tail - this.head === this.items.length) this.grow();
        this.items[this.tail++ & this.mask] = item;
    }

    /** Removes and returns the oldest item. */
    shift(): T | undefined {
        if (this.head === this.tail) return undefined;
        const index = this.head++ & this.mask;
        const item = this.items[index];
        this.items[index] = undefined;
        return item;
    }

    /** The item at the position, 0 is the oldest. */
    at(position: number): T | undefined {
        return this.items[(this.head + position) & this.mask];
    }

    /** Removes the item at the position. O(1) for the oldest, otherwise O(n). */
    removeAt(position: number): void {
        if (position === 0) {
            this.shift();
            return;
        }
        for (let i = position; i < this.size - 1; i++) {
            this.items[(this.head + i) & this.mask] = this.items[(this.head + i + 1) & this.mask];
        }
        this.items[--this.tail & this.mask] = undefined;
    }

    /** Removes all items and returns them, oldest first. */
    drain(): T[] {
        const result: T[] = [];
        while (this.size > 0) result.push(this.shift()!);
        return result;
    }

    private grow(): void {
        const size = this.items.length;
        const items = new Array(size * 2).fill(undefined);
        for (let i = 0; i < size; i++) items[i] = this.items[(this.head + i) & this.mask];
        this.items = items;
        this.mask = size * 2 - 1;
        this.head = 0;
        this.tail = size;
    }
}
