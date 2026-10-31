/**
 * Deepkit Framework
 * Copyright (C) 2021 Deepkit UG, Marc J. Schmidt
 *
 * This program is free software: you can redistribute it and/or modify
 * it under the terms of the MIT License.
 *
 * You should have received a copy of the MIT License along with this program.
 */
import { BenchSuite } from '@deepkit/bench';
import { HttpRequest, HttpRouter, HttpRouterRegistry, http, httpClass, httpMiddleware } from '@deepkit/http';
import { InjectorModule } from '@deepkit/injector';
import { deserialize, serialize } from '@deepkit/type';

/**
 * HTTP router benchmark - tests Deepkit's HTTP routing and request handling performance
 *
 * This benchmark tests:
 * - Route matching performance (simple routes, parameterized routes, regex routes)
 * - Request parsing (query params, body deserialization)
 * - Response serialization
 * - Controller method resolution
 * - Middleware/hook execution overhead
 */

// Simple controller for benchmarks
@http.controller('/api')
class SimpleController {
    @http.GET('/hello')
    hello() {
        return { message: 'Hello World' };
    }

    @http.GET('/users/:id')
    getUser(id: number) {
        return { id, name: 'User ' + id };
    }

    @http.GET('/items/:category/:id')
    getItem(category: string, id: number) {
        return { category, id };
    }

    @http.POST('/users')
    createUser(name: string, email: string) {
        return { id: 1, name, email };
    }

    @http.GET('/search')
    search(query: string, limit?: number) {
        return { query, limit: limit || 10 };
    }

    @http.GET('/filter')
    filter(page?: number, sort?: string, order?: 'asc' | 'desc') {
        return { page, sort, order };
    }
}

// Controller with many routes for route matching benchmark
@http.controller('/v1')
class ManyRoutesController {
    @http.GET('/users') users() {
        return [];
    }
    @http.GET('/users/:id') user(id: number) {
        return { id };
    }
    @http.GET('/posts') posts() {
        return [];
    }
    @http.GET('/posts/:id') post(id: number) {
        return { id };
    }
    @http.GET('/comments') comments() {
        return [];
    }
    @http.GET('/comments/:id') comment(id: number) {
        return { id };
    }
    @http.GET('/tags') tags() {
        return [];
    }
    @http.GET('/tags/:id') tag(id: number) {
        return { id };
    }
    @http.GET('/categories') categories() {
        return [];
    }
    @http.GET('/categories/:id') category(id: number) {
        return { id };
    }
    @http.GET('/products') products() {
        return [];
    }
    @http.GET('/products/:id') product(id: number) {
        return { id };
    }
    @http.GET('/orders') orders() {
        return [];
    }
    @http.GET('/orders/:id') order(id: number) {
        return { id };
    }
    @http.GET('/invoices') invoices() {
        return [];
    }
    @http.GET('/invoices/:id') invoice(id: number) {
        return { id };
    }
}

// Types for serialization benchmarks
interface User {
    id: number;
    username: string;
    email: string;
    age: number;
    active: boolean;
    createdAt: Date;
}

interface ApiResponse<T> {
    data: T;
    meta: {
        page: number;
        total: number;
        timestamp: Date;
    };
}

// Sample data for benchmarks
const sampleUser: User = {
    id: 1,
    username: 'john_doe',
    email: 'john@example.com',
    age: 30,
    active: true,
    createdAt: new Date('2024-01-01'),
};

const sampleUsers: User[] = Array.from({ length: 10 }, (_, i) => ({
    id: i + 1,
    username: `user_${i}`,
    email: `user${i}@example.com`,
    age: 20 + (i % 50),
    active: i % 2 === 0,
    createdAt: new Date('2024-01-01'),
}));

const sampleApiResponse: ApiResponse<User[]> = {
    data: sampleUsers,
    meta: {
        page: 1,
        total: 100,
        timestamp: new Date(),
    },
};

