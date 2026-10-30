/*
 * Deepkit Framework
 * Copyright (C) 2021 Deepkit UG, Marc J. Schmidt
 *
 * This program is free software: you can redistribute it and/or modify
 * it under the terms of the MIT License.
 *
 * You should have received a copy of the MIT License along with this program.
 */

import { RpcKernel, RpcKernelBaseConnection, RpcKernelConnection, SessionState, TransportConnection } from '@deepkit/rpc';
import http, { Server } from 'http';
import https from 'https';
import type { Server as WebSocketServer, ServerOptions as WebSocketServerOptions } from 'ws';
import ws from 'ws';

import { HttpConfig, HttpKernel, HttpRequest, HttpResponse } from '@deepkit/http';
import { InjectorContext } from '@deepkit/injector';
import { RpcControllers } from './rpc.js';
import { SecureContextOptions, TlsOptions } from 'tls';

// @ts-ignore
import { join } from 'path';
import { existsSync, readFileSync, writeFileSync } from 'fs';
import { LoggerInterface } from '@deepkit/logger';
import { sleep } from '@deepkit/core';
import { createSelfSignedCertificate } from './self-signed.js';

// @ts-ignore
import compression from 'compression';
import { constants } from 'zlib';

export interface WebServerOptions {
    host: string;

    /**
     * Defines the port of the http server.
     * If ssl is defined, this port is used for the https server. If you want to have http and https
     * at the same time, use `httpsPort` accordingly.
     */
    port: number;

    varPath: string;

    compression: number;

    /**
     * If httpsPort and ssl is defined, then the https server is started additional to the http-server.
     *
     * In a production deployment, you usually want both, http and https server.
     * Set `port: 80` and `httpsPort: 443` to have both.
     */
    httpsPort?: number;

    http: HttpConfig;

    /**
     * When external server should be used. If this is set, all other options are ignored.
     */
    server?: Server;

    /**
     * When server is shutting down gracefully, this timeout is used to wait for all connections to be closed.
     */
    gracefulShutdownTimeout: number;

    /**
     * Enables HTTPS.
     * Make sure to pass `sslKey` and `sslCertificate` as well (or use sslOptions).
     */
    ssl: boolean;

    sslKey?: string;
    sslCertificate?: string;
    sslCa?: string;
    sslCrl?: string;

    /**
     * If defined https.createServer is used and all options passed as is to it.
     * Make sure to pass `key` and `cert`, as described in Node's https.createServer() documentation.
     * See https://nodejs.org/api/https.html#https_https_createserver_options_requestlistener
     */
    sslOptions?: SecureContextOptions & TlsOptions;

    /**
     * When true keys & certificates are created on-the-fly (for development purposes).
     * Should not be used in production.
     */
    selfSigned?: boolean;
}


export interface RpcServerListener {
    close(): void | Promise<void>;
}

export interface RpcServerCreateConnection {
    (transport: TransportConnection, request?: HttpRequest): RpcKernelBaseConnection;
}

export interface RpcServerOptions {
    server?: http.Server | https.Server;
}

export interface RpcServerInterface {
    start(options: RpcServerOptions, createRpcConnection: RpcServerCreateConnection): void;
}

export class RpcServer implements RpcServerInterface {
    start(options: RpcServerOptions, createRpcConnection: RpcServerCreateConnection): RpcServerListener {
        const { Server }: { Server: { new(options: WebSocketServerOptions): WebSocketServer } } = ws;

        const server = new Server(options);

        server.on('connection', (ws, req: HttpRequest) => {
            const connection = createRpcConnection({
                writeBinary(message) {
                    ws.send(message);
                },
                close() {
                    ws.close();
                },
                bufferedAmount(): number {
                    return ws.bufferedAmount;
                },
                clientAddress(): string {
                    return req.getRemoteAddress();
                }
            }, req);

            ws.on('message', (message: Uint8Array) => {
                connection.feed(message);
            });

            ws.on('error', (error) => {
                connection.close(error);
            });

            ws.on('close', () => {
                connection.close();
            });
        });

        return {
            close() {
                server.close();
            }
        };
    }
}

