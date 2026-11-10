import { afterAll, beforeAll, expect, test } from '@jest/globals';
import { ChildProcess, fork, spawn } from 'node:child_process';
import { Socket } from 'node:net';
import { join } from 'node:path';
import { MessageChannel, Worker } from 'node:worker_threads';
import { Observable } from 'rxjs';
import { skip, toArray } from 'rxjs/operators';

import { sleep } from '@deepkit/core';

import { createRpcSharedMemory, createSharedMemoryChannel } from '../src/channel-shared-memory.js';
import { RpcChannel, RpcChannelClientAdapter, createMessagePortChannel, createProcessChannel, createStreamChannel, serveRpcChannel } from '../src/channel.js';
import { RpcClient } from '../src/client/client.js';
import { rpc } from '../src/decorators.js';
import { ClientProgress } from '../src/progress.js';
import { RpcKernel, RpcKernelConnection } from '../src/server/kernel.js';

class User {
    created: Date = new Date('2026-01-02T03:04:05Z');

    constructor(
        public id: number,
        public name: string,
    ) {}
}

@rpc.controller('test')
class TestController {
    constructor(protected connection: RpcKernelConnection) {}

    @rpc.action()
    add(a: number, b: number): number {
        return a + b;
    }

    @rpc.action()
    user(user: User): User {
        return new User(user.id + 1, user.name.toUpperCase());
    }

    @rpc.action()
    bytes(size: number): Uint8Array {
        const data = new Uint8Array(size);
        for (let i = 0; i < size; i++) data[i] = i % 251;
        return data;
    }

    @rpc.action()
    sum(data: Uint8Array): number {
        let sum = 0;
        for (let i = 0; i < data.length; i++) sum += data[i];
        return sum;
    }

    @rpc.action()
    count(to: number): Observable<number> {
        return new Observable(subscriber => {
            for (let i = 1; i <= to; i++) subscriber.next(i);
            subscriber.complete();
        });
    }

    @rpc.action()
    async askClient(value: string): Promise<string> {
        return await this.connection.controller<ClientController>('client').echo(value);
    }

    @rpc.action()
    kick(): void {
        setTimeout(() => this.connection.close(), 1);
    }
}

@rpc.controller('client')
class ClientController {
    @rpc.action()
    echo(value: string): string {
        return 'client: ' + value;
    }
}

function expectedSum(size: number): number {
    let sum = 0;
    for (let i = 0; i < size; i++) sum += i % 251;
    return sum;
}

/** The calls every channel has to support. */
async function callAll(client: RpcClient) {
    const controller = client.controller<TestController>('test');
    expect(await controller.add(2, 3)).toBe(5);

    const user = await controller.user(new User(1, 'peter'));
    expect(user).toMatchObject({ id: 2, name: 'PETER' });
    expect(user.created).toBeInstanceOf(Date);

    // many calls in one tick go in one message
    const results = await Promise.all(Array.from({ length: 100 }, (_, i) => controller.add(i, 1)));
    expect(results).toEqual(Array.from({ length: 100 }, (_, i) => i + 1));

    // larger than a chunk, in both directions
    const bytes = await controller.bytes(350_000);
    expect(bytes.byteLength).toBe(350_000);
    expect(bytes[300_001]).toBe(300_001 % 251);
    expect(await controller.sum(bytes)).toBe(expectedSum(350_000));

    const values = await (await controller.count(5)).pipe(toArray()).toPromise();
    expect(values).toEqual([1, 2, 3, 4, 5]);
}

function messageChannelPair() {
    const { port1, port2 } = new MessageChannel();
    return { client: createMessagePortChannel(port1), server: createMessagePortChannel(port2), close: () => port1.close() };
}

test('message channel', async () => {
    const kernel = new RpcKernel();
    kernel.registerController(TestController);
    const pair = messageChannelPair();
    const server = serveRpcChannel(kernel, pair.server);
    const client = new RpcClient(new RpcChannelClientAdapter(pair.client));
    client.registerController(ClientController);

    await callAll(client);

    // back controller: the server calls the client
    expect(await client.controller<TestController>('test').askClient('hi')).toBe('client: hi');

    // progress of chunks
    const progress = ClientProgress.track();
    const stats: number[] = [];
    progress.download.pipe(skip(1)).subscribe(() => stats.push(progress.download.current));
    await client.controller<TestController>('test').bytes(250_000);
    expect(stats).toEqual([100_000, 200_000, 250_013]);

    await client.disconnect();
    pair.close();
    server.close();
});