export default async function () {
    const suite = new BenchSuite('http/router');

    const module = new InjectorModule();

    // Create routers for different benchmarks
    const simpleRouter = HttpRouter.forControllers([SimpleController], undefined, module);
    const manyRoutesRouter = HttpRouter.forControllers([ManyRoutesController], undefined, module);

    // Pre-build requests for benchmarks
    const simpleGetRequest = HttpRequest.GET('/api/hello').build();
    const paramGetRequest = HttpRequest.GET('/api/users/123').build();
    const multiParamRequest = HttpRequest.GET('/api/items/electronics/456').build();
    const queryRequest = HttpRequest.GET('/api/search').query({ query: 'test', limit: '20' }).build();
    const queriesRequest = HttpRequest.GET('/api/filter').query({ page: '2', sort: 'name', order: 'asc' }).build();
    const postRequest = HttpRequest.POST('/api/users').json({ name: 'John Doe', email: 'john@example.com' }).build();

    // Requests for many routes router
    const manyRoutesFirstRequest = HttpRequest.GET('/v1/users').build();
    const manyRoutesMiddleRequest = HttpRequest.GET('/v1/products').build();
    const manyRoutesLastRequest = HttpRequest.GET('/v1/invoices/999').build();
    const notFoundRequest = HttpRequest.GET('/v1/nonexistent').build();

    // ============================================================================
    // ROUTE MATCHING BENCHMARKS
    // ============================================================================

    // Benchmark: Simple static route matching
    suite.add('route match - simple static', () => {
        simpleRouter.resolve('GET', '/api/hello');
    });

    // Benchmark: Route with single parameter
    suite.add('route match - single param', () => {
        simpleRouter.resolve('GET', '/api/users/123');
    });

    // Benchmark: Route with multiple parameters
    suite.add('route match - multi param', () => {
        simpleRouter.resolve('GET', '/api/items/electronics/456');
    });

    // Benchmark: Route with query string (parsing overhead)
    suite.add('route match - with query', () => {
        simpleRouter.resolve('GET', '/api/search?query=test&limit=20');
    });

    // Benchmark: Many routes - first route (best case)
    suite.add('route match - many routes (first)', () => {
        manyRoutesRouter.resolve('GET', '/v1/users');
    });

    // Benchmark: Many routes - middle route
    suite.add('route match - many routes (middle)', () => {
        manyRoutesRouter.resolve('GET', '/v1/products');
    });

    // Benchmark: Many routes - last route with param (worst case)
    suite.add('route match - many routes (last)', () => {
        manyRoutesRouter.resolve('GET', '/v1/invoices/999');
    });

    // Benchmark: Route not found
    suite.add('route match - not found', () => {
        manyRoutesRouter.resolve('GET', '/v1/nonexistent');
    });

    // ============================================================================
    // REQUEST RESOLUTION BENCHMARKS
    // ============================================================================

    // Benchmark: Resolve request object - simple
    suite.add('resolve request - simple', () => {
        simpleRouter.resolveRequest(simpleGetRequest);
    });

    // Benchmark: Resolve request object - with params
    suite.add('resolve request - with params', () => {
        simpleRouter.resolveRequest(paramGetRequest);
    });

    // Benchmark: Resolve request object - with query
    suite.add('resolve request - with query', () => {
        simpleRouter.resolveRequest(queryRequest);
    });

    // ============================================================================
    // SERIALIZATION BENCHMARKS
    // ============================================================================

    // Benchmark: Serialize single user response
    suite.add('serialize - single user', () => {
        serialize<User>(sampleUser);
    });

    // Benchmark: Serialize user array response
    suite.add('serialize - user array (10)', () => {
        serialize<User[]>(sampleUsers);
    });

    // Benchmark: Serialize complex API response
    suite.add('serialize - api response', () => {
        serialize<ApiResponse<User[]>>(sampleApiResponse);
    });

    // Benchmark: JSON.stringify baseline (for comparison)
    suite.add('JSON.stringify - single user', () => {
        JSON.stringify(sampleUser);
    });

    // Benchmark: JSON.stringify array baseline
    suite.add('JSON.stringify - user array (10)', () => {
        JSON.stringify(sampleUsers);
    });

    // ============================================================================
    // DESERIALIZATION BENCHMARKS (Body parsing simulation)
    // ============================================================================

    const rawUserJson = JSON.stringify(sampleUser);
    const rawUsersJson = JSON.stringify(sampleUsers);
    const rawUserParsed = JSON.parse(rawUserJson);
    const rawUsersParsed = JSON.parse(rawUsersJson);

    // Benchmark: Deserialize single user body
    suite.add('deserialize - single user', () => {
        deserialize<User>(rawUserParsed);
    });

    // Benchmark: Deserialize user array body
    suite.add('deserialize - user array (10)', () => {
        deserialize<User[]>(rawUsersParsed);
    });

    // Benchmark: JSON.parse baseline
    suite.add('JSON.parse - single user', () => {
        JSON.parse(rawUserJson);
    });

    // ============================================================================
    // ROUTER REGISTRY BENCHMARKS
    // ============================================================================

    // Benchmark: Create router registry
    suite.add('create router registry', () => {
        new HttpRouterRegistry();
    });

    // Benchmark: Add route via registry
    suite.add('registry - add GET route', () => {
        const registry = new HttpRouterRegistry();
        registry.get('/test', () => 'ok');
    });

    // Benchmark: Add multiple routes
    suite.add('registry - add 5 routes', () => {
        const registry = new HttpRouterRegistry();
        registry.get('/route1', () => 1);
        registry.post('/route2', () => 2);
        registry.put('/route3', () => 3);
        registry.delete('/route4', () => 4);
        registry.patch('/route5', () => 5);
    });

    // ============================================================================
    // URL RESOLUTION BENCHMARKS
    // ============================================================================

    // Create router with named routes
    const namedRegistry = new HttpRouterRegistry();
    namedRegistry.get({ path: '/users/:id', name: 'user.show' }, (id: number) => ({ id }));
    namedRegistry.get(
        { path: '/posts/:postId/comments/:commentId', name: 'post.comment' },
        (postId: number, commentId: number) => ({ postId, commentId }),
    );
    const namedRouter = HttpRouter.forControllers([], undefined, module);
    for (const route of namedRegistry.getRoutes()) {
        namedRouter.addRoute(route);
    }

    // Benchmark: Resolve URL by name - simple
    suite.add('resolveUrl - single param', () => {
        namedRouter.resolveUrl('user.show', { id: 123 });
    });

    // Benchmark: Resolve URL by name - multiple params
    suite.add('resolveUrl - multi param', () => {
        namedRouter.resolveUrl('post.comment', { postId: 1, commentId: 42 });
    });

    // ============================================================================
    // MIDDLEWARE CONFIGURATION BENCHMARKS
    // ============================================================================

    // Benchmark: Create middleware config
    suite.add('middleware config - create', () => {
        httpMiddleware.for((req, res, next) => next());
    });

    // Benchmark: Middleware config with route filter
    suite.add('middleware config - with route filter', () => {
        httpMiddleware.for((req, res, next) => next()).forRoutes({ path: '/api/*' });
    });

    // ============================================================================
    // CONTROLLER DECORATOR BENCHMARKS
    // ============================================================================

    // Benchmark: Read controller metadata
    suite.add('read controller metadata', () => {
        httpClass._fetch(SimpleController);
    });

    // Benchmark: Get routes from router
    suite.add('get routes from router', () => {
        simpleRouter.getRoutes();
    });

    return suite;
}
