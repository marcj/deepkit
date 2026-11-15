/*
 * Deepkit Framework
 * Copyright (C) 2021 Deepkit UG, Marc J. Schmidt
 *
 * This program is free software: you can redistribute it and/or modify
 * it under the terms of the MIT License.
 *
 * You should have received a copy of the MIT License along with this program.
 */

import { IncomingMessage, OutgoingHttpHeader, OutgoingHttpHeaders, ServerResponse } from 'http';
import { UploadedFile } from './router.js';
import * as querystring from 'querystring';
import { Readable, Writable } from 'stream';
import { ReflectionKind, Type, typeAnnotation, ValidationErrorItem } from '@deepkit/type';
import { asyncOperation, isArray, TypeAnnotation } from '@deepkit/core';

// Marks plain node request/response objects that got the HttpRequest/HttpResponse API assigned, see incomingMessageToHttpRequest.
const httpRequestBrand = Symbol('HttpRequest');
const httpResponseBrand = Symbol('HttpResponse');

export class HttpResponse extends ServerResponse {
    static [Symbol.hasInstance](value: unknown): boolean {
        // instances and plain node objects converted by serverResponseToHttpResponse carry the brand
        if (this === HttpResponse) return value != null && (value as any)[httpResponseBrand] === true;
        return Function.prototype[Symbol.hasInstance].call(this, value);
    }

    status(code: number) {
        this.writeHead(code);
        this.end();
    }
}

/**
 * Reads the body of the request and returns it as a Buffer.
 * The result will be cached in the request object as `request.body`.
 *
 * Deepkit's router will automatically use `request.body` if available.
 */
export function readBody(request: IncomingMessage): Promise<Buffer> {
    return asyncOperation((resolve, reject) => {
        const chunks: Buffer[] = [];
        request.on('data', (chunk: Buffer) => {
            chunks.push(chunk);
        });
        request.on('end', () => {
            const body = Buffer.concat(chunks);
            //the router uses this now instead of trying to read the body again
            (request as HttpRequest).body = body;
            resolve(body);
        });
        request.on('error', (error: Error) => {
            reject(error);
        });
    });
}

export function createRequestWithCachedBody(request: Partial<IncomingMessage>, body: Buffer): HttpRequest {
    // a request object without node's stream/socket construction, the body is pushed when read
    const cached = FetchHttpRequest.create(request.method || 'GET', request.url || '/', undefined, body);
    cached.headers = request.headers as any || {};
    // MemoryHttpResponse (kernel.request) writes to the request's socket
    (cached as any).socket = new Writable({
        write(chunk, encoding, callback) {
            callback();
        },
        writev(chunks, callback) {
            callback();
        },
    });
    return cached;
}

export type HttpRequestQuery = { [name: string]: string };
export type HttpRequestResolvedParameters = { [name: string]: any };
export type HttpRequestPositionedParameters = { arguments: any[], parameters: HttpRequestResolvedParameters };

export class BodyValidationError {
    constructor(
        public readonly errors: ValidationErrorItem[] = []
    ) {
    }

    hasErrors(prefix?: string): boolean {
        return this.getErrors(prefix).length > 0;
    }

    getErrors(prefix?: string): ValidationErrorItem[] {
        if (prefix) return this.errors.filter(v => v.path.startsWith(prefix));

        return this.errors;
    }

    getErrorsForPath(path: string): ValidationErrorItem[] {
        return this.errors.filter(v => v.path === path);
    }

    getErrorMessageForPath(path: string): string {
        return this.getErrorsForPath(path).map(v => v.toString()).join(', ');
    }
}

export class ValidatedBody<T> {
    constructor(public error: BodyValidationError, public value?: T) {
    }

    valid(): this is { value: T } {
        return this.value !== undefined;
    }
}

/**
 * Marks a parameter as HTTP body and reads the value from the request body.
 *
 * @example
 * ```typescript
 * class Controller {
 *   @http.GET('/api')
 *   route(body: HttpBody<{username: string}>) {
 *     //body is {username: string} and required
 *     //could also reference an interface or type alias via `HttpBody<MyInterface>`
 *   }
 * }
 *
 * // curl /api -d '{"username":"Peter"}'
 */
