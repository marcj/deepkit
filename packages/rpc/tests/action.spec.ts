import { expect, test } from '@jest/globals';

import { ActionDispatcher } from '../src/action.js';
import { DirectClient } from '../src/client/client-direct.js';
import { rpc } from '../src/decorators.js';
import { loadActionTypes } from '../src/server/action.js';
import { RpcKernel } from '../src/server/kernel.js';
import { RpcCache } from '../src/server/kernel.js';

class Controller {
    @rpc.action()
    test1() {}

    @rpc.action()
    test2(a: number) {}

    @rpc.action()
    test3(a: number, b: string): string {
        return b + a;
    }
}

test('assigns stable numeric ids and appends new ones', () => {
    const cache = new RpcCache();
    const controllers = new Map<string, { controller: any }>([['main', { controller: Controller }]]);
    const dispatcher = new ActionDispatcher();

    dispatcher.build(controllers, (c, m) => loadActionTypes(cache, controllers, c, m));
    expect(dispatcher.entries.map(v => v.id)).toEqual([0, 1, 2]);
    const hash = dispatcher.schemaHash;

    class Second {
        @rpc.action()
        hello() {}
    }

    controllers.set('second', { controller: Second });
    dispatcher.build(controllers, (c, m) => loadActionTypes(cache, controllers, c, m));
    expect(dispatcher.entries[3].methodName).toBe('hello');
    expect(dispatcher.entries.slice(0, 3).map(v => v.id)).toEqual([0, 1, 2]);
    expect(dispatcher.schemaHash).not.toBe(hash);
});

test('actions end to end', async () => {
    const calls: any[] = [];

    class Actions {
        @rpc.action()
        noResult(a: number) {
            calls.push(a);
        }

        @rpc.action()
        two(a: number, b: string): string {
            return b + a;
        }

        @rpc.action()
        union(a: number | string): number | string {
            return a;
        }

        @rpc.action()
        async asyncResult(a: string): Promise<string> {
            return a + 'x';
        }
    }

    const kernel = new RpcKernel();
    kernel.registerController(Actions, 'main');
    const client = new DirectClient(kernel);
    await client.connect();
    const controller = client.controller<Actions>('main');

    expect(await controller.noResult(1)).toBeUndefined();
    expect(calls).toEqual([1]);
    expect(await controller.two(5, 'a')).toBe('a5');
    expect(await controller.union(123)).toBe(123);
    expect(await controller.union('abc')).toBe('abc');
    expect(await controller.asyncResult('q')).toBe('qx');

    await client.disconnect();
});
