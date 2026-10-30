import { expect, test } from '@jest/globals';
import { execFileSync } from 'child_process';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';

test('injected code is valid JavaScript', () => {
    // on Windows the fallback require() path contains backslashes, which must be escaped (#356)
    const dir = mkdtempSync(join(tmpdir(), 'deepkit-install-transformer-'));
    try {
        const lib = join(dir, 'node_modules', 'typescript', 'lib');
        mkdirSync(lib, { recursive: true });
        writeFileSync(join(lib, '..', 'package.json'), JSON.stringify({ name: 'typescript', main: './lib/typescript.js' }));
        writeFileSync(join(lib, 'typescript.js'), 'function getTransformers(compilerOptions, customTransformers) {}');
        execFileSync(process.execPath, [join(__dirname, '../dist/cjs/install-transformer.js'), dir]);

        const code = readFileSync(join(lib, 'typescript.js'), 'utf8');
        expect(code).toMatch(/typeTransformer = require\("[^"]*type-compiler[\\/]+dist[\\/]+cjs"\);/);
        expect(() => new Function(code)).not.toThrow();
    } finally {
        rmSync(dir, { recursive: true, force: true });
    }
});
