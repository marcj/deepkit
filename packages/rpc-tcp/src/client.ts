import { connect } from 'net';

import { parseHost } from '@deepkit/core';
import { SocketWriter, connectSocket } from '@deepkit/net/node';
import { ClientTransportAdapter, TransportClientConnection } from '@deepkit/rpc';

/*
 * Uses the node `net` module to connect. Supports unix sockets.
 */
export class RpcTcpClientAdapter implements ClientTransportAdapter {
    protected host;

    constructor(host: string) {
        this.host = parseHost(host);
    }

    public async connect(connection: TransportClientConnection) {
        const port = this.host.port || 8811;
        // Everything read here is decoded during the callback (or copied), so a TCP connection can reuse one read buffer.
        const socket = this.host.isUnixSocket
            ? connect({ path: this.host.unixSocket })
            : connectSocket({ port, host: this.host.host }, (buffer, length) => connection.readBinary(buffer, length));
        const writer = new SocketWriter(socket);

        if (this.host.isUnixSocket) {
            socket.on('data', (data: Uint8Array) => {
                connection.readBinary(data);
            });
        }

        socket.on('close', () => {
            connection.onClose('socket closed');
        });

        socket.on('error', (error: any) => {
            error = error instanceof Error ? error : new Error(String(error));
            connection.onError(error);
        });

        socket.on('connect', async () => {
            connection.onConnected({
                clientAddress: () => {
                    return this.host.toString();
                },
                bufferedAmount(): number {
                    //implement that to step back when too big
                    return socket.bufferSize;
                },
                close() {
                    writer.flush();
                    socket.end();
                },
                writeBinary(message) {
                    writer.flush();
                    socket.write(message);
                },
                binarySocket: writer,
            });
        });
    }
}
