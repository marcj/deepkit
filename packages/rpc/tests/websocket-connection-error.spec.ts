import { expect, test } from '@jest/globals';

import { RpcWebSocketClient } from '@deepkit/rpc';

const { createServer } = process.getBuiltinModule('net');

// A port that was free a moment ago, so nothing listens on it.
async function closedPort(): Promise<number> {
    const server = createServer();
    await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve));
    const { port } = server.address() as { port: number };
    await new Promise(resolve => server.close(resolve));
    return port;
}

test('a refused WebSocket connection names its URL once, with one "Could not connect" prefix', async () => {
    const url = `ws://127.0.0.1:${await closedPort()}/rpc`;
    const client = new RpcWebSocketClient(url);

    const message: string = await client.connect().then(
        () => 'connected',
        (error: Error) => error.message,
    );
    const count = (text: string) => message.split(text).length - 1;

    expect({
        message,
        'times the URL appears': count(url),
        'times "Could not connect" appears': count('Could not connect'),
    }).toEqual({
        message: expect.stringContaining('code 1006'),
        'times the URL appears': 1,
        'times "Could not connect" appears': 1,
    });
});
