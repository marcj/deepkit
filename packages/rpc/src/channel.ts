/*
 * Deepkit Framework
 * Copyright (C) 2021 Deepkit UG, Marc J. Schmidt
 *
 * This program is free software: you can redistribute it and/or modify
 * it under the terms of the MIT License.
 *
 * You should have received a copy of the MIT License along with this program.
 */
import { InjectorContext } from '@deepkit/injector';
import { SocketWriter } from '@deepkit/net';

import { ClientTransportAdapter } from './client/client.js';
import { RpcKernel, RpcKernelBaseConnection } from './server/kernel.js';
import { BinarySocket, TransportClientConnection, TransportConnection } from './transport.js';

/**
 * A connection between two sides that are not connected over the network: a worker thread, a Web Worker,
 * a forked child process, or any other message port or byte stream. RPC frames are sent over it, one
 * side runs a RpcKernel with serveRpcChannel() and the other a RpcClient with RpcChannelClientAdapter.
 *
 * Use createMessagePortChannel(), createProcessChannel() or createStreamChannel(), or implement it for other channels.
 */
export interface RpcChannel {
    /**
     * Sends bytes. The buffer belongs to the channel afterwards, it may transfer it to the other side.
     */
    send(data: Uint8Array): void;

    /**
     * Ends the current connection. The other side gets onEnd. A message channel can carry the next connection afterwards.
     */
    end(): void;

    /**
     * Receives bytes until the returned function is called. onEnd is called when the other side ended the
     * connection or the channel closed. The buffer is only valid during the call.
     */
    listen(onData: (data: Uint8Array, bytes?: number) => void, onEnd: (reason: string) => void): () => void;

    /**
     * Channels of a byte stream write the frames directly to this socket instead of send(), which
     * collects the frames of one tick into one message.
     */
    binarySocket?: BinarySocket;

    /** Shown as address of the client. */
    readonly name?: string;
}

/** node's queueMicrotask() creates an AsyncResource and a bound function for each call, then() on this one doesn't. */
const resolved = Promise.resolve();

/** Up to this size copying byte by byte is cheaper than creating the view that TypedArray.set() needs. */
const smallCopySize = 128;

/**
 * Collects the frames written in one tick into one message. Every message is a new buffer of the exact size,
 * so that channels can transfer it to the other side instead of copying it.
 */
export class RpcChannelMessageWriter implements BinarySocket {
    readonly writableLength = 0;
    protected batch: Uint8Array;
    protected length = 0;
    protected scheduled = false;
    protected readonly boundFlush = this.flush.bind(this);

    constructor(
        protected send: (data: Uint8Array) => void,
        protected capacity: number = 64 * 1024,
    ) {
        this.batch = new Uint8Array(capacity);
    }

    write(buffer: Uint8Array): void {
        this.writeRange(buffer, 0, buffer.byteLength);
    }

    writeRange(buffer: Uint8Array, start: number, end: number): void {
        const size = end - start;
        if (!this.scheduled) {
            this.scheduled = true;
            resolved.then(this.boundFlush);
        }
        if (this.length + size > this.batch.byteLength) {
            this.flushBatch();
            if (size > this.batch.byteLength) {
                // a large frame (chunks are 100kb) goes as its own message
                this.send(buffer.slice(start, end));
                return;
            }
        }
        const batch = this.batch;
        if (size <= smallCopySize) {
            let target = this.length;
            for (let i = start; i < end; i++) batch[target++] = buffer[i];
        } else {
            batch.set(buffer.subarray(start, end), this.length);
        }
        this.length += size;
    }

    flush(): void {
        this.scheduled = false;
        this.flushBatch();
    }

    protected flushBatch(): void {
        if (this.length === 0) return;
        const message = this.batch.slice(0, this.length);
        this.length = 0;
        this.send(message);
    }
}

/**
 * Connects to a RpcKernel on the other side of a channel.
 *
 * ```typescript
 * const worker = new Worker('./server.js');
 * const client = new RpcClient(new RpcChannelClientAdapter(createMessagePortChannel(worker)));
 * ```
 *
 * The channel can carry one connection at a time. After a disconnect the client connects again over the same channel.
 */
export class RpcChannelClientAdapter implements ClientTransportAdapter {
    constructor(public channel: RpcChannel) {}

