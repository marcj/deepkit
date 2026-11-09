import { createBuffer } from '@deepkit/core';

import { BSONError } from './model.js';

function readSize(buffer: Uint8Array, offset: number): number {
    return buffer[offset] | (buffer[offset + 1] << 8) | (buffer[offset + 2] << 16) | (buffer[offset + 3] << 24);
}

/**
 * Reads BSON messages from a stream and emits them as Uint8Array.
 *
 * Accepts chunks of any size. A message that is complete within one chunk is emitted without a copy,
 * and a message spread over several chunks is copied only once, when it is complete.
 */
export class BsonStreamReader {
    protected chunks: Uint8Array[] = [];
    protected total: number = 0;

    constructor(
        protected readonly onMessage: (response: Uint8Array) => void,
    ) {
    }

    public emptyBuffer(): boolean {
        return this.total === 0;
    }

    public feed(data: Uint8Array, bytes?: number) {
        if (!data.byteLength) return;
        const length = bytes || data.byteLength;

        if (this.total === 0) {
            let offset = 0;
            while (offset + 4 <= length) {
                const size = readSize(data, offset);
                if (size <= 0) throw new BSONError('message size wrong');
                if (offset + size > length) break;
                this.onMessage(offset === 0 && size === data.byteLength ? data : data.subarray(offset, offset + size));
                offset += size;
            }
            if (offset < length) {
                this.chunks.push(offset === 0 && length === data.byteLength ? data : data.subarray(offset, length));
                this.total = length - offset;
            }
            return;
        }

        this.chunks.push(length === data.byteLength ? data : data.subarray(0, length));
        this.total += length;

        while (this.total >= 4) {
            const size = this.peekSize();
            if (size <= 0) throw new BSONError('message size wrong');
            if (this.total < size) return;
            this.onMessage(this.consume(size));
        }
    }

    protected peekSize(): number {
        const first = this.chunks[0];
        if (first.byteLength >= 4) return readSize(first, 0);

        const header = new Uint8Array(4);
        let copied = 0;
        for (const chunk of this.chunks) {
            for (let i = 0; i < chunk.byteLength && copied < 4; i++) header[copied++] = chunk[i];
            if (copied === 4) break;
        }
        return readSize(header, 0);
    }

    protected consume(size: number): Uint8Array {
        this.total -= size;
        const first = this.chunks[0];
        if (first.byteLength >= size) {
            if (first.byteLength === size) {
                this.chunks.shift();
                return first;
            }
            this.chunks[0] = first.subarray(size);
            return first.subarray(0, size);
        }

        //the same type as the chunks of a socket, a mix of both makes all element access slower
        const result = createBuffer(size);
        let written = 0;
        let index = 0;
        while (written < size) {
            const chunk = this.chunks[index];
            const toCopy = Math.min(size - written, chunk.byteLength);
            result.set(toCopy === chunk.byteLength ? chunk : chunk.subarray(0, toCopy), written);
            written += toCopy;
            if (toCopy === chunk.byteLength) {
                index++;
            } else {
                this.chunks[index] = chunk.subarray(toCopy);
            }
        }
        this.chunks.splice(0, index);
        return result;
    }
}
