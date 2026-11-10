// The RPC server of the IPC benchmarks, in a worker thread or child process. The first argument is the channel.
import { Socket } from 'node:net';
import { parentPort, workerData } from 'node:worker_threads';

import {
    RpcKernel,
    createMessagePortChannel,
    createProcessChannel,
    createSharedMemoryChannel,
    createStreamChannel,
    rpc,
    serveRpcChannel,
} from '@deepkit/rpc';
import { RpcTcpServer } from '@deepkit/rpc-tcp';
import { Email, MinLength } from '@deepkit/type';

import { createUsers } from '../rpc/shared.js';

interface User {
    id: number;
    name: string & MinLength<3>;
    email: string & Email;
    active: boolean;
    roles: string[];
}

@rpc.controller('/bench')
class Controller {
    @rpc.action()
    add(a: number, b: number): number {
        return a + b;
    }

    @rpc.action()
    saveUser(user: User): User {
        return user;
    }

    @rpc.action()
    listUsers(count: number): User[] {
        return createUsers(count);
    }
}

const kernel = new RpcKernel();
kernel.registerController(Controller);

const [mode, address] = parentPort ? [workerData.mode as string, workerData.address as string] : process.argv.slice(2);

if (mode === 'shared-memory') {
    const channel = createSharedMemoryChannel(workerData.memory, 'server', { spin: workerData.spin });
    serveRpcChannel(kernel, channel);
} else if (mode === 'worker') {
    serveRpcChannel(kernel, createMessagePortChannel(parentPort!));
} else if (mode === 'process') {
    serveRpcChannel(kernel, createProcessChannel(process));
    process.on('disconnect', () => process.exit(0));
} else if (mode === 'pipe') {
    const socket = new Socket({ fd: 3, readable: true, writable: true });
    serveRpcChannel(kernel, createStreamChannel(socket));
    socket.on('close', () => process.exit(0));
} else if (mode === 'tcp') {
    const server = new RpcTcpServer(kernel, address);
    await server.start();
    process.send!('listening');
    process.on('disconnect', () => process.exit(0));
}
