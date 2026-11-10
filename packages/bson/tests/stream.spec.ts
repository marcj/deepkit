import { expect, test } from '@jest/globals';
import { BsonStreamReader } from '../src/stream';


test('message reader', async () => {
    const messages: Buffer[] = [];
    const reader = new BsonStreamReader(Array.prototype.push.bind(messages));

    let buffer: any;

    {
        messages.length = 0;
        buffer = Buffer.alloc(8);
        buffer.writeUInt32LE(8);
        reader.feed(buffer);

        expect(reader.emptyBuffer()).toBe(true);
        expect(messages.length).toBe(1);
        expect(messages[0].readUInt32LE()).toBe(8);
    }

    {
        messages.length = 0;
        buffer = Buffer.alloc(500_000);
        buffer.writeUInt32LE(1_000_000);
        reader.feed(buffer);
        buffer = Buffer.alloc(500_000);
        reader.feed(buffer);

        expect(reader.emptyBuffer()).toBe(true);
        expect(messages.length).toBe(1);
        expect(messages[0].readUInt32LE()).toBe(1_000_000);
    }

    {
        messages.length = 0;
        buffer = Buffer.alloc(0);
        reader.feed(buffer);

        buffer = Buffer.alloc(8);
        buffer.writeUInt32LE(8);
        reader.feed(buffer);

        expect(reader.emptyBuffer()).toBe(true);
        expect(messages.length).toBe(1);
        expect(messages[0].readUInt32LE()).toBe(8);
    }

    {
        messages.length = 0;
        buffer = Buffer.alloc(18);
        buffer.writeUInt32LE(8);
        buffer.writeUInt32LE(10, 8);
        reader.feed(buffer);

        expect(reader.emptyBuffer()).toBe(true);
        expect(messages.length).toBe(2);
        expect(messages[0].readUInt32LE()).toBe(8);
        expect(messages[1].readUInt32LE()).toBe(10);
    }

    {
        messages.length = 0;
        buffer = Buffer.alloc(22);
        buffer.writeUInt32LE(8);
        buffer.writeUInt32LE(10, 8);
        buffer.writeUInt32LE(20, 18);

        reader.feed(buffer);
        buffer = Buffer.alloc(16);
        reader.feed(buffer);

        expect(reader.emptyBuffer()).toBe(true);
        expect(messages.length).toBe(3);
        expect(messages[0].readUInt32LE()).toBe(8);
        expect(messages[1].readUInt32LE()).toBe(10);
        expect(messages[2].readUInt32LE()).toBe(20);
    }

    {
        messages.length = 0;
        buffer = Buffer.alloc(8);
        buffer.writeUInt32LE(8);
        reader.feed(buffer);
        reader.feed(buffer);

        expect(reader.emptyBuffer()).toBe(true);
        expect(messages.length).toBe(2);
        expect(messages[0].readUInt32LE()).toBe(8);
        expect(messages[1].readUInt32LE()).toBe(8);
    }

    {
        messages.length = 0;
        buffer = Buffer.alloc(4);
        buffer.writeUInt32LE(8);
        reader.feed(buffer);

        buffer = Buffer.alloc(4);
        reader.feed(buffer);

        expect(reader.emptyBuffer()).toBe(true);
        expect(messages.length).toBe(1);
        expect(messages[0].readUInt32LE()).toBe(8);
    }

    {
        messages.length = 0;
        let buffer = Buffer.alloc(4);
        buffer.writeUInt32LE(30);
        reader.feed(buffer);

        buffer = Buffer.alloc(26);
        reader.feed(buffer);

        buffer = Buffer.alloc(8);
        buffer.writeUInt32LE(8);
        reader.feed(buffer);

        expect(reader.emptyBuffer()).toBe(true);
        expect(messages.length).toBe(2);
        expect(messages[0].readUInt32LE()).toBe(30);
        expect(messages[1].readUInt32LE()).toBe(8);
    }
});


test('buffer read does not do copy', async () => {
    const data = Buffer.from('hello world');
    data.writeUint32LE(data.length, 0);
    let received: Uint8Array | undefined = undefined;

    new BsonStreamReader((p) => {
        received = p;
    }).feed(data);

    expect(received!.buffer === data.buffer).toBe(true);
});

