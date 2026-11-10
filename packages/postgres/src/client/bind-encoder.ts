import { CompilerContext } from '@deepkit/core';
import { LruCache } from '@deepkit/sql';

import type { PostgresEncoder } from './encoder.js';
import { localDateExactFrom, postgresEpoch } from './row-decoder.js';

/** Writes the values of all parameters. Everything else about a Bind is the same for every run of a statement. */
type ParameterWriter = (e: PostgresEncoder, p: any[], formats: number) => void;

const float64 = new Float64Array(1);
const float32 = new Float32Array(1);
const float64Bytes = new Uint8Array(float64.buffer);
const float32Bytes = new Uint8Array(float32.buffer);
const littleEndian = new Uint8Array(new Uint16Array([1]).buffer)[0] === 1;

function writeFloat8(b: Uint8Array, o: number, value: number): void {
    float64[0] = value;
    for (let i = 0; i < 8; i++) b[o + i] = float64Bytes[littleEndian ? 7 - i : i];
}

function writeFloat4(b: Uint8Array, o: number, value: number): void {
    float32[0] = value;
    for (let i = 0; i < 4; i++) b[o + i] = float32Bytes[littleEndian ? 3 - i : i];
}

/** Whether the value is not rounded to infinity or zero, which as text would be an error of the server. */
function fitsFloat4(value: number): boolean {
    if (value === 0) return true;
    const rounded = Math.fround(value);
    return rounded !== 0 && (Number.isFinite(rounded) || !Number.isFinite(value));
}

function writeInt64(b: Uint8Array, o: number, value: number): void {
    const high = Math.floor(value / 4294967296);
    const low = value - high * 4294967296;
    b[o] = high >>> 24;
    b[o + 1] = high >>> 16;
    b[o + 2] = high >>> 8;
    b[o + 3] = high;
    b[o + 4] = low >>> 24;
    b[o + 5] = low >>> 16;
    b[o + 6] = low >>> 8;
    b[o + 7] = low;
}

function fitsInt64(value: bigint): boolean {
    return BigInt.asIntN(64, value) === value;
}

function writeBigInt64(b: Uint8Array, o: number, value: bigint): void {
    const high = Number(value >> 32n);
    const low = Number(value & 0xffffffffn);
    b[o] = high >>> 24;
    b[o + 1] = high >>> 16;
    b[o + 2] = high >>> 8;
    b[o + 3] = high;
    b[o + 4] = low >>> 24;
    b[o + 5] = low >>> 16;
    b[o + 6] = low >>> 8;
    b[o + 7] = low;
}

/** Microseconds of a timestamp since 2000, NaN when it has to be sent as text. local: the wall clock of the date. */
function timestampMicros(date: Date, local: boolean): number {
    let time = date.getTime();
    if (local) {
        // before, a zone can have an offset with seconds which getTimezoneOffset doesn't report
        if (time < localDateExactFrom) return NaN;
        time -= date.getTimezoneOffset() * 60000;
    }
    const relative = time - postgresEpoch;
    // beyond this the product is not exact anymore
    return Math.abs(relative) < 7e13 ? relative * 1000 : NaN;
}

/** Days of a date since 2000, NaN when it has to be sent as text. */
function dateDays(date: Date, local: boolean): number {
    let time = date.getTime();
    if (local) {
        if (time < localDateExactFrom) return NaN;
        time -= date.getTimezoneOffset() * 60000;
    }
    return time === time ? Math.floor((time - postgresEpoch) / 86400000) : NaN;
}

function hexDigit(code: number): number {
    if (code >= 48 && code <= 57) return code - 48;
    if (code >= 97 && code <= 102) return code - 87;
    if (code >= 65 && code <= 70) return code - 55;
    return -1;
}

/** Writes the 16 bytes of a uuid with or without dashes, false when it is something else. */
function writeUuid(b: Uint8Array, o: number, value: string): boolean {
    if (value.length !== 32 && value.length !== 36) return false;
    let at = 0;
    for (let i = 0; i < 16; i++) {
        if (value.charCodeAt(at) === 45) at++;
        const high = hexDigit(value.charCodeAt(at));
        const low = hexDigit(value.charCodeAt(at + 1));
        if (high < 0 || low < 0) return false;
        b[o + i] = (high << 4) | low;
        at += 2;
    }
    return at === value.length;
}

