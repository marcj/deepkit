/*
 * Deepkit Framework
 * Copyright (C) 2021 Deepkit UG, Marc J. Schmidt
 *
 * This program is free software: you can redistribute it and/or modify
 * it under the terms of the MIT License.
 *
 * You should have received a copy of the MIT License along with this program.
 */
import { ControllerDefinition, RpcError } from '../model.js';
import { RemoteController, RpcClient } from './client.js';

/**
 * Spreads the calls of its controllers over several clients, for example one per worker thread, so that the work
 * runs in parallel. Each call goes to the client with the fewest calls in flight.
 *
 * ```typescript
 * const pool = new RpcClientPool(
 *     Array.from({ length: 4 }, () => {
 *         const worker = new Worker('./server.js');
 *         return new RpcClient(new RpcChannelClientAdapter(createMessagePortChannel(worker)));
 *     }),
 * );
 * const image = pool.controller<ImageController>('image');
 * await Promise.all(files.map(file => image.resize(file, 200)));
 * ```
 *
 * A call that returns an Observable or Collection stays with its client. Calls of one controller are not ordered
 * among each other, since they may run on different clients.
 */
export class RpcClientPool {
    protected inFlight: number[];
    /** The client to start the search for the least busy one, so that idle clients take turns. */
    protected next = 0;
    // created once per client, so a call doesn't allocate closures for its bookkeeping
    protected onResult: ((value: any) => any)[];
    protected onError: ((error: any) => never)[];

    constructor(public readonly clients: RpcClient[]) {
        if (!clients.length) throw new RpcError('RpcClientPool needs at least one client');
        this.inFlight = clients.map(() => 0);
        this.onResult = clients.map((_, i) => (value: any) => {
            this.inFlight[i]--;
            return value;
        });
        this.onError = clients.map((_, i) => (error: any): never => {
            this.inFlight[i]--;
            throw error;
        });
    }

    /** Calls in flight per client. */
    get load(): readonly number[] {
        return this.inFlight;
    }

    controller<T>(
        nameOrDefinition: string | ControllerDefinition<T>,
        options?: { timeout?: number; dontWaitForConnection?: true },
    ): RemoteController<T> {
        const controllers = this.clients.map(client => client.controller<T>(nameOrDefinition, options) as any);
        const methods: { [name: string]: (...args: any[]) => Promise<any> } = {};
        return new Proxy(
            {},
            {
                get: (target, name) => {
                    // a promise check, or a symbol
                    if (typeof name !== 'string' || name === 'then') return undefined;
                    return (methods[name] ??= (...args: any[]) => this.call(controllers, name, args));
                },
            },
        ) as RemoteController<T>;
    }

    async disconnect(): Promise<void> {
        await Promise.all(this.clients.map(client => client.disconnect()));
    }

    protected pick(): number {
        const inFlight = this.inFlight;
        const count = inFlight.length;
        let best = this.next;
        for (let offset = 1; offset < count && inFlight[best] > 0; offset++) {
            const i = (this.next + offset) % count;
            if (inFlight[i] < inFlight[best]) best = i;
        }
        this.next = (best + 1) % count;
        return best;
    }

    protected call(controllers: any[], name: string, args: any[]): Promise<any> {
        const i = this.pick();
        this.inFlight[i]++;
        let result: Promise<any>;
        try {
            result = controllers[i][name](...args);
        } catch (error) {
            this.inFlight[i]--;
            throw error;
        }
        return result.then(this.onResult[i], this.onError[i]);
    }
}
