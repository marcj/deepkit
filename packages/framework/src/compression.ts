/*
 * Deepkit Framework
 * Copyright (C) 2021 Deepkit UG, Marc J. Schmidt
 *
 * This program is free software: you can redistribute it and/or modify
 * it under the terms of the MIT License.
 *
 * You should have received a copy of the MIT License along with this program.
 */
import { IncomingMessage, OutgoingHttpHeaders, ServerResponse } from 'http';
import { Transform } from 'stream';
import { ZlibOptions, constants, createBrotliCompress, createDeflate, createGzip } from 'zlib';

// MIME types with known good compression besides text/*, *+json, *+xml, *+text
const compressibleTypes = new Set([
    'application/dart',
    'application/ecmascript',
    'application/javascript',
    'application/json',
    'application/octet-stream',
    'application/postscript',
    'application/raml+yaml',
    'application/rtf',
    'application/tar',
    'application/toml',
    'application/vnd.dart',
    'application/vnd.ms-fontobject',
    'application/vnd.ms-opentype',
    'application/wasm',
    'application/x-httpd-php',
    'application/x-javascript',
    'application/x-ns-proxy-autoconfig',
    'application/x-sh',
    'application/x-tar',
    'application/x-virtualbox-hdd',
    'application/x-virtualbox-ova',
    'application/x-virtualbox-ovf',
    'application/x-virtualbox-vbox',
    'application/x-virtualbox-vdi',
    'application/x-virtualbox-vhd',
    'application/x-virtualbox-vmdk',
    'application/x-www-form-urlencoded',
    'application/xml',
    'application/xml-dtd',
    'font/otf',
    'font/ttf',
    'image/bmp',
    'image/vnd.adobe.photoshop',
    'image/vnd.microsoft.icon',
    'image/vnd.ms-dds',
    'image/x-icon',
    'image/x-ms-bmp',
    'message/rfc822',
    'model/gltf-binary',
    'x-shader/x-fragment',
    'x-shader/x-vertex',
]);

export function isCompressible(contentType: string): boolean {
    const type = /^\s*([^;\s]*)(?:;|\s|$)/.exec(contentType)?.[1].toLowerCase() || '';
    return compressibleTypes.has(type) || /^text\/|\+(?:json|text|xml)$/.test(type);
}

interface EncodingSpec {
    encoding: string;
    q: number;
    i: number;
}

function parseAcceptEncoding(header: string): EncodingSpec[] {
    const accepts: EncodingSpec[] = [];
    let hasIdentity = false;
    let minQuality = 1;
    const parts = header.split(',');

    for (let i = 0; i < parts.length; i++) {
        const match = /^\s*([^\s;]+)\s*(?:;(.*))?$/.exec(parts[i].trim());
        if (!match) continue;

        let q = 1;
        if (match[2]) {
            for (const param of match[2].split(';')) {
                const [name, value] = param.trim().split('=');
                if (name === 'q') {
                    q = parseFloat(value);
                    break;
                }
            }
        }

        const encoding = match[1];
        accepts.push({ encoding, q, i });
        hasIdentity = hasIdentity || encoding.toLowerCase() === 'identity' || encoding === '*';
        minQuality = Math.min(minQuality, q || 1);
    }

    // identity is acceptable with the lowest quality if not mentioned
    if (!hasIdentity) accepts.push({ encoding: 'identity', q: minQuality, i: parts.length });

    return accepts;
}

/**
 * Picks the best encoding of `available` for the given Accept-Encoding header.
 * On equal quality, encodings in `preferred` win (in their order), otherwise the order of the header.
 */
export function negotiateEncoding(header: string, available: string[], preferred: string[]): string | undefined {
    const accepts = parseAcceptEncoding(header);

    const priorities = available.map(encoding => {
        let priority = { encoding, o: -1, q: 0, s: 0 };
        for (const accept of accepts) {
            const s = accept.encoding.toLowerCase() === encoding.toLowerCase() ? 1 : accept.encoding === '*' ? 0 : -1;
            if (s === -1) continue;
            const spec = { encoding, o: accept.i, q: accept.q, s };
            if ((priority.s - spec.s || priority.q - spec.q || priority.o - spec.o) < 0) priority = spec;
        }
        return priority;
    });

    const sorted = priorities
        .filter(v => v.q > 0)
        .sort((a, b) => {
            if (a.q !== b.q) return b.q - a.q;
            const aPreferred = preferred.indexOf(a.encoding);
            const bPreferred = preferred.indexOf(b.encoding);
            if (aPreferred === -1 && bPreferred === -1) return b.s - a.s || a.o - b.o;
            if (aPreferred !== -1 && bPreferred !== -1) return aPreferred - bPreferred;
            return aPreferred === -1 ? 1 : -1;
        });

    return sorted[0]?.encoding;
}

function addVary(response: ServerResponse, field: string) {
    const current = response.getHeader('Vary') || '';
    const header = Array.isArray(current) ? current.join(', ') : String(current);
    if (header === '*') return;
    const fields = header
        .toLowerCase()
        .split(',')
        .map(v => v.trim());
    if (fields.includes('*')) {
        response.setHeader('Vary', '*');
    } else if (!fields.includes(field.toLowerCase())) {
        response.setHeader('Vary', header ? header + ', ' + field : field);
    }
}

/**
 * Calls `listener` right before the response headers are written.
 */
