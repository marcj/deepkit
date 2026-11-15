import { isArray } from '@deepkit/core';
import { HttpKernel } from './kernel.js';
import { FetchHttpRequest, FetchHttpResponse } from './model.js';

/**
 * API Gateway HTTP API and Lambda Function URL event (payload format 2.0).
 */
export interface LambdaHttpEventV2 {
    version: '2.0';
    rawPath: string;
    rawQueryString?: string;
    headers?: { [name: string]: string | undefined };
    cookies?: string[];
    body?: string;
    isBase64Encoded?: boolean;
    requestContext: { http: { method: string, sourceIp?: string } };
}

/**
 * API Gateway REST API and Application Load Balancer event (payload format 1.0).
 */
export interface LambdaHttpEventV1 {
    version?: '1.0';
    httpMethod: string;
    path: string;
    headers?: { [name: string]: string | undefined } | null;
    multiValueHeaders?: { [name: string]: string[] | undefined } | null;
    queryStringParameters?: { [name: string]: string | undefined } | null;
    multiValueQueryStringParameters?: { [name: string]: string[] | undefined } | null;
    body?: string | null;
    isBase64Encoded?: boolean;
    requestContext?: { identity?: { sourceIp?: string } };
}

export type LambdaHttpEvent = LambdaHttpEventV1 | LambdaHttpEventV2;

export interface LambdaHttpResult {
    statusCode: number;
    headers: { [name: string]: string };
    /** payload format 1.0 */
    multiValueHeaders?: { [name: string]: string[] };
    /** payload format 2.0 */
    cookies?: string[];
    body: string;
    isBase64Encoded: boolean;
}

// response bodies with these content types are returned as text, everything else base64 encoded
const textContentType = /^(text\/|application\/(json|xml|javascript|x-www-form-urlencoded)|[^;]*\+(json|xml))/i;

function isV2(event: LambdaHttpEvent): event is LambdaHttpEventV2 {
    return (event as LambdaHttpEventV2).version === '2.0';
}

function queryString(event: LambdaHttpEventV1): string {
    const params = new URLSearchParams();
    if (event.multiValueQueryStringParameters) {
        for (const name in event.multiValueQueryStringParameters) {
            for (const value of event.multiValueQueryStringParameters[name] || []) params.append(name, value);
        }
    } else if (event.queryStringParameters) {
        for (const name in event.queryStringParameters) {
            const value = event.queryStringParameters[name];
            if (value !== undefined) params.append(name, value);
        }
    }
    return params.toString();
}

function lowercaseHeaders(source?: { [name: string]: string | undefined } | null): { [name: string]: string } {
    const headers: { [name: string]: string } = {};
    if (!source) return headers;
    for (const name in source) {
        const value = source[name];
        if (value !== undefined) headers[name.toLowerCase()] = value;
    }
    return headers;
}

/**
 * Creates an AWS Lambda handler for API Gateway (HTTP and REST API), Lambda Function URLs and
 * Application Load Balancers. The app is created once per Lambda instance and serves all its invocations.
 *
 * @example
 * ```typescript
 * const app = new App({ controllers: [MyController], imports: [new HttpModule()] });
 * const kernel = app.get(HttpKernel);
 * kernel.warmUp(); // compile at init time, which is not billed separately and runs before the first request
 *
 * export const handler = createLambdaHandler(kernel);
 * ```
 */
export function createLambdaHandler(kernel: HttpKernel): (event: LambdaHttpEvent) => Promise<LambdaHttpResult> {
    return async (event: LambdaHttpEvent): Promise<LambdaHttpResult> => {
        let method: string;
        let url: string;
        let headers: { [name: string]: string };
        let remoteAddress: string | undefined;
        const v2 = isV2(event);

        if (v2) {
            method = event.requestContext.http.method;
            url = event.rawPath + (event.rawQueryString ? '?' + event.rawQueryString : '');
            headers = lowercaseHeaders(event.headers);
            if (event.cookies && event.cookies.length) headers.cookie = event.cookies.join('; ');
            remoteAddress = event.requestContext.http.sourceIp;
        } else {
            method = event.httpMethod;
            const query = queryString(event);
            url = event.path + (query ? '?' + query : '');
            headers = lowercaseHeaders(event.headers);
            if (event.multiValueHeaders) {
                for (const name in event.multiValueHeaders) {
                    const values = event.multiValueHeaders[name];
                    if (values && values.length) headers[name.toLowerCase()] = values.join(', ');
                }
            }
            remoteAddress = event.requestContext?.identity?.sourceIp;
        }

        const body = event.body ? Buffer.from(event.body, event.isBase64Encoded ? 'base64' : 'utf8') : undefined;
        const request = FetchHttpRequest.create(method, url, undefined, body, remoteAddress);
        request.headers = headers;
        if (body && headers['content-length'] === undefined) headers['content-length'] = String(body.length);

        const response = FetchHttpResponse.create(request);
        const result = kernel.handleRequestMaybeSync(request, response);
        if (result) await result;
        if (!response.writableEnded) {
            await new Promise<void>((resolve, reject) => {
                response.once('finish', resolve);
                response.once('error', reject);
            });
        }

        const responseHeaders: { [name: string]: string } = {};
        const multiValueHeaders: { [name: string]: string[] } = {};
        let cookies: string[] | undefined;
        for (const [name, value] of response.outgoingHeaders) {
            if (name === 'set-cookie' && v2) {
                cookies = isArray(value) ? value : [String(value)];
            } else if (isArray(value)) {
                if (v2) {
                    responseHeaders[name] = value.join(', ');
                } else {
                    multiValueHeaders[name] = value;
                }
            } else {
                responseHeaders[name] = String(value);
            }
        }

        const responseBody = response.getBody();
        const contentType = responseHeaders['content-type'] || '';
        const asText = responseBody === null || 'string' === typeof responseBody || textContentType.test(contentType);
        const lambdaResult: LambdaHttpResult = {
            statusCode: response.statusCode,
            headers: responseHeaders,
            body: responseBody === null ? '' : asText ? responseBody.toString() : responseBody.toString('base64'),
            isBase64Encoded: !asText,
        };
        if (cookies) lambdaResult.cookies = cookies;
        if (!v2 && Object.keys(multiValueHeaders).length) lambdaResult.multiValueHeaders = multiValueHeaders;
        return lambdaResult;
    };
}
