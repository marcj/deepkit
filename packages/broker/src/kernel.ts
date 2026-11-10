/*
 * Deepkit Framework
 * Copyright (C) 2021 Deepkit UG, Marc J. Schmidt
 *
 * This program is free software: you can redistribute it and/or modify
 * it under the terms of the MIT License.
 *
 * You should have received a copy of the MIT License along with this program.
 */

/** @group Kernel */
import cluster from 'cluster';
import { closeSync, openSync, renameSync, writeSync } from 'fs';

import { ProcessLock, ProcessLocker, arrayRemoveItem } from '@deepkit/core';
import { InjectorContext } from '@deepkit/injector';
import {
    RpcError,
    RpcKernel,
    RpcKernelConnection,
    TransientBytes,
    TransportConnection,
    copyFrame,
    createParameterSerializer,
    frameMemory,
    rpc,
    writePushFrameTransient,
} from '@deepkit/rpc';
import { TypeTuple, typeOf } from '@deepkit/type';

import {
    BrokerBusEvent,
    BrokerEntityFieldsEvent,
    BrokerInvalidationEvent,
    BrokerPush,
    BrokerQueueEvent,
    BrokerQueuePublish,
    QueueMessage,
    QueueMessageProcessing,
    QueueMessageState,
} from './model.js';
import { snapshotState } from './snapshot.js';
import { handleMessageDeduplication } from './utils.js';

/**
 * The name the broker controller is registered with.
 * @internal
 */
export const brokerControllerName = 'broker';

const pushBus = createParameterSerializer(typeOf<BrokerBusEvent>() as TypeTuple);
const pushQueue = createParameterSerializer(typeOf<BrokerQueueEvent>() as TypeTuple);
const pushInvalidation = createParameterSerializer(typeOf<BrokerInvalidationEvent>() as TypeTuple);
const pushEntityFields = createParameterSerializer(typeOf<BrokerEntityFieldsEvent>() as TypeTuple);

/**
 * Sends the frame in the shared buffer to all connections. A frame that is sent in chunks writes the chunks to the
 * shared buffer as well, so the next connection needs a copy that stays.
 */
function pushToAll(connections: RpcKernelConnection[], size: number): void {
    let memory = frameMemory();
    if (connections.length > 1 && size >= connections[0].transportOptions.chunkSize)
        memory = copyFrame(memory, 0, size);
    for (const connection of connections) connection.sendFrame(memory, size);
}

/**
 * @internal
 */
export interface Queue {
    currentId: number;
    name: string;
    deduplicateMessageHashes: Set<string | number>;
    messages: QueueMessage[];
    consumers: { con: BrokerConnection; handling: Map<number, QueueMessage>; maxMessagesInParallel: number }[];
}

export class BrokerConnection extends RpcKernelConnection {
    /** Set by BrokerKernel right after the connection is created. */
    public state!: BrokerState;

    public subscribedChannels: string[] = [];
    protected locks = new Map<number, ProcessLock>();
    protected lastLock: number = 0;

    public close(): void {
        super.close();

        for (const c of this.subscribedChannels) {
            this.state.unsubscribe(c, this);
        }
        arrayRemoveItem(this.state.invalidationCacheMessageConnections, this);
        this.state.removeConsumer(this);

        for (const lock of this.locks.values()) {
            lock.unlock();
        }
        this.locks.clear();
    }

    /** Keeps the lock until the client unlocks it or disconnects. Returns the token the client unlocks it with. */
    public holdLock(lock: ProcessLock): number {
        const token = ++this.lastLock;
        this.locks.set(token, lock);
        return token;
    }

    public releaseLock(token: number): void {
        const lock = this.locks.get(token);
        if (!lock) throw new RpcError(`Unknown lock ${token}`);
        this.locks.delete(token);
        lock.unlock();
    }

    public broadcastEntityFields(name: string): void {
        const size = writePushFrameTransient(BrokerPush.entityFields, pushEntityFields, [
            name,
            this.state.getEntityFields(name),
        ]);
        pushToAll(this.connections.connections.filter(connection => connection !== this) as BrokerConnection[], size);
    }
}

/**
 * The broker as seen by a client. One instance per connection.
 * @internal
 */
export class BrokerController {
    protected state: BrokerState;
    protected broker: BrokerConnection;

