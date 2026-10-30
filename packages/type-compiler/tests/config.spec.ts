import { expect, test } from '@jest/globals';
import { ParseConfigHost, ScriptTarget } from 'typescript';

import { TsConfigJson, defaultExcluded, ConfigResolver, getConfigResolver } from '../src/config.js';
import { patternMatch } from '../src/resolver.js';

process.env.DEBUG = 'deepkit';

function buildHost(files: { [fileName: string]: TsConfigJson }): ParseConfigHost {
    return {
        useCaseSensitiveFileNames: true,
        fileExists: (fileName: string) => {
            return !!files[fileName];
        },
        readFile: (fileName: string) => {
            return JSON.stringify(files[fileName]);
        },
        readDirectory: (path: string, extensions?: readonly string[], exclude?: readonly string[], include?: readonly string[], depth?: number) => {
            path = path.endsWith('/') ? path : path + '/';
            const res = Object.entries(files)
                .filter(([fileName]) => fileName.startsWith(path))
                .map(([fileName]) => fileName);
            if (extensions) return res.filter(fileName => extensions.includes(fileName.split('.').pop()!));
            return res;
        },
        trace: (s: string) => console.log(s),
        directoryExists: (path: string) => {
            path = path.endsWith('/') ? path : path + '/';
            return Object.keys(files).some(fileName => fileName.startsWith(path));
        },
        realpath: (path: string) => path,
    };
}

function expectDefaultExcluded(resolver: ConfigResolver) {
    expect(resolver.match('lib.dom.d.ts').mode).toEqual('never');
    expect(resolver.match('lib.dom.iterable.d.ts').mode).toEqual('never');
    expect(resolver.match('lib.es2017.typedarrays.d.ts').mode).toEqual('never');
}

test('patternMatch', () => {
    expect(patternMatch('test.ts', ['test.ts'])).toBe(true);
    expect(patternMatch('test.ts', ['*.ts'])).toBe(true);
    expect(patternMatch('test.ts', ['**/*.ts'])).toBe(true);

    expect(patternMatch('/app/src/tests/test.ts', ['/app/src/tests/test.ts'])).toBe(true);
    expect(patternMatch('/app/src/tests/test.ts', ['/app/src/tests/*.ts'])).toBe(true);
    expect(patternMatch('/app/src/tests/test.ts', ['/app/src/tests/**/*.ts'])).toBe(true);

    expect(patternMatch('/app/src/tests/test.ts', ['/app/src/tests/**/test.ts'])).toBe(true);
    expect(patternMatch('/app/src/tests/bla/test.ts', ['/app/src/tests/**/test.ts'])).toBe(true);
    expect(patternMatch('/app/src/tests/bla/bla2/test.ts', ['/app/src/tests/**/test.ts'])).toBe(true);
});

test('empty config', () => {
    const host = buildHost({
        'tsconfig.json': {},
    });

    const resolver = getConfigResolver({}, host, {}, { fileName: 'test.ts' });
    expect(resolver.config).toEqual({
        path: 'tsconfig.json',
        compilerOptions: {configFilePath: 'tsconfig.json'},
        reflection: undefined,
        mergeStrategy: 'merge',
        exclude: defaultExcluded,
    });

    expect(resolver.match('test.ts')).toEqual({
        tsConfigPath: 'tsconfig.json',
        mode: 'never',
    });
    expectDefaultExcluded(resolver);
});

test('simple config', () => {
    const host = buildHost({
        'tsconfig.json': {
            reflection: true,
        },
    });

    const resolver = getConfigResolver({}, host, {}, { fileName: 'test.ts' });
    expect(resolver.config).toEqual({
        path: 'tsconfig.json',
        compilerOptions: {configFilePath: 'tsconfig.json'},
        reflection: 'default',
        mergeStrategy: 'merge',
        exclude: defaultExcluded,
    });

    expect(resolver.match('test.ts')).toEqual({
        tsConfigPath: 'tsconfig.json',
        mode: 'default',
    });
    expectDefaultExcluded(resolver);
});

test('simple config with exclude', () => {
    const host = buildHost({
        'tsconfig.json': {
            deepkitCompilerOptions: {
                reflection: true,
                exclude: ['test.ts'],
            },
        },
    });

    const resolver = getConfigResolver({}, host, {}, { fileName: 'test.ts' });
    expect(resolver.config).toEqual({
        path: 'tsconfig.json',
        compilerOptions: {configFilePath: 'tsconfig.json'},
        reflection: 'default',
        mergeStrategy: 'merge',
        exclude: [...defaultExcluded, 'test.ts'],
    });

    expect(resolver.match('test.ts')).toEqual({
        tsConfigPath: 'tsconfig.json',
        mode: 'never',
    });
    expectDefaultExcluded(resolver);
});

