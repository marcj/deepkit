import { expect, test } from '@jest/globals';
import { existsSync, readFileSync } from 'fs';
import { join } from 'path';

test('package.json exports point to built files', () => {
    const root = join(__dirname, '..');
    const pkg = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8'));
    const missing: string[] = [];
    for (const [entry, targets] of Object.entries<Record<string, string>>(pkg.exports)) {
        for (const [condition, path] of Object.entries(targets)) {
            if (!existsSync(join(root, path))) missing.push(`${entry} ${condition}: ${path}`);
        }
    }
    expect(missing).toEqual([]);
});
