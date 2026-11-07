/*
 * Deepkit Framework
 * Copyright (C) 2021 Deepkit UG, Marc J. Schmidt
 *
 * This program is free software: you can redistribute it and/or modify
 * it under the terms of the MIT License.
 *
 * You should have received a copy of the MIT License along with this program.
 */

import { CompilerContext, createBuffer, hasProperty, isArray, isIterable, isObject, toFastProperties } from '@deepkit/core';
import {
    binaryBigIntAnnotation,
    BinaryBigIntType,
    ContainerAccessor,
    createReference,
    excludedAnnotation,
    executeTemplates,
    forwardMapToArray,
    forwardSetToArray,
    getIndexCheck,
    getNameExpression,
    getPropertyNameString,
    getTypeJitContainer,
    handleUnion,
    hasDefaultValue,
    isBackReferenceType,
    isBinaryBigIntType,
    isMongoIdType,
    isNullable,
    isOptional,
    isPropertyMemberType,
    isReferenceHydrated,
    isReferenceInstance,
    isReferenceType,
    isUUIDType,
    JitStack,
    memberNameToString,
    MongoId,
    mongoIdAnnotation,
    NamingStrategy,
    ReceiveType,
    referenceAnnotation,
    ReflectionClass,
    ReflectionKind,
    resolveReceiveType,
    resolveTypeMembers,
    RuntimeCode,
    Serializer,
    sortSignatures,
    TemplateRegistry,
    TemplateState,
    Type,
    TypeArray,
    TypeBigInt,
    TypeClass,
    TypeGuardRegistry,
    TypeIndexSignature,
    TypeLiteral,
    TypeObjectLiteral,
    typeOf,
    typeSettings,
    TypeTuple,
    UnpopulatedCheck,
    unpopulatedSymbol,
    UUID,
    uuidAnnotation,
} from '@deepkit/type';
import {
    bsonTypeGuardArray,
    bsonTypeGuardForBsonTypes,
    bsonTypeGuardLiteral,
    bsonTypeGuardObjectLiteral,
    bsonTypeGuardTemplateLiteral,
    bsonTypeGuardBooleanLoose,
    bsonTypeGuardTuple,
    deserializeAny,
    deserializeArray,
    deserializeBigInt,
    deserializeBinary,
    deserializeBoolean,
    deserializeDate,
    deserializeLiteral,
    deserializeNull,
    deserializeNumber,
    deserializeObjectLiteral,
    deserializeRegExp,
    deserializeString,
    deserializeTemplateLiteral,
    deserializeTuple,
    deserializeUndefined,
    deserializeUnion,
} from './bson-deserializer-templates.js';
import { seekElementSize } from './continuation.js';
import { BSON_BINARY_SUBTYPE_DEFAULT, BSON_BINARY_SUBTYPE_UUID, BSONType, commentSafe, digitByteSize, isSerializable, TWO_PWR_32_DBL_N, utf8Bytes } from './utils.js';

// BSON MAX VALUES
const BSON_INT32_MAX = 0x7fffffff;
const BSON_INT32_MIN = -0x80000000;

// JS MAX PRECISE VALUES
export const JS_INT_MAX = 0x20000000000000; // Any integer up to 2^53 can be precisely represented by a double.
export const JS_INT_MIN = -0x20000000000000; // Any integer down to -2^53 can be precisely represented by a double.

const LONG_MAX = 'undefined' !== typeof BigInt ? BigInt('9223372036854775807') : 9223372036854775807;
const LONG_MIN = 'undefined' !== typeof BigInt ? BigInt('-9223372036854775807') : -9223372036854775807;

export function hexToByte(hex: string, index: number = 0, offset: number = 0): number {
    let code1 = hex.charCodeAt(index * 2 + offset) - 48;
    if (code1 > 9) code1 -= 39;

    let code2 = hex.charCodeAt((index * 2) + offset + 1) - 48;
    if (code2 > 9) code2 -= 39;
    return code1 * 16 + code2;
}

export function uuidStringToByte(hex: string, index: number = 0): number {
    let offset = 0;
    //e.g. bef8de96-41fe-442f-b70c-c3a150f8c96c
    if (index > 3) offset += 1;
    if (index > 5) offset += 1;
    if (index > 7) offset += 1;
    if (index > 9) offset += 1;
    return hexToByte(hex, index, offset);
}

export function stringByteLength(str: string): number {
    if (!str) return 0;
    let size = 0;
    for (let i = 0; i < str.length; i++) {
        const c = str.charCodeAt(i);

        // surrogate pair
        if (c >= 0xD800 && c <= 0xDBFF && i + 1 < str.length) {
            const lo = str.charCodeAt(i + 1);
            if (lo >= 0xDC00 && lo <= 0xDFFF) {
                // surrogate pair is a 4-byte character in UTF-8
                size += 4;
                // move past the low surrogate since it's part of the character
                i++;
                continue;
            }
        }

        if (c < 128) size += 1;
        else if (c > 127 && c < 2048) size += 2;
        else size += 3;
    }
    return size;
}

function getBinaryBigIntSize(value: bigint): number {
    let hex = value.toString(16);
    if (hex[0] === '-') hex = hex.slice(1);
    if (hex === '0') return 4 + 1;
    if (hex.length % 2) hex = '0' + hex;
    return 4 + 1 + Math.ceil(hex.length / 2);
}

function getSignedBinaryBigIntSize(value: bigint): number {
    let hex = value.toString(16);
    if (hex[0] === '-') hex = hex.slice(1);
    if (hex === '0') return 4 + 1;
    if (hex.length % 2) hex = '0' + hex;
    return 4 + 1 + 1 + Math.ceil(hex.length / 2);
}

export function getValueSize(value: any): number {
    if (value instanceof ValueWithBSONSerializer) {
        if (value.value === undefined || value.value === null) {
            return 0;
        }

        if (isUUIDType(value.type)) {
            return 4 + 1 + 16;
        } else if (isMongoIdType(value.type)) {
            return 12;
        } else if (isBinaryBigIntType(value.type)) {
            const binaryBigInt = binaryBigIntAnnotation.getFirst(value.type)!;
            return binaryBigInt === BinaryBigIntType.unsigned ? getBinaryBigIntSize(value.value) : getSignedBinaryBigIntSize(value.value);
        }
        return getValueSize(value.value);
    } else if ('boolean' === typeof value) {
        return 1;
    } else if ('string' === typeof value) {
        //size + content + null
        return 4 + stringByteLength(value) + 1;
    } else if ('bigint' === typeof value) {
        //per default bigint will be serialized as long, to be compatible with default mongo driver and mongo database.
        return 8;
    } else if ('number' === typeof value) {
        if (Math.floor(value) === value) {
            //it's an int
            if (value >= BSON_INT32_MIN && value <= BSON_INT32_MAX) {
                //32bit
                return 4;
            } else if (value >= JS_INT_MIN && value <= JS_INT_MAX) {
                //double, 64bit
                return 8;
            } else {
                //long
                return 8;
            }
        } else {
            //double
            return 8;
        }
    } else if (value instanceof Date) {
        return 8;
    } else if (value instanceof ArrayBuffer || ArrayBuffer.isView(value)) {
        let size = 4; //size
        size += 1; //sub type
        size += value.byteLength;
        return size;
    } else if (isArray(value)) {
        let size = 4; //object size
        for (let i = 0; i < value.length; i++) {
            size += 1; //element type
            size += digitByteSize(i); //element name
            size += getValueSize(value[i]);
        }
        size += 1; //null
        return size;
    } else if (value && value['_bsontype'] === 'Binary') {
        let size = 4; //size
        size += 1; //sub type
        size += value.buffer.byteLength;
        return size;
    } else if (value instanceof RegExp) {
        return stringByteLength(value.source) + 1
            +
            (value.global ? 1 : 0) +
            (value.ignoreCase ? 1 : 0) +
            (value.multiline ? 1 : 0) +
            1;
    } else if (isObject(value)) {
        let size = 4; //object size
        for (let i in value) {
            if (!hasProperty(value, i)) continue;
            size += 1; //element type
            size += stringByteLength(i) + 1; //element name + null
            size += getValueSize(value[i]);
        }
        size += 1; //null
        return size;
    } //isObject() should be last

    return 0;
}

export class ValueWithBSONSerializer {
    constructor(public value: any, public type: Type) {

    }
}

export function wrapValue<T>(value: any, type?: ReceiveType<T>) {
    return new ValueWithBSONSerializer(value, resolveReceiveType(type));
}

const mongoIdType = typeOf<MongoId>();

export function wrapObjectId(value: string) {
    return new ValueWithBSONSerializer(value, mongoIdType);
}

const uuidIdType = typeOf<UUID>();

export function wrapUUID(value: string) {
    return new ValueWithBSONSerializer(value, uuidIdType);
}

