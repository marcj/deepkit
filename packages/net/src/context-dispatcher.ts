import { NetError } from './error.js';

export type ContextCallback = (message: Uint8Array) => void;

function noop(): void {}

/**
 * Matches replies to requests by an id that travels on the wire, for protocols that may answer out of order.
 *
 * Ids are small and reused. A slot must only be released when the remote side will not answer on it anymore,
 * otherwise a late reply arrives at the next owner of that id.
 */
export class ContextDispatcher<T extends (...args: any[]) => void = ContextCallback> {
    private contexts: T[] = [];
    private freeSlots: number[] = [];
    private currentSlot = 1;

    /**
     * @param maxContexts The largest id, by default what fits in the 16 bit id of the RPC protocol.
     */
    constructor(private readonly maxContexts: number = 0xffff) {
        this.grow(64);
    }

    private grow(size: number): void {
        for (let i = this.contexts.length; i < size; i++) this.contexts.push(noop as T);
    }

    /** How many ids are taken. */
    get active(): number {
        return this.currentSlot - 1 - this.freeSlots.length;
    }

    /** The id the next create() returns. */
    current(): number {
        const free = this.freeSlots.length;
        return free ? this.freeSlots[free - 1] : this.currentSlot;
    }

    create(callback: T): number {
        const id = this.freeSlots.length ? this.freeSlots.pop()! : this.currentSlot++;
        if (id > this.maxContexts) {
            this.currentSlot--;
            throw new NetError(`Too many active contexts (${this.maxContexts})`);
        }
        if (id >= this.contexts.length) this.grow(this.contexts.length * 2);
        this.contexts[id] = callback;
        return id;
    }

    get(id: number): T {
        return this.contexts[id];
    }

    /** Replaces the callback of an active id. */
    set(id: number, callback: T): void {
        this.contexts[id] = callback;
    }

    dispatch(id: number, ...args: Parameters<T>): void {
        this.contexts[id](...args);
    }

    release(id: number): void {
        this.contexts[id] = noop as T;
        this.freeSlots.push(id);
    }
}

/**
 * A context dispatcher handing out ids in ascending order, so that the other side can know the next id without it
 * being sent. Ids wrap within a window that only grows with the number of active contexts, which keeps the slots
 * small. The caller detects a wrap or skipped id by comparing with the id it expected.
 */
export class SequentialContextDispatcher<T extends (...args: any[]) => void = ContextCallback> {
    private contexts: T[] = [];
    private next = 1;
    private window: number;

    /** How many ids are taken. */
    public active = 0;

    constructor(
        private readonly maxContexts: number = 0xffff,
        initialWindow: number = 1024,
    ) {
        this.window = Math.min(initialWindow, maxContexts);
        this.grow();
    }

    private grow(): void {
        for (let i = this.contexts.length; i <= this.window; i++) this.contexts.push(noop as T);
    }

    /** The id the next create() returns, if it isn't taken. */
    current(): number {
        return this.next > this.window ? 1 : this.next;
    }

    create(callback: T): number {
        let id = this.next > this.window ? 1 : this.next;
        if (this.contexts[id] !== noop) id = this.findFree(id);
        this.contexts[id] = callback;
        this.next = id + 1;
        this.active++;
        return id;
    }

    private findFree(from: number): number {
        if (this.active * 2 >= this.window && this.window < this.maxContexts) {
            this.window = Math.min(this.window * 2, this.maxContexts);
            this.grow();
        }
        for (let id = from + 1; id <= this.window; id++) if (this.contexts[id] === noop) return id;
        for (let id = 1; id < from; id++) if (this.contexts[id] === noop) return id;
        throw new NetError(`Too many active contexts (${this.maxContexts})`);
    }

    get(id: number): T {
        return this.contexts[id];
    }

    set(id: number, callback: T): void {
        this.contexts[id] = callback;
    }

    release(id: number): void {
        if (this.contexts[id] === noop) return;
        this.contexts[id] = noop as T;
        this.active--;
    }
}
