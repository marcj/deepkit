/*
 * Deepkit Framework
 * Copyright (C) 2021 Deepkit UG, Marc J. Schmidt
 *
 * This program is free software: you can redistribute it and/or modify
 * it under the terms of the MIT License.
 *
 * You should have received a copy of the MIT License along with this program.
 */

import { arrayRemoveItem, asyncOperation, formatError } from '@deepkit/core';
import { Host } from './host.js';
import { createConnection, Socket } from 'net';
import { connect as createTLSConnection, TLSSocket } from 'tls';
import { Command, TransactionalMessage } from './command/command.js';
import { stringifyType, Type, uuid } from '@deepkit/type';
import { AutoBuffer, BSONBinarySerializer, BsonStreamReader, getBSONSerializer } from '@deepkit/bson';
import { HandshakeCommand } from './command/handshake.js';
import { detectTopology, MongoClientConfig, updateKnownHosts, updateStaleness } from './config.js';
import { MongoConnectionError, MongoError } from './error.js';
import { DatabaseTransaction } from '@deepkit/orm';
import { CommitTransactionCommand } from './command/commitTransaction.js';
import { AbortTransactionCommand } from './command/abortTransaction.js';
import { DataEvent, EventDispatcher, EventTokenSync } from '@deepkit/event';
import { IsMasterCommand } from './command/ismaster.js';
import { Logger } from '@deepkit/logger';
import { CommandOptions, ConnectionOptions } from './options.js';

export enum MongoConnectionStatus {
    pending = 'pending',
    connecting = 'connecting',
    connected = 'connected',
    disconnected = 'disconnected',
    error = 'error',
}

export interface ConnectionRequest {
    /**
     * When set to true, connections to a primary are returned.
     *
     * Is set to true automatically when a write operation is executed.
     *
     * Default is false.
     */
    writable: boolean;

    readPreference: ConnectionOptions['readPreference'];

    readPreferenceTags?: ConnectionOptions['readPreferenceTags'];
}

export class MongoStats {
    /**
     * How many connections have been created.
     */
    connectionsCreated: number = 0;

    connectionsError: number = 0;

    /**
     * How many connections have been reused.
     */
    connectionsReused: number = 0;

    /**
     * How many connection requests were queued because pool was full.
     */
    connectionsQueued: number = 0;

    bytesReceived: number = 0;
    bytesSent: number = 0;

    heartbeats: number = 0;
    heartbeatsFailed: number = 0;

    topologyChanges: number = 0;
}

export const onMongoTopologyChange = new EventTokenSync<DataEvent<{ pool: MongoConnectionPool }>>('mongo.topologyChange');

export const onMongoNewHost = new EventTokenSync<DataEvent<{ pool: MongoConnectionPool, host: Host }>>('mongo.newHost');

interface QueueEntry {
    resolve: (connection: MongoConnection) => void;
    reject: (error: Error) => void;
    request: ConnectionRequest;
    time: number;
}

export class MongoConnectionPool {
    protected connectionId: number = 0;
    public closed: boolean = false;

    /**
     * Connections, might be in any state, not necessarily connected.
     */
    public connections: MongoConnection[] = [];

    protected queue: QueueEntry[] = [];

    protected lastError?: Error;

    protected lastHeartbeat: Date = new Date(0);
    protected heartbeatTimer?: ReturnType<typeof setTimeout>;

    protected get scopedLogger() {
        return this.logger.scoped('mongo');
    }

    protected connectPromise?: Promise<void>;
    protected connectPromiseHandles?: { resolve: () => void, reject: (error: Error) => void };

    constructor(
        protected config: MongoClientConfig,
        protected serializer: BSONBinarySerializer,
        protected stats: MongoStats,
        public logger: Logger,
        public eventDispatcher: EventDispatcher,
    ) {
        for (const host of config.hosts) {
            this.eventDispatcher.dispatch(onMongoNewHost, { pool: this, host });
        }
    }

