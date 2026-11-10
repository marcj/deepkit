import { FrameCallback, FrameReader, NetError } from '@deepkit/net';

/** What is called directly for the messages of a running query, each of them a monomorphic call the JIT can inline. */
export interface PostgresMessageHandler {
    onDataRow(buffer: Uint8Array, start: number): void;

    onCommandComplete(buffer: Uint8Array, start: number, end: number): void;

    onReadyForQuery(buffer: Uint8Array, start: number): void;
}

/**
 * The backend protocol: one type byte, then the size as signed 32 bit big endian, which excludes the type byte.
 *
 * The messages of a running query are recognized here, as a query mostly consists of BindComplete, DataRow,
 * CommandComplete and ReadyForQuery. Anything else, and messages spread over several chunks, go through onFrame.
 */
export class PostgresFrameReader extends FrameReader {
    protected readonly headerSize = 5;

    constructor(
        onFrame: FrameCallback,
        protected readonly handler: PostgresMessageHandler,
    ) {
        super(onFrame);
    }

    protected frameSize(buffer: Uint8Array, offset: number): number {
        return (
            1 +
            ((buffer[offset + 1] << 24) | (buffer[offset + 2] << 16) | (buffer[offset + 3] << 8) | buffer[offset + 4])
        );
    }

    feed(buffer: Uint8Array, length: number = buffer.byteLength): void {
        let offset = 0;
        if (this.tailLength > 0) {
            offset = this.fill(buffer, length);
            if (this.tailLength > 0) return;
        }

        const handler = this.handler;
        while (length - offset >= 5) {
            const size =
                1 +
                ((buffer[offset + 1] << 24) |
                    (buffer[offset + 2] << 16) |
                    (buffer[offset + 3] << 8) |
                    buffer[offset + 4]);
            if (size < 5) throw new NetError(`Invalid message size ${size}`);
            const end = offset + size;
            if (end > length) break;
            const type = buffer[offset];
            if (type === 68) {
                handler.onDataRow(buffer, offset);
            } else if (type === 67) {
                handler.onCommandComplete(buffer, offset, end);
            } else if (type === 90) {
                handler.onReadyForQuery(buffer, offset);
            } else if (type !== 50) {
                this.onFrame(buffer, offset, end);
            }
            offset = end;
        }

        if (offset < length) this.stash(buffer, offset, length);
    }
}
