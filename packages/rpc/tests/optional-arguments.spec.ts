import { expect, test } from '@jest/globals';

import { DirectClient } from '../src/client/client-direct.js';
import { rpc } from '../src/decorators.js';
import { RpcKernel } from '../src/server/kernel.js';

test('undefined optional argument keeps the position of the following arguments (#722)', async () => {
    class Controller {
        @rpc.action()
        updateUser(id: number, name?: string, email?: string): { id: number, name: string, email: string } {
            return { id, name: name === undefined ? 'undefined' : name, email: email === undefined ? 'undefined' : email };
        }
    }

    const kernel = new RpcKernel();
    kernel.registerController(Controller, 'controller');
    const controller = new DirectClient(kernel).controller<Controller>('controller');

    expect(await controller.updateUser(1, undefined, 'peter@example.com')).toEqual({ id: 1, name: 'undefined', email: 'peter@example.com' });
    expect(await controller.updateUser(1, 'Peter', 'peter@example.com')).toEqual({ id: 1, name: 'Peter', email: 'peter@example.com' });
    expect(await controller.updateUser(1, 'Peter')).toEqual({ id: 1, name: 'Peter', email: 'undefined' });
    expect(await controller.updateUser(1)).toEqual({ id: 1, name: 'undefined', email: 'undefined' });
});
