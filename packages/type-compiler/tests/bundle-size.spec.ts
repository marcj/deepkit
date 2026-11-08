import { expect, test } from '@jest/globals';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import { dirname, join } from 'path';
import * as ts from 'typescript';

import { declarationTransformer, transformer } from '../src/compiler.js';

/**
 * Tracks how much JavaScript the type compiler emits, so it never grows unnoticed. Byte counts are deterministic, so
 * unlike benchmarks the tolerance can be tight. It's part of `npm run test` and thus of the test certificate.
 *
 * Uses a real ts.Program with a tsconfig.json, because the default excludes (e.g. lib.dom*.d.ts) are resolved from
 * there. The in-memory helpers of tests/utils.ts don't apply them and embed the whole DOM.
 *
 * After an intended change: UPDATE_BUNDLE_SIZE=1 npm run test packages/type-compiler/tests/bundle-size
 */
const baselineFile = join(__dirname, 'bundle-size.baseline.json');
const tolerance = 0.02;
const minimumSlack = 8; //bytes, so that small samples don't fail on a renamed variable

const domTypes = ['__ΩElement', '__ΩHTMLElement', '__ΩNode', '__ΩEvent', '__ΩDocument', '__ΩEventTarget'];

const samples: Record<string, Record<string, string>> = {
    class: {
        'app.ts': `export class User {
            id: number = 0;
            name: string = '';
            tags: string[] = [];
            created?: Date;
            constructor(public email: string) {}
            greet(other: User, times: number = 1): string { return other.name + times; }
        }`,
    },
    'interface and aliases': {
        'app.ts': `export interface User { id: number; name?: string; address: { city: string; zip: string } }
        export type Id = string | number;
        export type Status = 'active' | 'inactive' | 'banned';
        export type Users = User[];`,
    },
    generics: {
        'app.ts': `export interface Box<T> { value: T }
        export type Page<T, K extends keyof T = keyof T> = { items: Box<T>[]; sort?: K; total: number };
        export class Repository<T> { items: T[] = []; find(id: number): T | undefined { return this.items[id]; } }`,
    },
    'mapped and conditional types': {
        'app.ts': `export type Draft<T> = { readonly [K in keyof T]?: T[K] };
        export type Unwrap<T> = T extends Promise<infer U> ? U : T;
        export type Keys = keyof { a: string; b: number };
        export type Pattern = Record<\`x\${string}\`, number>;`,
    },
    functions: {
        'app.ts': `export function add(a: number, b: number): number { return a + b; }
        export const sub = (a: number, b: number): number => a - b;
        export const math = {
            mul(a: number, b: number): number { return a * b; },
            add(a: number, b: number): number { return add(a, b); },
        };
        export function generic<T>(value: T, type?: { __meta?: never } ): T { return value; }
        generic<string>('a');`,
    },
    imports: {
        'models.ts': `export interface User { name: string }\nexport class Record { name: string = ''; }\nexport type Id = number;`,
        'app.ts': `import { User, Record, Id } from './models.js';
        import { User as Account } from './models.js';
        import * as models from './models.js';
        export class Service { constructor(public a: User, public b: Record, public c: Id, public d: Account, public e: models.User, public f: models.Record) {} }`,
    },
    'library class': {
        'node_modules/lib/index.d.ts': `export declare class Client { id: number }\nexport interface Options { key: string }`,
        'app.ts': `import { Client, Options } from 'lib';\nexport class Service { constructor(public client: Client, public options: Options) {} }`,
    },
    'type-only re-export of a class': {
        'node_modules/dep/index.d.ts': `export declare class Element { a: string }`,
        'node_modules/lib/index.d.ts': `export type { Element } from 'dep';`,
        'app.ts': `import { Element } from 'lib';\nexport class Service { parse(ele: Element): void {} }`,
    },
    'DOM types in a signature': {
        'app.ts': `export class View { render(el: Element, html: HTMLElement, node: Node, event: Event, doc: Document): void {} }`,
    },
    'DOM type aliases': {
        'app.ts': `export type A = HTMLElement;\nexport type B = Partial<Element>;\nexport interface C { target: EventTarget; el: HTMLElement }`,
    },
};

function emit(files: Record<string, string>, reflection: boolean | 'never'): string {
    const dir = mkdtempSync(join(tmpdir(), 'deepkit-bundle-size-'));
    try {
        const all = { ...files, 'tsconfig.json': JSON.stringify({ reflection }), 'package.json': JSON.stringify({ type: 'commonjs' }) };
        for (const [name, content] of Object.entries(all)) {
            mkdirSync(dirname(join(dir, name)), { recursive: true });
            writeFileSync(join(dir, name), content);
        }
        //the compiler finds the global lib files through typescript/lib, as in a real project. Without this no global is resolved.
        mkdirSync(join(dir, 'node_modules'), { recursive: true });
        symlinkSync(dirname(require.resolve('typescript/package.json')), join(dir, 'node_modules/typescript'), 'dir');
        const options: ts.CompilerOptions = {
            module: ts.ModuleKind.CommonJS,
            target: ts.ScriptTarget.ES2020,
            types: [],
            skipLibCheck: true,
            newLine: ts.NewLineKind.LineFeed,
            configFilePath: join(dir, 'tsconfig.json'),
        };
        const roots = Object.keys(files).filter(v => !v.startsWith('node_modules/')).map(v => join(dir, v));
        const output: Record<string, string> = {};
        ts.createProgram(roots, options).emit(undefined, (name, text) => {
            if (name.endsWith('.js')) output[name] = text;
        }, undefined, false, { before: [transformer], afterDeclarations: [declarationTransformer] });
        return Object.keys(output).sort().map(v => output[v]).join('\n');
    } finally {
        rmSync(dir, { recursive: true, force: true });
    }
}

test('emitted size stays within the baseline', () => {
    const current: Record<string, { plain: number; reflected: number }> = {};
    for (const [name, files] of Object.entries(samples)) {
        current[name] = { plain: emit(files, 'never').length, reflected: emit(files, true).length };
    }

    if (process.env.UPDATE_BUNDLE_SIZE) {
        writeFileSync(baselineFile, JSON.stringify({ typescript: ts.version, samples: current }, null, 2) + '\n');
        return;
    }

    expect(existsSync(baselineFile)).toBe(true);
    const baseline = JSON.parse(readFileSync(baselineFile, 'utf8')) as { typescript: string; samples: typeof current };
    const problems: string[] = [];
    for (const [name, { reflected }] of Object.entries(current)) {
        const expected = baseline.samples[name]?.reflected;
        if (expected === undefined) {
            problems.push(`${name}: not in the baseline`);
            continue;
        }
        const slack = Math.max(minimumSlack, expected * tolerance);
        if (reflected > expected + slack) problems.push(`${name}: grew from ${expected} to ${reflected} bytes`);
        if (reflected < expected - slack) problems.push(`${name}: shrank from ${expected} to ${reflected} bytes, update the baseline to keep the gain`);
    }
    for (const name of Object.keys(baseline.samples)) {
        if (!current[name]) problems.push(`${name}: in the baseline but no longer a sample`);
    }
    //if intended: UPDATE_BUNDLE_SIZE=1 npm run test packages/type-compiler/tests/bundle-size
    expect(problems).toEqual([]);
});

test('DOM types are never embedded', () => {
    for (const name of ['DOM types in a signature', 'DOM type aliases']) {
        const output = emit(samples[name], true);
        for (const domType of domTypes) expect(output).not.toContain(domType);
        expect(output.length).toBeLessThan(2000);
    }
});
