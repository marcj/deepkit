// Redis and Valkey speak the same protocol and only differ in the server binary.
import Redis from 'ioredis';
import { createClient } from 'redis';

import { UserData } from '../../rpc/shared.js';
import { BrokerLoadLibrary, startServerBinary } from '../broker-load.js';

function serve(binary: string, port: number) {
    return startServerBinary(binary, ['--port', String(port), '--bind', '127.0.0.1', '--save', '', '--appendonly', 'no'], port);
}

/** With auto pipelining, the fastest setting of ioredis for concurrent calls. */
export function ioredisLibrary(binary: string): BrokerLoadLibrary {
    return {
        serve: port => serve(binary, port),
        async connect(port) {
            const client = new Redis({ port, host: '127.0.0.1', enableAutoPipelining: true });
            const subscriber = new Redis({ port, host: '127.0.0.1' });
            const callbacks = new Map<string, (value: UserData) => void>();
            subscriber.on('message', (channel, message) => callbacks.get(channel)!(JSON.parse(message)));
            return {
                get: async key => {
                    const value = await client.get(key);
                    return value ? JSON.parse(value) : undefined;
                },
                set: (key, value) => client.set(key, JSON.stringify(value)),
                increment: key => client.incr(key),
                publish: (channel, value) => client.publish(channel, JSON.stringify(value)),
                subscribe: (channel, callback) => {
                    callbacks.set(channel, callback);
                    return subscriber.subscribe(channel);
                },
            };
        },
    };
}

/** node-redis pipelines the commands of one tick by itself. */
export function nodeRedisLibrary(binary: string): BrokerLoadLibrary {
    return {
        serve: port => serve(binary, port),
        async connect(port) {
            const client = createClient({ socket: { host: '127.0.0.1', port } });
            const subscriber = client.duplicate();
            await Promise.all([client.connect(), subscriber.connect()]);
            return {
                get: async key => {
                    const value = await client.get(key);
                    return value ? JSON.parse(value) : undefined;
                },
                set: (key, value) => client.set(key, JSON.stringify(value)),
                increment: key => client.incr(key),
                publish: (channel, value) => client.publish(channel, JSON.stringify(value)),
                subscribe: (channel, callback) => subscriber.subscribe(channel, message => callback(JSON.parse(message))),
            };
        },
    };
}