export type HttpBody<T> = T & TypeAnnotation<'httpBody'>;
export type HttpBodyValidation<T> = ValidatedBody<T> & TypeAnnotation<'httpBodyValidation'>;

export interface HttpRequestParserOptions {
    withPath?: boolean;
    withBody?: boolean;
    withQuery?: boolean;
    withHeader?: boolean;
}

/**
 * Delays the parsing of the path/body/query/header to the very last moment, when the parameter is actually used.
 *
 * If no options are provided, the parser will receive data from path, header, body, and query, in this order.
 * This basically allows to fetch data from all possible HTTP sources in one go.
 *
 * You can disable various sources by providing the options, e.g. `{withBody: false}` to disable body parsing.
 * Or `{withQuery: false}` to disable query parsing. Or `{withHeader: false}` to disable header parsing.
 * To only parse the body, use `{withQuery: false, withHeader: false}`.
 *
 * @example
 * ```typescript
 * async route(parser: HttpRequestParser<{authorization: string}>) {
 *    const data = await parser();
 *    console.log(data.authorization);
 * }
 * ```
 *
 * Note that the parsers is based on all defined parameters (e.g. `userId: HttpQuery<string>` => {userId: string}),
 * and then starts from there applying header, body, and then query values.
 * This means you also get access to defined path parameters, like:
 *
 * ```typescript
 * @http.GET('teams/:teamId')
 * async route(teamId: string) {
 *    //teamId is string
 * }
 *
 * httpWorkflow.onController.listen((event, parser: HttpRequestParser<{teamId: string}>) => {
 *  const data = await parser();
 *  console.log(data.teamId);
 * });
 * ```
 *
 * HttpRequestParser is necessary in event listeners, since they are instantiated synchronously,
 * but body is parsed asynchronously. So use in event listeners HttpRequestParser instead of HttpBody.
 */
export type HttpRequestParser<T> = ((options?: HttpRequestParserOptions) => Promise<T>) & TypeAnnotation<'httpRequestParser', T>;

/**
 * Marks a parameter as HTTP path and reads the value from the request path.
 * This is normally not requires since the parameter name automatically maps to the path parameter,
 * but in case of requesting the path parameter in for example listeners, this is required.
 * The name option can be used to change the parameter name.
 *
 * @example
 * ```typescript
 * app.listen(httpWorkflow.onController, (event, request: HttpRequest, groupId: HttpPath<number>) => {
 *   console.log(groupId); //123
 * });
 *
 * class Controller {
 *   @http.GET('/api/:groupId')
 *   route(groupId: number) {
 *     //groupId is number and required
 *     //same as `groupId: HttpPath<number>`
 *   }
 * }
 * ```
 */
export type HttpPath<T, Options extends { name?: string } = {}> = T & TypeAnnotation<'httpPath', Options>;

/**
 * Marks a parameter as HTTP header and reads the value from the request header.
 *
 * @example
 * ```typescript
 * class Controller {
 *    @http.GET('/api')
 *    route(authorization: HttpHeader<string>) {
 *         //authorization is string and required
 *         //use `authorization?: HttpHeader<string>` to make it optional
 *    }
 * }
 *
 * // curl /api -H 'Authorization: 123'
 * ```
 *
 * To change the header name, use `param: HttpHeader<string, {name: 'X-My-Header'}>`.
 */
export type HttpHeader<T, Options extends { name?: string } = {}> = T & TypeAnnotation<'httpHeader', Options>;

/**
 * Marks a parameter as HTTP query and reads the value from the request query string.
 *
 * @example
 * ```typescript
 * class Controller {
 *   @http.GET('/api')
 *   route(limit: HttpQuery<number>) {
 *      //limit is number and required
 *      //use `limit?: HttpQuery<number>` to make it optional
 *   }
 * }
 *
 * // curl /api?limit=10
 * ```
 */
export type HttpQuery<T, Options extends { name?: string } = {}> = T & TypeAnnotation<'httpQuery', Options>;

/**
 * Marks a parameter as HTTP query objects and reads multiple values from the request query string into an object.
 *
 * @example
 * ```typescript
 * interface Query {
 *    limit?: number;
 *    offset?: number;
 *    sort?: 'asc' | 'desc';
 * }
 *
 * class Controller {
 *  @http.GET('/api')
 *  route(query: HttpQueries<Query>) {
 *    //query is an object containing limit, offset, and sort
 * }
 *
 * // curl /api?limit=10&offset=20&sort=asc
 */
