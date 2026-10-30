import { getCurrentFileName } from '@deepkit/core';
import { existsSync } from 'fs';
import { createRequire } from 'module';
import { dirname, join, resolve } from 'path';

export function findParentPath(path: string, origin: string = dirname(getCurrentFileName())): string | undefined {
    let current = origin;

    while (!existsSync(join(current, path))) {
        const nextFolder = resolve(current, '..');

        if (nextFolder === current) {
            return undefined;
        }

        current = nextFolder;
    }

    return join(current, path);
}

/**
 * Returns the absolute path of `path` inside the installed package `packageName`, or undefined if it does not exist.
 *
 * The package is located like Node.js resolves modules from `origin` (a file path), so this works with
 * node_modules, pnpm, and Yarn PnP (which has no node_modules folder). Falls back to searching
 * node_modules folders in parent directories.
 */
export function findPackagePath(packageName: string, path: string, origin: string = getCurrentFileName()): string | undefined {
    try {
        const packageJson = createRequire(origin).resolve(packageName + '/package.json');
        const resolved = join(dirname(packageJson), path);
        if (existsSync(resolved)) return resolved;
    } catch {
        // not resolvable, e.g. package.json not exported
    }
    return findParentPath(join('node_modules', packageName, path), dirname(origin));
}
