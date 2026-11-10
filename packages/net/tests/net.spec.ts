import { expect, jest, test } from '@jest/globals';

import { ContextDispatcher, HostConnections, Int32LEFrameReader, NetError, PoolableConnection, RequestQueue } from '../index.js';
import { SocketWriter } from '../node.js';

function frame(id: number, size: number): Uint8Array {
    const data = new Uint8Array(size);
    new DataView(data.buffer).setInt32(0, size, true);
    data.fill(id & 0xff, 4);
    return data;
}

function concat(parts: Uint8Array[]): Uint8Array {
    const result = new Uint8Array(parts.reduce((sum, v) => sum + v.byteLength, 0));
    let offset = 0;
    for (const part of parts) {
        result.set(part, offset);
        offset += part.byteLength;
    }
    return result;
}

function read(stream: Uint8Array, chunkSize: number): Uint8Array[] {
    const frames: Uint8Array[] = [];
    const reader = new Int32LEFrameReader((buffer, start, end) => frames.push(buffer.slice(start, end)), { initialSize: 16 });
    for (let offset = 0; offset < stream.byteLength; offset += chunkSize) {
        // a socket reuses its buffer, so a reader must not keep a reference to a chunk
        const chunk = new Uint8Array(chunkSize + 3);
        const part = stream.subarray(offset, offset + chunkSize);
        chunk.set(part);
        reader.feed(chunk, part.byteLength);
        chunk.fill(0xee);
    }
    return frames;
}

test('frames survive every way of being split into chunks', () => {
    const frames = [frame(1, 4), frame(2, 5), frame(3, 300), frame(4, 17), frame(5, 70_000), frame(6, 8)];
    const stream = concat(frames);
    for (const size of [1, 2, 3, 4, 5, 7, 16, 299, 4096, 65536, stream.byteLength]) {
        expect(read(stream, size)).toEqual(frames);
    }
});

test('a message spread over reads of a reused buffer that is not full', () => {
    // the buffer of a socket read is larger than what one read delivers
    const frames: Uint8Array[] = [];
    const reader = new Int32LEFrameReader((buffer, start, end) => frames.push(buffer.slice(start, end)), { initialSize: 64 });
    const message = frame(1, 256); //fills the grown buffer exactly, so copying a whole read overflows it
    const reused = new Uint8Array(64);
    let offset = 0;
    for (const size of [64, 64, 64, 30, 34]) {
        reused.fill(0xee);
        reused.set(message.subarray(offset, offset + size));
        reader.feed(reused, size);
        offset += size;
    }
    expect(frames).toEqual([message]);
});

test('an invalid size is rejected', () => {
    const reader = new Int32LEFrameReader(() => undefined);
    expect(() => reader.feed(new Uint8Array([1, 0, 0, 0]))).toThrow(NetError);
    expect(() => reader.feed(new Uint8Array([255, 255, 255, 255]))).toThrow(NetError);
    const limited = new Int32LEFrameReader(() => undefined, { maxFrameSize: 64 });
    expect(() => limited.feed(new Uint8Array([100, 0, 0, 0, 1]))).toThrow(NetError);
});

test('a large reassembly buffer is not kept', () => {
    const reader: any = new Int32LEFrameReader(() => undefined, { initialSize: 16, maxRetainedSize: 1024 });
    const data = frame(1, 10_000);
    reader.feed(data.subarray(0, 5000));
    expect(reader.tail.byteLength).toBeGreaterThanOrEqual(10_000);
    reader.feed(data.subarray(5000));
    expect(reader.tail.byteLength).toBe(16);
    expect(reader.emptyBuffer()).toBe(true);
});

test('queue keeps order across growth and removal', () => {
    const queue = new RequestQueue<number>(2);
    for (let round = 0; round < 3; round++) {
        for (let i = 0; i < 100; i++) queue.push(i);
        expect(queue.at(3)).toBe(3);
        queue.removeAt(1);
        expect(queue.size).toBe(99);
        expect(queue.shift()).toBe(0);
        expect(queue.shift()).toBe(2);
        expect(queue.drain().length).toBe(97);
    }
    expect(queue.shift()).toBe(undefined);
});

test('dispatcher reuses ids, stops at the limit and predicts the next id', () => {
    const dispatcher = new ContextDispatcher(3);
    const got: number[] = [];
    const a = dispatcher.create(() => got.push(1));
    const b = dispatcher.create(() => got.push(2));
    const c = dispatcher.create(() => got.push(3));
    expect([a, b, c]).toEqual([1, 2, 3]);
    expect(() => dispatcher.create(() => undefined)).toThrow(NetError);
    expect(() => dispatcher.create(() => undefined)).toThrow(NetError);

    dispatcher.dispatch(b, new Uint8Array(0));
    expect(got).toEqual([2]);
    dispatcher.release(a);
    dispatcher.release(c);
    expect(dispatcher.current()).toBe(c);
    expect(dispatcher.create(() => undefined)).toBe(c);
});

