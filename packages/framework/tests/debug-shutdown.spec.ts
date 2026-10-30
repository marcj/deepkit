import { expect, test } from '@jest/globals';
import { spawnSync } from 'child_process';
import { existsSync, mkdtempSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';

import { App } from '@deepkit/app';
import { BrokerBus, BrokerDeepkitAdapter } from '@deepkit/broker';
import { sleep } from '@deepkit/core';
import { HttpKernel, HttpRequest, http } from '@deepkit/http';
import { MemoryLogger } from '@deepkit/logger';
import { RpcTcpClientAdapter } from '@deepkit/rpc-tcp';
import { FrameCategory, Stopwatch, StopwatchStore } from '@deepkit/stopwatch';

import { ApplicationServer } from '../src/application-server.js';
import { DebugBrokerBus } from '../src/debug/broker.js';
import { FileStopwatchStore } from '../src/debug/stopwatch/store.js';
import { FrameworkModule } from '../src/module.js';

test('debug store does not hang when the broker is unreachable', async () => {
    // with workers, debug frames go through the configured broker, which might not be running
    const varPath = mkdtempSync(join(tmpdir(), 'dk-debug-'));
    const unreachable = new BrokerBus(
        new BrokerDeepkitAdapter({
            servers: [{ url: '', transport: new RpcTcpClientAdapter(join(varPath, 'no-broker.sock')) }],
        }),
    );
    const logger = new MemoryLogger();
    const store = new FileStopwatchStore({ varPath, debugStorePath: 'debug' }, unreachable as DebugBrokerBus, logger);
    const stopwatch = new Stopwatch(store);
    stopwatch.enable();

    stopwatch.start('first', FrameCategory.none, true).end();
    await sleep(0.5); // the store publishes its frames every 250ms
    stopwatch.start('second', FrameCategory.none, true).end();

    const closed = await Promise.race([store.close().then(() => 'closed'), sleep(5).then(() => 'still closing after 5s')]);
    expect(closed).toBe('closed');
    expect(logger.getOutput()).toContain('Could not send debug frames to the broker');
    expect(existsSync(join(varPath, 'debug/frames.bin'))).toBe(true); // still written to disk
});

test('debug mode shows live frames without a broker server (single process)', async () => {
    class Controller {
        @http.GET('/')
        index() {
            return 'hello';
        }
    }

    const varPath = mkdtempSync(join(tmpdir(), 'dk-debug-'));
    const app = new App({
        controllers: [Controller],
        imports: [new FrameworkModule({ debug: true, varPath, port: 0 })],
    });

    const server = app.get(ApplicationServer);
    await server.start();
    try {
        // what the debugger's live view subscribes to
        const store = app.get(StopwatchStore) as FileStopwatchStore;
        const received: Uint8Array[] = [];
        const unsubscribe = await store.frameChannel!.subscribe(v => received.push(v));

        await app.get(HttpKernel).request(HttpRequest.GET('/'));
        await sleep(0.5); // the store publishes its frames every 250ms
        await unsubscribe();
        expect(received.length).toBeGreaterThan(0);
    } finally {
        await server.close();
    }
});

test('failing CLI command shows its error with debug enabled (#687)', () => {
    // the debug store is closed on app shutdown, that used to swallow the error output of commands
    const varPath = mkdtempSync(join(tmpdir(), 'dk-debug-'));
    const res = spawnSync(process.execPath, ['--import', '@deepkit/run', join(__dirname, 'fixtures/cli-debug-error.ts'), 'fail', varPath], {
        cwd: __dirname,
        encoding: 'utf8',
        timeout: 60_000,
    });
    expect(res.status).toBe(1);
    expect(res.stdout + res.stderr).toContain('visible error from the command');
}, 70_000);
