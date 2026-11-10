import { CompilerContext } from '@deepkit/core';

const maxShortDecode = 16;
const asciiCodes: number[][] = [];
for (let i = 0; i <= maxShortDecode; i++) asciiCodes.push(new Array(i).fill(0));

const utf8Slice: (this: Uint8Array, start: number, end: number) => string = (Buffer.prototype as any).utf8Slice;
const latin1Slice: (this: Uint8Array, start: number, end: number) => string = (Buffer.prototype as any).latin1Slice;

/** Text in UTF-8 between start and end. */
export function decodeText(d: Uint8Array, start: number, end: number): string {
    const size = end - start;
    if (size <= maxShortDecode) {
        const codes = asciiCodes[size];
        for (let i = 0; i < size; i++) {
            const c = d[start + i];
            if (c > 127) return utf8Slice.call(d, start, end);
            codes[i] = c;
        }
        return String.fromCharCode.apply(null, codes);
    }
    return utf8Slice.call(d, start, end);
}

function intText(d: Uint8Array, start: number, end: number): number {
    let i = start;
    const negative = d[i] === 45;
    if (negative) i++;
    let value = 0;
    while (i < end) value = value * 10 + d[i++] - 48;
    return negative ? -value : value;
}

/** Numbers that fit into a double exactly stay numbers, others become a bigint instead of losing digits. */
function int8Text(d: Uint8Array, start: number, end: number): number | bigint {
    if (end - start <= 15) return intText(d, start, end);
    const text = latin1Slice.call(d, start, end);
    const value = BigInt(text);
    return value >= -9007199254740991n && value <= 9007199254740991n ? Number(value) : value;
}

function floatText(d: Uint8Array, start: number, end: number): number {
    return parseFloat(latin1Slice.call(d, start, end));
}

/**
 * A numeric with up to 15 digits is a number, which holds it exactly. A longer one lost its digits as number:
 * a whole number becomes a bigint (like int8), others a string with all digits.
 */
function numericText(d: Uint8Array, start: number, end: number): number | bigint | string {
    if (end - start <= 16) return parseFloat(latin1Slice.call(d, start, end));
    const text = latin1Slice.call(d, start, end);
    let digits = 0;
    let whole = true;
    for (let i = 0; i < text.length; i++) {
        const c = text.charCodeAt(i);
        if (c >= 48 && c <= 57) digits++;
        else if (c !== 45) whole = false;
    }
    if (digits <= 15) return parseFloat(text);
    // NaN, Infinity
    if (digits === 0) return parseFloat(text);
    return whole ? BigInt(text) : text;
}

function boolText(d: Uint8Array, start: number, end: number): boolean {
    return d[start] === 116;
}

function jsonText(d: Uint8Array, start: number, end: number): any {
    return JSON.parse(utf8Slice.call(d, start, end));
}

function stringText(d: Uint8Array, start: number, end: number): string {
    return decodeText(d, start, end);
}

function hexValue(code: number): number {
    return code < 58 ? code - 48 : code < 71 ? code - 55 : code - 87;
}

function byteaText(d: Uint8Array, start: number, end: number): Buffer {
    if (d[start] === 92 && d[start + 1] === 120) {
        const size = (end - start - 2) >> 1;
        const out = Buffer.allocUnsafe(size);
        for (let i = 0, p = start + 2; i < size; i++, p += 2) out[i] = (hexValue(d[p]) << 4) | hexValue(d[p + 1]);
        return out;
    }
    // the escape format, when the server is configured for it
    const out: number[] = [];
    for (let i = start; i < end; i++) {
        const c = d[i];
        if (c !== 92) {
            out.push(c);
        } else if (d[i + 1] === 92) {
            out.push(92);
            i++;
        } else {
            out.push(((d[i + 1] - 48) << 6) | ((d[i + 2] - 48) << 3) | (d[i + 3] - 48));
            i += 3;
        }
    }
    return Buffer.from(out);
}

export const localDateExactFrom = Date.UTC(1972, 0, 1);
const tzDate = new Date(0);
function timezoneOffsetAt(time: number): number {
    tzDate.setTime(time);
    return tzDate.getTimezoneOffset() * 60000;
}

/**
 * The instant of a timestamp without zone, read as local time like the former driver did.
 * time holds the wall clock as if it was UTC. Near a daylight saving change, where a wall clock can
 * exist twice or not at all, the Date constructor decides.
 */