export class WebWorkerFactory {
    constructor(
        protected httpKernel: HttpKernel,
        public logger: LoggerInterface,
        protected rpcControllers: RpcControllers,
        protected injectorContext: InjectorContext,
        protected rpcServer: RpcServer,
        protected rpcKernel: RpcKernel,
    ) {
    }

    create(id: number, options: WebServerOptions): WebWorker {
        return new WebWorker(id, this.logger, this.httpKernel, this.rpcKernel, this.injectorContext, options, this.rpcServer);
    }
}

export class WebMemoryWorkerFactory extends WebWorkerFactory {
    create(id: number, options: WebServerOptions): WebMemoryWorker {
        return new WebMemoryWorker(id, this.logger, this.httpKernel, this.rpcKernel, this.injectorContext, options, this.rpcServer);
    }
}

export function createRpcConnection(rootScopedContext: InjectorContext, rpcKernel: RpcKernel, transport: TransportConnection, request?: HttpRequest) {
    const injector = rootScopedContext.createChildScope('rpc');
    injector.set(HttpRequest, request);
    injector.set(InjectorContext, injector);
    const connection = rpcKernel.createConnection(transport, injector);
    injector.set(SessionState, connection.sessionState);
    injector.set(RpcKernelConnection, connection);
    injector.set(RpcKernelBaseConnection, connection);

    return connection;
}

export class WebWorker {
    protected rpcListener?: RpcServerListener;
    protected server?: http.Server | https.Server;
    protected servers?: https.Server;

    //during shutdown, we don't want to accept new connections
    protected shuttingDown = false;
    protected activeRequests = 0;

    protected compressionOptions = {
        level: 0,
        chunkSize: constants.Z_DEFAULT_CHUNK,
        memLevel: constants.Z_DEFAULT_MEMLEVEL,
        strategy: constants.Z_DEFAULT_STRATEGY,
        windowBits: constants.Z_DEFAULT_WINDOWBITS,
    };

    constructor(
        public readonly id: number,
        public logger: LoggerInterface,
        public httpKernel: HttpKernel,
        public rpcKernel: RpcKernel,
        protected injectorContext: InjectorContext,
        protected options: WebServerOptions,
        private rpcServer: RpcServer,
    ) {
        this.handleRequest = this.handleRequest.bind(this);

        if (this.options.compression) {
            this.compressionOptions.level = this.options.compression;
        }
    }

    handleRequest(request: HttpRequest, response: HttpResponse) {
        if (this.shuttingDown) {
            response.writeHead(503, 'Service Unavailable');
            response.end();
            return;
        }

        if (this.compressionOptions.level > 0) {
            // this modifies response object, so it must be called before any data is written
            compression(this.compressionOptions)(request, response, () => undefined);
        }

        this.activeRequests++;
        response.on('close', () => {
            this.activeRequests--;
        });

        return this.httpKernel.handleRequest(request, response);
    }

    applyServerSettings(server: Server) {
        const config = this.options.http;
        if ('undefined' !== typeof config.timeout) server.timeout = config.timeout;
        if ('undefined' !== typeof config.requestTimeout) server.requestTimeout = config.requestTimeout;
        if ('undefined' !== typeof config.headersTimeout) server.headersTimeout = config.headersTimeout;
        if ('undefined' !== typeof config.maxHeadersCount) server.maxHeadersCount = config.maxHeadersCount;
        if ('undefined' !== typeof config.keepAliveTimeout) server.keepAliveTimeout = config.keepAliveTimeout;
        if ('undefined' !== typeof config.maxRequestsPerSocket) server.maxRequestsPerSocket = config.maxRequestsPerSocket;
    }

