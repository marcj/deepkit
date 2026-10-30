import { expect, test } from '@jest/globals';

import { Filesystem, FilesystemMemoryAdapter } from '@deepkit/filesystem';
import { Logger } from '@deepkit/logger';

import { DebugHttpController } from '../src/debug/debug-http.controller.js';
import { FilesystemRegistry } from '../src/filesystem.js';

function createResponse() {
    const response = {
        headers: {} as { [name: string]: any },
        body: undefined as Uint8Array | undefined,
        statusCode: 200,
        setHeader(name: string, value: any) {
            response.headers[name] = value;
        },
        end(data: Uint8Array) {
            response.body = data;
        },
        status(code: number) {
            response.statusCode = code;
        },
    };
    return response;
}

test('media preview sends large images unchanged', async () => {
    const filesystem = new Filesystem(new FilesystemMemoryAdapter());
    //not decodable as image: previews are not resized server-side anymore
    const data = new Uint8Array(1024 * 1024).fill(7);
    await filesystem.write('big.png', data);
    const registry = { getFilesystems: () => [filesystem] } as any as FilesystemRegistry;
    const controller = new DebugHttpController(registry, new Logger());

    const response = createResponse();
    await controller.mediaPreview(0, 'big.png', response as any);
    expect(response.statusCode).toBe(200);
    expect(response.headers['Content-Type']).toBe('image/png');
    expect(response.headers['Content-Length']).toBe(data.byteLength);
    expect(response.body).toEqual(data);

    await filesystem.write('file.txt', 'hello');
    const textResponse = createResponse();
    await controller.mediaPreview(0, 'file.txt', textResponse as any);
    expect(textResponse.statusCode).toBe(404);
});
