import { expect, test } from '@jest/globals';

import { Writer } from '@deepkit/bson';
import { typeOf } from '@deepkit/type';

import { createReturnDeserializer, createReturnSerializer } from '../src/action.js';
import { DirectClient } from '../src/client/client-direct.js';
import { rpc } from '../src/decorators.js';
import { Progress } from '../src/progress.js';
import { ChunkOp, MessageFlag, RpcBinaryMessageReader, frameMemory, isTypeFlag, readUint16LE, readUint32LE, writeChunkControlFrameTransient, writeResultFrameTransient } from '../src/protocol.js';
import { copyWrittenFrame } from '../src/protocol.js';
import { RpcKernel } from '../src/server/kernel.js';
import { RpcKernelSecurity } from '../src/server/security.js';
import { RpcBinaryWriter, TransportBinaryMessageChunkWriter, TransportOptions } from '../src/transport.js';

test('readUint32LE', () => {
    {
        const writer = new Writer(Buffer.alloc(8));
        writer.writeUint32(545);

        const view = new DataView(writer.buffer.buffer, writer.buffer.byteOffset);
        expect(view.getUint32(0, true)).toBe(545);

        expect(readUint32LE(writer.buffer)).toBe(545);
    }

    {
        const writer = new Writer(Buffer.alloc(8));
        writer.writeUint32(94388585);
        expect(readUint32LE(writer.buffer)).toBe(94388585);
    }
});

test('rpc kernel handshake', async () => {
    const kernel = new RpcKernel();
    const client = new DirectClient(kernel);
    await client.connect();
    expect(client.getId()).toBeInstanceOf(Uint8Array);
    expect(client.getId().byteLength).toBe(16);
});

test('rpc kernel', async () => {
    class Controller {
        @rpc.action()
        action(value: string): string {
            return value;
        }

        @rpc.action()
        sum(a: number, b: number): number {
            return a + b;
        }
    }

    const kernel = new RpcKernel();
    kernel.registerController(Controller, 'myController');

    const client = new DirectClient(kernel);
    const controller = client.controller<Controller>('myController');
    expect(await controller.action('foo')).toBe('foo');
    expect(await controller.action('foo2')).toBe('foo2');
    expect(await controller.action('foo3')).toBe('foo3');

    expect(await controller.sum(2, 5)).toBe(7);
    expect(await controller.sum(5, 5)).toBe(10);
    expect(await controller.sum(10_000_000, 10_000_000)).toBe(20_000_000);
});

test('rpc peer', async () => {
    class MyRpcSecurity extends RpcKernelSecurity {
        async isAllowedToSendToPeer() {
            return true;
        }
        async isAllowedToRegisterAsPeer() {
            return true;
        }
    }
    const kernel = new RpcKernel([{ provide: RpcKernelSecurity, useClass: MyRpcSecurity, scope: 'rpc' }]);

    const client1 = new DirectClient(kernel);

    class Controller {
        @rpc.action()
        action(value: string): string {
            return value;
        }
    }

    await client1.registerAsPeer('peer1');
    client1.registerPeerController(Controller, 'foo');

    const client2 = new DirectClient(kernel);

    const controller = client2.peer('peer1').controller<Controller>('foo');
    const res = await controller.action('bar');
    expect(res).toBe('bar');
});

function resultFrame(id: number, value: string): Uint8Array {
    return copyWrittenFrame(writeResultFrameTransient(id, MessageFlag.RouteClient, createReturnSerializer(typeOf<string>()), value));
}

function chunkAck(id: number): Uint8Array {
    return copyWrittenFrame(writeChunkControlFrameTransient(id, MessageFlag.RouteClient, ChunkOp.Ack));
}

function readerCollecting() {
    const frames: Uint8Array[] = [];
    const reader = new RpcBinaryMessageReader();
    reader.onRawFrame = (buffer, start, end) => frames.push(buffer.slice(start, end));
    return { frames, reader };
}

const readString = createReturnDeserializer(typeOf<string>());

test('message chunks', async () => {
    const { frames, reader } = readerCollecting();

    const bigString = 'x'.repeat(1_000_000); //1mb

    const buffers: Uint8Array[] = [];
    const binaryWriter: RpcBinaryWriter = b => {
        buffers.push(b);
        reader.feed(chunkAck(2)); //confirm chunk, this is usually done by the server
        reader.feed(b); //echo back
    };
    const writer = new TransportBinaryMessageChunkWriter(reader, new TransportOptions());

    await writer.writeFull(binaryWriter, resultFrame(2, bigString));
    expect(buffers.length).toBe(11); //total size is above 1mb, chunk is 100k, so we have 11 packages

    for (const buffer of [buffers[0], buffers[10]]) {
        expect(isTypeFlag(buffer[4], MessageFlag.TypeChunk)).toBe(true);
        expect(readUint16LE(buffer, 5)).toBe(2);
    }

    expect(frames.length).toBe(1);
    expect(readUint16LE(frames[0], 5)).toBe(2);
    expect(isTypeFlag(frames[0][4], MessageFlag.TypeResult)).toBe(true);
    expect(readString(frames[0], 7, frames[0].byteLength)).toBe(bigString);
});

test('message progress', async () => {
    const { frames, reader } = readerCollecting();

    const bigString = 'x'.repeat(1_000_000); //1mb

    const binaryWriter: RpcBinaryWriter = b => {
        reader.feed(chunkAck(2)); //confirm chunk, this is usually done by the server
        reader.feed(b); //echo
    };
    const writer = new TransportBinaryMessageChunkWriter(reader, new TransportOptions());

    const frame = resultFrame(2, bigString);
    const progress = new Progress();
    reader.registerProgress(2, progress.download);
    await writer.writeFull(binaryWriter, frame, progress.upload);

    await progress.upload.finished;
    expect(progress.upload.done).toBe(true);
    expect(progress.upload.isStopped).toBe(true);
    expect(progress.upload.current).toBe(frame.byteLength);
    expect(progress.upload.total).toBe(frame.byteLength);
    expect(progress.upload.stats).toBe(11); //since 11 packages

    await progress.download.finished;
    expect(progress.download.done).toBe(true);
    expect(progress.download.isStopped).toBe(true);
    expect(progress.download.current).toBe(frame.byteLength);
    expect(progress.download.total).toBe(frame.byteLength);
    expect(progress.download.stats).toBe(11); //since 11 packages

    expect(readString(frames[0], 7, frames[0].byteLength)).toBe(bigString);
});