export function writeUint32LE(buffer: Uint8Array, offset: number, value: number) {
    buffer[offset] = value & 0xff;
    buffer[offset + 1] = (value >> 8) & 0xff;
    buffer[offset + 2] = (value >> 16) & 0xff;
    buffer[offset + 3] = (value >> 24) & 0xff;
}

export function writeInt32LE(buffer: Uint8Array, offset: number, value: number) {
    // writing is the same as unsigned
    return writeUint32LE(buffer, offset, value);
}

const float64Buffer = new ArrayBuffer(8);
const u32 = new Uint32Array(float64Buffer);
const f64 = new Float64Array(float64Buffer);

export function writeFloat64LE(buffer: Uint8Array, offset: number, value: number): void {
    f64[0] = value;
    buffer[offset] = u32[0] & 0xff;
    buffer[offset + 1] = (u32[0] >> 8) & 0xff;
    buffer[offset + 2] = (u32[0] >> 16) & 0xff;
    buffer[offset + 3] = (u32[0] >> 24) & 0xff;
    buffer[offset + 4] = u32[1] & 0xff;
    buffer[offset + 5] = (u32[1] >> 8) & 0xff;
    buffer[offset + 6] = (u32[1] >> 16) & 0xff;
    buffer[offset + 7] = (u32[1] >> 24) & 0xff;
}

export type AutoBufferSerializerState = { writer?: Writer };
export type AutoBufferSerializer = (data: any, state: AutoBufferSerializerState) => void;

export class AutoBuffer {
    _buffer: Uint8Array = new Uint8Array(this.initialSize);
    state = { writer: new Writer(this._buffer) };

    constructor(
        public prepend: number = 0,
        private initialSize: number = 256,
    ) {
    }

    get buffer() {
        return this._buffer.subarray(0, this.size);
    }

    get size() {
        return this.state.writer.offset;
    }

    setOffset(offset: number) {
        this.state.writer.offset = offset;
    }

    apply(serializer: AutoBufferSerializer, data: any) {
        this.state.writer.offset = this.prepend;
        serializer(data, this.state);
        if (this.prepend + this.state.writer.offset > this._buffer.byteLength) {
            // increase buffer and retry
            const nextBuffer = new Uint8Array(this.prepend + this.state.writer.offset);
            if (this.prepend) nextBuffer.set(this._buffer.subarray(0, this.prepend));
            this._buffer = nextBuffer;

            this.state.writer.buffer = this._buffer;
            this.state.writer.reset();
            this.state.writer.offset = this.prepend;
            serializer(data, this.state);
        }
    }
}

export class Writer {
    public typeOffset: number = 0;

    constructor(public buffer: Uint8Array, public offset: number = 0) {
    }

    reset() {
        this.offset = 0;
        this.typeOffset = 0;
    }

    /**
     * If typeOffset is defined, the type will be written at this offset.
     * Useful for writing type information for members in array/object literals.
     */
    writeType(v: number) {
        if (this.typeOffset !== 0) {
            this.buffer[this.typeOffset] = v;
            this.typeOffset = 0;
        }
    }

    resetWriteType() {
        this.typeOffset = 0;
    }

    prepareWriteType() {
        this.typeOffset = this.offset;
        // It might be that a subsequent content writer is omitted (circular reference),
        // then we want undefined to be written as type.
        this.buffer[this.offset] = BSONType.UNDEFINED;
        this.offset += 1;
    }

    writeUint32(v: number) {
        writeUint32LE(this.buffer, this.offset, v);
        this.offset += 4;
    }

    writeInt32(v: number) {
        writeInt32LE(this.buffer, this.offset, v);
        this.offset += 4;
    }

    writeDouble(v: number) {
        writeFloat64LE(this.buffer, this.offset, v);
        this.offset += 8;
    }

    writeDelayedSize(v: number, position: number) {
        writeUint32LE(this.buffer, position, v);
    }

    writeByte(v: number) {
        this.buffer[this.offset++] = v;
    }

    writeBuffer(buffer: Uint8Array, offset: number = 0) {
        // buffer.copy(this.buffer, this.buffer.byteOffset + this.offset);
        for (let i = offset; i < buffer.byteLength; i++) {
            this.buffer[this.offset++] = buffer[i];
        }
        // this.offset += buffer.byteLength;
    }

    writeNull() {
        this.writeByte(0);
    }

    writeAsciiString(str: string | number) {
        str = 'string' === typeof str ? str : '' + str;
        for (let i = 0; i < str.length; i++) {
            this.buffer[this.offset++] = str.charCodeAt(i);
        }
    }

    writeString(str: string) {
        if (!str) return;
        if (typeof str !== 'string') return;
        for (let i = 0; i < str.length; i++) {
            const c = str.charCodeAt(i);

            // surrogate pairs for characters outside the BMP
            if (c >= 0xD800 && c <= 0xDBFF && i + 1 < str.length) {
                const hi = c;
                const lo = str.charCodeAt(i + 1);
                if (lo >= 0xDC00 && lo <= 0xDFFF) {
                    // combine the surrogate pair and subtract 0x10000 for UTF-8 encoding
                    const codePoint = ((hi - 0xD800) * 0x400) + (lo - 0xDC00) + 0x10000;

                    this.buffer[this.offset++] = (codePoint >> 18) | 240;
                    this.buffer[this.offset++] = ((codePoint >> 12) & 63) | 128;
                    this.buffer[this.offset++] = ((codePoint >> 6) & 63) | 128;
                    this.buffer[this.offset++] = (codePoint & 63) | 128;

                    // skip the next code unit, since it's part of the surrogate pair
                    i++;
                    continue;
                }
            }

            if (c < 128) {
                this.buffer[this.offset++] = c;
            } else if (c > 127 && c < 2048) {
                this.buffer[this.offset++] = (c >> 6) | 192;
                this.buffer[this.offset++] = ((c & 63) | 128);
            } else {
                this.buffer[this.offset++] = (c >> 12) | 224;
                this.buffer[this.offset++] = ((c >> 6) & 63) | 128;
                this.buffer[this.offset++] = (c & 63) | 128;
            }
        }
    }

    getBigIntBSONType(value: bigint): number {
        if (BSON_INT32_MIN <= value && value <= BSON_INT32_MAX) {
            return BSONType.INT;
        } else if (LONG_MIN <= value && value <= LONG_MAX) {
            return BSONType.LONG;
        } else {
            return BSONType.BINARY;
        }
    }

    writeBigIntLong(value: bigint) {
        if (value < 0) {
            this.writeInt32(~Number(-value % BigInt(TWO_PWR_32_DBL_N)) + 1 | 0); //low
            this.writeInt32(~(Number(-value / BigInt(TWO_PWR_32_DBL_N))) | 0); //high
        } else {
            this.writeInt32(Number(value % BigInt(TWO_PWR_32_DBL_N)) | 0); //low
            this.writeInt32(Number(value / BigInt(TWO_PWR_32_DBL_N)) | 0); //high
        }
    }

    writeBigIntBinary(value: bigint) {
        //custom binary
        let hex = value.toString(16);
        if (hex[0] === '-') hex = hex.slice(1);
        if (hex === '0') {
            this.writeUint32(0);
            this.writeByte(BSON_BINARY_SUBTYPE_DEFAULT);
            return;
        }
        if (hex.length % 2) hex = '0' + hex;
        let size = Math.ceil(hex.length / 2);
        this.writeUint32(size);
        this.writeByte(BSON_BINARY_SUBTYPE_DEFAULT);
        for (let i = 0; i < size; i++) {
            this.buffer[this.offset++] = hexToByte(hex, i);
        }
    }

    writeSignedBigIntBinary(value: bigint) {
        //custom binary
        let hex = value.toString(16);
        let signum = 0;
        if (hex[0] === '-') {
            //negative number
            signum = 1;
            hex = hex.slice(1);
        }
        if (hex === '0') {
            this.writeUint32(0);
            this.writeByte(BSON_BINARY_SUBTYPE_DEFAULT);
            return;
        }
        if (hex.length % 2) hex = '0' + hex;
        let size = Math.ceil(hex.length / 2);
        this.writeUint32(1 + size);
        this.writeByte(BSON_BINARY_SUBTYPE_DEFAULT);
        this.buffer[this.offset++] = signum === 1 ? 255 : 0; //0xff means negative, 0 means positive
        for (let i = 0; i < size; i++) {
            this.buffer[this.offset++] = hexToByte(hex, i);
        }
    }

    writeLong(value: number) {
        if (value > 9223372036854775807) value = 9223372036854775807;
        if (value < -9223372036854775807) value = -9223372036854775807;

        if (value < 0) {
            this.writeInt32(~(-value % TWO_PWR_32_DBL_N) + 1 | 0); //low
            this.writeInt32(~(-value / TWO_PWR_32_DBL_N) | 0); //high
        } else {
            this.writeInt32((value % TWO_PWR_32_DBL_N) | 0); //low
            this.writeInt32((value / TWO_PWR_32_DBL_N) | 0); //high
        }
    }