test('disable parent', () => {
    const host = buildHost({
        'tsconfig.base.json': {
            reflection: true,
        },
        'tsconfig.json': {
            extends: './tsconfig.base.json',
            reflection: false,
        },
    });

    const resolver = getConfigResolver({}, host, {}, { fileName: 'test.ts' });
    expect(resolver.config).toEqual({
        path: 'tsconfig.json',
        compilerOptions: {configFilePath: 'tsconfig.json'},
        reflection: 'never',
        mergeStrategy: 'merge',
        exclude: defaultExcluded,
    });

    expect(resolver.match('test.ts')).toEqual({
        tsConfigPath: 'tsconfig.json',
        mode: 'never',
    });
    expectDefaultExcluded(resolver);
});

test('replace strategy does not replace default excludes', () => {
    const host = buildHost({
        'tsconfig.json': {
            deepkitCompilerOptions: {
                reflection: true,
                mergeStrategy: 'replace',
                exclude: ['test.ts'],
            },
        },
    });

    const resolver = getConfigResolver({}, host, {}, { fileName: 'test.ts' });
    expect(resolver.config).toEqual({
        path: 'tsconfig.json',
        compilerOptions: {configFilePath: 'tsconfig.json'},
        mergeStrategy: 'replace',
        reflection: 'default',
        exclude: [...defaultExcluded, 'test.ts'],
    });

    expect(resolver.match('test.ts')).toEqual({
        tsConfigPath: 'tsconfig.json',
        mode: 'never',
    });
    expectDefaultExcluded(resolver);
});

test('replace parent config exclude', () => {
    const host = buildHost({
        'tsconfig.json': {
            deepkitCompilerOptions: {
                reflection: true,
                exclude: ['test.ts'],
            },
        },
        'tsconfig2.json': {
            extends: './tsconfig.json',
            deepkitCompilerOptions: {
                mergeStrategy: 'replace',
                exclude: ['test2.ts'],
            },
        },
    });

    const resolver = getConfigResolver({}, host, {}, { fileName: 'test.ts' }, 'tsconfig2.json');
    expect(resolver.config).toEqual({
        path: 'tsconfig2.json',
        compilerOptions: {configFilePath: 'tsconfig2.json'},
        mergeStrategy: 'replace',
        reflection: 'default',
        exclude: [...defaultExcluded, 'test2.ts'],
    });

    expect(resolver.match('test.ts')).toEqual({
        tsConfigPath: 'tsconfig2.json',
        mode: 'default',
    });
    expect(resolver.match('test2.ts')).toEqual({
        tsConfigPath: 'tsconfig2.json',
        mode: 'never',
    });
    expectDefaultExcluded(resolver);
});

test('extend reflection array', () => {
    const host = buildHost({
        'tsconfig.base.json': {
            deepkitCompilerOptions: {
                reflection: ['test.ts'],
            },
        },
        'tsconfig.json': {
            extends: './tsconfig.base.json',
            deepkitCompilerOptions: {
                reflection: ['test2.ts'],
            },
        },
    });

    const resolver = getConfigResolver({}, host, {}, { fileName: 'test.ts' });
    expect(resolver.config).toEqual({
        path: 'tsconfig.json',
        compilerOptions: {configFilePath: 'tsconfig.json'},
        reflection: ['test.ts', 'test2.ts'],
        mergeStrategy: 'merge',
        exclude: defaultExcluded,
    });

    expect(resolver.match('test.ts')).toEqual({
        tsConfigPath: 'tsconfig.json',
        mode: 'default',
    });
    expectDefaultExcluded(resolver);
});

test('replace reflection array', () => {
    const host = buildHost({
        'tsconfig.base.json': {
            deepkitCompilerOptions: {
                reflection: ['test.ts'],
            },
        },
        'tsconfig.json': {
            extends: './tsconfig.base.json',
            deepkitCompilerOptions: {
                mergeStrategy: 'replace',
                reflection: ['test2.ts'],
            },
        },
    });

    const resolver = getConfigResolver({}, host, {}, { fileName: 'test.ts' });
    expect(resolver.config).toEqual({
        path: 'tsconfig.json',
        compilerOptions: {configFilePath: 'tsconfig.json'},
        reflection: ['test2.ts'],
        mergeStrategy: 'replace',
        exclude: defaultExcluded,
    });

    expect(resolver.match('test.ts')).toEqual({
        tsConfigPath: 'tsconfig.json',
        mode: 'never',
    });
    expectDefaultExcluded(resolver);
});

test('circular extend', () => {
    const host = buildHost({
        'tsconfig.base.json': {
            extends: './tsconfig.json',
            deepkitCompilerOptions: {
                reflection: ['test.ts'],
            },
        },
        'tsconfig.json': {
            extends: './tsconfig.base.json',
            deepkitCompilerOptions: {
                reflection: ['test2.ts'],
            },
        },
    });

    const resolver = getConfigResolver({}, host, {}, { fileName: 'test.ts' });
    expect(resolver.config).toEqual({
        path: 'tsconfig.json',
        compilerOptions: {configFilePath: 'tsconfig.json'},
        reflection: ['test.ts', 'test2.ts'],
        mergeStrategy: 'merge',
        exclude: defaultExcluded,
    });

    expect(resolver.match('test.ts')).toEqual({
        tsConfigPath: 'tsconfig.json',
        mode: 'default',
    });
    expect(resolver.match('test2.ts')).toEqual({
        tsConfigPath: 'tsconfig.json',
        mode: 'default',
    });
    expectDefaultExcluded(resolver);
});