    start() {
        if (this.options.server) {
            this.server = this.options.server as Server;
            this.server.on('request', this.handleRequest);
        } else {
            if (this.options.ssl) {
                const options = this.options.sslOptions || {};

                if (this.options.selfSigned) {
                    const keyPath = join(this.options.varPath, `self-signed-${this.options.host}.key`);
                    const certificatePath = join(this.options.varPath, `self-signed-${this.options.host}.cert`);
                    if (existsSync(keyPath) && existsSync(certificatePath)) {
                        options.key = readFileSync(keyPath, 'utf8');
                        options.cert = readFileSync(certificatePath, 'utf8');
                    } else {
                        const pems = createSelfSignedCertificate(this.options.host, 365);
                        options.cert = pems.cert;
                        options.key = pems.private;
                        writeFileSync(keyPath, pems.private, 'utf8');
                        writeFileSync(certificatePath, pems.cert, 'utf8');
                        this.logger.log(`Self signed certificate for ${this.options.host} created at ${certificatePath}`);
                        this.logger.log(`Tip: If you want to open this server via chrome for localhost, use chrome://flags/#allow-insecure-localhost`);
                    }
                }

                if (!options.key && this.options.sslKey) options.key = readFileSync(this.options.sslKey, 'utf8');
                if (!options.ca && this.options.sslCa) options.ca = readFileSync(this.options.sslCa, 'utf8');
                if (!options.cert && this.options.sslCertificate) options.cert = readFileSync(this.options.sslCertificate, 'utf8');
                if (!options.crl && this.options.sslCrl) options.crl = readFileSync(this.options.sslCrl, 'utf8');

                this.servers = new https.Server(
                    Object.assign({ IncomingMessage: HttpRequest, ServerResponse: HttpResponse as any, }, options),
                    this.handleRequest as any
                );
                this.servers.requestTimeout
                this.servers.listen(this.options.httpsPort || this.options.port, this.options.host);
            }

            const startHttpServer = !this.servers || (this.servers && this.options.httpsPort);
            if (startHttpServer) {
                this.server = new http.Server(
                    { IncomingMessage: HttpRequest, ServerResponse: HttpResponse as any },
                    this.handleRequest as any
                );
                this.server.listen(this.options.port, this.options.host);
            }
        }

        if (this.servers) this.applyServerSettings(this.servers);
        if (this.server) this.applyServerSettings(this.server);

        this.startRpc();
    }

    private startRpc() {
        if (this.server) {
            this.rpcListener = this.rpcServer.start({ server: this.server }, (transport, request?: HttpRequest) => {
                if (this.shuttingDown) {
                    transport.close();
                    throw new Error('Server is shutting down');
                }
                return createRpcConnection(this.injectorContext, this.rpcKernel, transport, request);
            });
        }
        if (this.servers) {
            this.rpcListener = this.rpcServer.start({ server: this.servers }, (transport, request?: HttpRequest) => {
                if (this.shuttingDown) {
                    transport.close();
                    throw new Error('Server is shutting down');
                }
                return createRpcConnection(this.injectorContext, this.rpcKernel, transport, request);
            });
        }
    }

    async close(graceful = false) {
        if (graceful) {
            if (this.options.server && this.server) {
                this.server.off('request', this.handleRequest);
            }

            this.shuttingDown = true;
            //wait until all http requests are finished
            if (this.activeRequests) {
                this.logger.log(`Waiting ${this.options.gracefulShutdownTimeout}s for all ${this.activeRequests} http requests to finish ...`);
                const started = Date.now();
                while (this.activeRequests) {
                    //if timeout is exceeded
                    if (this.options.gracefulShutdownTimeout && (Date.now() - started) / 1000 > this.options.gracefulShutdownTimeout) {
                        this.logger.log(`Timeout of ${this.options.gracefulShutdownTimeout}s exceeded. Closing ${this.activeRequests} open http requests.`);
                        break;
                    }
                    await sleep(0.1);
                }
            }
        }
        if (this.rpcListener) await this.rpcListener.close();
        if (this.server) this.server.close();
        if (this.servers) this.servers.close();
    }
}

export class WebMemoryWorker extends WebWorker {
    start() {
    }
}