function localDate(time: number): Date {
    // Before 1972 a zone can have an offset with seconds, which getTimezoneOffset does not report exactly.
    if (time >= localDateExactFrom) {
        const before = timezoneOffsetAt(time - 86400000);
        if (before === timezoneOffsetAt(time + 86400000)) return new Date(time + before);
    }
    tzDate.setTime(time);
    return new Date(
        tzDate.getUTCFullYear(),
        tzDate.getUTCMonth(),
        tzDate.getUTCDate(),
        tzDate.getUTCHours(),
        tzDate.getUTCMinutes(),
        tzDate.getUTCSeconds(),
        tzDate.getUTCMilliseconds(),
    );
}

function utcTime(
    year: number,
    month: number,
    day: number,
    hour: number,
    minute: number,
    second: number,
    milli: number,
): number {
    if (year >= 0 && year < 100) {
        tzDate.setUTCFullYear(year, month, day);
        tzDate.setUTCHours(hour, minute, second, milli);
        return tzDate.getTime();
    }
    return Date.UTC(year, month, day, hour, minute, second, milli);
}

function twoDigits(d: Uint8Array, i: number): number {
    return (d[i] - 48) * 10 + d[i + 1] - 48;
}

function timestampText(d: Uint8Array, start: number, end: number, withZone: boolean): Date | number {
    if (d[start] === 105 /* infinity */) return Infinity;
    if (d[start] === 45 && d[start + 1] === 105) return -Infinity;
    let i = start;
    let year = 0;
    while (d[i] !== 45) year = year * 10 + d[i++] - 48;
    i++;
    const month = twoDigits(d, i) - 1;
    const day = twoDigits(d, i + 3);
    i += 5;
    let hour = 0,
        minute = 0,
        second = 0,
        milli = 0;
    let offset = 0;
    if (i < end && d[i] === 32 && d[i + 1] !== 66 /* the space before BC */) {
        i++;
        hour = twoDigits(d, i);
        minute = twoDigits(d, i + 3);
        second = twoDigits(d, i + 6);
        i += 8;
        if (d[i] === 46) {
            i++;
            let scale = 100;
            while (i < end && d[i] >= 48 && d[i] <= 57) {
                if (scale >= 1) {
                    milli += (d[i] - 48) * scale;
                    scale /= 10;
                }
                i++;
            }
        }
        if (withZone && i < end && (d[i] === 43 || d[i] === 45)) {
            const sign = d[i] === 45 ? -1 : 1;
            offset = twoDigits(d, i + 1) * 3600000;
            i += 3;
            if (d[i] === 58) {
                offset += twoDigits(d, i + 1) * 60000;
                i += 3;
                if (d[i] === 58) offset += twoDigits(d, i + 1) * 1000;
            }
            offset *= sign;
        }
    }
    if (d[end - 1] === 67 && d[end - 2] === 66 && d[end - 3] === 32) year = 1 - year;
    const time = utcTime(year, month, day, hour, minute, second, milli);
    return withZone ? new Date(time - offset) : localDate(time);
}

function timestampWithoutZoneText(d: Uint8Array, start: number, end: number): Date | number {
    return timestampText(d, start, end, false);
}

function timestampWithZoneText(d: Uint8Array, start: number, end: number): Date | number {
    return timestampText(d, start, end, true);
}

export const postgresEpoch = 946684800000;

/** The time of a timestamp in milliseconds since the Unix epoch, or Infinity. Reads 8 bytes. */
function timestampMillis(d: Uint8Array, o: number): number {
    const high = (d[o] << 24) | (d[o + 1] << 16) | (d[o + 2] << 8) | d[o + 3];
    const low = ((d[o + 4] << 24) | (d[o + 5] << 16) | (d[o + 6] << 8) | d[o + 7]) >>> 0;
    if (high === 0x7fffffff && low === 0xffffffff) return Infinity;
    if (high === -0x80000000 && low === 0) return -Infinity;
    return Math.floor((high * 4294967296 + low) / 1000) + postgresEpoch;
}

function timestampBinary(d: Uint8Array, o: number): Date | number {
    const time = timestampMillis(d, o);
    return time === Infinity || time === -Infinity ? time : localDate(time);
}

function timestampZoneBinary(d: Uint8Array, o: number): Date | number {
    const time = timestampMillis(d, o);
    return time === Infinity || time === -Infinity ? time : new Date(time);
}

function dateBinary(d: Uint8Array, o: number): Date | number {
    const days = (d[o] << 24) | (d[o + 1] << 16) | (d[o + 2] << 8) | d[o + 3];
    if (days === 0x7fffffff) return Infinity;
    if (days === -0x80000000) return -Infinity;
    return localDate(postgresEpoch + days * 86400000);
}