export type HttpQueries<T, Options extends { name?: string } = {}> = T & TypeAnnotation<'httpQueries', Options>;

/**
 * For all parameters used in the URL path, a regular expression of /[^/]+/ is used. To change that, use getRegExp.
 *
 * @example
 * ```typescript
 *
 * class Controller {
 *     @http.GET('/user/:username')
 *     route(username: HttpRegExp<string, '.*'>) {
 *         //username is string
 *     }
 * }
 * ```
 */
export type HttpRegExp<T, Pattern extends string | RegExp> = T & TypeAnnotation<'httpRegExp', Pattern>;

export function getRegExp(type: Type): string | RegExp | undefined {
    const options = typeAnnotation.getType(type, 'httpRegExp');
    if (!options) return;
    if (options.kind === ReflectionKind.literal && 'string' === typeof options.literal) return options.literal;
    if (options.kind === ReflectionKind.literal && options.literal instanceof RegExp) return options.literal;
    return;
}

export class RequestBuilder {
    protected contentBuffer: Buffer = Buffer.alloc(0);
    protected _headers: { [name: string]: string } = {};
    protected queryPath?: string;

    constructor(
        protected path: string,
        protected method: string = 'GET',
    ) {
    }

    getUrl() {
        if (this.queryPath) {
            return this.path + '?' + this.queryPath;
        }
        return this.path;
    }

    build(): HttpRequest {
        return createRequestWithCachedBody({
            method: this.method,
            url: this.getUrl(),
            headers: this._headers,
        }, this.contentBuffer);
    }

    /**
     * Replaces all headers. Names are lowercased like Node does for incoming requests.
     */
    headers(headers: { [name: string]: string }): this {
        this._headers = {};
        for (const [name, value] of Object.entries(headers)) this.header(name, value);
        return this;
    }

    /**
     * Sets a header. The name is lowercased like Node does for incoming requests,
     * so `header('Authorization', ...)` is found by `authorization: HttpHeader<string>`.
     */
    header(name: string, value: string | number): this {
        this._headers[name.toLowerCase()] = String(value);
        return this;
    }

    json(body: object): this {
        this.contentBuffer = Buffer.from(JSON.stringify(body), 'utf8');
        this._headers['content-type'] = 'application/json; charset=utf-8';
        this._headers['content-length'] = String(this.contentBuffer.byteLength);
        return this;
    }

    multiPart(items: ({ name: string } & (
        { file: Uint8Array, fileName?: string, contentType?: string } |
        { json: any } |
        { value: any }
    ))[]): this {
        const boundary = '--------------------------' + Math.random().toString(36).substr(2, 10);
        this._headers['content-type'] = 'multipart/form-data; boundary=' + boundary;
        const parts = items.map(item => {
            if ('file' in item) {
                const header = Buffer.from(`--${boundary}\r
Content-Disposition: form-data; name="${item.name}"; filename="${item.fileName || 'file'}"\r
Content-Type: ${item.contentType ?? 'application/octet-stream'}\r
\r\n`, 'utf8');
                return Buffer.concat([header, item.file, Buffer.from('\r\n', 'utf8')]);
            } else if ('json' in item) {
                const header = Buffer.from(`--${boundary}\r
Content-Disposition: form-data; name="${item.name}"\r
Content-Type: application/json\r
\r\n`, 'utf8');
                return Buffer.concat([header, Buffer.from(JSON.stringify(item.json) + '\r\n', 'utf8')]);
            } else if ('value' in item) {
                const header = Buffer.from(`--${boundary}\r
Content-Disposition: form-data; name="${item.name}"\r
\r\n`, 'utf8');
                return Buffer.concat([header, Buffer.from(item.value + '\r\n', 'utf8')]);
            } else {
                throw new Error('Invalid multiPart item');
            }
        });
        parts.push(Buffer.from(`--${boundary}--`, 'utf8'));
        this.contentBuffer = Buffer.concat(parts);
        this._headers['content-length'] = String(this.contentBuffer.byteLength);
        return this;
    }