test('regular typescript compilerOptions inheritance', () => {
    const host = buildHost({
        'tsconfig.base.json': {
            compilerOptions: {
                target: 'es2017',
                paths: {
                    '@app/*': ['src/app/*'],
                },
            },
        },
        'tsconfig.json': {
            extends: './tsconfig.base.json',
            compilerOptions: {
                target: 'es2018',
                paths: {
                    '@/*': ['src/*'],
                },
            },
        },
    });

    const resolver = getConfigResolver({}, host, {}, { fileName: 'test.ts' });
    expect(resolver.config).toEqual({
        path: 'tsconfig.json',
        compilerOptions: {
            configFilePath: 'tsconfig.json',
            target: ScriptTarget.ES2018,
            pathsBasePath: '.',
            paths: {
                '@/*': ['src/*'],
            },
        },
        mergeStrategy: 'merge',
        reflection: undefined,
        exclude: defaultExcluded,
    });
});

test('negative match 1', () => {
    const host = buildHost({
        '/app/tsconfig.json': {
            deepkitCompilerOptions: {
                reflection: ['model/**/*.ts'],
            },
        },
    });
    const resolver = getConfigResolver({}, host, {}, { fileName: '/app/test.ts' });
    expect(resolver.config).toEqual({
        path: '/app/tsconfig.json',
        compilerOptions: {configFilePath: '/app/tsconfig.json'},
        reflection: ['/app/model/**/*.ts'],
        mergeStrategy: 'merge',
        exclude: defaultExcluded,
    });

    expect(resolver.match('/app/model/test.ts').mode).toBe('default');
    expect(resolver.match('/app/model/controller/test.controller.ts').mode).toBe('default');
    expect(resolver.match('/app/external/file.ts').mode).toBe('never');
});

test('negative match 2', () => {
    const host = buildHost({
        '/path/portal/tsconfig.json': {
            deepkitCompilerOptions: {
                reflection: ['server/controllers/**/*.ts', 'server/services/**/*.ts', 'server/dao/**/*.ts', '!server/dao/mongoose.ts', 'shared/**/*.ts'],
            },
        },
    });
    const resolver = getConfigResolver({}, host, {}, { fileName: '/path/portal/test.ts' });
    expect(resolver.match('/path/portal/server/dao/models.ts').mode).toBe('default');
    expect(resolver.match('/path/portal/server/dao/mongoose.ts').mode).toBe('never');
});

test('negative match 3', () => {
    const host = buildHost({
        '/path/portal/tsconfig.json': {
            deepkitCompilerOptions: {
                reflection: ['!src/lib/graphql/**/*.ts', 'src/**/*.ts'],
            },
        },
    });
    const resolver = getConfigResolver({}, host, {}, { fileName: '/path/portal/src/index.ts' });
    expect(resolver.match('/path/portal/src/lib/types.ts').mode).toBe('default');
    expect(resolver.match('/path/portal/src/lib/graphql/generated.ts').mode).toBe('never');
});

test('negative match 4', () => {
    const host = buildHost({
        '/path/portal/tsconfig.json': {
            deepkitCompilerOptions: {
                reflection: ['!src/lib/graphql/generated.ts', 'src/**/*.ts'],
            },
        },
    });
    const resolver = getConfigResolver({}, host, {}, { fileName: '/path/portal/src/index.ts' });
    expect(resolver.match('/path/portal/src/lib/types.ts').mode).toBe('default');
    expect(resolver.match('/path/portal/src/lib/graphql/generated.ts').mode).toBe('never');
});

test('extends array, last entry wins', () => {
    // TypeScript 5.0+ allows an array, the last entry has the highest priority (#600)
    const host = buildHost({
        'tsconfig.a.json': { reflection: false },
        'tsconfig.b.json': { extends: './tsconfig.c.json' },
        'tsconfig.c.json': { reflection: true },
        'tsconfig.json': { extends: ['./tsconfig.a.json', './tsconfig.b.json'] },
    });
    const resolver = getConfigResolver({}, host, {}, { fileName: 'test.ts' });
    expect(resolver.match('test.ts').mode).toBe('default');
});

test('extends absolute path', () => {
    const host = buildHost({
        '/base/tsconfig.json': { reflection: true },
        '/project/tsconfig.json': { extends: '/base/tsconfig.json' },
    });
    const resolver = getConfigResolver({}, host, {}, { fileName: '/project/test.ts' });
    expect(resolver.match('/project/test.ts').mode).toBe('default');
});
