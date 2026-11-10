// Deepkit RPC to a worker thread, over its MessagePort (createMessagePortChannel).
import { RpcChannelClientAdapter, RpcClient, createMessagePortChannel } from '@deepkit/rpc';

import { ipcSuite, startWorker } from './shared.js';

export default async function () {
    const worker = startWorker('worker');
    const client = new RpcClient(new RpcChannelClientAdapter(createMessagePortChannel(worker)));
    return ipcSuite('Worker thread (MessagePort)', client, () => worker.terminate());
}
