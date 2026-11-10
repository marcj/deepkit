// Deepkit RPC to a forked child process, over its IPC channel (createProcessChannel).
import { RpcChannelClientAdapter, RpcClient, createProcessChannel } from '@deepkit/rpc';

import { forkServer, ipcSuite } from './shared.js';

export default async function () {
    const child = forkServer('process');
    const client = new RpcClient(new RpcChannelClientAdapter(createProcessChannel(child)));
    return ipcSuite('Child process (process.send)', client, () => child.kill());
}
