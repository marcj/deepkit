import { InjectorContext, Setter } from '@deepkit/injector';
import { HttpRouter } from './router.js';
import { EventDispatcher, isEventListenerContainerEntryService } from '@deepkit/event';
import { LoggerInterface } from '@deepkit/logger';
import { FetchHttpRequest, FetchHttpResponse, HttpRequest, HttpResponse, incomingMessageToHttpRequest, MemoryHttpResponse, RequestBuilder, serverResponseToHttpResponse } from './model.js';
import { HttpDirectContext, HttpError, HttpListener, HttpRequestEvent, HttpResultFormatter, httpWorkflow, JSONResponse } from './http.js';
import { Workflow } from '@deepkit/workflow';
import { FrameCategory, Stopwatch, StopwatchFrameInterface } from '@deepkit/stopwatch';
import { unlink } from 'fs';
import { getSerializeFunction, ReflectionKind, serializer, ValidationError } from '@deepkit/type';
import { isArray } from '@deepkit/core';
import { IncomingMessage, ServerResponse } from 'http';

interface HttpKernelHandleOptions {
    /**
     * Makes the kernel throw a HttpNotFoundError when the route is not found
     * or a controller threw a HttpNotFoundError. This allows you to catch
     * the error and handle it yourself.
     */
    throwOnNotFound?: boolean;
}

interface HttpKernelMiddlewareOptions extends HttpKernelHandleOptions {
    /**
     * If true, a HttpNotFoundError or missing route is not automatically
     * sent to the client. Instead, the request is passed to the next middleware.
     */
    fallThroughOnNotFound?: boolean;
}

// the states HttpListener.handleDirect replaces when they have only the default listeners
const directStates = ['request', 'route', 'auth', 'resolveParameters', 'controller'] as const;

class HttpDirectRequest implements HttpDirectContext {
    constructor(
        protected kernel: HttpKernel,
        public injectorContext: InjectorContext,
        public request: HttpRequest,
        public response: HttpResponse,
        public defaultResponseListenersOnly: boolean,
    ) {
    }

    workflow(state: keyof typeof httpWorkflow.places & string): Workflow<typeof httpWorkflow.places> {
        return this.kernel.createWorkflow(state, this.injectorContext);
    }
}

// same content types the body parser treats as JSON
const jsonContentType = /json/i;

function responseEnded(method: string, res: FetchHttpResponse): Promise<Response> {
    return new Promise<Response>((resolve, reject) => {
        res.once('finish', () => resolve(toResponse(method, res)));
        res.once('error', reject);
    });
}

function toResponse(method: string, res: FetchHttpResponse): Response {
    // a plain object is cheaper than Headers, which is only needed for repeated headers like set-cookie
    let headers: { [name: string]: string } | Headers = {};
    let repeated = false;
    res.outgoingHeaders.forEach((value, name) => {
        if (isArray(value)) repeated = true;
        else (headers as { [name: string]: string })[name] = String(value);
    });
    if (repeated) {
        headers = new Headers();
        res.outgoingHeaders.forEach((value, name) => {
            if (isArray(value)) for (const v of value) (headers as Headers).append(name, v);
            else (headers as Headers).set(name, String(value));
        });
    }
    const status = res.statusCode;
    // these statuses must not have a body
    const body = status === 204 || status === 304 || method === 'HEAD' ? null : res.getBody();
    return new Response(body as any, res.statusMessage ? { status, statusText: res.statusMessage, headers } : { status, headers });
}

export class HttpKernel {
    protected direct?: { version: number, listener?: HttpListener, defaultResponseListenersOnly: boolean };

    protected setHttpRequest: Setter<HttpRequest>;
    protected setHttpResponse: Setter<HttpResponse>;
    protected setInjectorContext: Setter<InjectorContext>;

    constructor(
        protected router: HttpRouter,
        protected eventDispatcher: EventDispatcher,
        protected injectorContext: InjectorContext,
        protected logger: LoggerInterface,
        protected stopwatch: Stopwatch,
    ) {
        this.setHttpRequest = injectorContext.setter(undefined, HttpRequest);
        this.setHttpResponse = injectorContext.setter(undefined, HttpResponse);
        this.setInjectorContext = injectorContext.setter(undefined, InjectorContext);
    }

