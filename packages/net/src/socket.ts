import { Socket, connect as connectNet } from 'net';
import { ConnectionOptions, TLSSocket, connect as connectTls } from 'tls';

export interface ConnectSocketOptions {
    host: string;
    port: number;
    timeout?: number;
    /** Options of tls.connect(), makes this a TLS connection. */
    tls?: ConnectionOptions;
    /** Size of the reused read buffer. */
    readBufferSize?: number;
}

/**
 * Opens a socket with Nagle's algorithm disabled and passes everything it receives to onData.
 *
 * Without TLS one read buffer is reused for the life of the socket, so the bytes are only valid during
 * onData. It is a plain Uint8Array on purpose: slice() of a Buffer returns a view on the memory instead of a copy,
 * which would let decoded values change with the next read.
 */
export function connectSocket(options: ConnectSocketOptions, onData: (buffer: Uint8Array, length: number) => void): Socket | TLSSocket {
    if (options.tls) {
        const socket = connectTls({ host: options.host, port: options.port, timeout: options.timeout, ...options.tls });
        socket.setNoDelay(true);
        socket.on('data', (data: Uint8Array) => onData(data, data.byteLength));
        return socket;
    }

    return connectNet({
        host: options.host,
        port: options.port,
        timeout: options.timeout,
        noDelay: true,
        onread: {
            buffer: new Uint8Array(options.readBufferSize ?? 64 * 1024),
            callback(length: number, buffer: Uint8Array): boolean {
                onData(buffer, length);
                return true;
            },
        },
    });
}
