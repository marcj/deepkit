import { expect, test } from '@jest/globals';
import { IncomingMessage, ServerResponse } from 'http';
import { Socket } from 'net';
import { http } from '../src/decorator.js';
import { HttpBody, HttpRequest, HttpResponse, incomingMessageToHttpRequest, serverResponseToHttpResponse } from '../src/model.js';
import { createHttpKernel } from './utils.js';

class Controller {
    @http.POST('/object')
    object(body: HttpBody<{ a: number, d?: Date }>) {
        return body;
    }

    @http.POST('/array')
    array(body: HttpBody<number[]>) {
        return body;
    }
}

function post(path: string, contentType: string, body: string) {
    return HttpRequest.POST(path).header('content-type', contentType).body(body);
}

test('JSON body is parsed without formidable', async () => {
    const kernel = createHttpKernel([Controller]);

    expect((await kernel.request(post('/object', 'application/json', '{"a":"2"}'))).json).toEqual({ a: 2 });
    expect((await kernel.request(post('/object', 'application/vnd.api+json; charset=utf-8', '{"a":3}'))).json).toEqual({ a: 3 });
    expect((await kernel.request(post('/object', 'application/json', '{"a":1,"ü":"€"}'))).json).toEqual({ a: 1 });
    expect((await kernel.request(post('/array', 'application/json', '[1,2]'))).json).toEqual([1, 2]);
    // formidable turned [] into {}, which failed validation
    expect((await kernel.request(post('/array', 'application/json', '[]'))).json).toEqual([]);
});

test('invalid JSON body is a 400, not a 500', async () => {
    const kernel = createHttpKernel([Controller]);

    const invalid = await kernel.request(post('/object', 'application/json', '{bad'));
    expect(invalid.statusCode).toBe(400);
    expect(invalid.json).toEqual({ message: 'Invalid JSON body' });

    const primitive = await kernel.request(post('/object', 'application/json', '5'));
    expect(primitive.statusCode).toBe(400);

    const empty = await kernel.request(post('/object', 'application/json', ''));
    expect(empty.statusCode).toBe(400);
    expect(empty.json.errors[0].path).toBe('a');

    const invalidDate = await kernel.request(post('/object', 'application/json', '{"a":1,"d":"nope"}'));
    expect(invalidDate.statusCode).toBe(400);
    expect(invalidDate.json.errors[0].path).toBe('d');
});

test('plain node request and response get the HttpRequest/HttpResponse API', () => {
    const request = new IncomingMessage(new Socket());
    request.url = '/hello';
    const httpRequest = incomingMessageToHttpRequest(request);
    expect(httpRequest).toBe(request);
    expect(httpRequest instanceof HttpRequest).toBe(true);
    expect(httpRequest.store).toEqual({});
    expect(httpRequest.uploadedFiles).toEqual({});
    expect(httpRequest.throwErrorOnNotFound).toBe(false);
    expect(httpRequest.getUrl()).toBe('/hello');
    expect(incomingMessageToHttpRequest(httpRequest)).toBe(request);
    // the brand only applies to HttpRequest itself, not to subclasses
    class MyRequest extends HttpRequest {
    }
    expect(httpRequest instanceof MyRequest).toBe(false);
    expect(new IncomingMessage(new Socket()) instanceof HttpRequest).toBe(false);

    const response = new ServerResponse(request);
    const httpResponse = serverResponseToHttpResponse(response);
    expect(httpResponse instanceof HttpResponse).toBe(true);
    expect(typeof httpResponse.status).toBe('function');
});

test('createMiddleware handles plain node objects', async () => {
    class Hello {
        @http.GET('/hello')
        hello(request: HttpRequest) {
            return { store: request.store, isHttpRequest: request instanceof HttpRequest };
        }
    }

    const kernel = createHttpKernel([Hello]);
    const request = new IncomingMessage(new Socket());
    request.method = 'GET';
    request.url = '/hello';
    request.headers = {};
    const response = new ServerResponse(request);
    let written = '';
    (response as any)._send = (data: any) => {
        written += String(data);
        return true;
    };
    await kernel.handleRequest(request, response);
    expect(response.statusCode).toBe(200);
    expect(written).toContain('{"store":{},"isHttpRequest":true}');
});