    public async connect() {
        if (this.closed) {
            this.closed = false;
            this.connectPromise = undefined;
        } else {
            if (this.isConnected()) return;
        }

        if (this.connectPromise) {
            await this.connectPromise;
            return;
        }

        if (this.heartbeats > 0) {
            // heartbeat bigger than 0 means we got a successful topology discovery,
            // so we return whatever we had before.
            await this.connectPromise;
            return;
        }

        // wait for topology change: we need at least one secondary or primary online
        return this.connectPromise = asyncOperation<void>((resolve, reject) => {
            this.connectPromiseHandles = { resolve, reject };
            this.heartbeat();
        });
    }

    protected createErrorForUnmetRequest(request: ConnectionRequest): MongoConnectionError {
        let message = `Connection failed: could not find host for connection request. (readPreference=${request.readPreference}, topology=${this.config.shortSummary()})`;
        if (request.writable || request.readPreference === 'primary') {
            message = `Connection failed: no primary available. (readPreference=${request.readPreference}, topology=${this.config.shortSummary()})`;
        }
        return new MongoConnectionError(message);
    }

    protected onTopologyProgress(status: 'start' | 'host' | 'done') {
        // when a new host's type was detected

        // todo: we need to have a state that shows the progress of topology discovery
        //  that is, if the progress ended, we need to
        //  - reject connectPromise
        //  - reject all pending queue requests

        if (status === 'host') {
            // check if we are done
            if (this.activeHeartbeats === 0) {
                status = 'done';
            }
        }

        if (status === 'done') {
            this.heartbeats++;

            this.config.topology = detectTopology(this.config.hosts);
            updateStaleness(this.config);
            const topologyKey = this.config.topologyKey();

            if (topologyKey !== this.config.lastTopologyKey) {
                this.stats.topologyChanges++;
                this.scopedLogger.debug(`Topology detected: ${this.config.topology}, ${this.config.shortSummary()}`);
                this.config.lastTopologyKey = topologyKey;
                this.eventDispatcher.dispatch(onMongoTopologyChange, { pool: this });
            }

            const queue = this.queue.splice(0, this.queue.length);
            for (const waiter of queue) {
                const host = this.findHostForRequest(waiter.request);
                if (host) {
                    const connection = this.getConnectionForHost(host);
                    if (connection) {
                        waiter.resolve(connection);
                        continue;
                    }
                    // put back in queue
                    this.queue.push(waiter);
                } else {
                    waiter.reject(this.createErrorForUnmetRequest(waiter.request));
                }
            }

            if (this.connectPromiseHandles) {
                if (this.isConnected()) {
                    this.connectPromiseHandles.resolve();
                } else {
                    this.connectPromiseHandles.reject(new MongoConnectionError('Connection failed: no hosts available. ' + this.config.shortSummary()));
                }
                this.connectPromiseHandles = undefined;
            }
        }
    }

    /**
     * Returns true when at least one primary or secondary host is connected.
     */
    public isConnected(): boolean {
        for (const host of this.config.hosts) {
            if (host.stats.connectionsAlive > 0 && (host.isReadable() || host.isWritable())) {
                return true;
            }
        }
        return false;
    }

    /**
     * Returns true when at least one connection is writable.
     */
    public isWritable(): boolean {
        for (const connection of this.connections) {
            if (connection.host.isWritable()) return true;
        }

        return false;
    }

    public getConnectedConnections(): MongoConnection[] {
        return this.connections.filter(v => v.isConnected());
    }

    public close() {
        this.closed = true;

        clearTimeout(this.heartbeatTimer);
        this.heartbeatTimer = undefined;

        // import to work on the copy, since Connection.onClose modifies this.connections.
        const connections = this.connections.slice(0);
        for (const connection of connections) {
            connection.close();
        }
        for (const waiter of this.queue) {
            waiter.reject(new MongoConnectionError('Connection pool closed'));
        }
        this.queue = [];
        this.lastError = undefined;
        this.connections = [];
        this.lastHeartbeat = new Date(0);
    }

