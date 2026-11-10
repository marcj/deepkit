import { expect, jest, test } from '@jest/globals';
import { createServer } from 'net';
import { Observable, lastValueFrom } from 'rxjs';

import { SequentialContextDispatcher } from '@deepkit/net';
import { RpcClient, RpcKernel, rpc } from '@deepkit/rpc';

import { RpcTcpClientAdapter, RpcTcpServer } from '../index.js';

jest.setTimeout(30000);

@rpc.controller('binary')
class Controller {
    @rpc.action()
    bytes(seed: number, size: number): Uint8Array {
        return new Uint8Array(size).fill(seed);
    }

    @rpc.action()
    echoBytes(value: Uint8Array): Uint8Array {
        return value;
    }

    @rpc.action()
    stream(): Observable<number> {
        return new Observable(observer => {
            for (let i = 0; i < 100; i++) observer.next(i);
            observer.complete();
        });
    }
}

async function freePort(): Promise<number> {
    const server = createServer();
    await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve));
    const port = (server.address() as any).port;
    await new Promise(resolve => server.close(resolve));
    return port;
}

test('a Uint8Array returned over TCP stays valid after later reads of the same read buffer', async () => {
    const kernel = new RpcKernel();
    kernel.registerController(Controller);
    const host = '127.0.0.1:' + (await freePort());
    const server = new RpcTcpServer(kernel, host);
    await server.start();
    const client = new RpcClient(new RpcTcpClientAdapter(host));
    const controller = client.controller<Controller>('binary');
    await client.connect();

    const first = await controller.bytes(7, 1024);
    const results: Uint8Array[] = [];
    // later replies reuse the 64 KiB read buffer many times over
    for (let i = 0; i < 400; i++) results.push(await controller.bytes(i % 256, 1024));

    expect(first.every(v => v === 7)).toBe(true);
    for (let i = 0; i < 400; i++) expect(results[i].every(v => v === i % 256)).toBe(true);

    const big = await controller.echoBytes(new Uint8Array(500_000).fill(3));
    expect(big.every(v => v === 3)).toBe(true);

    await client.disconnect();
    server.close();
});

test('observable streams over TCP give their context ids back', async () => {
    const kernel = new RpcKernel();
    kernel.registerController(Controller);
    const host = '127.0.0.1:' + (await freePort());
    const server = new RpcTcpServer(kernel, host);
    await server.start();
    const client = new RpcClient(new RpcTcpClientAdapter(host));
    const controller = client.controller<Controller>('binary');
    await client.connect();

    // far below the 16 bit limit, so that a leak shows after a few streams
    (client as any).contexts = new SequentialContextDispatcher(32, 32);

    await Promise.all(
        Array.from({ length: 16 }, async () => {
            for (let i = 0; i < 40; i++) expect(await lastValueFrom(await controller.stream())).toBe(99);
        }),
    );

    for (let i = 0; i < 100 && (client as any).contexts.active > 0; i++) await new Promise(resolve => setTimeout(resolve, 5));
    expect((client as any).contexts.active).toBe(0);

    await client.disconnect();
    server.close();
});
