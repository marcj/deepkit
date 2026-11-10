import { NetError } from './error.js';

/**
 * Receives a complete message. It is the range start to end of buffer, and only valid during this call:
 * buffer is reused afterwards.
 */
export type FrameCallback = (buffer: Uint8Array, start: number, end: number) => void;

export interface FrameReaderOptions {
    /** Start size of the buffer for messages spread over several chunks. */
    initialSize?: number;
    /** A larger reassembly buffer is released after the message that needed it. */
    maxRetainedSize?: number;
    /** A message announcing more than this is a protocol error. */
    maxFrameSize?: number;
}

/**
 * Splits a byte stream into messages. Complete messages in a chunk are passed on as range without copying or
 * allocating, messages spread over several chunks are collected in one reused buffer.
 *
 * Protocols implement feed() themselves with the header read inline, as a shared loop calling a decoder function
 * is about twice as slow per message as soon as a process uses more than one protocol.
 */
export abstract class FrameReader {
    protected tail: Uint8Array;
    protected tailLength: number = 0;
    /** Total size of the message in tail, 0 while its header is incomplete. */
    protected frameLength: number = 0;
    private readonly smallTail: Uint8Array;
    private readonly maxRetainedSize: number;
    private readonly maxFrameSize: number;

    constructor(
        protected onFrame: FrameCallback,
        options: FrameReaderOptions = {},
    ) {
        this.tail = this.smallTail = new Uint8Array(options.initialSize ?? 64 * 1024);
        this.maxRetainedSize = options.maxRetainedSize ?? 1024 * 1024;
        this.maxFrameSize = options.maxFrameSize ?? 1024 * 1024 * 1024;
    }

    /** Bytes of the header that are needed to know the size of a message. */
    protected abstract readonly headerSize: number;

    /** The size of the message at offset, including its header. */
    protected abstract frameSize(buffer: Uint8Array, offset: number): number;

    /** Feeds a chunk. It is not used anymore after the call returns. */
    abstract feed(buffer: Uint8Array, length?: number): void;

    emptyBuffer(): boolean {
        return this.tailLength === 0;
    }

    protected checkedFrameSize(buffer: Uint8Array, offset: number): number {
        const size = this.frameSize(buffer, offset);
        if (size < this.headerSize || size > this.maxFrameSize) throw new NetError(`Invalid message size ${size}`);
        return size;
    }

    /** Keeps the incomplete rest of a chunk. */
    protected stash(buffer: Uint8Array, offset: number, length: number): void {
        const rest = length - offset;
        if (rest >= this.headerSize) {
            this.frameLength = this.checkedFrameSize(buffer, offset);
            this.ensure(this.frameLength);
        } else {
            this.frameLength = 0;
        }
        for (let i = 0; i < rest && rest < 32; i++) this.tail[i] = buffer[offset + i];
        if (rest >= 32) this.tail.set(buffer.subarray(offset, length));
        this.tailLength = rest;
    }

    /**
     * Continues the message in tail with the start of a chunk and emits it when complete.
     * Returns the offset of the first byte that was not used.
     */
    protected fill(buffer: Uint8Array, length: number): number {
        let offset = 0;
        if (this.frameLength === 0) {
            while (this.tailLength < this.headerSize && offset < length)
                this.tail[this.tailLength++] = buffer[offset++];
            if (this.tailLength < this.headerSize) return offset;
            this.frameLength = this.checkedFrameSize(this.tail, 0);
            this.ensure(this.frameLength);
        }

        const take = Math.min(this.frameLength - this.tailLength, length - offset);
        if (take > 0) {
            this.tail.set(
                take === buffer.byteLength ? buffer : buffer.subarray(offset, offset + take),
                this.tailLength,
            );
            this.tailLength += take;
            offset += take;
        }

        if (this.tailLength === this.frameLength) {
            const end = this.frameLength;
            this.tailLength = 0;
            this.frameLength = 0;
            this.onFrame(this.tail, 0, end);
            if (this.tail.byteLength > this.maxRetainedSize) this.tail = this.smallTail;
        }
        return offset;
    }

    private ensure(size: number): void {
        if (size <= this.tail.byteLength) return;
        let capacity = this.tail.byteLength;
        while (capacity < size) capacity *= 2;
        const tail = new Uint8Array(capacity);
        if (this.tailLength) tail.set(this.tail.subarray(0, this.tailLength));
        this.tail = tail;
    }
}

/**
 * Messages starting with their total size as signed 32 bit little endian: BSON, MongoDB and RPC.
 */
export class Int32LEFrameReader extends FrameReader {
    protected readonly headerSize = 4;

    protected frameSize(buffer: Uint8Array, offset: number): number {
        return buffer[offset] | (buffer[offset + 1] << 8) | (buffer[offset + 2] << 16) | (buffer[offset + 3] << 24);
    }

    feed(buffer: Uint8Array, length: number = buffer.byteLength): void {
        let offset = 0;
        if (this.tailLength > 0) {
            offset = this.fill(buffer, length);
            if (this.tailLength > 0) return;
        }

        while (length - offset >= 4) {
            const size =
                buffer[offset] | (buffer[offset + 1] << 8) | (buffer[offset + 2] << 16) | (buffer[offset + 3] << 24);
            if (size < 4) throw new NetError(`Invalid message size ${size}`);
            if (offset + size > length) break;
            this.onFrame(buffer, offset, offset + size);
            offset += size;
        }

        if (offset < length) this.stash(buffer, offset, length);
    }
}