    protected heartbeats: number = 0;
    protected activeHeartbeats: number = 0;

    protected heartbeatHost(host: Host): void {
        if (host.lastUpdatePromise) {
            return;
        }

        const topologyId = this.config.topologyId;

        this.activeHeartbeats++;
        host.lastUpdatePromise = new Promise<void>(async (resolve) => {
            let connection = this.getConnectionForHost(host);
            if (!connection) {
                // we force create a connection to this host, ignoring limits
                // as we don't want to wait for busy connections to be released.
                connection = this.createConnection(host);
                connection.reserved = true;
                host.stats.connectionsReserved++;
            }

            try {
                host.stats.heartbeats++;

                this.scopedLogger.debug(`Heartbeat host ${host.id} (${host.hostname}:${host.port})`);
                await connection.connect();
                const start = Date.now();
                const data = await connection.execute(new IsMasterCommand());
                if (this.closed) return;

                if (topologyId !== this.config.topologyId) {
                    // this is an old request which is not relevant anymore
                    return;
                }

                host.lastUpdateTime = new Date;
                host.latency = Date.now() - start;
                host.dead = false;
                host.setType(host.getTypeFromIsMasterResult(data));
                host.replicaSetName = data.setName;
                host.id = data.me ? data.me : host.hostname + ':' + host.port;
                host.hosts = data.hosts || [];
                host.passives = data.passives || [];
                host.lastWriteDate = data.lastWrite?.lastWriteDate;
                const newHosts = updateKnownHosts(this.config);
                for (const newHost of newHosts) {
                    this.eventDispatcher.dispatch(onMongoNewHost, { pool: this, host: newHost });
                    this.scopedLogger.debug(`Found new host ${newHost.label})`);
                    this.heartbeatHost(newHost);
                }

                this.scopedLogger.debug(`Heartbeat host ${host.id}:`, data);
                host.subsequentHeartbeatErrors = 0;
            } catch (error) {
                host.subsequentHeartbeatErrors++;
                if (host.subsequentHeartbeatErrors <= 10) {
                    const errors = `${host.subsequentHeartbeatErrors}/10`;
                    this.scopedLogger.warn(`Mongo heartbeat connection error for host ${host.label} (${errors}): ${formatError(error)}}}`);
                }
                host.status = 'heartbeat(): ' + formatError(error);
                host.dead = true;
                host.type = 'unknown';
                host.stats.heartbeatsFailed++;
            } finally {
                connection.release();
                resolve();
            }
        }).catch((error) => {
            this.scopedLogger.log(`Mongo heartbeat general error for host ${host.label}: ${formatError(error)}`);
        }).finally(() => {
            this.activeHeartbeats--;
            host.lastUpdatePromise = undefined;
            this.onTopologyProgress('host');
        });
    }

    /**
     * Explores the topology and updates the known hosts.
     */
    heartbeat(force: boolean = false): void {
        if (this.closed) return;
        if (!force && Date.now() - this.lastHeartbeat.getTime() < this.config.options.heartbeatFrequencyMS) return;
        this.lastHeartbeat = new Date();
        this.stats.heartbeats++;

        this.scopedLogger.debug(`Heartbeat start ${this.stats.heartbeats}`);

        this.config.getHosts().then((hosts) => {
            if (this.closed) return;
            for (const host of hosts) {
                this.heartbeatHost(host);
            }
        }).catch((error) => {
            this.stats.heartbeatsFailed++;
            this.scopedLogger.error(`Mongo heartbeat error: ${formatError(error)}`);
        }).finally(() => {
            if (this.closed) return;
            // exactly one scheduled heartbeat, and it always runs: unforced, a timer that fires a millisecond
            // early (setTimeout vs. Date.now()) would return without scheduling the next one, and the
            // topology would never be explored again.
            clearTimeout(this.heartbeatTimer);
            this.heartbeatTimer = setTimeout(() => this.heartbeat(true), this.config.options.heartbeatFrequencyMS);
        });
    }