    writeUUID(value: string) {
        this.writeUint32(16);
        this.writeByte(BSON_BINARY_SUBTYPE_UUID);

        this.buffer[this.offset + 0] = uuidStringToByte(value, 0);
        this.buffer[this.offset + 1] = uuidStringToByte(value, 1);
        this.buffer[this.offset + 2] = uuidStringToByte(value, 2);
        this.buffer[this.offset + 3] = uuidStringToByte(value, 3);
        //-
        this.buffer[this.offset + 4] = uuidStringToByte(value, 4);
        this.buffer[this.offset + 5] = uuidStringToByte(value, 5);
        //-
        this.buffer[this.offset + 6] = uuidStringToByte(value, 6);
        this.buffer[this.offset + 7] = uuidStringToByte(value, 7);
        //-
        this.buffer[this.offset + 8] = uuidStringToByte(value, 8);
        this.buffer[this.offset + 9] = uuidStringToByte(value, 9);
        //-
        this.buffer[this.offset + 10] = uuidStringToByte(value, 10);
        this.buffer[this.offset + 11] = uuidStringToByte(value, 11);
        this.buffer[this.offset + 12] = uuidStringToByte(value, 12);
        this.buffer[this.offset + 13] = uuidStringToByte(value, 13);
        this.buffer[this.offset + 14] = uuidStringToByte(value, 14);
        this.buffer[this.offset + 15] = uuidStringToByte(value, 15);
        this.offset += 16;
    }

    writeObjectId(value: string) {
        if (!value) {
            // set all to zero
            this.buffer[this.offset + 0] = 0;
            this.buffer[this.offset + 1] = 0;
            this.buffer[this.offset + 2] = 0;
            this.buffer[this.offset + 3] = 0;
            this.buffer[this.offset + 4] = 0;
            this.buffer[this.offset + 5] = 0;
            this.buffer[this.offset + 6] = 0;
            this.buffer[this.offset + 7] = 0;
            this.buffer[this.offset + 8] = 0;
            this.buffer[this.offset + 9] = 0;
            this.buffer[this.offset + 10] = 0;
            this.buffer[this.offset + 11] = 0;
            this.offset += 12;
            return;
        }

        this.buffer[this.offset + 0] = hexToByte(value, 0);
        this.buffer[this.offset + 1] = hexToByte(value, 1);
        this.buffer[this.offset + 2] = hexToByte(value, 2);
        this.buffer[this.offset + 3] = hexToByte(value, 3);
        this.buffer[this.offset + 4] = hexToByte(value, 4);
        this.buffer[this.offset + 5] = hexToByte(value, 5);
        this.buffer[this.offset + 6] = hexToByte(value, 6);
        this.buffer[this.offset + 7] = hexToByte(value, 7);
        this.buffer[this.offset + 8] = hexToByte(value, 8);
        this.buffer[this.offset + 9] = hexToByte(value, 9);
        this.buffer[this.offset + 10] = hexToByte(value, 10);
        this.buffer[this.offset + 11] = hexToByte(value, 11);
        this.offset += 12;
    }

    write(value: any): void {
        if (value instanceof ValueWithBSONSerializer) {
            if (value.value === undefined || value.value === null) {
                this.writeType(BSONType.NULL);
                return;
            }

            if (isUUIDType(value.type)) {
                this.writeType(BSONType.BINARY);
                this.writeUUID(value.value);
                return;
            } else if (isMongoIdType(value.type)) {
                this.writeType(BSONType.OID);
                this.writeObjectId(value.value);
                return;
            } else if (isBinaryBigIntType(value.type)) {
                this.writeType(BSONType.BINARY);
                const binary = binaryBigIntAnnotation.getFirst(value.type)!;
                if (binary === BinaryBigIntType.signed) {
                    this.writeSignedBigIntBinary(value.value);
                } else {
                    this.writeBigIntBinary(value.value);
                }
                return;
            }
            this.write(value.value);
        } else if ('boolean' === typeof value) {
            this.writeType(BSONType.BOOLEAN);
            this.writeByte(value ? 1 : 0);
        } else if (value instanceof RegExp) {
            this.writeType(BSONType.REGEXP);
            this.writeString(value.source);
            this.writeNull();
            if (value.ignoreCase) this.writeString('i');
            if (value.global) this.writeString('s'); //BSON does not use the RegExp flag format
            if (value.multiline) this.writeString('m');
            this.writeNull();
        } else if ('string' === typeof value) {
            //size + content + null
            this.writeType(BSONType.STRING);
            const start = this.offset;
            this.offset += 4; //size placeholder
            this.writeString(value);
            this.writeByte(0); //null
            this.writeDelayedSize(this.offset - start - 4, start);
        } else if ('number' === typeof value) {
            if (Math.floor(value) === value && value >= BSON_INT32_MIN && value <= BSON_INT32_MAX) {
                //32bit int
                this.writeType(BSONType.INT);
                this.writeInt32(value);
            } else {
                //double
                this.writeType(BSONType.NUMBER);
                this.writeDouble(value);
            }
        } else if (value instanceof Date) {
            this.writeType(BSONType.DATE);
            this.writeLong(value.valueOf());
        } else if ('bigint' === typeof value) {
            // This is only called for bigint in any structures.
            this.writeType(BSONType.LONG);
            this.writeBigIntLong(value);
        } else if (value instanceof ArrayBuffer || ArrayBuffer.isView(value)) {
            this.writeType(BSONType.BINARY);
            this.writeArrayBuffer(value);
        } else if (isArray(value)) {
            this.writeType(BSONType.ARRAY);
            const start = this.offset;
            this.offset += 4; //size

            for (let i = 0; i < value.length; i++) {
                this.prepareWriteType();
                this.writeAsciiString('' + i);
                this.writeByte(0);
                this.write(value[i]);
            }
            this.writeNull();
            this.writeDelayedSize(this.offset - start, start);
        } else if (value === undefined) {
            this.writeType(BSONType.UNDEFINED);
        } else if (value === null) {
            this.writeType(BSONType.NULL);
        } else if (isObject(value)) {
            this.writeType(BSONType.OBJECT);
            const start = this.offset;
            this.offset += 4; //size

            for (let i in value) {
                if (!hasProperty(value, i)) continue;
                this.prepareWriteType();
                this.writeString(i);
                this.writeByte(0);
                this.write(value[i]);
            }
            this.writeNull();
            this.writeDelayedSize(this.offset - start, start);
        } else {
            //the sizer incldues the type and name, so we have to write that
            this.writeType(BSONType.UNDEFINED);
        }
    }

    writeArrayBuffer(value: ArrayBuffer | ArrayBufferView) {
        let view = value instanceof ArrayBuffer ? new Uint8Array(value) : new Uint8Array(value.buffer, value.byteOffset, value.byteLength);
        if ((value as any)['_bsontype'] === 'Binary') {
            view = (value as any).buffer;
        }

        this.writeUint32(value.byteLength);
        this.writeByte(BSON_BINARY_SUBTYPE_DEFAULT);

        for (let i = 0; i < value.byteLength; i++) {
            this.buffer[this.offset++] = view[i];
        }
    }
}

function getNameWriterCode(name: string): string {
    const nameSetter: string[] = [];
    for (const byte of utf8Bytes(name)) {
        nameSetter.push(`state.writer.buffer[state.writer.offset++] = ${byte};`);
    }
    return `
        //write name: '${commentSafe(name)}'
        ${nameSetter.join('\n')}
        state.writer.writeByte(0); //null
    `;
}

function sizerObjectLiteral(type: TypeClass | TypeObjectLiteral, state: TemplateState, options: BSONSerializerOptions) {
    handleObjectLiteral(type, state, 'sizer', options);
}

function serializeObjectLiteral(type: TypeClass | TypeObjectLiteral, state: TemplateState, options: BSONSerializerOptions) {
    handleObjectLiteral(type, state, 'serialization', options);
}

