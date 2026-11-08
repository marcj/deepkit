import { expect, test } from '@jest/globals';
import { execFileSync } from 'child_process';
import { mkdtempSync, rmSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import * as ts from 'typescript';

import { declarationTransformer, transformer } from '../src/compiler.js';

test('namespace import only used as type', () => {
    // `import * as models`: TypeScript removes the import if only used in types, but classes need it at runtime (#729)
    for (const module of [ts.ModuleKind.CommonJS, ts.ModuleKind.ES2020]) {
        const dir = mkdtempSync(join(tmpdir(), 'deepkit-namespace-import-'));
        try {
            const files: Record<string, string> = {
                'tsconfig.json': JSON.stringify({ reflection: true }),
                'package.json': JSON.stringify({ type: module === ts.ModuleKind.CommonJS ? 'commonjs' : 'module' }),
                'models.ts': `export interface User { name: string }\nexport class UserRecord {}`,
                'app.ts': `import * as models from './models.js';\nexport type A = models.User;\nexport type B = models.UserRecord;`,
                'main.js': module === ts.ModuleKind.CommonJS
                    ? `const { __ΩA, __ΩB } = require('./app.js');\nconsole.log(JSON.stringify([__ΩA[0](), __ΩB[0]().name]));`
                    : `import { __ΩA, __ΩB } from './app.js';\nconsole.log(JSON.stringify([__ΩA[0](), __ΩB[0]().name]));`,
            };
            for (const [name, content] of Object.entries(files)) writeFileSync(join(dir, name), content);
            const options: ts.CompilerOptions = { module, target: ts.ScriptTarget.ES2020, declaration: true, configFilePath: join(dir, 'tsconfig.json') };
            ts.createProgram([join(dir, 'app.ts')], options).emit(undefined, undefined, undefined, false, { before: [transformer], afterDeclarations: [declarationTransformer] });

            const output = execFileSync(process.execPath, [join(dir, 'main.js')], { encoding: 'utf8' });
            expect(JSON.parse(output)).toEqual([['name', 'User', expect.any(String)], 'UserRecord']);
        } finally {
            rmSync(dir, { recursive: true, force: true });
        }
    }
});
