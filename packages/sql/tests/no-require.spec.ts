import { expect, test } from '@jest/globals';
import { readdirSync, readFileSync, statSync } from 'fs';
import { join } from 'path';

function sourceFiles(dir: string): string[] {
    return readdirSync(dir).flatMap(name => {
        const path = join(dir, name);
        return statSync(path).isDirectory() ? sourceFiles(path) : path.endsWith('.ts') ? [path] : [];
    });
}

test('sources do not use require(), which is undefined in ESM', () => {
    // regression for migration:create failing with "require is not defined" in ESM projects (#685)
    const src = join(__dirname, '../src');
    const offending = sourceFiles(src).filter(file => /(^|[^.\w])require\(/m.test(readFileSync(file, 'utf8')));
    expect(offending.map(v => v.slice(src.length + 1))).toEqual([]);
});