function handleObjectLiteral(
    type: TypeClass | TypeObjectLiteral,
    state: TemplateState,
    target: 'serialization' | 'sizer',
    options: BSONSerializerOptions,
) {
    let before: string = 'state.size += 4; //object size';
    let after: string = 'state.size += 1; //null';
    if (target === 'serialization') {
        const start = state.compilerContext.reserveName('start');
        before = `
        var ${start} = state.writer.offset;
        state.writer.offset += 4; //size`;
        after = `
        state.writer.writeNull();
        state.writer.writeDelayedSize(state.writer.offset - ${start}, ${start});`;
    }

    //emdedded for the moment disabled. treat it as normal property.
    // const embedded = embeddedAnnotation.getFirst(type);
    // if (embedded) {
    //     if (type.kind !== ReflectionKind.class) throw new SerializationError(`Object literals can not be embedded`, collapsePath(state.path));
    //     const constructorProperties = getConstructorProperties(type);
    //     if (!constructorProperties.properties.length) throw new BSONError(`Can not embed class ${getClassName(type.classType)} since it has no constructor properties`);
    //
    //     if (constructorProperties.properties.length === 1) {
    //         const first = constructorProperties.properties[0];
    //         let name = getNameExpression(state.namingStrategy.getPropertyName(first), state);
    //         const setter = getEmbeddedAccessor(type, false, '', state.namingStrategy, first, embedded);
    //         state.addCode(executeTemplates(state.fork('', new ContainerAccessor(state.accessor, name)).forPropertyName(setter || state.propertyName), first.type));
    //     } else {
    //         const lines: string[] = [];
    //         const containerProperty = getEmbeddedProperty(type);
    //
    //         for (const property of constructorProperties.properties) {
    //             const setter = getEmbeddedAccessor(type, true, '', state.namingStrategy, property, embedded);
    //             lines.push(executeTemplates(state.fork('', new ContainerAccessor(state.accessor, JSON.stringify(property.name))).forPropertyName(setter), property.type));
    //         }
    //
    //         if (containerProperty) {
    //             state.addCode(`
    //                 ${lines.join('\n')}
    //             `);
    //         } else {
    //             if (target === 'serialization') {
    //                 serializePropertyNameAware(type, state, BSONType.OBJECT, `'object' === typeof ${state.accessor}`, `
    //                     //embedded class with multiple properties
    //                     ${before}
    //                     ${lines.join('\n')}
    //                     ${after}
    //                 `);
    //             } else {
    //                 sizerPropertyNameAware(type, state, `'object' === typeof ${state.accessor}`, `
    //                     //embedded class with multiple properties
    //                     ${before}
    //                     ${lines.join('\n')}
    //                     ${after}
    //                 `);
    //             }
    //         }
    //     }
    //     return;
    // }

    //following line resets propertyName, so we have to store it before
    const propertyName = state.propertyName;
    if (target === 'serialization') {
        serializePropertyNameAware(type, state, BSONType.OBJECT, `'object' === typeof ${state.accessor}`, '');
    } else {
        sizerPropertyNameAware(type, state, `'object' === typeof ${state.accessor}`, '');
    }

    const lines: string[] = [];
    const signatures: TypeIndexSignature[] = [];
    const existing: string[] = [];
    state.setContext({ unpopulatedSymbol });

    for (const member of resolveTypeMembers(type)) {
        if (member.kind === ReflectionKind.indexSignature) {
            if (excludedAnnotation.isExcluded(member.type, state.registry.serializer.name)) continue;
            signatures.push(member);
        }

        if (!isPropertyMemberType(member)) continue;
        if (!isSerializable(member.type)) continue;

        const propertyName = String(state.namingStrategy.getPropertyName(member, state.registry.serializer.name));
        const readName = getNameExpression(memberNameToString(member.name), state);
        existing.push(readName);

        //back references are only serialized when it's not forMongoDatabase
        if (isBackReferenceType(member.type) && options.forMongoDatabase === true) continue;

        if (excludedAnnotation.isExcluded(member.type, state.registry.serializer.name)) continue;

        const accessor = `${state.accessor}[${readName}]`;
        const propertyState = state.fork('', accessor).extendPath(propertyName);
        const setUndefined = isOptional(member)
            ? executeTemplates(propertyState.fork(), { kind: ReflectionKind.undefined })
            : isNullable(member) ? executeTemplates(propertyState.fork(), { kind: ReflectionKind.null }) : '';

        const template = executeTemplates(propertyState.fork(), member.type);
        if (!template) {
            // console.error('missing template for member', member.name, 'of', member.type);
            // throw new BSONError(`No template found for ${String(member.name)}: ${ReflectionKind[member.type.kind]}`);
        }

        let nameWriter = ``;
        if (target === 'serialization') {
            nameWriter = `
                state.writer.prepareWriteType();
                ${propertyNameWrite(propertyName)}
            `;
        } else if (target === 'sizer') {
            nameWriter = `
            //type + name + null
            state.size += 1 + ${stringByteLength(propertyName)} + 1;
            `;
        }

        const optional = isOptional(member) || hasDefaultValue(member);

        let converter = `
            ${nameWriter}
            if (${accessor} === unpopulatedSymbol) {
                //don't do anything since not loaded
            } else if (${optional} && (${accessor} === undefined || ${accessor} === null)) {
                ${setUndefined}
            } else {
                ${template}
            }
        `;

        if (optional) {
            lines.push(`
            if (${readName} in ${state.accessor}) {
                ${converter}
            }
            `);
        } else {
            lines.push(converter);
        }
    }

    if (signatures.length) {
        const i = state.compilerContext.reserveName('i');
        const existingCheck = existing.map(v => `${i} === ${v}`).join(' || ') || 'false';
        const signatureLines: string[] = [];
        state.setContext({ stringByteLength });

        sortSignatures(signatures);

        for (const signature of signatures) {
            const accessor = new ContainerAccessor(state.accessor, i);
            const propertyState = state.fork(undefined, accessor).extendPath(new RuntimeCode(i));
            const setUndefined = isOptional(signature.type)
                ? executeTemplates(propertyState.fork(), { kind: ReflectionKind.undefined })
                : isNullable(signature.type) ? executeTemplates(propertyState.fork(), { kind: ReflectionKind.null }) : '';

            let nameWriter = ``;
            if (target === 'serialization') {
                nameWriter = `
                    state.writer.prepareWriteType();
                    state.writer.writeString(${i});
                    state.writer.writeByte(0);
                `;
            } else if (target === 'sizer') {
                nameWriter = `
                    //type + name + null
                    state.size += 1 + stringByteLength(${i}) + 1;
                `;
            }
            signatureLines.push(`else if (${getIndexCheck(state.compilerContext, i, signature.index)}) {
                ${nameWriter}
                if (${accessor} === undefined) {
                     ${setUndefined}
                } else {
                    ${executeTemplates(propertyState, signature.type)}
                }
            }`);
        }

        state.setContext({ hasProperty });
        //the index signature type could be: string, number, symbol.
        //or a literal when it was constructed by a mapped type.
        lines.push(`
        for (const ${i} in ${state.accessor}) {
            if (!hasProperty(${state.accessor}, ${i})) continue;
            if (${existingCheck}) continue;
            if (false) {} ${signatureLines.join(' ')}
        }
        `);
    }

    state.addCode(`
        //handle objectLiteral via propertyName="${commentSafe(getPropertyNameString(propertyName))}"
        ${before}
        ${lines.join('\n')}
        ${after}
    `);

    if (type.kind === ReflectionKind.class && referenceAnnotation.hasAnnotations(type)) {
        state.setContext({ isObject, isReferenceInstance, isReferenceHydrated });
        const reflection = ReflectionClass.from(type.classType);
        //the primary key is serialised for unhydrated references
        const index = getNameExpression(reflection.getPrimary().getName(), state);
        const primaryKey = reflection.getPrimary().getType();
        //if a reference or forMongoDatabase=true only the foreign primary key is serialized
        state.replaceTemplate(`
            if ((${options.forMongoDatabase === true}) || (isReferenceInstance(${state.accessor}) && !isReferenceHydrated(${state.accessor}))) {
                ${executeTemplates(state.fork(state.setter, `${state.accessor}[${index}]`).forPropertyName(propertyName), primaryKey)}
            } else {
                ${state.template}
            }
        `);
    }
}

function propertyNameWrite(propertyName?: string | RuntimeCode) {
    if (propertyName) {
        if (propertyName instanceof RuntimeCode) {
            return `
               state.writer.writeString(${propertyName.code});
               state.writer.writeByte(0);
            `;
        } else {
            return getNameWriterCode(propertyName);
        }
    }
    return '';
}

function serializePropertyNameAware(type: Type, state: TemplateState, bsonType: BSONType, typeChecker: string, code: string): void {
    state.template = `
        //serializer for ${type.kind}, via propertyName="${commentSafe(getPropertyNameString(state.propertyName))}"
        ${typeChecker ? `if (!(${typeChecker})) ${state.throwCode(type)}` : ''}
        state.writer.writeType(${bsonType}); //BSON type = ${BSONType[bsonType]}
        ${code}
    `;
}

export class DigitByteRuntimeCode extends RuntimeCode {
    constructor(public code: string) {
        super(code);
    }
}

function sizerPropertyNameAware(type: Type, state: TemplateState, typeChecker: string, code: string): void {
    const checker = typeChecker ? `if (!(${typeChecker})) ${state.throwCode(type)}` : '';
    state.template = `
        ${checker}
        ${state.template}
        ${code}
    `;
}

