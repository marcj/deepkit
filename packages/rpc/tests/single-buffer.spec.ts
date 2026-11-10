import { afterEach, expect, jest, test } from '@jest/globals';
import { Server, Socket, connect, createServer } from 'net';

import { typeOf } from '@deepkit/type';

import { getBodyCodec } from '../src/action.js';
import { RpcTransportStats } from '../src/model.js';
import { ControlOp, MessageFlag, RpcBinaryMessageReader, copyWrittenFrame, frameMemory, getActionOffset, getPeerId, writeControlFrameTransient, writeHelloFrameTransient } from '../src/protocol.js';
import { TransportBinaryMessageChunkWriter, TransportOptions, createFrameSender } from '../src/transport.js';

jest.setTimeout(60000);

type Body = { name: string };
const codec = getBodyCodec(typeOf<Body>());

const routeTo = new Uint8Array(32).fill(1);

function frame(id: number, body?: Body, routeData?: Uint8Array, route: any = MessageFlag.RouteClient): Uint8Array {
    return copyWrittenFrame(writeControlFrameTransient(id, route, ControlOp.CollectionModel, body ? codec.serialize : undefined, body, routeData));
}

function readBody(buffer: Uint8Array, start = 0, end = buffer.byteLength): Body {
    return codec.deserialize(buffer, getActionOffset(buffer, start) + 1, end);
}

function expectFramed(buffer: Uint8Array) {
    expect(new DataView(buffer.buffer, buffer.byteOffset, buffer.byteLength).getUint32(0, true)).toBe(buffer.byteLength);
}

test('single body', () => {
    const buffer = frame(7, { name: 'peter' });
    expectFramed(buffer);
    expect(readBody(buffer)).toEqual({ name: 'peter' });
});

test('no body', () => {
    const buffer = frame(7);
    expect(buffer.byteLength).toBe(8);
    expectFramed(buffer);
});

test('no body on every route', () => {
    for (const route of [MessageFlag.RouteClient, MessageFlag.RouteServer]) {
        expect(frame(7, undefined, undefined, route)[4] & 0b11).toBe(route);
        expectFramed(frame(7, undefined, undefined, route));
    }
});

test('source and destination', () => {
    const buffer = frame(7, { name: 'peter' }, routeTo, MessageFlag.RouteSourceDest);
    expectFramed(buffer);
    expect(buffer.subarray(5, 37).every(v => v === 1)).toBe(true);
    expect(readBody(buffer)).toEqual({ name: 'peter' });
});

test('peer', () => {
    const route = new Uint8Array(16 + 5 + 1).fill(2);
    route.set(
        [...'peer1'].map(v => v.charCodeAt(0)),
        16,
    );
    route[21] = 0;
    const buffer = frame(7, { name: 'peter' }, route, MessageFlag.RoutePeer);
    expectFramed(buffer);
    expect(getPeerId(buffer)).toBe('peer1');
    expect(readBody(buffer)).toEqual({ name: 'peter' });
});

test('a body larger than the buffer is complete', () => {
    const name = 'y'.repeat(3_000_000);
    const buffer = frame(7, { name });
    expectFramed(buffer);
    expect(readBody(buffer)).toEqual({ name });
});

test('frames are written in place', () => {
    // the one before may have been large and needed the large buffer
    writeControlFrameTransient(1, MessageFlag.RouteClient, ControlOp.CollectionModel, codec.serialize, { name: 'first' });
    writeControlFrameTransient(1, MessageFlag.RouteClient, ControlOp.CollectionModel, codec.serialize, { name: 'first' });
    const memory = frameMemory();
    writeControlFrameTransient(2, MessageFlag.RouteClient, ControlOp.CollectionModel, codec.serialize, { name: 'other' });
    expect(frameMemory() === memory).toBe(true);
});

test('hello is a frame of the shared buffer too', () => {
    const size = writeHelloFrameTransient(5);
    expect(size).toBe(10);
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
    const bodies: Body[] = [];
    for (let offset = 0; offset < data.length; ) {
        const size = data.readUInt32LE(offset);
        bodies.push(readBody(data.subarray(offset, offset + size)));
        offset += size;
    }
    return bodies;
}

test('a frame the kernel did not take yet is not overwritten by the next one', async () => {
    const peer = await socketPair();
    peer.pause();
    const received: Buffer[] = [];
    peer.on('data', v => received.push(v));
    const options = new TransportOptions();
    const writer = new TransportBinaryMessageChunkWriter(new RpcBinaryMessageReader(), options);
    const send = createFrameSender({ binarySocket: client!, close() {} }, writer, options, new RpcTransportStats())!;

    const size = 90_000;
    const names: string[] = [];
    let extra = 0;
    let bytes = 0;
    for (let seq = 0; seq < 3000 && extra < 32; seq++) {
        const name = String.fromCharCode(97 + (seq % 26)).repeat(size);
        names.push(name);
        const length = writeControlFrameTransient(seq + 1, MessageFlag.RouteClient, ControlOp.CollectionModel, codec.serialize, { name });
        send(frameMemory(), length);
        bytes += length;
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

test('a frame above the chunk size goes through the chunk writer with its own memory', async () => {
    await socketPair();
    const options = new TransportOptions();
    const writer = new TransportBinaryMessageChunkWriter(new RpcBinaryMessageReader(), options);
    const write = jest.spyOn(writer, 'write').mockImplementation(() => undefined);
    const send = createFrameSender({ binarySocket: client!, close() {} }, writer, options, new RpcTransportStats())!;
    const length = writeControlFrameTransient(1, MessageFlag.RouteClient, ControlOp.CollectionModel, codec.serialize, { name: 'x'.repeat(200_000) });
    send(frameMemory(), length);
    expect(write).toHaveBeenCalledTimes(1);
    const buffer = write.mock.calls[0][1] as Uint8Array;
    frame(2, { name: 'other' });
    expect(readBody(buffer)).toEqual({ name: 'x'.repeat(200_000) });
});
