import { expect, test } from '@jest/globals';

import { getCurrentDirName, osPathDirectory } from '../src/core.js';
import { pathBasename, pathDirectory, pathNormalize, pathNormalizeDirectory } from '../src/path.js';

test('pathNormalize', () => {
    expect(pathNormalize('')).toBe('/');
    expect(pathNormalize('/')).toBe('/');
    expect(pathNormalize('///')).toBe('/');
    expect(pathNormalize('///a/b/c/')).toBe('/a/b/c');
    expect(pathNormalize('/a/b/c/')).toBe('/a/b/c');
    expect(pathNormalize('a/b/c/')).toBe('/a/b/c');
    expect(pathNormalize('a//b/c/')).toBe('/a/b/c');
    expect(pathNormalize('a/b/c')).toBe('/a/b/c');
    expect(pathNormalize('/a/b/c//')).toBe('/a/b/c');
    expect(pathNormalize('/a/b/c///')).toBe('/a/b/c');
});

test('pathNormalizeDirectory', () => {
    expect(pathNormalizeDirectory('/')).toBe('/');
    expect(pathNormalizeDirectory('')).toBe('/');
    expect(pathNormalizeDirectory('///')).toBe('/');
    expect(pathNormalizeDirectory('///a/b/c/')).toBe('/a/b/c/');
    expect(pathNormalizeDirectory('/a/b/c/')).toBe('/a/b/c/');
    expect(pathNormalizeDirectory('a/b/c/')).toBe('/a/b/c/');
    expect(pathNormalizeDirectory('a//b/c/')).toBe('/a/b/c/');
    expect(pathNormalizeDirectory('a/b/c')).toBe('/a/b/c/');
    expect(pathNormalizeDirectory('/a/b/c///')).toBe('/a/b/c/');
});

test('pathDirectory', () => {
    expect(pathDirectory('/')).toBe('/');
    expect(pathDirectory('')).toBe('/');
    expect(pathDirectory('///')).toBe('/');
    expect(pathDirectory('///a/b/c/')).toBe('/a/b');
    expect(pathDirectory('/a/b/c/')).toBe('/a/b');
    expect(pathDirectory('a/b/c/')).toBe('/a/b');
    expect(pathDirectory('a//b/c/')).toBe('/a/b');
    expect(pathDirectory('a/b/c')).toBe('/a/b');
    expect(pathDirectory('/a/b/c///')).toBe('/a/b');
});

test('pathBasename', () => {
    expect(pathBasename('/')).toBe('');
    expect(pathBasename('')).toBe('');
    expect(pathBasename('///')).toBe('');
    expect(pathBasename('///a/b/c/')).toBe('c');
    expect(pathBasename('/a/b/c/')).toBe('c');
    expect(pathBasename('a/b/c/')).toBe('c');
    expect(pathBasename('a//b/c/')).toBe('c');
    expect(pathBasename('a/b/c')).toBe('c');
    expect(pathBasename('/a/b/c///')).toBe('c');
});

test('osPathDirectory (#694)', () => {
    expect(osPathDirectory('/a/b/c.js')).toBe('/a/b');
    expect(osPathDirectory('/c.js')).toBe('/');
    expect(osPathDirectory('c.js')).toBe('.');
    expect(osPathDirectory('C:\\Users\\me\\create.js')).toBe('C:\\Users\\me');
    expect(osPathDirectory('C:/Users/me/create.js')).toBe('C:/Users/me');
    expect(osPathDirectory('C:\\create.js')).toBe('C:\\');
    expect(osPathDirectory('\\\\server\\share\\file.js')).toBe('\\\\server\\share');
});

test('getCurrentDirName', () => {
    expect(getCurrentDirName()).toBe(__dirname);
});