function sizerAny(type: Type, state: TemplateState) {
    state.setContext({ getValueSize });
    sizerPropertyNameAware(type, state, ``, `state.size += getValueSize(${state.accessor});`);
}

function serializeAny(type: Type, state: TemplateState) {
    state.addCode(`
        state.writer.write(${state.accessor});
    `);
}

function sizerBoolean(type: Type, state: TemplateState) {
    sizerPropertyNameAware(type, state, `typeof ${state.accessor} === 'boolean'`, `
        state.size += 1;
    `);
}

function sizerNumber(type: Type, state: TemplateState) {
    state.setContext({ getValueSize });
    //per default bigint will be serialized as long, to be compatible with default mongo driver and mongo database.
    //We should add a new annotation, maybe like `bigint & Binary` to make it binary (unlimited size)
    sizerPropertyNameAware(type, state, `typeof ${state.accessor} === 'bigint' || (typeof ${state.accessor} === 'number' && !Number.isNaN(${state.accessor}))`, `
        state.size += getValueSize(${state.accessor});
    `);
}

function serializeBoolean(type: Type, state: TemplateState) {
    serializePropertyNameAware(type, state, BSONType.BOOLEAN, `typeof ${state.accessor} === 'boolean'`, `
        state.writer.writeByte(${state.accessor} ? 1 : 0);
    `);
}

function serializeString(type: Type, state: TemplateState) {
    if (uuidAnnotation.getFirst(type)) {
        serializePropertyNameAware(type, state, BSONType.BINARY, `typeof ${state.accessor} === 'string' && ${state.accessor}.length === 36`, `state.writer.writeUUID(${state.accessor});`);
        return;
    }
    if (mongoIdAnnotation.getFirst(type)) {
        serializePropertyNameAware(type, state, BSONType.OID, `typeof ${state.accessor} === 'string' && ${state.accessor}.length === 24`, `state.writer.writeObjectId(${state.accessor});`);
        return;
    }
    const start = state.compilerContext.reserveName('start');
    serializePropertyNameAware(type, state, BSONType.STRING, `typeof ${state.accessor} === 'string'`, `
        var ${start} = state.writer.offset;
        state.writer.offset += 4; //size placeholder
        state.writer.writeString(${state.accessor});
        state.writer.writeByte(0); //null
        state.writer.writeDelayedSize(state.writer.offset - ${start} - 4, ${start});
    `);
}

function sizeString(type: Type, state: TemplateState) {
    if (uuidAnnotation.getFirst(type)) {
        sizerPropertyNameAware(type, state, `typeof ${state.accessor} === 'string' && ${state.accessor}.length === 36`, `
            state.size += 4 + 1 + 16;
        `);
        return;
    }
    if (mongoIdAnnotation.getFirst(type)) {
        sizerPropertyNameAware(type, state, `typeof ${state.accessor} === 'string' && ${state.accessor}.length === 24`, `
            state.size += 12;
        `);
        return;
    }
    state.setContext({ getValueSize });
    sizerPropertyNameAware(type, state, `typeof ${state.accessor} === 'string'`, `
        state.size += getValueSize(${state.accessor});
    `);
}

function serializeNumber(type: Type, state: TemplateState) {
    state.addCode(`
        if ('bigint' === typeof ${state.accessor}) {
            //long
            state.writer.writeType(${BSONType.LONG});
            state.writer.writeBigIntLong(${state.accessor});
        } else if ('number' === typeof ${state.accessor} && !Number.isNaN(${state.accessor})) {
            if (Math.floor(${state.accessor}) === ${state.accessor} && ${state.accessor} >= ${BSON_INT32_MIN} && ${state.accessor} <= ${BSON_INT32_MAX}) {
                //32bit int
                state.writer.writeType(${BSONType.INT});
                state.writer.writeInt32(${state.accessor});
            } else {
                //double, 64bit
                state.writer.writeType(${BSONType.NUMBER});
                state.writer.writeDouble(${state.accessor});
            }
        }
    `);
}

function sizerBigInt(type: TypeBigInt, state: TemplateState) {
    const binaryBigInt = binaryBigIntAnnotation.getFirst(type);

    if (binaryBigInt !== undefined) {
        state.setContext({ getBinaryBigIntSize, getSignedBinaryBigIntSize });
        const bigIntSize = binaryBigInt === BinaryBigIntType.unsigned ? 'getBinaryBigIntSize' : 'getSignedBinaryBigIntSize';
        //per default bigint will be serialized as long, to be compatible with default mongo driver and mongo database.
        //We should add a new annotation, maybe like `bigint & Binary` to make it binary (unlimited size)
        sizerPropertyNameAware(type, state, `typeof ${state.accessor} === 'bigint' || (typeof ${state.accessor} === 'number' && !Number.isNaN(${state.accessor}))`, `
            state.size += ${bigIntSize}(${state.accessor});
        `);
    } else {
        sizerNumber(type, state);
    }
}

function serializeBigInt(type: TypeBigInt, state: TemplateState) {
    const binaryBigInt = binaryBigIntAnnotation.getFirst(type);

    if (binaryBigInt !== undefined) {
        const writeBigInt = binaryBigInt === BinaryBigIntType.unsigned ? 'writeBigIntBinary' : 'writeSignedBigIntBinary';
        state.addCode(`
        if ('bigint' === typeof ${state.accessor} || ('number' === typeof ${state.accessor} && !Number.isNaN(${state.accessor}))) {
            //long
            state.writer.writeType(${BSONType.BINARY});
            state.writer.${writeBigInt}(${state.accessor});
        }`);
    } else {
        serializeNumber(type, state);
    }
}

function sizerRegExp(type: Type, state: TemplateState) {
    state.setContext({ stringByteLength });
    sizerPropertyNameAware(type, state, `${state.accessor} instanceof RegExp`, `
        state.size += stringByteLength(${state.accessor}.source) + 1
            +
            (${state.accessor}.global ? 1 : 0) +
            (${state.accessor}.ignoreCase ? 1 : 0) +
            (${state.accessor}.multiline ? 1 : 0) +
            1;
    `);
}

function serializeRegExp(type: Type, state: TemplateState) {
    serializePropertyNameAware(type, state, BSONType.REGEXP, `${state.accessor} instanceof RegExp`, `
        state.writer.writeString(${state.accessor}.source);
        state.writer.writeNull();
        if (${state.accessor}.ignoreCase) state.writer.writeString('i');
        if (${state.accessor}.global) state.writer.writeString('s'); //BSON does not use the RegExp flag format
        if (${state.accessor}.multiline) state.writer.writeString('m');
        state.writer.writeNull();
    `);
}

function sizerLiteral(type: TypeLiteral, state: TemplateState) {
    if ('string' === typeof type.literal) {
        sizeString(type, state);
    } else if ('number' === typeof type.literal || 'bigint' === typeof type.literal) {
        sizerNumber(type, state);
    } else if ('boolean' === typeof type.literal) {
        sizerBoolean(type, state);
    } else if (type.literal instanceof RegExp) {
        sizerRegExp(type, state);
    }
}

function serializeLiteral(type: TypeLiteral, state: TemplateState) {
    if ('string' === typeof type.literal) {
        serializeString(type, state);
    } else if ('number' === typeof type.literal || 'bigint' === typeof type.literal) {
        serializeNumber(type, state);
    } else if ('boolean' === typeof type.literal) {
        serializeBoolean(type, state);
    } else if (type.literal instanceof RegExp) {
        serializeRegExp(type, state);
    }
}

function sizerBinary(type: TypeClass, state: TemplateState) {
    state.setContext({ ArrayBuffer });
    sizerPropertyNameAware(type, state, `${state.accessor} instanceof ArrayBuffer || ArrayBuffer.isView(${state.accessor})`, `
        state.size += 4  + 1 + ${state.accessor}.byteLength;
    `);
}

function serializeBinary(type: TypeClass, state: TemplateState) {
    state.setContext({ ArrayBuffer });
    serializePropertyNameAware(type, state, BSONType.BINARY, `${state.accessor} instanceof ArrayBuffer || ArrayBuffer.isView(${state.accessor})`, `
        state.writer.writeArrayBuffer(${state.accessor});
    `);
}

function sizerArray(type: TypeArray, state: TemplateState) {
    const elementType = type.type;
    state.setContext({ isIterable });

    const i = state.compilerContext.reserveName('arrayItemIndex');
    const item = state.compilerContext.reserveName('item');
    state.setContext({ digitByteSize });

    const memberState = state.fork('', item).extendPath(new RuntimeCode(i));
    sizerPropertyNameAware(elementType, state, `isIterable(${state.accessor})`, `
        state.size += 4; //array size

        let ${i} = 0;
        for (const ${item} of ${state.accessor}) {
            //type + index name + null
            state.size += 1 + digitByteSize(${i});
            ${executeTemplates(memberState, elementType)}
            ${i}++;
        }

        state.size += 1; //null
    `);
}

