// Deepkit RPC to a server in a worker thread or child process, over the different channels. Unlike
// comparison/rpc, client and server run in parallel on two cores.
import { ChildProcess, fork, spawn } from 'node:child_process';
import { join } from 'node:path';
import { Worker } from 'node:worker_threads';

import { BenchSuite } from '@deepkit/bench';
import { RpcClient } from '@deepkit/rpc';

import { UserData, rpcSuite } from '../rpc/shared.js';

export const serverFile = join(import.meta.dirname, 'server.ts');
export const execArgv = ['--import', '@deepkit/run'];

interface Controller {
    add(a: number, b: number): Promise<number>;
    saveUser(user: UserData): Promise<UserData>;
    listUsers(count: number): Promise<UserData[]>;
}

export function startWorker(
    mode: string,
    data: { address?: string; memory?: SharedArrayBuffer; spin?: number } = {},
): Worker {
    return new Worker(serverFile, { workerData: { mode, ...data }, execArgv });
}

export function forkServer(mode: string, address?: string): ChildProcess {
    return fork(serverFile, [mode, address || ''], { serialization: 'advanced', execArgv });
}

export function spawnPipeServer(): ChildProcess {
    return spawn(process.execPath, [...execArgv, serverFile, 'pipe'], {
        stdio: ['ignore', 'inherit', 'inherit', 'pipe'],
    });
}

export function waitForMessage(child: ChildProcess, message: string): Promise<void> {
    return new Promise(resolve => {
        const listener = (data: unknown) => {
            if (data !== message) return;
            child.off('message', listener);
            resolve();
        };
        child.on('message', listener);
    });
}

/** calls in flight at once in the throughput benchmark */
export const parallelCalls = 64;

export async function ipcSuite(transport: string, client: RpcClient, close: () => unknown): Promise<BenchSuite> {
    const controller = client.controller<Controller>('/bench');
    const calls: Promise<number>[] = new Array(parallelCalls);
    const suite = await rpcSuite(
        transport,
        {
            add: (a, b) => controller.add(a, b),
            saveUser: user => controller.saveUser(user),
            listUsers: count => controller.listUsers(count),
            close: async () => {
                await client.disconnect();
                await close();
            },
        },
        'comparison/ipc',
    );
    // the throughput with many calls at once: one op is all of them
    suite.add(`${transport}: ${parallelCalls} calls at once`, async () => {
        for (let i = 0; i < parallelCalls; i++) calls[i] = controller.add(i, 1);
        await Promise.all(calls);
    });
    return suite;
}
