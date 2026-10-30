import { expect, test } from '@jest/globals';
import { RpcBaseClient, TransportClientConnection } from '../src/client/client.js';
import { RpcTypes } from '../src/model.js';

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
    const client = new RpcBaseClient(unreachableTransport());
    const result = client.sendMessage(RpcTypes.Ping).ackThenClose();
    const timeout = new Promise(resolve => setTimeout(() => resolve('pending'), 1000));

    const outcome = await Promise.race([result.then(() => 'resolved', (error: Error) => error.message), timeout]);
    expect(outcome).toContain('ENOENT');
});

test('a failed message does not leak its reply handler', async () => {
    const client = new RpcBaseClient(unreachableTransport());
    await client.sendMessage(RpcTypes.Ping).ackThenClose().catch(() => undefined);
    expect((client as any).replies.size).toBe(0);
});