const helpers = {
    writeUuid,
    writeFloat8,
    writeFloat4,
    fitsFloat4,
    writeInt64,
    fitsInt64,
    writeBigInt64,
    timestampMicros,
    dateDays,
};

// Object identifiers of the built-in types, see pg_type.dat
const bool = 16,
    bytea = 17,
    name = 19,
    int8 = 20,
    int2 = 21,
    int4 = 23,
    text = 25,
    oid = 26,
    json = 114,
    xml = 142;
const float4 = 700,
    float8 = 701,
    bpchar = 1042,
    varchar = 1043,
    date = 1082,
    timestamp = 1114,
    timestamptz = 1184;
const uuid = 2950,
    jsonb = 3802;

function int32Bytes(value: string, at: string): string {
    return `b[${at}] = ${value} >>> 24; b[${at} + 1] = ${value} >>> 16; b[${at} + 2] = ${value} >>> 8; b[${at} + 3] = ${value};`;
}

const nullValue = 'b[o] = 255; b[o + 1] = 255; b[o + 2] = 255; b[o + 3] = 255; o += 4;';

function length(size: number): string {
    return `b[o] = 0; b[o + 1] = 0; b[o + 2] = 0; b[o + 3] = ${size};`;
}

interface FixedParameter {
    /** The number of bytes with the length, and at most what a fallback to text needs for null. */
    size: number;
    /** The cases of the value that are written directly. */
    code(fallback: string): string;
}

function fixed(size: number, branches: [string, string][]): FixedParameter {
    return {
        size: size + 4,
        code(fallback: string) {
            return (
                branches
                    .map(
                        ([condition, write]) =>
                            `if (${condition}) { ${length(size)} ${write} o += ${4 + size}; } else `,
                    )
                    .join('') + fallback
            );
        },
    };
}

/** How a parameter type is sent in binary format, undefined for types that are sent as text. */
function fixedParameter(type: number, local: boolean): FixedParameter | undefined {
    switch (type) {
        case bool:
            return fixed(1, [[`typeof v === 'boolean'`, 'b[o + 4] = v ? 1 : 0;']]);
        case int2:
            return fixed(2, [[`typeof v === 'number' && (v << 16 >> 16) === v`, 'b[o + 4] = v >>> 8; b[o + 5] = v;']]);
        case int4:
            return fixed(4, [[`typeof v === 'number' && (v | 0) === v`, int32Bytes('v', 'o + 4')]]);
        case oid:
            return fixed(4, [[`typeof v === 'number' && (v >>> 0) === v`, int32Bytes('v', 'o + 4')]]);
        case int8:
            return fixed(8, [
                [`typeof v === 'number' && Number.isSafeInteger(v)`, 'writeInt64(b, o + 4, v);'],
                [`typeof v === 'bigint' && fitsInt64(v)`, 'writeBigInt64(b, o + 4, v);'],
            ]);
        case float4:
            return fixed(4, [[`typeof v === 'number' && fitsFloat4(v)`, 'writeFloat4(b, o + 4, v);']]);
        case float8:
            return fixed(8, [[`typeof v === 'number'`, 'writeFloat8(b, o + 4, v);']]);
        case timestamp:
            return fixed(8, [
                [`v instanceof Date && (m = timestampMicros(v, ${local})) === m`, 'writeInt64(b, o + 4, m);'],
            ]);
        case timestamptz:
            return fixed(8, [
                [`v instanceof Date && (m = timestampMicros(v, false)) === m`, 'writeInt64(b, o + 4, m);'],
            ]);
        case date:
            return fixed(4, [[`v instanceof Date && (m = dateDays(v, ${local})) === m`, int32Bytes('m', 'o + 4')]]);
    }
    return undefined;
}