const float64 = new Float64Array(1);
const float32 = new Float32Array(1);
const float64Bytes = new Uint8Array(float64.buffer);
const float32Bytes = new Uint8Array(float32.buffer);
const littleEndian = new Uint8Array(new Uint16Array([1]).buffer)[0] === 1;

function float8Binary(d: Uint8Array, o: number): number {
    if (littleEndian) {
        for (let i = 0; i < 8; i++) float64Bytes[i] = d[o + 7 - i];
    } else {
        for (let i = 0; i < 8; i++) float64Bytes[i] = d[o + i];
    }
    return float64[0];
}

function float4Binary(d: Uint8Array, o: number): number {
    if (littleEndian) {
        for (let i = 0; i < 4; i++) float32Bytes[i] = d[o + 3 - i];
    } else {
        for (let i = 0; i < 4; i++) float32Bytes[i] = d[o + i];
    }
    return float32[0];
}

function int8Binary(d: Uint8Array, o: number): number | bigint {
    const high = (d[o] << 24) | (d[o + 1] << 16) | (d[o + 2] << 8) | d[o + 3];
    const low = ((d[o + 4] << 24) | (d[o + 5] << 16) | (d[o + 6] << 8) | d[o + 7]) >>> 0;
    if (high >= -2097152 && high < 2097152) return high * 4294967296 + low;
    return (BigInt(high) << 32n) | BigInt(low);
}

function byteaBinary(d: Uint8Array, o: number, length: number): Buffer {
    return Buffer.copyBytesFrom(d, o, length);
}

/** Skips the '[1:2]=' prefix of an array with custom bounds. */
let arrayOffset = 0;
let arrayScratch: Uint8Array = new Uint8Array(256);

function parseArrayLevel(
    d: Uint8Array,
    end: number,
    element: (d: Uint8Array, start: number, end: number) => any,
): any[] {
    const out: any[] = [];
    let i = arrayOffset + 1; // skips {
    while (i < end) {
        const c = d[i];
        if (c === 125) {
            arrayOffset = i + 1;
            return out;
        }
        if (c === 44) {
            i++;
            continue;
        }
        if (c === 123) {
            arrayOffset = i;
            out.push(parseArrayLevel(d, end, element));
            i = arrayOffset;
            continue;
        }
        if (c === 34) {
            let j = i + 1;
            let escaped = false;
            while (d[j] !== 34) {
                if (d[j] === 92) {
                    escaped = true;
                    j += 2;
                } else {
                    j++;
                }
            }
            if (!escaped) {
                out.push(element(d, i + 1, j));
            } else {
                if (arrayScratch.byteLength < j - i)
                    arrayScratch = new Uint8Array(Math.max(j - i, arrayScratch.byteLength * 2));
                let n = 0;
                for (let k = i + 1; k < j; k++) {
                    if (d[k] === 92) k++;
                    arrayScratch[n++] = d[k];
                }
                out.push(element(arrayScratch, 0, n));
            }
            i = j + 1;
            continue;
        }
        let j = i;
        while (j < end && d[j] !== 44 && d[j] !== 125) j++;
        if (j - i === 4 && d[i] === 78 && d[i + 1] === 85 && d[i + 2] === 76 && d[i + 3] === 76) {
            out.push(null);
        } else {
            out.push(element(d, i, j));
        }
        i = j;
    }
    arrayOffset = i;
    return out;
}

function arrayText(
    d: Uint8Array,
    start: number,
    end: number,
    element: (d: Uint8Array, start: number, end: number) => any,
): any[] {
    let i = start;
    if (d[i] === 91) {
        while (i < end && d[i] !== 61) i++;
        i++;
    }
    arrayOffset = i;
    return parseArrayLevel(d, end, element);
}

// Object identifiers of the built-in types, see pg_type.dat
const bool = 16,
    bytea = 17,
    int8 = 20,
    int2 = 21,
    int4 = 23,
    oid = 26,
    json = 114,
    float4 = 700,
    float8 = 701;
const date = 1082,
    timestamp = 1114,
    timestamptz = 1184,
    numeric = 1700,
    jsonb = 3802;
const arrayJson = 199,
    arrayBool = 1000,
    arrayBytea = 1001,
    arrayInt2 = 1005,
    arrayInt4 = 1007,
    arrayText_ = 1009;
const arrayOid = 1028,
    arrayFloat4 = 1021,
    arrayFloat8 = 1022,
    arrayTimestamp = 1115,
    arrayDate = 1182;
const arrayTimestamptz = 1185,
    arrayNumeric = 1231,
    arrayJsonb = 3807;

