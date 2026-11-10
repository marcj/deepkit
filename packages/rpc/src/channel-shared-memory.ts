/*
 * Deepkit Framework
 * Copyright (C) 2021 Deepkit UG, Marc J. Schmidt
 *
 * This program is free software: you can redistribute it and/or modify
 * it under the terms of the MIT License.
 *
 * You should have received a copy of the MIT License along with this program.
 */
import { RpcChannel } from './channel.js';
import { RpcError } from './model.js';
import { BinarySocket } from './transport.js';

/*
 * Memory layout: two rings, one per direction, each a header followed by the data.
 * The data is a sequence of records [length uint32 little endian][bytes], a record of length 0 ends the connection.
 * The indices count bytes and run freely, the position in the ring is index & (capacity - 1).
 * Write and read index are on their own cache lines.
 */
const headerInts = 64;
const headerBytes = headerInts * 4;
/** bytes published by the writer */
const writeIndex = 0;
/** 1 while the reader waits for writeIndex to change */
const readerSleeping = 1;
/** bytes consumed by the reader */
const readIndex = 32;
/** 1 while the writer waits for readIndex to change */
const writerWaiting = 33;
const recordHeader = 4;

function noop() {}

/**
 * A wait ends after this many milliseconds and checks the indices again, so that a wake-up that got lost (it
 * happened rarely in tests, in jest's own V8 context) costs this time instead of the connection.
 */
const waitTimeout = 50;

/** Up to this size copying byte by byte is cheaper than creating the view that TypedArray.set() needs. */
const smallCopySize = 128;

/** setImmediate of node, polling is not supported without it */
const scheduleImmediate: ((callback: () => void) => unknown) | undefined = (globalThis as any).setImmediate;

/** node's queueMicrotask() creates an AsyncResource and a bound function for each call, then() on this one doesn't. */
const resolved = Promise.resolve();

/**
 * Creates the shared memory for createSharedMemoryChannel(). Pass it to the other thread, for example as
 * `workerData` or with postMessage().
 *
 * @param capacity bytes of each direction, a power of two. Larger messages are sent in parts.
 */
export function createRpcSharedMemory(capacity: number = 1024 * 1024): SharedArrayBuffer {
    if (capacity < 1024 || (capacity & (capacity - 1)) !== 0) {
        throw new RpcError('Capacity of the shared memory has to be a power of two of at least 1024');
    }
    return new SharedArrayBuffer(2 * (headerBytes + capacity));
}

class Ring {
    readonly header: Int32Array;
    readonly data: Uint8Array;
    readonly capacity: number;
    readonly mask: number;

    constructor(memory: SharedArrayBuffer, index: number) {
        this.capacity = memory.byteLength / 2 - headerBytes;
        this.mask = this.capacity - 1;
        const offset = index * (headerBytes + this.capacity);
        this.header = new Int32Array(memory, offset, headerInts);
        this.data = new Uint8Array(memory, offset + headerBytes, this.capacity);
    }
}

export interface SharedMemoryChannelOptions {
    /**
     * How long the receiving side polls for new data, in each turn of the event loop, before it goes to sleep, in
     * microseconds. An answer that arrives meanwhile is read right away instead of after a wake-up of the thread,
     * which takes 20-30µs. The core is busy while polling. Only in node, 0 disables it. Default 100.
     */
    spin?: number;
}

type WaitAsync = (
    array: Int32Array,
    index: number,
    value: number,
    timeout?: number,
) => { async: boolean; value: Promise<string> | string };

/**
 * A channel between two threads over shared memory, without messages: the sender copies the frames directly into
 * a ring buffer, the receiver reads them from there. It's the fastest channel between threads, in node's
 * `worker_threads` as in the browser's Web Workers. In the browser, SharedArrayBuffer needs a page with
 * cross-origin isolation (the headers `Cross-Origin-Opener-Policy: same-origin` and
 * `Cross-Origin-Embedder-Policy: require-corp`), and both sides need `Atomics.waitAsync`.
 *
 * ```typescript
 * // main thread
 * const memory = createRpcSharedMemory();
 * const worker = new Worker('./server.js', { workerData: { memory } });
 * const client = new RpcClient(new RpcChannelClientAdapter(createSharedMemoryChannel(memory, 'client')));
 *
 * // worker
 * serveRpcChannel(kernel, createSharedMemoryChannel(workerData.memory, 'server'));
 * ```
 *
 * The memory doesn't tell when the other thread ends: call close() of the channel then, for example on the
 * `exit` event of the worker.
 */
export class SharedMemoryChannel implements RpcChannel {
    readonly name = 'shared-memory';
    readonly binarySocket: BinarySocket;

