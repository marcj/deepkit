import { HostConnections, RequestQueue } from '@deepkit/net';

import { PostgresClientConnection } from './connection.js';
import { PostgresEncoder } from './encoder.js';
import { PostgresConnectionError } from './errors.js';
import { PostgresClientOptions, ResolvedPostgresOptions, resolvePostgresOptions } from './options.js';

interface Waiter {
    resolve: (connection: PostgresClientConnection) => void;
    reject: (error: Error) => void;
    exclusive: boolean;
    timer?: ReturnType<typeof setTimeout>;
}

/**
 * Pool of connections to one server.
 *
 * An idle connection is used first. When there is none a new one is opened up to max, and only after that
 * connections are shared via pipelining up to maxPipelineDepth. A user that needs the connection for itself,
 * like a transaction or a long running read, asks for it to be exclusive and waits for a free one.
 */
export class PostgresClient {
    readonly options: ResolvedPostgresOptions;
    protected connections = new HostConnections<PostgresClientConnection>();
    protected waiters = new RequestQueue<Waiter>();
    protected connecting: number = 0;
    protected encoder: PostgresEncoder;
    protected closed: boolean = false;
    protected timer?: ReturnType<typeof setInterval>;

    /** How many statements each new connection keeps on the server, 0 turns it off. */
    maxPreparedStatements: number = 256;

    constructor(options: PostgresClientOptions = {}) {
        this.options = resolvePostgresOptions(options);
        this.encoder = new PostgresEncoder(this.options.parseInputDatesAsUTC);
    }

    /** Connections that are open or being opened. */
    get size(): number {
        return this.connections.all.length + this.connecting;
    }

    /**
     * Returns a connection without waiting when one is available, as an idle one or on an existing connection
     * through pipelining. Has to be given back with release.
     */
    tryAcquire(exclusive: boolean): PostgresClientConnection | undefined {
        if (this.closed) return undefined;
        if (!exclusive && this.options.preferPipelineDepth > 1) {
            const busy = this.connections.acquirePipelined(this.options.preferPipelineDepth);
            if (busy !== undefined) return busy;
        }
        const idle = this.connections.acquireIdle(exclusive);
        if (idle !== undefined) return idle;
        if (exclusive || this.options.maxPipelineDepth <= 1 || this.size < this.options.max) return undefined;
        return this.connections.acquirePipelined(this.options.maxPipelineDepth);
    }

    /** Returns a connection that is ready to use and has to be given back with release. */
    acquire(exclusive: boolean = true): Promise<PostgresClientConnection> {
        if (this.closed) return Promise.reject(new PostgresConnectionError('Connection pool is closed'));
        const connection = this.tryAcquire(exclusive);
        if (connection !== undefined) return Promise.resolve(connection);
        if (this.size < this.options.max) return this.open(exclusive);
        return new Promise<PostgresClientConnection>((resolve, reject) => {
            const waiter: Waiter = { resolve, reject, exclusive };
            const timeout = this.options.connectionTimeoutMillis;
            if (timeout > 0) {
                waiter.timer = setTimeout(() => this.waiterTimedOut(waiter), timeout);
                waiter.timer.unref?.();
            }
            this.waiters.push(waiter);
        });
    }

    protected waiterTimedOut(waiter: Waiter): void {
        for (let i = 0; i < this.waiters.size; i++) {
            if (this.waiters.at(i) !== waiter) continue;
            this.waiters.removeAt(i);
            waiter.reject(new PostgresConnectionError('Timeout waiting for a connection of the pool'));
            return;
        }
    }

    protected async open(exclusive: boolean): Promise<PostgresClientConnection> {
        this.connecting++;
        const connection = new PostgresClientConnection(
            this.options,
            this.encoder,
            closed => this.onConnectionClosed(closed),
            this.maxPreparedStatements,
        );
        try {
            await connection.connect();
        } catch (error) {
            this.connecting--;
            this.serveWaiters();
            throw error;
        }
        this.connecting--;
        if (this.closed) {
            connection.close();
            throw new PostgresConnectionError('Connection pool is closed');
        }
        this.connections.add(connection);
        this.connections.reserve(connection, exclusive);
        this.startTimer();
        this.shareWithWaiters();
        return connection;
    }

