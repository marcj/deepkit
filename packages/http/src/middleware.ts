import { ClassType, isClass } from '@deepkit/core';
import { AppModule } from '@deepkit/app';
import { createFreeDecoratorContext } from '@deepkit/type';
import { HttpRequest, HttpResponse } from './model.js';
import { InjectorModule } from '@deepkit/injector';

export type HttpMiddlewareFn = (req: HttpRequest, res: HttpResponse, next: (err?: any) => void) => void | Promise<void>;

export interface HttpMiddleware {
    execute: HttpMiddlewareFn;
}

export interface HttpMiddlewareRoute {
    path?: string;
    pathRegExp?: RegExp;
    httpMethod?: 'GET' | 'HEAD' | 'POST' | 'PATCH' | 'PUT' | 'DELETE' | 'OPTIONS' | 'TRACE';
    category?: string;
    excludeCategory?: string;
    group?: string;
    excludeGroup?: string;
}

export class HttpMiddlewareConfig {
    name?: string;
    middlewares: (HttpMiddlewareFn | ClassType<HttpMiddleware>)[] = [];

    routes: HttpMiddlewareRoute[] = [];
    excludeRoutes: HttpMiddlewareRoute[] = [];

    order: number = 0;

    controllers: ClassType[] = [];
    excludeControllers: ClassType[] = [];

    routeNames: string[] = [];
    excludeRouteNames: string[] = [];

    timeout?: number;

    modules: InjectorModule<any>[] = [];

    selfModule: boolean = false;

    getClassTypes(): ClassType[] {
        const classTypes: ClassType[] = [];
        for (const middleware of this.middlewares) {
            if (isClass(middleware)) classTypes.push(middleware);
        }

        return classTypes;
    }
}

export class HttpMiddlewareApi {
    t = new HttpMiddlewareConfig;

    name(name: string) {
        this.t.name = name;
    }

    for(...middlewares: (HttpMiddlewareFn | ClassType<HttpMiddleware>)[]) {
        this.t.middlewares = middlewares;
    }

    forRoutes(...routes: HttpMiddlewareRoute[]) {
        this.t.routes = routes;
    }

    excludeRoutes(...routes: HttpMiddlewareRoute[]) {
        this.t.excludeRoutes = routes;
    }

    forRouteNames(...names: string[]) {
        this.t.routeNames = names;
    }

    excludeRouteNames(...names: string[]) {
        this.t.excludeRouteNames = names;
    }

    /**
     * When the middleware neither calls next() nor ends the response within <timeout> milliseconds,
     * the request fails with HttpGatewayTimeoutError (504) and a warning is logged.
     */
    timeout(timeout: number) {
        this.t.timeout = timeout;
    }

    forControllers(...controllers: ClassType[]) {
        this.t.controllers = controllers;
    }

    excludeControllers(...controllers: ClassType[]) {
        this.t.excludeControllers = controllers;
    }

    /**
     * Per default middlewares are executed in the order they were registered. The default order is 0. A lower order means the middleware is executed earlier.
     */
    order(order: number) {
        this.t.order = order;
    }

    forModules(...modules: AppModule<any>[]) {
        this.t.modules = modules;
    }

    /**
     * Limit the middleware to the module where this middleware is defined.
     */
    forSelfModules() {
        this.t.selfModule = true;
    }
}

export const httpMiddleware = createFreeDecoratorContext(HttpMiddlewareApi);
