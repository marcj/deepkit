// Deepkit RPC over WebSocket under load.
import { RpcKernel, RpcWebSocketClient } from '@deepkit/rpc';
import { RpcWebSocketServer } from '@deepkit/rpc-tcp';

import { rpcTarget } from '../rpc-load.js';
import { Controller } from './deepkit-controller.js';

export const target = rpcTarget({
    async serve(port) {
        const kernel = new RpcKernel();
        kernel.registerController(Controller);
        const server = new RpcWebSocketServer(kernel, `127.0.0.1:${port}`);
        server.start({ host: '127.0.0.1', port });
        return server;
    },
    async connect(port) {
        const client = new RpcWebSocketClient(`ws://127.0.0.1:${port}`);
        const controller = client.controller<Controller>('/bench');
        return {
            add: (a, b) => controller.add(a, b),
            saveUser: user => controller.saveUser(user),
            listUsers: count => controller.listUsers(count),
        };
    },
});
