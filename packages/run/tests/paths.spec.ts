import { afterAll, beforeAll, expect, test } from '@jest/globals';
import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import { dirname, join } from 'path';

import { createMatchPath } from '../paths.js';

let root = '';
const extensions = ['.ts', '.js', '.mjs'];
const fileExists = (path: string) => existsSync(path);

beforeAll(() => {
    root = mkdtempSync(join(tmpdir(), 'deepkit-run-paths-'));
    const files: { [path: string]: string } = {
        'src/lib/a.ts': '',
        'src/lib/b.js': '',
        'src/models/index.ts': '',
        'src/pkg/package.json': '{"main": "main.js"}',
        'src/pkg/main.js': '',
        'src/nomain/package.json': '{"name": "nomain"}',
        'shared/util/index.js': '',
        'src/x.ts': '',
    };
    for (const [path, content] of Object.entries(files)) {
        mkdirSync(dirname(join(root, path)), { recursive: true });
        writeFileSync(join(root, path), content);
    }
});

afterAll(() => {
    rmSync(root, { recursive: true, force: true });
});

test('wildcard and exact patterns', () => {
    const matchPath = createMatchPath(root, {
        '@lib/*': ['src/lib/*'],
        '@models': ['src/models'],
        '@shared/*': ['shared/*', 'src/*'],
        '@pkg': ['src/pkg'],
        '@nomain': ['src/nomain'],
        '@x/*/y': ['src/*'],
    });

    // files matched via an extension are returned without extension
    expect(matchPath('@lib/a', fileExists, extensions)).toBe(join(root, 'src/lib/a'));
    expect(matchPath('@lib/a.ts', fileExists, extensions)).toBe(join(root, 'src/lib/a.ts'));
    expect(matchPath('@lib/b', fileExists, extensions)).toBe(join(root, 'src/lib/b'));
    expect(matchPath('@lib/nope', fileExists, extensions)).toBe(undefined);
    // the directory itself exists, so it is returned before its index file
    expect(matchPath('@models', fileExists, extensions)).toBe(join(root, 'src/models'));
    expect(matchPath('@shared/util', fileExists, extensions)).toBe(join(root, 'shared/util'));
    // second path of a pattern
    expect(matchPath('@shared/x', fileExists, extensions)).toBe(join(root, 'src/x'));
    expect(matchPath('@x/x/y', fileExists, extensions)).toBe(join(root, 'src/x'));
    expect(matchPath('@nomain', fileExists, extensions)).toBe(join(root, 'src/nomain'));
    // relative specifiers are never mapped
    expect(matchPath('./src/x', fileExists, extensions)).toBe(undefined);
    expect(matchPath('', fileExists, extensions)).toBe(undefined);
    // implicit `*` mapping to baseUrl
    expect(matchPath('src/x', fileExists, extensions)).toBe(join(root, 'src/x'));
    expect(matchPath('not-existing-module', fileExists, extensions)).toBe(undefined);
});

test('index file and package.json main', () => {
    const files = new Set([join(root, 'src/models/index.ts'), join(root, 'src/pkg/main.js')]);
    const matchPath = createMatchPath(root, { '@models': ['src/models'], '@pkg': ['src/pkg'] });
    expect(matchPath('@models', path => files.has(path), extensions)).toBe(join(root, 'src/models'));
    expect(matchPath('@pkg', path => files.has(path), extensions)).toBe(join(root, 'src/pkg/main.js'));
});

test('longest prefix wins', () => {
    const matchPath = createMatchPath(root, { '*': ['shared/*'], '@lib/*': ['src/lib/*'], 'src/*': ['src/lib/*'] });
    expect(matchPath('@lib/a', fileExists, extensions)).toBe(join(root, 'src/lib/a'));
    expect(matchPath('src/a', fileExists, extensions)).toBe(join(root, 'src/lib/a'));
    expect(matchPath('util', fileExists, extensions)).toBe(join(root, 'shared/util'));
    // explicit `*` replaces the implicit baseUrl mapping
    expect(matchPath('src/x', fileExists, extensions)).toBe(undefined);
});
