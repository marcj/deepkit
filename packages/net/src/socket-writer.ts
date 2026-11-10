import type { Socket } from 'net';

import { createBuffer } from '@deepkit/core';

/** node's queueMicrotask() creates an AsyncResource and a bound function for each call, then() on this one doesn't. */
const resolved = Promise.resolve();

/** Up to this size copying byte by byte is cheaper than creating the view that TypedArray.set() needs. */
const smallCopySize = 128;

/**
 * Collects the messages written in one tick into a single socket write, which is one system call
 * and lets the server read them at once.
 *
 * The kernel copies what it accepts during socket.write(), but node keeps a reference to everything it could not
 * hand over yet, so memory given to write() may only be reused when socket.writableLength is 0 afterwards.
 */
export class SocketWriter {
    private batch: Uint8Array;
    private length: number = 0;
    private scheduled: boolean = false;
    private readonly boundFlush = this.flush.bind(this);
    /**
     * Larger messages go directly to the socket: they take long enough to produce that holding them back
     * only makes the other side wait, and batching saves little in comparison.
     */
    private readonly directSize: number;
    private retained: boolean = false;

    /** Views on the batch by their length, for small batches: node needs a view of the exact length, and sizes repeat. */
    private readonly views: (Uint8Array | undefined)[] = new Array(smallCopySize + 1).fill(undefined);

    constructor(
        private readonly socket: Pick<Socket, 'write' | 'writableLength' | 'destroyed'>,
        private readonly capacity: number = 64 * 1024,
        directSize: number = 1024,
    ) {
        // a Buffer, node wraps a plain Uint8Array into one on every write
        this.batch = createBuffer(capacity);
        this.directSize = Math.min(directSize, capacity >> 1);
    }

    /**
     * Queues bytes to be written in this tick. They are copied, or written directly when large.
     * Returns true if node holds on to the given memory, so the caller must not write to it anymore.
     */
    write(bytes: Uint8Array): boolean {
        if (bytes.byteLength > this.directSize) {
            this.flushBatch();
            this.socket.write(bytes);
            return (this.retained = this.socket.writableLength > 0);
        }

        this.schedule();
        this.retained = false;
        if (this.length + bytes.byteLength > this.capacity) this.flushBatch();
        this.batch.set(bytes, this.length);
        this.length += bytes.byteLength;
        return false;
    }

    /**
     * Same as write(), for the range start to end of a larger buffer. Small messages are copied without
     * creating a view on the buffer. Returns true if node holds on to the given memory.
     */
    writeRange(buffer: Uint8Array, start: number, end: number): boolean {
        const size = end - start;
        if (size > this.directSize) {
            this.flushBatch();
            this.socket.write(buffer.subarray(start, end));
            return (this.retained = this.socket.writableLength > 0);
        }

        this.schedule();
        this.retained = false;
        if (this.length + size > this.capacity) this.flushBatch();
        if (size <= smallCopySize) {
            const batch = this.batch;
            let target = this.length;
            for (let i = start; i < end; i++) batch[target++] = buffer[i];
        } else {
            this.batch.set(buffer.subarray(start, end), this.length);
        }
        this.length += size;
        return false;
    }

    private schedule(): void {
        if (this.scheduled) return;
        this.scheduled = true;
        resolved.then(this.boundFlush);
    }

    /** Not 0 when node holds on to the memory of the last write(), like the property of a socket. */
    get writableLength(): number {
        return this.retained ? 1 : 0;
    }

    /** Writes everything queued and ends the current tick. */
    flush(): void {
        this.scheduled = false;
        this.flushBatch();
    }

    private flushBatch(): void {
        if (this.length === 0) return;
        const length = this.length;
        this.length = 0;
        if (this.socket.destroyed) return;
        this.socket.write(
            length <= smallCopySize ? (this.views[length] ??= this.batch.subarray(0, length)) : this.batch.subarray(0, length),
        );
        if (this.socket.writableLength > 0) {
            this.batch = createBuffer(this.capacity);
            this.views.fill(undefined);
        }
    }
}
