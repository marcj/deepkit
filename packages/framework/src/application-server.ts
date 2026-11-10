/*
 * Deepkit Framework
 * Copyright (C) 2021 Deepkit UG, Marc J. Schmidt
 *
 * This program is free software: you can redistribute it and/or modify
 * it under the terms of the MIT License.
 *
 * You should have received a copy of the MIT License along with this program.
 */

import { asyncOperation, getClassName, urlJoin } from '@deepkit/core';
import { RpcClient, RpcKernel } from '@deepkit/rpc';
import cluster from 'cluster';
import { HttpRouter } from '@deepkit/http';
import { BaseEvent, EventDispatcher, eventDispatcher, EventToken } from '@deepkit/event';
import { InjectorContext } from '@deepkit/injector';
import { FrameworkConfig } from './module.config.js';
import { LoggerInterface } from '@deepkit/logger';
import { createRpcConnection, WebWorker, WebWorkerFactory } from './worker.js';
import { RpcControllers } from './rpc.js';
import '@deepkit/type';

export class ServerBootstrapEvent extends BaseEvent {
}

/**
 * Called only once for application server bootstrap (for main process and workers)
 */
export const onServerBootstrap = new EventToken('server.bootstrap', ServerBootstrapEvent);

/**
 * Called only once for application server bootstrap (for main process and workers)
 * as soon as the application server has started
 */
export const onServerBootstrapDone = new EventToken('server.bootstrapDone', ServerBootstrapEvent);

/**
 * Called only once for application server bootstrap (in the main process)
 * as soon as the application server starts.
 */
export const onServerMainBootstrap = new EventToken('server.main.bootstrap', ServerBootstrapEvent);

/**
 * Called only once for application server bootstrap (in the main process)
 * as soon as the application server has started.
 */
export const onServerMainBootstrapDone = new EventToken('server.main.bootstrapDone', ServerBootstrapEvent);

/**
 * Called for each worker as soon as the worker bootstraps.
 */
export const onServerWorkerBootstrap = new EventToken('server.worker.bootstrap', ServerBootstrapEvent);

/**
 * Called only once for application server bootstrap (in the worker process)
 * as soon as the application server has started.
 */
export const onServerWorkerBootstrapDone = new EventToken('server.worker.bootstrapDone', ServerBootstrapEvent);


export class ServerShutdownEvent extends BaseEvent {
}

/**
 * Called when application server shuts down (in master process and each worker).
 */
export const onServerShutdown = new EventToken('server.shutdown', ServerBootstrapEvent);

/**
 * Called when application server shuts down in the main process.
 */
export const onServerMainShutdown = new EventToken('server.main.shutdown', ServerBootstrapEvent);

/**
 * Called when application server shuts down in the worker process.
 */
export const onServerWorkerShutdown = new EventToken('server.worker.shutdown', ServerBootstrapEvent);

type ApplicationServerConfig = Pick<FrameworkConfig, 'server' | 'port' | 'host' | 'httpsPort' |
    'ssl' | 'sslKey' | 'sslCertificate' | 'sslCa' | 'sslCrl' |
    'varPath' | 'selfSigned' | 'workers' | 'publicDir' |
    'debug' | 'debugUrl' | 'gracefulShutdownTimeout' | 'compression' | 'http' | 'logStartup'>;

function needsHttpWorker(config: { publicDir?: string }, rpcControllers: RpcControllers, router: HttpRouter) {
    return Boolean(config.publicDir || rpcControllers.controllers.size || router.getRoutes().length);
}

export class LogStartupListener {
    constructor(
        protected logger: LoggerInterface,
        protected rpcControllers: RpcControllers,
        protected router: HttpRouter,
        protected config: ApplicationServerConfig,
        protected server: ApplicationServer,
    ) {
    }

    @eventDispatcher.listen(onServerMainBootstrapDone)
    onBootstrapDone() {
        for (const [name, controller] of this.rpcControllers.controllers.entries()) {
            this.logger.log('RPC Controller', `<green>${getClassName(controller.controller)}</green>`, `<grey>${name}</grey>`);
        }

        const routes = this.router.getRoutes();

        if (routes.length) {
            this.logger.log(`<green>${routes.length}</green> HTTP routes`);

            let lastController: any = undefined;
            for (const route of routes) {
                if (route.internal) continue;
                if (route.action.type === 'controller' && lastController !== route.action.controller) {
                    lastController = route.action.controller;
                    this.logger.log(`HTTP Controller <green>${getClassName(lastController)}</green>`);
                }
                this.logger.log(`  <green>${route.httpMethods.length === 0 ? 'ANY' : route.httpMethods.join(',')}</green> <yellow>${route.getFullPath()}</yellow>`);
            }
        }

        if (this.config.server) {
            this.logger.log(`Server up and running`);
        } else {
            const host = this.server.getHttpHost();
            if (host) {
                let url = `http://${host}`;

                if (this.config.ssl) {
                    url = `https://${host}:${this.config.httpsPort || this.config.port}`;
                }

                this.logger.log(`HTTP listening at <yellow>${url}</yellow>`);
                if (this.config.debug) {
                    this.logger.log(`Debugger enabled at <yellow>${url}${urlJoin('/', this.config.debugUrl, '/')}</yellow>`);
                }
            }
        }
    }
}

