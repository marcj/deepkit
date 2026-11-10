// Brokers under load: the Deepkit broker, Redis, Valkey and NATS, each server in its own process, in-memory only and
// with its default threading. Many connections with several in-flight calls each. See harness.ts.
//
// Publish counts as done when the subscriber received the message. Clients of Redis return when the server queued it
// and NATS doesn't reply at all, so that is the only point that means the same for all of them.
import { spawn } from 'child_process';
import { connect as connectSocket } from 'net';

import { UserData, createUser } from '../rpc/shared.js';
import { LoadCalls, LoadPlan, LoadTarget } from './harness.js';
import { rpcLevels } from './rpc-load.js';

export interface BrokerLoadLibrary {
    /** Starts the server on 127.0.0.1:port */
    serve(port: number): Promise<unknown>;
    /** A new client with its connections to the server */
    connect(port: number): Promise<BrokerLoadOperations>;
}

export interface BrokerLoadOperations {
    get?(key: string): Promise<UserData | undefined | null>;
    set?(key: string, value: UserData): Promise<unknown>;
    increment?(key: string): Promise<number>;
    publish(channel: string, value: UserData): Promise<unknown> | void;
    subscribe(channel: string, callback: (value: UserData) => void): Promise<unknown>;
}

const keyValueWorkloads = {
    get: 'read an object',
    set: 'write an object',
    increment: 'increment a counter',
};
const busWorkloads = { publish: 'publish and receive' };

const port = Number(process.env.LOAD_BROKER_PORT ?? 34590);
const users = Array.from({ length: 64 }, (_, i) => createUser(i + 1));
let clients = 0;

export function brokerTarget(library: BrokerLoadLibrary): LoadTarget {
    return {
        serve: () => library.serve(port),
        async connect() {
            const operations = await library.connect(port);
            const channel = `bench.${process.pid}.${clients++}`;

            // the messages of a channel arrive in the order they were published
            const pending: ((value: UserData) => void)[] = [];
            await operations.subscribe(channel, value => pending.shift()!(value));
            const publish = (i: number) =>
                new Promise<UserData>((resolve, reject) => {
                    pending.push(resolve);
                    const sent = operations.publish(channel, users[i & 63]);
                    if (sent) sent.catch(reject);
                });
            const received = await publish(4);
            if (received.email !== users[4].email || received.roles.length !== 2)
                throw new Error(`The subscriber received ${JSON.stringify(received)}`);

            const calls: LoadCalls = { publish };
            if (operations.get && operations.set && operations.increment) {
                const { get, set, increment } = operations as Required<BrokerLoadOperations>;
                await Promise.all(users.map((user, i) => set.call(operations, `bench:user:${i}`, user)));
                const read = await get.call(operations, 'bench:user:7');
                if (read?.email !== users[7].email) throw new Error(`get returned ${JSON.stringify(read)}`);
                const first = await increment.call(operations, `bench:check:${channel}`);
                const second = await increment.call(operations, `bench:check:${channel}`);
                if (second !== first + 1) throw new Error(`increment returned ${first} and ${second}`);
                calls.get = i => get.call(operations, `bench:user:${i & 63}`);
                calls.set = i => set.call(operations, `bench:user:${i & 63}`, users[i & 63]);
                calls.increment = i => increment.call(operations, `bench:counter:${i & 63}`);
            }
            return calls;
        },
    };
}

export function brokerPlan(library: string, publishOnly: boolean = false): LoadPlan {
    return {
        suite: 'comparison/broker-load',
        library,
        workloads: publishOnly ? busWorkloads : { ...keyValueWorkloads, ...busWorkloads },
        levels: rpcLevels,
        server: true,
        config: () => ({}),
    };
}

/**
 * Starts a server binary. The harness kills its processes with SIGKILL, so the binary is watched by a shell that ends
 * it when the pipe of this process closes.
 */
export async function startServerBinary(binary: string, args: string[], serverPort: number): Promise<unknown> {
    const command = [binary, ...args].map(v => `'${v}'`).join(' ');
    const shell = spawn('sh', ['-c', `${command} >/dev/null 2>&1 & p=$!; read _; kill -9 $p`], {
        stdio: ['pipe', 'ignore', 'inherit'],
    });
    const deadline = Date.now() + 10_000;
    while (Date.now() < deadline) {
        const open = await new Promise<boolean>(resolve => {
            const socket = connectSocket(serverPort, '127.0.0.1');
            socket.once('connect', () => {
                socket.destroy();
                resolve(true);
            });
            socket.once('error', () => resolve(false));
        });
        if (open) return shell;
        await new Promise(resolve => setTimeout(resolve, 50));
    }
    throw new Error(`${binary} did not open port ${serverPort}`);
}