    protected out: Ring;
    protected in: Ring;
    protected writer: SharedMemoryWriter;

    protected onData?: (data: Uint8Array, bytes?: number) => void;
    protected onEnd?: (reason: string) => void;
    protected listening = false;
    protected waiting = false;
    protected reading = false;
    protected closed = false;
    /** A pending Atomics.waitAsync doesn't keep node running, like a socket does. */
    protected keepAlive?: ReturnType<typeof setInterval>;
    /** The records are copied into this buffer before they are read: TextDecoder rejects views of shared memory. */
    protected buffer: Uint8Array;
    protected readonly spin: number;
    protected spinUntil = 0;
    protected readonly waitAsync: WaitAsync;
    protected readonly boundRead = this.read.bind(this);
    /** Nothing arrived during the last wait: no polling until something does. */
    protected idle = false;
    protected readonly boundWoken = (result: string) => {
        this.idle = result === 'timed-out';
        this.read();
    };

    constructor(memory: SharedArrayBuffer, side: 'client' | 'server', options: SharedMemoryChannelOptions = {}) {
        const waitAsync = (Atomics as any).waitAsync as WaitAsync | undefined;
        if (!waitAsync) throw new RpcError('Shared memory channel needs Atomics.waitAsync');
        this.waitAsync = waitAsync;
        const clientToServer = new Ring(memory, 0);
        const serverToClient = new Ring(memory, 1);
        this.out = side === 'client' ? clientToServer : serverToClient;
        this.in = side === 'client' ? serverToClient : clientToServer;
        this.writer = new SharedMemoryWriter(this.out, waitAsync);
        this.binarySocket = this.writer;
        this.spin = options.spin ?? 100;
        this.buffer = createReadBuffer(64 * 1024);
    }

    send(data: Uint8Array): void {
        this.writer.writeRange(data, 0, data.byteLength);
    }

    end(): void {
        this.writer.end();
    }

    listen(onData: (data: Uint8Array, bytes?: number) => void, onEnd: (reason: string) => void): () => void {
        this.onData = onData;
        this.onEnd = onEnd;
        this.listening = true;
        this.keepAlive ??= setInterval(noop, 1 << 30);
        if (!this.waiting && !this.reading) this.read();
        return () => {
            this.stopKeepAlive();
            this.listening = false;
            this.onData = undefined;
            this.onEnd = undefined;
        };
    }

    /** Ends listening and the current connection, when the other thread is gone. */
    close(): void {
        if (this.closed) return;
        this.closed = true;
        this.writer.closed = true;
        const onEnd = this.onEnd;
        this.stopKeepAlive();
        this.listening = false;
        // wakes up the waiting read, which then stops
        Atomics.add(this.in.header, writeIndex, 0);
        Atomics.notify(this.in.header, writeIndex);
        onEnd?.('channel closed');
    }

    protected stopKeepAlive(): void {
        if (this.keepAlive === undefined) return;
        clearInterval(this.keepAlive);
        this.keepAlive = undefined;
    }

    protected read(): void {
        this.waiting = false;
        if (this.closed || this.reading) return;
        this.reading = true;
        try {
            this.readRecords();
        } finally {
            this.reading = false;
        }
    }

    protected readRecords(): void {
        const ring = this.in;
        const header = ring.header;
        while (this.listening) {
            let read = Atomics.load(header, readIndex);
            const written = Atomics.load(header, writeIndex);
            if (written === read) {
                if (this.spin > 0 && !this.idle && scheduleImmediate) {
                    // polls in the next turns of the event loop: the thread can answer and send meanwhile
                    const now = performance.now();
                    if (this.spinUntil === 0) this.spinUntil = now + this.spin / 1000;
                    if (now < this.spinUntil) {
                        this.waiting = true;
                        scheduleImmediate(this.boundRead);
                        return;
                    }
                }
                this.spinUntil = 0;
                Atomics.store(header, readerSleeping, 1);
                const result = this.waitAsync(header, writeIndex, written, waitTimeout);
                if (result.async) {
                    this.waiting = true;
                    (result.value as Promise<string>).then(this.boundWoken);
                    return;
                }
                // written in the meantime
                Atomics.store(header, readerSleeping, 0);
                continue;
            }
            Atomics.store(header, readerSleeping, 0);
            this.spinUntil = 0;
            this.idle = false;

            // all records published so far
            while (read !== written && this.listening) {
                const length = readUint32(ring, read);
                read = (read + recordHeader) | 0;
                if (length === 0) {
                    this.consumed(read);
                    this.onEnd!('ended');
                    continue;
                }
                const buffer = this.copyOut(ring, read, length);
                read = (read + length) | 0;
                // consumed before it is read: the writer can continue meanwhile
                this.consumed(read);
                this.onData!(buffer, length);
            }
        }
    }