    protected findHostForRequest(request: ConnectionRequest): Host | undefined {
        if (this.config.topology === 'single') return this.config.hosts[0];

        let bestHost: Host | undefined = undefined;
        let bestLatency = Infinity;
        let bestBusyConnections = Infinity;
        let bestFreeConnections = -1;
        let hasPrimary = false;
        let hasSecondary = false;

        const tags = request.readPreferenceTags || this.config.options.readPreferenceTags;

        for (const host of this.config.hosts) {
            if (!host.isUsable()) continue;
            const isPrimary = host.type === 'primary';
            const isSecondary = host.type === 'secondary';

            if (request.writable && isPrimary) return host;
            if (request.writable && !isPrimary) continue;

            if (tags) {
                let found = false;
                for (const tag of this.config.options.parsePreferenceTags(tags)) {
                    // todo this is wrong since "tag sets" means {}[]
                    if (host.tags[tag.key] === tag.value) {
                        found = true;
                        break;
                    }
                }
                if (!found) continue;
            }

            if (host.stale) continue;

            const busyConnections = host.stats.connectionsReserved;
            const freeConnections = host.stats.connectionsAlive - busyConnections;
            const latency = host.latency;

            if (request.readPreference === 'primary' && !isPrimary) continue;
            if (request.readPreference === 'secondary' && !isSecondary) continue;

            hasPrimary = hasPrimary || isPrimary;
            hasSecondary = hasSecondary || isSecondary;

            let selectHost = false;

            if (request.readPreference === 'primaryPreferred' && isPrimary) {
                return host;
            }
            if (request.readPreference === 'secondaryPreferred' && isSecondary) {
                selectHost = true;
            }
            if (request.readPreference === 'nearest') {
                if (latency < bestLatency) {
                    bestLatency = latency;
                    selectHost = true;
                }
            }
            if (!selectHost) {
                if (busyConnections < bestBusyConnections) {
                    bestBusyConnections = busyConnections;
                    selectHost = true;
                } else if (busyConnections === bestBusyConnections && freeConnections > bestFreeConnections) {
                    bestFreeConnections = freeConnections;
                    selectHost = true;
                }
            }

            if (selectHost) {
                bestHost = host;
            }
        }

        return bestHost;
    }

    protected createConnection(host: Host): MongoConnection {
        this.stats.connectionsCreated++;
        host.stats.connectionsCreated++;
        host.stats.connectionsAlive++;
        const connection = new MongoConnection(this.connectionId++, host, this.config, this.serializer, (connection) => {
            arrayRemoveItem(host.connections, connection);
            arrayRemoveItem(this.connections, connection);
            if (connection.status === MongoConnectionStatus.error) {
                this.stats.connectionsError++;
                host.stats.connectionsError++;
            }
            host.stats.connectionsAlive--;
            if (connection.reserved) {
                host.stats.connectionsReserved--;
            }
            // onClose does not automatically reconnect. Only new commands re-establish connections.
        }, (connection) => {
            this.release(connection);
        }, (bytesSent) => {
            host.stats.bytesSent += bytesSent;
            this.stats.bytesSent += bytesSent;
        }, (bytesReceived) => {
            host.stats.bytesReceived += bytesReceived;
            this.stats.bytesReceived += bytesReceived;
        });
        connection.connect().catch((error) => {
            host.status = 'connect(): ' + formatError(error);
        });
        host.connections.push(connection);
        this.connections.push(connection);
        return connection;
    }

    protected handleQueueEntry(i: number, host: Host): boolean {
        const waiter = this.queue[i];
        if (!waiter) return false;

        // check if timed out
        if (this.config.options.waitQueueTimeoutMS && Date.now() - waiter.time > this.config.options.waitQueueTimeoutMS) {
            this.queue.splice(i, 1);
            waiter.reject(new MongoConnectionError(`Connection acquisition timed out after ${Date.now() - waiter.time}ms (max ${this.config.options.waitQueueTimeoutMS}ms)`));
            return false;
        }

        if (!host.isUsable()) return false;
        if (waiter.request.writable && !host.isWritable()) return false;
        if (waiter.request.readPreference === 'primary' && !host.isWritable()) return false;
        if (waiter.request.readPreference === 'secondary' && !host.isReadable()) return false;

        return true;
    }