/** The element type of the array types that are sent in binary format. */
function arrayElement(type: number): number | undefined {
    switch (type) {
        case 1000:
            return bool;
        case 1001:
            return bytea;
        case 1005:
            return int2;
        case 1007:
            return int4;
        case 1009:
            return text;
        case 1014:
            return bpchar;
        case 1015:
            return varchar;
        case 1016:
            return int8;
        case 1021:
            return float4;
        case 1022:
            return float8;
        case 1028:
            return oid;
        case 1115:
            return timestamp;
        case 1182:
            return date;
        case 1185:
            return timestamptz;
        case 2951:
            return uuid;
    }
    return undefined;
}

/**
 * An array in binary format, written directly into the buffer. An element that doesn't fit the type
 * rewinds and sends the whole array as text, like a parameter of a wrong type.
 */
function arrayParameterCode(element: number, local: boolean, fallback: string, refresh: string): string {
    const setNull = 'h = 1;';
    const mismatch = 'ok = false; break;';
    let elementCode: string;
    let reserve = 'e.ensure(24);';
    const fixedElement =
        element === uuid
            ? fixed(16, [[`typeof v === 'string' && writeUuid(b, o + 4, v)`, '']])
            : fixedParameter(element, local);
    if (fixedElement) {
        reserve = `e.ensure(24 + n * ${fixedElement.size});`;
        elementCode = fixedElement.code(`if (v === null || v === undefined) { ${nullValue} ${setNull} } else { ${mismatch} }`);
    } else {
        const write = element === bytea ? 'e.writeBinaryParameter(v);' : 'e.writeStringParameter(v);';
        const check = element === bytea ? 'ArrayBuffer.isView(v)' : `typeof v === 'string'`;
        elementCode = `
        if (${check}) { e.position = o; ${write} b = e.buffer; o = e.position; }
        else if (v === null || v === undefined) { e.position = o; e.ensure(4); b = e.buffer; o = e.position; ${nullValue} ${setNull} }
        else { ${mismatch} }`;
    }
    return `
    if (Array.isArray(v) && v.length) {
        a = v; n = a.length; h = 0; ok = true;
        e.position = o; ${reserve} b = e.buffer; o = e.position; s = o;
        o += 4;
        b[o] = 0; b[o + 1] = 0; b[o + 2] = 0; b[o + 3] = 1;
        f = o + 4;
        ${int32Bytes(String(element), 'o + 8')}
        ${int32Bytes('n', 'o + 12')}
        b[o + 16] = 0; b[o + 17] = 0; b[o + 18] = 0; b[o + 19] = 1;
        o += 20;
        for (j = 0; j < n; j++) {
            v = a[j];
            ${elementCode}
        }
        if (ok) {
            ${int32Bytes('o - s - 4', 's')}
            b[f] = 0; b[f + 1] = 0; b[f + 2] = 0; b[f + 3] = h;
            e.position = o; ${refresh}
        } else {
            o = s; v = a;
            ${fallback}
        }
    } else ${fallback}
    `;
}

function isVariableString(type: number): boolean {
    switch (type) {
        case text:
        case varchar:
        case bpchar:
        case name:
        case uuid:
        case json:
        case jsonb:
        case xml:
            return true;
    }
    return false;
}

interface CompiledParameters {
    write: ParameterWriter;
    /** Which parameters are in binary format. */
    binary: boolean[];
    /** Bytes that are enough for all parameters with a fixed size. */
    fixedSize: number;
}

