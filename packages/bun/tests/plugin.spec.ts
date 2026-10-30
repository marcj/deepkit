import { expect, test } from '@jest/globals';
import { spawnSync } from 'child_process';
import { existsSync, mkdtempSync, readFileSync, rmSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';

const fixture = join(__dirname, 'fixture');
const root = join(__dirname, '../../..');

const hasBun = spawnSync('bun', ['--version']).status === 0;
if (!hasBun) console.warn('bun not installed, skipping @deepkit/bun plugin tests');
const bunTest = hasBun ? test : test.skip;

function run(cmd: string, args: string[], cwd: string) {
    const res = spawnSync(cmd, args, { cwd, encoding: 'utf8' });
    if (res.status !== 0) throw new Error(`${cmd} ${args.join(' ')} failed:\n${res.stdout}\n${res.stderr}`);
    return res.stdout;
}

function ensureTypeCompilerEsm() {
    // Bun resolves `@deepkit/type-compiler` via the "default" export condition (dist/esm),
    // while the regular build (`npm run tsc`) only produces dist/cjs.
    if (existsSync(join(root, 'packages/type-compiler/dist/esm/index.js'))) return;
    run(process.execPath, [join(root, 'node_modules/typescript/bin/tsc'), '--build', '--force', 'packages/type-compiler/tsconfig.esm.json'], root);
}

bunTest(
    'Bun.build() with deepkitType() plugin emits runtime types',
    () => {
        ensureTypeCompilerEsm();
        const outDir = mkdtempSync(join(tmpdir(), 'deepkit-bun-'));
        try {
            run('bun', ['build.ts', outDir], fixture);
            const code = readFileSync(join(outDir, 'model.js'), 'utf8');
            expect(code).toContain('static __type');
            expect(code).toContain('__ΩUser');
            // bun prints the property as receiveType.Ω or receiveType["Ω"], depending on its version
            expect(code).toMatch(/receiveType(\.Ω|\["Ω"\]) = \[\[/);
        } finally {
            rmSync(outDir, { recursive: true, force: true });
        }
    },
    60_000,
);

bunTest(
    'runtime preload plugin emits runtime types',
    () => {
        ensureTypeCompilerEsm();
        const out = JSON.parse(run('bun', ['--preload', '../../index.ts', 'run.ts'], fixture));
        expect(Array.isArray(out.dogType)).toBe(true);
        expect(out.dogType).toContain('Dog');
        expect(Array.isArray(out.userType)).toBe(true);
    },
    60_000,
);

bunTest(
    'without plugin there are no runtime types (sanity check)',
    () => {
        const out = JSON.parse(run('bun', ['run.ts'], fixture));
        expect(out.dogType).toBeUndefined();
        expect(out.userType).toBeUndefined();
    },
    60_000,
);
