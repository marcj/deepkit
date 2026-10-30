import { expect, test } from '@jest/globals';
import { existsSync, readFileSync } from 'fs';
import { join } from 'path';

test('package.json exports point to files the build emits', () => {
    // regression for #702: ./plugin pointed at dist/cjs/plugin.js, but the build emits dist/cjs/src/plugin.js.
    // Checks the source file each target is built from, so it does not depend on which builds ran.
    const root = join(__dirname, '..');
    const pkg = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8'));
    const missing: string[] = [];
    for (const [entry, targets] of Object.entries<Record<string, string>>(pkg.exports)) {
        for (const [condition, path] of Object.entries(targets)) {
            const source = path.replace(/^\.\/dist\/(cjs|esm)\//, '').replace(/\.(d\.ts|js)$/, '.ts');
            if (!existsSync(join(root, source))) missing.push(`${entry} ${condition}: ${path}`);
        }
    }
    expect(missing).toEqual([]);
});
