import { afterEach, beforeEach, describe, expect, test } from '@jest/globals';

import { AsyncDirectClient, DirectClient } from '../src/client/client-direct.js';
import { RpcClient } from '../src/client/client.js';
import { rpc } from '../src/decorators.js';
import { RpcKernel, RpcKernelBaseConnection } from '../src/server/kernel.js';
import { TransportClientConnection } from '../src/transport.js';

// Close events from replaced sockets, overlapping connection attempts, and
// attempts whose socket closes before it is connected.

@rpc.controller('test')
class TestController {
    @rpc.action()
    ping(): string {
        return 'pong';
    }

    @rpc.action()
    echo(text: string): string {
        return text;
    }
}

/**
 * A browser-like WebSocket between the client and a real RpcKernel, driven by
 * hand: it opens when the test says so, delivers server messages on a later
 * task, drops messages that arrive after close() and reports the close later.
 */
class FakeSocket {
    state: 'connecting' | 'open' | 'closing' | 'closed' = 'connecting';
    /** Keeps server messages until release(), e.g. to stop a handshake halfway */
    holdIncoming = false;
    /** Keeps the close event of a client-side close() until finishClose() */
    holdClose = false;
    private held: Uint8Array[] = [];
    private server?: RpcKernelBaseConnection;

    constructor(
        private kernel: RpcKernel,
        private connection: TransportClientConnection,
    ) {}

    open() {
        this.state = 'open';
        this.server = this.kernel.createConnection({
            writeBinary: buffer => this.receive(buffer),
            close: () => this.serverClosed(),
        });
        this.connection.onConnected({
            close: () => this.clientClose(),
            writeBinary: buffer => {
                if (this.state === 'open') this.server?.feed(buffer);
            },
        });
    }

    release() {
        this.holdIncoming = false;
        const held = this.held.splice(0);
        setTimeout(() => held.forEach(buffer => this.deliver(buffer)));
    }

    finishClose() {
        if (this.state === 'closed') return;
        this.state = 'closed';
        this.connection.onClose('code 1005 reason unknown');
    }

    /** The server closes the socket */
    serverClose() {
        this.server?.close();
    }

    /** The socket closes without ever opening and without an error event */
    closeBeforeOpen() {
        this.state = 'closed';
        this.connection.onClose('code 1006 reason unknown');
    }

    private receive(buffer: Uint8Array) {
        if (this.holdIncoming) {
            this.held.push(buffer);
        } else {
            setTimeout(() => this.deliver(buffer));
        }
    }

    private deliver(buffer: Uint8Array) {
        // like a browser, drop what arrives after close() was called
        if (this.state === 'open') this.connection.readBinary(buffer);
    }

    private clientClose() {
        if (this.state !== 'open') return;
        this.state = 'closing';
        this.server?.close();
        if (!this.holdClose) setTimeout(() => this.finishClose());
    }

    private serverClosed() {
        if (this.state !== 'open') return;
        this.state = 'closing';
        setTimeout(() => this.finishClose());
    }
}

const wait = (ms: number) => new Promise<void>(resolve => setTimeout(resolve, ms));

/** What a promise settled to within a short time, or 'pending' */
function settled<T>(promise: Promise<T>, ms = 300) {
    return Promise.race([promise.catch(() => 'rejected' as const), wait(ms).then(() => 'pending' as const)]);
}

async function until(condition: () => boolean, ms = 1000) {
    for (const end = Date.now() + ms; !condition() && Date.now() < end; ) await wait(5);
}

