import { expect, test } from '@jest/globals';

import { App } from '@deepkit/app';
import { http } from '@deepkit/http';

import { ApplicationServer } from '../src/application-server.js';
import { FrameworkModule } from '../src/module.js';

test('start() waits until the server listens, and fails when the port is in use', async () => {
    class Controller {
        @http.GET('/')
        index() {
            return 'hello';
        }
    }

    const first = new App({ controllers: [Controller], imports: [new FrameworkModule({ port: 0 })] });
    const firstServer = first.get(ApplicationServer);
    await firstServer.start();
    try {
        const port = (firstServer.getHttpWorker() as any).server.address().port;
        expect(port).toBeGreaterThan(0);

        // used to log "HTTP listening at" and "Server started", then crash with an uncaught EADDRINUSE
        const second = new App({ controllers: [Controller], imports: [new FrameworkModule({ port })] });
        await expect(second.get(ApplicationServer).start()).rejects.toThrow('EADDRINUSE');
    } finally {
        await firstServer.close();
    }
});
