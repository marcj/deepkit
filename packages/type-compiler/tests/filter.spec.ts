import { expect, test } from '@jest/globals';
import { join } from 'path';

import { createFilter, expandBraces, isGlobMatch } from '../src/filter.js';
import { patternMatch } from '../src/resolver.js';

test('expandBraces', () => {
    expect(expandBraces('a.ts')).toEqual(['a.ts']);
    expect(expandBraces('*.{ts,tsx}')).toEqual(['*.ts', '*.tsx']);
    expect(expandBraces('{a,{b,c}}d')).toEqual(['ad', 'bd', 'cd']);
    expect(expandBraces('src/{a,b}/{x,y}')).toEqual(['src/a/x', 'src/a/y', 'src/b/x', 'src/b/y']);
    expect(expandBraces('x{1..3}')).toEqual(['x1', 'x2', 'x3']);
    expect(expandBraces('x{a..c}')).toEqual(['xa', 'xb', 'xc']);
    expect(expandBraces('a{,b}')).toEqual(['a', 'ab']);
    expect(expandBraces('{a}')).toEqual(['{a}']);
    expect(expandBraces('\\{a,b}')).toEqual(['\\{a,b}']);
});

test('isGlobMatch star', () => {
    expect(isGlobMatch('test.ts', '*.ts')).toBe(true);
    expect(isGlobMatch('a/test.ts', '*.ts')).toBe(false);
    expect(isGlobMatch('.a.ts', '*.ts')).toBe(false);
    expect(isGlobMatch('/app/q/x.ts', '/app/*/x.ts')).toBe(true);
    expect(isGlobMatch('/app/x.ts', '/app/*/x.ts')).toBe(false);
    expect(isGlobMatch('axbxc', 'a*b*c')).toBe(true);
    expect(isGlobMatch('abc', 'a*b*c')).toBe(true);
    expect(isGlobMatch('aXb', 'a**b')).toBe(true);
    expect(isGlobMatch('lib.dom.d.ts', 'lib.dom*.d.ts')).toBe(true);
    expect(isGlobMatch('lib.dom.iterable.d.ts', 'lib.dom*.d.ts')).toBe(true);
    expect(isGlobMatch('/ts/lib/lib.dom.d.ts', 'lib.dom*.d.ts')).toBe(false);
    expect(isGlobMatch('lib.es2017.typedarrays.d.ts', '*typedarrays.d.ts')).toBe(true);
    expect(isGlobMatch('', '*')).toBe(false);
});

test('isGlobMatch globstar', () => {
    expect(isGlobMatch('test.ts', '**/*.ts')).toBe(true);
    expect(isGlobMatch('a/b/c.ts', '**/*.ts')).toBe(true);
    expect(isGlobMatch('/a/b/c.ts', '**/*.ts')).toBe(true);
    expect(isGlobMatch('a/.hidden/x.ts', '**/*.ts')).toBe(false);
    expect(isGlobMatch('a/b/c', '**')).toBe(true);
    expect(isGlobMatch('/a', '**')).toBe(true);
    expect(isGlobMatch('.hidden/x', '**')).toBe(false);
    expect(isGlobMatch('a', 'a/**')).toBe(true);
    expect(isGlobMatch('a/b/c', 'a/**')).toBe(true);
    expect(isGlobMatch('ab', 'a/**')).toBe(false);
    expect(isGlobMatch('a/b', 'a/**/b')).toBe(true);
    expect(isGlobMatch('a/x/y/b', 'a/**/b')).toBe(true);
    expect(isGlobMatch('a/b/c', 'a/b/**/**/c')).toBe(true);
    expect(isGlobMatch('/app/src/tests/test.ts', '/app/src/tests/**/test.ts')).toBe(true);
    expect(isGlobMatch('/app/src/tests/bla/bla2/test.ts', '/app/src/tests/**/test.ts')).toBe(true);
    expect(isGlobMatch('/app/.git/x.ts', '/app/**/*.ts')).toBe(false);
    expect(isGlobMatch('a/.hidden/x', '**/.hidden/*')).toBe(true);
});