describe('RpcClient reconnects', () => {
    let kernel: RpcKernel;
    let sockets: FakeSocket[];
    let client: RpcClient;
    let controller: ReturnType<typeof client.controller<TestController>>;
    let stopped = false;

    beforeEach(() => {
        kernel = new RpcKernel();
        kernel.registerController(TestController);
        sockets = [];
        client = new RpcClient({ connect: connection => void sockets.push(new FakeSocket(kernel, connection)) });
        controller = client.controller<TestController>('test');
        stopped = false;
    });

    afterEach(() => {
        stopped = true;
    });

    /** Reconnects on every disconnect and retries failed attempts, as an app keeping a session alive would */
    function reconnectOnDisconnect() {
        const tryToConnect = () => {
            client.connect().catch(() => setTimeout(() => stopped || tryToConnect(), 5));
        };
        client.transporter.disconnected.subscribe(() => stopped || tryToConnect());
        return tryToConnect;
    }

    async function connectOverNewSocket() {
        const connecting = client.connect();
        sockets[sockets.length - 1].open();
        await connecting;
    }

    test('ignores the late close event of a socket it already replaced', async () => {
        await connectOverNewSocket();
        sockets[0].holdClose = true;
        await client.disconnect();
        await connectOverNewSocket();

        sockets[1].holdIncoming = true;
        const call = controller.ping();
        sockets[0].finishClose();
        sockets[1].release();

        expect(await settled(call)).toBe('pong');
        expect(client.transporter.isConnected()).toBe(true);
        expect(sockets).toHaveLength(2);
    });

    test('keeps one attempt when the replaced socket closes while the next one connects', async () => {
        await connectOverNewSocket();
        sockets[0].holdClose = true;
        await client.disconnect();

        const first = client.connect();
        sockets[0].finishClose();
        const second = client.connect();
        expect(sockets).toHaveLength(2);

        sockets[1].open();
        expect(await settled(Promise.all([first, second]).then(() => 'connected'))).toBe('connected');
        expect(await settled(controller.ping())).toBe('pong');
        expect(sockets).toHaveLength(2);
    });

    test('sends every call made while a token change replaces the connection', async () => {
        const tryToConnect = reconnectOnDisconnect();
        await connectOverNewSocket();

        // a token change: disconnect() (whose disconnected event starts the next attempt), then connect again
        sockets[0].holdClose = true;
        void client.disconnect();
        tryToConnect();
        const call1 = controller.ping();
        // the old socket's close event arrives during the new attempt, then the new socket opens but its handshake is slow
        sockets[0].finishClose();
        sockets[1].holdIncoming = true;
        sockets[1].open();
        // another method: calls to the same method share one type lookup
        const call2 = controller.echo('b');
        sockets[1].release();
        // let the network deliver what is in flight; a parallel attempt's socket, if one was started, opens after that
        await wait(10);
        sockets[2]?.open();

        expect(await settled(call1)).toBe('pong');
        expect(await settled(call2)).toBe('b');
        expect(sockets).toHaveLength(2);
    });

    test('fails an attempt whose socket closes before opening, and connects on the next try', async () => {
        const attempt = client.connect();
        sockets[0].closeBeforeOpen();
        expect(await settled(attempt)).toBe('rejected');

        await connectOverNewSocket();
        expect(await settled(controller.ping())).toBe('pong');
    });

    test('rejects calls waiting on a handshake the server cuts off, then reconnects over one new socket', async () => {
        reconnectOnDisconnect();
        const attempt = client.connect();
        sockets[0].holdIncoming = true;
        sockets[0].open();
        const queued = controller.ping();
        sockets[0].serverClose();

        expect(await settled(attempt)).toBe('rejected');
        expect(await settled(queued)).toBe('rejected');

        await until(() => sockets.length > 1);
        sockets[1].open();
        expect(await settled(controller.ping())).toBe('pong');
        expect(sockets).toHaveLength(2);
    });

    test.each([DirectClient, AsyncDirectClient])('connects, disconnects and reconnects over %p', async Client => {
        const direct = new Client(kernel);
        const directController = direct.controller<TestController>('test');
        expect(await settled(directController.ping())).toBe('pong');
        await direct.disconnect();
        expect(direct.transporter.isConnected()).toBe(false);
        expect(await settled(directController.ping())).toBe('pong');
        expect(direct.transporter.isConnected()).toBe(true);
        await direct.disconnect();
    });
});
