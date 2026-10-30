import { describe, expect, test } from '@jest/globals';
import { BehaviorSubject, Observable, firstValueFrom } from 'rxjs';

import { ReceiveType, typeOf } from '@deepkit/type';

import { DirectClient } from '../src/client/client-direct.js';
import { rpc } from '../src/decorators.js';
import { RpcTypes } from '../src/model.js';
import { createRpcMessage, getPreSerializedPart, preSerialize, readBinaryRpcMessage, RpcMessageRouteType, serializeBinaryRpcMessage } from '../src/protocol.js';
import { RpcKernel } from '../src/server/kernel.js';

enum Visibility {
    public,
    hidden,
}

interface Item {
    shortId: string;
    team?: string;
    users: number;
    updated: number;
    visibility: Visibility;
    refresh?: boolean;
}

// same shape as the body of an observable's next value
interface ObservableNext {
    id: number;
    v?: Item[];
}

interface ActionResult {
    v: Item[];
}

type Presence = [string, { [session: string]: { entityId: string; metadata: { [name: string]: any } } }];

interface PresenceNext {
    id: number;
    v?: Presence;
}

interface RoleChanged {
    teamId: string;
    removed?: string;
    timestamp: Date;
}

interface RoleNext {
    id: number;
    v?: RoleChanged;
}

const items: Item[] = [
    { shortId: 'a1b2c3d4e5', users: 12, updated: 1725300000000, visibility: Visibility.public },
    { shortId: 'f6g7h8i9j0', team: 't1', users: 3, updated: 1725300001234, visibility: Visibility.hidden, refresh: true },
    { shortId: 'k1l2m3n4o5', users: 0, updated: 0, visibility: Visibility.public },
];

function encode<T>(id: number, body: T, type?: ReceiveType<T>) {
    return Buffer.from(serializeBinaryRpcMessage(createRpcMessage(id, RpcTypes.ResponseActionObservableNext, body, undefined, type)));
}

describe('PreSerialized rpc bodies', () => {
    test('writes the same bytes as serializing the value in place', () => {
        const plain = encode<ObservableNext>(42, { id: 7, v: items });
        const pre = encode<ObservableNext>(42, { id: 7, v: preSerialize<Item[]>(items) as any });
        expect(pre.equals(plain)).toBe(true);
    });

    test('writes identical bytes for a tuple and an object with a date', () => {
        const presence: Presence = ['team1', { s1: { entityId: 'e1', metadata: { tool: 'brush' } } }];
        expect(encode<PresenceNext>(1, { id: 2, v: preSerialize<Presence>(presence) as any }).equals(encode<PresenceNext>(1, { id: 2, v: presence }))).toBe(true);
        const role: RoleChanged = { teamId: 't1', removed: 'u1', timestamp: new Date(0) };
        expect(encode<RoleNext>(3, { id: 4, v: preSerialize<RoleChanged>(role) as any }).equals(encode<RoleNext>(3, { id: 4, v: role }))).toBe(true);
    });

    test('is reusable across messages with different message and subscription ids', () => {
        const shared = preSerialize<Item[]>(items);
        for (const [messageId, subscriptionId] of [
            [1, 1],
            [300, 2],
            [70000, 123456],
        ]) {
            const plain = encode<ObservableNext>(messageId, { id: subscriptionId, v: items });
            const pre = encode<ObservableNext>(messageId, { id: subscriptionId, v: shared as any });
            expect(pre.equals(plain)).toBe(true);
        }
    });

    test('decodes back to the original value', () => {
        const message = readBinaryRpcMessage(encode<ObservableNext>(42, { id: 7, v: preSerialize<Item[]>(items) as any }));
        expect(message.id).toBe(42);
        expect(message.type).toBe(RpcTypes.ResponseActionObservableNext);
        expect(message.parseBody<ObservableNext>()).toEqual({ id: 7, v: items });
    });

    test('supports bodies that only carry v (action results)', () => {
        const plain = encode<ActionResult>(5, { v: items });
        const pre = encode<ActionResult>(5, { v: preSerialize<Item[]>(items) as any });
        expect(pre.equals(plain)).toBe(true);
    });

    test('supports an untyped body', () => {
        const plain = readBinaryRpcMessage(encode<any>(9, { id: 3, v: items })).parseBody<ObservableNext>();
        const pre = readBinaryRpcMessage(encode<any>(9, { id: 3, v: preSerialize<Item[]>(items) })).parseBody<ObservableNext>();
        expect(pre).toEqual(plain);
    });

    test('leaves bodies without PreSerialized values untouched', () => {
        const message = readBinaryRpcMessage(encode<ObservableNext>(1, { id: 2, v: [] }));
        expect(message.parseBody<ObservableNext>()).toEqual({ id: 2, v: [] });
    });

    test('tells a transport where the shared tail starts', () => {
        const shared = preSerialize<Item[]>(items);
        const message = serializeBinaryRpcMessage(createRpcMessage<ObservableNext>(42, RpcTypes.ResponseActionObservableNext, { id: 7, v: shared as any }));
        const part = getPreSerializedPart(message);
        expect(part?.value).toBe(shared);
        expect(Buffer.from(message.subarray(part!.offset)).equals(Buffer.from(shared.tail))).toBe(true);

        const plain = serializeBinaryRpcMessage(createRpcMessage<ObservableNext>(42, RpcTypes.ResponseActionObservableNext, { id: 7, v: items }));
        expect(getPreSerializedPart(plain)).toBeUndefined();
    });

    test('goes through a controller to the client', async () => {
        const shared = preSerialize<Item[]>(items);

        class Controller {
            @rpc.action()
            items(): Observable<Item[]> {
                return new BehaviorSubject<Item[]>(shared as any);
            }

            @rpc.action()
            result(): Item[] {
                return shared as any;
            }
        }

        const kernel = new RpcKernel();
        kernel.registerController(Controller, 'controller');
        const client = new DirectClient(kernel);
        const controller = client.controller<Controller>('controller');

        expect(await firstValueFrom(await controller.items())).toEqual(items);
        expect(await controller.result()).toEqual(items);
        await client.disconnect();
    });
});

test('rejects messages that cannot splice a PreSerialized value', () => {
    const v = preSerialize<Item[]>([]);
    const body = { type: typeOf<ObservableNext>(), body: { id: 1, v } };
    const error = 'PreSerialized values are only supported in single-body messages';

    expect(() => serializeBinaryRpcMessage({ id: 1, type: RpcTypes.ResponseActionSimple, routeType: RpcMessageRouteType.peer, peerId: 'peer', body })).toThrow(error);
    expect(() => serializeBinaryRpcMessage({
        id: 1, type: RpcTypes.ResponseActionSimple, routeType: RpcMessageRouteType.sourceDest,
        source: new Uint8Array(16), destination: new Uint8Array(16), body,
    })).toThrow(error);
    expect(() => serializeBinaryRpcMessage({
        id: 1, type: RpcTypes.ResponseActionSimple, routeType: RpcMessageRouteType.client,
        composite: [{ type: RpcTypes.ResponseActionSimple, schema: typeOf<ObservableNext>(), body: { id: 1, v } }],
    })).toThrow(error);
});
