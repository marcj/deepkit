// Runs the RPC channels in real browsers: builds the page with vite, serves it cross-origin isolated (needed for
// SharedArrayBuffer) and opens it in Chromium, Firefox and WebKit with Playwright.
// Usage: node packages/rpc/tests/browser/run.mjs [path to the playwright package]
import { readFile } from 'node:fs/promises';
import { createServer } from 'node:http';
import { createRequire } from 'node:module';
import { extname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { build } from 'vite';

const here = fileURLToPath(new URL('.', import.meta.url));
const require = createRequire(process.argv[2] ? join(process.argv[2], 'index.js') : import.meta.url);
const playwright = require('playwright');

await build({ configFile: join(here, 'vite.config.mjs') });
const dist = '/tmp/deepkit-rpc-browser';
const types = { '.html': 'text/html', '.js': 'text/javascript' };
const server = createServer(async (req, res) => {
  const path = join(dist, req.url === '/' ? 'index.html' : req.url.split('?')[0]);
  try {
    const body = await readFile(path);
    res.writeHead(200, {
      'Content-Type': types[extname(path)] || 'application/octet-stream',
      'Cross-Origin-Opener-Policy': 'same-origin',
      'Cross-Origin-Embedder-Policy': 'require-corp',
    });
    res.end(body);
  } catch {
    res.writeHead(404).end();
  }
});
await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
const url = `http://127.0.0.1:${server.address().port}/`;

let failed = false;
for (const name of ['chromium', 'firefox', 'webkit']) {
  const browser = await playwright[name].launch();
  try {
    const page = await browser.newPage();
    const errors = [];
    page.on('pageerror', error => errors.push(String(error)));
    await page.goto(url);
    const results = await page
      .waitForFunction(() => window.results, undefined, { timeout: 60_000 })
      .then(handle => handle.jsonValue());
    console.log(name, browser.version(), JSON.stringify(results), errors.join(' '));
    if (!results.messagePort.ok || !results.sharedMemory.ok) failed = true;
  } catch (error) {
    failed = true;
    console.log(name, 'failed', String(error));
  } finally {
    await browser.close();
  }
}
server.close();
process.exit(failed ? 1 : 0);
