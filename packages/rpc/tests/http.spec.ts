import { expect, test } from '@jest/globals';
import { IncomingMessage, ServerResponse, createServer } from 'http';

import { asyncOperation } from '@deepkit/core';

import { RpcClient } from '../src/client/client.js';
import { RpcHttpClientAdapter } from '../src/client/http.js';
import { rpc } from '../src/decorators.js';
import { RpcKernel } from '../src/server/kernel.js';

test('http', async () => {
    @rpc.controller('test')
    class Controller {
        @rpc.action()
        hello(): string {
            return 'world';
        }
    }

    const kernel = new RpcKernel();
    kernel.registerController(Controller);

    function handler(request: IncomingMessage & { body?: Uint8Array }, response: ServerResponse) {
        const connection = kernel.createConnection({
            bufferedAmount() {
                return 0;
            },
            close() {},
            clientAddress() {
                return request.socket.remoteAddress || '';
            },
        });

        const chunks: Buffer[] = [];

        function read(chunk: Buffer) {
            chunks.push(chunk);
        }

        request.on('data', read);
        request.once('end', () => {
            request.body = Buffer.concat(chunks);
            request.off('data', read);
        });

        connection.onRequest('/rpc', request, response);
    }

    await asyncOperation<void>(resolve => {
        const server = createServer(handler).listen(0, async () => {
            const port = (server.address() as any).port;
            const client = new RpcClient(new RpcHttpClientAdapter('http://localhost:' + port + '/rpc'));
            const controller = client.controller<Controller>('test');
            const res = await controller.hello();
            resolve();
            server.close();
            expect(res).toBe('world');
        });
    });
});
