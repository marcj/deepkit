// Deepkit RPC to a worker thread over shared memory without polling: both sides sleep until the other wakes them up.
import { RpcChannelClientAdapter, RpcClient, createRpcSharedMemory, createSharedMemoryChannel } from '@deepkit/rpc';

import { ipcSuite, startWorker } from './shared.js';

export default async function () {
    const memory = createRpcSharedMemory();
    const worker = startWorker('shared-memory', { memory, spin: 0 });
    const channel = createSharedMemoryChannel(memory, 'client', { spin: 0 });
    worker.on('exit', () => channel.close());
    const client = new RpcClient(new RpcChannelClientAdapter(channel));
    return ipcSuite('Worker thread (shared memory, no polling)', client, () => worker.terminate());
}
