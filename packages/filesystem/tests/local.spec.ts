import { expect, test } from '@jest/globals';
import { mkdtempSync } from 'fs';
import { tmpdir } from 'os';

import { FilesystemLocalAdapter } from '../src/local-adapter.js';
import './filesystem.spec.js';
import { setAdapterFactory } from './filesystem.spec.js';

setAdapterFactory(async () => {
    const tmp = mkdtempSync(tmpdir() + '/filesystem-test-');
    return new FilesystemLocalAdapter({ root: tmp });
});

// since we import .filesystem.spec.js, all its tests are scheduled to run
// we define 'basic' here too, so we can easily run just this test.
// also necessary to have at least once test in this file, so that WebStorm
// detects the file as a test file.
test('basic', () => undefined);
test('recursive', () => undefined);
test('permissions', () => undefined);
test('copy', () => undefined);
test('move', () => undefined);

test('local adapter keeps Windows roots (#688)', () => {
    expect(new FilesystemLocalAdapter({ root: 'C:\\data\\files\\' }).getPath('/a.txt')).toBe('C:\\data\\files/a.txt');
    expect(new FilesystemLocalAdapter({ root: 'C:/data' }).getPath('/a.txt')).toBe('C:/data/a.txt');
    expect(new FilesystemLocalAdapter({ root: 'C:\\' }).getPath('/a.txt')).toBe('C:\\/a.txt');
    expect(new FilesystemLocalAdapter({ root: '\\\\server\\share' }).getPath('/a.txt')).toBe('\\\\server\\share/a.txt');
    expect(new FilesystemLocalAdapter({ root: '/var/data//' }).getPath('/a.txt')).toBe('/var/data/a.txt');
});
