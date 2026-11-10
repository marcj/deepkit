import { expect, test } from '@jest/globals';
import { createServer } from 'net';

import { App } from '@deepkit/app';
import { RpcClient, RpcKernel, RpcKernelSecurity, Session, SessionState, rpc } from '@deepkit/rpc';
import { RpcTcpClientAdapter, RpcTcpServer } from '@deepkit/rpc-tcp';

import { ApplicationServer, onServerMainBootstrap } from '../src/application-server.js';
import { FrameworkModule } from '../src/module.js';

class TokenSecurity extends RpcKernelSecurity {
    async authenticate(token: any): Promise<Session> {
        return new Session(String(token), token);
    }
}

class Greeter {
    greet(name: string): string {
        return 'Hello ' + name;
    }
}

@rpc.controller('main')
class Controller {
    constructor(
        private session: SessionState,
        private greeter: Greeter,
    ) {}

    @rpc.action()
    hello(): string {
        return this.greeter.greet(this.session.getSession().username);
    }
}

async function freePort(): Promise<number> {
    const server = createServer();
    await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve));
    const port = (server.address() as any).port;
    await new Promise(resolve => server.close(resolve));
    return port;
}

test('the RpcKernel of an app served over TCP', async () => {
    const host = '127.0.0.1:' + (await freePort());
    let tcp: RpcTcpServer | undefined;
    const app = new App({
        controllers: [Controller],
        providers: [Greeter, { provide: RpcKernelSecurity, useClass: TokenSecurity, scope: 'rpc' }],
        imports: [new FrameworkModule({ port: 0 })],
    }).listen(onServerMainBootstrap, async (event, kernel: RpcKernel) => {
        tcp = new RpcTcpServer(kernel, host);
        await tcp.start();
    });
    const server = app.get(ApplicationServer);
    await server.start();
    try {
        const client = new RpcClient(new RpcTcpClientAdapter(host));
        client.token.set('Peter');
        // the kernel created the rpc scope without SessionState, so the controller could not be created
        expect(await client.controller<Controller>('main').hello()).toBe('Hello Peter');
        client.disconnect();
    } finally {
        tcp?.close();
        await server.close();
    }
});
