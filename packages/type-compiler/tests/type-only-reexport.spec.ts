import { describe, expect, test } from '@jest/globals';

import { transpile } from './utils.js';

//#220, a class re-exported as type doesn't exist in the re-exporting module at runtime, only in the module it comes from
const dep = { 'node_modules/dep/index.d.ts': 'export declare class Element { a: string }' };
const app = `import { Element } from 'lib';\nexport class Service { parse(ele: Element): void {} }`;
const lib = 'node_modules/lib/index.d.ts';

test.each([
    ['export type from', `export type { Element } from 'dep';`],
    ['type modifier on the element', `export { type Element } from 'dep';`],
    ['export type *', `export type * from 'dep';`],
    ['import type, then export type', `import type { Element } from 'dep';\nexport type { Element };`],
    ['import type, then export', `import type { Element } from 'dep';\nexport { Element };`],
    ['import, then export type', `import { Element } from 'dep';\nexport type { Element };`],
])('%s', (name, source) => {
    const res = transpile({ app, [lib]: source, ...dep });
    expect(res.app).not.toContain('() => Element');
    expect(res.app).not.toContain('() => lib_1.Element');
    expect(res.app).toContain(`Element: __Ωref0 } = require("dep")`);
    expect(res.app).toContain('() => __Ωref0');
});

test('through a namespace import', () => {
    const res = transpile({
        app: `import * as lib from 'lib';\nexport class Service { parse(ele: lib.Element): void {} }`,
        [lib]: `export type { Element } from 'dep';`,
        ...dep,
    });
    expect(res.app).not.toContain('lib.Element');
    expect(res.app).toContain('() => __Ωref0');
});

test('a renamed class is imported by its exported name', () => {
    const res = transpile({
        app,
        [lib]: `export type { Original as Element } from 'dep';`,
        'node_modules/dep/index.d.ts': 'export declare class Original { a: string }',
    });
    expect(res.app).toContain(`Original: __Ωref0 } = require("dep")`);
});

test('one import per class, several per file', () => {
    const res = transpile({
        app: `import { Element, Other } from 'lib';\nexport class Service { a(a: Element): void {} b(a: Element): void {} c(a: Other): void {} }`,
        [lib]: `export type { Element, Other } from 'dep';`,
        'node_modules/dep/index.d.ts': 'export declare class Element { a: string }\nexport declare class Other { a: string }',
    });
    expect(res.app.match(/require\("dep"\)/g)).toHaveLength(1);
    expect(res.app).toContain('Element: __Ωref0, Other: __Ωref1');
});

test.each([
    ['a dependency only the library can resolve', { [lib]: `export type { Element } from 'dep';`, 'node_modules/lib/node_modules/dep/index.d.ts': 'export declare class Element { a: string }' }],
    ['another version of the dependency for this file', { [lib]: `export type { Element } from 'dep';`, 'node_modules/lib/node_modules/dep/index.d.ts': 'export declare class Element { a: string }', 'node_modules/dep/index.d.ts': 'export declare class Element { b: string }' }],
    ['a path relative to the library', { [lib]: `export type { Element } from './internal';`, 'node_modules/lib/internal.d.ts': 'export declare class Element { a: string }' }],
    ['a class only the library file declares', { [lib]: `declare class Element { a: string }\nexport type { Element };` }],
    ['a dependency which re-exports it as type too and then has no value', { [lib]: `export type { Element } from 'dep';`, 'node_modules/dep/index.d.ts': `declare class Element { a: string }\nexport type { Element };` }],
])('no import for %s', (name, files) => {
    const res = transpile({ app, ...files });
    expect(res.app).not.toContain('__Ωref');
    expect(res.app).not.toContain('() => lib_1.Element');
    expect(res.app).toContain(`'Element'`);
});

test('import type stays without a runtime reference', () => {
    const res = transpile({
        app: `import type { Element } from 'lib';\nexport class Service { parse(ele: Element): void {} }`,
        [lib]: `export type { Element } from 'dep';`,
        ...dep,
    });
    expect(res.app).not.toContain('__Ωref');
});

test.each([
    ['export from', `export { Element } from 'dep';`],
    ['export *', `export * from 'dep';`],
    ['import, then export', `import { Element } from 'dep';\nexport { Element };`],
])('control: %s keeps the runtime reference', (name, source) => {
    const res = transpile({ app, [lib]: source, ...dep });
    expect(res.app).toContain('() => lib_1.Element');
});

describe('types behind export type *, which has no __Ω exports at runtime', () => {
    const models = { 'models.ts': 'export interface Model { a: string }\nexport type Alias = { b: string };' };

    test('import', () => {
        const res = transpile({ app: `import { Model, Alias } from './ns';\nexport type A = Model; export type B = Alias;`, 'ns.ts': `export type * from './models';`, ...models });
        expect(res.app).not.toContain('__ΩModel }');
        expect(res.app).not.toContain('require("./ns")');
        expect(res.app).toContain(`'Model'`);
        expect(res.app).toContain(`'Alias'`);
    });

    test('namespace import', () => {
        const res = transpile({ app: `import * as ns from './ns';\nexport type A = ns.Model;`, 'ns.ts': `export type * from './models';`, ...models });
        expect(res.app).not.toContain('__ΩModel');
        expect(res.app).toContain(`'Model'`);
    });

    test('through several files', () => {
        const res = transpile({ app: `import * as ns from './ns';\nexport type A = ns.Model;`, 'ns.ts': `export type * from './middle';`, 'middle.ts': `export type * from './models';`, ...models });
        expect(res.app).not.toContain('__ΩModel');
    });

    test('the layout of a generated Prisma client', () => {
        const res = transpile({
            'client.ts': `import * as Prisma from './internal/prismaNamespace';\nexport type Inserted = Prisma.InsertedModel;`,
            'internal/prismaNamespace.ts': `import type * as Prisma from '../models';\nexport type * from '../models';\nexport type Other = Prisma.InsertedModel;`,
            'models.ts': `export type * from './models/Inserted';`,
            'models/Inserted.ts': `export type InsertedModel = { a: string };`,
        });
        expect(res['client.ts'] ?? res.client).not.toContain('__ΩInsertedModel');
    });

    test('control: export * keeps the import', () => {
        const res = transpile({ app: `import { Model } from './ns';\nexport type A = Model;`, 'ns.ts': `export * from './models';`, ...models });
        expect(res.app).toContain('__ΩModel');
    });

    test('control: a named export type keeps the import', () => {
        const res = transpile({ app: `import { Model } from './ns';\nexport type A = Model;`, 'ns.ts': `export type { Model } from './models';`, ...models });
        expect(res.app).toContain('__ΩModel');
    });
});
