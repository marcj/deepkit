import { arrayRemoveItem } from '@deepkit/core';

export interface PoolableConnection {
    /** How many users currently hold this connection. */
    load: number;
    /** True while a user holds this connection alone. */
    exclusive: boolean;
    /** Set when the last user released the connection. */
    idleSince: number;

    isConnected(): boolean;
}

/**
 * The connections of one host of a pool. All operations but pipelining and removal are O(1).
 *
 * An idle connection is always preferred, since it runs in parallel to the others on the server.
 * Pipelining is for when none is left: sending on a busy connection saves the wait for a free one.
 */
export class HostConnections<C extends PoolableConnection> {
    readonly all: C[] = [];
    readonly idle: C[] = [];
    private cursor: number = 0;

    add(connection: C): void {
        this.all.push(connection);
    }

    remove(connection: C): void {
        arrayRemoveItem(this.all, connection);
        arrayRemoveItem(this.idle, connection);
    }

    /** Marks a connection as used that was not taken via one of the acquire methods, like a new one. */
    reserve(connection: C, exclusive: boolean): void {
        connection.load++;
        connection.exclusive = exclusive;
    }

    /** The most recently used idle connection, so that rarely needed ones become idle long enough to be closed. */
    acquireIdle(exclusive: boolean): C | undefined {
        while (this.idle.length > 0) {
            const connection = this.idle.pop()!;
            if (!connection.isConnected() || connection.load > 0) continue;
            this.reserve(connection, exclusive);
            return connection;
        }
        return undefined;
    }

    /** A busy connection with fewer than maxDepth users, going round all connections to spread the load. */
    acquirePipelined(maxDepth: number): C | undefined {
        const count = this.all.length;
        for (let i = 0; i < count; i++) {
            const connection = this.all[this.cursor++ % count];
            if (connection.exclusive || connection.load === 0 || connection.load >= maxDepth) continue;
            if (!connection.isConnected()) continue;
            connection.load++;
            return connection;
        }
        return undefined;
    }

    /**
     * Gives up one use of the connection.
     */
    release(connection: C, now: number): void {
        if (--connection.load > 0) return;
        connection.exclusive = false;
        connection.idleSince = now;
        if (connection.isConnected()) this.idle.push(connection);
    }

    /** Removes and returns connections idle since before the given time, leaving at least keep connections. */
    takeExpired(before: number, keep: number): C[] {
        let expired: C[] | undefined;
        let remaining = this.all.length;
        while (this.idle.length > 0 && remaining > keep && this.idle[0].idleSince < before) {
            (expired ||= []).push(this.idle.shift()!);
            remaining--;
        }
        return expired || [];
    }
}