test('dispatcher grows over its initial size', () => {
    const dispatcher = new ContextDispatcher();
    const ids: number[] = [];
    let called = 0;
    for (let i = 0; i < 1000; i++) ids.push(dispatcher.create(() => called++));
    for (const id of ids) dispatcher.dispatch(id, new Uint8Array(0));
    expect(called).toBe(1000);
});

class Connection implements PoolableConnection {
    load = 0;
    exclusive = false;
    idleSince = 0;
    connected = true;

    isConnected() {
        return this.connected;
    }
}

test('idle connections come first, then busy ones up to the depth', () => {
    const host = new HostConnections<Connection>();
    const a = new Connection(),
        b = new Connection();
    for (const c of [a, b]) {
        host.add(c);
        host.reserve(c, false);
        host.release(c, 1);
    }
    expect(host.acquireIdle(false)).toBe(b);
    expect(host.acquireIdle(false)).toBe(a);
    expect(host.acquireIdle(false)).toBe(undefined);

    const seen = [host.acquirePipelined(3), host.acquirePipelined(3), host.acquirePipelined(3), host.acquirePipelined(3)];
    expect(seen.filter(v => v === a).length).toBe(2);
    expect(seen.filter(v => v === b).length).toBe(2);
    expect(host.acquirePipelined(3)).toBe(undefined);
});

test('an exclusive connection is never shared', () => {
    const host = new HostConnections<Connection>();
    const a = new Connection();
    host.add(a);
    host.reserve(a, true);
    expect(host.acquirePipelined(16)).toBe(undefined);
    host.release(a, 1);
    expect(a.exclusive).toBe(false);
    expect(host.acquirePipelined(16)).toBe(undefined); //idle ones are not for pipelining
});

test('only idle connections expire, and at least keep stay', () => {
    const host = new HostConnections<Connection>();
    const list = [new Connection(), new Connection(), new Connection(), new Connection()];
    list.forEach((c, i) => {
        host.add(c);
        host.reserve(c, false);
        host.release(c, i * 10);
    });
    host.reserve(list[3], false);
    host.idle.pop();
    const expired = host.takeExpired(25, 2);
    expect(expired).toEqual([list[0], list[1]]);
    for (const c of expired) host.remove(c);
    expect(host.all.length).toBe(2);
});

class FakeSocket {
    writes: Uint8Array[] = [];
    writableLength = 0;
    destroyed = false;

    write(data: Uint8Array) {
        this.writes.push(data);
        return true;
    }
}

test('the messages of a tick are written together', async () => {
    const socket = new FakeSocket();
    const writer = new SocketWriter(socket as any, 1024);
    expect(writer.write(new Uint8Array([1]))).toBe(false);
    writer.write(new Uint8Array([2]));
    writer.write(new Uint8Array([3]));
    expect(socket.writes.length).toBe(0);
    await Promise.resolve();
    expect(socket.writes.map(v => [...v])).toEqual([[1, 2, 3]]);

    writer.write(new Uint8Array([4]));
    await Promise.resolve();
    expect(socket.writes.length).toBe(2);
    expect([...socket.writes[1]]).toEqual([4]);
});

test('large writes keep the order and report when memory is kept', () => {
    const socket = new FakeSocket();
    const writer = new SocketWriter(socket as any, 1024);
    writer.write(new Uint8Array([1]));
    writer.write(new Uint8Array([2]));
    const large = new Uint8Array(2000);
    expect(writer.write(large)).toBe(false);
    expect(socket.writes.length).toBe(2);
    expect(Array.from(socket.writes[0])).toEqual([1, 2]);
    expect(socket.writes[1]).toBe(large);

    socket.writableLength = 10;
    expect(writer.write(new Uint8Array(2000))).toBe(true);
});

test('a batch node still needs is not overwritten', () => {
    const socket = new FakeSocket();
    const writer = new SocketWriter(socket as any, 1024);
    writer.write(new Uint8Array([1]));
    socket.writableLength = 1;
    writer.flush();
    writer.write(new Uint8Array([2]));
    writer.flush();
    expect(Array.from(socket.writes[0])).toEqual([1]);
    expect(Array.from(socket.writes[1])).toEqual([2]);
});

test('nothing queued is written to a destroyed socket', () => {
    const socket = new FakeSocket();
    const writer = new SocketWriter(socket as any, 1024);
    writer.write(new Uint8Array([1]));
    socket.destroyed = true;
    writer.flush();
    expect(socket.writes.length).toBe(0);
});