test('message channel reconnects after disconnect and after the server closed the connection', async () => {
    const kernel = new RpcKernel();
    kernel.registerController(TestController);
    const pair = messageChannelPair();
    const server = serveRpcChannel(kernel, pair.server);
    const client = new RpcClient(new RpcChannelClientAdapter(pair.client));
    const controller = client.controller<TestController>('test');

    expect(await controller.add(1, 1)).toBe(2);
    const first = server.connection;
    expect(first).toBeDefined();
    expect(kernel.connections.connections.length).toBe(1);

    // the client disconnects, the server closes its connection
    await client.disconnect();
    await sleep(0.01);
    expect(first!.closed).toBe(true);
    expect(server.connection).toBeUndefined();
    expect(kernel.connections.connections.length).toBe(0);

    // the next call connects again over the same channel
    expect(await controller.add(2, 2)).toBe(4);
    expect(server.connection).not.toBe(first);
    expect(kernel.connections.connections.length).toBe(1);

    // the server closes the connection
    let closed = 0;
    client.transporter.disconnected.subscribe(() => closed++);
    await controller.kick();
    await sleep(0.02);
    expect(closed).toBe(1);
    expect(client.transporter.isConnected()).toBe(false);
    expect(kernel.connections.connections.length).toBe(0);

    expect(await controller.add(3, 3)).toBe(6);
    expect(kernel.connections.connections.length).toBe(1);

    await client.disconnect();
    pair.close();
    server.close();
});

test('message channel ignores other messages', async () => {
    const kernel = new RpcKernel();
    kernel.registerController(TestController);
    const { port1, port2 } = new MessageChannel();
    const server = serveRpcChannel(kernel, createMessagePortChannel(port2));
    const client = new RpcClient(new RpcChannelClientAdapter(createMessagePortChannel(port1)));
    const received: unknown[] = [];
    port2.on('message', message => received.push(message));

    port1.postMessage({ hello: 'world' });
    port1.postMessage('text');
    expect(await client.controller<TestController>('test').add(2, 3)).toBe(5);
    expect(received).toContainEqual({ hello: 'world' });

    await client.disconnect();
    port1.close();
    server.close();
});

test('closing the port closes the connection', async () => {
    const kernel = new RpcKernel();
    kernel.registerController(TestController);
    const pair = messageChannelPair();
    const server = serveRpcChannel(kernel, pair.server);
    const client = new RpcClient(new RpcChannelClientAdapter(pair.client));
    expect(await client.controller<TestController>('test').add(2, 3)).toBe(5);

    let closed = 0;
    client.transporter.disconnected.subscribe(() => closed++);
    pair.close();
    await sleep(0.02);
    expect(closed).toBe(1);
    expect(kernel.connections.connections.length).toBe(0);
    server.close();
});

test('custom channel', async () => {
    // a channel only has to send bytes and end: here both sides are in-process with a hop each
    const kernel = new RpcKernel();
    kernel.registerController(TestController);
    type Listener = { data: (data: Uint8Array) => void; end: (reason: string) => void };
    const listeners: { a?: Listener; b?: Listener } = {};
    const side = (self: 'a' | 'b', other: 'a' | 'b'): RpcChannel => ({
        send: data => setTimeout(() => listeners[other]?.data(data)),
        end: () => setTimeout(() => listeners[other]?.end('ended')),
        listen(data, end) {
            listeners[self] = { data, end };
            return () => (listeners[self] = undefined);
        },
    });
    const server = serveRpcChannel(kernel, side('b', 'a'));
    const client = new RpcClient(new RpcChannelClientAdapter(side('a', 'b')));
    await callAll(client);
    await client.disconnect();
    server.close();
});

const fixture = join(__dirname, 'fixtures/channel/server.ts');

// @deepkit/run compiles with the tsconfig.json of the current directory, also in worker threads
const cwd = process.cwd();
// a worker or child compiles the fixture first
const startTimeout = 30_000;
beforeAll(() => process.chdir(join(__dirname, 'fixtures/channel')));
afterAll(() => process.chdir(cwd));

test(
    'worker thread',
    async () => {
        const worker = new Worker(fixture, { argv: ['worker'], execArgv: ['--import', '@deepkit/run'] });
        try {
            const client = new RpcClient(new RpcChannelClientAdapter(createMessagePortChannel(worker)));
            await callAll(client);
            await client.disconnect();
            // connects again
            expect(await client.controller<TestController>('test').add(1, 2)).toBe(3);
            await client.disconnect();
        } finally {
            await worker.terminate();
        }
    },
    startTimeout,
);

test(
    'worker thread exits',
    async () => {
        const worker = new Worker(fixture, { argv: ['worker'], execArgv: ['--import', '@deepkit/run'] });
        const client = new RpcClient(new RpcChannelClientAdapter(createMessagePortChannel(worker)));
        expect(await client.controller<TestController>('test').add(1, 2)).toBe(3);
        let closed = 0;
        client.transporter.disconnected.subscribe(() => closed++);
        await worker.terminate();
        await sleep(0.02);
        expect(closed).toBe(1);
    },
    startTimeout,
);

function exited(child: ChildProcess): Promise<unknown> {
    return new Promise(resolve => (child.exitCode !== null ? resolve(child.exitCode) : child.once('exit', resolve)));
}

