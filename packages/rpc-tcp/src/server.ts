import { asyncOperation, ParsedHost, parseHost } from '@deepkit/core';
import { RpcKernel, RpcMessageDefinition } from '@deepkit/rpc';
import { existsSync, mkdirSync, unlinkSync } from 'fs';
import { createServer, Server, Socket } from 'net';
import type { ServerOptions as WebSocketServerOptions } from 'ws';
import { WebSocketServer } from 'ws';
import { IncomingMessage } from 'http';
import { dirname } from 'path';

/**
 * Uses the node `net` module to create a server. Supports unix sockets.
 */
export class RpcTcpServer {
    protected server?: Server;
    protected host: ParsedHost;

    constructor(
        protected kernel: RpcKernel,
        host: string,
    ) {
        this.host = parseHost(host);
        if (this.host.isUnixSocket) {
            if (existsSync(this.host.unixSocket)) unlinkSync(this.host.unixSocket);
            mkdirSync(dirname(this.host.unixSocket), { recursive: true });
        }
    }

    start() {
        return asyncOperation((resolve, reject) => {
            this.server = createServer();

            this.server.on('listening', () => {
                resolve(true);
            });

            this.server.on('error', (err: any) => {
                reject(new Error('Could not start broker server: ' + err));
            });

            this.server.on('connection', (socket: Socket) => {
                const connection = this.kernel?.createConnection({
                    write(b: RpcMessageDefinition) {
                        connection.sendToSocket(b, socket);
                    },
                    clientAddress(): string {
                        return socket.remoteAddress || '';
                    },
                    close() {
                        socket.destroy();
                    },
                    bufferedAmount(): number {
                        return socket.writableLength || 0;
                    },
                });

                socket.on('data', (data: Uint8Array) => {
                    connection.feed(data);
                });

                socket.on('close', () => {
                    connection.close();
                });

                socket.on('error', (error) => {
                    connection.close(error);
                });
            });

            if (this.host.isUnixSocket) {
                this.server.listen(this.host.unixSocket);
            } else {
                this.server.listen(this.host.port || 8811, this.host.host);
            }
        });
    }

    close() {
        this.server?.close();
    }
}

export class RpcWebSocketServer {
    protected server?: WebSocketServer;
    protected host: ParsedHost;

    constructor(
        protected kernel: RpcKernel,
        host: string,
    ) {
        this.host = parseHost(host);
        if (this.host.isUnixSocket && existsSync(this.host.unixSocket)) {
            if (existsSync(this.host.unixSocket)) unlinkSync(this.host.unixSocket);
            mkdirSync(dirname(this.host.unixSocket), { recursive: true });
        }
    }

    close() {
        this.server?.close();
    }

    start(options: WebSocketServerOptions): void {
        const defaultOptions = { host: this.host.host, port: this.host.port };
        this.server = new WebSocketServer({ ...defaultOptions, ...options });

        this.server.on('connection', (ws, req: IncomingMessage) => {
            //ws hands the bytes to the socket right away, so messages can be sent from the reused buffer
            const binarySocket = {
                write(data: Uint8Array) {
                    ws.send(data);
                },
                get writableLength() {
                    return ws.bufferedAmount;
                },
            };
            const connection = this.kernel?.createConnection({
                write(message: RpcMessageDefinition) {
                    connection.sendToSocket(message, binarySocket);
                },
                close() {
                    ws.close();
                },
                bufferedAmount(): number {
                    return ws.bufferedAmount;
                },
                clientAddress(): string {
                    return req.socket.remoteAddress || '';
                },
            });

            ws.on('message', (message: Uint8Array) => {
                connection.feed(message);
            });

            ws.on('close', () => {
                connection.close();
            });

            ws.on('error', (error) => {
                connection.close(error);
            });
        });
    }
}
