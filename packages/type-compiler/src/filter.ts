import { isAbsolute, posix, resolve, win32 } from 'path';

/**
 * Glob pattern, regular expression, or a list of them. Same as rollup's FilterPattern.
 */
export type FilterPattern = ReadonlyArray<string | RegExp> | string | RegExp | null;

export interface GlobOptions {
    /**
     * When true, wildcards also match path segments starting with a dot (e.g. `.git`).
     */
    dot?: boolean;
}

const regExpChars = /[-[\]{}()*+?.,\\^$|#\s]/g;

function escapeRegExp(value: string): string {
    return value.replace(regExpChars, '\\$&');
}

function findClosingBrace(pattern: string, start: number): number {
    let depth = 0;
    for (let i = start; i < pattern.length; i++) {
        const c = pattern[i];
        if (c === '\\') {
            i++;
        } else if (c === '{') {
            depth++;
        } else if (c === '}') {
            depth--;
            if (depth === 0) return i;
        }
    }
    return -1;
}

function splitBraceBody(body: string): string[] {
    const parts: string[] = [];
    let depth = 0;
    let last = 0;
    for (let i = 0; i < body.length; i++) {
        const c = body[i];
        if (c === '\\') {
            i++;
        } else if (c === '{') {
            depth++;
        } else if (c === '}') {
            depth--;
        } else if (c === ',' && depth === 0) {
            parts.push(body.slice(last, i));
            last = i + 1;
        }
    }
    parts.push(body.slice(last));
    return parts;
}

function expandRange(body: string): string[] | undefined {
    const match = /^(-?\d+|[a-zA-Z])\.\.(-?\d+|[a-zA-Z])(?:\.\.(-?\d+))?$/.exec(body);
    if (!match) return;
    const numeric = /\d/.test(match[1]);
    if (numeric !== /\d/.test(match[2])) return;
    const step = Math.abs(Number(match[3] || 1)) || 1;
    const from = numeric ? Number(match[1]) : match[1].charCodeAt(0);
    const to = numeric ? Number(match[2]) : match[2].charCodeAt(0);
    const pad =
        numeric && (/^-?0\d/.test(match[1]) || /^-?0\d/.test(match[2]))
            ? Math.max(match[1].length, match[2].length)
            : 0;
    const result: string[] = [];
    const direction = from <= to ? 1 : -1;
    for (let i = from; direction > 0 ? i <= to : i >= to; i += step * direction) {
        if (!numeric) {
            result.push(String.fromCharCode(i));
            continue;
        }
        const value = String(Math.abs(i)).padStart(pad - (i < 0 ? 1 : 0), '0');
        result.push(i < 0 ? '-' + value : value);
    }
    return result;
}

/**
 * Expands brace patterns like `{a,b}` and `{1..3}` into a list of patterns.
 */
export function expandBraces(pattern: string): string[] {
    for (let i = 0; i < pattern.length; i++) {
        const c = pattern[i];
        if (c === '\\') {
            i++;
            continue;
        }
        if (c !== '{') continue;
        const end = findClosingBrace(pattern, i);
        if (end === -1) return [pattern];
        const body = pattern.slice(i + 1, end);
        const parts = splitBraceBody(body);
        const options = parts.length > 1 ? parts : expandRange(body);
        if (!options) continue;
        const prefix = pattern.slice(0, i);
        const suffixes = expandBraces(pattern.slice(end + 1));
        const result: string[] = [];
        for (const option of options) {
            for (const expanded of expandBraces(option)) {
                for (const suffix of suffixes) result.push(prefix + expanded + suffix);
            }
        }
        return result;
    }
    return [pattern];
}

function segmentStart(dot: boolean): string {
    // wildcards never match `.` and `..`, and without `dot` no segment starting with a dot
    return dot ? '(?!\\.{1,2}(?:\\/|$))' : '(?!\\.)';
}

function compileSegment(segment: string, dot: boolean): string {
    if (segment === '') return '';
    let source = '';
    let canBeEmpty = true;
    for (let i = 0; i < segment.length; i++) {
        const c = segment[i];
        if (c === '\\' && i + 1 < segment.length) {
            source += escapeRegExp(segment[++i]);
            canBeEmpty = false;
        } else if (c === '*') {
            while (segment[i + 1] === '*') i++;
            source += '[^/]*?';
        } else if (c === '?') {
            source += '[^/]';
            canBeEmpty = false;
        } else if (c === '[') {
            const end = segment.indexOf(']', i + 2);
            if (end === -1) {
                source += '\\[';
                canBeEmpty = false;
                continue;
            }
            let body = segment.slice(i + 1, end);
            const negated = body[0] === '!' || body[0] === '^';
            if (negated) body = body.slice(1);
            body = body.replace(/\\(?!.)|[\]^]/g, '\\$&');
            source += negated ? `(?:(?!\\/)[^${body}])` : `[${body}]`;
            canBeEmpty = false;
            i = end;
        } else {
            source += escapeRegExp(c);
            canBeEmpty = false;
        }
    }
    if (segment[0] !== '.' && !(segment[0] === '\\' && segment[1] === '.')) source = segmentStart(dot) + source;
    if (canBeEmpty) source = '(?=.)' + source;
    return source;
}