function compileParameters(types: number[], local: boolean): CompiledParameters {
    const fixedParameters = types.map(type => fixedParameter(type, local));
    const sizes = fixedParameters.map(v => (v ? v.size : 4));
    const binary = types.map((type, i) => !!fixedParameters[i] || type === bytea || arrayElement(type) !== undefined);

    // the bytes still needed by the parameters after a position, in case one before them grew the buffer
    const remaining = new Array(types.length + 1).fill(0);
    for (let i = types.length - 1; i >= 0; i--) remaining[i] = remaining[i + 1] + sizes[i];

    let code = 'var b = e.buffer, o = e.position, v, m, a, n, h, s, f, j, ok;\n';
    const context = new CompilerContext();
    context.set(helpers);
    for (let i = 0; i < types.length; i++) {
        const refresh = `e.ensure(${remaining[i + 1]}); b = e.buffer; o = e.position;`;
        const fallback = `if (v === null || v === undefined) { ${nullValue} } else { e.position = o; e.writeFallbackParameter(v, formats + ${i * 2}); ${refresh} }`;
        const parameter = fixedParameters[i];
        code += `v = p[${i}];\n`;
        if (parameter) {
            code += parameter.code(fallback) + '\n';
        } else if (arrayElement(types[i]) !== undefined) {
            code += arrayParameterCode(arrayElement(types[i])!, local, fallback, refresh) + '\n';
        } else if (isVariableString(types[i])) {
            code += `if (typeof v === 'string') { e.position = o; e.writeStringParameter(v); ${refresh} } else ${fallback}\n`;
        } else if (types[i] === bytea) {
            code += `if (ArrayBuffer.isView(v)) { e.position = o; e.writeBinaryParameter(v); ${refresh} } else ${fallback}\n`;
        } else {
            code += fallback + '\n';
        }
    }
    code += 'e.position = o;';
    return { write: context.build(code, 'e', 'p', 'formats'), binary, fixedSize: remaining[0] };
}

// The code only depends on the types, statements with the same parameters share it.
const compiled = new LruCache<CompiledParameters>(1024);

function getCompiledParameters(types: number[], local: boolean): CompiledParameters {
    const key = (local ? 'l' : 'u') + types.join(',');
    let parameters = compiled.get(key);
    if (parameters === undefined) {
        parameters = compileParameters(types, local);
        compiled.set(key, parameters);
    }
    return parameters;
}

/**
 * Bind, Execute and Sync of a prepared statement whose parameter types are known.
 * The bytes around the parameter values are built once.
 */
export class CompiledBind {
    constructor(
        readonly count: number,
        /** The message up to and including the parameter count. */
        private readonly head: Uint8Array,
        /** Where in head the format code of the first parameter is, its low byte. */
        private readonly formatsOffset: number,
        /** The result formats, then Execute and Sync. */
        private readonly tail: Uint8Array,
        /** The bytes of tail that belong to the Bind message. */
        private readonly bindTailSize: number,
        private readonly parameters: CompiledParameters,
    ) {}

    encode(e: PostgresEncoder, params: any[]): void {
        const head = this.head;
        const tail = this.tail;
        e.ensure(head.length + this.parameters.fixedSize);
        const start = e.position;
        let b = e.buffer;
        for (let i = 0; i < head.length; i++) b[start + i] = head[i];
        e.position = start + head.length;

        this.parameters.write(e, params, start + this.formatsOffset);

        e.ensure(tail.length);
        b = e.buffer;
        const values = e.position;
        for (let i = 0; i < tail.length; i++) b[values + i] = tail[i];
        e.position = values + tail.length;

        const size = values + this.bindTailSize - start - 1;
        b[start + 1] = size >>> 24;
        b[start + 2] = size >>> 16;
        b[start + 3] = size >>> 8;
        b[start + 4] = size;
    }
}

const executeAndSync = new Uint8Array([69, 0, 0, 0, 9, 0, 0, 0, 0, 0, 83, 0, 0, 0, 4]);

export function compileBind(
    name: Uint8Array,
    types: number[],
    resultFormats: Uint8Array,
    utcDates: boolean,
): CompiledBind {
    const parameters = getCompiledParameters(types, !utcDates);
    const count = types.length;

    const head = new Uint8Array(1 + 4 + 1 + name.length + 2 + count * 2 + 2);
    head[0] = 66;
    let o = 6;
    head.set(name, o);
    o += name.length;
    head[o++] = count >>> 8;
    head[o++] = count;
    const formatsOffset = o + 1;
    for (let i = 0; i < count; i++) {
        head[o + 1] = parameters.binary[i] ? 1 : 0;
        o += 2;
    }
    head[o++] = count >>> 8;
    head[o] = count;

    const tail = new Uint8Array(resultFormats.length + executeAndSync.length);
    tail.set(resultFormats);
    tail.set(executeAndSync, resultFormats.length);

    return new CompiledBind(count, head, formatsOffset, tail, resultFormats.length, parameters);
}