export interface ApplicationServerOptions {
    listenOnSignals?: boolean;
    startHttpServer?: boolean;
}

export class ApplicationServer {
    protected httpWorker?: WebWorker;
    protected started = false;
    protected stopping = false;
    protected onlineWorkers = 0;
    protected needsHttpWorker: boolean;

    public onStop: Promise<void>;
    protected stopResolver!: () => void;

    constructor(
        protected logger: LoggerInterface,
        protected webWorkerFactory: WebWorkerFactory,
        protected eventDispatcher: EventDispatcher,
        protected rootScopedContext: InjectorContext,
        public config: ApplicationServerConfig,
        protected rpcControllers: RpcControllers,
        protected rpcKernel: RpcKernel,
        protected router: HttpRouter,
    ) {
        this.needsHttpWorker = needsHttpWorker(config, rpcControllers, router);
        this.onStop = new Promise((resolve) => this.stopResolver = resolve);
    }

    getHttpWorker(): WebWorker {
        if (!this.httpWorker) throw new Error('HTTP worker not started');
        return this.httpWorker;
    }

    /**
     * Closes all server listener and triggers shutdown events. This is only used for integration tests.
     */
    public async close(graceful = false) {
        if (!this.started) return;

        await this.stopWorkers();
        await this.eventDispatcher.dispatch(onServerShutdown, new ServerShutdownEvent());
        await this.eventDispatcher.dispatch(onServerMainShutdown, new ServerShutdownEvent());
        if (this.httpWorker) await this.httpWorker.close(graceful);
    }

    protected stopWorkers(): Promise<void> {
        if (this.config.workers === 0) return Promise.resolve();

        return asyncOperation((resolve) => {
            cluster.on('exit', async () => {
                if (this.onlineWorkers === 0) {
                    this.logger.debug('All workers offline. Shutting down ...');
                    await this.eventDispatcher.dispatch(onServerShutdown, new ServerShutdownEvent());
                    await this.eventDispatcher.dispatch(onServerMainShutdown, new ServerShutdownEvent());
                    resolve(undefined);
                }
            });

            for (const worker of Object.values(cluster.workers || {})) {
                if (worker) worker.send('stop');
            }
        });
    }