    constructor(connection: RpcKernelConnection) {
        this.broker = connection as BrokerConnection;
        this.state = this.broker.state;
    }

    @rpc.action()
    publishEntityFields(name: string, fields: string[]): string[] {
        if (this.state.publishEntityFields(name, fields)) this.broker.broadcastEntityFields(name);
        return this.state.getEntityFields(name);
    }

    @rpc.action()
    unsubscribeEntityFields(name: string, fields: string[]): string[] {
        if (this.state.unsubscribeEntityFields(name, fields)) this.broker.broadcastEntityFields(name);
        return this.state.getEntityFields(name);
    }

    @rpc.action()
    allEntityFields(): BrokerEntityFieldsEvent[] {
        return Array.from(this.state.entityFields.keys(), name => [name, this.state.getEntityFields(name)]);
    }

    @rpc.action()
    async lock(id: string, ttl: number, timeout?: number): Promise<number> {
        return this.broker.holdLock(await this.state.lock(id, ttl, timeout));
    }

    /** Resolves to undefined when the lock is taken. */
    @rpc.action()
    async tryLock(id: string, ttl: number): Promise<number | undefined> {
        const lock = await this.state.tryLock(id, ttl);
        return lock ? this.broker.holdLock(lock) : undefined;
    }

    @rpc.action()
    unlock(token: number): void {
        this.broker.releaseLock(token);
    }

    @rpc.action()
    isLocked(id: string): boolean {
        return this.state.isLocked(id);
    }

    @rpc.action()
    queuePublish(
        c: string,
        v: Uint8Array,
        process: QueueMessageProcessing,
        deduplicationInterval?: number,
        hash?: string | number,
        delay?: number,
        priority?: number,
    ): void {
        this.state.queuePublish({ c, v, process, deduplicationInterval, hash, delay, priority });
    }

    @rpc.action()
    queueSubscribe(c: string, maxParallel: number): void {
        this.state.queueSubscribe(c, this.broker, maxParallel);
    }

    @rpc.action()
    queueUnsubscribe(c: string): void {
        this.state.queueUnsubscribe(c, this.broker);
    }

    @rpc.action()
    queueMessageHandled(c: string, id: number, success: boolean, error?: string, delay?: number): void {
        this.state.queueMessageHandled(c, this.broker, id, { error, success, delay });
    }

    @rpc.action()
    subscribe(c: string): void {
        this.state.subscribe(c, this.broker);
        this.broker.subscribedChannels.push(c);
    }

    @rpc.action()
    unsubscribe(c: string): void {
        this.state.unsubscribe(c, this.broker);
        arrayRemoveItem(this.broker.subscribedChannels, c);
    }

    @rpc.action()
    publish(c: string, v: TransientBytes): void {
        this.state.publish(c, v);
    }

    @rpc.action()
    setCache(n: string, v: Uint8Array, ttl: number): void {
        this.state.setCache(n, v, ttl);
    }

    @rpc.action()
    getCache(n: string): [v: Uint8Array, ttl: number] | undefined {
        const entry = this.state.getCache(n);
        return entry ? [entry.data, entry.ttl] : undefined;
    }

    /** The ttl of the entry, undefined if it doesn't exist. */
    @rpc.action()
    getCacheMeta(n: string): number | undefined {
        return this.state.getCache(n)?.ttl;
    }

    @rpc.action()
    deleteCache(n: string): void {
        this.state.deleteCache(n);
    }

    @rpc.action()
    invalidateCache(n: string): void {
        this.state.invalidateCache(n);
    }

    @rpc.action()
    enableInvalidations(): void {
        this.state.invalidationCacheMessageConnections.push(this.broker);
    }

    @rpc.action()
    set(n: string, v: Uint8Array, ttl: number): void {
        this.state.setKey(n, v, ttl);
    }

    @rpc.action()
    get(n: string): Uint8Array | undefined {
        return this.state.getKey(n);
    }

    @rpc.action()
    increment(n: string, v?: number): number {
        return this.state.increment(n, v);
    }

    @rpc.action()
    delete(n: string): void {
        this.state.deleteKey(n);
    }
}

export class BrokerState {
    /**
     * Simple key/value store.
     */
    public keyStore = new Map<string, Uint8Array>();

    /**
     * Cache store.
     */
    public cacheStore = new Map<string, { data: Uint8Array; ttl: number }>();