    protected release(connection: MongoConnection) {
        for (let i = 0; i < this.queue.length; i++) {
            const waiter = this.queue[i];

            if (!this.handleQueueEntry(i, connection.host)) {
                continue;
            }

            connection.host.stats.connectionsReused++;
            this.stats.connectionsReused++;

            this.queue.splice(i, 1);
            waiter.resolve(connection);
            // we don't set reserved/set cleanupTimeout,
            // since the connection is already reserved and the timeout
            // is only set when the connection actually starting idling.
            // as soon a connection becomes reserved, the timer is stopped.
            return;
        }

        connection.reserved = false;
        connection.host.stats.connectionsReserved--;

        // the connection might have closed already
        if (!connection.closed) {
            if (connection.cleanupTimeout) clearTimeout(connection.cleanupTimeout);

            connection.cleanupTimeout = setTimeout(() => {
                if (this.connections.length <= this.config.options.minPoolSize) {
                    return;
                }

                connection.close();
            }, this.config.options.maxIdleTimeMS);
        }
    }

    protected applyRequestDefaults(request: Partial<ConnectionRequest>): ConnectionRequest {
        if (request.writable === undefined) request.writable = false;
        if (!request.readPreference) {
            request.readPreference = this.config.options.readPreference || 'primary';
        }
        return request as ConnectionRequest;
    }

    /**
     * Returns an existing or new connection, that needs to be released once done using it.
     */
    async getConnection(partialRequest: Partial<ConnectionRequest> = {}): Promise<MongoConnection> {
        if (this.closed) {
            throw new MongoError('Connection pool is closed');
        }

        const request = this.applyRequestDefaults(partialRequest);

        this.heartbeat();

        const host = this.findHostForRequest(request);

        if (host) {
            const connection = this.getConnectionForHost(host);
            if (connection) return connection;

            if (host.connections.length < this.config.options.maxPoolSize) {
                const connection = this.createConnection(host);
                host.stats.connectionsReserved++;
                connection.reserved = true;
                await connection.connect();
                return connection;
            }
            host.stats.connectionsQueued++;
        } else {
            if (this.heartbeats > 0) {
                // we have a known topology, but no host is available
                throw this.createErrorForUnmetRequest(request);
            }
        }

        return asyncOperation((resolve, reject) => {
            this.stats.connectionsQueued++;
            this.queue.push({ resolve, reject, request, time: Date.now() });
        });
    }

    protected getConnectionForHost(host: Host): MongoConnection | undefined {
        for (const connection of host.connections) {
            if (!connection.isConnected()) {
                continue;
            }
            if (connection.reserved) {
                continue;
            }

            this.stats.connectionsReused++;
            host.stats.connectionsReused++;
            host.stats.connectionsReserved++;
            connection.reserved = true;
            if (connection.cleanupTimeout) {
                clearTimeout(connection.cleanupTimeout);
                connection.cleanupTimeout = undefined;
            }

            return connection;
        }
        return;
    }
}

export function readUint32LE(buffer: Uint8Array | ArrayBuffer, offset: number = 0): number {
    return buffer[offset] + (buffer[offset + 1] * 2 ** 8) + (buffer[offset + 2] * 2 ** 16) + (buffer[offset + 3] * 2 ** 24);
}

/**
 * This class is responsible to monitor leaking transactions and automatically
 * rollback them if the DatabaseSession was garbage collected without commit or rollback.
 */
