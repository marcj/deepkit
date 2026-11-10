/*
 * Deepkit Framework
 * Copyright (C) 2021 Deepkit UG, Marc J. Schmidt
 *
 * This program is free software: you can redistribute it and/or modify
 * it under the terms of the MIT License.
 *
 * You should have received a copy of the MIT License along with this program.
 */
import { ReflectionKind, SerializationError, Type } from '@deepkit/type';

import { hexTable } from './model.js';
import { decodeUTF8 } from './strings.js';
import {
    BSONType,
    BSON_BINARY_SUBTYPE_BYTE_ARRAY,
    BSON_BINARY_SUBTYPE_UUID,
    TWO_PWR_32_DBL_N,
    digitByteSize,
} from './utils.js';

export function readUint32LE(buffer: Uint8Array, offset: number): number {
    return buffer[offset] | (buffer[offset + 1] << 8) | (buffer[offset + 2] << 16) | ((buffer[offset + 3] << 24) >>> 0);
}

export function readInt32LE(buffer: Uint8Array, offset: number): number {
    return buffer[offset] | (buffer[offset + 1] << 8) | (buffer[offset + 2] << 16) | (buffer[offset + 3] << 24);
}

const binaryPoolSize = 64 * 1024;
let binaryPool = new ArrayBuffer(binaryPoolSize);
let binaryPoolUsed = 0;

/**
 * Memory of a decoded binary value. V8 keeps a typed array of up to 64 bytes on the heap. Above that, new Uint8Array()
 * allocates outside of the heap, which is about ten times slower than a view on a shared pool.
 * A plain Uint8Array and not a Buffer, whose toString(), slice() and JSON differ from what the type declares.
 * Its .buffer is the pool, so byteOffset and byteLength have to be respected.
 */
function allocateBinary(size: number): Uint8Array {
    if (size <= 64 || size > binaryPoolSize >> 1) return new Uint8Array(size);
    if (binaryPoolUsed + size > binaryPoolSize) {
        binaryPool = new ArrayBuffer(binaryPoolSize);
        binaryPoolUsed = 0;
    }
    const bytes = new Uint8Array(binaryPool, binaryPoolUsed, size);
    binaryPoolUsed += size;
    return bytes;
}

const float64Buffer = new ArrayBuffer(8);
const u32 = new Uint32Array(float64Buffer);
const f64 = new Float64Array(float64Buffer);

export function readFloat64LE(buffer: Uint8Array, offset: number): number {
    u32[0] = buffer[offset] | (buffer[offset + 1] << 8) | (buffer[offset + 2] << 16) | (buffer[offset + 3] << 24);
    u32[1] = buffer[offset + 4] | (buffer[offset + 5] << 8) | (buffer[offset + 6] << 16) | (buffer[offset + 7] << 24);
    return f64[0];
}

/**
 * This is the (slowest) base parser which parses all property names as utf8.
 */
export class BaseParser {
    public size: number;

    constructor(
        public buffer: Uint8Array,
        public offset: number = 0,
    ) {
        this.size = buffer.byteLength;
    }

    peek(elementType: number, type?: Type) {
        const offset = this.offset;
        const v = this.parse(elementType, type);
        this.offset = offset;
        return v;
    }

    parse(elementType: number, type?: Type) {
        switch (elementType) {
            case BSONType.STRING:
                return this.parseString();
            case BSONType.NUMBER:
                return this.parseNumber();
            case BSONType.OID:
                return this.parseOid();
            case BSONType.INT:
                return this.parseInt();
            case BSONType.DATE:
                return this.parseDate();
            case BSONType.LONG:
            case BSONType.TIMESTAMP:
                return this.parseLong();
            case BSONType.BOOLEAN:
                return this.parseBoolean();
            case BSONType.NULL:
                return null;
            case BSONType.UNDEFINED:
                return undefined;
            case BSONType.BINARY:
                return this.parseBinary(type);
            case BSONType.REGEXP:
                return this.parseRegExp();
            case BSONType.OBJECT:
                return parseObject(this);
            case BSONType.ARRAY:
                return parseArray(this);
            default:
                throw new SerializationError('Unsupported BSON type ' + elementType);
        }
    }

    parseRegExp(): RegExp {
        const source = this.eatString(this.stringSize());
        const options = this.eatString(this.stringSize());
        return new RegExp(source, options.replace('s', 'g'));
    }