    public subscriptions = new Map<string, BrokerConnection[]>();
    public entityFields = new Map<string, Map<string, number>>();

    public queues = new Map<string, Queue>();

    public locker = new ProcessLocker();

    public enableSnapshot = false;
    public snapshotInterval = 15;
    public snapshotPath = './broker-snapshot.bson';
    public snapshotting = false;

    /**
     * All connections in this list are notified about cache invalidations.
     */
    public invalidationCacheMessageConnections: BrokerConnection[] = [];

    protected lastSnapshotTimeout?: any;

    protected snapshot() {
        if (cluster.isMaster) {
            this.snapshotting = true;
            cluster.fork();

            cluster.on('exit', (worker: any) => {
                this.snapshotting = false;
            });
            return;
        }

        //we are in the worker now

        const snapshotTempPath = this.snapshotPath + '.tmp';
        //open file for writing, create if not exists, truncate if exists
        const file = openSync(snapshotTempPath, 'w+');
        snapshotState(this, v => writeSync(file, v));
        closeSync(file);

        //rename temp file to final file
        renameSync(snapshotTempPath, this.snapshotPath);
    }

    public getEntityFields(name: string): string[] {
        return Array.from(this.entityFields.get(name)?.keys() || []);
    }

    public publishEntityFields(name: string, fields: string[]): boolean {
        let store = this.entityFields.get(name);
        if (!store) {
            store = new Map();
            this.entityFields.set(name, store);
        }
        let changed = false;
        for (const field of fields) {
            const v = store.get(field);
            if (v === undefined) {
                store.set(field, 1);
                changed = true;
            } else {
                store.set(field, v + 1);
            }
        }
        return changed;
    }

    public unsubscribeEntityFields(name: string, fields: string[]) {
        const store = this.entityFields.get(name);
        if (!store) return;
        let changed = false;
        for (const field of fields) {
            let v = store.get(field);
            if (v === undefined) continue;
            v--;
            if (v === 0) {
                store.delete(field);
                changed = true;
                continue;
            }
            store.set(field, v);
        }
        return changed;
    }

    public lock(id: string, ttl: number, timeout: number = 0): Promise<ProcessLock> {
        return this.locker.acquireLock(id, ttl, timeout);
    }

    public tryLock(id: string, ttl: number = 0): Promise<ProcessLock | undefined> {
        return this.locker.tryLock(id, ttl);
    }

    public isLocked(id: string): boolean {
        return this.locker.isLocked(id);
    }

    public unsubscribe(channel: string, connection: BrokerConnection) {
        const subscriptions = this.subscriptions.get(channel);
        if (!subscriptions) return;
        arrayRemoveItem(subscriptions, connection);
    }

    public subscribe(channel: string, connection: BrokerConnection) {
        let subscriptions = this.subscriptions.get(channel);
        if (!subscriptions) {
            subscriptions = [];
            this.subscriptions.set(channel, subscriptions);
        }
        subscriptions.push(connection);
    }

    public publish(channel: string, v: Uint8Array) {
        const subscriptions = this.subscriptions.get(channel);
        if (!subscriptions) return;
        // written once, however many connections receive it
        pushToAll(subscriptions, writePushFrameTransient(BrokerPush.bus, pushBus, [channel, v]));
    }

    protected getQueue(queueName: string) {
        let queue = this.queues.get(queueName);
        if (!queue) {
            queue = { currentId: 0, name: queueName, deduplicateMessageHashes: new Set(), messages: [], consumers: [] };
            this.queues.set(queueName, queue);
        }
        return queue;
    }

    public queueSubscribe(queueName: string, connection: BrokerConnection, maxParallel: number) {
        const queue = this.getQueue(queueName);
        queue.consumers.push({ con: connection, handling: new Map(), maxMessagesInParallel: 1 });
    }

    public queueUnsubscribe(queueName: string, connection: BrokerConnection) {
        const queue = this.getQueue(queueName);
        const index = queue.consumers.findIndex(v => v.con === connection);
        if (index === -1) return;
        queue.consumers.splice(index, 1);
    }

    /** A connection that is gone can't handle messages anymore. */
    public removeConsumer(connection: BrokerConnection) {
        for (const queue of this.queues.values()) {
            const index = queue.consumers.findIndex(v => v.con === connection);
            if (index !== -1) queue.consumers.splice(index, 1);
        }
    }

