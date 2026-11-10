/*
 * Deepkit Framework
 * Copyright (C) 2021 Deepkit UG, Marc J. Schmidt
 *
 * This program is free software: you can redistribute it and/or modify
 * it under the terms of the MIT License.
 *
 * You should have received a copy of the MIT License along with this program.
 */

import { MongoError } from './error.js';
import { CollationMessage, HintMessage } from './command/command.js';

type AuthMechanismProperties = { [name: string]: string | boolean };

function parsePropertyValue(value: string): string | boolean {
    if (value === 'true') return true;
    if (value === 'false') return false;
    return value;
}

type Milliseconds = number;

export class ConnectionOptions {
    /**
     * The replica set name.
     */
    replicaSet?: string;

    /**
     * TCP connection timeout. Default 30s.
     *
     * If the socket connect takes longer than this value, the connection is aborted.
     */
    connectTimeoutMS: Milliseconds = 30000;

    /**
     * TCP socket timeout. Default not set.
     *
     * If greater than 0 `Socket.setTimeout()` will be called.
     */
    socketTimeoutMS: Milliseconds = 0;

    /**
     * The interval in milliseconds between the heartbeat checks. Default 10s.
     */
    heartbeatFrequencyMS: Milliseconds = 10000;

    /**
     * The maximum number of connections in the connection pool
     * How many connections per host are allowed on the pool.
     * If this limit is reached, the connection acquisition waits until a connection is released.
     * See also `connectionAcquisitionTimeout`.
     */
    maxPoolSize: number = 20;

    /**
     * The minimum number of connections in the connection pool.
     */
    minPoolSize: number = 0;

    /**
     * How many commands may be in flight on one connection. When all connections of a host are in use, commands
     * are sent on a busy connection instead of waiting for a free one. 1 disables pipelining.
     */
    maxPipelineDepth: number = 64;

    /**
     * The maximum time in milliseconds that a thread can wait for a connection to become available
     */
    waitQueueTimeoutMS: Milliseconds = 0;

    /**
     * Close a connection after it has been idle for this duration.
     * Default 60s.
     */
    maxIdleTimeMS: Milliseconds = 60 * 1000;

    /**
     * The maximum staleness to allow in milliseconds. Default 0 (no staleness check).
     *
     * I define this must be minimum 90 seconds:
     *    `heartbeatFrequency`+`idleWritePeriodMS` (10"000ms from the spec).
     *
     * Don't choose too low value to ensure secondaries are not considered stale too aggressively.
     */
    maxStalenessSeconds: number = 0;

    /**
     * Command response timeout. Default 0.
     *
     * If greater than 0, the command is aborted if it takes longer than this value
     * to answer. This might be tricky if you have very long-running queries.
     */
    commandTimeoutMS: Milliseconds = 0;

    /**
     * @see https://www.mongodb.com/docs/manual/reference/write-concern/#std-label-wc-j
     */
    w?: string | number;

    /**
     * If true the client sends operations to only the specified host.
     * It doesn't attempt to discover any other members of the replica set.
     */
    directConnection: boolean = false;

    /**
     * Write concern timeout in milliseconds.
     *
     * @see https://www.mongodb.com/docs/manual/reference/write-concern/#wtimeout
     */
    wtimeout?: Milliseconds;

    journal?: boolean;

    appName?: string;

    /**
     * If set, this is used for all find commands.
     */
    allowDiskUse?: boolean;

    retryWrites: boolean = true;
    retryReads: boolean = true;

    readConcernLevel?: 'local' | 'majority' | 'linearizable' | 'available' | 'snapshot';

    readPreference?: 'primary' | 'primaryPreferred' | 'secondary' | 'secondaryPreferred' | 'nearest';

    readPreferenceTags?: string; //e.g. "dc:ny,rack:1"
    hedge?: boolean;

    // compressors?: 'snappy' | 'zlib' | 'zstd';
    // zlibCompressionLevel?: number;

    authSource?: string;
    authMechanism?: 'SCRAM-SHA-1' | 'SCRAM-SHA-256' | 'MONGODB-X509' | 'GSSAPI' | 'PLAIN';
    authMechanismProperties?: string;
    gssapiServiceName?: string;

    batchSize: number = 100_000;

    ssl?: boolean;
    tlsCertificateFile?: string;
    tlsCertificateKeyFile?: string;
    tlsCertificateKeyFilePassword?: string;
    tlsCAFile?: string;
    tlsCRLFile?: string;
    tlsAllowInvalidCertificates?: boolean;
    tlsAllowInvalidHostnames?: boolean;
    tlsInsecure?: boolean;

    /**
     * In seconds.
     */
    srvCacheTimeout: number = 5 * 60;

    protected parsedReadPreferenceTags?: { [name: string]: string }[];

    validate() {
        const idleWritePeriodMS = 10_000; // 10 seconds as per spec
        const maxStalenessMS = (this.maxStalenessSeconds || 0) * 1000;
        const heartbeatFrequencyMS = this.heartbeatFrequencyMS;

        // Ensure maxStalenessSeconds meets the minimum requirements
        if (maxStalenessMS > 0 && maxStalenessMS < Math.max(90_000, heartbeatFrequencyMS + idleWritePeriodMS)) {
            throw new MongoError(`maxStalenessSeconds must be at least ${Math.max(90, (heartbeatFrequencyMS + idleWritePeriodMS) / 1000)} seconds.`);
        }
    }

    protected preferenceTagCache = new Map<string, { [name: string]: string }[]>;

    parsePreferenceTags(tags: string): { [name: string]: string }[] {
        let cache = this.preferenceTagCache.get(tags);
        if (!cache) {
            cache = [];
            for (const tag of tags.split(',')) {
                const [name, value] = tag.split(':');
                cache.push({ [name]: value });
            }
            this.preferenceTagCache.set(tags, cache);
        }
        return cache;
    }

    getAuthMechanismProperties(): AuthMechanismProperties {
        const properties: AuthMechanismProperties = {};
        if (!this.authMechanismProperties) return properties;
        for (const pairs of this.authMechanismProperties.split(',')) {
            let [name, value] = pairs.trim().split(':');
            properties[name] = parsePropertyValue(value);
        }
        return properties;
    }

    get checkServerIdentity() {
        return !this.tlsAllowInvalidHostnames && !this.tlsInsecure;
    }

    get rejectUnauthorized() {
        return this.tlsInsecure || this.tlsAllowInvalidCertificates;
    }

    get secondaryReadAllowed() {
        return this.readPreference === 'secondary' || this.readPreference === 'secondaryPreferred';
    }
}

export interface CommandOptions {
    batchSize?: number;
    readPreference?: ConnectionOptions['readPreference'];
    readPreferenceTags?: string;
    readConcernLevel?: ConnectionOptions['readConcernLevel'];

    writeConcern?: string | number;
    journal?: boolean;
    wtimeout?: number;

    allowDiskUse?: boolean;

    hint?: HintMessage;
    collation?: CollationMessage;
    estimateCount?: boolean;
}