    body(body: string | Buffer): this {
        if ('string' === typeof body) {
            this.contentBuffer = Buffer.from(body, 'utf8');
        } else {
            this.contentBuffer = body;
        }
        this._headers['content-length'] = String(this.contentBuffer.byteLength);
        return this;
    }

    query(query: any | string): this {
        if ('string' === typeof query) {
            this.queryPath = query;
        } else {
            this.queryPath = querystring.stringify(query);
        }
        return this;
    }
}

export class HttpRequest extends IncomingMessage {
    static [Symbol.hasInstance](value: unknown): boolean {
        // instances and plain node objects converted by incomingMessageToHttpRequest carry the brand
        if (this === HttpRequest) return value != null && (value as any)[httpRequestBrand] === true;
        return Function.prototype[Symbol.hasInstance].call(this, value);
    }

    /**
     * A store that can be used to transport data from guards/listeners to ParameterResolvers/controllers.
     */
    public store: { [name: string]: any } = {};

    public uploadedFiles: { [name: string]: UploadedFile } = {};

    public temporaryFilePaths?: string[];

    /** The temporary files were removed, a file that appears after that is removed once its stream is done. */
    public temporaryFilesRemoved?: boolean;

    public throwErrorOnNotFound: boolean = false;

    /**
     * The router sets the body when it was read.
     */
    public body?: Buffer;

    async readBody(): Promise<Buffer> {
        if (this.body) return this.body;
        return await readBody(this);
    }

    async readBodyText(): Promise<string> {
        return (await this.readBody()).toString('utf8');
    }

    static GET(path: string): RequestBuilder {
        return new RequestBuilder(path);
    }

    static POST(path: string): RequestBuilder {
        return new RequestBuilder(path, 'POST');
    }

    static OPTIONS(path: string): RequestBuilder {
        return new RequestBuilder(path, 'OPTIONS');
    }

    static TRACE(path: string): RequestBuilder {
        return new RequestBuilder(path, 'TRACE');
    }

    static HEAD(path: string): RequestBuilder {
        return new RequestBuilder(path, 'HEAD');
    }

    static PATCH(path: string): RequestBuilder {
        return new RequestBuilder(path, 'PATCH');
    }

    static PUT(path: string): RequestBuilder {
        return new RequestBuilder(path, 'PUT');
    }

    static DELETE(path: string): RequestBuilder {
        return new RequestBuilder(path, 'DELETE');
    }

    getUrl(): string {
        return this.url || '/';
    }

    getMethod(): string {
        return this.method || 'GET';
    }

    getRemoteAddress(): string {
        return this.socket.remoteAddress || '';
    }
}

function ownMethods(prototype: object): [string, Function][] {
    return Object.getOwnPropertyNames(prototype)
        .filter(name => name !== 'constructor' && typeof Object.getOwnPropertyDescriptor(prototype, name)!.value === 'function')
        .map(name => [name, (prototype as any)[name]]);
}

let httpRequestMethods: [string, Function][] | undefined;
let httpResponseMethods: [string, Function][] | undefined;

/**
 * Gives a plain node request (e.g. from an adapter or `createMiddleware`) the HttpRequest API.
 *
 * Changing the prototype instead (Object.setPrototypeOf) makes V8 deoptimize the object in node's own http code,
 * which cost ~2µs per request. `instanceof HttpRequest` stays true via the brand.
 */
export function incomingMessageToHttpRequest(request: IncomingMessage): HttpRequest {
    if ((request as any)[httpRequestBrand] === true) return request as HttpRequest;
    const httpRequest = request as any;
    for (const [name, fn] of httpRequestMethods ||= ownMethods(HttpRequest.prototype)) httpRequest[name] = fn;
    httpRequest.store = {};
    httpRequest.uploadedFiles = {};
    httpRequest.throwErrorOnNotFound = false;
    httpRequest[httpRequestBrand] = true;
    return httpRequest;
}

export function serverResponseToHttpResponse(response: ServerResponse): HttpResponse {
    if ((response as any)[httpResponseBrand] === true) return response as HttpResponse;
    const httpResponse = response as any;
    for (const [name, fn] of httpResponseMethods ||= ownMethods(HttpResponse.prototype)) httpResponse[name] = fn;
    httpResponse[httpResponseBrand] = true;
    return httpResponse;
}

