/*
 * Deepkit Framework
 * Copyright (C) 2021 Deepkit UG, Marc J. Schmidt
 *
 * This program is free software: you can redistribute it and/or modify
 * it under the terms of the MIT License.
 *
 * You should have received a copy of the MIT License along with this program.
 */

import { http } from './decorator.js';
import { join, normalize, resolve, sep } from 'path';
import { createReadStream, readFileSync, stat, Stats } from 'fs';
import { STATUS_CODES } from 'http';
import { HtmlResponse, httpWorkflow } from './http.js';
import { AppModule } from '@deepkit/app';
import { normalizeDirectory } from './utils.js';
import { ClassType, urlJoin } from '@deepkit/core';
import { HttpRequest, HttpResponse } from './model.js';
import { getContentType } from './mime.js';
import { eventDispatcher } from '@deepkit/event';
import { HttpRouter, RouteConfig } from './router.js';

const upPathRegExp = /(?:^|[\\/])\.\.(?:[\\/]|$)/;

function escapeHtml(value: string): string {
    return value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

function sendHtml(response: HttpResponse, status: number, title: string, body: string, headers: { [name: string]: string } = {}) {
    const doc = `<!DOCTYPE html>\n<html lang="en">\n<head>\n<meta charset="utf-8">\n<title>${title}</title>\n</head>\n<body>\n<pre>${escapeHtml(body)}</pre>\n</body>\n</html>\n`;
    for (const [name, value] of Object.entries(headers)) response.setHeader(name, value);
    response.statusCode = status;
    response.setHeader('Content-Type', 'text/html; charset=UTF-8');
    response.setHeader('Content-Length', Buffer.byteLength(doc));
    response.setHeader('Content-Security-Policy', "default-src 'none'");
    response.setHeader('X-Content-Type-Options', 'nosniff');
    response.end(doc);
}

function sendError(response: HttpResponse, status: number, headers: { [name: string]: string } = {}) {
    for (const name of response.getHeaderNames()) response.removeHeader(name);
    sendHtml(response, status, 'Error', STATUS_CODES[status] || String(status), headers);
}

/**
 * Encodes characters not allowed in a URL, but keeps already percent-encoded sequences.
 */
function encodeUrl(url: string): string {
    return url
        .replace(/(^|[^\uD800-\uDBFF])[\uDC00-\uDFFF]|[\uD800-\uDBFF]([^\uDC00-\uDFFF]|$)/g, '$1\uFFFD$2')
        .replace(/(?:[^\x21\x23-\x3B\x3D\x3F-\x5F\x61-\x7A\x7C\x7E]|%(?:[^0-9A-Fa-f]|[0-9A-Fa-f][^0-9A-Fa-f]|$))+/g, encodeURI);
}

function parseHttpDate(date?: string | number | string[]): number {
    const timestamp = 'string' === typeof date ? Date.parse(date) : NaN;
    return 'number' === typeof timestamp ? timestamp : NaN;
}

function parseTokenList(value: string): string[] {
    return value.split(',').map(v => v.trim()).filter(v => v !== '');
}

function matchesETag(header: string, etag: string): boolean {
    return parseTokenList(header).some(match => match === etag || match === 'W/' + etag || 'W/' + match === etag);
}

/**
 * Parses a `Range: bytes=...` header. Returns undefined for a syntactically invalid header, -1 if not satisfiable,
 * and the ranges otherwise (overlapping and adjacent ranges are combined).
 */
function parseRange(size: number, header: string): { start: number, end: number }[] | -1 | undefined {
    const index = header.indexOf('=');
    if (index === -1) return;

    const ranges: { start: number, end: number, index: number }[] = [];
    for (const part of header.slice(index + 1).split(',')) {
        const [startString, endString] = part.split('-');
        let start = parseInt(startString, 10);
        let end = parseInt(endString, 10);

        if (isNaN(start)) {
            // -nnn: the last nnn bytes
            start = size - end;
            end = size - 1;
        } else if (isNaN(end)) {
            // nnn-: from nnn to the end
            end = size - 1;
        }
        if (end > size - 1) end = size - 1;
        if (isNaN(start) || isNaN(end) || start > end || start < 0) continue;
        ranges.push({ start, end, index: ranges.length });
    }
    if (!ranges.length) return -1;

    const ordered = ranges.sort((a, b) => a.start - b.start);
    let j = 0;
    for (let i = 1; i < ordered.length; i++) {
        const range = ordered[i];
        const current = ordered[j];
        if (range.start > current.end + 1) {
            ordered[++j] = range;
        } else if (range.end > current.end) {
            current.end = range.end;
            current.index = Math.min(current.index, range.index);
        }
    }
    ordered.length = j + 1;
    return ordered.sort((a, b) => a.index - b.index).map(v => ({ start: v.start, end: v.end }));
}

function sendFile(request: HttpRequest, response: HttpResponse, path: string, stats: Stats) {
    if (response.headersSent) return sendError(response, 500);

    if (!response.getHeader('Accept-Ranges')) response.setHeader('Accept-Ranges', 'bytes');
    if (!response.getHeader('Cache-Control')) response.setHeader('Cache-Control', 'public, max-age=0');
    if (!response.getHeader('Last-Modified')) response.setHeader('Last-Modified', stats.mtime.toUTCString());
    if (!response.getHeader('ETag')) response.setHeader('ETag', `W/"${stats.size.toString(16)}-${stats.mtime.getTime().toString(16)}"`);
    if (!response.getHeader('Content-Type')) response.setHeader('Content-Type', getContentType(path) || 'application/octet-stream');

    const etag = String(response.getHeader('ETag'));
    const lastModified = parseHttpDate(response.getHeader('Last-Modified'));
    const headers = request.headers;

    // precondition failure
    const ifMatch = headers['if-match'];
    if (ifMatch ? ifMatch !== '*' && !matchesETag(ifMatch, etag) : lastModified > parseHttpDate(headers['if-unmodified-since'])) {
        return sendError(response, 412);
    }

    // not modified
    const ifNoneMatch = headers['if-none-match'];
    const ifModifiedSince = headers['if-modified-since'];
    const noCache = /(?:^|,)\s*?no-cache\s*?(?:,|$)/.test(headers['cache-control'] || '');
    const isCachable = (response.statusCode >= 200 && response.statusCode < 300) || response.statusCode === 304;
    if (isCachable && (ifNoneMatch || ifModifiedSince) && !noCache) {
        const fresh = ifNoneMatch
            ? ifNoneMatch === '*' || matchesETag(ifNoneMatch, etag)
            : lastModified <= parseHttpDate(ifModifiedSince);
        if (fresh) {
            for (const name of ['Content-Encoding', 'Content-Language', 'Content-Length', 'Content-Range', 'Content-Type']) {
                response.removeHeader(name);
            }
            response.statusCode = 304;
            response.end();
            return;
        }
    }

    let start = 0;
    let length = stats.size;
    const rangeHeader = headers.range;
    if (rangeHeader && /^ *bytes=/.test(rangeHeader)) {
        let ranges = parseRange(length, rangeHeader);

        // If-Range: only send the range if the representation is unchanged, otherwise the whole file
        const ifRange = headers['if-range'];
        if (ifRange && (ifRange.includes('"') ? !ifRange.includes(etag) : !(lastModified <= parseHttpDate(ifRange)))) {
            ranges = undefined;
        }

        if (ranges === -1) {
            return sendError(response, 416, { 'Content-Range': `bytes */${length}` });
        }

        // multiple ranges are answered with the whole file
        if (ranges && ranges.length === 1) {
            response.statusCode = 206;
            response.setHeader('Content-Range', `bytes ${ranges[0].start}-${ranges[0].end}/${length}`);
            start = ranges[0].start;
            length = ranges[0].end - ranges[0].start + 1;
        }
    }

    response.setHeader('Content-Length', length);

    if (request.method === 'HEAD') {
        response.end();
        return;
    }

    const stream = createReadStream(path, { start, end: Math.max(start, start + length - 1) });
    response.once('close', () => stream.destroy());
    stream.once('error', () => {
        stream.destroy();
        if (response.headersSent) {
            response.destroy();
        } else {
            sendError(response, 500);
        }
    });
    stream.pipe(response);
}

/**
 * Sends the file at `path` (URL encoded, relative to `localPath`) as response.
 *
 * Supports HEAD, Range requests, and conditional requests (ETag, Last-Modified).
 * Paths with `..` are rejected with 403, paths to dotfiles (or in dot-directories) with 404.
 */
export function staticServe(
    localPath: string,
    path: string,
    request: HttpRequest,
    response: HttpResponse,
) {
    return new Promise(resolvePromise => {
        response.once('finish', resolvePromise);
        response.once('close', resolvePromise);

        let decodedPath: string;
        try {
            decodedPath = decodeURIComponent(path);
        } catch {
            return sendError(response, 400);
        }
        if (decodedPath.includes('\0')) return sendError(response, 400);

        // normalize relative to root
        if (decodedPath) decodedPath = normalize('.' + sep + decodedPath);
        if (upPathRegExp.test(decodedPath)) return sendError(response, 403);

        // dotfiles are ignored
        if (decodedPath.split(sep).some(part => part.length > 1 && part[0] === '.')) return sendError(response, 404);

        const filePath = normalize(join(resolve(localPath), decodedPath));
        const hasTrailingSlash = path[path.length - 1] === '/';

        stat(hasTrailingSlash ? join(filePath, 'index.html') : filePath, (error, stats) => {
            if (error) {
                const notFound = error.code === 'ENOENT' || error.code === 'ENOTDIR' || error.code === 'ENAMETOOLONG';
                return sendError(response, notFound ? 404 : 500);
            }
            if (stats.isDirectory()) {
                if (hasTrailingSlash) return sendError(response, 404);
                const location = encodeUrl((path + '/').replace(/^\/+/, '/'));
                sendHtml(response, 301, 'Redirecting', 'Redirecting to ' + location, { Location: location });
                return;
            }
            sendFile(request, response, hasTrailingSlash ? join(filePath, 'index.html') : filePath, stats);
        });
    });
}

export async function staticOnRoute(
    event: typeof httpWorkflow.onRoute.event,
    path: string,
    localPath: string,
) {
    if (event.sent) return;
    if (event.route) return;

    if (!event.request.url?.startsWith(path)) return;

    const relativePath = urlJoin('/', event.url.substr(path.length));
    const root = resolve(localPath);
    const finalLocalPath = join(root, relativePath);
    // paths outside of the root (e.g. /../../etc/passwd) are not checked at all, otherwise 403 (exists) and
    // 404 (doesn't exist) would tell whether a file exists anywhere on the server
    if (finalLocalPath !== root && !finalLocalPath.startsWith(root + sep)) return;

    return new Promise(resolve => {
        stat(finalLocalPath, (err, stat) => {
            if (stat && stat.isFile()) {
                event.routeFoundCallback(staticServe, [localPath, relativePath, event.request, event.response]);
            }
            resolve(undefined);
        });
    });
}

export function serveStaticListener(module: AppModule<any>, path: string, localPath: string = path): ClassType {
    class HttpRequestStaticServingListener {
        @eventDispatcher.listen(httpWorkflow.onRoute, 101) //after default route listener at 100
        onRoute(event: typeof httpWorkflow.onRoute.event) {
            return staticOnRoute(event, path, localPath);
        }
    }

    return HttpRequestStaticServingListener;
}

function loadHtml(localPath: string, path: string): string {
    try {
        let indexHtml = readFileSync(join(localPath, 'index.html')).toString('utf8');
        indexHtml = indexHtml.replace('<base href="/">', `<base href="${path}">`);
        return indexHtml;
    } catch (error) {
        return '';
    }
}

export interface StaticHttpOptions {
    /**
     * The public URL path.
     */
    path: string;

    /**
     * The local path from the file system. Either relative or absolute.
     */
    localPath: string;

    groups?: string[];

    /**
     * The controller name of the registered controller class. Is per default `StaticController`.
     */
    controllerName?: string;

    /**
     * Replaces strings in the served index.html file.
     */
    indexReplace?: { [name: string]: string };
}

/**
 * Serves an index file and allows to load asset files from the same folder. Can be used to serve an angular application
 *
 * All paths like <path>/*.* that don't match a file are redirected to ${localPath}/index.html.
 * All paths like <path>/*.* that match a file resolve to the file.
 */
export function registerStaticHttpController(module: AppModule<any>, options: StaticHttpOptions): void {
    let indexHtml = '';

    const groups = options.groups || [];

    class StaticController {
        @(http.GET().group(...groups))
        serveIndex(request: HttpRequest, response: HttpResponse) {
            if (!indexHtml) {
                indexHtml = loadHtml(options.localPath, normalizeDirectory(options.path));
                if (options.indexReplace) {
                    for (const [k, v] of Object.entries(options.indexReplace)) {
                        indexHtml = indexHtml.replace(k, v);
                    }
                }
            }
            return indexHtml ? new HtmlResponse(indexHtml) : new HtmlResponse('Index not found', 404);
        }
    }

    if (options.controllerName) {
        Object.defineProperty(StaticController, 'name', { value: options.controllerName, writable: true });
    }

    const path = normalizeDirectory(options.path);

    const route1 = new RouteConfig('static', ['GET'], path, {
        type: 'controller',
        controller: StaticController,
        module,
        methodName: 'serveIndex',
    });
    route1.groups = groups;
    module.configureProvider<HttpRouter>(router => router.addRoute(route1), { global: true });

    if (path !== '/') {
        const route2 = new RouteConfig('static', ['GET'], path.slice(0, -1), {
            type: 'controller',
            controller: StaticController,
            module,
            methodName: 'serveIndex',
        });
        route2.groups = groups;
        module.configureProvider<HttpRouter>(router => router.addRoute(route2), { global: true });
    }

    module.addProvider(StaticController);
    module.addListener(serveStaticListener(module, normalizeDirectory(options.path), options.localPath));
}
