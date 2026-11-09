// Deepkit RPC over WebSocket. Arguments are validated from their types, results are serialized as BSON.
import { BenchSuite } from '@deepkit/bench';
import { RpcKernel, RpcWebSocketClient, rpc } from '@deepkit/rpc';
import { RpcWebSocketServer } from '@deepkit/rpc-tcp';
import { Email, MinLength } from '@deepkit/type';

import { createUsers, rpcSuite } from './shared.js';

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

export default async function (): Promise<BenchSuite> {
    const kernel = new RpcKernel();
    kernel.registerController(Controller);
    const server = new RpcWebSocketServer(kernel, '127.0.0.1:34576');
    server.start({ host: '127.0.0.1', port: 34576 });

    const client = new RpcWebSocketClient('ws://127.0.0.1:34576');
    const controller = client.controller<Controller>('/bench');

    return rpcSuite('Deepkit (WebSocket)', {
        add: (a, b) => controller.add(a, b),
        saveUser: user => controller.saveUser(user),
        listUsers: count => controller.listUsers(count),
        close: () => {
            client.disconnect();
            server.close();
        },
    });
}