export class MongoDatabaseTransactionMonitor {
    finalizer = new FinalizationRegistry<{
        connection: MongoConnection;
        lsid: { id: string };
        txnNumber: bigint;
    }>((value) => {
        this.logger.scoped('mongo').warn(`Leaking transaction detected. Automatically rollback transaction ${value.txnNumber}`);
        value.connection.execute(new AbortTransactionCommand({ ...value, autocommit: false }))
            .catch((error) => {
                this.logger.scoped('mongo').error(`Could not rollback transaction ${value.txnNumber}: ${formatError(error)}`);
            }).finally(() => {
            value.connection.release();
        });
    });

    constructor(public logger: Logger) {
    }

    setLogger(logger: Logger) {
        this.logger = logger;
    }
}

export class MongoDatabaseTransaction extends DatabaseTransaction {
    commandOptions: CommandOptions = {};
    static txnNumber: bigint = 0n;

    connection?: MongoConnection;
    lsid?: { id: string };
    txnNumber: bigint = 0n;
    started: boolean = false;

    constructor(protected monitor: MongoDatabaseTransactionMonitor) {
        super();
    }

    with(commandOptions: CommandOptions): this {
        Object.assign(this.commandOptions, commandOptions);
        return this;
    }

    applyTransaction(cmd: TransactionalMessage) {
        if (!this.lsid || !this.connection) return;
        if (!this.started && !cmd.abortTransaction && !cmd.commitTransaction) {
            this.started = true;
            cmd.startTransaction = true;
            this.monitor.finalizer.register(this, { connection: this.connection, lsid: this.lsid, txnNumber: this.txnNumber });
        }
        if (this.started) {
            cmd.lsid = this.lsid;
            cmd.txnNumber = this.txnNumber;
            cmd.autocommit = false;
        }
    }

    async begin() {
        if (!this.connection) return;
        // see https://github.com/mongodb/specifications/blob/master/source/sessions/driver-sessions.rst
        this.lsid = { id: uuid() };
        this.txnNumber = MongoDatabaseTransaction.txnNumber++;
    }

    async commit() {
        if (!this.connection) return;
        if (this.ended) throw new MongoError('Transaction ended already');

        await this.connection.execute(new CommitTransactionCommand());
        this.ended = true;
        this.connection.release();
        this.monitor.finalizer.unregister(this);
    }

    async rollback() {
        if (!this.connection) return;
        if (this.ended) throw new MongoError('Transaction ended already');
        if (!this.started) return;

        await this.connection.execute(new AbortTransactionCommand());
        this.ended = true;
        this.connection.release();
        this.monitor.finalizer.unregister(this);
    }
}

/** The header of an OP_MSG: messageLength, requestID, responseTo, opCode, flags and the section kind. */
const messageHeaderSize = 16 + 4 + 1;

/** A connection does not hold on to the memory of an unusually large message. */
const maxRetainedMessageBuffer = 16 * 1024 * 1024;

function createMessageBuffer(): AutoBuffer {
    return new AutoBuffer(messageHeaderSize, 16 * 1024);
}

export class MongoConnection {
    protected messageId: number = 0;
    status: MongoConnectionStatus = MongoConnectionStatus.pending;

    public connectingPromise?: Promise<void>;
    public lastCommand?: { command: Command<unknown>, promise?: Promise<any> };

    public activeCommands: number = 0;
    public executedCommands: number = 0;
    public activeTransaction: boolean = false;
    public reserved: boolean = false;
    public cleanupTimeout?: ReturnType<typeof setTimeout>;

    protected socket: Socket | TLSSocket;

    public transaction?: WeakRef<MongoDatabaseTransaction>;

    responseParser: BsonStreamReader;
    error?: Error;

    bytesReceived: number = 0;
    bytesSent: number = 0;
    closed: boolean = false;

    protected boundSendMessage = this.sendMessage.bind(this);

    protected messageBuffer = createMessageBuffer();