    /**
     * Creates a request handler function that can be used with http.createServer
     * or any other http server library based on the node.js http module.
     *
     * When `fallThroughOnNotFound` is set to true, the handler will call `next()`
     * when the route is not found, allowing the request to fall through to the next
     * middleware in the chain.
     *
     * @example
     * ```typescript
     * import { createServer } from 'http';
     *
     * const app = new App({
     *   imports: [new HttpModule({})],
     * });
     *
     * const handler = app.get(HttpKernel).createMiddleware({ fallThroughOnNotFound: true });
     * const server = createServer(handler);
     *
     * server.listen(3000);
     * ```
     */
    public createMiddleware(options: HttpKernelMiddlewareOptions = {}) {
        if (options.fallThroughOnNotFound && 'undefined' === typeof options.throwOnNotFound) {
            options.throwOnNotFound = true;
        }
        return (req: IncomingMessage, res: ServerResponse, next: (error?: any) => void) => {
            return this.handleRequest(req, res, options).then(() => {
                next();
            }).catch((error) => {
                if (options.fallThroughOnNotFound && error instanceof HttpError && error.httpCode === 404) {
                    next();
                    return;
                }
                next(error);
            });
        };
    }

    createWorkflow(state: keyof typeof httpWorkflow.places & string, injectorContext: InjectorContext): Workflow<typeof httpWorkflow.places> {
        return httpWorkflow.create(state, this.eventDispatcher, this.stopwatch, injectorContext);
    }

    /**
     * When the states up to the controller have only the default HttpListener listeners, requests skip the workflow
     * machinery (see HttpListener.handleDirect). Recomputed when listeners change.
     */
    protected getDirect(): { listener?: HttpListener, defaultResponseListenersOnly: boolean } {
        const version = this.eventDispatcher.version;
        if (this.direct && this.direct.version === version) return this.direct;

        const defaultOnly = (state: keyof typeof httpWorkflow.places & string) => {
            const listeners = this.eventDispatcher.getListeners(httpWorkflow.getEventToken(state));
            return listeners.length > 0 && listeners.every(v => isEventListenerContainerEntryService(v) && v.classType === HttpListener);
        };

        let listener: HttpListener | undefined;
        if (directStates.every(defaultOnly)) {
            const entry = this.eventDispatcher.getListeners(httpWorkflow.onRoute)[0];
            const instance = isEventListenerContainerEntryService(entry) ? this.injectorContext.get(entry.classType, entry.module) : undefined;
            // a replaced HttpListener (e.g. useClass) may override the steps, so it gets the workflow
            if (instance && instance.constructor === HttpListener) listener = instance;
        }
        this.direct = { version, listener, defaultResponseListenersOnly: defaultOnly('response') };
        return this.direct;
    }

    /**
     * Handles a web standard Request and returns a Response, for servers with a fetch handler
     * like Bun.serve, Deno.serve, Cloudflare Workers, or Lambda adapters that convert events to a Request.
     *
     * The request body is read completely before the route is called, and the response body is
     * collected in memory (streamed responses are sent once they ended).
     *
     * @example
     * ```typescript
     * const kernel = app.get(HttpKernel);
     * Bun.serve({ port: 8080, fetch: request => kernel.fetch(request) });
     * ```
     */
    fetch(request: Request, options?: HttpKernelHandleOptions & { remoteAddress?: string }): Response | Promise<Response> {
        const method = request.method;
        if (method !== 'GET' && method !== 'HEAD' && request.body) {
            // Bun only adds the content-type of e.g. a FormData body when the headers are read before the body
            const contentType = request.headers.get('content-type');
            // JSON is read as text, the body parser then needs no Buffer and decoding step
            if (contentType && jsonContentType.test(contentType)) {
                return request.text().then(body => this.fetchWithBody(request, method, body, options));
            }
            return request.arrayBuffer().then(body => this.fetchWithBody(request, method, Buffer.from(body), options));
        }
        return this.fetchWithBody(request, method, undefined, options);
    }

    protected fetchWithBody(request: Request, method: string, body: Buffer | string | undefined, options?: HttpKernelHandleOptions & { remoteAddress?: string }): Response | Promise<Response> {
        const url = request.url;
        // path and query of an absolute URL, e.g. http://host:8080/path?query
        const schemeEnd = url.indexOf('://');
        const pathStart = schemeEnd === -1 ? 0 : url.indexOf('/', schemeEnd + 3);
        const path = pathStart === -1 ? '/' : url.slice(pathStart);

        const req = FetchHttpRequest.create(method, path, request, body, options?.remoteAddress);
        const res = FetchHttpResponse.create(req);
        const result = this.handleRequestMaybeSync(req, res, options);
        // synchronous routes answer without a promise, like Response-returning fetch handlers do
        if (result) return result.then(() => res.writableEnded ? toResponse(method, res) : responseEnded(method, res));
        // e.g. a stream that is still being piped into the response
        if (!res.writableEnded) return responseEnded(method, res);
        return toResponse(method, res);
    }

