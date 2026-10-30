import { afterAll, beforeAll, expect, test } from '@jest/globals';
import http, { IncomingMessage, ServerResponse } from 'http';
import { AddressInfo } from 'net';
import { Readable } from 'stream';
import { brotliDecompressSync, gunzipSync, inflateSync } from 'zlib';

import { compressResponse, isCompressible, negotiateEncoding } from '../src/compression.js';

const big = 'hello world '.repeat(500);

const handlers: { [name: string]: (request: IncomingMessage, response: ServerResponse) => void } = {
    json(request, response) {
        response.setHeader('Content-Type', 'application/json; charset=utf-8');
        response.end(big);
    },
    small(request, response) {
        response.setHeader('Content-Type', 'text/plain');
        response.end('tiny');
    },
    smallContentLength(request, response) {
        response.setHeader('Content-Type', 'text/plain');
        response.setHeader('Content-Length', 4);
        response.end('tiny');
    },
    png(request, response) {
        response.setHeader('Content-Type', 'image/png');
        response.end(big);
    },
    noType(request, response) {
        response.end(big);
    },
    noTransform(request, response) {
        response.setHeader('Content-Type', 'text/html');
        response.setHeader('Cache-Control', 'public, no-transform');
        response.end(big);
    },
    encoded(request, response) {
        response.setHeader('Content-Type', 'text/html');
        response.setHeader('Content-Encoding', 'custom');
        response.end(big);
    },
    writeHead(request, response) {
        response.writeHead(201, { 'Content-Type': 'text/css', 'Content-Length': Buffer.byteLength(big) });
        response.end(big);
    },
    vary(request, response) {
        response.setHeader('Content-Type', 'text/html');
        response.setHeader('Vary', 'Origin');
        response.end(big);
    },
    noContent(request, response) {
        response.statusCode = 204;
        response.setHeader('Content-Type', 'text/html');
        response.end();
    },
    notModified(request, response) {
        response.statusCode = 304;
        response.setHeader('Content-Type', 'text/html');
        response.end();
    },
    stream(request, response) {
        response.setHeader('Content-Type', 'text/javascript');
        // large enough to trigger backpressure
        Readable.from(
            (function* () {
                for (let i = 0; i < 2000; i++) yield Buffer.from(`console.log(${i});\n`.repeat(100));
            })(),
        ).pipe(response);
    },
};

let server: http.Server;

beforeAll(async () => {
    server = http.createServer((request, response) => {
        compressResponse(request, response, { level: 6 });
        handlers[request.url!.slice(1)](request, response);
    });
    await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve));
});

afterAll(async () => {
    await new Promise(resolve => server.close(resolve));
});

function request(name: string, acceptEncoding?: string, method: string = 'GET'): Promise<{ status: number; headers: http.IncomingHttpHeaders; body: Buffer }> {
    return new Promise((resolve, reject) => {
        const headers: { [name: string]: string } = {};
        if (acceptEncoding !== undefined) headers['accept-encoding'] = acceptEncoding;
        const port = (server.address() as AddressInfo).port;
        const req = http.request({ host: '127.0.0.1', port, method, path: '/' + name, headers }, response => {
            const chunks: Buffer[] = [];
            response.on('data', chunk => chunks.push(chunk));
            response.on('end', () => resolve({ status: response.statusCode!, headers: response.headers, body: Buffer.concat(chunks) }));
        });
        req.on('error', reject);
        req.end();
    });
}

test('negotiates encoding', async () => {
    const gzip = await request('json', 'gzip, deflate');
    expect(gzip.headers['content-encoding']).toBe('gzip');
    expect(gzip.headers['content-length']).toBe(undefined);
    expect(gzip.headers['vary']).toBe('Accept-Encoding');
    expect(gunzipSync(gzip.body).toString()).toBe(big);
    expect(gzip.body.length).toBeLessThan(big.length);

    const br = await request('json', 'gzip, deflate, br');
    expect(br.headers['content-encoding']).toBe('br');
    expect(brotliDecompressSync(br.body).toString()).toBe(big);

    const deflate = await request('json', 'deflate');
    expect(deflate.headers['content-encoding']).toBe('deflate');
    expect(inflateSync(deflate.body).toString()).toBe(big);

    expect((await request('json', 'br;q=0.5, gzip')).headers['content-encoding']).toBe('gzip');
    expect((await request('json', 'deflate;q=0.9, gzip;q=0.8')).headers['content-encoding']).toBe('deflate');
    expect((await request('json', '*')).headers['content-encoding']).toBe('br');
    expect((await request('json', 'GZIP')).headers['content-encoding']).toBe('gzip');

    for (const acceptEncoding of [undefined, '', 'identity', 'x-unknown', 'gzip;q=0', '*;q=0']) {
        const response = await request('json', acceptEncoding);
        expect([acceptEncoding, response.headers['content-encoding']]).toEqual([acceptEncoding, undefined]);
        expect(response.body.toString()).toBe(big);
        expect(response.headers['vary']).toBe('Accept-Encoding');
    }
});