    constructor(
        public id: number,
        public host: Host,
        protected config: MongoClientConfig,
        protected serializer: BSONBinarySerializer,
        protected onClose: (connection: MongoConnection) => void,
        protected onRelease: (connection: MongoConnection) => void,
        protected onSent: (bytes: number) => void,
        protected onReceived: (bytes: number) => void,
    ) {
        this.responseParser = new BsonStreamReader(this.onResponse.bind(this));

        if (this.config.options.ssl === true) {
            const options: { [name: string]: any } = {
                host: host.hostname,
                port: host.port,
                timeout: config.options.socketTimeoutMS,
                servername: host.hostname,
            };
            const optional = {
                ca: config.options.tlsCAFile,
                key: config.options.tlsCertificateKeyFile || config.options.tlsCertificateFile,
                cert: config.options.tlsCertificateFile,
                passphrase: config.options.tlsCertificateKeyFilePassword,

                rejectUnauthorized: config.options.rejectUnauthorized,
                crl: config.options.tlsCRLFile,
                checkServerIdentity: config.options.checkServerIdentity ? undefined : () => undefined,
            };

            for (const i in optional) {
                if (optional[i]) options[i] = optional[i];
            }

            this.socket = createTLSConnection(options);
            this.socket.on('data', (data) => {
                this.bytesReceived += data.byteLength;
                this.onReceived(data.byteLength);
                this.responseParser.feed(data);
            });
        } else {
            this.socket = createConnection({
                host: host.hostname,
                port: host.port,
                timeout: config.options.socketTimeoutMS,
            });

            this.socket.on('data', (data) => {
                this.bytesReceived += data.byteLength;
                this.onReceived(data.byteLength);
                this.responseParser.feed(data);
            });

            // const socket = this.socket = turbo.connect(host.port, host.hostname);
            // // this.socket.setNoDelay(true);
            // const buffer = Buffer.allocUnsafe(this.bufferSize);
            //
            // function read() {
            //     socket.read(buffer, onRead);
            // }
            //
            // function onRead(err: any, buf: Buffer, bytes: number) {
            //     if (!bytes) return;
            //     responseParser.feed(buf, bytes);
            //     read();
            // }
            //
            // read();
        }

        this.connectingPromise = asyncOperation(async (resolve, reject) => {
            let timeout: ReturnType<typeof setTimeout> | undefined = undefined;

            if (this.config.options.connectTimeoutMS > 0) {
                timeout = setTimeout(() => {
                    this.socket.destroy();
                    reject(new MongoConnectionError(`Connect timeout after ${this.config.options.connectTimeoutMS}ms`));
                }, this.config.options.connectTimeoutMS);
            }
            // this.socket.on('timeout', () => {
            //     this.socket.destroy(new Error('Socket timeout'));
            // });

            this.socket.on('close', () => {
                clearTimeout(timeout);
                clearTimeout(this.cleanupTimeout);
                this.cleanupTimeout = undefined;
                if (this.closed) return;
                this.status = MongoConnectionStatus.disconnected;
                this.connectingPromise = undefined;
                this.closed = true;
                if (this.lastCommand) {
                    this.lastCommand.command.reject(this.error || new MongoConnectionError('Connection closed'));
                    this.lastCommand = undefined;
                }
                this.onClose(this);
                reject(new MongoConnectionError('Connection closed'));
                this.socket.destroy();
            });

            this.socket.on('error', (error) => {
                this.status = MongoConnectionStatus.error;
                this.connectingPromise = undefined;
                this.closed = true;
                this.error = new MongoConnectionError(`Connection failed ${formatError(error.message)}`);
                this.onClose(this);
                reject(this.error);
                this.socket.destroy();
            });

            if (this.socket.destroyed) {
                this.status = MongoConnectionStatus.disconnected;
                this.connectingPromise = undefined;
                resolve();
            }

            if (await this.execute(new HandshakeCommand())) {
                clearTimeout(timeout);
                this.status = MongoConnectionStatus.connected;
                this.socket.setTimeout(this.config.options.socketTimeoutMS);
                this.connectingPromise = undefined;
                resolve();
            } else {
                this.status = MongoConnectionStatus.error;
                this.error = new MongoError('Connection error: Could not complete handshake 🤷‍️');
                this.connectingPromise = undefined;
                reject(this.error);
            }
        });
    }

