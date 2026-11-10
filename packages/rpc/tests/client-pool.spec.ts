import { afterAll, beforeAll, expect, test } from '@jest/globals';
import { join } from 'node:path';
import { MessageChannel, Worker } from 'node:worker_threads';
import { Observable } from 'rxjs';
import { toArray } from 'rxjs/operators';

import { RpcChannelClientAdapter, createMessagePortChannel, serveRpcChannel } from '../src/channel.js';
import { RpcClientPool } from '../src/client/client-pool.js';
import { RpcClient } from '../src/client/client.js';
import { rpc } from '../src/decorators.js';
import { RpcKernel } from '../src/server/kernel.js';

function createPool(count: number) {
    const servers: ReturnType<typeof serveRpcChannel>[] = [];
    const calls: number[] = [];
    const clients = Array.from({ length: count }, (_, index) => {
        @rpc.controller('test')
        class TestController {
            @rpc.action()
            async which(delay: number): Promise<number> {
                calls[index] = (calls[index] || 0) + 1;
                if (delay) await new Promise(resolve => setTimeout(resolve, delay));
                return index;
            }

            @rpc.action()
            fail(): void {
                throw new Error('nope');
            }

            @rpc.action()
            count(to: number): Observable<number> {
                return new Observable(subscriber => {
                    for (let i = 1; i <= to; i++) subscriber.next(i);
                    subscriber.complete();
                });
            }
        }
        const kernel = new RpcKernel();
        kernel.registerController(TestController);
        const { port1, port2 } = new MessageChannel();
        servers.push(serveRpcChannel(kernel, createMessagePortChannel(port2)));
        return new RpcClient(new RpcChannelClientAdapter(createMessagePortChannel(port1)));
    });
    return { pool: new RpcClientPool(clients), calls, servers };
}

interface Controller {
    which(delay: number): Promise<number>;
    fail(): Promise<void>;
    count(to: number): Promise<Observable<number>>;
}

test('calls are spread evenly over the clients', async () => {
    const { pool, calls, servers } = createPool(4);
    const controller = pool.controller<Controller>('test');

    const results = await Promise.all(Array.from({ length: 400 }, () => controller.which(1)));
    expect(calls).toEqual([100, 100, 100, 100]);
    expect(new Set(results)).toEqual(new Set([0, 1, 2, 3]));
    expect(pool.load).toEqual([0, 0, 0, 0]);

    // one after the other, idle clients take turns
    for (let i = 0; i < 8; i++) await controller.which(0);
    expect(calls).toEqual([102, 102, 102, 102]);

    await pool.disconnect();
    for (const server of servers) server.close();
});

test('a busy client gets no new calls while others are idle', async () => {
    const { pool, servers } = createPool(2);
    const controller = pool.controller<Controller>('test');
    const slow = controller.which(50);
    const quick: number[] = [];
    for (let i = 0; i < 5; i++) quick.push(await controller.which(0));
    // the first client is still busy with the slow call
    expect(quick).toEqual([1, 1, 1, 1, 1]);
    expect(await slow).toBe(0);
    await pool.disconnect();
    for (const server of servers) server.close();
});

test('errors and streams', async () => {
    const { pool, servers } = createPool(3);
    const controller = pool.controller<Controller>('test');
    await expect(controller.fail()).rejects.toThrow('nope');
    await expect(Promise.all([controller.fail(), controller.fail()])).rejects.toThrow('nope');
    await new Promise(resolve => setTimeout(resolve, 10));
    expect(pool.load).toEqual([0, 0, 0]);

    const values = await (await controller.count(3)).pipe(toArray()).toPromise();
    expect(values).toEqual([1, 2, 3]);
    await pool.disconnect();
    for (const server of servers) server.close();
});

test('a pool needs a client', () => {
    expect(() => new RpcClientPool([])).toThrow('at least one client');
});

const fixture = join(__dirname, 'fixtures/channel/server.ts');
// @deepkit/run compiles with the tsconfig.json of the current directory, also in worker threads
const cwd = process.cwd();
beforeAll(() => process.chdir(join(__dirname, 'fixtures/channel')));
afterAll(() => process.chdir(cwd));

test('worker threads run the calls in parallel', async () => {
    const workers = Array.from({ length: 4 }, () => new Worker(fixture, { argv: ['worker'], execArgv: ['--import', '@deepkit/run'] }));
    try {
        const pool = new RpcClientPool(workers.map(worker => new RpcClient(new RpcChannelClientAdapter(createMessagePortChannel(worker)))));
        const controller = pool.controller<{ busy(milliseconds: number): Promise<number> }>('test');
        // each blocks its thread, so they can only finish together when they run on different threads
        const threads = await Promise.all(Array.from({ length: 8 }, () => controller.busy(20)));
        expect(new Set(threads).size).toBe(4);
        await pool.disconnect();
    } finally {
        await Promise.all(workers.map(worker => worker.terminate()));
    }
}, 30_000);