function compileGlob(pattern: string, dot: boolean): string {
    if (pattern.startsWith('./')) pattern = pattern.slice(2);
    const segments = pattern.split('/');
    // any number of segments (including none), but none of them starting with a dot
    const globstar = segmentStart(dot) + `(?:(?!(?:^|\\/)${dot ? '\\.{1,2}(?:\\/|$)' : '\\.'}).)*?`;
    let source = '';

    for (let i = 0; i < segments.length; i++) {
        const isFirst = i === 0;
        if (segments[i] !== '**') {
            source += compileSegment(segments[i], dot) + (i === segments.length - 1 ? '' : '\\/');
            continue;
        }
        // consecutive globstars are the same as one
        while (segments[i + 1] === '**') i++;
        const isLast = i === segments.length - 1;
        if (isFirst && isLast) {
            source = globstar;
        } else if (isFirst) {
            source = `(?:${globstar}\\/)?`;
        } else if (isLast) {
            // `a/**` matches `a` and everything below `a/`
            source = source.slice(0, -2) + `(?:\\/${globstar}|$)`;
        } else {
            source = source.slice(0, -2) + `(?:\\/${globstar}\\/|\\/)`;
        }
    }
    return source;
}

/**
 * Converts a glob pattern to a regular expression.
 *
 * Supports `*`, `**`, `?`, `[abc]`, `[!abc]`, `[a-z]`, `{a,b}`, `{1..3}`, and backslash escapes.
 */
export function globToRegExp(pattern: string, options: GlobOptions = {}): RegExp {
    const dot = !!options.dot;
    const sources = expandBraces(pattern).map(v => compileGlob(v, dot));
    return new RegExp(`^(?:${sources.join('|')})$`);
}

const globCache = new Map<string, RegExp>();

function getGlobRegExp(pattern: string, dot: boolean): RegExp {
    const key = (dot ? '1' : '0') + pattern;
    let regExp = globCache.get(key);
    if (!regExp) {
        regExp = globToRegExp(pattern, { dot });
        globCache.set(key, regExp);
    }
    return regExp;
}

function normalizeInput(path: string): string {
    return process.platform === 'win32' ? path.replace(/\\/g, '/') : path;
}

/**
 * Returns true if path matches any of the given glob patterns and none of the ignore patterns.
 */
export function isGlobMatch(
    path: string,
    patterns: string | string[],
    ignore: string[] = [],
    options: GlobOptions = {},
): boolean {
    const dot = !!options.dot;
    if (path === '') return false;
    path = normalizeInput(path);
    for (const pattern of ignore) {
        if (getGlobRegExp(pattern, dot).test(path)) return false;
    }
    for (const pattern of Array.isArray(patterns) ? patterns : [patterns]) {
        if (getGlobRegExp(pattern, dot).test(path)) return true;
    }
    return false;
}

function normalizePath(path: string): string {
    return path.split(win32.sep).join(posix.sep);
}

function ensureArray<T>(value: ReadonlyArray<T> | T | null | undefined): ReadonlyArray<T> {
    if (Array.isArray(value)) return value;
    if (value === undefined || value === null) return [];
    return [value as T];
}

function getMatcherString(id: string, resolutionBase: string | false | null | undefined): string {
    if (resolutionBase === false || isAbsolute(id) || id.startsWith('**')) return normalizePath(id);
    // escape all characters of the base path that have a meaning in glob patterns
    const basePath = normalizePath(resolve(resolutionBase || '')).replace(/[-^$*+?.()|[\]{}]/g, '\\$&');
    return posix.join(basePath, normalizePath(id));
}

/**
 * Creates a filter function for file ids, compatible with rollup's `createFilter`.
 *
 * A file matches if it matches no exclude and at least one include pattern (or include is empty).
 * Relative glob patterns are resolved against `options.resolve` (default the current working directory).
 */
export function createFilter(
    include?: FilterPattern,
    exclude?: FilterPattern,
    options?: { resolve?: string | false | null },
): (id: unknown) => boolean {
    const resolutionBase = options && options.resolve;
    const getMatcher = (id: string | RegExp): { test(what: string): boolean } =>
        id instanceof RegExp
            ? id
            : {
                  test: (what: string) =>
                      what !== '' && getGlobRegExp(getMatcherString(id, resolutionBase), true).test(what),
              };
    const includeMatchers = ensureArray(include).map(getMatcher);
    const excludeMatchers = ensureArray(exclude).map(getMatcher);

    if (!includeMatchers.length && !excludeMatchers.length) {
        return (id: unknown) => typeof id === 'string' && !id.includes('\0');
    }

    return function filter(id: unknown): boolean {
        if (typeof id !== 'string') return false;
        if (id.includes('\0')) return false;
        const pathId = normalizePath(id);
        for (const matcher of excludeMatchers) {
            if (matcher instanceof RegExp) matcher.lastIndex = 0;
            if (matcher.test(pathId)) return false;
        }
        for (const matcher of includeMatchers) {
            if (matcher instanceof RegExp) matcher.lastIndex = 0;
            if (matcher.test(pathId)) return true;
        }
        return !includeMatchers.length;
    };
}