test('reports through writableLength whether memory is kept', () => {
    const socket = new FakeSocket();
    const writer = new SocketWriter(socket as any, 1024);
    writer.write(new Uint8Array(10));
    expect(writer.writableLength).toBe(0);
    socket.writableLength = 10;
    writer.write(new Uint8Array(2000));
    expect(writer.writableLength).toBe(1);
    writer.write(new Uint8Array(10));
    expect(writer.writableLength).toBe(0);
});

function rangeSocket() {
    return {
        destroyed: false,
        writableLength: 0,
        writes: [] as Uint8Array[],
        write(data: Uint8Array) {
            this.writes.push(data);
            return true;
        },
    };
}

/** A buffer that records views created on it. */
function trackedBuffer(size: number) {
    const buffer = new Uint8Array(size);
    for (let i = 0; i < size; i++) buffer[i] = i & 0xff;
    const views: number[] = [];
    const subarray = buffer.subarray.bind(buffer);
    buffer.subarray = (start?: number, end?: number) => {
        views.push((end ?? size) - (start ?? 0));
        return subarray(start, end);
    };
    return { buffer, views };
}

test('writeRange copies small messages without a view on the buffer', async () => {
    const socket = rangeSocket();
    const writer = new SocketWriter(socket as any, 1024);
    const { buffer, views } = trackedBuffer(512);

    expect(writer.writeRange(buffer, 0, 8)).toBe(false);
    expect(writer.writeRange(buffer, 8, 16)).toBe(false);
    expect(writer.writeRange(buffer, 16, 40)).toBe(false);
    expect(views).toEqual([]);

    await Promise.resolve();
    expect(socket.writes.length).toBe(1);
    expect(socket.writes[0].byteLength).toBe(40);
    expect(socket.writes[0][0]).toBe(0);
    expect(socket.writes[0][39]).toBe(39);
});

test('writeRange reuses the view for small writes', async () => {
    const socket = rangeSocket();
    const writer = new SocketWriter(socket as any, 1024);
    const { buffer } = trackedBuffer(64);

    writer.writeRange(buffer, 0, 10);
    await Promise.resolve();
    writer.writeRange(buffer, 20, 30);
    await Promise.resolve();

    expect(socket.writes[0]).toBe(socket.writes[1]);
    expect(socket.writes[1][0]).toBe(20);
    writer.writeRange(buffer, 0, 11);
    await Promise.resolve();
    expect(socket.writes[2].byteLength).toBe(11);
});

test('writeRange does not reuse memory node still holds', async () => {
    const socket = rangeSocket();
    const writer = new SocketWriter(socket as any, 1024);
    const { buffer } = trackedBuffer(64);

    socket.writableLength = 1;
    expect(writer.writeRange(buffer, 0, 10)).toBe(false);
    await Promise.resolve();
    const held = socket.writes[0];
    const content = [...held];

    socket.writableLength = 0;
    writer.writeRange(buffer, 30, 40);
    await Promise.resolve();
    expect(socket.writes[1]).not.toBe(held);
    expect([...held]).toEqual(content);
    expect(socket.writes[1][0]).toBe(30);
});

test('writeRange of larger messages goes through a view of the given range', async () => {
    const socket = rangeSocket();
    const writer = new SocketWriter(socket as any, 1024);
    const { buffer, views } = trackedBuffer(2048);

    writer.writeRange(buffer, 0, 4);
    writer.writeRange(buffer, 4, 2004);
    expect(views).toEqual([2000]);
    expect(socket.writes.map(v => v.byteLength)).toEqual([4, 2000]);
    expect(socket.writes[socket.writes.length - 1].byteLength).toBe(2000);
    socket.writableLength = 1;
    expect(writer.writeRange(buffer, 4, 2004)).toBe(true);
});

test('writeRange keeps the order with write', async () => {
    const socket = rangeSocket();
    const writer = new SocketWriter(socket as any, 1024);
    const { buffer } = trackedBuffer(64);

    writer.write(new Uint8Array([200]));
    writer.writeRange(buffer, 1, 3);
    writer.write(new Uint8Array([201]));
    writer.flush();

    expect(socket.writes.map(v => [...v])).toEqual([[200, 1, 2, 201]]);
});

test('the tick is ended with one then() on a shared promise, not with queueMicrotask', async () => {
    const socket = rangeSocket();
    const writer = new SocketWriter(socket as any, 1024);
    const then = jest.spyOn(Promise.prototype, 'then');
    const { buffer } = trackedBuffer(64);
    let calls = 0;
    try {
        writer.writeRange(buffer, 0, 4);
        writer.writeRange(buffer, 4, 8);
        calls = then.mock.calls.length;
    } finally {
        then.mockRestore();
    }
    expect(calls).toBe(1);
    await Promise.resolve();
    expect(socket.writes.length).toBe(1);
});
