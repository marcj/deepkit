import { expect, test } from '@jest/globals';
import { Readable } from 'stream';
import { MinLength } from '@deepkit/type';
import { http } from '../src/decorator.js';
import { HtmlResponse, Redirect } from '../src/http.js';
import { HttpKernel } from '../src/kernel.js';
import { HttpBody, HttpHeader, HttpQuery, HttpRequest, HttpResponse } from '../src/model.js';
import { UploadedFile } from '../src/router.js';
import { createHttpApp } from './utils.js';

class Controller {
    @http.GET('/hello')
    hello() {
        return { hello: 'world' };
    }

    @http.GET('/query')
    query(limit: HttpQuery<number>, auth: HttpHeader<string>) {
        return { limit, auth };
    }

    @http.POST('/user')
    user(body: HttpBody<{ name: string & MinLength<3>; created: Date }>) {
        return { name: body.name, year: body.created.getFullYear() };
    }

    @http.POST('/upload')
    upload(body: HttpBody<{ name: string, file: UploadedFile }>) {
        return { name: body.name, size: body.file.size, fileName: body.file.name };
    }

    @http.GET('/raw')
    async raw(request: HttpRequest) {
        const body = await request.readBody();
        return { length: body.length, remote: request.getRemoteAddress(), host: request.headers.host };
    }

    @http.GET('/stream')
    stream() {
        return Readable.from(['a', 'b', 'c']);
    }

    @http.GET('/html')
    html() {
        return new HtmlResponse('<b>hi</b>', 201).header('x-test', '1');
    }

    @http.GET('/redirect')
    redirect() {
        return Redirect.toUrl('/hello');
    }

    @http.GET('/cookies')
    cookies(response: HttpResponse) {
        response.setHeader('set-cookie', ['a=1', 'b=2']);
        return 'ok';
    }

    @http.GET('/empty')
    empty(response: HttpResponse) {
        response.writeHead(204);
        response.end();
    }
}

function createKernel() {
    return createHttpApp([Controller]).get(HttpKernel);
}

test('fetch returns a Response, synchronously for synchronous routes', async () => {
    const kernel = createKernel();
    const response = kernel.fetch(new Request('http://localhost:8080/hello'));
    expect(response).toBeInstanceOf(Response);
    const r = response as Response;
    expect(r.status).toBe(200);
    expect(r.headers.get('content-type')).toBe('application/json; charset=utf-8');
    expect(await r.json()).toEqual({ hello: 'world' });

    const notFound = await kernel.fetch(new Request('http://localhost/nope'));
    expect(notFound.status).toBe(404);
});

test('fetch query, headers and body', async () => {
    const kernel = createKernel();
    const query = await kernel.fetch(new Request('http://localhost/query?limit=5', { headers: { auth: 'token' } }));
    expect(await query.json()).toEqual({ limit: 5, auth: 'token' });

    const invalidQuery = await kernel.fetch(new Request('http://localhost/query?limit=abc', { headers: { auth: 'token' } }));
    expect(invalidQuery.status).toBe(400);

    const user = await kernel.fetch(new Request('http://localhost/user', {
        method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ name: 'Peter', created: '2026-01-02T00:00:00Z' }),
    }));
    expect(await user.json()).toEqual({ name: 'Peter', year: 2026 });

    const invalid = await kernel.fetch(new Request('http://localhost/user', {
        method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ name: 'Pe', created: 'nope' }),
    }));
    expect(invalid.status).toBe(400);
    expect((await invalid.json()).errors.map((v: any) => v.path).sort()).toEqual(['created', 'name']);

    const broken = await kernel.fetch(new Request('http://localhost/user', { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{bad' }));
    expect(broken.status).toBe(400);
});

test('fetch multipart upload', async () => {
    const kernel = createKernel();
    const form = new FormData();
    form.append('name', 'Peter');
    form.append('file', new Blob(['hello file']), 'a.txt');
    const response = await kernel.fetch(new Request('http://localhost/upload', { method: 'POST', body: form }));
    expect(await response.json()).toEqual({ name: 'Peter', size: 10, fileName: 'a.txt' });
});

test('fetch request stream, remote address and lazy headers', async () => {
    const kernel = createKernel();
    const response = await kernel.fetch(new Request('http://localhost/raw', { headers: { host: 'example.com' } }), { remoteAddress: '10.0.0.1' });
    expect(await response.json()).toEqual({ length: 0, remote: '10.0.0.1', host: 'example.com' });
});

test('fetch special responses', async () => {
    const kernel = createKernel();

    const stream = await kernel.fetch(new Request('http://localhost/stream'));
    expect(await stream.text()).toBe('abc');

    const html = await kernel.fetch(new Request('http://localhost/html'));
    expect(html.status).toBe(201);
    expect(html.headers.get('x-test')).toBe('1');
    expect(html.headers.get('content-type')).toBe('text/html; charset=utf-8');
    expect(await html.text()).toBe('<b>hi</b>');

    const redirect = await kernel.fetch(new Request('http://localhost/redirect'));
    expect(redirect.status).toBe(302);
    expect(redirect.headers.get('location')).toBe('/hello');

    const cookies = await kernel.fetch(new Request('http://localhost/cookies'));
    expect(cookies.headers.getSetCookie()).toEqual(['a=1', 'b=2']);

    const empty = await kernel.fetch(new Request('http://localhost/empty'));
    expect(empty.status).toBe(204);
    expect(await empty.text()).toBe('');

    const head = await kernel.fetch(new Request('http://localhost/hello', { method: 'HEAD' }));
    expect(await head.text()).toBe('');
});