    protected onConnectionClosed(connection: PostgresClientConnection): void {
        this.connections.remove(connection);
        if (!this.closed) this.serveWaiters();
    }

    /** Connections were lost or could be opened again, so waiters don't wait for a release that never comes. */
    protected serveWaiters(): void {
        while (this.waiters.size > 0 && this.size < this.options.max) {
            const waiter = this.waiters.shift()!;
            this.settle(this.open(waiter.exclusive), waiter);
        }
    }

    protected settle(promise: Promise<PostgresClientConnection>, waiter: Waiter): void {
        promise.then(
            connection => {
                if (waiter.timer) clearTimeout(waiter.timer);
                waiter.resolve(connection);
            },
            error => {
                if (waiter.timer) clearTimeout(waiter.timer);
                waiter.reject(error);
            },
        );
    }

    /** Gives up the use of a connection acquired with acquire or tryAcquire. */
    release(connection: PostgresClientConnection): void {
        // Whoever gets it next must not end up inside of a transaction that was left open.
        if (connection.load === 1 && connection.inTransaction()) connection.close();

        if (connection.isConnected()) {
            for (let i = 0; i < this.waiters.size; i++) {
                const waiter = this.waiters.at(i)!;
                // an exclusive waiter needs the connection for itself
                if (waiter.exclusive && connection.load > 1) continue;
                if (connection.load === 1) connection.exclusive = waiter.exclusive;
                this.waiters.removeAt(i);
                if (waiter.timer) clearTimeout(waiter.timer);
                waiter.resolve(connection);
                this.shareWithWaiters();
                return;
            }
        }
        this.connections.release(connection, Date.now());
    }

    /** Waiters that accept sharing need not wait for a release while connections have room for them. */
    protected shareWithWaiters(): void {
        if (this.options.maxPipelineDepth <= 1) return;
        for (let i = 0; i < this.waiters.size; i++) {
            const waiter = this.waiters.at(i)!;
            if (waiter.exclusive) continue;
            const connection = this.connections.acquirePipelined(this.options.maxPipelineDepth);
            if (connection === undefined) return;
            this.waiters.removeAt(i--);
            if (waiter.timer) clearTimeout(waiter.timer);
            waiter.resolve(connection);
        }
    }

    /** One timer for the pool, instead of one for each connection or query. */
    protected startTimer(): void {
        if (this.timer) return;
        const options = this.options;
        const idleTimeout = options.idleTimeoutMillis;
        const queryTimeout = options.queryTimeout;
        if (idleTimeout <= 0 && queryTimeout <= 0) return;
        let interval = Math.max(100, idleTimeout > 0 ? idleTimeout / 4 : 1000);
        if (queryTimeout > 0) interval = Math.max(10, Math.min(interval, queryTimeout / 4));

        this.timer = setInterval(() => {
            const now = Date.now();
            if (idleTimeout > 0) {
                for (const connection of this.connections.takeExpired(now - idleTimeout, options.min))
                    connection.close();
            }
            if (queryTimeout > 0) {
                for (const connection of this.connections.all) connection.checkTimeout(now);
            }
        }, interval);
        this.timer.unref?.();
    }

    close(): void {
        if (this.closed) return;
        this.closed = true;
        if (this.timer) clearInterval(this.timer);
        this.timer = undefined;
        for (const connection of this.connections.all.slice()) connection.close();
        for (const waiter of this.waiters.drain()) {
            if (waiter.timer) clearTimeout(waiter.timer);
            waiter.reject(new PostgresConnectionError('Connection pool closed'));
        }
    }
}