function onHeaders(response: ServerResponse, listener: () => void) {
    const writeHead = response.writeHead;
    let fired = false;

    response.writeHead = function (this: ServerResponse, statusCode: number, ...rest: any[]) {
        const headerIndex = typeof rest[0] === 'string' ? 1 : 0;
        const headers: OutgoingHttpHeaders | string[] | [string, string][] | undefined = rest[headerIndex];
        this.statusCode = statusCode;

        // headers passed to writeHead need to be visible to the listener
        if (Array.isArray(headers)) {
            if (Array.isArray(headers[0])) {
                for (const [name, value] of headers as [string, string][]) this.setHeader(name, value);
            } else {
                for (let i = 0; i < headers.length; i += 2)
                    this.setHeader(headers[i] as string, headers[i + 1] as string);
            }
        } else if (headers) {
            for (const [name, value] of Object.entries(headers)) if (name) this.setHeader(name, value as any);
        }

        const args: any[] = [statusCode, ...rest.slice(0, headerIndex)];
        if (!fired) {
            fired = true;
            listener.call(this);
            // pass along an updated status code
            if (this.statusCode !== statusCode) args.splice(0, args.length, this.statusCode);
        }
        return writeHead.apply(this, args as any);
    } as any;
}

export interface CompressionOptions extends ZlibOptions {
    /**
     * Responses smaller than this (in bytes, if known) are not compressed.
     *
     * @default 1024
     */
    threshold?: number;
}

/**
 * Compresses the response with br, gzip, or deflate (negotiated via Accept-Encoding), if
 * - the Content-Type is compressible
 * - it has no `Cache-Control: no-transform`
 * - it's larger than threshold (if the size is known)
 * - it's not already encoded (Content-Encoding)
 * - it's not a HEAD request or a 204/304 response
 *
 * Adds `Vary: Accept-Encoding` to compressible responses.
 *
 * Must be called before anything is written to the response.
 * `options` are passed to zlib's gzip/deflate, brotli uses quality 4.
 */
export function compressResponse(request: IncomingMessage, response: ServerResponse, options: CompressionOptions = {}) {
    const { threshold = 1024, ...zlibOptions } = options;
    const write = response.write as (this: ServerResponse, ...args: any[]) => boolean;
    const end = response.end as (this: ServerResponse, ...args: any[]) => ServerResponse;
    const on = response.on;

    let ended = false;
    let length: number | undefined;
    let stream: Transform | undefined;
    let listeners: [string, (...args: any[]) => void][] | undefined = [];

    const res = response as any;

    res.flush = function () {
        if (stream) (stream as any).flush();
    };

    res.write = function (this: ServerResponse, chunk: any, encoding?: any) {
        if (ended) return false;
        if (!this.headersSent) this.writeHead(this.statusCode);
        return stream
            ? stream.write(toBuffer(chunk, 'function' === typeof encoding ? undefined : encoding))
            : write.apply(this, arguments as any);
    };

    res.end = function (this: ServerResponse, chunk?: any, encoding?: any) {
        if (ended) return this;
        const data = 'function' === typeof chunk ? undefined : chunk;
        const dataEncoding = 'function' === typeof encoding ? undefined : encoding;

        if (!this.headersSent) {
            if (!this.getHeader('Content-Length')) length = chunkLength(data, dataEncoding);
            this.writeHead(this.statusCode);
        }

        if (!stream) return end.apply(this, arguments as any);

        ended = true;
        if (data) {
            stream.end(toBuffer(data, dataEncoding));
        } else {
            stream.end();
        }
        return this;
    };

    // drain events come from the compression stream when compressing
    res.on = function (this: ServerResponse, type: string, listener: (...args: any[]) => void) {
        if (!listeners || type !== 'drain') return on.call(this, type, listener);
        if (stream) return stream.on(type, listener);
        listeners.push([type, listener]);
        return this;
    };

    function noCompression() {
        for (const [type, listener] of listeners!) on.call(response, type, listener);
        listeners = undefined;
    }

    onHeaders(response, function () {
        const contentType = response.getHeader('Content-Type');
        if (contentType === undefined || !isCompressible(String(contentType))) return noCompression();

        const cacheControl = response.getHeader('Cache-Control');
        if (cacheControl && /(?:^|,)\s*?no-transform\s*?(?:,|$)/.test(String(cacheControl))) return noCompression();

        addVary(response, 'Accept-Encoding');

        if (Number(response.getHeader('Content-Length')) < threshold || (length !== undefined && length < threshold))
            return noCompression();
        if ((response.getHeader('Content-Encoding') || 'identity') !== 'identity') return noCompression();
        if (request.method === 'HEAD') return noCompression();
        if (response.statusCode === 204 || response.statusCode === 304) return noCompression();

        const acceptEncoding = request.headers['accept-encoding'];
        if (!acceptEncoding) return noCompression();
        const encoding = negotiateEncoding(acceptEncoding, ['br', 'gzip', 'deflate', 'identity'], ['br', 'gzip']);
        if (!encoding || encoding === 'identity') return noCompression();

        stream =
            encoding === 'gzip'
                ? createGzip(zlibOptions)
                : encoding === 'br'
                  ? createBrotliCompress({ params: { [constants.BROTLI_PARAM_QUALITY]: 4 } })
                  : createDeflate(zlibOptions);

        for (const [type, listener] of listeners!) stream.on(type, listener);

        response.setHeader('Content-Encoding', encoding);
        response.removeHeader('Content-Length');

        stream.on('data', (chunk: Buffer) => {
            if (write.call(response, chunk) === false) stream!.pause();
        });
        stream.on('end', () => {
            end.call(response);
        });
        on.call(response, 'drain', () => {
            stream!.resume();
        });
    });
}

function chunkLength(chunk: any, encoding?: BufferEncoding): number {
    if (!chunk) return 0;
    return 'string' === typeof chunk ? Buffer.byteLength(chunk, encoding) : chunk.length;
}

function toBuffer(chunk: any, encoding?: BufferEncoding): Uint8Array {
    return 'string' === typeof chunk ? Buffer.from(chunk, encoding) : chunk;
}
