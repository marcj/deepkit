import { existsSync, readFileSync } from 'fs';
import { dirname, join, resolve } from 'path';

export type MatchPath = (
    specifier: string,
    fileExists: (path: string) => boolean,
    extensions: string[],
) => string | undefined;

interface MappingEntry {
    pattern: string;
    paths: string[];
}

type TryPath = { type: 'file' | 'extension' | 'index' | 'package'; path: string };

function getPrefixLength(pattern: string): number {
    return pattern.substring(0, pattern.indexOf('*')).length;
}

/**
 * Returns the part of search that `*` in pattern matches, or undefined if it does not match.
 */
function matchStar(pattern: string, search: string): string | undefined {
    if (search.length < pattern.length) return;
    if (pattern === '*') return search;
    const star = pattern.indexOf('*');
    if (star === -1) return;
    const prefix = pattern.substring(0, star);
    const suffix = pattern.substring(star + 1);
    if (search.substring(0, star) !== prefix) return;
    if (search.substring(search.length - suffix.length) !== suffix) return;
    return search.substring(star, search.length - suffix.length);
}

function removeExtension(path: string): string {
    return path.substring(0, path.lastIndexOf('.')) || path;
}

function readPackageMain(packageJsonPath: string): string | undefined {
    if (!existsSync(packageJsonPath)) return;
    const main = JSON.parse(readFileSync(packageJsonPath, 'utf8')).main;
    return main && 'string' === typeof main ? main : undefined;
}

/**
 * Creates a function that maps module specifiers to files according to tsconfig `paths`.
 *
 * Same resolution as `createMatchPath(baseUrl, paths)` of `tsconfig-paths`: patterns with the longest
 * prefix first, an implicit `*` mapping to baseUrl, and for each candidate the file itself, the file with
 * one of the extensions, the `main` of its package.json, and its index file.
 * Matched files with an extension from the list are returned without that extension.
 */
export function createMatchPath(baseUrl: string, paths: { [pattern: string]: string[] }): MatchPath {
    const entries: MappingEntry[] = Object.keys(paths)
        .sort((a, b) => getPrefixLength(b) - getPrefixLength(a))
        .map(pattern => ({ pattern, paths: paths[pattern].map(v => resolve(baseUrl, v)) }));
    if (!paths['*']) entries.push({ pattern: '*', paths: [`${baseUrl.replace(/\/$/, '')}/*`] });

    return (specifier, fileExists, extensions) => {
        if (!specifier || specifier[0] === '.') return;

        const tryPaths: TryPath[] = [];
        for (const entry of entries) {
            const starMatch = entry.pattern === specifier ? '' : matchStar(entry.pattern, specifier);
            if (starMatch === undefined) continue;
            for (const pattern of entry.paths) {
                const path = pattern.replace('*', starMatch);
                tryPaths.push({ type: 'file', path });
                for (const e of extensions) tryPaths.push({ type: 'extension', path: path + e });
                tryPaths.push({ type: 'package', path: join(path, '/package.json') });
                const indexPath = join(path, '/index');
                for (const e of extensions) tryPaths.push({ type: 'index', path: indexPath + e });
            }
        }

        for (const tryPath of tryPaths) {
            if (tryPath.type === 'package') {
                const main = readPackageMain(tryPath.path);
                if (main === undefined) continue;
                const mainPath = join(dirname(tryPath.path), main);
                if (fileExists(mainPath)) return mainPath;
            } else if (fileExists(tryPath.path)) {
                if (tryPath.type === 'index') return dirname(tryPath.path);
                if (tryPath.type === 'extension') return removeExtension(tryPath.path);
                return tryPath.path;
            }
        }
        return;
    };
}
