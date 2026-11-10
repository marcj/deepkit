// Deepkit RPC to a worker thread over shared memory (createSharedMemoryChannel), without messages, polling 100µs.
import { RpcChannelClientAdapter, RpcClient, createRpcSharedMemory, createSharedMemoryChannel } from '@deepkit/rpc';

import { ipcSuite, startWorker } from './shared.js';

export default async function () {
    const memory = createRpcSharedMemory();
    const worker = startWorker('shared-memory', { memory });
    const channel = createSharedMemoryChannel(memory, 'client');
    worker.on('exit', () => channel.close());
    const client = new RpcClient(new RpcChannelClientAdapter(channel));
    return ipcSuite('Worker thread (shared memory)', client, () => worker.terminate());
}
