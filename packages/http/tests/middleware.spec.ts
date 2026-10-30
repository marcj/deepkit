import { expect, test } from '@jest/globals';
import { http } from '../src/decorator.js';
import { createHttpKernel } from './utils.js';
import { HttpMiddleware, httpMiddleware } from '../src/middleware.js';
import { HttpRequest, HttpResponse } from '../src/model.js';
import { AppModule } from '@deepkit/app';
import { sleep } from '@deepkit/core';
import { HttpUnauthorizedError } from '../src/http.js';

class Controller {
    @http.GET('user/:name')
    hello(name: string) {
        return name;
    }
}

test('middleware empty', async () => {
    const httpKernel = createHttpKernel([Controller], [], [], [httpMiddleware.for((req, res, next) => {
        next();
    }).timeout(100)]);

    const response = await httpKernel.request(HttpRequest.GET('/user/name1'));
    expect(response.statusCode).toEqual(200);
    expect(response.bodyString).toEqual('"name1"');
    expect(response.getHeader('Content-Type')).toEqual('application/json; charset=utf-8');
});

test('middleware async success', async () => {
    const httpKernel = createHttpKernel([Controller], [], [], [httpMiddleware.for(async (req, res, next) => {
        await sleep(0.1);
        res.end('nope');
    })]);

    const response = await httpKernel.request(HttpRequest.GET('/user/name1'));
    expect(response.statusCode).toEqual(200);
    expect(response.bodyString).toEqual('nope');
});

test('middleware async failed', async () => {
    const httpKernel = createHttpKernel([Controller], [], [], [httpMiddleware.for(async (req, res, next) => {
        await sleep(0.1);
        throw new Error('nope');
    })]);

    const response = await httpKernel.request(HttpRequest.GET('/user/name1'));
    expect(response.statusCode).toEqual(404);
    expect(response.bodyString).toEqual('Not found');
});

test('middleware class async success', async () => {
    class MyMiddleware implements HttpMiddleware {
        async execute(req: HttpRequest, res: HttpResponse, next: (err?: any) => void): Promise<void> {
            await sleep(0.1);
            res.end('nope');
        }
    }

    const httpKernel = createHttpKernel([Controller], [MyMiddleware], [], [httpMiddleware.for(MyMiddleware)]);

    const response = await httpKernel.request(HttpRequest.GET('/user/name1'));
    expect(response.statusCode).toEqual(200);
    expect(response.bodyString).toEqual('nope');
});

test('middleware class async failed', async () => {
    class MyMiddleware implements HttpMiddleware {
        async execute(req: HttpRequest, res: HttpResponse, next: (err?: any) => void): Promise<void> {
            await sleep(0.1);
            throw new Error('nope');
        }
    }

    const httpKernel = createHttpKernel([Controller], [MyMiddleware], [], [httpMiddleware.for(MyMiddleware)]);

    const response = await httpKernel.request(HttpRequest.GET('/user/name1'));
    expect(response.statusCode).toEqual(404);
    expect(response.bodyString).toEqual('Not found');
});

test('middleware direct response', async () => {
    const httpKernel = createHttpKernel([Controller], [], [], [httpMiddleware.for((req, res, next) => {
        res.end('nope');
    })]);

    const response = await httpKernel.request(HttpRequest.GET('/user/name1'));
    expect(response.statusCode).toEqual(200);
    expect(response.bodyString).toEqual('nope');
});

test('middleware async throwing HttpError returns its status code', async () => {
    const httpKernel = createHttpKernel([Controller], [], [], [httpMiddleware.for(async (req, res, next) => {
        await sleep(0.1);
        throw new HttpUnauthorizedError('Invalid token');
    })]);

    const response = await httpKernel.request(HttpRequest.GET('/user/name1'));
    expect(response.statusCode).toEqual(401);
    expect(response.json).toEqual({ message: 'Invalid token' });
});

test('middleware for controller', async () => {
    class MyController {
        @http.GET('/another/:name')
        hello(name: string) {
            return name;
        }
    }

    const httpKernel = createHttpKernel([Controller, MyController], [], [], [httpMiddleware.for((req, res, next) => {
        res.setHeader('middleware', '1');
        next();
    }).forControllers(MyController)]);

    {
        const response = await httpKernel.request(HttpRequest.GET('/user/name1'));
        expect(response.statusCode).toEqual(200);
        expect(response.getHeader('middleware')).toEqual(undefined);
    }
    {
        const response = await httpKernel.request(HttpRequest.GET('/another/name1'));
        expect(response.statusCode).toEqual(200);
        expect(response.getHeader('middleware')).toEqual('1');
    }
});

