import { expect, test } from '@jest/globals';
import { createServer, Server } from 'http';
import { AddressInfo } from 'net';
import { httpWorkflow } from '../src/http.js';
import { HttpConfig } from '../src/module.config.js';
import { HttpBody } from '../src/model.js';
import { HttpRouterRegistry, UploadedFile } from '../src/router.js';
import { createHttpKernel } from './utils.js';

function createKernel(config?: HttpConfig, withListener = false) {
    // a listener of a state up to the controller makes requests go through the workflow instead of the direct path
    const listeners = withListener ? [httpWorkflow.onController.listen(() => undefined)] : [];
    return createHttpKernel((registry: HttpRouterRegistry) => {
        registry.post('/upload', (body: HttpBody<{ name: string, file: UploadedFile }>) => {
            return { name: body.name, size: body.file.size, fileName: body.file.name, type: body.file.type };
        });
        registry.post('/json', (body: HttpBody<{ name: string }>) => body);
    }, [], listeners, [], [], config);
}

async function listen(kernel: ReturnType<typeof createKernel>): Promise<{ server: Server, url: string }> {
    const server = createServer((req, res) => kernel.handleRequest(req, res));
    await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve));
    const port = (server.address() as AddressInfo).port;
    return { server, url: `http://127.0.0.1:${port}` };
}

function close(server: Server) {
    return new Promise<void>(resolve => server.close(() => resolve()));
}

function uploadForm(content: Buffer) {
    const form = new FormData();
    form.append('name', 'Peter');
    form.append('file', new Blob([content], { type: 'text/plain' }), 'fox.txt');
    return form;
}

test.each([false, true])('multipart upload through a node server (workflow: %s)', async (withListener) => {
    const { server, url } = await listen(createKernel(undefined, withListener));
    try {
        const content = Buffer.from('the quick brown fox jumps over the lazy dog');
        const response = await fetch(url + '/upload', { method: 'POST', body: uploadForm(content) });
        expect(response.status).toBe(200);
        expect(await response.json()).toEqual({ name: 'Peter', size: 43, fileName: 'fox.txt', type: 'text/plain' });

        // a large file arrives in many chunks
        const large = Buffer.alloc(3 * 1024 * 1024, 'a');
        const largeResponse = await fetch(url + '/upload', { method: 'POST', body: uploadForm(large) });
        expect(largeResponse.status).toBe(200);
        expect(await largeResponse.json()).toMatchObject({ size: large.length });

        // non-multipart bodies still work
        const jsonResponse = await fetch(url + '/json', {
            method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ name: 'Peter' }),
        });
        expect(await jsonResponse.json()).toEqual({ name: 'Peter' });

        const formResponse = await fetch(url + '/json', { method: 'POST', body: new URLSearchParams({ name: 'Peter' }) });
        expect(await formResponse.json()).toEqual({ name: 'Peter' });
    } finally {
        await close(server);
    }
});

test.each([false, true])('multipart upload exceeding maxFileSize through a node server returns 413 (workflow: %s)', async (withListener) => {
    const config = new HttpConfig();
    config.parser.maxFileSize = 1024;
    const { server, url } = await listen(createKernel(config, withListener));
    try {
        const response = await fetch(url + '/upload', { method: 'POST', body: uploadForm(Buffer.alloc(64 * 1024, 'a')) });
        expect(response.status).toBe(413);
        expect((await response.json()).message).toMatch(/maxFileSize|maxTotalFileSize/);

        // the server keeps working afterwards
        const ok = await fetch(url + '/upload', { method: 'POST', body: uploadForm(Buffer.from('small')) });
        expect(ok.status).toBe(200);
    } finally {
        await close(server);
    }
});

test('multipart upload through kernel.fetch', async () => {
    const kernel = createKernel();
    const response = await kernel.fetch(new Request('http://localhost/upload', { method: 'POST', body: uploadForm(Buffer.from('hello')) }));
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ name: 'Peter', size: 5, fileName: 'fox.txt', type: 'text/plain' });
});

test('multipart upload exceeding maxFileSize through kernel.fetch returns 413', async () => {
    const config = new HttpConfig();
    config.parser.maxFileSize = 1024;
    const kernel = createKernel(config);
    const response = await kernel.fetch(new Request('http://localhost/upload', { method: 'POST', body: uploadForm(Buffer.alloc(64 * 1024, 'a')) }));
    expect(response.status).toBe(413);
});