export class MemoryHttpResponse extends HttpResponse {
    public body: Buffer = Buffer.alloc(0);
    declare public headers: { [name: string]: number | string | string[] | undefined };

    constructor(req: IncomingMessage) {
        super(req);
        // an own data property: Bun's ServerResponse has a `headers` accessor that calls getHeaders(), which returns this.headers
        Object.defineProperty(this, 'headers', { value: Object.create(null), writable: true, enumerable: true, configurable: true });
    }

    setHeader(name: string, value: number | string | ReadonlyArray<string>): this {
        this.headers[name] = value as any;
        super.setHeader(name, value);
        return this;
    }

    removeHeader(name: string) {
        delete this.headers[name];
        super.removeHeader(name);
    }

    getHeader(name: string) {
        return this.headers[name];
    }

    getHeaders(): OutgoingHttpHeaders {
        return this.headers;
    }

    writeHead(statusCode: number, headersOrReasonPhrase?: string | OutgoingHttpHeaders | OutgoingHttpHeader[], headers?: OutgoingHttpHeaders | OutgoingHttpHeader[]): this {
        headers = typeof headersOrReasonPhrase === 'string' ? headers : headersOrReasonPhrase;
        if (headers && !isArray(headers)) this.headers = headers;

        if (typeof headersOrReasonPhrase === 'string') return super.writeHead(statusCode, headersOrReasonPhrase, headers);
        return super.writeHead(statusCode, headers);
    }

    get json(): any {
        const json = this.bodyString;
        try {
            return JSON.parse(json);
        } catch (error: any) {
            throw new Error(`Could not parse JSON: ${error.message}, body: ${json}`);
        }
    }

    get text(): string {
        return this.bodyString;
    }

    get bodyString(): string {
        return this.body.toString('utf8');
    }

    write(
        chunk: any,
        encoding: any,
        callback?: any
    ): any {
        if (typeof encoding === 'function') {
            callback = encoding;
            encoding = null;
        }

        if (chunk) {
            if ('string' === typeof chunk) {
                chunk = Buffer.from(chunk, encoding || 'utf8');
            }
            this.body = Buffer.concat([this.body, chunk]);
        }

        if (callback) callback();
        return true;
    }

    end(chunk: any, encoding?: any, callback?: any): any {
        if (typeof chunk === 'function') {
            callback = chunk;
            chunk = null;
            encoding = null;
        } else if (typeof encoding === 'function') {
            callback = encoding;
            encoding = null;
        }

        if (chunk) {
            if ('string' === typeof chunk) {
                chunk = Buffer.from(chunk, encoding || 'utf8');
            }
            this.body = Buffer.concat([this.body, chunk]);
        }
        this.emit('finish');
        super.end(chunk, encoding, callback);
        this.emit('close');
        return this;
    }
}

// stand-in socket for requests that don't come from a node server (fetch handler)
const noSocket = { remoteAddress: '', readable: false, writable: false, destroyed: false, on() { return this; }, once() { return this; }, removeListener() { return this; }, off() { return this; }, destroy() { return this; } };

/**
 * Creates a property (e.g. the stream state) of a request/response object lazily on first access: the fetch handler
 * creates these objects without running node's constructors (which cost more than the whole routing).
 */
function lazyProperty(prototype: object, property: string, create: () => any) {
    Object.defineProperty(prototype, property, {
        configurable: true,
        get(this: any) {
            const state = create().call(this);
            Object.defineProperty(this, property, { value: state, writable: true, configurable: true, enumerable: false });
            return state;
        },
        set(this: any, value: any) {
            Object.defineProperty(this, property, { value, writable: true, configurable: true, enumerable: false });
        },
    });
}

// header names are a small set, caching their lowercase form saves a string allocation per call
const lowerHeaderNames = new Map<string, string>();

function lowerHeaderName(name: string): string {
    let lower = lowerHeaderNames.get(name);
    if (lower === undefined) {
        lower = name.toLowerCase();
        if (lowerHeaderNames.size < 1000) lowerHeaderNames.set(name, lower);
    }
    return lower;
}

/**
 * A request built from a web standard Request (see HttpKernel.fetch). The body is read upfront.
 *
 * Created without IncomingMessage's constructor, the stream state is created on first use.
 */
