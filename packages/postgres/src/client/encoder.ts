import { PostgresError } from './errors.js';
import { localDateExactFrom } from './row-decoder.js';

const initialCapacity = 16 * 1024;
const maxRetainedCapacity = 16 * 1024 * 1024;

const emptyName = new Uint8Array(1);
/** No result format codes in a Bind message: everything comes as text. */
export const textResultFormats = new Uint8Array(2);

function arrayToText(value: any[], asUTC: boolean): string {
    let result = '{';
    for (let i = 0; i < value.length; i++) {
        if (i > 0) result += ',';
        const item = value[i];
        if (item === null || item === undefined) {
            result += 'NULL';
        } else if (Array.isArray(item)) {
            result += arrayToText(item, asUTC);
        } else if (ArrayBuffer.isView(item)) {
            result += '\\\\x' + Buffer.from(item.buffer, item.byteOffset, item.byteLength).toString('hex');
        } else {
            result += '"' + scalarToText(item, asUTC).replace(/\\/g, '\\\\').replace(/"/g, '\\"') + '"';
        }
    }
    return result + '}';
}

function pad(value: number, size: number): string {
    return String(value).padStart(size, '0');
}

/**
 * Seconds east of UTC of the local wall clock of a date. Before 1972 a zone can have an offset with seconds
 * (e.g. local mean time, Berlin +00:53:28 before 1893), which getTimezoneOffset() rounds to minutes.
 */
export function localOffsetSeconds(date: Date): number {
    const time = date.getTime();
    if (time >= localDateExactFrom) return -date.getTimezoneOffset() * 60;
    const wallClock = new Date(0);
    wallClock.setUTCFullYear(date.getFullYear(), date.getMonth(), date.getDate());
    wallClock.setUTCHours(date.getHours(), date.getMinutes(), date.getSeconds(), date.getMilliseconds());
    return Math.round((wallClock.getTime() - time) / 1000);
}

function offsetToText(seconds: number): string {
    const absolute = Math.abs(seconds);
    const text = (seconds < 0 ? '-' : '+') + pad(Math.floor(absolute / 3600), 2) + ':' + pad(Math.floor(absolute / 60) % 60, 2);
    return absolute % 60 ? text + ':' + pad(absolute % 60, 2) : text;
}

/** Same as the fast path of writeDate. */
function dateToText(date: Date, asUTC: boolean): string {
    if (isNaN(date.getTime())) return 'Invalid Date';
    let year = asUTC ? date.getUTCFullYear() : date.getFullYear();
    const bc = year < 1;
    if (bc) year = 1 - year;
    let text =
        pad(year, 4) +
        '-' +
        pad((asUTC ? date.getUTCMonth() : date.getMonth()) + 1, 2) +
        '-' +
        pad(asUTC ? date.getUTCDate() : date.getDate(), 2) +
        'T' +
        pad(asUTC ? date.getUTCHours() : date.getHours(), 2) +
        ':' +
        pad(asUTC ? date.getUTCMinutes() : date.getMinutes(), 2) +
        ':' +
        pad(asUTC ? date.getUTCSeconds() : date.getSeconds(), 2) +
        '.' +
        pad(asUTC ? date.getUTCMilliseconds() : date.getMilliseconds(), 3);
    text += offsetToText(asUTC ? 0 : localOffsetSeconds(date));
    return bc ? text + ' BC' : text;
}

function scalarToText(value: any, asUTC: boolean): string {
    if (value instanceof Date) return dateToText(value, asUTC);
    if (value === 0 && 1 / value < 0) return '-0';
    if ('object' === typeof value) return objectToText(value, asUTC);
    return String(value);
}

function objectToText(value: any, asUTC: boolean): string {
    if ('function' === typeof value.toPostgres) {
        const converted = value.toPostgres((v: any) => scalarToText(v, asUTC));
        if ('object' !== typeof converted) return String(converted);
        if (converted === null) return 'null';
        return scalarToText(converted, asUTC);
    }
    return JSON.stringify(value);
}

/**
 * Writes the messages of the frontend protocol into one reused buffer.
 *
 * Without knowing the types of the parameters, as on the first run of a statement, they are sent as text, except
 * binary values. The input functions of the server accept the text of every matching type.
 * A prepared statement's Bind is compiled once its types are known, see bind-encoder.ts.
 */
export class PostgresEncoder {
    /** Used directly by the writers compiled per statement. */
    buffer: Buffer = Buffer.allocUnsafeSlow(initialCapacity);
    position: number = 0;

    constructor(public parseInputDatesAsUTC: boolean = false) {}

    reset(): void {
        this.position = 0;
    }

    /** The memory of the message: 0 to size has been written. Only valid until the next write unless replaceBuffer is called. */
    get memory(): Uint8Array {
        return this.buffer;
    }

    get size(): number {
        return this.position;
    }

    /** node holds on to the memory of the last write, so it can't be reused. */
    replaceBuffer(): void {
        this.buffer = Buffer.allocUnsafeSlow(Math.min(this.buffer.length, maxRetainedCapacity));
        this.position = 0;
    }

    releaseIfLarge(): void {
        if (this.buffer.length > maxRetainedCapacity) this.buffer = Buffer.allocUnsafeSlow(initialCapacity);
    }

    ensure(size: number): void {
        const needed = this.position + size;
        if (needed <= this.buffer.length) return;
        let capacity = this.buffer.length * 2;
        while (capacity < needed) capacity *= 2;
        const buffer = Buffer.allocUnsafeSlow(capacity);
        this.buffer.copy(buffer, 0, 0, this.position);
        this.buffer = buffer;
    }

    protected writeBytes(bytes: Uint8Array): void {
        this.ensure(bytes.byteLength);
        this.buffer.set(bytes, this.position);
        this.position += bytes.byteLength;
    }

    protected writeInt32(value: number): void {
        this.ensure(4);
        const b = this.buffer;
        const p = this.position;
        b[p] = value >>> 24;
        b[p + 1] = value >>> 16;
        b[p + 2] = value >>> 8;
        b[p + 3] = value;
        this.position = p + 4;
    }

    protected writeInt16(value: number): void {
        this.ensure(2);
        const b = this.buffer;
        b[this.position] = value >>> 8;
        b[this.position + 1] = value;
        this.position += 2;
    }

    protected writeByte(value: number): void {
        this.ensure(1);
        this.buffer[this.position++] = value;
    }

    /** Writes the string without length or terminator and returns the number of bytes. */
    protected writeUTF8(value: string): number {
        const length = value.length;
        // three times the length would allocate far too much for large strings
        this.ensure(length < 1048576 ? length * 3 : Buffer.byteLength(value));
        const b = this.buffer;
        const start = this.position;
        if (length < 64) {
            let p = start;
            for (let i = 0; i < length; i++) {
                const c = value.charCodeAt(i);
                if (c >= 128) {
                    const written = b.write(value, start);
                    this.position = start + written;
                    return written;
                }
                b[p++] = c;
            }
            this.position = p;
            return length;
        }
        const written = b.write(value, start);
        this.position = start + written;
        return written;
    }

    protected writeCString(value: string): void {
        this.writeUTF8(value);
        this.writeByte(0);
    }

    /** Patches the size of the message whose first byte after the type is at sizeAt. */
    protected finishMessage(sizeAt: number): void {
        const size = this.position - sizeAt;
        const b = this.buffer;
        b[sizeAt] = size >>> 24;
        b[sizeAt + 1] = size >>> 16;
        b[sizeAt + 2] = size >>> 8;
        b[sizeAt + 3] = size;
    }

    protected writeDigits(value: number, minLength: number): void {
        // large enough for every safe integer
        this.ensure(20);
        const b = this.buffer;
        let digits = 1;
        for (let v = value; v >= 10; v = Math.floor(v / 10)) digits++;
        if (digits < minLength) digits = minLength;
        let p = this.position + digits;
        this.position = p;
        for (let i = 0; i < digits; i++) {
            const rest = Math.floor(value / 10);
            b[--p] = 48 + value - rest * 10;
            value = rest;
        }
    }

    /** dateToText without creating strings: a date is often part of every row that is written. */
    protected writeDate(date: Date): void {
        const asUTC = this.parseInputDatesAsUTC;
        if (isNaN(date.getTime())) {
            this.writeUTF8('Invalid Date');
            return;
        }
        let year = asUTC ? date.getUTCFullYear() : date.getFullYear();
        const bc = year < 1;
        if (bc) year = 1 - year;
        this.writeDigits(year, 4);
        this.writeByte(45);
        this.writeDigits((asUTC ? date.getUTCMonth() : date.getMonth()) + 1, 2);
        this.writeByte(45);
        this.writeDigits(asUTC ? date.getUTCDate() : date.getDate(), 2);
        this.writeByte(84);
        this.writeDigits(asUTC ? date.getUTCHours() : date.getHours(), 2);
        this.writeByte(58);
        this.writeDigits(asUTC ? date.getUTCMinutes() : date.getMinutes(), 2);
        this.writeByte(58);
        this.writeDigits(asUTC ? date.getUTCSeconds() : date.getSeconds(), 2);
        this.writeByte(46);
        this.writeDigits(asUTC ? date.getUTCMilliseconds() : date.getMilliseconds(), 3);
        const offset = asUTC ? 0 : localOffsetSeconds(date);
        const absolute = Math.abs(offset);
        this.writeByte(offset < 0 ? 45 : 43);
        this.writeDigits(Math.floor(absolute / 3600), 2);
        this.writeByte(58);
        this.writeDigits(Math.floor(absolute / 60) % 60, 2);
        if (absolute % 60) {
            this.writeByte(58);
            this.writeDigits(absolute % 60, 2);
        }
        if (bc) this.writeUTF8(' BC');
    }

    /** A value of a Bind message: length, then the bytes in text format. */
    protected writeParameter(value: any): void {
        if (value === null || value === undefined) {
            this.writeInt32(-1);
            return;
        }
        const sizeAt = this.position;
        this.ensure(4);
        this.position += 4;
        switch (typeof value) {
            case 'string':
                this.writeUTF8(value);
                break;
            case 'number':
                if (Number.isSafeInteger(value)) {
                    // -0 too, a float column keeps its sign
                    if (value < 0 || (value === 0 && 1 / value < 0)) this.writeByte(45);
                    this.writeDigits(value < 0 ? -value : value, 1);
                } else {
                    this.writeUTF8('' + value);
                }
                break;
            case 'boolean':
                this.writeUTF8(value ? 'true' : 'false');
                break;
            case 'bigint':
                this.writeUTF8(value.toString());
                break;
            case 'object':
                if (value instanceof Date) {
                    this.writeDate(value);
                } else if (ArrayBuffer.isView(value)) {
                    this.writeBytes(new Uint8Array(value.buffer, value.byteOffset, value.byteLength));
                } else if (value instanceof ArrayBuffer) {
                    this.writeBytes(new Uint8Array(value));
                } else if (Array.isArray(value)) {
                    this.writeUTF8(arrayToText(value, this.parseInputDatesAsUTC));
                } else {
                    this.writeUTF8(objectToText(value, this.parseInputDatesAsUTC));
                }
                break;
            default:
                this.writeUTF8(String(value));
        }
        const end = this.position;
        const b = this.buffer;
        const size = end - sizeAt - 4;
        b[sizeAt] = size >>> 24;
        b[sizeAt + 1] = size >>> 16;
        b[sizeAt + 2] = size >>> 8;
        b[sizeAt + 3] = size;
    }

    /** A string parameter: length and UTF-8 bytes. */
    writeStringParameter(value: string): void {
        const sizeAt = this.position;
        this.ensure(4);
        this.position += 4;
        const size = this.writeUTF8(value);
        const b = this.buffer;
        b[sizeAt] = size >>> 24;
        b[sizeAt + 1] = size >>> 16;
        b[sizeAt + 2] = size >>> 8;
        b[sizeAt + 3] = size;
    }

    /** A parameter that is sent as it is. */
    writeBinaryParameter(value: ArrayBufferView): void {
        this.writeInt32(value.byteLength);
        this.writeBytes(new Uint8Array(value.buffer, value.byteOffset, value.byteLength));
    }

    /**
     * For a compiled Bind, when the value doesn't fit the type of its parameter. Writes it as the text the server
     * also got without knowing the type, and changes the format code of the parameter accordingly.
     */
    writeFallbackParameter(value: any, formatOffset: number): void {
        this.buffer[formatOffset] = ArrayBuffer.isView(value) || value instanceof ArrayBuffer ? 1 : 0;
        this.writeParameter(value);
    }

    writeQuery(sql: string): void {
        this.writeByte(81);
        const sizeAt = this.position;
        this.ensure(4);
        this.position += 4;
        this.writeCString(sql);
        this.finishMessage(sizeAt);
    }

    writeParse(name: Uint8Array, sql: string): void {
        this.writeByte(80);
        const sizeAt = this.position;
        this.ensure(4);
        this.position += 4;
        this.writeBytes(name);
        this.writeCString(sql);
        this.writeInt16(0);
        this.finishMessage(sizeAt);
    }

    writeBind(name: Uint8Array, params: any[] | undefined, resultFormats: Uint8Array): void {
        const count = params ? params.length : 0;
        if (count > 65535) throw new PostgresError(`Too many query parameters: ${count}, the maximum is 65535`);
        this.writeByte(66);
        const sizeAt = this.position;
        this.ensure(5);
        this.position += 4;
        this.buffer[this.position++] = 0; // unnamed portal
        this.writeBytes(name);

        // Binary values are sent as they are, instead of twice their size as hex.
        let binary = false;
        for (let i = 0; i < count; i++) {
            const value = params![i];
            if (
                typeof value === 'object' &&
                value !== null &&
                (ArrayBuffer.isView(value) || value instanceof ArrayBuffer)
            ) {
                binary = true;
                break;
            }
        }
        if (binary) {
            this.writeInt16(count);
            for (let i = 0; i < count; i++) {
                const value = params![i];
                this.writeInt16(
                    typeof value === 'object' &&
                        value !== null &&
                        (ArrayBuffer.isView(value) || value instanceof ArrayBuffer)
                        ? 1
                        : 0,
                );
            }
        } else {
            this.writeInt16(0);
        }

        this.writeInt16(count);
        for (let i = 0; i < count; i++) this.writeParameter(params![i]);
        this.writeBytes(resultFormats);
        this.finishMessage(sizeAt);
    }

    /** Describe of a statement, answered with ParameterDescription and then RowDescription or NoData. */
    writeDescribeStatement(name: Uint8Array): void {
        this.writeByte(68);
        const sizeAt = this.position;
        this.ensure(5);
        this.position += 4;
        this.buffer[this.position++] = 83;
        this.writeBytes(name);
        this.finishMessage(sizeAt);
    }

    /** Describe of the unnamed portal, answered with RowDescription or NoData. */
    writeDescribePortal(): void {
        this.ensure(7);
        const b = this.buffer;
        const p = this.position;
        b[p] = 68;
        b[p + 1] = 0;
        b[p + 2] = 0;
        b[p + 3] = 0;
        b[p + 4] = 6;
        b[p + 5] = 80;
        b[p + 6] = 0;
        this.position = p + 7;
    }

    /** Execute of the unnamed portal, all rows. */
    writeExecute(): void {
        this.ensure(10);
        const b = this.buffer;
        const p = this.position;
        b[p] = 69;
        b[p + 1] = 0;
        b[p + 2] = 0;
        b[p + 3] = 0;
        b[p + 4] = 9;
        b[p + 5] = 0;
        b[p + 6] = 0;
        b[p + 7] = 0;
        b[p + 8] = 0;
        b[p + 9] = 0;
        this.position = p + 10;
    }

    writeSync(): void {
        this.ensure(5);
        const b = this.buffer;
        const p = this.position;
        b[p] = 83;
        b[p + 1] = 0;
        b[p + 2] = 0;
        b[p + 3] = 0;
        b[p + 4] = 4;
        this.position = p + 5;
    }

    /** Close of a named statement, which the server answers with CloseComplete, also if the statement does not exist. */
    writeCloseStatement(name: Uint8Array): void {
        this.writeByte(67);
        const sizeAt = this.position;
        this.ensure(5);
        this.position += 4;
        this.buffer[this.position++] = 83;
        this.writeBytes(name);
        this.finishMessage(sizeAt);
    }

    writeStartup(parameters: { [name: string]: string }): void {
        const sizeAt = this.position;
        this.ensure(8);
        this.position += 4;
        this.writeInt32(196608);
        for (const name in parameters) {
            this.writeCString(name);
            this.writeCString(parameters[name]);
        }
        this.writeByte(0);
        this.finishMessage(sizeAt);
    }

    writePasswordMessage(password: string): void {
        this.writeByte(112);
        const sizeAt = this.position;
        this.ensure(4);
        this.position += 4;
        this.writeCString(password);
        this.finishMessage(sizeAt);
    }

    writeSaslInitialResponse(mechanism: string, response: string): void {
        this.writeByte(112);
        const sizeAt = this.position;
        this.ensure(4);
        this.position += 4;
        this.writeCString(mechanism);
        const lengthAt = this.position;
        this.ensure(4);
        this.position += 4;
        const written = this.writeUTF8(response);
        const b = this.buffer;
        b[lengthAt] = written >>> 24;
        b[lengthAt + 1] = written >>> 16;
        b[lengthAt + 2] = written >>> 8;
        b[lengthAt + 3] = written;
        this.finishMessage(sizeAt);
    }

    writeSaslResponse(response: string): void {
        this.writeByte(112);
        const sizeAt = this.position;
        this.ensure(4);
        this.position += 4;
        this.writeUTF8(response);
        this.finishMessage(sizeAt);
    }

    writeCopyData(data: string | Uint8Array): void {
        this.writeByte(100);
        const sizeAt = this.position;
        this.ensure(4);
        this.position += 4;
        if ('string' === typeof data) this.writeUTF8(data);
        else this.writeBytes(data);
        this.finishMessage(sizeAt);
    }

    writeCopyDone(): void {
        this.writeByte(99);
        const sizeAt = this.position;
        this.ensure(4);
        this.position += 4;
        this.finishMessage(sizeAt);
    }

    writeCopyFail(message: string): void {
        this.writeByte(102);
        const sizeAt = this.position;
        this.ensure(4);
        this.position += 4;
        this.writeCString(message);
        this.finishMessage(sizeAt);
    }

    writeTerminate(): void {
        this.writeByte(88);
        const sizeAt = this.position;
        this.ensure(4);
        this.position += 4;
        this.finishMessage(sizeAt);
    }

    writeSSLRequest(): void {
        this.writeInt32(8);
        this.writeInt32(80877103);
    }

    writeCancelRequest(pid: number, secret: number): void {
        this.writeInt32(16);
        this.writeInt32(80877102);
        this.writeInt32(pid);
        this.writeInt32(secret);
    }
}

export { emptyName };
