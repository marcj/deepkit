import { expect, test } from '@jest/globals';
import ts from 'typescript';

import { knownLibFilesForCompilerOptions } from '../src/lib-files.js';

test('knownLibFilesForCompilerOptions', () => {
    expect(knownLibFilesForCompilerOptions({})).toEqual([
        'lib.d.ts',
        'lib.decorators.d.ts',
        'lib.decorators.legacy.d.ts',
        'lib.dom.d.ts',
        'lib.dom.iterable.d.ts',
        'lib.webworker.d.ts',
        'lib.webworker.importscripts.d.ts',
        'lib.webworker.iterable.d.ts',
        'lib.scripthost.d.ts',
        'lib.es5.d.ts',
    ]);

    const es2022 = knownLibFilesForCompilerOptions({ target: ts.ScriptTarget.ES2022 });
    expect(es2022.length).toBe(71);
    expect(es2022[es2022.length - 1]).toBe('lib.es2022.string.d.ts');
    expect(es2022).toContain('lib.es2015.core.d.ts');
    expect(es2022).not.toContain('lib.es2023.array.d.ts');

    // the highest of target and lib wins
    const withLib = knownLibFilesForCompilerOptions({ target: ts.ScriptTarget.ES2015, lib: ['ES2020', 'dom'] });
    expect(withLib[withLib.length - 1]).toBe('lib.es2020.symbol.wellknown.d.ts');
    expect(knownLibFilesForCompilerOptions({ target: ts.ScriptTarget.ES2015, lib: ['foo'] }).pop()).toBe('lib.es2015.symbol.wellknown.d.ts');
    expect(knownLibFilesForCompilerOptions({ target: ts.ScriptTarget.ES5, lib: ['esnext'] }).pop()).toBe('lib.esnext.weakref.d.ts');
});