function serializeArray(elementType: Type, state: TemplateState) {
    state.setContext({ isIterable });

    const start = state.compilerContext.reserveName('start');
    const i = state.compilerContext.reserveName('arrayIndex');
    const item = state.compilerContext.reserveName('item');
    serializePropertyNameAware(elementType, state, BSONType.ARRAY, `isIterable(${state.accessor})`, `
        var ${start} = state.writer.offset;
        state.writer.offset += 4; //size

        let ${i} = 0;
        for (const ${item} of ${state.accessor}) {
            state.writer.prepareWriteType();

            state.writer.writeAsciiString(${i} + '');
            state.writer.writeByte(0);

            ${executeTemplates(state.fork('', item).extendPath(new RuntimeCode(i)), elementType)}
            state.writer.resetWriteType();
            ${i}++;
        }

        state.writer.writeNull();
        state.writer.writeDelayedSize(state.writer.offset - ${start}, ${start});
    `);
}

function serializeTuple(type: TypeTuple, state: TemplateState) {
    //[string, number], easy
    //[...string, number], easy
    //[number, ...string], easy
    //[number, ...string, number, string], medium
    const lines: string[] = [];
    let restEndOffset = 0;
    const i = state.compilerContext.reserveName('tupleIndex');

    for (let i = 0; i < type.types.length; i++) {
        if (type.types[i].type.kind === ReflectionKind.rest) {
            restEndOffset = type.types.length - (i + 1);
            break;
        }
    }

    for (const member of type.types) {
        if (member.type.kind === ReflectionKind.rest) {
            lines.push(`
            for (; ${i} < ${state.accessor}.length - ${restEndOffset}; ${i}++) {
                state.writer.prepareWriteType();
                state.writer.writeAsciiString(${i} + '');
                state.writer.writeByte(0);
                ${executeTemplates(state.fork('', `${state.accessor}[${i}]`).extendPath(member.name || new RuntimeCode(i)), member.type.type)}
            }
            `);
        } else if (member.optional) {
            //an optional element in the array is written even when undefined (as null), since elements are read by position:
            //skipping it would shift the following elements, e.g. [1, undefined, 'e'] to [1, 'e'] (#722).
            //A missing optional element at the end stays missing.
            lines.push(`
            if (${i} < ${state.accessor}.length) {
                state.writer.prepareWriteType();
                state.writer.writeAsciiString(${i} + '');
                state.writer.writeByte(0);
                if (${state.accessor}[${i}] === undefined) {
                    state.writer.writeType(${BSONType.NULL});
                } else {
                    ${executeTemplates(state.fork('', `${state.accessor}[${i}]`).extendPath(member.name || new RuntimeCode(i)), member.type)}
                }
            }
            ${i}++;
            `);
        } else {
            lines.push(`
            state.writer.prepareWriteType();
            state.writer.writeAsciiString(${i} + '');
            state.writer.writeByte(0);
            ${executeTemplates(state.fork('', `${state.accessor}[${i}]`).extendPath(member.name || new RuntimeCode(i)), member.type)}
            ${i}++;
            `);
        }
    }

    const start = state.compilerContext.reserveName('start');
    state.setContext({ isArray });

    serializePropertyNameAware(type, state, BSONType.ARRAY, `isArray(${state.accessor})`, `
        let ${i} = 0;
        var ${start} = state.writer.offset;
        state.writer.offset += 4; //size

        ${lines.join('\n')}

        state.writer.writeNull();
        state.writer.writeDelayedSize(state.writer.offset - ${start}, ${start});
    `);
}

function sizerTuple(type: TypeTuple, state: TemplateState) {
    //[string, number], easy
    //[...string, number], easy
    //[number, ...string], easy
    //[number, ...string, number, string], medium
    const lines: string[] = [];
    let restEndOffset = 0;
    const i = state.compilerContext.reserveName('tupleElement');

    for (let i = 0; i < type.types.length; i++) {
        if (type.types[i].type.kind === ReflectionKind.rest) {
            restEndOffset = type.types.length - (i + 1);
            break;
        }
    }
    state.setContext({ digitByteSize });

    for (const member of type.types) {
        if (member.type.kind === ReflectionKind.rest) {
            lines.push(`
            for (; ${i} < ${state.accessor}.length - ${restEndOffset}; ${i}++) {
                //type + index name + null
                state.size += 1 + digitByteSize(${i});
                ${executeTemplates(state.fork('', `${state.accessor}[${i}]`).extendPath(member.name || new RuntimeCode(i)), member.type.type)}
            }
            `);
        } else if (member.optional) {
            //see serializeTuple: an undefined optional element in the array is written as null (type and name, no content)
            lines.push(`
            if (${i} < ${state.accessor}.length) {
                state.size += 1 + digitByteSize(${i});
                if (${state.accessor}[${i}] !== undefined) {
                    ${executeTemplates(state.fork('', `${state.accessor}[${i}]`).extendPath(member.name || new RuntimeCode(i)), member.type)}
                }
            }
            ${i}++;
            `);
        } else {
            lines.push(`
            state.size += 1 + digitByteSize(${i});
            ${executeTemplates(state.fork('', `${state.accessor}[${i}]`).extendPath(member.name || new RuntimeCode(i)), member.type)}
            ${i}++;
            `);
        }
    }

    state.setContext({ isArray });
    sizerPropertyNameAware(type, state, `isArray(${state.accessor})`, `
        let ${i} = 0;
        state.size += 4; //array size, for tuple

        ${lines.join('\n')}

        state.size += 1; //null
    `);
}

interface BSONSerializerOptions {
    /**
     * If true the serializes changes slightly its behaviour to make it compatible with the mongo database.
     * For example are fields marked as BackReference excluded.
     * Fields marked as Reference() will only serialize its primary key.
     *
     *
     */
    forMongoDatabase?: true;
}

export class BSONBinarySerializer extends Serializer {
    name = 'bson';

    serializeId: symbol = Symbol('BSONBinarySerializer');
    deserializeId: symbol = Symbol('BSONBinarySerializer');
    sizerId: symbol = Symbol('BSONBinarySerializer');

    public sizerRegistry = new TemplateRegistry(this);
    public bsonSerializeRegistry = new TemplateRegistry(this);
    public bsonDeserializeRegistry = new TemplateRegistry(this);
    public bsonTypeGuards = new TypeGuardRegistry(this);

    constructor(protected options: BSONSerializerOptions = {}) {
        super();
        this.registerSizer();
        this.registerBsonSerializers();
        this.registerBsonDeserializers();
        this.registerBsonTypeGuards();
    }

    protected registerSizer() {
        this.sizerRegistry.register(ReflectionKind.any, sizerAny);
        this.sizerRegistry.register(ReflectionKind.object, sizerAny);
        this.sizerRegistry.register(ReflectionKind.unknown, sizerAny);
        this.sizerRegistry.register(ReflectionKind.never, () => undefined);
        this.sizerRegistry.register(ReflectionKind.class, (type, state) => sizerObjectLiteral(type, state, this.options));
        this.sizerRegistry.register(ReflectionKind.objectLiteral, (type, state) => sizerObjectLiteral(type, state, this.options));
        this.sizerRegistry.register(ReflectionKind.string, sizeString);
        this.sizerRegistry.register(ReflectionKind.templateLiteral, sizeString);
        this.sizerRegistry.register(ReflectionKind.boolean, sizerBoolean);
        this.sizerRegistry.register(ReflectionKind.promise, ((type, state) => executeTemplates(state, type.type)));
        this.sizerRegistry.register(ReflectionKind.number, sizerNumber);
        this.sizerRegistry.register(ReflectionKind.bigint, sizerBigInt);
        this.sizerRegistry.register(ReflectionKind.literal, sizerLiteral);
        this.sizerRegistry.register(ReflectionKind.regexp, sizerRegExp);
        this.sizerRegistry.register(ReflectionKind.array, sizerArray);
        this.sizerRegistry.register(ReflectionKind.tuple, sizerTuple);
        this.sizerRegistry.registerClass(Map, forwardMapToArray);
        this.sizerRegistry.registerClass(Set, forwardSetToArray);
        this.sizerRegistry.registerClass(Date, (type, state) => sizerPropertyNameAware(type, state, `${state.accessor} instanceof Date`, `state.size += 8;`));
        this.sizerRegistry.register(ReflectionKind.undefined, (type, state) => sizerPropertyNameAware(type, state, `${state.accessor} === undefined || ${state.accessor} === null`, ``));
        this.sizerRegistry.register(ReflectionKind.void, (type, state) => sizerPropertyNameAware(type, state, `${state.accessor} === undefined || ${state.accessor} === null`, ``));
        this.sizerRegistry.register(ReflectionKind.null, (type, state) => sizerPropertyNameAware(type, state, `${state.accessor} === undefined || ${state.accessor} === null`, ``));
        this.sizerRegistry.registerBinary(sizerBinary);
        this.sizerRegistry.register(ReflectionKind.union, handleUnion);
        this.sizerRegistry.register(ReflectionKind.promise, (type, state) => executeTemplates(state, type.type));
        this.sizerRegistry.register(ReflectionKind.enum, (type, state) => executeTemplates(state, type.indexType));
    }

