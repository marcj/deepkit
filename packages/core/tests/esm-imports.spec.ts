import { expect, test } from '@jest/globals';
import { existsSync, readFileSync, readdirSync, statSync } from 'fs';
import { join, relative } from 'path';

const packagesDir = join(__dirname, '../..');

function sourceFiles(dir: string, out: string[] = []): string[] {
    if (!existsSync(dir)) return out;
    for (const name of readdirSync(dir)) {
        if (name === 'node_modules' || name === 'dist' || name === 'tests') continue;
        const path = join(dir, name);
        if (statSync(path).isDirectory()) sourceFiles(path, out);
        else if (/\.tsx?$/.test(name) && !/\.(spec|test|d)\.tsx?$/.test(name)) out.push(path);
    }
    return out;
}

test('relative imports of published packages have a file extension', () => {
    // Node's ESM loader needs the extension: import './src/optimize-tsx' made @deepkit/template unloadable
    // from ESM with ERR_MODULE_NOT_FOUND, while the CJS build worked.
    const missing: string[] = [];
    for (const dir of readdirSync(packagesDir)) {
        const pkgPath = join(packagesDir, dir, 'package.json');
        if (!existsSync(pkgPath)) continue;
        const pkg = JSON.parse(readFileSync(pkgPath, 'utf8'));
        // GUIs and Angular libraries are bundled, their imports never reach Node's loader.
        if (pkg.private || dir.endsWith('-gui') || dir === 'desktop-ui') continue;
        const files = [
            ...sourceFiles(join(packagesDir, dir, 'src')),
            ...readdirSync(join(packagesDir, dir)).filter(v => /\.tsx?$/.test(v) && !v.endsWith('.d.ts')).map(v => join(packagesDir, dir, v)),
        ];
        for (const file of files) {
            const code = readFileSync(file, 'utf8').replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
            for (const m of code.matchAll(/(?:\bfrom\s+|\bimport\s*\(\s*|^\s*import\s+)['"](\.{1,2}\/[^'"]*)['"]/gm)) {
                if (/\.(js|mjs|cjs|json)$/.test(m[1])) continue;
                missing.push(`${relative(packagesDir, file)}: ${m[1]}`);
            }
        }
    }
    expect(missing).toEqual([]);
});

test('published packages do not call require()', () => {
    // require does not exist in the ESM build: @deepkit/http rendered JSX templates with
    // require('@deepkit/template') and failed with "require is not defined". Use await import() instead.
    const found: string[] = [];
    for (const dir of readdirSync(packagesDir)) {
        const pkgPath = join(packagesDir, dir, 'package.json');
        if (!existsSync(pkgPath)) continue;
        const pkg = JSON.parse(readFileSync(pkgPath, 'utf8'));
        if (pkg.private || dir.endsWith('-gui') || dir === 'desktop-ui') continue;
        const files = [
            ...sourceFiles(join(packagesDir, dir, 'src')),
            ...readdirSync(join(packagesDir, dir)).filter(v => /\.tsx?$/.test(v) && !v.endsWith('.d.ts')).map(v => join(packagesDir, dir, v)),
        ];
        for (const file of files) {
            // runs only as CommonJS: deepkit-type-install.js loads it from dist/cjs
            if (relative(packagesDir, file) === join('type-compiler', 'install-transformer.ts')) continue;
            const lines = readFileSync(file, 'utf8').replace(/\/\*[\s\S]*?\*\//g, '').split('\n');
            lines.forEach((line, i) => {
                if (/^\s*\/\//.test(line)) return;
                // guarded uses like `typeof require` / require.resolve in CJS-only code paths are fine
                if (/(^|[^.\w$])require\(/.test(line) && !/typeof require|createRequire/.test(line)) {
                    found.push(`${relative(packagesDir, file)}:${i + 1}`);
                }
            });
        }
    }
    expect(found).toEqual([]);
});