test('middleware excludeControllers', async () => {
    class MyController {
        @http.GET('/another/:name')
        hello(name: string) {
            return name;
        }
    }

    const httpKernel = createHttpKernel([Controller, MyController], [], [], [httpMiddleware.for((req, res, next) => {
        res.setHeader('middleware', '1');
        next();
    }).excludeControllers(Controller)]);

    {
        const response = await httpKernel.request(HttpRequest.GET('/user/name1'));
        expect(response.statusCode).toEqual(200);
        expect(response.getHeader('middleware')).toEqual(undefined);
    }
    {
        const response = await httpKernel.request(HttpRequest.GET('/another/name1'));
        expect(response.statusCode).toEqual(200);
        expect(response.getHeader('middleware')).toEqual('1');
    }
});

test('middleware for names', async () => {
    class MyController {
        @(http.GET('/another/:name').name('another'))
        hello(name: string) {
            return name;
        }

        @(http.GET('/api/user/:name').name('api_user'))
        apiUser(name: string) {
            return name;
        }

        @(http.GET('/api/group/:name').name('api_group'))
        apiGroup(name: string) {
            return name;
        }
    }

    const httpKernel = createHttpKernel([MyController], [], [], [httpMiddleware.for((req, res, next) => {
        res.setHeader('middleware', '1');
        next();
    }).forRouteNames('api_*').excludeRouteNames('api_group')]);

    {
        const response = await httpKernel.request(HttpRequest.GET('/api/user/name1'));
        expect(response.statusCode).toEqual(200);
        expect(response.getHeader('middleware')).toEqual('1');
    }
    {
        const response = await httpKernel.request(HttpRequest.GET('/api/group/name1'));
        expect(response.statusCode).toEqual(200);
        expect(response.getHeader('middleware')).toEqual(undefined);
    }
    {
        const response = await httpKernel.request(HttpRequest.GET('/another/name1'));
        expect(response.statusCode).toEqual(200);
        expect(response.getHeader('middleware')).toEqual(undefined);
    }
});

test('middleware for routes', async () => {
    class MyController {
        @(http.GET('/another/:name').group('another'))
        hello(name: string) {
            return name;
        }

        @(http.GET('/api/user/:name').group('api'))
        apiUser(name: string) {
            return name;
        }

        @(http.GET('/api/group/:name').group('api'))
        apiGroup(name: string) {
            return name;
        }
    }

    const httpKernel = createHttpKernel([MyController], [], [], [
        httpMiddleware.for((req, res, next) => {
            res.setHeader('middleware_get', '1');
            next();
        }).forRoutes({ httpMethod: 'GET' }),
        httpMiddleware.for((req, res, next) => {
            res.setHeader('middleware_api_group', '1');
            next();
        }).forRoutes({ group: 'api' }),
        httpMiddleware.for((req, res, next) => {
            res.setHeader('middleware_api_path', '1');
            next();
        }).forRoutes({ path: '/api/*' }),
        httpMiddleware.for((req, res, next) => {
            res.setHeader('middleware_api_user', '1');
            next();
        }).forRoutes({ path: '/api/user/*' }),
        httpMiddleware.for((req, res, next) => {
            res.setHeader('middleware_another', '1');
            next();
        }).forRoutes({ group: 'another' })
    ]);

    {
        const response = await httpKernel.request(HttpRequest.GET('/another/name1'));
        expect(response.statusCode).toEqual(200);
        expect(response.getHeader('middleware_get')).toEqual('1');
        expect(response.getHeader('middleware_another')).toEqual('1');
        expect(response.getHeader('middleware_api_group')).toEqual(undefined);
        expect(response.getHeader('middleware_api_path')).toEqual(undefined);
    }

    {
        const response = await httpKernel.request(HttpRequest.GET('/api/group/name1'));
        expect(response.statusCode).toEqual(200);
        expect(response.getHeader('middleware_api_group')).toEqual('1');
        expect(response.getHeader('middleware_api_path')).toEqual('1');
        expect(response.getHeader('middleware_get')).toEqual('1');
        expect(response.getHeader('middleware_another')).toEqual(undefined);
    }

    {
        const response = await httpKernel.request(HttpRequest.GET('/api/user/name1'));
        expect(response.statusCode).toEqual(200);
        expect(response.getHeader('middleware_api_group')).toEqual('1');
        expect(response.getHeader('middleware_api_path')).toEqual('1');
        expect(response.getHeader('middleware_api_user')).toEqual('1');
        expect(response.getHeader('middleware_get')).toEqual('1');
        expect(response.getHeader('middleware_another')).toEqual(undefined);
    }
});

test('middleware timeout', async () => {
    const httpKernel = createHttpKernel([Controller], [], [], [httpMiddleware.for((req, res, next) => {
        //do nothing
    }).timeout(1000)]);

    const response = await httpKernel.request(HttpRequest.GET('/user/name1'));
    expect(response.statusCode).toEqual(200);
    expect(response.bodyString).toEqual('"name1"');
});

test('middleware keep content type', async () => {
    const httpKernel = createHttpKernel([Controller], [], [], [httpMiddleware.for((req, res, next) => {
        res.setHeader('Content-Type', 'text/plain');
        next();
    })]);

    const response = await httpKernel.request(HttpRequest.GET('/user/name1'));
    expect(response.statusCode).toEqual(200);
    expect(response.bodyString).toEqual('"name1"');
    expect(response.getHeader('Content-Type')).toEqual('text/plain');
});

