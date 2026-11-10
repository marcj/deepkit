import { describe, expect, test } from '@jest/globals';
import { BehaviorSubject, Observable, firstValueFrom } from 'rxjs';

import { ReceiveType, resolveReceiveType, typeOf } from '@deepkit/type';

import { getBodyCodec } from '../src/action.js';
import { DirectClient } from '../src/client/client-direct.js';
import { rpc } from '../src/decorators.js';
import { ControlOp, MessageFlag, frameMemory, getActionOffset, preSerialize, writeControlFrameTransient } from '../src/protocol.js';
import { copyWrittenFrame } from '../src/protocol.js';
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

function encode<T>(id: number, body: T, type?: ReceiveType<T>): Buffer {
    const size = writeControlFrameTransient(id, MessageFlag.RouteClient, ControlOp.CollectionModel, getBodyCodec(resolveReceiveType(type)).serialize, body);
    return Buffer.from(copyWrittenFrame(size));
}

function decode<T>(frame: Buffer, type?: ReceiveType<T>): T {
    return getBodyCodec(resolveReceiveType(type)).deserialize(frame, getActionOffset(frame) + 1, frame.byteLength);
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
            [60000, 123456],
        ]) {
            const plain = encode<ObservableNext>(messageId, { id: subscriptionId, v: items });
            const pre = encode<ObservableNext>(messageId, { id: subscriptionId, v: shared as any });
            expect(pre.equals(plain)).toBe(true);
        }
    });

    test('decodes back to the original value', () => {
        const frame = encode<ObservableNext>(42, { id: 7, v: preSerialize<Item[]>(items) as any });
        expect(decode<ObservableNext>(frame)).toEqual({ id: 7, v: items });
    });

    test('supports bodies that only carry v (action results)', () => {
        const plain = encode<ActionResult>(5, { v: items });
        const pre = encode<ActionResult>(5, { v: preSerialize<Item[]>(items) as any });
        expect(pre.equals(plain)).toBe(true);
    });

    test('leaves bodies without PreSerialized values untouched', () => {
        const frame = encode<ObservableNext>(1, { id: 2, v: [] });
        expect(decode<ObservableNext>(frame)).toEqual({ id: 2, v: [] });
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