    async connect(connection: TransportClientConnection): Promise<void> {
        const channel = this.channel;
        let closed = false;
        const unsubscribe = channel.listen(
            (data, bytes) => {
                if (!closed) connection.readBinary(data, bytes);
            },
            reason => {
                if (closed) return;
                closed = true;
                unsubscribe();
                // the server ended the connection: confirm it, so the server takes the next message as a new connection
                channel.end();
                connection.onClose(reason);
            },
        );
        const binarySocket = channel.binarySocket || new RpcChannelMessageWriter(data => channel.send(data));
        connection.onConnected({
            clientAddress: () => channel.name || 'channel',
            bufferedAmount: () => binarySocket.writableLength,
            close() {
                if (closed) return;
                closed = true;
                unsubscribe();
                if (binarySocket instanceof RpcChannelMessageWriter) binarySocket.flush();
                channel.end();
            },
            writeBinary(message) {
                binarySocket.write(message);
            },
            binarySocket,
        });
    }
}

export interface RpcChannelServer {
    /** The connection that currently runs over the channel. */
    readonly connection?: RpcKernelBaseConnection;

    /** Stops listening and closes the current connection. */
    close(): void;
}

/**
 * Serves the RpcKernel to the other side of a channel, where a RpcClient connects with RpcChannelClientAdapter.
 *
 * ```typescript
 * // in the worker
 * import { parentPort } from 'node:worker_threads';
 * serveRpcChannel(kernel, createMessagePortChannel(parentPort!));
 * ```
 *
 * Each connection gets its own scope `rpc` of the kernel's injector, unless an injector is given.
 */
export function serveRpcChannel(kernel: RpcKernel, channel: RpcChannel, injector?: InjectorContext): RpcChannelServer {
    let connection: RpcKernelBaseConnection | undefined;
    // Whether the transport of the current connection still writes to the channel.
    let active = false;
    // After the server ended a connection, the messages of the client still on their way belong to the old
    // connection. They are dropped until the client confirms the end.
    let ending = false;
    const writer = channel.binarySocket || new RpcChannelMessageWriter(data => channel.send(data));

    const transport: TransportConnection = {
        clientAddress: () => channel.name || 'channel',
        bufferedAmount: () => writer.writableLength,
        close() {
            // the kernel closes the connection: end it, unless the client did already
            if (!active) return;
            active = false;
            connection = undefined;
            if (writer instanceof RpcChannelMessageWriter) writer.flush();
            ending = true;
            channel.end();
        },
        writeBinary(message) {
            if (active) writer.write(message);
        },
        binarySocket: {
            get writableLength() {
                return writer.writableLength;
            },
            write(buffer: Uint8Array) {
                if (active) writer.write(buffer);
            },
            writeRange(buffer: Uint8Array, start: number, end: number) {
                if (!active) return;
                if (writer.writeRange) writer.writeRange(buffer, start, end);
                else writer.write(buffer.subarray(start, end));
            },
        },
    };

    const unsubscribe = channel.listen(
        (data, bytes) => {
            if (ending) return;
            if (!connection) {
                active = true;
                connection = kernel.createConnection(transport, injector);
            }
            connection.feed(data, bytes);
        },
        reason => {
            if (ending) {
                ending = false;
                return;
            }
            const current = connection;
            if (!current) return;
            connection = undefined;
            active = false;
            current.close(reason);
        },
    );

    return {
        get connection() {
            return connection;
        },
        close() {
            unsubscribe();
            connection?.close('closed');
            connection = undefined;
        },
    };
}

/** Bytes as Buffer in node: strings are decoded faster from it, and BSON code that sees only one kind of array is faster. */
const toBytes: (data: Uint8Array) => Uint8Array =
    'undefined' !== typeof Buffer
        ? data => (Buffer.isBuffer(data) ? data : Buffer.from(data.buffer, data.byteOffset, data.byteLength))
        : data => data;

const emptyMessage = new Uint8Array(0);

/**
 * The parts of a MessagePort, Worker, or the global scope of a Web Worker (`self`) the channel uses.
 * In node these are MessagePort, Worker and `parentPort` of `worker_threads`.
 */
export interface RpcMessagePortLike {
    postMessage(message: any, transfer?: any[]): void;
    on?(event: string, listener: (...args: any[]) => void): unknown;
    off?(event: string, listener: (...args: any[]) => void): unknown;
    addEventListener?(event: string, listener: (event: any) => void): unknown;
    removeEventListener?(event: string, listener: (event: any) => void): unknown;
    start?(): void;
}

/**
 * A channel over a MessagePort, a MessageChannel's port, a Worker, or `self` in a Web Worker,
 * of the browser or of node's `worker_threads`. Messages are transferred, not copied.
 *
 * Other messages may share the port: messages that are not a Uint8Array are ignored.
 */