export class FetchHttpRequest extends HttpRequest {
    protected bodyPushed?: boolean;

    /** The web standard request, its headers are converted to node's plain object on first access of `headers`. */
    public fetchRequest?: { headers: Headers };

    /** The body as text (JSON bodies are read as text, which is cheaper), `body` is created from it when used. */
    public bodyText?: string;

    static create(method: string, url: string, fetchRequest: { headers: Headers } | undefined, body: Buffer | string | undefined, remoteAddress: string = ''): FetchHttpRequest {
        const request = Object.create(FetchHttpRequest.prototype) as FetchHttpRequest;
        request.method = method;
        request.url = url;
        request.fetchRequest = fetchRequest;
        if ('string' === typeof body) {
            request.bodyText = body;
        } else if (body) {
            request.body = body;
        }
        if (remoteAddress) (request as any).fetchSocket = { ...noSocket, remoteAddress };
        request.store = {};
        request.uploadedFiles = {};
        request.throwErrorOnNotFound = false;
        return request;
    }

    _read() {
        if (!this.bodyPushed) {
            this.bodyPushed = true;
            if (this.body && this.body.length) this.push(this.body);
        }
        this.push(null);
    }
}

// socket/connection are getter-only in some runtimes (Cloudflare Workers), so they are own accessors here
for (const name of ['socket', 'connection']) {
    Object.defineProperty(FetchHttpRequest.prototype, name, {
        configurable: true,
        get(this: any) {
            return this.fetchSocket || noSocket;
        },
        set(this: any, value: any) {
            this.fetchSocket = value;
        },
    });
}

// constant per request, so they live on the prototype instead of being set on every request object
Object.assign(FetchHttpRequest.prototype, {
    httpVersion: '1.1', httpVersionMajor: 1, httpVersionMinor: 1, complete: true, aborted: false, upgrade: false,
});
for (const name of ['rawHeaders', 'rawTrailers'] as const) {
    lazyProperty(FetchHttpRequest.prototype, name, () => () => []);
}
lazyProperty(FetchHttpRequest.prototype, 'trailers', () => () => ({}));

lazyProperty(FetchHttpRequest.prototype, 'body', () => function (this: FetchHttpRequest) {
    return this.bodyText !== undefined ? Buffer.from(this.bodyText, 'utf8') : undefined;
});

// most routes never read the headers, so they are converted only when used
lazyProperty(FetchHttpRequest.prototype, 'headers', () => function (this: FetchHttpRequest) {
    // even reading Request.headers creates the Headers object in some runtimes
    const fetchHeaders = this.fetchRequest?.headers as Headers & { toJSON?: () => { [name: string]: string } } | undefined;
    let headers: { [name: string]: string } = {};
    if (fetchHeaders) {
        // Bun and Deno have a fast toJSON() (set-cookie as array is irrelevant for requests)
        if (typeof fetchHeaders.toJSON === 'function') {
            headers = fetchHeaders.toJSON();
        } else {
            fetchHeaders.forEach((value, name) => {
                headers[name] = value;
            });
        }
    }
    // a Request with e.g. a FormData body has no content-length, but body parsers (formidable) need it
    if (headers['content-length'] === undefined && headers['transfer-encoding'] === undefined) {
        if (this.bodyText !== undefined) {
            headers['content-length'] = String(Buffer.byteLength(this.bodyText));
        } else if (this.body) {
            headers['content-length'] = String(this.body.length);
        }
    }
    return headers;
});

lazyProperty(FetchHttpRequest.prototype, '_readableState', () => function (this: any) {
    return (new Readable({ read() {} }) as any)._readableState;
});

/**
 * Collects status, headers and body in memory instead of writing to a socket (see HttpKernel.fetch).
 *
 * Created without ServerResponse's constructor: it implements the header and write API itself,
 * so none of node's socket handling and header validation runs.
 */
export class FetchHttpResponse extends HttpResponse {
    public chunks: (string | Buffer)[] = [];
    protected ended = false;
    /** lowercase name -> value */
    public outgoingHeaders: Map<string, number | string | string[]> = new Map();

    static create(request: HttpRequest): FetchHttpResponse {
        const response = Object.create(FetchHttpResponse.prototype) as FetchHttpResponse;
        response.chunks = [];
        response.ended = false;
        response.outgoingHeaders = new Map();
        response.statusCode = 200;
        response.statusMessage = '';
        (response as any).req = request;
        (response as any).finished = false;
        (response as any).sendDate = false;
        return response;
    }