    /**
     * read the content without moving the parser offset.
     */
    read(elementType: number, type?: Type) {
        const start = this.offset;
        try {
            return this.parse(elementType, type);
        } finally {
            this.offset = start;
        }
    }

    parseBoolean() {
        return this.eatByte() === 1;
    }

    parseLong() {
        const lowBits = this.eatInt32();
        const highBits = this.eatInt32();

        return BigInt(highBits) * BigInt(TWO_PWR_32_DBL_N) + BigInt(lowBits >>> 0);
    }

    parseString() {
        return this.eatString(this.eatUInt32());
    }

    parseBinaryBigInt(): BigInt {
        let size = this.eatUInt32();
        const subType = this.eatByte();
        if (subType === BSON_BINARY_SUBTYPE_BYTE_ARRAY) {
            size = this.eatUInt32();
        }

        const nextPosition = this.offset + size;
        const v = this.readBigIntBinary(size);
        this.offset = nextPosition;
        return v;
    }

    parseSignedBinaryBigInt(): BigInt {
        let size = this.eatUInt32();
        const subType = this.eatByte();
        if (subType === BSON_BINARY_SUBTYPE_BYTE_ARRAY) {
            size = this.eatUInt32();
        }

        const nextPosition = this.offset + size;
        const v = this.readSignedBigIntBinary(size);
        this.offset = nextPosition;
        return v;
    }

    parseBinary(type?: Type): any {
        let size = this.eatUInt32();
        const subType = this.eatByte();

        if (subType === BSON_BINARY_SUBTYPE_UUID) {
            const nextPosition = this.offset + size;
            const v = this.parseUUID();
            this.offset = nextPosition;
            return v;
        }

        if (subType === BSON_BINARY_SUBTYPE_BYTE_ARRAY) {
            size = this.eatUInt32();
        }

        if (type && type.kind === ReflectionKind.class && type.classType !== Uint8Array) {
            // these get the whole ArrayBuffer, which can't be the shared memory of a pool
            const bytes = this.copyBytes(size, new Uint8Array(this.availableBytes(size)));
            if (type.classType === ArrayBuffer) return bytes.buffer;
            return new type.classType(bytes.buffer);
        }

        return this.copyBytes(size, allocateBinary(this.availableBytes(size)));
    }

    /**
     * The bytes of a binary value as a view on the buffer, without a copy. Only valid as long as the buffer is.
     */
    parseBinaryView(): Uint8Array {
        let size = this.eatUInt32();
        if (this.eatByte() === BSON_BINARY_SUBTYPE_BYTE_ARRAY) size = this.eatUInt32();
        const view = this.buffer.subarray(this.offset, this.offset + size);
        this.seek(size);
        return view;
    }

    /** A size past the end of the buffer only gets what is there. */
    protected availableBytes(size: number): number {
        return Math.max(0, Math.min(size, this.buffer.byteLength - this.offset));
    }

    protected copyBytes(size: number, bytes: Uint8Array): Uint8Array {
        const buffer = this.buffer;
        const start = this.offset;
        const length = bytes.byteLength;
        if (length <= 128) {
            for (let i = 0; i < length; i++) bytes[i] = buffer[start + i];
        } else {
            bytes.set(buffer.subarray(start, start + length));
        }
        this.seek(size);
        return bytes;
    }

    readBigIntBinary(size: number): bigint {
        if (size === 0) return BigInt(0);

        //todo: check if that is faster than the string concatenation
        // let r = BigInt(0);
        // const n8 = BigInt(8);
        // for (let i = 0; i < size; i++) {
        //     if (i !== 0) r = r << n8;
        //     r += BigInt(this.buffer[this.offset + i]);
        // }
        // return r;

        let s = '';
        for (let i = 0; i < size; i++) {
            s += hexTable[this.buffer[this.offset + i]];
        }
        return BigInt('0x' + s);
    }

    readSignedBigIntBinary(size: number): bigint {
        if (size === 0) return BigInt(0);

        let s = '';
        const signum = this.buffer[this.offset];

        for (let i = 1; i < size; i++) {
            s += hexTable[this.buffer[this.offset + i]];
        }

        //255 means negative
        if (signum === 255) return BigInt('0x' + s) * BigInt(-1);
        return BigInt('0x' + s);
    }