test('isGlobMatch question mark, classes, braces, escapes', () => {
    expect(isGlobMatch('a.ts', '?.ts')).toBe(true);
    expect(isGlobMatch('ab.ts', '?.ts')).toBe(false);
    expect(isGlobMatch('.ts', '?.ts')).toBe(false);
    expect(isGlobMatch('a/1/c', 'a/?/c')).toBe(true);
    expect(isGlobMatch('a.ts', '[abc].ts')).toBe(true);
    expect(isGlobMatch('d.ts', '[abc].ts')).toBe(false);
    expect(isGlobMatch('bx', '[^a]x')).toBe(true);
    expect(isGlobMatch('ax', '[^a]x')).toBe(false);
    expect(isGlobMatch('b', '[a-c]*')).toBe(true);
    expect(isGlobMatch('/app/x.tsx', '/app/**/*.{ts,tsx}')).toBe(true);
    expect(isGlobMatch('src/a/q/r.ts', 'src/{a,b}/**/*.ts')).toBe(true);
    expect(isGlobMatch('src/c/x.ts', 'src/{a,b}/**/*.ts')).toBe(false);
    expect(isGlobMatch('x2.ts', 'x{1..3}.ts')).toBe(true);
    expect(isGlobMatch('x4.ts', 'x{1..3}.ts')).toBe(false);
    expect(isGlobMatch('*.ts', '\\*.ts')).toBe(true);
    expect(isGlobMatch('a.ts', '\\*.ts')).toBe(false);
    expect(isGlobMatch('a+b', 'a+b')).toBe(true);
    expect(isGlobMatch('a.b', 'a.b')).toBe(true);
    expect(isGlobMatch('aab', 'a.b')).toBe(false);
    expect(isGlobMatch('src/x.ts', './src/*.ts')).toBe(true);
});

test('isGlobMatch ignore', () => {
    expect(isGlobMatch('src/x.ts', ['src/**/*.ts'], ['src/lib/**/*.ts'])).toBe(true);
    expect(isGlobMatch('src/lib/x.ts', ['src/**/*.ts'], ['src/lib/**/*.ts'])).toBe(false);
    expect(isGlobMatch('a.ts', [], ['a.ts'])).toBe(false);

    expect(patternMatch('src/x.ts', ['!src/lib/**/*.ts', 'src/**/*.ts'])).toBe(true);
    expect(patternMatch('src/lib/x.ts', ['!src/lib/**/*.ts', 'src/**/*.ts'])).toBe(false);
});

test('createFilter', () => {
    const cwd = process.cwd();

    const filter = createFilter(['**/*.tsx', '**/*.ts'], 'node_modules/**');
    expect(filter(join(cwd, 'src/app.ts'))).toBe(true);
    expect(filter(join(cwd, 'src/app.tsx'))).toBe(true);
    expect(filter('/other/src/app.ts')).toBe(true);
    expect(filter(join(cwd, '.hidden/app.ts'))).toBe(true);
    expect(filter(join(cwd, 'src/app.js'))).toBe(false);
    expect(filter(join(cwd, 'node_modules/a/index.ts'))).toBe(false);
    expect(filter('/other/node_modules/a/index.ts')).toBe(true);
    expect(filter('app.ts\0')).toBe(false);
    expect(filter(undefined)).toBe(false);

    const all = createFilter();
    expect(all('anything')).toBe(true);
    expect(all('x\0')).toBe(false);
    expect(all(1)).toBe(false);

    const regExp = createFilter(/\.ts$/g, [/excluded/]);
    expect(regExp('a.ts')).toBe(true);
    expect(regExp('a.ts')).toBe(true);
    expect(regExp('excluded/a.ts')).toBe(false);
    expect(regExp('a.js')).toBe(false);

    const excludeOnly = createFilter(null, 'src/*.ts');
    expect(excludeOnly(join(cwd, 'src/a.ts'))).toBe(false);
    expect(excludeOnly(join(cwd, 'src/a.js'))).toBe(true);
    expect(excludeOnly('src/a.ts')).toBe(true);

    const resolved = createFilter('src/*.ts', undefined, { resolve: '/base(1)' });
    expect(resolved('/base(1)/src/a.ts')).toBe(true);
    expect(resolved('/base1/src/a.ts')).toBe(false);

    const unresolved = createFilter('src/*.ts', undefined, { resolve: false });
    expect(unresolved('src/a.ts')).toBe(true);
    expect(unresolved(join(cwd, 'src/a.ts'))).toBe(false);
});
