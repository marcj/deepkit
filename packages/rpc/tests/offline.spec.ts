import { expect, test } from '@jest/globals';

import { RpcClient, TransportClientConnection } from '../src/client/client.js';

/**
 * A transport whose connection attempts fail, like a TCP/unix socket with no server listening.
 */
function unreachableTransport() {
    return {
        connect(connection: TransportClientConnection) {
            setTimeout(() => connection.onError(new Error('connect ENOENT /tmp/does-not-exist.sock')));
        },
    };
}

test('a message sent while the server is unreachable is rejected, not left pending forever', async () => {
    const client = new RpcClient(unreachableTransport());
    const result = client.ping();
    const timeout = new Promise(resolve => setTimeout(() => resolve('pending'), 1000));

    const outcome = await Promise.race([
        result.then(
            () => 'resolved',
            (error: Error) => error.message,
        ),
        timeout,
    ]);
    expect(outcome).toContain('ENOENT');
});

test('a failed message does not leak its reply handler', async () => {
    const client = new RpcClient(unreachableTransport());
    await client.ping().catch(() => undefined);
    expect((client as any).contexts.active).toBe(0);
});
