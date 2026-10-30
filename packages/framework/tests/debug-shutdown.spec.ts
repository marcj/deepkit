import { expect, test } from '@jest/globals';
import { mkdtempSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { http, HttpKernel, HttpRequest } from '@deepkit/http';
import { sleep } from '@deepkit/core';
import { App } from '@deepkit/app';
import { ApplicationServer } from '../src/application-server.js';
import { FrameworkModule } from '../src/module.js';

test('debug mode shuts down when no broker server is reachable', async () => {
    class Controller {
        @http.GET('/')
        index() {
            return 'hello';
        }
    }

    const varPath = mkdtempSync(join(tmpdir(), 'dk-debug-'));
    // a real app (not createTestingApp, which replaces the broker with an in-memory one)
    const app = new App({
        controllers: [Controller],
        imports: [new FrameworkModule({
            debug: true,
            varPath,
            port: 0,
            // the debug store publishes its frames to this broker, but none is running
            broker: { startOnBootstrap: false, host: join(varPath, 'no-broker.sock') },
        })],
    });

    const server = app.get(ApplicationServer);
    await server.start();
    const response = await app.get(HttpKernel).request(HttpRequest.GET('/'));
    expect(response.bodyString).toBe('"hello"');
    await sleep(0.5); // the debug store syncs (and publishes) its frames every 250ms

    const closed = await Promise.race([server.close().then(() => 'closed'), sleep(5).then(() => 'still closing after 5s')]);
    expect(closed).toBe('closed');
});
