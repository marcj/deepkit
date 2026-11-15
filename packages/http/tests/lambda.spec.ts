import { expect, test } from '@jest/globals';
import { MinLength } from '@deepkit/type';
import { http } from '../src/decorator.js';
import { HttpKernel } from '../src/kernel.js';
import { createLambdaHandler, LambdaHttpEventV1, LambdaHttpEventV2 } from '../src/lambda.js';
import { HttpBody, HttpHeader, HttpQuery, HttpRequest, HttpResponse } from '../src/model.js';
import { Response } from '../src/http.js';
import { createHttpApp } from './utils.js';

class Controller {
    @http.GET('/hello')
    hello() {
        return { hello: 'world' };
    }

    @http.GET('/query')
    query(limit: HttpQuery<number>, auth: HttpHeader<string>, request: HttpRequest) {
        return { limit, auth, ip: request.getRemoteAddress(), cookie: request.headers.cookie };
    }

    @http.POST('/user')
    user(body: HttpBody<{ name: string & MinLength<3> }>) {
        return { name: body.name };
    }

    @http.GET('/cookies')
    cookies(response: HttpResponse) {
        response.setHeader('set-cookie', ['a=1', 'b=2']);
        return 'ok';
    }

    @http.GET('/binary')
    binary() {
        return new Response(Buffer.from([1, 2, 3]), 'image/png');
    }
}

function v2(method: string, rawPath: string, extra: Partial<LambdaHttpEventV2> = {}): LambdaHttpEventV2 {
    return { version: '2.0', rawPath, requestContext: { http: { method, sourceIp: '1.2.3.4' } }, ...extra };
}

function createHandler() {
    const kernel = createHttpApp([Controller]).get(HttpKernel);
    kernel.warmUp();
    return createLambdaHandler(kernel);
}

test('lambda payload 2.0 (HTTP API, Function URL)', async () => {
    const handler = createHandler();

    const hello = await handler(v2('GET', '/hello'));
    expect(hello).toEqual({ statusCode: 200, headers: { 'content-type': 'application/json; charset=utf-8' }, body: '{"hello":"world"}', isBase64Encoded: false });

    const query = await handler(v2('GET', '/query', { rawQueryString: 'limit=5', headers: { Auth: 'token' }, cookies: ['a=1', 'b=2'] }));
    expect(JSON.parse(query.body)).toEqual({ limit: 5, auth: 'token', ip: '1.2.3.4', cookie: 'a=1; b=2' });

    const user = await handler(v2('POST', '/user', { headers: { 'content-type': 'application/json' }, body: Buffer.from('{"name":"Peter"}').toString('base64'), isBase64Encoded: true }));
    expect(JSON.parse(user.body)).toEqual({ name: 'Peter' });

    const invalid = await handler(v2('POST', '/user', { headers: { 'content-type': 'application/json' }, body: '{"name":"Pe"}' }));
    expect(invalid.statusCode).toBe(400);

    const cookies = await handler(v2('GET', '/cookies'));
    expect(cookies.cookies).toEqual(['a=1', 'b=2']);
    expect(cookies.headers['set-cookie']).toBe(undefined);

    const binary = await handler(v2('GET', '/binary'));
    expect(binary.isBase64Encoded).toBe(true);
    expect(Buffer.from(binary.body, 'base64')).toEqual(Buffer.from([1, 2, 3]));

    const notFound = await handler(v2('GET', '/nope'));
    expect(notFound.statusCode).toBe(404);
});

test('lambda payload 1.0 (REST API, ALB)', async () => {
    const handler = createHandler();
    const event: LambdaHttpEventV1 = {
        httpMethod: 'GET', path: '/query',
        headers: { Auth: 'token' },
        multiValueQueryStringParameters: { limit: ['7'] },
        requestContext: { identity: { sourceIp: '5.6.7.8' } },
    };
    const query = await handler(event);
    expect(JSON.parse(query.body)).toEqual({ limit: 7, auth: 'token', ip: '5.6.7.8' });

    const cookies = await handler({ httpMethod: 'GET', path: '/cookies' });
    expect(cookies.multiValueHeaders).toEqual({ 'set-cookie': ['a=1', 'b=2'] });

    const user = await handler({ httpMethod: 'POST', path: '/user', headers: { 'Content-Type': 'application/json' }, body: '{"name":"Peter"}' });
    expect(JSON.parse(user.body)).toEqual({ name: 'Peter' });
});

test('warmUp compiles routes upfront', () => {
    const kernel = createHttpApp([Controller]).get(HttpKernel);
    kernel.warmUp();
    // a second call is a no-op
    kernel.warmUp();
});