    isConnected() {
        return this.status === MongoConnectionStatus.connected;
    }

    isConnecting() {
        return this.status === MongoConnectionStatus.connecting;
    }

    close() {
        this.status = MongoConnectionStatus.disconnected;
        clearTimeout(this.cleanupTimeout);
        this.cleanupTimeout = undefined;
        this.socket.destroy();
    }

    public release() {
        //connections attached to a transaction are not automatically released.
        //only with commit/rollback actions
        if (this.transaction?.deref()) return;

        if (this.transaction) this.transaction = undefined;
        this.onRelease(this);
    }

    /**
     * When a full message from the server was received.
     */
    protected onResponse(response: Uint8Array) {
        //we remove the header for the command
        const size = readUint32LE(response);
        const offset = 16 + 4 + 1; //MSG response
        // const offset = 16 + 4 + 8 + 4 + 4; //QUERY_REPLY
        const message = response.slice(offset, size);

        if (!this.lastCommand) throw new MongoError(`Got a server response without active command`);

        this.lastCommand.command.handleResponse(message);
    }

    /**
     * Puts a command on the queue and executes it when queue is empty.
     * A promises is return that is resolved with the  when executed successfully, or rejected
     * when timed out, parser error, or any other error.
     */
    public async execute<T extends Command<unknown>>(command: T): Promise<ReturnType<T['execute']>> {
        await this.connectingPromise;
        if (this.status === MongoConnectionStatus.disconnected) throw new MongoError('Connection already disconnected');

        if (this.lastCommand && this.lastCommand.promise) {
            await this.lastCommand.promise;
        }

        this.lastCommand = { command };
        this.activeCommands++;
        this.executedCommands++;
        this.host.stats.commandsActive++;
        this.host.stats.commandsExecuted++;
        command.sender = this.boundSendMessage;
        try {
            this.lastCommand.promise = command.execute(this.config, this.host, this.transaction?.deref());
            return await this.lastCommand.promise;
        } catch (error) {
            // if error suggests that the topology changed, we need to re-try
            // this.config.invalidate()
            this.host.stats.commandsFailed++;
            (error as Error).message += ', on connection ' + this.host.id + ' (' + this.host.type + ')';
            throw error;
        } finally {
            this.lastCommand = undefined;
            this.activeCommands--;
            this.host.stats.commandsActive--;
        }
    }

    protected sendMessage<T>(type: Type, message: T) {
        const messageBuffer = this.messageBuffer;

        try {
            messageBuffer.apply(getBSONSerializer(this.serializer, type), message);
            const buffer = messageBuffer.buffer;

            //header, 16 bytes + OP_MSG, 5 bytes
            const writer = messageBuffer.state.writer;
            writer.offset = 0;
            writer.writeInt32(buffer.byteLength); //messageLength, 4
            writer.writeInt32(++this.messageId); //requestID, 4
            writer.writeInt32(0); //responseTo, 4
            writer.writeInt32(2013); //OP_MSG, 4
            writer.writeUint32(0); //message flags, 4
            writer.writeByte(0); //kind 0, 1

            //detect backPressure
            this.bytesSent += buffer.byteLength;
            this.onSent(buffer.byteLength);
            this.socket.write(buffer);

            // The kernel copies what it accepts during write(), so the buffer can be used for the next message.
            // Only what it did not accept stays queued, and then node still needs this memory.
            if (this.socket.writableLength > 0) {
                messageBuffer.dispose();
                this.messageBuffer = createMessageBuffer();
            } else if (buffer.byteLength > maxRetainedMessageBuffer) {
                messageBuffer.releaseLarge();
            }
        } catch (error) {
            console.log('failed sending message', message, 'for type', stringifyType(type));
            throw error;
        }
    }

    async connect(): Promise<void> {
        return this.connectingPromise;
    }
}
