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
import { Writable } from 'stream';
import { ReflectionKind, Type, typeAnnotation, ValidationErrorItem } from '@deepkit/type';
import { asyncOperation, isArray, TypeAnnotation } from '@deepkit/core';

export class HttpResponse extends ServerResponse {
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
    const headers = request.headers;
    const method = request.method;
    const url = request.url;

    const writable = new Writable({
        write(chunk, encoding, callback) {
            callback();
        },
        writev(chunks, callback) {
            callback();
        }
    });
    return new (class extends HttpRequest {
        url = url;
        method = method;
        position = 0;

        headers = headers as any;

        _read(size: number) {
            if (this.complete) {
                this.push(null);
            } else {
                //in Node 18 this seems to be necessary to not trigger the abort event
                this.complete = true;
                this.push(body);
            }
        }
    })(writable as any);
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
    /**
     * A store that can be used to transport data from guards/listeners to ParameterResolvers/controllers.
     */
    public store: { [name: string]: any } = {};

    public uploadedFiles: { [name: string]: UploadedFile } = {};

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

export function incomingMessageToHttpRequest(request: IncomingMessage): HttpRequest {
    if (request instanceof HttpRequest) return request;
    Object.setPrototypeOf(request, HttpRequest.prototype);
    HttpRequest.constructor.call(request);
    return request as HttpRequest;
}

export function serverResponseToHttpResponse(response: ServerResponse): HttpResponse {
    if (response instanceof HttpResponse) return response;
    Object.setPrototypeOf(response, HttpResponse.prototype);
    MemoryHttpResponse.constructor.call(response);
    return response as HttpResponse;
}

export class MemoryHttpResponse extends HttpResponse {
    public body: Buffer = Buffer.alloc(0);
    public headers: { [name: string]: number | string | string[] | undefined } = Object.create(null);

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