test('skips responses that should not be compressed', async () => {
    for (const name of ['small', 'smallContentLength', 'png', 'noType', 'noTransform', 'encoded', 'noContent', 'notModified']) {
        const response = await request(name, 'gzip');
        expect([name, response.headers['content-encoding']]).toEqual([name, name === 'encoded' ? 'custom' : undefined]);
        if (name === 'small' || name === 'smallContentLength') expect(response.body.toString()).toBe('tiny');
        if (name === 'png' || name === 'noType') expect(response.body.toString()).toBe(big);
    }

    // not compressible: no Vary
    expect((await request('png', 'gzip')).headers['vary']).toBe(undefined);
    expect((await request('noTransform', 'gzip')).headers['vary']).toBe(undefined);
    // compressible but too small: Vary since a larger response would be compressed
    expect((await request('small', 'gzip')).headers['vary']).toBe('Accept-Encoding');
});

test('HEAD', async () => {
    const response = await request('json', 'gzip', 'HEAD');
    expect(response.status).toBe(200);
    expect(response.headers['content-encoding']).toBe(undefined);
    expect(response.headers['vary']).toBe('Accept-Encoding');
    expect(response.body.length).toBe(0);
});

test('headers passed to writeHead', async () => {
    const response = await request('writeHead', 'gzip');
    expect(response.status).toBe(201);
    expect(response.headers['content-type']).toBe('text/css');
    expect(response.headers['content-encoding']).toBe('gzip');
    expect(response.headers['content-length']).toBe(undefined);
    expect(gunzipSync(response.body).toString()).toBe(big);
});

test('Vary is appended', async () => {
    expect((await request('vary', 'gzip')).headers['vary']).toBe('Origin, Accept-Encoding');
});

test('streams with backpressure', async () => {
    let expected = '';
    for (let i = 0; i < 2000; i++) expected += `console.log(${i});\n`.repeat(100);

    const response = await request('stream', 'gzip');
    expect(response.headers['content-encoding']).toBe('gzip');
    expect(gunzipSync(response.body).toString()).toBe(expected);

    const identity = await request('stream');
    expect(identity.body.toString()).toBe(expected);
});

test('negotiateEncoding', () => {
    const available = ['br', 'gzip', 'deflate', 'identity'];
    const preferred = ['br', 'gzip'];
    expect(negotiateEncoding('', available, preferred)).toBe('identity');
    expect(negotiateEncoding('gzip', available, preferred)).toBe('gzip');
    expect(negotiateEncoding('deflate, gzip', available, preferred)).toBe('gzip');
    expect(negotiateEncoding('deflate, x', available, preferred)).toBe('deflate');
    expect(negotiateEncoding('gzip;q=0.5, deflate;q=0.6', available, preferred)).toBe('deflate');
    expect(negotiateEncoding('gzip;q=0, *', available, preferred)).toBe('br');
    expect(negotiateEncoding('identity;q=0', available, preferred)).toBe(undefined);
    expect(negotiateEncoding('x;q=0.5', available, preferred)).toBe('identity');
    expect(negotiateEncoding('gzip;q=abc', available, preferred)).toBe('identity');
});

test('isCompressible', () => {
    expect(isCompressible('text/html')).toBe(true);
    expect(isCompressible('text/plain; charset=utf-8')).toBe(true);
    expect(isCompressible('TEXT/CSS')).toBe(true);
    expect(isCompressible('application/json')).toBe(true);
    expect(isCompressible('application/javascript')).toBe(true);
    expect(isCompressible('application/vnd.api+json')).toBe(true);
    expect(isCompressible('image/svg+xml')).toBe(true);
    expect(isCompressible('application/wasm')).toBe(true);
    expect(isCompressible('image/png')).toBe(false);
    expect(isCompressible('image/jpeg')).toBe(false);
    expect(isCompressible('application/zip')).toBe(false);
    expect(isCompressible('video/mp4')).toBe(false);
    expect(isCompressible('')).toBe(false);
});