    protected consumed(read: number): void {
        const header = this.in.header;
        Atomics.store(header, readIndex, read);
        if (Atomics.load(header, writerWaiting) === 1) Atomics.notify(header, readIndex);
    }

    protected copyOut(ring: Ring, index: number, length: number): Uint8Array {
        if (this.buffer.byteLength < length)
            this.buffer = createReadBuffer(Math.max(length, this.buffer.byteLength * 2));
        const buffer = this.buffer;
        const start = index & ring.mask;
        const first = Math.min(length, ring.capacity - start);
        buffer.set(ring.data.subarray(start, start + first), 0);
        if (first < length) buffer.set(ring.data.subarray(0, length - first), first);
        return buffer;
    }
}

/** A Buffer in node: strings are decoded faster from it. */
function createReadBuffer(size: number): Uint8Array {
    return 'undefined' !== typeof Buffer ? Buffer.allocUnsafeSlow(size) : new Uint8Array(size);
}

function readUint32(ring: Ring, index: number): number {
    const data = ring.data;
    const mask = ring.mask;
    return (
        (data[index & mask] |
            (data[(index + 1) & mask] << 8) |
            (data[(index + 2) & mask] << 16) |
            (data[(index + 3) & mask] << 24)) >>>
        0
    );
}

function writeUint32(ring: Ring, index: number, value: number): void {
    const data = ring.data;
    const mask = ring.mask;
    data[index & mask] = value;
    data[(index + 1) & mask] = value >>> 8;
    data[(index + 2) & mask] = value >>> 16;
    data[(index + 3) & mask] = value >>> 24;
}

/**
 * Writes the frames of one tick as one record directly into the ring. What doesn't fit waits as records in a
 * local buffer until the reader made room, and everything written after it waits behind it.
 */
class SharedMemoryWriter implements BinarySocket {
    readonly writableLength = 0;
    closed = false;

    /** bytes of the open record, behind the published write index and the record header */
    protected pending = 0;
    protected scheduled = false;
    protected waiting = false;
    /** records that didn't fit into the ring, [length][bytes], length 0 is an end */
    protected overflow?: Uint8Array;
    protected overflowLength = 0;
    /** start of the last record in the overflow, -1 if it's an end or there is none */
    protected lastRecord = -1;
    protected readonly boundFlush = this.flush.bind(this);
    protected readonly boundWritten = this.written.bind(this);

    constructor(
        protected ring: Ring,
        protected waitAsync: WaitAsync,
    ) {}

    write(buffer: Uint8Array): void {
        this.writeRange(buffer, 0, buffer.byteLength);
    }

    writeRange(buffer: Uint8Array, start: number, end: number): void {
        if (this.closed) return;
        const size = end - start;
        if (!this.scheduled) {
            this.scheduled = true;
            resolved.then(this.boundFlush);
        }
        if (this.overflowLength === 0) {
            const ring = this.ring;
            const header = ring.header;
            const written = Atomics.load(header, writeIndex);
            const free = ring.capacity - ((written - Atomics.load(header, readIndex)) | 0);
            if (recordHeader + this.pending + size <= free) {
                const target = (written + recordHeader + this.pending) & ring.mask;
                const first = Math.min(size, ring.capacity - target);
                if (first === size && size <= smallCopySize) {
                    // without the views TypedArray.set() needs
                    const data = ring.data;
                    for (let i = 0; i < size; i++) data[target + i] = buffer[start + i];
                } else {
                    ring.data.set(buffer.subarray(start, start + first), target);
                    if (first < size) ring.data.set(buffer.subarray(start + first, end), 0);
                }
                this.pending += size;
                return;
            }
        }
        // appended to the last record of the overflow
        if (this.lastRecord === -1) {
            this.lastRecord = this.overflowLength;
            this.reserve(recordHeader);
            this.setOverflowLength(this.lastRecord, 0);
            this.overflowLength += recordHeader;
        }
        this.reserve(size);
        this.overflow!.set(buffer.subarray(start, end), this.overflowLength);
        this.overflowLength += size;
        this.setOverflowLength(this.lastRecord, this.overflowLength - this.lastRecord - recordHeader);
    }

    end(): void {
        if (this.closed) return;
        this.flush();
        if (this.overflowLength === 0 && this.publish(0)) return;
        this.reserve(recordHeader);
        this.setOverflowLength(this.overflowLength, 0);
        this.overflowLength += recordHeader;
        this.lastRecord = -1;
        this.waitForSpace();
    }

