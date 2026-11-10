import { asyncOperation } from '@deepkit/core';

import { RpcTransportStats } from './model.js';
import { SingleProgress } from './progress.js';
import {
    ChunkOp,
    MessageFlag,
    RouteFlag,
    RpcBinaryMessageReader,
    copyFrame,
    frameMemory,
    getFrameContext,
    releaseMessageBuffer,
    releaseMessageBufferIfLarge,
    routeMask,
    writeChunkControlFrameTransient,
    writeChunkFrameTransient,
} from './protocol.js';

export class TransportOptions {
    /**
     * Stores big buffers to the file system and stream it from there.
     * In bytes.
     * note: not implemented yet
     */
    public cacheOnFileSystemWhenSizeIsAtLeast: number = 100_000_000;

    /**
     * When back-pressure is bigger than this value, we wait with sending new data.
     * In bytes.
     * note: not implemented yet
     */
    public stepBackWhenBackPressureBiggerThan: number = 5_000_000;

    /**
     * Chunk size.
     * In bytes.
     */
    public chunkSize: number = 100_000;

    /**
     * How long a client waits for the reply to its handshake before it gives up.
     * In milliseconds, 0 disables it.
     */
    public handshakeTimeout: number = 30_000;
}

export interface TransportConnection {
    /**
     * Sends a frame. Large frames are chunked before they get here.
     */
    writeBinary?(message: Uint8Array): void;

    /**
     * A socket to write to instead of writeBinary. Its bytes are copied by the kernel during write(), so
     * messages can be sent from one reused buffer without copying them first.
     */
    binarySocket?: BinarySocket;

    bufferedAmount?(): number;

    clientAddress?(): string;

    close(): void;
}

export interface TransportClientConnection {
    token?: any;

    onConnected(established: TransportConnection): void;

    onClose(reason: string): void;

    onError(error: Error): void;

    readBinary(message: Uint8Array, bytes?: number): void;
}

export type RpcBinaryWriter = (buffer: Uint8Array) => void;

export interface BinarySocket {
    write(buffer: Uint8Array): unknown;

    /** Writes a range of the buffer without a view on it, where the socket supports that. */
    writeRange?(buffer: Uint8Array, start: number, end: number): unknown;

    /** Bytes the socket could not hand to the kernel yet, and whose memory it still needs. */
    readonly writableLength: number;
}

/**
 * This class acts as a layer between kernel/client and a connection writer.
 * It automatically chunks long messages into multiple smaller one using the RpcType.Chunks type.
 *
 * todo:
 * It keeps track of the back-pressure and sends only when the pressure is not too big.
 * It automatically saves big buffer to the file system and streams data from there to not
 * block valuable memory.
 */
export class TransportBinaryMessageChunkWriter {
    protected pendingChunksForMessage = new Map<number, Promise<unknown>>();

    constructor(
        protected reader: RpcBinaryMessageReader,
        protected options: TransportOptions,
    ) {}

    /**
     * A small message has to wait as well while a large one of its context is sent in chunks, or it would overtake it.
     */
    needsWriteFull(size: number): boolean {
        return (size >= this.options.chunkSize && this.options.chunkSize > 0) || this.pendingChunksForMessage.size > 0;
    }

    /**
     * Writes a message buffer to the connection and chunks if necessary.
     */
    write(writer: RpcBinaryWriter, message: Uint8Array, progress?: SingleProgress): void {
        if (!this.needsWriteFull(message.byteLength)) {
            writer(message);
            progress?.set(message.byteLength, message.byteLength);
            return;
        }
        this.writeFull(writer, message, progress).catch(error =>
            console.log('TransportBinaryMessageChunkWriter writeAsync error', error),
        );
    }

    protected sendChunks(
        writer: RpcBinaryWriter,
        id: number,
        route: RouteFlag,
        buffer: Uint8Array,
        progress?: SingleProgress,
    ): Promise<void> {
        return asyncOperation(async resolve => {
            let offset = 0;
            let currentResolve: undefined | ((active: boolean) => void);
            progress?.abortController.signal.addEventListener('abort', () => {
                writer(copyFrame(frameMemory(), 0, writeChunkControlFrameTransient(id, route, ChunkOp.Abort)));
                currentResolve?.(false);
            });
            let sequence = 0;
            while (offset < buffer.byteLength && !progress?.aborted) {
                const end = Math.min(offset + this.options.chunkSize, buffer.byteLength);
                const size = writeChunkFrameTransient(id, route, sequence++, buffer.byteLength, buffer, offset, end);
                offset = end;
                const sent = offset;
                const promise = new Promise<boolean>(resolve => {
                    currentResolve = resolve;
                    this.reader.onChunkAck(
                        id,
                        active => {
                            // right when the ack arrives: the reply of the other side can be right behind it
                            if (active) progress?.set(buffer.byteLength, sent);
                            resolve(active);
                        },
                        route,
                    );
                });
                writer(copyFrame(frameMemory(), 0, size));
                const active = await promise;
                if (!active) break;
            }
            const aborted = offset < buffer.byteLength;
            this.reader.removeChunkAck(id, aborted, route);
            resolve();
        });
    }

    async writeFull(writer: RpcBinaryWriter, buffer: Uint8Array, progress?: SingleProgress): Promise<void> {
        const route = (buffer[4] & routeMask) as RouteFlag;
        // chunks have no route data, a frame that is routed further goes as a whole
        const routed = route === MessageFlag.RouteSourceDest || route === MessageFlag.RoutePeer;
        const id = getFrameContext(buffer);
        if (!routed && this.options.chunkSize && buffer.byteLength >= this.options.chunkSize) {
            // Only ever one active chunk stream per context id
            while (this.pendingChunksForMessage.has(id)) {
                // wait for previous chunks to be sent
                await this.pendingChunksForMessage.get(id);
            }

            const promise = this.sendChunks(writer, id, route, buffer, progress).then(() => {
                this.pendingChunksForMessage.delete(id);
            });
            this.pendingChunksForMessage.set(id, promise);
            await promise;
        } else {
            while (this.pendingChunksForMessage.has(id)) {
                await this.pendingChunksForMessage.get(id);
            }
            writer(buffer);
            progress?.set(buffer.byteLength, buffer.byteLength);
        }
    }
}

/**
 * Sends the frame in the range 0 to size of the buffer, which may be the shared message buffer:
 * it is written and given up during the call.
 */
export type RpcFrameSender = (buffer: Uint8Array, size: number, progress?: SingleProgress) => void;

/**
 * Sends the frames of the fast path. Transports without a binary socket get their own copy,
 * as they may hold on to the memory.
 */
export function createFrameSender(
    transport: TransportConnection,
    chunkWriter: TransportBinaryMessageChunkWriter,
    options: TransportOptions,
    stats: RpcTransportStats,
): RpcFrameSender | undefined {
    const socket = transport.binarySocket;
    const writeBinary = transport.writeBinary;

    if (socket) {
        return (buffer, size, progress) => {
            stats.addOutgoing(size);
            if (progress !== undefined || chunkWriter.needsWriteFull(size)) {
                chunkWriter.write(data => socket.write(data), copyFrame(buffer, 0, size), progress);
                return;
            }
            if (socket.writeRange) socket.writeRange(buffer, 0, size);
            else socket.write(buffer.subarray(0, size));
            if (socket.writableLength > 0) releaseMessageBuffer();
            else releaseMessageBufferIfLarge();
        };
    }

    if (writeBinary) {
        return (buffer, size, progress) => {
            stats.addOutgoing(size);
            chunkWriter.write(writeBinary, copyFrame(buffer, 0, size), progress);
        };
    }

    return undefined;
}
