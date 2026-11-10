// Deepkit RPC to a child process, over an extra pipe of the child (createStreamChannel).
import { Socket } from 'node:net';

import { RpcChannelClientAdapter, RpcClient, createStreamChannel } from '@deepkit/rpc';

import { ipcSuite, spawnPipeServer } from './shared.js';

export default async function () {
    const child = spawnPipeServer();
    const client = new RpcClient(new RpcChannelClientAdapter(createStreamChannel(child.stdio[3] as Socket)));
    return ipcSuite('Child process (pipe)', client, () => child.kill());
}