test(
    'child process over IPC',
    async () => {
        const child = fork(fixture, ['process'], { serialization: 'advanced', execArgv: ['--import', '@deepkit/run'] });
        try {
            const client = new RpcClient(new RpcChannelClientAdapter(createProcessChannel(child)));
            await callAll(client);
            expect(await client.controller<{ pid(): number }>('test').pid()).toBe(child.pid);

            // other messages share the channel
            const pong = new Promise(resolve => child.once('message', resolve));
            child.send('ping');
            expect(await pong).toBe('pong');
            expect(await client.controller<TestController>('test').add(1, 2)).toBe(3);

            let closed = 0;
            client.transporter.disconnected.subscribe(() => closed++);
            child.kill();
            await exited(child);
            await sleep(0.02);
            expect(closed).toBe(1);
        } finally {
            child.kill();
        }
    },
    startTimeout,
);

test(
    'child process over a pipe',
    async () => {
        const child = spawn(process.execPath, ['--import', '@deepkit/run', fixture, 'pipe'], {
            stdio: ['ignore', 'inherit', 'inherit', 'pipe'],
        });
        try {
            const client = new RpcClient(new RpcChannelClientAdapter(createStreamChannel(child.stdio[3] as Socket)));
            await callAll(client);
            expect(await client.controller<{ pid(): number }>('test').pid()).toBe(child.pid);

            // a stream carries one connection: the child ends when it closes
            await client.disconnect();
            await exited(child);
        } finally {
            child.kill();
        }
    },
    startTimeout,
);

test('shared memory', async () => {
    const kernel = new RpcKernel();
    kernel.registerController(TestController);
    for (const capacity of [1024, 1024 * 1024]) {
        // 1kb: every larger message wraps around, waits for the reader, and is split up
        const memory = createRpcSharedMemory(capacity);
        const serverChannel = createSharedMemoryChannel(memory, 'server');
        const server = serveRpcChannel(kernel, serverChannel);
        const clientChannel = createSharedMemoryChannel(memory, 'client');
        const client = new RpcClient(new RpcChannelClientAdapter(clientChannel));
        client.registerController(ClientController);
        await callAll(client);
        expect(await client.controller<TestController>('test').askClient('hi')).toBe('client: hi');

        // reconnects after disconnect and after the server closed the connection
        const first = server.connection;
        await client.disconnect();
        await sleep(0.01);
        expect(first!.closed).toBe(true);
        expect(kernel.connections.connections.length).toBe(0);
        const controller = client.controller<TestController>('test');
        expect(await controller.add(2, 2)).toBe(4);
        expect(server.connection).not.toBe(first);

        let closed = 0;
        client.transporter.disconnected.subscribe(() => closed++);
        await controller.kick();
        await sleep(0.02);
        expect(closed).toBe(1);
        expect(kernel.connections.connections.length).toBe(0);
        expect(await controller.add(3, 3)).toBe(6);

        // the other side is gone
        clientChannel.close();
        await sleep(0.01);
        expect(closed).toBe(2);
        serverChannel.close();
        server.close();
        expect(kernel.connections.connections.length).toBe(0);
    }
});

test('shared memory with many calls in flight', async () => {
    const kernel = new RpcKernel();
    kernel.registerController(TestController);
    const memory = createRpcSharedMemory(4096);
    const server = serveRpcChannel(kernel, createSharedMemoryChannel(memory, 'server'));
    const client = new RpcClient(new RpcChannelClientAdapter(createSharedMemoryChannel(memory, 'client', { spin: 20 })));
    const controller = client.controller<TestController>('test');
    for (let round = 0; round < 5; round++) {
        const calls: Promise<unknown>[] = [];
        for (let i = 0; i < 500; i++) {
            calls.push(controller.add(i, round));
            if (i % 50 === 0) calls.push(controller.bytes(10_000 + i).then(v => expect(v.byteLength).toBe(10_000 + i)));
        }
        const results = await Promise.all(calls);
        expect(results.filter(v => typeof v === 'number')).toEqual(Array.from({ length: 500 }, (_, i) => i + round));
    }
    await client.disconnect();
    server.close();
});

test(
    'shared memory with a worker thread',
    async () => {
        const memory = createRpcSharedMemory(64 * 1024);
        const worker = new Worker(fixture, { argv: ['worker'], workerData: { memory }, execArgv: ['--import', '@deepkit/run'] });
        try {
            const channel = createSharedMemoryChannel(memory, 'client');
            worker.on('exit', () => channel.close());
            const client = new RpcClient(new RpcChannelClientAdapter(channel));
            await callAll(client);
            await client.disconnect();
            expect(await client.controller<TestController>('test').add(1, 2)).toBe(3);

            let closed = 0;
            client.transporter.disconnected.subscribe(() => closed++);
            worker.postMessage('close');
            await worker.terminate();
            await sleep(0.02);
            expect(closed).toBe(1);
        } finally {
            await worker.terminate();
        }
    },
    startTimeout,
);