export function createMessagePortChannel(port: RpcMessagePortLike, name: string = 'message-port'): RpcChannel {
    return {
        name,
        send(data: Uint8Array) {
            port.postMessage(data, [data.buffer]);
        },
        end() {
            port.postMessage(emptyMessage);
        },
        listen(onData, onEnd) {
            const onMessage = (data: unknown) => {
                if (!(data instanceof Uint8Array)) return;
                if (data.byteLength === 0) onEnd('ended');
                else onData(toBytes(data));
            };
            const onClose = () => onEnd('channel closed');
            if (port.on && port.off) {
                // node: MessagePort and Worker are event emitters, the listener gets the data
                port.on('message', onMessage);
                port.on('close', onClose);
                port.on('exit', onClose);
                return () => {
                    port.off!('message', onMessage);
                    port.off!('close', onClose);
                    port.off!('exit', onClose);
                };
            }
            const onEvent = (event: { data: unknown }) => onMessage(event.data);
            port.addEventListener!('message', onEvent);
            port.addEventListener!('close', onClose);
            port.start?.();
            return () => {
                port.removeEventListener!('message', onEvent);
                port.removeEventListener!('close', onClose);
            };
        },
    };
}

/**
 * The parts of a ChildProcess or of `process` in the child the channel uses.
 */
export interface RpcProcessLike {
    send?(message: any, ...rest: any[]): boolean;
    readonly connected?: boolean;
    on(event: string, listener: (...args: any[]) => void): unknown;
    off(event: string, listener: (...args: any[]) => void): unknown;
}

/**
 * A channel over the IPC channel of a forked child process: the ChildProcess in the parent,
 * and `process` in the child. The child has to be started with `serialization: 'advanced'`,
 * so that bytes are sent as bytes:
 *
 * ```typescript
 * const child = fork('./server.js', { serialization: 'advanced' });
 * const client = new RpcClient(new RpcChannelClientAdapter(createProcessChannel(child)));
 * ```
 *
 * Other messages may share the channel: messages that are not a Uint8Array are ignored.
 * createStreamChannel() over an extra pipe of the child is faster.
 */
export function createProcessChannel(process: RpcProcessLike, name: string = 'process'): RpcChannel {
    return {
        name,
        send(data: Uint8Array) {
            process.send!(data);
        },
        end() {
            // after a disconnect, send() emits an error
            if (process.connected !== false) process.send!(emptyMessage);
        },
        listen(onData, onEnd) {
            const onMessage = (data: unknown) => {
                if (!(data instanceof Uint8Array)) return;
                if (data.byteLength === 0) onEnd('ended');
                else onData(toBytes(data));
            };
            const onDisconnect = () => onEnd('process disconnected');
            process.on('message', onMessage);
            process.on('disconnect', onDisconnect);
            return () => {
                process.off('message', onMessage);
                process.off('disconnect', onDisconnect);
            };
        },
    };
}

/**
 * The parts of a node Duplex stream the channel uses, like a net.Socket.
 */
export interface RpcStreamLike {
    write(data: Uint8Array): unknown;
    end(): unknown;
    readonly writableLength: number;
    readonly destroyed: boolean;
    on(event: string, listener: (...args: any[]) => void): unknown;
    off(event: string, listener: (...args: any[]) => void): unknown;
}

/**
 * A channel over a byte stream, for example an extra pipe of a child process:
 *
 * ```typescript
 * // parent
 * const child = spawn('node', ['server.js'], { stdio: ['inherit', 'inherit', 'inherit', 'pipe'] });
 * const client = new RpcClient(new RpcChannelClientAdapter(createStreamChannel(child.stdio[3] as Socket)));
 *
 * // child
 * serveRpcChannel(kernel, createStreamChannel(new Socket({ fd: 3, readable: true, writable: true })));
 * ```
 *
 * A stream carries one connection: ending it ends the stream.
 */
export function createStreamChannel(stream: RpcStreamLike, name: string = 'stream'): RpcChannel {
    return {
        name,
        binarySocket: new SocketWriter(stream as any),
        send(data: Uint8Array) {
            stream.write(data);
        },
        end() {
            (this.binarySocket as SocketWriter).flush();
            if (!stream.destroyed) stream.end();
        },
        listen(onData, onEnd) {
            const onEnded = () => onEnd('stream closed');
            stream.on('data', onData);
            stream.on('end', onEnded);
            stream.on('close', onEnded);
            return () => {
                stream.off('data', onData);
                stream.off('end', onEnded);
                stream.off('close', onEnded);
            };
        },
    };
}