const helpers = {
    decodeText,
    intText,
    int8Text,
    numericText,
    floatText,
    boolText,
    jsonText,
    stringText,
    byteaText,
    timestampWithoutZoneText,
    timestampWithZoneText,
    arrayText,
    timestampBinary,
    timestampZoneBinary,
    dateBinary,
    float8Binary,
    float4Binary,
    int8Binary,
    byteaBinary,
};

function elementFunction(type: number): string | undefined {
    switch (type) {
        case arrayInt2:
        case arrayInt4:
        case arrayOid:
            return 'intText';
        case 1016: // int8, numbers and bigint like a single int8, they were strings
            return 'int8Text';
        case arrayFloat4:
        case arrayFloat8:
            return 'floatText';
        case arrayNumeric:
            return 'numericText';
        case arrayBool:
            return 'boolText';
        case arrayDate:
        case arrayTimestamp:
            return 'timestampWithoutZoneText';
        case arrayTimestamptz:
            return 'timestampWithZoneText';
        case arrayJson:
        case arrayJsonb:
            return 'jsonText';
        case arrayBytea:
            return 'byteaText';
    }
    return undefined;
}

function isTextArray(type: number): boolean {
    switch (type) {
        case arrayText_:
        case 1002: // char
        case 1003: // name
        case 1014: // bpchar
        case 1015: // varchar
        case 1040: // macaddr
        case 1041: // inet
        case 651: // cidr
        case 775: // macaddr8
        case 2951: // uuid
            return true;
    }
    return false;
}

function textExpression(type: number): string {
    switch (type) {
        case int2:
        case int4:
        case oid:
            return 'intText(d, o, o + l)';
        case int8:
            return 'int8Text(d, o, o + l)';
        case float4:
        case float8:
            return 'floatText(d, o, o + l)';
        case numeric:
            return 'numericText(d, o, o + l)';
        case bool:
            return 'd[o] === 116';
        case json:
        case jsonb:
            return 'jsonText(d, o, o + l)';
        case bytea:
            return 'byteaText(d, o, o + l)';
        case date:
        case timestamp:
            return 'timestampWithoutZoneText(d, o, o + l)';
        case timestamptz:
            return 'timestampWithZoneText(d, o, o + l)';
    }
    const element = elementFunction(type);
    if (element) return `arrayText(d, o, o + l, ${element})`;
    if (isTextArray(type)) return 'arrayText(d, o, o + l, stringText)';
    return 'decodeText(d, o, o + l)';
}

/** Whether binary format is requested for a column when the statement is run again. */
function isBinaryColumn(type: number): boolean {
    switch (type) {
        case bool:
        case bytea:
        case int8:
        case int2:
        case int4:
        case oid:
        case float4:
        case float8:
        case date:
        case timestamp:
        case timestamptz:
            return true;
    }
    return false;
}

function binaryExpression(type: number): string {
    switch (type) {
        case bool:
            return 'd[o] === 1';
        case int2:
            return '((d[o] << 8 | d[o + 1]) << 16 >> 16)';
        case int4:
            return '(d[o] << 24 | d[o + 1] << 16 | d[o + 2] << 8 | d[o + 3])';
        case oid:
            return '((d[o] << 24 | d[o + 1] << 16 | d[o + 2] << 8 | d[o + 3]) >>> 0)';
        case int8:
            return 'int8Binary(d, o)';
        case float4:
            return 'float4Binary(d, o)';
        case float8:
            return 'float8Binary(d, o)';
        case date:
            return 'dateBinary(d, o)';
        case timestamp:
            return 'timestampBinary(d, o)';
        case timestamptz:
            return 'timestampZoneBinary(d, o)';
        case bytea:
            return 'byteaBinary(d, o, l)';
    }
    return textExpression(type);
}

/** Decodes a row. In RowMode.reuse it writes into target and returns it. */
export type RowDecoder = (d: Uint8Array, o: number, target?: any) => any;

export enum RowMode {
    object = 0,
    array = 1,
    /**
     * Every row is written into the same object, which is only valid until the next row is decoded.
     * For queryMapped(), which turns each row into something else right away.
     */
    reuse = 2,
}

