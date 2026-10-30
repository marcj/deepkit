import { expect, test } from '@jest/globals';
import { execFileSync } from 'child_process';
import { mkdirSync, mkdtempSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';

/**
 * Yarn PnP has no node_modules folder: packages are found only through Node's module resolution, which PnP
 * hooks via Module._resolveFilename. Simulate that with a GUI package outside any node_modules folder.
 *
 * Runs in a plain node process against the built package, because jest replaces Node's module resolution.
 */
test('debug GUI is found via module resolution, without a node_modules folder (Yarn PnP)', () => {
    const dir = mkdtempSync(join(tmpdir(), 'dk-pnp-'));
    const gui = join(dir, 'framework-debug-gui');
    mkdirSync(join(gui, 'dist/framework-debug-gui'), { recursive: true });
    writeFileSync(join(gui, 'package.json'), JSON.stringify({ name: '@deepkit/framework-debug-gui' }));
    writeFileSync(join(gui, 'dist/framework-debug-gui/index.html'), '<html><head><base href="/"></head><body>debug gui</body></html>');

    const script = join(dir, 'run.cjs');
    writeFileSync(script, `
        const Module = require('module');
        const [frameworkDir, guiPackageJson] = process.argv.slice(2);
        const resolveFilename = Module._resolveFilename;
        Module._resolveFilename = function (request, ...rest) {
            if (request === '@deepkit/framework-debug-gui/package.json') return guiPackageJson;
            return resolveFilename.call(this, request, ...rest);
        };
        const req = Module.createRequire(frameworkDir + '/package.json');
        const { App, createModuleClass } = req('@deepkit/app');
        const { HttpKernel, HttpModule, HttpRequest } = req('@deepkit/http');
        const { registerDebugHttpController } = req('./dist/cjs/src/debug/http-debug.controller.js');

        class DebugModule extends createModuleClass({}) {
            process() {
                registerDebugHttpController(this, '/_debug');
            }
        }
        const app = new App({ imports: [new HttpModule(), new DebugModule()] });
        app.get(HttpKernel).request(HttpRequest.GET('/_debug/')).then(response => {
            console.log(JSON.stringify({ status: response.statusCode, body: response.bodyString }));
        });
    `);

    const output = execFileSync(process.execPath, [script, join(__dirname, '..'), join(gui, 'package.json')], { encoding: 'utf8' });
    const result = JSON.parse(output.trim().split('\n').pop()!);
    expect(result.status).toBe(200);
    expect(result.body).toContain('debug gui');
});
