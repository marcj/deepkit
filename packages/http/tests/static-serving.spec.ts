import { afterAll, beforeAll, expect, test } from '@jest/globals';
import { mkdirSync, mkdtempSync, rmSync, statSync, utimesSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';

import { AppModule } from '@deepkit/app';

import { getContentType, getMimeType } from '../src/mime.js';
import { HttpRequest, MemoryHttpResponse } from '../src/model.js';
import { serveStaticListener, staticServe } from '../src/static-serving.js';
import { createHttpKernel } from './utils.js';

let base: string;
let root: string;
let etag: string;
let lastModified: string;

beforeAll(() => {
    base = mkdtempSync(join(tmpdir(), 'deepkit-static-'));
    root = join(base, 'public');
    mkdirSync(join(root, 'dir', 'sub'), { recursive: true });
    mkdirSync(join(root, '.git'));
    mkdirSync(join(root, 'withindex'));
    writeFileSync(join(base, 'outside.txt'), 'outside');
    writeFileSync(join(root, 'a.txt'), 'hello world 0123456789');
    writeFileSync(join(root, 'index.html'), '<h1>index</h1>');
    writeFileSync(join(root, 'app.js'), 'console.log(1)');
    writeFileSync(join(root, 'logo.svg'), '<svg></svg>');
    writeFileSync(join(root, 'README'), 'readme');
    writeFileSync(join(root, 'empty.bin'), '');
    writeFileSync(join(root, 'sp ace.txt'), 'spaced');
    writeFileSync(join(root, '.env'), 'SECRET=1');
    writeFileSync(join(root, '.git', 'config'), 'secret');
    writeFileSync(join(root, 'dir', 'b.css'), 'a{}');
    writeFileSync(join(root, 'dir', 'sub', '.hidden'), 'hidden');
    writeFileSync(join(root, 'withindex', 'index.html'), 'with index');
    utimesSync(join(root, 'a.txt'), new Date('2020-01-01T00:00:00Z'), new Date('2020-01-01T00:00:00Z'));

    const stats = statSync(join(root, 'a.txt'));
    etag = `W/"${stats.size.toString(16)}-${stats.mtime.getTime().toString(16)}"`;
    lastModified = stats.mtime.toUTCString();
});

afterAll(() => {
    rmSync(base, { recursive: true, force: true });
});

async function serve(path: string, headers: { [name: string]: string } = {}, method: 'GET' | 'HEAD' = 'GET'): Promise<MemoryHttpResponse> {
    const request = (method === 'HEAD' ? HttpRequest.HEAD('/') : HttpRequest.GET('/')).headers(headers).build();
    const response = new MemoryHttpResponse(request);
    response.assignSocket(request.socket);
    await staticServe(root, path, request, response);
    return response;
}

test('serves files with headers', async () => {
    const response = await serve('/a.txt');
    expect(response.statusCode).toBe(200);
    expect(response.bodyString).toBe('hello world 0123456789');
    expect(response.getHeader('Content-Type')).toBe('text/plain; charset=utf-8');
    expect(response.getHeader('Content-Length')).toBe(22);
    expect(response.getHeader('ETag')).toBe(etag);
    expect(response.getHeader('Last-Modified')).toBe('Wed, 01 Jan 2020 00:00:00 GMT');
    expect(response.getHeader('Accept-Ranges')).toBe('bytes');
    expect(response.getHeader('Cache-Control')).toBe('public, max-age=0');

    expect((await serve('/app.js')).getHeader('Content-Type')).toBe('text/javascript; charset=utf-8');
    expect((await serve('/logo.svg')).getHeader('Content-Type')).toBe('image/svg+xml');
    expect((await serve('/README')).getHeader('Content-Type')).toBe('application/octet-stream');
    expect((await serve('/dir/b.css')).bodyString).toBe('a{}');
    expect((await serve('/sp%20ace.txt')).bodyString).toBe('spaced');

    const empty = await serve('/empty.bin');
    expect(empty.statusCode).toBe(200);
    expect(empty.getHeader('Content-Length')).toBe(0);
    expect(empty.bodyString).toBe('');
});

test('index and directories', async () => {
    expect((await serve('/withindex/')).bodyString).toBe('with index');
    expect((await serve('/dir/')).statusCode).toBe(404);

    const redirect = await serve('/withindex');
    expect(redirect.statusCode).toBe(301);
    expect(redirect.getHeader('Location')).toBe('/withindex/');
});

test('HEAD', async () => {
    const response = await serve('/a.txt', {}, 'HEAD');
    expect(response.statusCode).toBe(200);
    expect(response.getHeader('Content-Length')).toBe(22);
    expect(response.getHeader('Content-Type')).toBe('text/plain; charset=utf-8');
    expect(response.bodyString).toBe('');
});

test('path traversal', async () => {
    for (const path of ['/../outside.txt', '/dir/../../outside.txt', '/..%2Foutside.txt', '/%2e%2e/outside.txt', '/%2E%2E%2Foutside.txt', '/dir/%2e%2e/%2e%2e/outside.txt', '/..\\outside.txt', '/%5C..%5Coutside.txt', '/..']) {
        const response = await serve(path);
        expect([path, response.statusCode]).toEqual([path, 403]);
        expect(response.bodyString).not.toContain('outside');
    }

    // stays inside root
    expect((await serve('/dir/../a.txt')).statusCode).toBe(200);
    expect((await serve('/dir/%2e%2e/a.txt')).statusCode).toBe(200);
});

test('null bytes and malformed encoding', async () => {
    expect((await serve('/a.txt%00')).statusCode).toBe(400);
    expect((await serve('/a.txt%00.png')).statusCode).toBe(400);
    expect((await serve('/a.txt\0')).statusCode).toBe(400);
    expect((await serve('/a%ZZ.txt')).statusCode).toBe(400);
    expect((await serve('/%')).statusCode).toBe(400);
});

test('dotfiles are ignored', async () => {
    for (const path of ['/.env', '/%2Eenv', '/.git/config', '/dir/sub/.hidden', '/dir/../.env']) {
        const response = await serve(path);
        expect([path, response.statusCode]).toEqual([path, 404]);
        expect(response.bodyString).not.toContain('SECRET');
        expect(response.bodyString).not.toContain('secret');
    }
});

test('not found', async () => {
    expect((await serve('/missing.txt')).statusCode).toBe(404);
    expect((await serve('/a.txt/')).statusCode).toBe(404);
    expect((await serve('/a.txt/x')).statusCode).toBe(404);
    expect((await serve('/' + 'x'.repeat(3000))).statusCode).toBe(404);
});

test('conditional requests', async () => {
    const notModified = await serve('/a.txt', { 'if-none-match': etag });
    expect(notModified.statusCode).toBe(304);
    expect(notModified.bodyString).toBe('');
    expect(notModified.getHeader('Content-Type')).toBe(undefined);
    expect(notModified.getHeader('Content-Length')).toBe(undefined);
    expect(notModified.getHeader('ETag')).toBe(etag);

    expect((await serve('/a.txt', { 'if-none-match': `W/"other", ${etag}` })).statusCode).toBe(304);
    expect((await serve('/a.txt', { 'if-none-match': '*' })).statusCode).toBe(304);
    expect((await serve('/a.txt', { 'if-none-match': '"other"' })).statusCode).toBe(200);
    expect((await serve('/a.txt', { 'if-none-match': etag, 'cache-control': 'no-cache' })).statusCode).toBe(200);
    // If-None-Match takes precedence
    expect((await serve('/a.txt', { 'if-none-match': '"other"', 'if-modified-since': lastModified })).statusCode).toBe(200);

    expect((await serve('/a.txt', { 'if-modified-since': lastModified })).statusCode).toBe(304);
    expect((await serve('/a.txt', { 'if-modified-since': 'Thu, 01 Jan 2030 00:00:00 GMT' })).statusCode).toBe(304);
    expect((await serve('/a.txt', { 'if-modified-since': 'Tue, 01 Jan 2019 00:00:00 GMT' })).statusCode).toBe(200);
    expect((await serve('/a.txt', { 'if-modified-since': 'garbage' })).statusCode).toBe(200);

    expect((await serve('/a.txt', { 'if-match': '"nope"' })).statusCode).toBe(412);
    expect((await serve('/a.txt', { 'if-match': etag })).statusCode).toBe(200);
    expect((await serve('/a.txt', { 'if-match': '*' })).statusCode).toBe(200);
    expect((await serve('/a.txt', { 'if-unmodified-since': 'Tue, 01 Jan 2019 00:00:00 GMT' })).statusCode).toBe(412);
    expect((await serve('/a.txt', { 'if-unmodified-since': lastModified })).statusCode).toBe(200);
});

test('range requests', async () => {
    const first = await serve('/a.txt', { range: 'bytes=0-4' });
    expect(first.statusCode).toBe(206);
    expect(first.bodyString).toBe('hello');
    expect(first.getHeader('Content-Range')).toBe('bytes 0-4/22');
    expect(first.getHeader('Content-Length')).toBe(5);

    expect((await serve('/a.txt', { range: 'bytes=12-' })).bodyString).toBe('0123456789');
    expect((await serve('/a.txt', { range: 'bytes=-3' })).bodyString).toBe('789');
    expect((await serve('/a.txt', { range: 'bytes=0-0' })).bodyString).toBe('h');
    expect((await serve('/a.txt', { range: 'bytes=20-1000' })).bodyString).toBe('89');
    // overlapping ranges are combined
    const combined = await serve('/a.txt', { range: 'bytes=0-4,2-8' });
    expect(combined.statusCode).toBe(206);
    expect(combined.bodyString).toBe('hello wor');

    // multiple ranges and invalid ranges send the whole file
    expect((await serve('/a.txt', { range: 'bytes=0-1,3-4' })).statusCode).toBe(200);
    expect((await serve('/a.txt', { range: 'items=0-4' })).statusCode).toBe(200);

    const unsatisfiable = await serve('/a.txt', { range: 'bytes=100-200' });
    expect(unsatisfiable.statusCode).toBe(416);
    expect(unsatisfiable.getHeader('Content-Range')).toBe('bytes */22');
    expect((await serve('/a.txt', { range: 'bytes=abc' })).statusCode).toBe(416);
    expect((await serve('/empty.bin', { range: 'bytes=0-' })).statusCode).toBe(416);

    // If-Range
    expect((await serve('/a.txt', { range: 'bytes=0-4', 'if-range': etag })).statusCode).toBe(206);
    expect((await serve('/a.txt', { range: 'bytes=0-4', 'if-range': lastModified })).statusCode).toBe(206);
    const stale = await serve('/a.txt', { range: 'bytes=0-4', 'if-range': '"old"' });
    expect(stale.statusCode).toBe(200);
    expect(stale.bodyString).toBe('hello world 0123456789');
    expect((await serve('/a.txt', { range: 'bytes=0-4', 'if-range': 'Tue, 01 Jan 2019 00:00:00 GMT' })).statusCode).toBe(200);

    const head = await serve('/a.txt', { range: 'bytes=0-4' }, 'HEAD');
    expect(head.statusCode).toBe(206);
    expect(head.getHeader('Content-Length')).toBe(5);
    expect(head.bodyString).toBe('');
});

test('serveStaticListener', async () => {
    const listener = serveStaticListener(new AppModule({}), '/public/', root);
    const httpKernel = createHttpKernel([], [], [listener]);

    const response = await httpKernel.request(HttpRequest.GET('/public/a.txt'));
    expect(response.statusCode).toBe(200);
    expect(response.bodyString).toBe('hello world 0123456789');

    expect((await httpKernel.request(HttpRequest.HEAD('/public/a.txt'))).bodyString).toBe('');
    expect((await httpKernel.request(HttpRequest.GET('/public/a.txt').header('if-none-match', etag))).statusCode).toBe(304);

    // the listener checks the file exists, so traversal to an existing file outside root must be rejected
    const traversal = await httpKernel.request(HttpRequest.GET('/public/../outside.txt'));
    expect(traversal.statusCode).toBe(403);
    expect(traversal.bodyString).not.toContain('outside');

    const dotfile = await httpKernel.request(HttpRequest.GET('/public/.env'));
    expect(dotfile.statusCode).toBe(404);
    expect(dotfile.bodyString).not.toContain('SECRET');
});

test('mime types', () => {
    expect(getMimeType('/assets/logo.svg')).toBe('image/svg+xml');
    expect(getMimeType('photo.JPG')).toBe('image/jpeg');
    expect(getMimeType('png')).toBe('image/png');
    expect(getMimeType('.png')).toBe('image/png');
    expect(getMimeType('archive.tar.gz')).toBe('application/gzip');
    expect(getMimeType('font.woff2')).toBe('font/woff2');
    expect(getMimeType('module.wasm')).toBe('application/wasm');
    expect(getMimeType('video.mp4')).toBe('video/mp4');
    expect(getMimeType('README')).toBe(undefined);
    expect(getMimeType('/home/.bashrc')).toBe(undefined);
    expect(getMimeType('dir.png/file')).toBe(undefined);
    expect(getMimeType('file.unknown')).toBe(undefined);
    expect(getMimeType('file.toString')).toBe(undefined);
    expect(getMimeType('file.__proto__')).toBe(undefined);

    expect(getContentType('index.html')).toBe('text/html; charset=utf-8');
    expect(getContentType('data.json')).toBe('application/json; charset=utf-8');
    expect(getContentType('image.png')).toBe('image/png');
    expect(getContentType('README')).toBe(undefined);
});