/** Decodes a DataRow starting at its first column, without an intermediate value for each field. */
function compileDecoder(columns: PostgresColumn[], mode: RowMode, binary: boolean): RowDecoder {
    const context = new CompilerContext();
    context.set(helpers);
    let code = 'var l = 0;\n';
    for (let i = 0; i < columns.length; i++) {
        const expression =
            binary && isBinaryColumn(columns[i].oid)
                ? binaryExpression(columns[i].oid)
                : textExpression(columns[i].oid);
        code += `l = (d[o] << 24) | (d[o + 1] << 16) | (d[o + 2] << 8) | d[o + 3]; o += 4;\n`;
        code += `var v${i} = null;\nif (l !== -1) { v${i} = ${expression}; o += l; }\n`;
    }
    if (mode === RowMode.array) {
        code += 'return [' + columns.map((_, i) => 'v' + i).join(', ') + '];';
    } else if (mode === RowMode.reuse && !columns.some(column => column.name === '__proto__')) {
        // an assignment to __proto__ would set the prototype, such rows are new objects instead
        code += columns.map((column, i) => `t[${JSON.stringify(column.name)}] = v${i};`).join('\n') + '\nreturn t;';
    } else {
        const properties = columns.map((column, i) => {
            const key = column.name === '__proto__' ? '["__proto__"]' : JSON.stringify(column.name);
            return `${key}: v${i}`;
        });
        code += 'return {' + properties.join(', ') + '};';
    }
    return context.build(code, 'd', 'o', 't');
}

export interface PostgresColumn {
    name: string;
    tableId: number;
    columnId: number;
    oid: number;
    size: number;
    modifier: number;
    format: number;
}

function readInt32(d: Uint8Array, o: number): number {
    return (d[o] << 24) | (d[o + 1] << 16) | (d[o + 2] << 8) | d[o + 3];
}

function readInt16(d: Uint8Array, o: number): number {
    return (((d[o] << 8) | d[o + 1]) << 16) >> 16;
}

/**
 * What a statement returns. There is one per distinct RowDescription of the process and it holds the
 * compiled decoders, so statements with the same columns share them. Compiling takes longer than running a
 * query, which is why a Bind only asks for binary format after a statement was seen.
 */
export class RowShape {
    readonly columns: PostgresColumn[];
    private readonly decoders: (RowDecoder | undefined)[] = [undefined, undefined, undefined, undefined, undefined, undefined];
    private formats?: Uint8Array;

    constructor(readonly bytes: Uint8Array) {
        const columns: PostgresColumn[] = [];
        let o = 2;
        const count = readInt16(bytes, 0);
        for (let i = 0; i < count; i++) {
            let stop = o;
            while (bytes[stop] !== 0) stop++;
            columns.push({
                name: decodeText(bytes, o, stop),
                tableId: readInt32(bytes, stop + 1),
                columnId: readInt16(bytes, stop + 5),
                oid: readInt32(bytes, stop + 7) >>> 0,
                size: readInt16(bytes, stop + 11),
                modifier: readInt32(bytes, stop + 13),
                format: readInt16(bytes, stop + 17),
            });
            o = stop + 19;
        }
        this.columns = columns;
    }

    decoder(mode: RowMode, binary: boolean): RowDecoder {
        const slot = mode * 2 + (binary ? 1 : 0);
        return (this.decoders[slot] ??= compileDecoder(this.columns, mode, binary));
    }

    /** The result format codes of a Bind, the same bytes every time a statement runs. */
    binaryResultFormats(): Uint8Array {
        if (this.formats) return this.formats;
        const count = this.columns.length;
        const out = new Uint8Array(2 + count * 2);
        out[0] = count >>> 8;
        out[1] = count;
        for (let i = 0; i < count; i++) out[3 + i * 2] = isBinaryColumn(this.columns[i].oid) ? 1 : 0;
        return (this.formats = out);
    }
}

const shapeCacheSize = 2048;
const shapeCache: (RowShape | undefined)[] = new Array(shapeCacheSize).fill(undefined);

/**
 * The shape of a RowDescription message without looking at it twice: a query that runs again
 * gets the same bytes from the server, for every connection. Direct mapped, a colliding shape replaces the other.
 */
export function getRowShape(d: Uint8Array, start: number, end: number): RowShape {
    let hash = 0x811c9dc5;
    for (let i = start; i < end; i++) hash = Math.imul(hash ^ d[i], 16777619);
    const index = (hash >>> 0) % shapeCacheSize;
    const cached = shapeCache[index];
    if (cached !== undefined && cached.bytes.length === end - start) {
        const bytes = cached.bytes;
        let i = 0;
        while (i < bytes.length && bytes[i] === d[start + i]) i++;
        if (i === bytes.length) return cached;
    }
    // not d.slice, which is a view when d is a Buffer as with TLS
    const shape = new RowShape(Uint8Array.prototype.slice.call(d, start, end));
    shapeCache[index] = shape;
    return shape;
}
