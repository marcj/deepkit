// Deepkit RPC to a child process over TCP on localhost (RpcTcpServer), for comparison with the channels.
import { RpcClient } from '@deepkit/rpc';
import { RpcTcpClientAdapter } from '@deepkit/rpc-tcp';

import { forkServer, ipcSuite, waitForMessage } from './shared.js';

export default async function () {
    const child = forkServer('tcp', '127.0.0.1:34581');
    await waitForMessage(child, 'listening');
    const client = new RpcClient(new RpcTcpClientAdapter('127.0.0.1:34581'));
    return ipcSuite('Child process (TCP)', client, () => child.kill());
}
