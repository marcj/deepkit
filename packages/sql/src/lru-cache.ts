/*
 * Deepkit Framework
 * Copyright (C) 2021 Deepkit UG, Marc J. Schmidt
 *
 * This program is free software: you can redistribute it and/or modify
 * it under the terms of the MIT License.
 *
 * You should have received a copy of the MIT License along with this program.
 */

/**
 * Keeps the most recently used values, the oldest is dropped when it is full.
 */
export class LruCache<T> {
    protected items = new Map<string, T>();
    protected lastKey?: string;

    constructor(
        public readonly maxSize: number,
        protected onEvict?: (key: string, value: T) => void,
    ) {
    }

    get size(): number {
        return this.items.size;
    }

    get(key: string): T | undefined {
        const value = this.items.get(key);
        //the last used key is already the newest
        if (value !== undefined && key !== this.lastKey) {
            this.lastKey = key;
            //a Map iterates in insertion order, so the first key is always the least recently used
            this.items.delete(key);
            this.items.set(key, value);
        }
        return value;
    }

    set(key: string, value: T): void {
        this.items.delete(key);
        this.items.set(key, value);
        this.lastKey = key;
        if (this.items.size <= this.maxSize) return;

        const [oldestKey, oldestValue] = this.items.entries().next().value as [string, T];
        this.items.delete(oldestKey);
        if (oldestKey === this.lastKey) this.lastKey = undefined;
        if (this.onEvict) this.onEvict(oldestKey, oldestValue);
    }

    delete(key: string): void {
        if (key === this.lastKey) this.lastKey = undefined;
        this.items.delete(key);
    }
}
