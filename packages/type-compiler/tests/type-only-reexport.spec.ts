import { expect, test } from '@jest/globals';

import { transpile } from './utils.js';

//#220, a class re-exported as type doesn't exist at runtime, so there can be no reference to it
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
    expect(res.app).toContain(`'Element'`);
});

test('through a namespace import', () => {
    const res = transpile({
        app: `import * as lib from 'lib';\nexport class Service { parse(ele: lib.Element): void {} }`,
        [lib]: `export type { Element } from 'dep';`,
        ...dep,
    });
    expect(res.app).not.toContain('lib.Element');
});

test.each([
    ['export from', `export { Element } from 'dep';`],
    ['export *', `export * from 'dep';`],
    ['import, then export', `import { Element } from 'dep';\nexport { Element };`],
])('control: %s keeps the runtime reference', (name, source) => {
    const res = transpile({ app, [lib]: source, ...dep });
    expect(res.app).toContain('() => lib_1.Element');
});
