import { deserializeBSON, getBsonEncoder, serializeBSON } from '@deepkit/bson';
import { arrayRemoveItem, formatError } from '@deepkit/core';
import {
    ClientTransportAdapter,
    RemoteController,
    RpcClient,
    RpcWebSocketClientAdapter,
    createParameterDeserializer,
} from '@deepkit/rpc';
import { Type, TypeTuple, typeOf } from '@deepkit/type';

import { BrokerCacheItemOptionsResolved } from '../broker-cache.js';
import { BrokerKeyValueOptionsResolved } from '../broker-key-value.js';
import {
    BrokerAdapter,
    BrokerAdapterQueueProduceOptionsResolved,
    BrokerQueueMessage,
    BrokerTimeOptionsResolved,
    Release,
} from '../broker.js';
import type { BrokerController } from '../kernel.js';
import {
    BrokerBusEvent,
    BrokerInvalidationEvent,
    BrokerPush,
    BrokerQueueEvent,
    QueueMessageProcessing,
} from '../model.js';
import { fastHash } from '../utils.js';

const brokerControllerName = 'broker';

const readBus = createParameterDeserializer(typeOf<BrokerBusEvent>() as TypeTuple);
const readQueue = createParameterDeserializer(typeOf<BrokerQueueEvent>() as TypeTuple);
const readInvalidation = createParameterDeserializer(typeOf<BrokerInvalidationEvent>() as TypeTuple);

export class BrokerDeepkitConnection extends RpcClient {
    activeChannels = new Map<string, { listeners: number; callbacks: ((v: Uint8Array) => void)[] }>();
    consumers = new Map<string, { listeners: number; callbacks: ((id: number, v: Uint8Array) => Promise<void>)[] }>();

    subscribedToInvalidations?: ((key: string) => void)[];

    public readonly broker: RemoteController<BrokerController> =
        this.controller<BrokerController>(brokerControllerName);

    constructor(transport: ClientTransportAdapter) {
        super(transport);
        this.onPush(BrokerPush.bus, (buffer, offset, end) => {
            const [channel, value] = readBus(buffer, offset, end);
            const active = this.activeChannels.get(channel);
            if (active) for (const callback of active.callbacks) callback(value);
        });
        this.onPush(BrokerPush.queue, (buffer, offset, end) => {
            const [queue, id, value] = readQueue(buffer, offset, end);
            const consumer = this.consumers.get(queue);
            if (consumer) for (const callback of consumer.callbacks) callback(id, value).catch(() => undefined);
        });
        this.onPush(BrokerPush.invalidation, (buffer, offset, end) => {
            const [key] = readInvalidation(buffer, offset, end);
            if (this.subscribedToInvalidations) for (const callback of this.subscribedToInvalidations) callback(key);
        });
    }

    onClose(error?: Error) {
        this.subscribedToInvalidations = undefined;
        super.onClose(error);
    }

    async listenInvalidations(callbacks: ((key: string) => void)[]): Promise<void> {
        this.subscribedToInvalidations = callbacks;
        await this.broker.enableInvalidations();
    }
}

export interface Server {
    url: string;
    weight?: number;
    secretKey?: string;
    transport?: ClientTransportAdapter;
}

export class BrokerDeepkitAdapterOptions {
    servers: Server[] = [];
}

export class BrokerDeepkitPool {
    connections: { connection: BrokerDeepkitConnection; server: Server }[] = [];

    constructor(public options: BrokerDeepkitAdapterOptions) {}

    getConnection(key: string): BrokerDeepkitConnection {
        if (!this.options.servers.length) throw new Error('No servers defined');

        if (this.options.servers.length === 1) {
            if (!this.connections.length) this.createConnection(this.options.servers[0]);
            return this.connections[0].connection;
        }

        //key is used for consistent hashing
        throw new Error('Not implemented');
    }

    protected createConnection(server: Server): BrokerDeepkitConnection {
        const transport = server.transport || new RpcWebSocketClientAdapter(server.url);

        const connection = new BrokerDeepkitConnection(transport);
        connection.token.set(server.secretKey);
        this.connections.push({ connection, server });
        return connection;
    }

    async disconnect(): Promise<void> {
        for (const connection of this.connections) {
            // we just disconnect, and not clear the connection object since we store state on it (like activeChannels, invalidation callbacks, etc)
            await connection.connection.disconnect();
        }
    }
}

/**
 * This is the Broker adapter for Deepkit Broker server.
 */
export class BrokerDeepkitAdapter implements BrokerAdapter {
    protected pool = new BrokerDeepkitPool(this.options);
    protected onInvalidateCacheCallbacks: ((key: string) => void)[] = [];

    constructor(public options: BrokerDeepkitAdapterOptions) {}

    async disconnect(): Promise<void> {
        await this.pool.disconnect();
    }

    onInvalidateCache(callback: (key: string) => void): void {
        this.onInvalidateCacheCallbacks.push(callback);
    }

    async invalidateCache(key: string): Promise<void> {
        await this.pool.getConnection('cache/' + key).broker.invalidateCache(key);
    }

    async setCache(key: string, value: any, options: BrokerCacheItemOptionsResolved, type: Type): Promise<void> {
        const v = getBsonEncoder(type).encode(value);
        await this.pool.getConnection('cache/' + key).broker.setCache(key, v, options.ttl);
    }

