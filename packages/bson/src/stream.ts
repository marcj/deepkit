import { AutoBuffer, AutoBufferSerializerState } from './bson-serializer.js';
import { BSONError } from './model.js';

function readSize(buffer: Uint8Array, offset: number): number {
    return buffer[offset] | (buffer[offset + 1] << 8) | (buffer[offset + 2] << 16) | (buffer[offset + 3] << 24);
}

/**
 * Reads BSON messages from a stream and emits them as Uint8Array.
 *
 * Accepts chunks of any size. A message that is complete within one chunk is emitted without a copy.
 * A message spread over several chunks is copied once into a buffer that is reused for the next such message,
 * so the emitted array is only valid during the callback. Copy it to keep it.
 */
export class BsonStreamReader {
    protected chunks: Uint8Array[] = [];
    protected total: number = 0;
    protected spanning?: AutoBuffer;

    /**
     * Skips the bytes when they don't fit yet, AutoBuffer then calls this again with a large enough buffer.
     */
    protected copyChunks = (size: number, state: AutoBufferSerializerState): void => {
        const writer = state.writer!;
        if (size <= writer.buffer.byteLength) {
            let written = 0;
            for (let index = 0; written < size; index++) {
                const chunk = this.chunks[index];
                const toCopy = Math.min(size - written, chunk.byteLength);
                writer.buffer.set(toCopy === chunk.byteLength ? chunk : chunk.subarray(0, toCopy), written);
                written += toCopy;
            }
        }
        writer.offset += size;
    };

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

        let size = 0;
        let copied = 0;
        for (const chunk of this.chunks) {
            for (let i = 0; i < chunk.byteLength && copied < 4; i++) size |= chunk[i] << (copied++ * 8);
            if (copied === 4) break;
        }
        return size;
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

        const spanning = (this.spanning ??= new AutoBuffer());
        spanning.apply(this.copyChunks, size);

        let remaining = size;
        let index = 0;
        while (remaining > 0) {
            const chunk = this.chunks[index];
            if (chunk.byteLength <= remaining) {
                remaining -= chunk.byteLength;
                index++;
            } else {
                this.chunks[index] = chunk.subarray(remaining);
                remaining = 0;
            }
        }
        this.chunks.splice(0, index);
        return spanning.buffer;
    }
}
