import { afterEach, expect, jest, test } from '@jest/globals';
import { Server, Socket, createServer } from 'net';

import { Writer, bsonBinarySerializer, deserializeBSONWithoutOptimiser, getBSONSerializer } from '@deepkit/bson';
import { SocketWriter } from '@deepkit/net/node';
import { getTypeJitContainer, typeOf } from '@deepkit/type';

import { MongoClientConfig } from '../../src/client/config.js';
import { MongoConnection } from '../../src/client/connection.js';

jest.setTimeout(60000);

type Message = { seq: number; payload: string };

let server: Server | undefined;
let connection: any;

afterEach(async () => {
    jest.restoreAllMocks();
    connection?.socket.destroy();
    connection = undefined;
    await new Promise<void>(resolve => (server ? server.close(() => resolve()) : resolve()));
    server = undefined;
});

/** A connection to a local server that never answers, so only what is put on the wire is observed. */
async function setup(): Promise<{ peer: Socket; received: Buffer[] }> {
    let peer!: Socket;
    const received: Buffer[] = [];
    const connected = new Promise<void>(resolve => {
        server = createServer(socket => {
            peer = socket;
            socket.on('data', v => received.push(v));
            socket.on('error', () => undefined);
            resolve();
        });
    });
    await new Promise<void>(resolve => server!.listen(0, '127.0.0.1', resolve));
    const port = (server!.address() as any).port;
    const config = new MongoClientConfig(`mongodb://127.0.0.1:${port}/test`);
    const host = { id: 1, hostname: '127.0.0.1', port, stats: {}, type: 0 } as any;
    connection = new MongoConnection(
        1,
        host,
        config,
        bsonBinarySerializer,
        () => undefined,
        () => undefined,
        () => undefined,
        () => undefined,
    );
    connection.connect().catch(() => undefined);
    await connected;
    await new Promise<void>(resolve => (connection.socket.connecting ? connection.socket.once('connect', resolve) : resolve()));
    return { peer, received };
}

function parseFrames(data: Buffer): { length: number; requestId: number; opCode: number; flags: number; kind: number; body: any }[] {
    const frames: any[] = [];
    for (let offset = 0; offset < data.length; ) {
        const length = data.readInt32LE(offset);
        expect(offset + length).toBeLessThanOrEqual(data.length);
        frames.push({
            length,
            requestId: data.readInt32LE(offset + 4),
            opCode: data.readInt32LE(offset + 12),
            flags: data.readUInt32LE(offset + 16),
            kind: data[offset + 20],
            body: deserializeBSONWithoutOptimiser(data.subarray(offset + 21, offset + length)),
        });
        offset += length;
    }
    return frames.filter(v => v.body.seq !== undefined);
}

async function waitForBytes(received: Buffer[], bytes: number) {
    const total = () => received.reduce((sum, v) => sum + v.length, 0);
    for (let i = 0; i < 5000 && total() < bytes; i++) await new Promise(resolve => setTimeout(resolve, 5));
    return Buffer.concat(received);
}

test('messages are framed correctly, also when one outgrows the buffer', async () => {
    const { received } = await setup();
    const type = typeOf<Message>();

    const payloads = ['small', 'x'.repeat(100_000), 'also small', 'y'.repeat(300_000)];
    payloads.forEach((payload, seq) => connection.sendMessage(type, { seq, payload }));
    const bytesSent = connection.bytesSent;

    const frames = parseFrames(await waitForBytes(received, bytesSent));
    expect(frames.map(v => v.body)).toEqual(payloads.map((payload, seq) => ({ seq, payload })));
    for (const frame of frames) {
        expect(frame.opCode).toBe(2013);
        expect(frame.flags).toBe(0);
        expect(frame.kind).toBe(0);
    }
    const ids = frames.map(v => v.requestId);
    expect(ids).toEqual(ids.slice().sort((a, b) => a - b));
    expect(new Set(ids).size).toBe(ids.length);
});

test('a message is passed to the socket writer as a range, without a view', async () => {
    await setup();
    const write = jest.spyOn(SocketWriter.prototype, 'write');
    const range = jest.spyOn(SocketWriter.prototype, 'writeRange');
    connection.sendMessage(typeOf<Message>(), { seq: 1, payload: 'a' });
    expect(range).toHaveBeenCalledTimes(1);
    expect(write).not.toHaveBeenCalled();
});

test('no size pass and no copy of the message', async () => {
    await setup();
    const copy = jest.spyOn(Writer.prototype, 'writeBuffer');
    const type = typeOf<Message & { unique: 'sizer' }>();
    getTypeJitContainer(type)[bsonBinarySerializer.sizerId] = () => {
        throw new TypeError('sizer must not be called');
    };

    connection.sendMessage(type, { seq: 1, payload: 'a', unique: 'sizer' });
    expect(copy).toHaveBeenCalledTimes(0);
});

test('a message the kernel did not take yet is not overwritten by the next one', async () => {
    const { peer, received } = await setup();
    peer.pause();
    const type = typeOf<Message>();
    getBSONSerializer(bsonBinarySerializer, type);

    // fills the socket buffers until node has to keep our memory, then keeps sending
    const size = 512 * 1024;
    const expected: Message[] = [];
    let extra = 0;
    for (let seq = 0; seq < 400 && extra < 16; seq++) {
        const payload = String.fromCharCode(97 + (seq % 26)).repeat(size);
        expected.push({ seq, payload });
        connection.sendMessage(type, { seq, payload });
        if (connection.socket.writableLength > 0) extra++;
    }
    expect(extra).toBeGreaterThan(1);
    const bytesSent = connection.bytesSent;

    peer.resume();
    const frames = parseFrames(await waitForBytes(received, bytesSent));
    expect(frames.length).toBe(expected.length);
    for (let i = 0; i < frames.length; i++) {
        expect(frames[i].body.seq).toBe(expected[i].seq);
        expect(frames[i].body.payload === expected[i].payload).toBe(true);
    }
});

test('a large buffer is not kept by the connection', async () => {
    await setup();
    const type = typeOf<Message>();
    connection.sendMessage(type, { seq: 1, payload: 'x'.repeat(32 * 1024 * 1024) });
    expect(connection.messageBuffer._buffer.byteLength).toBeLessThan(16 * 1024 * 1024);
});
