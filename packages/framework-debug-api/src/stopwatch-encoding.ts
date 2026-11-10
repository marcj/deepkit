import {
    BaseParser,
    deserializeBSONWithoutOptimiser,
    getBSONDeserializer,
    getBSONSerializer,
    stringByteLength,
    Writer,
} from '@deepkit/bson';
import { AnalyticData, FrameData, FrameEnd, FrameStart, FrameType, getTypeOfCategory } from '@deepkit/stopwatch';
import { createBuffer } from '@deepkit/core';

export function encodeFrames(frames: (FrameStart | FrameEnd)[]): Uint8Array {
    //cid = id and worker, as compound key
    //<cid uint32><type uint8><timestamp uint64><context uint32><category uint8><labelSize uint8><label utf8string>.
    let size = 0;
    for (const frame of frames) {
        size += frame.type === FrameType.end ? (32 + 8 + 64) / 8 : (((32 + 8 + 64 + 32 + 8 + 8) / 8) + Math.min(255, stringByteLength(frame.label)));
    }

    const buffer = createBuffer(size);
    const writer = new Writer(buffer);

    for (const frame of frames) {
        writer.writeUint32(frame.cid);
        writer.writeByte(frame.type);

        //up to 2⁵³=9,007,199,254,740,992 the representable numbers are exactly the integers
        //so we have no precision loss when using timestamp=Math.floor(performance.timeOrigin * 1_000 + performance.now() * 1_000)
        //timestamp current output vs max precise integers:
        //1613654358960142
        //9007199254740992
        writer.writeDouble(frame.timestamp);

        if (frame.type === FrameType.start) {
            writer.writeUint32(frame.context);
            writer.writeByte(frame.category);
            let size = stringByteLength(frame.label);
            for (let i = 0; size > 255; i++) {
                frame.label = frame.label.substr(0, 255 - i);
                size = stringByteLength(frame.label);
            }
            writer.writeByte(size);
            writer.writeString(frame.label);
        }
    }

    return buffer;
}

export function encodeFrameData(dataItems: FrameData[]): Uint8Array {
    //<cid uint32><category uint8><bson document>, without a type an empty document of 4 bytes
    const documents: (Uint8Array | undefined)[] = [];
    let size = 0;
    for (const data of dataItems) {
        const type = getTypeOfCategory(data.category);
        const document = type ? getBSONSerializer(undefined, type)(data.data) : undefined;
        documents.push(document);
        size += (32 + 8) / 8 + (document ? document.byteLength : 4);
    }

    const buffer = createBuffer(size);
    const writer = new Writer(buffer);

    for (let i = 0; i < dataItems.length; i++) {
        writer.writeUint32(dataItems[i].cid);
        writer.writeByte(dataItems[i].category);
        const document = documents[i];
        if (document) {
            buffer.set(document, writer.offset);
            writer.offset += document.byteLength;
        } else {
            writer.writeUint32(0);
        }
    }

    return buffer;
}

export function encodeAnalytic(data: AnalyticData[]): Uint8Array {
    //<timestamp uint64><cpu uint8><memory uint8><loopBlocked uint8>
    const buffer = createBuffer(data.length * (4 + 1 + 1 + 4));
    const writer = new Writer(buffer);

    for (const item of data) {
        writer.writeUint32(item.timestamp);
        writer.writeByte(item.cpu);
        writer.writeByte(item.memory);
        writer.writeUint32(item.loopBlocked);
    }

    return buffer;
}

export function decodeAnalytic(buffer: Uint8Array, callback: (data: AnalyticData) => void) {
    const parser = new BaseParser(buffer);

    while (parser.offset < buffer.byteLength) {
        const timestamp = parser.eatUInt32();
        const cpu = parser.eatByte();
        const memory = parser.eatByte();
        const loopBlocked = parser.eatUInt32();
        callback({ timestamp, cpu, memory, loopBlocked });
    }
}

export function decodeFrameData(buffer: Uint8Array, callback: (data: {
    cid: number,
    category: number,
    data: Uint8Array
}) => void) {
    const parser = new BaseParser(buffer);

    while (parser.offset < buffer.byteLength) {
        const cid = parser.eatUInt32();
        const category = parser.eatByte();
        const end = parser.peekUInt32() + parser.offset;
        callback({ cid, category, data: parser.buffer.slice(parser.offset, end) });
        parser.offset = end;
    }
}

export function deserializeFrameData(data: { cid: number, category: number, data: Uint8Array }): any {
    const classType = getTypeOfCategory(data.category);
    const deserializer = classType ? getBSONDeserializer(undefined, classType) : deserializeBSONWithoutOptimiser;
    return deserializer(data.data);
}

export function decodeFrames(buffer: Uint8Array, callback: (frame: FrameStart | FrameEnd) => void): void {
    const parser = new BaseParser(buffer);

    while (parser.offset < buffer.byteLength) {
        const cid = parser.eatUInt32();
        const type = parser.eatByte();
        const timestamp = parser.eatDouble();

        if (type === FrameType.start) {
            const context = parser.eatUInt32();
            const category = parser.eatByte();
            const stringSize = parser.eatByte();
            const label = parser.eatString(stringSize);
            callback({ cid, type: FrameType.start, timestamp, context, category, label });
        } else {
            callback({ cid, type: FrameType.end, timestamp });
        }
    }
}
