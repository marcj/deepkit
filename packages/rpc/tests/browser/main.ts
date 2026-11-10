// Runs the calls over a MessagePort and shared memory to a Web Worker and reports the results in window.results.
import { lastValueFrom, toArray } from 'rxjs';

import {
    RpcChannel,
    RpcChannelClientAdapter,
    RpcClient,
    createMessagePortChannel,
    createRpcSharedMemory,
    createSharedMemoryChannel,
} from '@deepkit/rpc';

import { TestController, User } from './controller.js';

function check(condition: boolean, message: string) {
    if (!condition) throw new Error(message);
}

async function run(channel: RpcChannel): Promise<{ ok: true; addMicroseconds: number; userMicroseconds: number }> {
    const client = new RpcClient(new RpcChannelClientAdapter(channel));
    const controller = client.controller<TestController>('test');
    check((await controller.add(2, 3)) === 5, 'add');
    const user = await controller.user(new User(1, 'peter'));
    check(user.id === 2 && user.name === 'PETER' && user.created instanceof Date, 'user ' + JSON.stringify(user));
    const results = await Promise.all(Array.from({ length: 100 }, (_, i) => controller.add(i, 1)));
    check(
        results.every((v, i) => v === i + 1),
        'parallel',
    );
    const bytes = await controller.bytes(350_000);
    check(bytes.byteLength === 350_000 && bytes[300_001] === 300_001 % 251, 'bytes');
    let sum = 0;
    for (let i = 0; i < bytes.length; i++) sum += bytes[i];
    check((await controller.sum(bytes)) === sum, 'sum');
    const values = await lastValueFrom((await controller.count(5)).pipe(toArray()));
    check(values.join() === '1,2,3,4,5', 'observable');

    // reconnects over the same channel
    await client.disconnect();
    check((await controller.add(1, 1)) === 2, 'reconnect');

    const time = async (call: () => Promise<unknown>) => {
        for (let i = 0; i < 500; i++) await call();
        const start = performance.now();
        for (let i = 0; i < 2000; i++) await call();
        return Math.round(((performance.now() - start) / 2000) * 1000 * 10) / 10;
    };
    const addMicroseconds = await time(() => controller.add(1, 2));
    const userMicroseconds = await time(() => controller.user(user));
    await client.disconnect();
    return { ok: true, addMicroseconds, userMicroseconds };
}

async function attempt<T>(fn: () => Promise<T>): Promise<T | { ok: false; error: string }> {
    try {
        return await fn();
    } catch (error: any) {
        return { ok: false, error: String(error?.stack || error) };
    }
}

const results: Record<string, unknown> = {
    crossOriginIsolated,
    waitAsync: typeof (Atomics as any).waitAsync === 'function',
};

results.messagePort = await attempt(() => {
    const worker = new Worker(new URL('./worker.ts', import.meta.url), { type: 'module' });
    worker.postMessage({});
    return run(createMessagePortChannel(worker));
});

results.sharedMemory = await attempt(() => {
    const memory = createRpcSharedMemory(64 * 1024);
    const worker = new Worker(new URL('./worker.ts', import.meta.url), { type: 'module' });
    worker.postMessage({ memory });
    return run(createSharedMemoryChannel(memory, 'client'));
});

(window as any).results = results;
document.body.textContent = JSON.stringify(results);
