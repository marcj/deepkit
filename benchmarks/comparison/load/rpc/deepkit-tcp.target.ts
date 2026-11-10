// Deepkit RPC over TCP under load.
import { RpcClient, RpcKernel } from '@deepkit/rpc';
import { RpcTcpClientAdapter, RpcTcpServer } from '@deepkit/rpc-tcp';

import { rpcTarget } from '../rpc-load.js';
import { Controller } from './deepkit-controller.js';

export const target = rpcTarget({
    async serve(port) {
        const kernel = new RpcKernel();
        kernel.registerController(Controller);
        const server = new RpcTcpServer(kernel, `127.0.0.1:${port}`);
        await server.start();
        return server;
    },
    async connect(port) {
        const client = new RpcClient(new RpcTcpClientAdapter(`127.0.0.1:${port}`));
        const controller = client.controller<Controller>('/bench');
        return {
            add: (a, b) => controller.add(a, b),
            saveUser: user => controller.saveUser(user),
            listUsers: count => controller.listUsers(count),
        };
    },
});
