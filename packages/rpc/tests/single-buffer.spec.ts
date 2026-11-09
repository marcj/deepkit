import { afterEach, expect, jest, test } from '@jest/globals';
import { createServer, connect, Server, Socket } from 'net';

import { bsonBinarySerializer, deserializeBSONWithoutOptimiser } from '@deepkit/bson';
import { getTypeJitContainer, typeOf } from '@deepkit/type';

import {
    createRpcCompositeMessage,
    createRpcCompositeMessageSourceDest,
    createRpcMessage,
    createRpcMessagePeer,
    createRpcMessageSourceDest,
    preSerialize,
    readBinaryRpcMessage,
    RpcBinaryMessageReader,
    RpcMessageRouteType,
    serializeBinaryRpcMessage,
    serializeBinaryRpcMessageTransient,
} from '../src/protocol.js';
import { TransportBinaryMessageChunkWriter, TransportOptions } from '../src/transport.js';

jest.setTimeout(60000);

type Body = { name: string };
const source = new Uint8Array(16).fill(1);
const destination = new Uint8Array(16).fill(2);

function expectFramed(buffer: Uint8Array) {
    expect(new DataView(buffer.buffer, buffer.byteOffset, buffer.byteLength).getUint32(0, true)).toBe(buffer.byteLength);
}

test('single body', () => {
    const buffer = serializeBinaryRpcMessage(createRpcMessage<Body>(7, 3, { name: 'peter' }));
    expectFramed(buffer);
    const message = readBinaryRpcMessage(buffer);
    expect(message.id).toBe(7);
    expect(message.type).toBe(3);
    expect(message.routeType).toBe(RpcMessageRouteType.client);
    expect(message.parseBody<Body>()).toEqual({ name: 'peter' });
});

test('no body', () => {
    const buffer = serializeBinaryRpcMessage(createRpcMessage(7, 3));
    expect(buffer.byteLength).toBe(12);
    expectFramed(buffer);
});

test('no body on every route', () => {
    for (const routeType of [RpcMessageRouteType.client, RpcMessageRouteType.server]) {
        const buffer = serializeBinaryRpcMessage(createRpcMessage(9, 4, undefined, routeType));
        expectFramed(buffer);
        const message = readBinaryRpcMessage(buffer);
        expect(message.id).toBe(9);
        expect(message.type).toBe(4);
        expect(message.routeType).toBe(routeType);
        expect(message.composite).toBe(false);
        expect(message.bodySize).toBe(0);
    }
    expectFramed(serializeBinaryRpcMessage(createRpcMessageSourceDest(7, 3, source, destination)));
    expectFramed(serializeBinaryRpcMessage(createRpcMessagePeer(7, 3, source, 'peer1')));
});

test('source and destination', () => {
    const buffer = serializeBinaryRpcMessage(createRpcMessageSourceDest<Body>(7, 3, source, destination, { name: 'peter' }));
    expectFramed(buffer);
    const message = readBinaryRpcMessage(buffer);
    expect([...message.getSource()]).toEqual([...source]);
    expect([...message.getDestination()]).toEqual([...destination]);
    expect(message.parseBody<Body>()).toEqual({ name: 'peter' });
});

test('peer', () => {
    const buffer = serializeBinaryRpcMessage(createRpcMessagePeer<Body>(7, 3, source, 'peer1', { name: 'peter' }));
    expectFramed(buffer);
    const message = readBinaryRpcMessage(buffer);
    expect(message.getPeerId()).toBe('peer1');
    expect(message.parseBody<Body>()).toEqual({ name: 'peter' });
});

const composite = [
    { type: 5, schema: typeOf<Body>(), body: { name: 'first' } },
    { type: 6 },
    { type: 7, schema: typeOf<Body>(), body: { name: 'x'.repeat(5000) } },
];

function expectComposite(buffer: Uint8Array) {
    expectFramed(buffer);
    const message = readBinaryRpcMessage(buffer);
    const bodies = message.getBodies();
    expect(bodies.map(v => v.type)).toEqual([5, 6, 7]);
    expect(bodies[0].parseBody<Body>()).toEqual({ name: 'first' });
    expect(bodies[1].bodySize).toBe(0);
    expect(bodies[2].parseBody<Body>()).toEqual({ name: 'x'.repeat(5000) });
}

test('composite', () => expectComposite(serializeBinaryRpcMessage(createRpcCompositeMessage(7, 3, composite))));
test('composite with source and destination', () => expectComposite(serializeBinaryRpcMessage(createRpcCompositeMessageSourceDest(7, source, destination, 3, composite))));

test('a body larger than the buffer is complete', () => {
    const name = 'y'.repeat(3_000_000);
    const buffer = serializeBinaryRpcMessage(createRpcMessage<Body>(7, 3, { name }));
    expectFramed(buffer);
    expect(readBinaryRpcMessage(buffer).parseBody<Body>()).toEqual({ name });
});

