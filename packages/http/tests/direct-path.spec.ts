import { expect, test } from '@jest/globals';
import { EventDispatcher } from '@deepkit/event';
import { http } from '../src/decorator.js';
import { HttpAccessDeniedError, httpWorkflow } from '../src/http.js';
import { HttpKernel } from '../src/kernel.js';
import { HttpRequest } from '../src/model.js';
import { createHttpApp } from './utils.js';

class Controller {
    @http.GET('/hello')
    hello() {
        return { hello: 'world' };
    }

    @http.GET('/async')
    async async() {
        return { async: true };
    }

    @http.GET('/fail')
    fail() {
        throw new Error('broken');
    }

    @http.GET('/denied')
    denied() {
        throw new HttpAccessDeniedError();
    }

    @http.GET('/number/:id')
    number(id: number) {
        return id;
    }
}

test('requests without extra listeners skip the workflow and behave the same', async () => {
    const kernel = createHttpApp([Controller]).get(HttpKernel);
    expect((await kernel.request(HttpRequest.GET('/hello'))).json).toEqual({ hello: 'world' });
    expect((await kernel.request(HttpRequest.GET('/async'))).json).toEqual({ async: true });
    expect((await kernel.request(HttpRequest.GET('/number/5'))).json).toBe(5);

    const notFound = await kernel.request(HttpRequest.GET('/unknown'));
    expect(notFound.statusCode).toBe(404);

    const invalid = await kernel.request(HttpRequest.GET('/number/abc'));
    expect(invalid.statusCode).toBe(400);

    const failed = await kernel.request(HttpRequest.GET('/fail'));
    expect(failed.statusCode).toBe(500);

    const denied = await kernel.request(HttpRequest.GET('/denied'));
    expect(denied.statusCode).toBe(403);
});

test('listeners added later are called', async () => {
    const app = createHttpApp([Controller]);
    const kernel = app.get(HttpKernel);
    const dispatcher = app.get(EventDispatcher);
    expect((await kernel.request(HttpRequest.GET('/hello'))).json).toEqual({ hello: 'world' });

    const calls: string[] = [];
    const unsubscribe = dispatcher.listen(httpWorkflow.onController, event => {
        calls.push('controller ' + event.route.getFullPath());
    });
    expect((await kernel.request(HttpRequest.GET('/hello'))).json).toEqual({ hello: 'world' });
    expect(calls).toEqual(['controller /hello']);

    unsubscribe();
    await kernel.request(HttpRequest.GET('/hello'));
    expect(calls).toEqual(['controller /hello']);
});

test('auth listener can deny access', async () => {
    const app = createHttpApp([Controller]);
    const kernel = app.get(HttpKernel);
    app.get(EventDispatcher).listen(httpWorkflow.onAuth, event => {
        if (event.request.headers['authorization'] !== 'secret') event.accessDenied();
    }, 50);
    expect((await kernel.request(HttpRequest.GET('/hello'))).statusCode).toBe(403);
    expect((await kernel.request(HttpRequest.GET('/hello').header('authorization', 'secret'))).json).toEqual({ hello: 'world' });
});

test('response listeners see every request, also failing ones', async () => {
    const app = createHttpApp([Controller]);
    const kernel = app.get(HttpKernel);
    const seen: string[] = [];
    app.get(EventDispatcher).listen(httpWorkflow.onResponse, event => {
        seen.push(event.request.url + ' ' + event.response.statusCode + ' ' + (event.route ? 'route' : 'no route'));
    }, 101);

    expect((await kernel.request(HttpRequest.GET('/hello'))).json).toEqual({ hello: 'world' });
    await kernel.request(HttpRequest.GET('/fail'));
    await kernel.request(HttpRequest.GET('/number/abc'));
    await kernel.request(HttpRequest.GET('/unknown'));
    expect(seen).toEqual(['/hello 200 route', '/fail 500 route', '/number/abc 400 route', '/unknown 404 no route']);
});

