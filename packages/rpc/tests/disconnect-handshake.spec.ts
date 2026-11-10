import { expect, test } from '@jest/globals';

import { ClientTransportAdapter, RpcClient, TransportClientConnection } from '@deepkit/rpc';

test('disconnect() closes the transport while the handshake waits on a silent server', async () => {
    let connection: TransportClientConnection | undefined;
    let closeCalls = 0;

    // A server that accepts the connection but never answers the handshake.
    const silentServer: ClientTransportAdapter = {
        connect(clientConnection) {
            connection = clientConnection;
            clientConnection.onConnected({
                writeBinary() {},
                close() {
                    closeCalls++;
                    clientConnection.onClose('closed');
                },
                bufferedAmount: () => 0,
                clientAddress: () => 'silent',
            });
        },
    };

    const client = new RpcClient(silentServer);
    const connecting = client.connect().catch(() => undefined);
    await new Promise(resolve => setTimeout(resolve, 50));

    const disconnecting = client.disconnect().then(() => 'resolved');
    let timer: ReturnType<typeof setTimeout> | undefined;
    const stillPendingAfter300ms = new Promise<string>(resolve => {
        timer = setTimeout(() => resolve('still pending after 300 ms'), 300);
    });

    try {
        expect({
            'disconnect()': await Promise.race([disconnecting, stillPendingAfter300ms]),
            'transport close() calls': closeCalls,
        }).toEqual({
            'disconnect()': 'resolved',
            'transport close() calls': 1,
        });
    } finally {
        clearTimeout(timer);
        connection?.onClose('test cleanup');
        await Promise.allSettled([connecting, disconnecting]);
    }
});
