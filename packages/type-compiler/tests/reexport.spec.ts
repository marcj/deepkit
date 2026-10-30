import { expect, test } from '@jest/globals';
import { execFileSync } from 'child_process';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import * as ts from 'typescript';
import { declarationTransformer, transformer } from '../src/compiler.js';

test('named re-export', () => {
    // `export { Context } from './context'` has to export __ΩContext as well, otherwise importing the type
    // from the barrel file resolves to undefined. A non-existing export, e.g. for a class, would fail with ES modules (#634)
    for (const module of [ts.ModuleKind.CommonJS, ts.ModuleKind.ES2020]) {
        const dir = mkdtempSync(join(tmpdir(), 'deepkit-reexport-'));
        try {
            const files: Record<string, string> = {
                'tsconfig.json': JSON.stringify({ reflection: true }),
                'package.json': JSON.stringify({ type: module === ts.ModuleKind.CommonJS ? 'commonjs' : 'module' }),
                'context.ts': `export interface Context { id: number }\nexport enum Unit { kg }\nexport class Service {}`,
                'index.ts': `export { Context, Unit, Service } from './context.js';`,
                'app.ts': `import { Context } from './index.js';\nexport type A = Context;`,
                'main.js': module === ts.ModuleKind.CommonJS
                    ? `console.log(JSON.stringify(require('./app.js').__ΩA[0]()));`
                    : `import { __ΩA } from './app.js';\nconsole.log(JSON.stringify(__ΩA[0]()));`,
            };
            for (const [name, content] of Object.entries(files)) writeFileSync(join(dir, name), content);
            const options: ts.CompilerOptions = { module, target: ts.ScriptTarget.ES2020, declaration: true, configFilePath: join(dir, 'tsconfig.json') };
            ts.createProgram([join(dir, 'app.ts')], options).emit(undefined, undefined, undefined, false, { before: [transformer], afterDeclarations: [declarationTransformer] });

            const output = execFileSync(process.execPath, [join(dir, 'main.js')], { encoding: 'utf8' });
            expect(JSON.parse(output)).toEqual(['id', 'Context', expect.any(String)]);
            expect(readFileSync(join(dir, 'index.d.ts'), 'utf8')).toContain('export { __ΩContext, __ΩUnit } from "./context.js";');
        } finally {
            rmSync(dir, { recursive: true, force: true });
        }
    }
});
