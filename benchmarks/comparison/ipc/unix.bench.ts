// Deepkit RPC to a child process over a unix socket (RpcTcpServer), for comparison with the channels.
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { RpcClient } from '@deepkit/rpc';
import { RpcTcpClientAdapter } from '@deepkit/rpc-tcp';

import { forkServer, ipcSuite, waitForMessage } from './shared.js';

export default async function () {
    const path = join(tmpdir(), `deepkit-ipc-bench-${process.pid}.sock`);
    const child = forkServer('tcp', path);
    await waitForMessage(child, 'listening');
    const client = new RpcClient(new RpcTcpClientAdapter(path));
    return ipcSuite('Child process (unix socket)', client, () => child.kill());
}
