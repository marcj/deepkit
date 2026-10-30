import { expect, test } from '@jest/globals';
import { RpcKernel } from '../src/server/kernel.js';
import { RpcClient } from '../src/client/client.js';
import { TransportClientConnection } from '../src/transport.js';
import { rpc } from '../src/decorators';
import { DirectClient } from '../src/client/client-direct';
import { sleep } from '@deepkit/core';

test('connect', async () => {
    const kernel = new RpcKernel();

    const connections: TransportClientConnection[] = [];

    const client = new RpcClient({
        connect(connection: TransportClientConnection) {
            const kernelConnection = kernel.createConnection({
                writeBinary: (buffer) => connection.readBinary(buffer),
                close: () => {
                    queueMicrotask(() => {
                        connection.onClose('');
                    });
                },
            });

            connections.push(connection);

            connection.onConnected({
                clientAddress: () => {
                    return 'direct';
                },
                bufferedAmount(): number {
                    return 0;
                },
                close() {
                    queueMicrotask(() => {
                        kernelConnection.close();
                    });
                },
                writeBinary(buffer) {
                    kernelConnection.feed(buffer);
                },
            });
        },
    });

    const errors: Error[] = [];
    client.transporter.errored.subscribe((error) => {
        errors.push(error.error);
    });

    await client.connect();
    expect(client.transporter.isConnected()).toBe(true);
    expect(connections).toHaveLength(1);

    {
        await client.connect();
        expect(client.transporter.isConnected()).toBe(true);
        await client.disconnect();
        expect(client.transporter.isConnected()).toBe(false);
    }

    {
        //an error on the live connection is reported and disconnects
        await client.connect();
        expect(connections).toHaveLength(2);
        connections[1].onError(new Error('test'));
        expect(errors[0].message).toEqual('test');
        expect(client.transporter.isConnected()).toBe(false);
    }

    {
        //an error on a connection that was already replaced leaves the current one alone
        await client.connect();
        connections[0].onError(new Error('stale'));
        expect(errors).toHaveLength(1);
        expect(client.transporter.isConnected()).toBe(true);
    }
});

test('stats', async () => {
    class Controller {
        @rpc.action()
        test1(name: string) {

        }
    }

    const kernel = new RpcKernel();
    kernel.registerController(Controller, 'main');

    async function createClient(callback: (client: RpcClient) => Promise<void>) {
        const client = new DirectClient(kernel);
        await callback(client);
        await sleep(0);
        return client;
    }

    expect(kernel.stats.connections).toBe(0);
    const c1 = await createClient(async (client) => {
        await client.connect();
    });

    expect(kernel.stats.connections).toBe(1);
    expect(kernel.stats.actions).toBe(0);

    //due to handshake
    expect(kernel.stats.incoming).toBe(1);
    expect(kernel.stats.incomingBytes).toBe(12);
    expect(kernel.stats.outgoing).toBe(1);
    expect(kernel.stats.outgoingBytes).toBeGreaterThan(12);

    const c2 = await createClient(async (client) => {
        await client.controller<Controller>('main').test1('Peter');
    });
    expect(kernel.stats.connections).toBe(2);
    expect(kernel.stats.actions).toBe(1);

    await c1.disconnect();
    expect(kernel.stats.connections).toBe(1);
    await c2.disconnect();
    expect(kernel.stats.connections).toBe(0);
    expect(kernel.stats.totalConnections).toBe(2);
});
