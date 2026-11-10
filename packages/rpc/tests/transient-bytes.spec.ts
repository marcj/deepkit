import { expect, test } from '@jest/globals';

import { AutoBuffer } from '@deepkit/bson';
import { TypeTuple, typeOf } from '@deepkit/type';

import { TransientBytes, createParameterDeserializer, createParameterSerializer } from '../src/action.js';
import { DirectClient } from '../src/client/client-direct.js';
import { copyFrame } from '../src/protocol.js';
import { rpc } from '../src/decorators.js';
import { RpcKernel, RpcKernelBaseConnection } from '../src/server/kernel.js';
import { RpcControllerAccess, RpcKernelSecurity, Session } from '../src/server/security.js';

function roundtrip(type: TypeTuple, bytes: Uint8Array) {
    // the type byte of a value can't be at offset 0, a body always has the frame header in front of it
    const buffer = new AutoBuffer(1);
    buffer.apply(createParameterSerializer(type), [bytes]);
    const message = buffer.buffer;
    return { message, value: createParameterDeserializer(type)(message, 1, message.byteLength)[0] as Uint8Array };
}

test('transient bytes are a view on the message', () => {
    const { message, value } = roundtrip(typeOf<[v: TransientBytes]>() as TypeTuple, new Uint8Array([1, 2, 3]));
    expect([...value]).toEqual([1, 2, 3]);
    expect(value.buffer).toBe(message.buffer);
});

test('other bytes are copied out of the message', () => {
    const { message, value } = roundtrip(typeOf<[v: Uint8Array]>() as TypeTuple, new Uint8Array([1, 2, 3]));
    expect([...value]).toEqual([1, 2, 3]);
    expect(value.buffer).not.toBe(message.buffer);
});

class Controller {
    @rpc.action()
    length(v: TransientBytes): number {
        return v.reduce((sum, byte) => sum + byte, 0);
    }
}

test('an action reads transient bytes during its call', async () => {
    const kernel = new RpcKernel();
    kernel.registerController(Controller, 'controller');
    const client = new DirectClient(kernel);
    const controller = client.controller<Controller>('controller');
    expect(await controller.length(new Uint8Array([1, 2, 3]))).toBe(6);
    expect(await controller.length(new Uint8Array([4, 5]))).toBe(9);
});

test('transient bytes stay intact behind an asynchronous access check', async () => {
    let received: Uint8Array[] = [];

    class Actions {
        @rpc.action()
        keep(v: TransientBytes): void {
            received.push(v);
        }
    }

    class Security extends RpcKernelSecurity {
        override async hasControllerAccess(session: Session, controller: RpcControllerAccess, connection: RpcKernelBaseConnection): Promise<boolean> {
            await new Promise(resolve => setTimeout(resolve, 1));
            return true;
        }
    }

    const kernel = new RpcKernel([{ provide: RpcKernelSecurity, useClass: Security, scope: 'rpc' }]);
    kernel.registerController(Actions, 'actions');
    const client = new DirectClient(kernel);
    const actions = client.controller<Actions>('actions');
    await Promise.all([actions.keep(new Uint8Array([1, 2, 3])), actions.keep(new Uint8Array([4, 5, 6]))]);
    expect(received.map(v => [...v]).sort()).toEqual([[1, 2, 3], [4, 5, 6]]);
});

test('copyFrame copies into pooled memory, also from a Buffer', () => {
    for (const source of [new Uint8Array(200).fill(1), Buffer.alloc(200, 1)]) {
        const copy = copyFrame(source, 10, 110);
        expect(Buffer.isBuffer(copy)).toBe(true);
        expect(copy.byteLength).toBe(100);
        source[10] = 9;
        expect(copy[0]).toBe(1);
    }
});