test('middleware order natural', async () => {
    const order: number[] = [];
    const httpKernel = createHttpKernel([Controller], [], [], [
        httpMiddleware.for((req, res, next) => {
            order.push(1);
            next();
        }),
        httpMiddleware.for((req, res, next) => {
            order.push(2);
            next();
        }),
        httpMiddleware.for((req, res, next) => {
            order.push(3);
            next();
        })
    ]);

    const response = await httpKernel.request(HttpRequest.GET('/user/name1'));
    expect(response.statusCode).toEqual(200);

    expect(order).toEqual([1, 2, 3]);
});

test('middleware order changed', async () => {
    const order: number[] = [];
    const httpKernel = createHttpKernel([Controller], [], [], [
        httpMiddleware.for((req, res, next) => {
            order.push(1);
            next();
        }),
        httpMiddleware.for((req, res, next) => {
            order.push(2);
            next();
        }),
        httpMiddleware.for((req, res, next) => {
            order.push(3);
            next();
        }).order(-1)
    ]);

    const response = await httpKernel.request(HttpRequest.GET('/user/name1'));
    expect(response.statusCode).toEqual(200);

    expect(order).toEqual([3, 1, 2]);
});


test('middleware for module', async () => {

    class MyControllerA {
        @http.GET('/a/:name')
        hello(name: string) {
            return name;
        }
    }

    class MyControllerB {
        @http.GET('/b/:name')
        hello(name: string) {
            return name;
        }
    }
    const moduleA = new AppModule({}, {controllers: [MyControllerA], providers: [MyControllerA]});
    const moduleB = new AppModule({}, {controllers: [MyControllerB], providers: [MyControllerB]});

    const httpKernel = createHttpKernel([
    ], [], [], [
        httpMiddleware.for((req, res, next) => {
            res.setHeader('middleware', '1');
            next();
        }).forModules(moduleB),
    ], [moduleA, moduleB]);

    {
        const response = await httpKernel.request(HttpRequest.GET('/a/name1'));
        expect(response.statusCode).toEqual(200);
        expect(response.getHeader('middleware')).toEqual(undefined);
    }

    {
        const response = await httpKernel.request(HttpRequest.GET('/b/name1'));
        expect(response.statusCode).toEqual(200);
        expect(response.getHeader('middleware')).toEqual('1');
    }
});


test('middleware self module', async () => {
    class MyControllerA {
        @http.GET('/a/:name')
        hello(name: string) {
            return name;
        }
    }
    const moduleA = new AppModule({}, {controllers: [MyControllerA]});

    const httpKernel = createHttpKernel([Controller], [], [], [httpMiddleware.for((req, res, next) => {
        res.setHeader('middleware', '1');
        next();
    }).forSelfModules()], [moduleA]);

    {
        const response = await httpKernel.request(HttpRequest.GET('/user/name1'));
        expect(response.statusCode).toEqual(200);
        expect(response.getHeader('middleware')).toEqual('1');
    }

    {
        const response = await httpKernel.request(HttpRequest.GET('/a/name1'));
        expect(response.statusCode).toEqual(200);
        expect(response.getHeader('middleware')).toEqual(undefined);
    }
});

test('middleware class type', async () => {
    class MyMiddleware {
        execute(request: HttpRequest, response: HttpResponse, next: (error?: any) => void) {
            response.setHeader('middleware', '1');
            next();
        }
    }

    const httpKernel = createHttpKernel([Controller], [MyMiddleware], [], [httpMiddleware.for(MyMiddleware)]);

    const response = await httpKernel.request(HttpRequest.GET('/user/name1'));
    expect(response.statusCode).toEqual(200);
    expect(response.getHeader('middleware')).toEqual('1');
});


test('middleware on http controller', async () => {
    class MyMiddleware {
        execute(request: HttpRequest, response: HttpResponse, next: (error?: any) => void) {
            response.setHeader('middleware_a', '1');
            next();
        }
    }

    @http.middleware(MyMiddleware)
    class MyControllerA {
        @http.GET('/a/:name')
        a(name: string) {
            return name;
        }

        @(http.GET('/b/:name').middleware((req, res, next) => {
            res.setHeader('middleware_b', '1');
            next();
        }))
        b(name: string) {
            return name;
        }
    }

    const httpKernel = createHttpKernel([MyControllerA], [MyMiddleware]);

    {
        const response = await httpKernel.request(HttpRequest.GET('/a/name1'));
        expect(response.statusCode).toEqual(200);
        expect(response.getHeader('middleware_a')).toEqual('1');
        expect(response.getHeader('middleware_b')).toEqual(undefined);
    }

    {
        const response = await httpKernel.request(HttpRequest.GET('/b/name1'));
        expect(response.statusCode).toEqual(200);
        expect(response.getHeader('middleware_a')).toEqual('1');
        expect(response.getHeader('middleware_b')).toEqual('1');
    }
});
