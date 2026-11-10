/*
 * Deepkit Framework
 * Copyright (C) 2021 Deepkit UG, Marc J. Schmidt
 *
 * This program is free software: you can redistribute it and/or modify
 * it under the terms of the MIT License.
 *
 * You should have received a copy of the MIT License along with this program.
 */

import { HostConnections } from '@deepkit/net';
import type { MongoConnection } from './connection.js';

export type HostType =
    'unknown' |
    'standalone' |
    'primary' |
    'secondary' |
    'mongos' |
    'arbiter' |
    'other' |
    'ghost';

export class HostStats {
    /**
     * How many connections were created to this host.
     */
    connectionsCreated: number = 0;

    connectionsReused: number = 0;

    connectionsError: number = 0;

    connectionsQueued: number = 0;

    connectionsAlive: number = 0;

    connectionsReserved: number = 0;

    commandsActive: number = 0;
    commandsExecuted: number = 0;
    commandsFailed: number = 0;

    bytesReceived: number = 0;
    bytesSent: number = 0;

    heartbeats: number = 0;
    heartbeatsFailed: number = 0;
}

export class Host {
    /**
     * The real unique id of the host. This is the host returned by the server.
     */
    id: string;

    type: HostType = 'unknown';

    status: string = 'pending';

    protected typeSetAt?: Date;

    readonly pool = new HostConnections<MongoConnection>();

    get connections(): MongoConnection[] {
        return this.pool.all;
    }

    replicaSetName?: string;

    tags: { [name: string]: string } = {};

    /**
     * True if the server is `mongos,
     * or node is in recovering, startup, or rollback mode.
     */
    readonly: boolean = false;

    /**
     * True if the server cannot be reached (heartbeat failed).
     */
    dead: boolean = false;

    /**
     * Average latency in ms (used for `nearest`)
     *
     * Round Trip Times of the heartbeat (`ismaster`) command.
     */
    latency: number = 0;

    // all members of the replica set that are neither hidden, passive, nor arbiters
    hosts: string[] = [];

    // all members of the replica set with a priority of 0
    passives: string[] = [];

    // all members of the replica set that are arbiters
    arbiters: string[] = [];

    subsequentHeartbeatErrors: number = 0;

    // priority=0
    passive: boolean = false;
    hidden: boolean = false;

    lastWriteDate?: Date;
    lastUpdateTime?: Date;

    lastUpdatePromise?: Promise<void>;

    /**
     * Calculate staleness in milliseconds.
     */
    staleness: number = 0;
    stale: boolean = false;

    stats: HostStats = new HostStats;

    constructor(
        /**
         * This is either the hostname from configuration or found in the `ismaster` result.
         */
        public hostname: string,
        public port: number = 27017,
    ) {
        this.id = hostname + ':' + port;
    }

    get label(): string {
        let id = this.id;
        if (id !== this.hostname + ':' + this.port) {
            id += '(' + this.hostname + ':' + this.port + ')';
        }
        return id;
    }

    get freeConnections(): number {
        return this.stats.connectionsAlive - this.stats.connectionsReserved;
    }

    isWritable(): boolean {
        if (this.dead) return false;
        if (this.type === 'mongos') return true;

        if (this.readonly) return false;
        return this.type === 'primary' || this.type === 'standalone';
    }

    isReadable(): boolean {
        if (this.dead) return false;
        if (this.type === 'mongos') return true;
        if (this.type === 'secondary' && this.stale) return false;

        return this.type === 'primary' || this.type === 'standalone' || this.type === 'secondary';
    }

    // state for not usable hosts like arbiters or hidden secondaries
    isUsable(): boolean {
        return this.isWritable() || this.isReadable();
    }

    setType(type: HostType) {
        if (this.type !== type) {
            //type changed. Should we do anything special?
        }
        this.type = type;
        this.typeSetAt = new Date;
    }

    getType() {
        return this.type;
    }

    getTypeFromIsMasterResult(isMasterCmdResult: any): HostType {
        if (!isMasterCmdResult || !isMasterCmdResult.ok) return 'unknown';
        if (isMasterCmdResult.isreplicaset) return 'ghost';
        if (isMasterCmdResult.ismaster && isMasterCmdResult.msg === 'isdbgrid') return 'mongos';
        if (isMasterCmdResult.setName) {
            if (isMasterCmdResult.hidden) return 'other';
            if (isMasterCmdResult.ismaster) return 'primary';
            if (isMasterCmdResult.secondary) return 'secondary';
            if (isMasterCmdResult.arbiterOnly) return 'arbiter';
            return 'other';
        }

        return 'standalone';
    }
}