    protected registerBsonSerializers() {
        this.bsonSerializeRegistry.register(ReflectionKind.any, serializeAny);
        this.bsonSerializeRegistry.register(ReflectionKind.object, serializeAny);
        this.bsonSerializeRegistry.register(ReflectionKind.unknown, serializeAny);
        this.bsonSerializeRegistry.register(ReflectionKind.never, () => undefined);
        this.bsonSerializeRegistry.register(ReflectionKind.class, (type, state) => serializeObjectLiteral(type, state, this.options));
        this.bsonSerializeRegistry.register(ReflectionKind.objectLiteral, (type, state) => serializeObjectLiteral(type, state, this.options));
        this.bsonSerializeRegistry.register(ReflectionKind.string, serializeString);
        this.bsonSerializeRegistry.register(ReflectionKind.templateLiteral, serializeString);
        this.bsonSerializeRegistry.register(ReflectionKind.boolean, serializeBoolean);
        this.bsonSerializeRegistry.register(ReflectionKind.promise, ((type, state) => executeTemplates(state, type.type)));
        this.bsonSerializeRegistry.register(ReflectionKind.number, serializeNumber);
        this.bsonSerializeRegistry.register(ReflectionKind.bigint, serializeBigInt);
        this.bsonSerializeRegistry.register(ReflectionKind.literal, serializeLiteral);
        this.bsonSerializeRegistry.register(ReflectionKind.regexp, serializeRegExp);
        this.bsonSerializeRegistry.register(ReflectionKind.array, (type, state) => serializeArray(type.type, state));
        this.bsonSerializeRegistry.register(ReflectionKind.tuple, serializeTuple);
        this.bsonSerializeRegistry.register(ReflectionKind.promise, (type, state) => executeTemplates(state, type.type));
        this.bsonSerializeRegistry.register(ReflectionKind.enum, (type, state) => executeTemplates(state, type.indexType));
        this.bsonSerializeRegistry.registerClass(Map, forwardMapToArray);
        this.bsonSerializeRegistry.registerClass(Set, forwardSetToArray);
        this.bsonSerializeRegistry.registerClass(Date, (type, state) => {
            serializePropertyNameAware(type, state, BSONType.DATE, `${state.accessor} instanceof Date`, `state.writer.writeLong(${state.accessor}.valueOf());`);
        });
        this.bsonSerializeRegistry.register(ReflectionKind.undefined, (type, state) => serializePropertyNameAware(type, state, BSONType.NULL, `${state.accessor} === undefined || ${state.accessor} === null`, ``));
        this.bsonSerializeRegistry.register(ReflectionKind.void, (type, state) => serializePropertyNameAware(type, state, BSONType.NULL, `${state.accessor} === undefined || ${state.accessor} === null`, ``));
        this.bsonSerializeRegistry.register(ReflectionKind.null, (type, state) => serializePropertyNameAware(type, state, BSONType.NULL, `${state.accessor} === null || ${state.accessor} === undefined`, ``));
        this.bsonSerializeRegistry.registerBinary(serializeBinary);
        this.bsonSerializeRegistry.register(ReflectionKind.union, handleUnion);
    }

    protected registerBsonTypeGuards() {
        const numberTypes = [BSONType.NUMBER, BSONType.INT, BSONType.LONG];
        //first all exact matches
        this.bsonTypeGuards.register(1, ReflectionKind.any, (type, state) => state.addSetter('true'));
        this.bsonTypeGuards.register(1, ReflectionKind.unknown, (type, state) => state.addSetter('true'));
        this.bsonTypeGuards.register(1, ReflectionKind.never, (type, state) => state.addSetter('false'));
        this.bsonTypeGuards.register(1, ReflectionKind.objectLiteral, bsonTypeGuardObjectLiteral);
        this.bsonTypeGuards.register(1, ReflectionKind.class, bsonTypeGuardObjectLiteral);
        this.bsonTypeGuards.register(1, ReflectionKind.string, (type, state) => {
            if (uuidAnnotation.getFirst(type)) {
                bsonTypeGuardForBsonTypes([BSONType.STRING, BSONType.BINARY])(type, state);
            } else if (mongoIdAnnotation.getFirst(type)) {
                bsonTypeGuardForBsonTypes([BSONType.STRING, BSONType.OID])(type, state);
            } else {
                bsonTypeGuardForBsonTypes([BSONType.STRING])(type, state);
            }
        });
        this.bsonTypeGuards.register(1, ReflectionKind.number, bsonTypeGuardForBsonTypes(numberTypes));
        this.bsonTypeGuards.register(1, ReflectionKind.object, bsonTypeGuardForBsonTypes([BSONType.OBJECT]));
        this.bsonTypeGuards.register(1, ReflectionKind.boolean, bsonTypeGuardForBsonTypes([BSONType.BOOLEAN]));
        this.bsonTypeGuards.register(1, ReflectionKind.undefined, bsonTypeGuardForBsonTypes([BSONType.UNDEFINED]));
        this.bsonTypeGuards.register(1, ReflectionKind.void, bsonTypeGuardForBsonTypes([BSONType.UNDEFINED]));
        this.bsonTypeGuards.register(1, ReflectionKind.bigint, bsonTypeGuardForBsonTypes([...numberTypes, BSONType.BINARY]));
        this.bsonTypeGuards.register(1, ReflectionKind.null, bsonTypeGuardForBsonTypes([BSONType.NULL]));
        this.bsonTypeGuards.register(1, ReflectionKind.literal, bsonTypeGuardLiteral);
        this.bsonTypeGuards.register(1, ReflectionKind.templateLiteral, bsonTypeGuardTemplateLiteral);
        this.bsonTypeGuards.register(1, ReflectionKind.regexp, bsonTypeGuardForBsonTypes([BSONType.REGEXP]));

        this.bsonTypeGuards.register(1, ReflectionKind.union, (type, state) => deserializeUnion(this.bsonTypeGuards, type, state));
        this.bsonTypeGuards.register(1, ReflectionKind.array, bsonTypeGuardArray);
        this.bsonTypeGuards.register(1, ReflectionKind.tuple, bsonTypeGuardTuple);
        this.bsonTypeGuards.register(1, ReflectionKind.promise, (type, state) => executeTemplates(state, type.type));
        this.bsonTypeGuards.register(1, ReflectionKind.enum, (type, state) => executeTemplates(state, type.indexType));

        this.bsonTypeGuards.registerClass(1, Date, bsonTypeGuardForBsonTypes([...numberTypes, BSONType.DATE, BSONType.TIMESTAMP]));
        this.bsonTypeGuards.registerBinary(1, bsonTypeGuardForBsonTypes([BSONType.BINARY]));
        this.bsonTypeGuards.registerClass(1, Map, forwardMapToArray);
        this.bsonTypeGuards.registerClass(1, Set, forwardSetToArray);

        //many deserializes support other types as well as fallback, we register them under specificality > 1
        this.bsonTypeGuards.register(1.5, ReflectionKind.undefined, bsonTypeGuardForBsonTypes([BSONType.NULL]));
        this.bsonTypeGuards.register(1.5, ReflectionKind.void, bsonTypeGuardForBsonTypes([BSONType.NULL]));
        this.bsonTypeGuards.register(2, ReflectionKind.string, bsonTypeGuardForBsonTypes([BSONType.TIMESTAMP, BSONType.STRING, BSONType.NULL, BSONType.UNDEFINED, BSONType.BOOLEAN, BSONType.OID, ...numberTypes]));
        this.bsonTypeGuards.register(2, ReflectionKind.number, bsonTypeGuardForBsonTypes([BSONType.TIMESTAMP, BSONType.STRING, BSONType.NULL, BSONType.UNDEFINED, BSONType.BOOLEAN, BSONType.BINARY]));
        this.bsonTypeGuards.register(2, ReflectionKind.bigint, bsonTypeGuardForBsonTypes([BSONType.TIMESTAMP, BSONType.STRING, BSONType.NULL, BSONType.UNDEFINED, BSONType.BOOLEAN]));
        this.bsonTypeGuards.register(2, ReflectionKind.boolean, bsonTypeGuardBooleanLoose);
        this.bsonTypeGuards.register(2, ReflectionKind.literal, bsonTypeGuardForBsonTypes([BSONType.NULL, BSONType.UNDEFINED]));
        this.bsonTypeGuards.registerClass(2, Date, bsonTypeGuardForBsonTypes([...numberTypes]));

        this.bsonTypeGuards.getRegistry(1).addDecorator(isReferenceType, (type, state) => {
            if (type.kind !== ReflectionKind.class && type.kind !== ReflectionKind.objectLiteral) return;
            state.setContext({ isObject, createReference, isReferenceHydrated });
            const reflection = ReflectionClass.from(type);
            // in deserialization a reference is created when only the primary key is provided (no object given)
            state.template = `
                if (state.elementType === ${BSONType.OBJECT}) {
                    ${state.template}
                } else {
                    ${executeTemplates(state.fork().extendPath(String(reflection.getPrimary().getName())).forPropertyName(state.propertyName), reflection.getPrimary().getType())}
                }
            `;
        });
    }