    /**
     * Compiles everything requests need upfront: router with parameter parsers and validators, response
     * serializers, and the workflow. Otherwise this happens on the first request of each route.
     *
     * Required on runtimes that allow code generation only at startup (Cloudflare Workers): call it at
     * module level, not in the fetch handler. Elsewhere it removes the latency of first requests.
     */
    warmUp(): void {
        // building the router compiles all routes, including their parameter parsers and validators
        this.router.resolve('GET', '/');
        for (const route of this.router.getRoutes()) {
            const serializerToUse = route.serializer || serializer;
            if (route.returnType && route.returnType.kind !== ReflectionKind.any) {
                getSerializeFunction(route.returnType, serializerToUse.serializeRegistry);
            }
            for (const response of route.responses) {
                if (response.type) getSerializeFunction(response.type, serializerToUse.serializeRegistry);
            }
        }
        this.createWorkflow('start', this.injectorContext).prepare();
        this.getDirect();
    }

    public async request(requestBuilder: RequestBuilder, options: HttpKernelHandleOptions = {}): Promise<MemoryHttpResponse> {
        const request = requestBuilder.build();
        const response = new MemoryHttpResponse(request);
        response.assignSocket(request.socket);
        await this.handleRequest(request, response, options);
        return response;
    }

    async handleRequest(
        _req: IncomingMessage,
        _res: ServerResponse,
        options: HttpKernelHandleOptions = {},
    ): Promise<void> {
        const result = this.handleRequestMaybeSync(_req, _res, options);
        if (result) await result;
    }

    /**
     * Like handleRequest, but returns undefined instead of a promise when the request was handled synchronously
     * (the usual case for synchronous controllers), which saves the promise and microtask ticks per request.
     */
    handleRequestMaybeSync(
        _req: IncomingMessage,
        _res: ServerResponse,
        options: HttpKernelHandleOptions = {},
    ): void | Promise<void> {
        const httpInjectorContext = this.injectorContext.createChildScope('http');
        const req = incomingMessageToHttpRequest(_req);
        const res = serverResponseToHttpResponse(_res);

        this.setHttpRequest(req, httpInjectorContext.scope);
        this.setHttpResponse(res, httpInjectorContext.scope);
        this.setInjectorContext(httpInjectorContext, httpInjectorContext.scope);

        req.throwErrorOnNotFound = options.throwOnNotFound || false;

        // label and data are only computed when the stopwatch records something
        const frame = this.stopwatch.active ? this.stopwatch.start(req.method + ' ' + req.getUrl(), FrameCategory.http, true) : undefined;
        let result: void | Promise<void> | false;
        try {
            if (frame) {
                frame.data({ url: req.getUrl(), method: req.getMethod(), clientIp: req.getRemoteAddress() });
                const workflow = this.createWorkflow('start', httpInjectorContext);
                result = frame.run(() => workflow.apply('request', new HttpRequestEvent(httpInjectorContext, req, res)));
            } else {
                const direct = this.getDirect();
                result = direct.listener
                    ? direct.listener.handleDirect(new HttpDirectRequest(this, httpInjectorContext, req, res, direct.defaultResponseListenersOnly))
                    : false;
                if (result === false) {
                    result = this.createWorkflow('start', httpInjectorContext).applyMaybeSync('request', new HttpRequestEvent(httpInjectorContext, req, res));
                }
            }
        } catch (error: any) {
            try {
                this.handleRequestError(error, httpInjectorContext, req, res);
            } finally {
                this.requestDone(req, res, frame);
            }
            return;
        }

        if (result) {
            return result.then(
                () => this.requestDone(req, res, frame),
                (error: any) => {
                    try {
                        this.handleRequestError(error, httpInjectorContext, req, res);
                    } finally {
                        this.requestDone(req, res, frame);
                    }
                },
            );
        }
        this.requestDone(req, res, frame);
    }

    protected handleRequestError(error: any, httpInjectorContext: InjectorContext, req: HttpRequest, res: HttpResponse): void {
        if (!res.headersSent) {
            const resultFormatter = httpInjectorContext.get(HttpResultFormatter);
            if (error instanceof ValidationError) {
                resultFormatter.handle(new JSONResponse({
                    message: error.message,
                    errors: error.errors,
                }, 400).disableAutoSerializing(), { request: req, response: res });
                return;
            } else if (error instanceof HttpError) {
                if (req.throwErrorOnNotFound && error.httpCode === 404) {
                    throw error;
                }
                resultFormatter.handle(new JSONResponse({
                    message: error.message,
                }, error.httpCode).disableAutoSerializing(), { request: req, response: res });
                return;
            }

            res.status(500);
        }

        this.logger.error('HTTP kernel request failed', error);
    }

    protected requestDone(req: HttpRequest, res: HttpResponse, frame?: StopwatchFrameInterface<FrameCategory.http>): void {
        req.temporaryFilesRemoved = true;
        if (req.temporaryFilePaths) {
            for (const path of req.temporaryFilePaths) {
                unlink(path, () => {
                });
            }
        }

        if (frame) {
            frame.data({ responseStatus: res.statusCode });
            frame.end();
        }
    }
}