    public async start(
        optionsOrListenOnSignal: boolean | ApplicationServerOptions  = false,
    ) {
        const options: ApplicationServerOptions = typeof optionsOrListenOnSignal === 'boolean'
            ? { listenOnSignals: optionsOrListenOnSignal } : optionsOrListenOnSignal;

        if (this.started) throw new Error('ApplicationServer already started');
        this.started = true;

        if (cluster.isMaster && this.config.logStartup) {
            if (this.config.workers) {
                this.logger.log(`Start server, using ${this.config.workers} workers ...`);
            } else {
                this.logger.log(`Start server ...`);
            }
        }

        await this.eventDispatcher.dispatch(onServerBootstrap, new ServerBootstrapEvent());

        const startHttpServer = options.startHttpServer !== false;

        let killRequests = 0;
        if (this.config.workers > 1 && startHttpServer) {
            if (cluster.isMaster) {
                await this.eventDispatcher.dispatch(onServerMainBootstrap, new ServerBootstrapEvent());

                for (let i = 0; i < this.config.workers; i++) {
                    cluster.fork();
                }

                await asyncOperation((resolve) => {
                    cluster.on('online', () => {
                        this.onlineWorkers++;
                        if (this.onlineWorkers === this.config.workers) resolve(undefined);
                    });

                    cluster.on('exit', (w) => {
                        this.onlineWorkers--;
                        if (this.stopping) return;
                        this.logger.warn(`Worker ${w.id} died. Restarted`);
                        cluster.fork();
                    });
                });

                if (options.listenOnSignals) {
                    const stopServer = (signal: string) => async () => {
                        killRequests++;
                        if (killRequests === 3) {
                            this.logger.warn(`Received ${signal}. Force stopping server ...`);
                            process.exit(1);
                            return;
                        }
                        if (this.stopping) {
                            this.logger.warn(`Received ${signal}. Stopping already in process. Try again to force stop.`);
                            return;
                        }
                        this.stopping = true;
                        this.logger.warn(`Received ${signal}. Stopping server ...`);
                        await this.stopWorkers();
                        this.stopResolver();
                        setTimeout(() => {
                            //give onAppShutdown a chance to react
                            process.exit(0);
                        }, 10);
                    };
                    process.on('SIGINT', stopServer('SIGINT'));
                    process.on('SIGTERM', stopServer('SIGTERM'));
                }

                await this.eventDispatcher.dispatch(onServerBootstrapDone, new ServerBootstrapEvent());
                await this.eventDispatcher.dispatch(onServerMainBootstrapDone, new ServerBootstrapEvent());
            } else {
                process.on('message', async (msg: any) => {
                    if (msg === 'stop') {
                        await this.eventDispatcher.dispatch(onServerShutdown, new ServerShutdownEvent());
                        await this.eventDispatcher.dispatch(onServerWorkerShutdown, new ServerShutdownEvent());
                        if (this.httpWorker) await this.httpWorker.close(true);
                        process.exit(0);
                    }
                });

                process.on('SIGINT', async () => {
                    //we don't do anything in sigint, as the master controls our process.
                    //we need to register to it though so the process doesn't get killed.
                });

                process.on('SIGTERM', async () => {
                    //we don't do anything in sigint, as the master controls our process.
                    //we need to register to it though so the process doesn't get killed.
                });

                await this.eventDispatcher.dispatch(onServerWorkerBootstrap, new ServerBootstrapEvent());
                if (this.needsHttpWorker) {
                    this.httpWorker = this.webWorkerFactory.create(cluster.worker!.id, this.config);
                    await this.httpWorker.start();
                }
                await this.eventDispatcher.dispatch(onServerBootstrapDone, new ServerBootstrapEvent());
                await this.eventDispatcher.dispatch(onServerWorkerBootstrapDone, new ServerBootstrapEvent());
            }
        } else {
            if (options.listenOnSignals) {
                const stopServer = (signal: string) => async () => {
                    killRequests++;
                    if (killRequests === 3) {
                        this.logger.warn(`Received ${signal}. Force stopping server ...`);
                        process.exit(1);
                        return;
                    }
                    if (this.stopping) {
                        this.logger.warn(`Received ${signal}. Stopping already in process. Try again to force stop.`);
                        return;
                    }
                    this.stopping = true;
                    this.logger.warn('Received SIGINT. Stopping server ...');
                    await this.eventDispatcher.dispatch(onServerShutdown, new ServerShutdownEvent());
                    await this.eventDispatcher.dispatch(onServerMainShutdown, new ServerShutdownEvent());
                    if (this.httpWorker) await this.httpWorker.close(true);
                    this.stopResolver();
                    setTimeout(() => {
                        //give onAppShutdown a chance to react
                        process.exit(0);
                    }, 10);
                };
                process.on('SIGINT', stopServer('SIGINT'));
                process.on('SIGTERM', stopServer('SIGTERM'));
            }
            await this.eventDispatcher.dispatch(onServerBootstrap, new ServerBootstrapEvent());
            await this.eventDispatcher.dispatch(onServerMainBootstrap, new ServerBootstrapEvent());
            if (this.needsHttpWorker && startHttpServer) {
                this.httpWorker = this.webWorkerFactory.create(1, this.config);
                await this.httpWorker.start();
            }
            await this.eventDispatcher.dispatch(onServerBootstrapDone, new ServerBootstrapEvent());
            await this.eventDispatcher.dispatch(onServerMainBootstrapDone, new ServerBootstrapEvent());
        }

        if (cluster.isMaster && this.config.logStartup) {
            this.logger.log(`Server started.`);
        }

        return options.listenOnSignals ? this.onStop : Promise.resolve();
    }

    public getHttpHost(): string | undefined {
        const port = this.config.ssl ? this.config.httpsPort || this.config.port : this.config.port;
        return this.httpWorker !== undefined ? `${this.config.host}:${port}` : undefined;
    }

    public getWorker(): WebWorker {
        if (!this.httpWorker) throw new Error('No WebWorker registered yet. Did you start()?');
        return this.httpWorker;
    }

    public createClient(): RpcClient {
        const context = this.rootScopedContext;
        const rpcKernel = this.rpcKernel;

        return new RpcClient({
            connect(connection) {
                const kernelConnection = createRpcConnection(context, rpcKernel, {
                    writeBinary: (buffer) => connection.readBinary(buffer),
                    close: () => connection.onClose('closed'),
                });

                connection.onConnected({
                    close() {
                        kernelConnection.close();
                    },
                    writeBinary(message: Uint8Array) {
                        queueMicrotask(() => {
                            kernelConnection.feed(message);
                        });
                    }
                });
            }
        });
    }
}

export class InMemoryApplicationServer extends ApplicationServer {

}
