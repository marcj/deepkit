/*
 * Deepkit Framework
 * Copyright (C) 2021 Deepkit UG, Marc J. Schmidt
 *
 * This program is free software: you can redistribute it and/or modify
 * it under the terms of the MIT License.
 *
 * You should have received a copy of the MIT License along with this program.
 */

import { ClassType } from '@deepkit/core';
import { ClientTransportAdapter, RpcClient } from './client.js';
import { TransportClientConnection } from '../transport.js';
import { RpcError } from '../model.js';

declare const location: { protocol: string, host: string, origin: string };

/**
 * A RpcClient that connects via WebSocket transport.
 */
export class RpcWebSocketClient extends RpcClient {
    constructor(url: string) {
        super(new RpcWebSocketClientAdapter(url));
    }

    static fromCurrentHost<T extends ClassType<RpcClient>>(this: T, baseUrl: string = ''): InstanceType<T> {
        const ws = location.protocol.startsWith('https') ? 'wss' : 'ws';
        if (baseUrl.length && baseUrl[0] !== '/') baseUrl = '/' + baseUrl;
        return new (this as any)(`${ws}://${location.host}${baseUrl}`);
    }
}

/**
 * @deprecated use RpcWebSocketClient instead
 */
export class DeepkitClient extends RpcWebSocketClient {
}

/**
 * Returns the WebSocket URL for the given base URL and allows port mapping.
 * Default port-mapping maps Angular server :4200 to :8080
 */
export function webSocketFromBaseUrl(baseUrl: string, portMapping: { [name: number]: number } = { 4200: 8080 }): string {
    let url = baseUrl.replace('https://', 'wss://').replace('http://', 'ws://');
    for (const [from, to] of Object.entries(portMapping)) {
        url = url.replace(':' + from, ':' + to);
    }
    return url;
}

/**
 * Creates a provider for RpcWebSocketClient that is compatible with Angular and Deepkit.
 * baseUrl needs to be absolute.
 */
export function provideRpcWebSocketClient(
    baseUrl: string = typeof location !== 'undefined' ? location.origin : 'http://localhost',
    portMapping: { [name: number]: number } = {},
) {
    return {
        provide: RpcWebSocketClient,
        useFactory: () => new RpcWebSocketClient(webSocketFromBaseUrl(baseUrl, portMapping)),
    };
}

export class RpcWebSocketClientAdapter implements ClientTransportAdapter {
    constructor(
        public url: string,
        protected webSocketConstructor: typeof WebSocket = WebSocket,
    ) {
    }

    async getWebSocketConstructor(): Promise<typeof WebSocket> {
        if (!this.webSocketConstructor) {
            throw new RpcError('No WebSocket implementation found.');
        }

        return this.webSocketConstructor;
    }

    public async connect(connection: TransportClientConnection) {
        const webSocketConstructor = await this.getWebSocketConstructor();

        try {
            const socket = new webSocketConstructor(this.url);
            this.mapSocket(socket, connection);
        } catch (error: any) {
            throw new RpcError(`Could not connect to ${this.url}. ${error.message}`);
        }
    }

    protected mapSocket(socket: WebSocket, connection: TransportClientConnection) {
        socket.binaryType = 'arraybuffer';

        socket.onmessage = (event: MessageEvent) => {
            connection.readBinary(new Uint8Array(event.data));
        };

        let errored = false;
        let connected = false;

        socket.onclose = (event) => {
            const reason = `code ${event.code} reason ${event.reason || 'unknown'}`;
            const message = connected ? `abnormal error: ${reason}` : `Could not connect: ${reason}`;
            if (errored) {
                connection.onError(new RpcError(message));
            } else {
                connection.onClose(reason);
            }
        };

        socket.onerror = (error: Event) => {
            // WebSocket onerror Event has no useful information, but onclose has
            errored = true;
        };

        socket.onopen = async () => {
            connected = true;
            connection.onConnected({
                clientAddress: () => {
                    return this.url;
                },
                bufferedAmount(): number {
                    return socket.bufferedAmount;
                },
                close() {
                    socket.close();
                },
                writeBinary(message) {
                    socket.send(message as Uint8Array<ArrayBuffer>);
                },
            });
        };
    }
}