test('the size of a body is never computed up front', () => {
    const type = typeOf<Body & { sizerTrap: 1 }>();
    getTypeJitContainer(type)[bsonBinarySerializer.sizerId] = () => {
        throw new TypeError('sizer must not be called');
    };
    const body = { name: 'a', sizerTrap: 1 };
    expect(() => serializeBinaryRpcMessage(createRpcMessage(1, 1, body, undefined, type))).not.toThrow();
    expect(() => serializeBinaryRpcMessage(createRpcCompositeMessage(1, 1, [{ type: 1, schema: type, body }]))).not.toThrow();
});

test('a serialized message keeps its own memory', () => {
    const first = serializeBinaryRpcMessage(createRpcMessage<Body>(1, 1, { name: 'first' }));
    const copy = first.slice();
    serializeBinaryRpcMessage(createRpcMessage<Body>(2, 2, { name: 'other' }));
    expect(first).toEqual(copy);
});

test('a transient message is written in place', () => {
    const first = serializeBinaryRpcMessageTransient(createRpcMessage<Body>(1, 1, { name: 'first' }))!;
    const second = serializeBinaryRpcMessageTransient(createRpcMessage<Body>(2, 1, { name: 'other' }))!;
    expect(first.buffer).toBe(second.buffer);
    expect(readBinaryRpcMessage(second).parseBody<Body>()).toEqual({ name: 'other' });
});

test('a pre serialized message is not transient, a transport may remember the buffer', () => {
    const pre = preSerialize<string>('value');
    expect(serializeBinaryRpcMessageTransient(createRpcMessage<{ v: string }>(1, 1, { v: pre as any }))).toBeUndefined();
});

let server: Server | undefined;
let client: Socket | undefined;

afterEach(async () => {
    client?.destroy();
    client = undefined;
    await new Promise<void>(resolve => (server ? server.close(() => resolve()) : resolve()));
    server = undefined;
});

async function socketPair() {
    let peer!: Socket;
    const accepted = new Promise<void>(resolve => {
        server = createServer(socket => {
            peer = socket;
            socket.on('error', () => undefined);
            resolve();
        });
    });
    await new Promise<void>(resolve => server!.listen(0, '127.0.0.1', resolve));
    client = connect((server!.address() as any).port, '127.0.0.1');
    client.on('error', () => undefined);
    await new Promise<void>(resolve => client!.once('connect', resolve));
    await accepted;
    return peer;
}

function parseFrames(data: Buffer) {
    const bodies: any[] = [];
    for (let offset = 0; offset < data.length;) {
        const size = data.readUInt32LE(offset);
        bodies.push(deserializeBSONWithoutOptimiser(data.subarray(offset + 12, offset + size)));
        offset += size;
    }
    return bodies;
}

test('a message the kernel did not take yet is not overwritten by the next one', async () => {
    const peer = await socketPair();
    peer.pause();
    const received: Buffer[] = [];
    peer.on('data', v => received.push(v));
    const writer = new TransportBinaryMessageChunkWriter(new RpcBinaryMessageReader(() => undefined), new TransportOptions());

    const size = 90_000;
    const names: string[] = [];
    let extra = 0;
    let bytes = 0;
    for (let seq = 0; seq < 3000 && extra < 32; seq++) {
        const name = String.fromCharCode(97 + (seq % 26)).repeat(size);
        names.push(name);
        bytes += writer.writeToSocket(client!, createRpcMessage<Body>(seq, 1, { name }));
        if (client!.writableLength > 0) extra++;
    }
    expect(extra).toBeGreaterThan(1);

    peer.resume();
    const total = () => received.reduce((sum, v) => sum + v.length, 0);
    for (let i = 0; i < 5000 && total() < bytes; i++) await new Promise(resolve => setTimeout(resolve, 5));
    const bodies = parseFrames(Buffer.concat(received));
    expect(bodies.length).toBe(names.length);
    for (let i = 0; i < bodies.length; i++) expect(bodies[i].name === names[i]).toBe(true);
});

test('a message above the chunk size goes through the chunk writer with its own memory', async () => {
    await socketPair();
    const writer = new TransportBinaryMessageChunkWriter(new RpcBinaryMessageReader(() => undefined), new TransportOptions());
    const write = jest.spyOn(writer, 'write').mockImplementation(() => undefined);
    writer.writeToSocket(client!, createRpcMessage<Body>(1, 1, { name: 'x'.repeat(200_000) }));
    expect(write).toHaveBeenCalledTimes(1);
    const buffer = write.mock.calls[0][1] as Uint8Array;
    serializeBinaryRpcMessage(createRpcMessage<Body>(2, 1, { name: 'other' }));
    expect(readBinaryRpcMessage(buffer).parseBody<Body>()).toEqual({ name: 'x'.repeat(200_000) });
});
