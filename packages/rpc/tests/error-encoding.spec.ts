import { expect, test } from '@jest/globals';
import { Observable } from 'rxjs';

import { entity } from '@deepkit/type';

import { DirectClient } from '../src/client/client-direct.js';
import { rpc } from '../src/decorators.js';
import { rpcErrorSettings } from '../src/protocol.js';
import { RpcKernel } from '../src/server/kernel.js';

@entity.name('@error:error-encoding-custom')
class CustomError extends Error {
    constructor(
        message: string,
        public code: number = 0,
    ) {
        super(message);
    }
}

@rpc.controller('errors')
class Controller {
    @rpc.action()
    custom(): void {
        throw new CustomError('custom failed', 42);
    }

    @rpc.action()
    stream(): Observable<number> {
        return new Observable(observer => observer.error(new CustomError('stream failed', 7)));
    }

    @rpc.action()
    wrapped(): void {
        throw new Error('could not save', { cause: new CustomError('duplicate key', 23505) });
    }
}

function createClient() {
    const kernel = new RpcKernel();
    kernel.registerController(Controller);
    return new DirectClient(kernel).controller<Controller>('errors', [CustomError] as any);
}

test('a registered error with properties keeps its message', async () => {
    // message is a property of Error, not of the class: the constructor got undefined and the message was empty
    const controller = createClient();
    const error = await controller.custom().catch(e => e);
    expect(error).toBeInstanceOf(CustomError);
    expect([error.message, error.code]).toEqual(['custom failed', 42]);

    const streamError = await new Promise<any>(async resolve => (await controller.stream()).subscribe({ error: resolve }));
    expect(streamError).toBeInstanceOf(CustomError);
    expect([streamError.message, streamError.code]).toEqual(['stream failed', 7]);
});

test('error.cause is only sent when exposeCause is set', async () => {
    const controller = createClient();
    const hidden = await controller.wrapped().catch(e => e);
    expect([hidden.message, hidden.cause]).toEqual(['could not save', undefined]);

    rpcErrorSettings.exposeCause = true;
    try {
        const error = await controller.wrapped().catch(e => e);
        expect(error.message).toBe('could not save');
        expect(error.cause).toBeInstanceOf(CustomError);
        expect([error.cause.message, error.cause.code]).toEqual(['duplicate key', 23505]);
    } finally {
        rpcErrorSettings.exposeCause = false;
    }
});
