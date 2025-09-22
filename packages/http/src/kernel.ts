import { InjectorContext, Setter } from '@deepkit/injector';
import { HttpRouter } from './router.js';
import { EventDispatcher } from '@deepkit/event';
import { LoggerInterface } from '@deepkit/logger';
import { HttpRequest, HttpResponse, incomingMessageToHttpRequest, MemoryHttpResponse, RequestBuilder, serverResponseToHttpResponse } from './model.js';
import { HttpError, HttpRequestEvent, HttpResultFormatter, httpWorkflow, JSONResponse } from './http.js';
import { FrameCategory, Stopwatch } from '@deepkit/stopwatch';
import { unlink } from 'fs';
import { ValidationError } from '@deepkit/type';
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

export class HttpKernel {
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
        const httpInjectorContext = this.injectorContext.createChildScope('http');
        const req = incomingMessageToHttpRequest(_req);
        const res = serverResponseToHttpResponse(_res);

        this.setHttpRequest(req, httpInjectorContext.scope);
        this.setHttpResponse(res, httpInjectorContext.scope);
        this.setInjectorContext(httpInjectorContext, httpInjectorContext.scope);

        req.throwErrorOnNotFound = options.throwOnNotFound || false;

        const frame = this.stopwatch.start(req.method + ' ' + req.getUrl(), FrameCategory.http, true);
        const workflow = httpWorkflow.create('start', this.eventDispatcher, this.stopwatch, httpInjectorContext);

        try {
            frame.data({ url: req.getUrl(), method: req.getMethod(), clientIp: req.getRemoteAddress() });
            await frame.run(() => workflow.apply('request', new HttpRequestEvent(httpInjectorContext, req, res)));
        } catch (error: any) {
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
        } finally {
            for (const file of Object.values(req.uploadedFiles || [])) {
                unlink(file.path, () => {
                });
            }

            frame.data({ responseStatus: res.statusCode });
            frame.end();
        }
    }
}
