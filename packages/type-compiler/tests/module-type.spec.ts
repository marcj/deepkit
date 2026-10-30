import * as ts from 'typescript';
import { expect, test } from '@jest/globals';
import { mkdirSync, mkdtempSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { ReflectionTransformer } from '../src/compiler.js';

// With module node16/nodenext, a file's module format comes from its extension or the nearest package.json.
// Transpile-only setups (e.g. ts.transform, bundlers) leave sourceFile.impliedNodeFormat unset.
// The compiler then still has to emit `import` (not `require`) for type imports it adds to ESM files.

function createPackage(dir: string, type?: 'module' | 'commonjs'): string {
    mkdirSync(dir, { recursive: true });
    writeFileSync(join(dir, 'package.json'), JSON.stringify(type ? { type } : {}));
    writeFileSync(join(dir, 'logger.ts'), `export interface Logger { log(message: string): void; }`);
    return dir;
}

function usesRequire(fileName: string): boolean {
    const sourceFile = ts.createSourceFile(fileName, `
        import { Logger } from './logger.js';
        export function fn(logger: Logger) {}
    `, ts.ScriptTarget.ESNext, undefined, ts.ScriptKind.TS);
    const res = ts.transform(sourceFile, [(context) => (node) => new ReflectionTransformer(context).withReflection({ reflection: 'default' }).transformSourceFile(node)], { module: ts.ModuleKind.NodeNext });
    const code = ts.createPrinter().printNode(ts.EmitHint.SourceFile, res.transformed[0], res.transformed[0]);
    expect(code).toContain('__ΩLogger');
    return code.includes('require(');
}

test('nodenext: package type decides the module format', () => {
    const root = mkdtempSync(join(tmpdir(), 'dk-module-type-'));
    expect(usesRequire(join(createPackage(join(root, 'esm'), 'module'), 'app.ts'))).toBe(false);
    expect(usesRequire(join(createPackage(join(root, 'cjs'), 'commonjs'), 'app.ts'))).toBe(true);
    expect(usesRequire(join(createPackage(join(root, 'none')), 'app.ts'))).toBe(true);
});

test('nodenext: .mts and .cts override the package type', () => {
    const root = mkdtempSync(join(tmpdir(), 'dk-module-type-'));
    expect(usesRequire(join(createPackage(join(root, 'cjs'), 'commonjs'), 'app.mts'))).toBe(false);
    expect(usesRequire(join(createPackage(join(root, 'esm'), 'module'), 'app.cts'))).toBe(true);
});

test('nodenext: nested package uses its own package.json', () => {
    const root = createPackage(mkdtempSync(join(tmpdir(), 'dk-module-type-')), 'commonjs');
    const nested = createPackage(join(root, 'packages', 'app'), 'module');
    const sibling = createPackage(join(root + '-sibling'), 'module');
    expect(usesRequire(join(root, 'app.ts'))).toBe(true);
    expect(usesRequire(join(nested, 'app.ts'))).toBe(false);
    // a directory that merely starts with the same characters is not inside root
    expect(usesRequire(join(sibling, 'app.ts'))).toBe(false);
});
