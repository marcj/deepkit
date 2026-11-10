/*
 * Deepkit Framework
 * Copyright (C) 2021 Deepkit UG, Marc J. Schmidt
 *
 * This program is free software: you can redistribute it and/or modify
 * it under the terms of the MIT License.
 *
 * You should have received a copy of the MIT License along with this program.
 */
import { AppModule } from '@deepkit/app';
import { ClassType } from '@deepkit/core';
import { InjectorContext } from '@deepkit/injector';
import {
    RpcCacheAction,
    RpcControllerAccess,
    RpcKernel,
    RpcKernelBaseConnection,
    RpcKernelConnection,
    RpcServerAction,
    TransportConnection,
} from '@deepkit/rpc';
import { FrameCategory, Stopwatch } from '@deepkit/stopwatch';

export class RpcControllers {
    public readonly controllers = new Map<string, { controller: ClassType; module: AppModule<any> }>();
}

export class RpcServerActionWithStopwatch extends RpcServerAction {
    stopwatch?: Stopwatch;

    protected canExecuteDirectly(): boolean {
        return !this.stopwatch && super.canExecuteDirectly();
    }

    protected async hasControllerAccess(
        controllerAccess: RpcControllerAccess,
        connection: RpcKernelBaseConnection,
    ): Promise<boolean> {
        const frame = this.stopwatch ? this.stopwatch.start('rpc.controllerAccess') : undefined;

        try {
            return await super.hasControllerAccess(controllerAccess, connection);
        } finally {
            if (frame) frame.end();
        }
    }

    async invoke(cache: RpcCacheAction, args: any[], decodeError?: any): Promise<any> {
        const { controllerName, actionName } = cache.controller;
        const frame = this.stopwatch
            ? this.stopwatch.start(actionName + '() [' + controllerName + ']', FrameCategory.rpc, true)
            : undefined;
        if (frame) frame.data({ method: actionName, controller: controllerName, arguments: args });

        try {
            if (frame) return await frame.run(() => super.invoke(cache, args, decodeError));
            return await super.invoke(cache, args, decodeError);
        } finally {
            if (frame) frame.end();
        }
    }
}

export class RpcKernelConnectionWithStopwatch extends RpcKernelConnection {
    protected actionHandler = new RpcServerActionWithStopwatch(
        this.stats,
        this.cache,
        this,
        this.controllers,
        this.injector,
        this.eventDispatcher,
        this.security,
        this.sessionState,
        this.logger,
        this.actionDispatcher,
    );
    stopwatch?: Stopwatch;

    setStopwatch(stopwatch: Stopwatch) {
        this.stopwatch = stopwatch;
        this.actionHandler.stopwatch = stopwatch;
    }

    protected async authenticate(token: any): Promise<string> {
        const frame = this.stopwatch
            ? this.stopwatch.start('rpc.authenticate', FrameCategory.rpcAuthenticate, true)
            : undefined;
        try {
            return await super.authenticate(token);
        } finally {
            if (frame) frame.end();
        }
    }
}

export class RpcKernelWithStopwatch extends RpcKernel {
    protected RpcKernelConnection = RpcKernelConnectionWithStopwatch;

    stopwatch?: Stopwatch;

    createConnection(transport: TransportConnection, injector?: InjectorContext): RpcKernelBaseConnection {
        const connection = super.createConnection(transport, injector);
        if (this.stopwatch && connection instanceof RpcKernelConnectionWithStopwatch) {
            connection.setStopwatch(this.stopwatch);
        }
        return connection;
    }
}