    protected registerBsonDeserializers() {
        this.bsonDeserializeRegistry.register(ReflectionKind.any, deserializeAny);
        this.bsonDeserializeRegistry.register(ReflectionKind.object, deserializeAny);
        this.bsonDeserializeRegistry.register(ReflectionKind.unknown, deserializeAny);
        this.bsonDeserializeRegistry.register(ReflectionKind.never, () => undefined);
        this.bsonDeserializeRegistry.register(ReflectionKind.class, deserializeObjectLiteral);
        this.bsonDeserializeRegistry.register(ReflectionKind.objectLiteral, deserializeObjectLiteral);
        this.bsonDeserializeRegistry.register(ReflectionKind.number, deserializeNumber);
        this.bsonDeserializeRegistry.register(ReflectionKind.bigint, deserializeBigInt);
        this.bsonDeserializeRegistry.register(ReflectionKind.string, deserializeString);
        this.bsonDeserializeRegistry.register(ReflectionKind.templateLiteral, deserializeTemplateLiteral);
        this.bsonDeserializeRegistry.register(ReflectionKind.boolean, deserializeBoolean);
        this.bsonDeserializeRegistry.register(ReflectionKind.undefined, deserializeUndefined);
        this.bsonDeserializeRegistry.register(ReflectionKind.void, deserializeUndefined);
        this.bsonDeserializeRegistry.register(ReflectionKind.null, deserializeNull);
        this.bsonDeserializeRegistry.register(ReflectionKind.literal, deserializeLiteral);
        this.bsonDeserializeRegistry.register(ReflectionKind.regexp, deserializeRegExp);
        this.bsonDeserializeRegistry.register(ReflectionKind.tuple, deserializeTuple);
        this.bsonDeserializeRegistry.register(ReflectionKind.union, (type, state) => deserializeUnion(this.bsonTypeGuards, type, state));
        this.bsonDeserializeRegistry.register(ReflectionKind.array, deserializeArray);
        this.bsonDeserializeRegistry.register(ReflectionKind.promise, (type, state) => executeTemplates(state, type.type));
        this.bsonDeserializeRegistry.register(ReflectionKind.enum, (type, state) => executeTemplates(state, type.indexType));
        this.bsonDeserializeRegistry.registerClass(Date, deserializeDate);
        this.bsonDeserializeRegistry.registerBinary(deserializeBinary);
        this.bsonDeserializeRegistry.registerClass(Map, (type, state) => {
            forwardMapToArray(type, state);
            state.addSetter(`new Map(${state.setter})`);
        });
        this.bsonDeserializeRegistry.registerClass(Set, (type, state) => {
            forwardSetToArray(type, state);
            state.addSetter(`new Set(${state.setter})`);
        });

        this.bsonDeserializeRegistry.addDecorator(
            type => isReferenceType(type) || isBackReferenceType(type) || (type.parent !== undefined && isBackReferenceType(type.parent)),
            (type, state) => {
                if (type.kind !== ReflectionKind.class && type.kind !== ReflectionKind.objectLiteral) return;
                state.setContext({ isObject, createReference, isReferenceHydrated });
                const reflection = ReflectionClass.from(type);
                const referenceClassTypeVar = state.setVariable('referenceClassType', type.kind === ReflectionKind.class ? type.classType : Object);
                // in deserialization a reference is created when only the primary key is provided (no object given)
                state.template = `
                    if (state.elementType === ${BSONType.OBJECT}) {
                        ${state.template}
                    } else {
                        let pk;
                        ${executeTemplates(state.fork('pk').extendPath(String(reflection.getPrimary().getName())).forPropertyName(state.propertyName), reflection.getPrimary().getType())}
                        ${state.setter} = createReference(${referenceClassTypeVar}, {${JSON.stringify(reflection.getPrimary().getName())}: pk});
                    }
                `;
            });
    }

}

export const bsonBinarySerializer = new BSONBinarySerializer();

function createBSONSerializer(type: Type, serializer: BSONBinarySerializer, namingStrategy: NamingStrategy = new NamingStrategy(), path: string = '', jitStack: JitStack = new JitStack()): BSONSerializer {
    const compiler = new CompilerContext();
    compiler.context.set('typeSettings', typeSettings);
    compiler.context.set('Writer', Writer);
    compiler.context.set('seekElementSize', seekElementSize);
    compiler.context.set('createBuffer', createBuffer);
    compiler.context.set('sizer', getBSONSizer(serializer, type));
    compiler.context.set('UnpopulatedCheck', UnpopulatedCheck);

    const state = new TemplateState('', 'data', compiler, serializer.bsonSerializeRegistry, namingStrategy, jitStack, [path]).disableSetter();

    const code = `
        state = state || {};
        state.writer = state.writer || new Writer(createBuffer(sizer(data)));

        const unpopulatedCheck = typeSettings.unpopulatedCheck;
        typeSettings.unpopulatedCheck = UnpopulatedCheck.ReturnSymbol;

        ${executeTemplates(state, type)}

        typeSettings.unpopulatedCheck = unpopulatedCheck;

        return state.writer.buffer;
    `;

    return compiler.build(code, 'data', 'state');
}

export function createBSONSizer<T>(type?: ReceiveType<T>, serializer: BSONBinarySerializer = bsonBinarySerializer, jitStack: JitStack = new JitStack()): (data: object) => number {
    const compiler = new CompilerContext();
    type = resolveReceiveType(type);
    compiler.context.set('typeSettings', typeSettings);
    compiler.context.set('unpopulatedSymbol', unpopulatedSymbol);
    compiler.context.set('UnpopulatedCheck', UnpopulatedCheck);
    compiler.context.set('seekElementSize', seekElementSize);

    const state = new TemplateState('', 'data', compiler, serializer.sizerRegistry, new NamingStrategy(), jitStack, []).disableSetter();

    const code = `
        state = state || {loosely: false};
        state.size = 0;

        const unpopulatedCheck = typeSettings.unpopulatedCheck;
        typeSettings.unpopulatedCheck = UnpopulatedCheck.ReturnSymbol;

        ${executeTemplates(state, type)}

        typeSettings.unpopulatedCheck = unpopulatedCheck;

        return state.size;
    `;

    return compiler.build(code, 'data', 'state');
}

export function serializeBSONWithoutOptimiser(data: any): Uint8Array {
    const size = getValueSize(data);
    const writer = new Writer(createBuffer(size));
    writer.write(data);
    return writer.buffer;
}

export type BSONSerializerState = { writer?: Writer };
export type BSONSerializer = (data: any, state?: BSONSerializerState) => Uint8Array;
export type BSONSizer = (data: any) => number;

export function getBSONSerializer<T>(serializer: BSONBinarySerializer = bsonBinarySerializer, receiveType?: ReceiveType<T>): BSONSerializer {
    const type = resolveReceiveType(receiveType);

    const jit = getTypeJitContainer(type);
    if (jit[serializer.serializeId]) return jit[serializer.serializeId];

    jit[serializer.serializeId] = createBSONSerializer(type, serializer);
    toFastProperties(jit);
    return jit[serializer.serializeId];
}

export function getBSONSizer<T>(serializer: BSONBinarySerializer = bsonBinarySerializer, receiveType?: ReceiveType<T>): BSONSizer {
    const type = resolveReceiveType(receiveType);
    const jit = getTypeJitContainer(type);
    if (jit[serializer.sizerId]) return jit[serializer.sizerId];

    jit[serializer.sizerId] = createBSONSizer(type, serializer);
    toFastProperties(jit);
    return jit[serializer.sizerId];
}

export function serializeBSON<T>(data: T, serializer: BSONBinarySerializer = bsonBinarySerializer, receiveType?: ReceiveType<T>): Uint8Array {
    const serialize = getBSONSerializer(serializer, receiveType);
    return serialize(data);
}