    flush(): void {
        this.scheduled = false;
        if (this.pending > 0) {
            // there is room for it, the reader only makes more
            const ring = this.ring;
            const written = Atomics.load(ring.header, writeIndex);
            writeUint32(ring, written, this.pending);
            this.publishIndex((written + recordHeader + this.pending) | 0);
            this.pending = 0;
        }
        if (this.overflowLength > 0) this.writeOverflow();
    }

    /** Publishes a record of the given size whose bytes are already in the ring (or an end with 0). */
    protected publish(size: number): boolean {
        const ring = this.ring;
        const written = Atomics.load(ring.header, writeIndex);
        const free = ring.capacity - ((written - Atomics.load(ring.header, readIndex)) | 0);
        if (recordHeader + size > free) return false;
        writeUint32(ring, written, size);
        this.publishIndex((written + recordHeader + size) | 0);
        return true;
    }

    protected publishIndex(index: number): void {
        const header = this.ring.header;
        Atomics.store(header, writeIndex, index);
        if (Atomics.load(header, readerSleeping) === 1) Atomics.notify(header, writeIndex);
    }

    protected reserve(size: number): void {
        if (this.overflow && this.overflow.byteLength >= this.overflowLength + size) return;
        const next = new Uint8Array(Math.max(64 * 1024, (this.overflowLength + size) * 2));
        if (this.overflow) next.set(this.overflow.subarray(0, this.overflowLength));
        this.overflow = next;
    }

    protected setOverflowLength(offset: number, length: number): void {
        const overflow = this.overflow!;
        overflow[offset] = length;
        overflow[offset + 1] = length >>> 8;
        overflow[offset + 2] = length >>> 16;
        overflow[offset + 3] = length >>> 24;
    }

    /** Writes as many records of the overflow as fit, splits the record that doesn't, and waits for the reader for the rest. */
    protected writeOverflow(): void {
        if (this.closed) return;
        const ring = this.ring;
        const header = ring.header;
        const overflow = this.overflow!;
        let offset = 0;
        while (offset < this.overflowLength) {
            const length =
                (overflow[offset] |
                    (overflow[offset + 1] << 8) |
                    (overflow[offset + 2] << 16) |
                    (overflow[offset + 3] << 24)) >>>
                0;
            const written = Atomics.load(header, writeIndex);
            const free = ring.capacity - ((written - Atomics.load(header, readIndex)) | 0) - recordHeader;
            if (length === 0) {
                if (free < 0) break;
                writeUint32(ring, written, 0);
                this.publishIndex((written + recordHeader) | 0);
                offset += recordHeader;
                continue;
            }
            const size = Math.min(length, free);
            if (size <= 0) break;
            const from = offset + recordHeader;
            const target = (written + recordHeader) & ring.mask;
            const first = Math.min(size, ring.capacity - target);
            ring.data.set(overflow.subarray(from, from + first), target);
            if (first < size) ring.data.set(overflow.subarray(from + first, from + size), 0);
            writeUint32(ring, written, size);
            this.publishIndex((written + recordHeader + size) | 0);
            if (size < length) {
                // the rest stays as record, its header goes over bytes already written
                offset += size;
                this.setOverflowLength(offset, length - size);
                break;
            }
            offset = from + size;
        }
        if (offset > 0) {
            overflow.copyWithin(0, offset, this.overflowLength);
            this.overflowLength -= offset;
            if (this.lastRecord !== -1) this.lastRecord -= offset;
            if (this.lastRecord < 0) this.lastRecord = -1;
        }
        if (this.overflowLength === 0) {
            this.lastRecord = -1;
            // a large overflow is not kept
            if (overflow.byteLength > 1024 * 1024) this.overflow = undefined;
            return;
        }
        this.waitForSpace();
    }

    protected waitForSpace(): void {
        if (this.waiting || this.closed) return;
        const header = this.ring.header;
        const read = Atomics.load(header, readIndex);
        Atomics.store(header, writerWaiting, 1);
        const result = this.waitAsync(header, readIndex, read, waitTimeout);
        this.waiting = true;
        if (!result.async) {
            this.written();
            return;
        }
        (result.value as Promise<string>).then(this.boundWritten);
    }

    protected written(): void {
        this.waiting = false;
        Atomics.store(this.ring.header, writerWaiting, 0);
        this.writeOverflow();
    }
}

export function createSharedMemoryChannel(
    memory: SharedArrayBuffer,
    side: 'client' | 'server',
    options?: SharedMemoryChannelOptions,
): SharedMemoryChannel {
    return new SharedMemoryChannel(memory, side, options);
}