    setHeader(name: string, value: number | string | ReadonlyArray<string>): this {
        this.outgoingHeaders.set(lowerHeaderName(name), value as any);
        return this;
    }

    getHeader(name: string): number | string | string[] | undefined {
        return this.outgoingHeaders.get(lowerHeaderName(name));
    }

    hasHeader(name: string): boolean {
        return this.outgoingHeaders.has(lowerHeaderName(name));
    }

    removeHeader(name: string): void {
        this.outgoingHeaders.delete(lowerHeaderName(name));
    }

    getHeaderNames(): string[] {
        return [...this.outgoingHeaders.keys()];
    }

    getHeaders(): OutgoingHttpHeaders {
        const headers: OutgoingHttpHeaders = Object.create(null);
        for (const [name, value] of this.outgoingHeaders) headers[name] = value;
        return headers;
    }

    flushHeaders(): void {
    }

    writeHead(statusCode: number, reasonOrHeaders?: string | OutgoingHttpHeaders | OutgoingHttpHeader[], headers?: OutgoingHttpHeaders | OutgoingHttpHeader[]): this {
        this.statusCode = statusCode;
        if (typeof reasonOrHeaders === 'string') {
            this.statusMessage = reasonOrHeaders;
        } else if (reasonOrHeaders) {
            headers = reasonOrHeaders;
        }
        if (headers) {
            if (isArray(headers)) {
                for (let i = 0; i + 1 < headers.length; i += 2) this.setHeader(String(headers[i]), headers[i + 1] as any);
            } else {
                for (const name in headers) {
                    const value = headers[name];
                    if (value !== undefined) this.setHeader(name, value);
                }
            }
        }
        return this;
    }

    write(chunk: any, encoding?: any, callback?: any): boolean {
        if (typeof encoding === 'function') {
            callback = encoding;
            encoding = undefined;
        }
        if (chunk !== undefined && chunk !== null) this.chunks.push('string' === typeof chunk && (!encoding || encoding === 'utf8' || encoding === 'utf-8') ? chunk : Buffer.from(chunk, encoding));
        if (callback) callback();
        return true;
    }

    end(chunk?: any, encoding?: any, callback?: any): this {
        if (this.ended) return this;
        if (typeof chunk === 'function') {
            callback = chunk;
            chunk = undefined;
        } else if (typeof encoding === 'function') {
            callback = encoding;
            encoding = undefined;
        }
        if (chunk !== undefined && chunk !== null) this.write(chunk, encoding);
        this.ended = true;
        (this as any).finished = true;
        // listeners are rare (e.g. stream piping), the events object only exists once one was added
        if ((this as any)._events) {
            this.emit('prefinish');
            this.emit('finish');
            this.emit('close');
        }
        if (callback) callback();
        return this;
    }

    /**
     * The body as written: a single string stays a string (cheaper for Response), otherwise a Buffer.
     */
    getBody(): string | Buffer | null {
        if (this.chunks.length === 0) return null;
        if (this.chunks.length === 1) return this.chunks[0];
        return Buffer.concat(this.chunks.map(v => 'string' === typeof v ? Buffer.from(v) : v));
    }
}

lazyProperty(FetchHttpResponse.prototype, '_writableState', () => function (this: any) {
    return (new Writable({ write(chunk, encoding, callback) { callback(); } }) as any)._writableState;
});

// node declares these as properties in its types, but they are accessors computed from internals that aren't set here
Object.defineProperty(FetchHttpResponse.prototype, 'writableEnded', {
    get(this: any) {
        return this.ended;
    },
});
Object.defineProperty(FetchHttpResponse.prototype, 'writableFinished', {
    get(this: any) {
        return this.ended;
    },
});
Object.defineProperty(FetchHttpResponse.prototype, 'headersSent', {
    get(this: any) {
        return this.ended;
    },
});

// the brand makes instanceof and the conversion checks a single property lookup (custom hasInstance is slow in JSC)
(HttpRequest.prototype as any)[httpRequestBrand] = true;
(HttpResponse.prototype as any)[httpResponseBrand] = true;
