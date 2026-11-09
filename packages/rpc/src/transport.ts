import { createRpcMessage, readBinaryRpcMessage, releaseMessageBuffer, releaseMessageBufferIfLarge, RpcBinaryMessageReader, RpcMessage, RpcMessageDefinition, serializeBinaryRpcMessage, serializeBinaryRpcMessageTransient } from './protocol.js';
import { SingleProgress } from './progress.js';
import { rpcChunk, RpcError, RpcTransportStats, RpcTypes } from './model.js';
import { asyncOperation } from '@deepkit/core';

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
}

/**
 * @see createWriter
 */
export interface TransportMessageWriter {
    (message: RpcMessageDefinition, options: TransportOptions, stats: RpcTransportStats, progress?: SingleProgress): void;
}

export interface TransportConnection {
    /**
     * Write is used either by Client->Server, or Server->Client.
     * The method is responsible to serialize the message and send it over the wire.
     */
    write?: TransportMessageWriter;

    /**
     * Same as write, but sends binary directly. This enables chunking automatically.
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

    /**
     * Called when data is received from the other side.
     * The method is responsible to deserialize the message.
     */
    read(message: RpcMessage): void;

    readBinary(message: Uint8Array, bytes?: number): void;
}

export type RpcBinaryWriter = (buffer: Uint8Array) => void;

export interface BinarySocket {
    write(buffer: Uint8Array): unknown;

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
    ) {
    }

    /**
     * Writes a message buffer to the connection and chunks if necessary.
     */
    write(writer: RpcBinaryWriter, message: Uint8Array, progress?: SingleProgress): void {
        this.writeFull(writer, message, progress)
            .catch(error => console.log('TransportBinaryMessageChunkWriter writeAsync error', error));
    }

    /**
     * Serializes the message and writes it to the socket, without a copy unless it has to be chunked.
     * Returns the size of the message.
     */
    writeToSocket(socket: BinarySocket, message: RpcMessageDefinition, progress?: SingleProgress): number {
        const transient = serializeBinaryRpcMessageTransient(message);

        if (!transient || (this.options.chunkSize && transient.byteLength >= this.options.chunkSize)) {
            const buffer = serializeBinaryRpcMessage(message);
            this.write(data => socket.write(data), buffer, progress);
            return buffer.byteLength;
        }

        const size = transient.byteLength;
        socket.write(transient);
        progress?.set(size, size);
        // what could not be handed to the kernel is queued, and then node still needs this memory
        if (socket.writableLength > 0) releaseMessageBuffer();
        else releaseMessageBufferIfLarge();
        return size;
    }

    protected sendChunks(writer: RpcBinaryWriter, message: RpcMessage, buffer: Uint8Array, progress?: SingleProgress): Promise<void> {
        return asyncOperation(async (resolve) => {
            let offset = 0;
            let currentResolve: undefined | ((active: boolean) => void);
            progress?.abortController.signal.addEventListener('abort', () => {
                writer(serializeBinaryRpcMessage(createRpcMessage(message.id, RpcTypes.Error)));
                currentResolve?.(false);
            });
            let sequence = 0;
            while (offset < buffer.byteLength && !progress?.aborted) {
                const slice = buffer.slice(offset, offset + this.options.chunkSize);
                const chunkMessage = createRpcMessage<rpcChunk>(message.id, RpcTypes.Chunk, {
                    seq: sequence++,
                    total: buffer.byteLength,
                    v: slice,
                });
                offset += slice.byteLength;
                const promise = new Promise<boolean>((resolve) => {
                    currentResolve = resolve;
                    this.reader.onChunkAck(message.id, resolve);
                });
                writer(serializeBinaryRpcMessage(chunkMessage));
                const active = await promise;
                if (!active) break;
                progress?.set(buffer.byteLength, offset);
            }
            const aborted = offset < buffer.byteLength;
            this.reader.removeChunkAck(message.id, aborted);
            resolve();
        });
    }

    async writeFull(writer: RpcBinaryWriter, buffer: Uint8Array, progress?: SingleProgress): Promise<void> {
        if (this.options.chunkSize && buffer.byteLength >= this.options.chunkSize) {
            // We need the original message-id, so the chunks are correctly assigned in Progress tracker
            const message = readBinaryRpcMessage(buffer);

            // Only ever one active chunk stream per message context id
            while (this.pendingChunksForMessage.has(message.id)) {
                // wait for previous chunks to be sent
                await this.pendingChunksForMessage.get(message.id);
            }

            const promise = this.sendChunks(writer, message, buffer, progress).then(() => {
                this.pendingChunksForMessage.delete(message.id);
            });
            this.pendingChunksForMessage.set(message.id, promise);
            await promise;
        } else {
            writer(buffer);
            progress?.set(buffer.byteLength, buffer.byteLength);
        }
    }
}

export function createWriter(transport: TransportConnection, options: TransportOptions, reader: RpcBinaryMessageReader): TransportMessageWriter {
    if (transport.writeBinary) {
        const chunkWriter = new TransportBinaryMessageChunkWriter(reader, options);
        const writeBinary = transport.writeBinary;
        const socket = transport.binarySocket;
        if (socket) {
            return (message, options, stats, progress) => {
                const size = chunkWriter.writeToSocket(socket, message, progress);
                stats.increase('outgoing', 1);
                stats.increase('outgoingBytes', size);
            };
        }

        return (message, options, stats, progress) => {
            const buffer = serializeBinaryRpcMessage(message);
            stats.increase('outgoing', 1);
            stats.increase('outgoingBytes', buffer.byteLength);
            chunkWriter.write(writeBinary, buffer, progress);
        };
    }

    if (transport.write) {
        const write = transport.write;
        return (message, options, stats, progress) => {
            stats.increase('outgoing', 1);
            write(message, options, stats, progress);
        };
    }

    throw new RpcError('No write method found on transport');
}