    async getCacheMeta(key: string): Promise<{ ttl: number } | undefined> {
        const ttl = await this.pool.getConnection('cache/' + key).broker.getCacheMeta(key);
        return ttl === undefined ? undefined : { ttl };
    }

    async getCache(key: string, type: Type): Promise<{ value: any; ttl: number } | undefined> {
        const connection = this.pool.getConnection('cache/' + key);
        if (!connection.subscribedToInvalidations)
            await connection.listenInvalidations(this.onInvalidateCacheCallbacks);

        const entry = await connection.broker.getCache(key);
        return entry ? { value: getBsonEncoder(type).decode(entry[0], 0), ttl: entry[1] } : undefined;
    }

    async set(key: string, value: any, options: BrokerKeyValueOptionsResolved, type: Type): Promise<void> {
        await this.pool.getConnection('key/' + key).broker.set(key, getBsonEncoder(type).encode(value), options.ttl);
    }

    async get(key: string, type: Type): Promise<any> {
        const v = await this.pool.getConnection('key/' + key).broker.get(key);
        if (v) return getBsonEncoder(type).decode(v, 0);
    }

    async remove(key: string): Promise<any> {
        await this.pool.getConnection('key/' + key).broker.delete(key);
    }

    async increment(key: string, value: any): Promise<number> {
        return await this.pool.getConnection('increment/' + key).broker.increment(key, value);
    }

    async isLocked(id: string): Promise<boolean> {
        return await this.pool.getConnection('lock/' + id).broker.isLocked(id);
    }

    async lock(id: string, options: BrokerTimeOptionsResolved): Promise<undefined | Release> {
        const broker = this.pool.getConnection('lock/' + id).broker;
        const token = await broker.lock(id, options.ttl, options.timeout);
        return async () => {
            await broker.unlock(token);
        };
    }

    async tryLock(id: string, options: BrokerTimeOptionsResolved): Promise<undefined | Release> {
        const broker = this.pool.getConnection('lock/' + id).broker;
        const token = await broker.tryLock(id, options.ttl);
        if (token === undefined) return;
        return async () => {
            await broker.unlock(token);
        };
    }

    async publish(key: string, message: any, type: Type): Promise<void> {
        await this.pool.getConnection('bus/' + key).broker.publish(key, getBsonEncoder(type).encode(message));
    }

    async subscribe(key: string, callback: (message: any) => void, type: Type): Promise<Release> {
        return await this._subscribe(this.pool.getConnection('bus/' + key), key, callback, type);
    }

    protected async _subscribe(
        connection: BrokerDeepkitConnection,
        key: string,
        callback: (message: any) => void,
        type: Type,
    ): Promise<Release> {
        const serializer = getBsonEncoder(type);

        const parsedCallback = (next: Uint8Array) => {
            try {
                const parsed = serializer.decode(next, 0);
                callback(parsed);
            } catch (error: any) {
                console.error(`Could not parse channel message ${key}: ${error}`);
            }
        };

        let channel = connection.activeChannels.get(key);
        if (!channel) {
            channel = {
                listeners: 0,
                callbacks: [],
            };
            connection.activeChannels.set(key, channel);
        }

        channel.listeners++;
        channel.callbacks.push(parsedCallback);

        if (channel.listeners === 1) {
            await connection.broker.subscribe(key);
        }

        return async () => {
            channel!.listeners--;
            arrayRemoveItem(channel!.callbacks, parsedCallback);
            if (channel!.listeners === 0) await connection.broker.unsubscribe(key);
        };
    }

    async produce<T>(
        key: string,
        message: T,
        type: Type,
        options?: BrokerAdapterQueueProduceOptionsResolved,
    ): Promise<void> {
        const value = serializeBSON(message, undefined, type);
        if (options?.process === QueueMessageProcessing.exactlyOnce) {
            options.hash ??= fastHash(value);
        }
        await this.pool
            .getConnection('queue/' + key)
            .broker.queuePublish(
                key,
                value,
                options?.process ?? QueueMessageProcessing.atLeastOnce,
                options?.deduplicationInterval,
                options?.hash,
                options?.delay,
                options?.priority,
            );
    }

    async consume(
        key: string,
        callback: (message: BrokerQueueMessage<any>) => Promise<void>,
        options: {
            maxParallel: number;
        },
        type: Type,
    ): Promise<Release> {
        const connection = this.pool.getConnection('queue/' + key);

        connection.consumers.set(key, {
            listeners: 1,
            callbacks: [
                async (id: number, next: Uint8Array) => {
                    const data = deserializeBSON(next, 0, undefined, type);
                    const message = new BrokerQueueMessage(key, data);
                    try {
                        await callback(message);
                    } catch (error: any) {
                        // todo: decide what to do in this case
                        console.warn(
                            `Error in broker queue message processing ${callback.name}: ${formatError(error, true)}`,
                        );
                    }

                    await connection.broker.queueMessageHandled(
                        key,
                        id,
                        message.state === 'done',
                        message.error ? String(message.error) : undefined,
                        message.delayed,
                    );
                },
            ],
        });

        await connection.broker.queueSubscribe(key, options.maxParallel);

        return async () => {
            await connection.broker.queueUnsubscribe(key);
        };
    }
}