test('RpcBinaryBufferReader', () => {
    const a = Buffer.from('0000000001020304050607', 'hex');
    a.writeUint32LE(a.byteLength, 0);
    const b = Buffer.from('000000000203040506070809', 'hex');
    b.writeUint32LE(b.byteLength, 0);
    const c = Buffer.from('00000000020304050607', 'hex');
    c.writeUint32LE(c.byteLength, 0);
    const data = Buffer.concat([a, b, c]);

    function test(cb: (reader: BsonStreamReader) => void) {
        const received: string[] = [];
        const reader = new BsonStreamReader((p) => {
            received.push(Buffer.from(p).toString('hex'));
        });
        cb(reader);
        expect(received).toEqual([
            '0b00000001020304050607',
            '0c0000000203040506070809',
            '0a000000020304050607',
        ]);
    }

    test((reader) => {
        //all at once
        reader.feed(data, data.byteLength);
    });

    test((reader) => {
        reader.feed(a);
        reader.feed(b);
        reader.feed(c);
    });

    test((reader) => {
        reader.feed(a);
        reader.feed(b.subarray(0, 5));
        reader.feed(b.subarray(5));
        reader.feed(c);
    });

    test((reader) => {
        reader.feed(a);
        reader.feed(b.subarray(0, 4));
        reader.feed(b.subarray(4));
        reader.feed(c);
    });

    test((reader) => {
        reader.feed(a);
        reader.feed(b.subarray(0, 3));
        reader.feed(b.subarray(3));
        reader.feed(c);
    });

    test((reader) => {
        reader.feed(a);
        reader.feed(b.subarray(0, 3));
        reader.feed(b.subarray(3));
        reader.feed(c.subarray(0, 3));
        reader.feed(c.subarray(3));
    });

    test((reader) => {
        reader.feed(a.subarray(0, 3));
        reader.feed(a.subarray(3));
        reader.feed(b.subarray(0, 3));
        reader.feed(b.subarray(3));
        reader.feed(c);
    });

    const steps: number[] = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12]

    for (const step of steps) {
        test((reader) => {
            //step by step
            for (let i = 0; i < data.byteLength; i += step) {
                reader.feed(data.subarray(i, i + step));
            }
        });
    }
});

function message(size: number, fill: number): Uint8Array {
    const data = new Uint8Array(size).fill(fill);
    new DataView(data.buffer).setUint32(0, size, true);
    return data;
}

test('messages split at every position', () => {
    const first = message(9, 1);
    const second = message(20, 2);
    const joined = new Uint8Array(29);
    joined.set(first, 0);
    joined.set(second, 9);

    for (let cut = 1; cut < joined.length; cut++) {
        const received: Uint8Array[] = [];
        const reader = new BsonStreamReader(v => received.push(new Uint8Array(v)));
        reader.feed(joined.subarray(0, cut));
        reader.feed(joined.subarray(cut));
        expect(received).toEqual([first, second]);
        expect(reader.emptyBuffer()).toBe(true);
    }
});

test('byte by byte', () => {
    const data = message(300, 7);
    const received: Uint8Array[] = [];
    const reader = new BsonStreamReader(v => received.push(new Uint8Array(v)));
    for (let i = 0; i < data.length; i++) {
        expect(reader.emptyBuffer()).toBe(i === 0);
        reader.feed(data.subarray(i, i + 1));
    }
    expect(received).toEqual([data]);
    expect(reader.emptyBuffer()).toBe(true);
});

test('only the given number of bytes is read', () => {
    const data = message(10, 3);
    const buffer = new Uint8Array(64).fill(255);
    buffer.set(data);
    const received: Uint8Array[] = [];
    new BsonStreamReader(v => received.push(v)).feed(buffer, 10);
    expect(received).toEqual([data]);
});

test('a wrong size is an error', () => {
    const data = new Uint8Array([0, 0, 0, 0, 1]);
    expect(() => new BsonStreamReader(() => undefined).feed(data)).toThrow('message size wrong');
});

test('messages over several chunks share one reused buffer', () => {
    const received: Uint8Array[] = [];
    const reader = new BsonStreamReader(v => received.push(v));
    for (const fill of [1, 2]) {
        const data = message(100, fill);
        reader.feed(data.subarray(0, 50));
        reader.feed(data.subarray(50));
    }
    expect(received[0].buffer).toBe(received[1].buffer);
    expect(received[0].byteOffset).toBe(received[1].byteOffset);
});

test('a reused buffer holds the whole message and keeps the rest of the chunk', () => {
    const sizes = [100, 50, 5000, 20, 400_000, 30];
    for (const cut of [3, 7, 64]) {
        const received: Buffer[] = [];
        const reader = new BsonStreamReader(v => received.push(Buffer.from(v)));
        const joined = new Uint8Array(sizes.reduce((a, b) => a + b, 0));
        let offset = 0;
        sizes.forEach((size, i) => {
            joined.set(message(size, i + 1), offset);
            offset += size;
        });
        for (let i = 0; i < joined.length; i += cut) reader.feed(joined.subarray(i, i + cut));
        expect(received.map((v, i) => v.compare(message(sizes[i], i + 1)))).toEqual(sizes.map(() => 0));
        expect(reader.emptyBuffer()).toBe(true);
    }
});

test('a message in many chunks is copied once', () => {
    const size = 2_000_000;
    const data = message(size, 5);
    const received: Uint8Array[] = [];
    const reader = new BsonStreamReader(v => received.push(v));
    const start = Date.now();
    for (let i = 0; i < size; i += 1000) reader.feed(data.subarray(i, Math.min(size, i + 1000)));
    expect(received).toHaveLength(1);
    expect(received[0].byteLength).toBe(size);
    expect(Date.now() - start).toBeLessThan(1000);
});