    public queuePublish(body: BrokerQueuePublish) {
        const queue = this.getQueue(body.c);

        const m: QueueMessage = {
            id: queue.currentId++,
            process: body.process,
            hash: body.hash,
            state: QueueMessageState.pending,
            tries: 0,
            v: body.v,
            delay: body.delay || 0,
            priority: body.priority,
        };

        if (body.process === QueueMessageProcessing.exactlyOnce) {
            if (!body.deduplicationInterval) {
                throw new Error('Missing message deduplication interval');
            }
            if (!body.hash) {
                throw new Error('Missing message hash');
            }
            if (handleMessageDeduplication(body.hash, queue, body.v, body.deduplicationInterval)) return;
            m.ttl = Date.now() + body.deduplicationInterval;
        }

        if (m.delay > Date.now()) {
            // todo: how to handle delay? many timeouts or one timeout?
            return;
        }

        for (const consumer of queue.consumers) {
            if (consumer.handling.size >= consumer.maxMessagesInParallel) continue;
            consumer.handling.set(m.id, m);
            m.tries++;
            m.state = QueueMessageState.inFlight;
            m.lastError = undefined;
            const frameSize = writePushFrameTransient(BrokerPush.queue, pushQueue, [body.c, m.id, body.v]);
            consumer.con.sendFrame(frameMemory(), frameSize);
        }

        //todo: handle queues messages and sending when new consumer connects
    }

    /**
     * When a queue message has been sent to a consumer and the consumer answers.
     */
    public queueMessageHandled(
        queueName: string,
        connection: BrokerConnection,
        id: number,
        answer: {
            error?: string;
            success: boolean;
            delay?: number;
        },
    ) {
        const queue = this.queues.get(queueName);
        if (!queue) return;
        const consumer = queue.consumers.find(v => v.con === connection);
        if (!consumer) return;
        const message = consumer.handling.get(id);
        if (!message) return;
        consumer.handling.delete(id);

        if (answer.error) {
            message.state = QueueMessageState.error;
        } else if (answer.success) {
            message.state = QueueMessageState.done;
        } else if (answer.delay) {
            message.delay = Date.now() + answer.delay;
        }

        //todo: handle delays and retries
    }

    public setCache(id: string, data: Uint8Array, ttl: number) {
        this.cacheStore.set(id, { data, ttl });
    }

    public getCache(id: string): { data: Uint8Array; ttl: number } | undefined {
        return this.cacheStore.get(id);
    }

    public deleteCache(id: string) {
        this.cacheStore.delete(id);
    }

    /** Removes the entry and tells every connection that asked for it. */
    public invalidateCache(id: string) {
        if (!this.getCache(id) || !this.invalidationCacheMessageConnections.length) return;
        this.deleteCache(id);
        pushToAll(
            this.invalidationCacheMessageConnections,
            writePushFrameTransient(BrokerPush.invalidation, pushInvalidation, [id]),
        );
    }

    public increment(id: string, v?: number): number {
        const buffer = this.keyStore.get(id);
        const float64 = buffer ? new Float64Array(buffer.buffer, buffer.byteOffset) : new Float64Array(1);
        float64[0] += v || 0;
        if (!buffer) this.keyStore.set(id, new Uint8Array(float64.buffer));
        return float64[0];
    }

    public setKey(id: string, data: Uint8Array, ttl: number) {
        this.keyStore.set(id, data);
        if (ttl > 0) {
            setTimeout(() => {
                this.keyStore.delete(id);
            }, ttl);
        }
    }

    public getKey(id: string): Uint8Array | undefined {
        return this.keyStore.get(id);
    }

    public deleteKey(id: string) {
        this.keyStore.delete(id);
    }
}

export class BrokerKernel extends RpcKernel {
    protected state: BrokerState = new BrokerState();
    protected RpcKernelConnection = BrokerConnection as any;

    constructor(...args: ConstructorParameters<typeof RpcKernel>) {
        super(...args);
        this.registerController(BrokerController, brokerControllerName);
    }

    createConnection(transport: TransportConnection, injector?: InjectorContext): BrokerConnection {
        const connection = super.createConnection(transport, injector) as BrokerConnection;
        connection.state = this.state;
        return connection;
    }
}
