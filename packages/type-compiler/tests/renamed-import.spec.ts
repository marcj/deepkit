import { expect, test } from '@jest/globals';
import { execFileSync } from 'child_process';
import { mkdtempSync, rmSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import * as ts from 'typescript';

import { declarationTransformer, transformer } from '../src/compiler.js';

test('renamed interface import', () => {
    // `import { User as Account }`: the module exports __ΩUser, not __ΩAccount (#727)
    for (const module of [ts.ModuleKind.CommonJS, ts.ModuleKind.ES2020]) {
        const dir = mkdtempSync(join(tmpdir(), 'deepkit-renamed-import-'));
        try {
            const files: Record<string, string> = {
                'tsconfig.json': JSON.stringify({ reflection: true }),
                'package.json': JSON.stringify({ type: module === ts.ModuleKind.CommonJS ? 'commonjs' : 'module' }),
                'models.ts': `export interface User { name: string }`,
                'app.ts': `import { User as Account } from './models.js';\nexport type A = Account;`,
                'main.js': module === ts.ModuleKind.CommonJS
                    ? `console.log(JSON.stringify(require('./app.js').__ΩA[0]()));`
                    : `import { __ΩA } from './app.js';\nconsole.log(JSON.stringify(__ΩA[0]()));`,
            };
            for (const [name, content] of Object.entries(files)) writeFileSync(join(dir, name), content);
            const options: ts.CompilerOptions = { module, target: ts.ScriptTarget.ES2020, declaration: true, configFilePath: join(dir, 'tsconfig.json') };
            ts.createProgram([join(dir, 'app.ts')], options).emit(undefined, undefined, undefined, false, { before: [transformer], afterDeclarations: [declarationTransformer] });

            const output = execFileSync(process.execPath, [join(dir, 'main.js')], { encoding: 'utf8' });
            expect(JSON.parse(output)).toEqual(['name', 'User', expect.any(String)]);
        } finally {
            rmSync(dir, { recursive: true, force: true });
        }
    }
});