    parseNumber() {
        return this.eatDouble();
    }

    parseOid(): string {
        const offset = this.offset,
            b = this.buffer;
        let o =
            hexTable[b[offset]] +
            hexTable[b[offset + 1]] +
            hexTable[b[offset + 2]] +
            hexTable[b[offset + 3]] +
            hexTable[b[offset + 4]] +
            hexTable[b[offset + 5]] +
            hexTable[b[offset + 6]] +
            hexTable[b[offset + 7]] +
            hexTable[b[offset + 8]] +
            hexTable[b[offset + 9]] +
            hexTable[b[offset + 10]] +
            hexTable[b[offset + 11]];
        this.seek(12);
        return o;
    }

    parseUUID(): string {
        //e.g. bef8de96-41fe-442f-b70c-c3a150f8c96c
        //         4      2    2    2       6
        const offset = this.offset,
            b = this.buffer;
        let o =
            hexTable[b[offset]] +
            hexTable[b[offset + 1]] +
            hexTable[b[offset + 2]] +
            hexTable[b[offset + 3]] +
            '-' +
            hexTable[b[offset + 4]] +
            hexTable[b[offset + 5]] +
            '-' +
            hexTable[b[offset + 6]] +
            hexTable[b[offset + 7]] +
            '-' +
            hexTable[b[offset + 8]] +
            hexTable[b[offset + 9]] +
            '-' +
            hexTable[b[offset + 10]] +
            hexTable[b[offset + 11]] +
            hexTable[b[offset + 12]] +
            hexTable[b[offset + 13]] +
            hexTable[b[offset + 14]] +
            hexTable[b[offset + 15]];
        this.seek(16);
        return o;
    }

    parseInt() {
        return this.eatInt32();
    }

    parseDate() {
        const lowBits = this.eatInt32();
        const highBits = this.eatInt32();
        return new Date(highBits * TWO_PWR_32_DBL_N + (lowBits >>> 0));
    }

    peekUInt32(): number {
        return readUint32LE(this.buffer, this.offset);
    }

    /**
     * Returns the size including \0.
     */
    stringSize(): number {
        let end = this.offset;
        while (this.buffer[end] !== 0 && end < this.size) end++;
        end++; //null
        return end - this.offset;
    }

    eatObjectPropertyName() {
        let end = this.offset;
        while (this.buffer[end] !== 0) {
            if (end >= this.size) throw new SerializationError('Unexpected end of buffer');
            end++;
        }
        const s = decodeUTF8(this.buffer, this.offset, end);
        this.offset = end + 1;
        return s;
    }

    seek(size: number) {
        this.offset += size;
    }

    eatByte(): number {
        return this.buffer[this.offset++];
    }

    eatInt32(): number {
        const value = readInt32LE(this.buffer, this.offset);
        this.offset += 4;
        return value;
    }

    eatUInt32(): number {
        const value = readUint32LE(this.buffer, this.offset);
        this.offset += 4;
        return value;
    }

    eatDouble(): number {
        const value = readFloat64LE(this.buffer, this.offset);
        this.offset += 8;
        if (isNaN(value)) return 0;
        return value;
    }

    /**
     * Size includes the \0. If not existend, increase by 1.
     */
    eatString(size: number): string {
        this.offset += size;
        return decodeUTF8(this.buffer, this.offset - size, this.offset - 1);
    }
}

export function parseObject(parser: BaseParser): any {
    const result: any = {};
    const end = parser.eatUInt32() + parser.offset;

    while (parser.offset < end) {
        const elementType = parser.eatByte();
        if (elementType === 0) break;

        const name = parser.eatObjectPropertyName();
        result[name] = parser.parse(elementType);
    }

    return result;
}

export function parseArray(parser: BaseParser): any[] {
    const result: any[] = [];
    const end = parser.eatUInt32() + parser.offset;

    for (let i = 0; parser.offset < end; i++) {
        const elementType = parser.eatByte();
        if (elementType === 0) break;

        //arrays are represented as objects, so we skip the key name, since we have `i`
        parser.seek(digitByteSize(i));

        result.push(parser.parse(elementType));
    }

    return result;
}

export function deserializeBSONWithoutOptimiser(buffer: Uint8Array, offset = 0) {
    return parseObject(new BaseParser(buffer, offset));
}
