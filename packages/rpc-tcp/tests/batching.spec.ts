import { expect, jest, test } from '@jest/globals';
import { createServer } from 'net';

import { RpcClient, RpcKernel, rpc } from '@deepkit/rpc';

import { RpcTcpClientAdapter, RpcTcpServer } from '../index.js';

jest.setTimeout(30000);

@rpc.controller('batching')
class Controller {
    @rpc.action()
    echo(value: string): string {
        return value;
    }
}

async function freePort(): Promise<number> {
    const server = createServer();
    await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve));
    const port = (server.address() as any).port;
    await new Promise(resolve => server.close(resolve));
    return port;
}

test('concurrent calls and large messages keep their order and content', async () => {
    const kernel = new RpcKernel();
    kernel.registerController(Controller);
    const host = '127.0.0.1:' + (await freePort());
    const server = new RpcTcpServer(kernel, host);
    await server.start();
    const client = new RpcClient(new RpcTcpClientAdapter(host));
    const controller = client.controller<Controller>('batching');

    const values = Array.from({ length: 500 }, (_, i) => String(i).repeat(i % 20 === 0 ? 40_000 : 3));
    const results = await Promise.all(values.map(v => controller.echo(v)));
    expect(results).toEqual(values);

    client.disconnect();
    server.close();
});

test('a message sent right before disconnect still arrives', async () => {
    let received = 0;

    @rpc.controller('last')
    class Last {
        @rpc.action()
        hit(): void {
            received++;
        }
    }

    const kernel = new RpcKernel();
    kernel.registerController(Last);
    const host = '127.0.0.1:' + (await freePort());
    const server = new RpcTcpServer(kernel, host);
    await server.start();
    const client = new RpcClient(new RpcTcpClientAdapter(host));
    const controller = client.controller<Last>('last');
    await controller.hit();

    controller.hit().catch(() => undefined);
    await Promise.resolve();
    client.disconnect();
    await new Promise(resolve => setTimeout(resolve, 100));
    expect(received).toBe(2);
    server.close();
});
