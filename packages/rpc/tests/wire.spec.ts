import { describe, expect, jest, test } from '@jest/globals';
import { BehaviorSubject, Observable, Subject, firstValueFrom, lastValueFrom } from 'rxjs';
import { take } from 'rxjs/operators';

import { sleep } from '@deepkit/core';
import { ContextDispatcher, SequentialContextDispatcher } from '@deepkit/net';
import { Positive, TypeTuple, typeOf } from '@deepkit/type';

import { createParameterDeserializer, createParameterSerializer, createReturnSerializer } from '../src/action.js';
import { DirectClient, RpcDirectClientAdapter } from '../src/client/client-direct.js';
import { ClientTransportAdapter, RemoteController, RpcClient } from '../src/client/client.js';
import { rpc } from '../src/decorators.js';
import { ClientProgress } from '../src/progress.js';
import {
    ChunkOp,
    MessageFlag,
    RpcBinaryMessageReader,
    frameMemory,
    getContextId,
    isContextFlag,
    isTypeFlag,
    preSerialize,
    rpcProtocolVersion,
    writeActionFrameTransient,
    writeChunkControlFrameTransient,
    writeHelloFrameTransient,
    writeResultFrameTransient,
} from '../src/protocol.js';
import { copyWrittenFrame } from '../src/protocol.js';
import { RpcKernel, RpcKernelConnection } from '../src/server/kernel.js';
import { TransportBinaryMessageChunkWriter, TransportClientConnection, TransportConnection, TransportOptions } from '../src/transport.js';

jest.setTimeout(30000);

type Recorded = { fromClient: Uint8Array[]; fromServer: Uint8Array[] };

function frameType(frame: Uint8Array, flag: number): boolean {
    return (frame[4] & 0b0111_0000) === flag;
}

/**
 * Connects a client to the kernel over a binary socket and records all frames.
 * Replies can be held back to control when they arrive.
 */
function recordingAdapter(kernel: RpcKernel, recorded: Recorded, hold?: { held: Uint8Array[]; active: boolean }): ClientTransportAdapter {
    return {
        connect(connection: TransportClientConnection) {
            const toClient = (buffer: Uint8Array) => {
                const copy = Uint8Array.prototype.slice.call(buffer);
                recorded.fromServer.push(copy);
                if (hold?.active) {
                    hold.held.push(copy);
                } else {
                    connection.readBinary(copy);
                }
            };
            const kernelConnection = kernel.createConnection({
                writeBinary: toClient,
                binarySocket: { write: toClient, writableLength: 0 },
                close: () => connection.onClose('closed'),
            });
            connection.onConnected({
                clientAddress: () => 'test',
                bufferedAmount: () => 0,
                close: () => kernelConnection.close(),
                writeBinary(buffer) {
                    recorded.fromClient.push(Uint8Array.prototype.slice.call(buffer));
                    kernelConnection.feed(buffer);
                },
                binarySocket: {
                    writableLength: 0,
                    write(buffer: Uint8Array) {
                        recorded.fromClient.push(Uint8Array.prototype.slice.call(buffer));
                        kernelConnection.feed(buffer);
                    },
                },
            });
        },
    };
}

class Controller {
    @rpc.action()
    add(a: number, b: number): number {
        return a + b;
    }

    @rpc.action()
    empty(): void {}

    @rpc.action()
    fail(): number {
        throw new Error('nope');
    }

    @rpc.action()
    echo(value: string): string {
        return value;
    }

    @rpc.action()
    binary(value: Uint8Array): Uint8Array {
        return value;
    }

    @rpc.action()
    binaryAny(value: any): any {
        return value;
    }

    @rpc.action()
    numbers(name: string, count: number): Observable<string> {
        return new Observable(observer => {
            for (let i = 0; i < count; i++) observer.next(name + i);
            observer.complete();
        });
    }

    @rpc.action()
    ticks(name: string): Subject<string> {
        const subject = new Subject<string>();
        setTimeout(() => {
            subject.next(name);
            subject.complete();
        }, 5);
        return subject;
    }
}

function kernelWithController() {
    const kernel = new RpcKernel();
    kernel.registerController(Controller, 'main');
    return kernel;
}

describe('fast path', () => {
    test('an action call is one TypeAction frame after the handshake', async () => {
        const recorded: Recorded = { fromClient: [], fromServer: [] };
        const client = new RpcClient(recordingAdapter(kernelWithController(), recorded));
        const controller = client.controller<Controller>('main');
        await client.connect();

        recorded.fromClient.length = 0;
        recorded.fromServer.length = 0;

        expect(await controller.add(1, 2)).toBe(3);
        expect(recorded.fromClient.length).toBe(1);
        expect(recorded.fromServer.length).toBe(1);

        const call = recorded.fromClient[0];
        expect(frameType(call, MessageFlag.TypeAction)).toBe(true);
        expect(isContextFlag(call[4], MessageFlag.ContextNew)).toBe(true);

        const reply = recorded.fromServer[0];
        expect(frameType(reply, MessageFlag.TypeResult)).toBe(true);
        expect(isContextFlag(reply[4], MessageFlag.ContextEnd)).toBe(true);
        expect(getContextId(reply)).toBe(1);

        await client.disconnect();
    });

    test('nothing returned is an ack, an exception an error frame', async () => {
        const recorded: Recorded = { fromClient: [], fromServer: [] };
        const client = new RpcClient(recordingAdapter(kernelWithController(), recorded));
        const controller = client.controller<Controller>('main');
        await client.connect();

        recorded.fromServer.length = 0;
        expect(await controller.empty()).toBeUndefined();
        expect(frameType(recorded.fromServer[0], MessageFlag.TypeAck)).toBe(true);

        recorded.fromServer.length = 0;
        await expect(controller.fail()).rejects.toThrow('nope');
        expect(frameType(recorded.fromServer[0], MessageFlag.TypeError)).toBe(true);

        await client.disconnect();
    });

    test('controller methods are created once', () => {
        const controller = new DirectClient(kernelWithController()).controller<Controller>('main');
        expect(controller.add).toBe(controller.add);
    });

    test('an action registered after connecting uses the fast path after the next handshake', async () => {
        class Later {
            @rpc.action()
            value(): number {
                return 7;
            }
        }

        // provided up front: the injector can't be changed anymore once the first connection built it
        const kernel = new RpcKernel([{ provide: Later, scope: 'rpc' }]);
        const recorded: Recorded = { fromClient: [], fromServer: [] };
        const client = new RpcClient(recordingAdapter(kernel, recorded));
        const controller = client.controller<Later>('later');
        await client.connect();

        kernel.registerController(Later, 'later');
        expect(await controller.value()).toBe(7);
        expect(recorded.fromClient.some(v => frameType(v, MessageFlag.TypeAction))).toBe(true);

        await client.disconnect();
        await client.connect();
        recorded.fromClient.length = 0;
        expect(await controller.value()).toBe(7);
        expect(recorded.fromClient.length).toBe(1);
        expect(frameType(recorded.fromClient[0], MessageFlag.TypeAction)).toBe(true);
        await client.disconnect();
    });

    test('the second connection does not transfer the schema again', async () => {
        const kernel = kernelWithController();
        const recorded: Recorded = { fromClient: [], fromServer: [] };
        const client = new RpcClient(recordingAdapter(kernel, recorded));
        await client.connect();
        const firstReply = recorded.fromServer.find(v => frameType(v, MessageFlag.TypeSchema))!;
        expect(firstReply.byteLength).toBeGreaterThan(10);
        await client.disconnect();

        recorded.fromServer.length = 0;
        await client.connect();
        const secondReply = recorded.fromServer.find(v => frameType(v, MessageFlag.TypeSchema))!;
        expect(secondReply.byteLength).toBe(10);
        expect(await client.controller<Controller>('main').add(2, 3)).toBe(5);
        await client.disconnect();
    });
});

describe('context lifetime', () => {
    test('a stream context stays taken until the server confirms its end', async () => {
        const recorded: Recorded = { fromClient: [], fromServer: [] };
        const hold = { held: [] as Uint8Array[], active: false };
        const client = new RpcClient(recordingAdapter(kernelWithController(), recorded, hold));
        const controller = client.controller<Controller>('main');
        await client.connect();

        const subject = await controller.ticks('a');
        const id = 1;

        hold.active = true;
        subject.unsubscribe();
        // the id may not be reused yet: the reply of the server is still in flight
        expect((client as any).contexts.active).toBe(1);
        expect((client as any).contexts.get(id)).not.toBe(undefined);

        hold.active = false;
        for (const frame of hold.held.splice(0)) (client as any).transporter.reader.feed(frame);

        expect((client as any).contexts.active).toBe(0);
        await client.disconnect();
    });

    test('too many contexts fail the call with a clear error', async () => {
        const client = new DirectClient(kernelWithController());
        const controller = client.controller<Controller>('main');
        await client.connect();

        (client as any).contexts = new SequentialContextDispatcher(1, 1);
        (client as any).contexts.create(() => undefined);

        await expect(controller.add(1, 2)).rejects.toThrow('Too many active');
        expect((client.actionClient as any).argsInUse).toBeUndefined();

        (client as any).contexts = new SequentialContextDispatcher();
        await client.disconnect();
    });

    test('the context id space is 16 bit', () => {
        const noop = () => undefined;
        for (const contexts of [new ContextDispatcher<() => void>(), new SequentialContextDispatcher<() => void>()]) {
            for (let i = 0; i < 0xffff; i++) contexts.create(noop);
            expect(() => contexts.create(noop)).toThrow('Too many active contexts (65535)');
        }
    });
});

describe('allocations', () => {
    function rangeAdapter(kernel: RpcKernel, calls: { range: number; write: number }): ClientTransportAdapter {
        return {
            connect(connection: TransportClientConnection) {
                const toClient = {
                    writableLength: 0,
                    write(buffer: Uint8Array) {
                        calls.write++;
                        connection.readBinary(buffer);
                    },
                    writeRange(buffer: Uint8Array, start: number, end: number) {
                        calls.range++;
                        connection.readBinary(buffer, end);
                    },
                };
                const kernelConnection = kernel.createConnection({
                    writeBinary: toClient.write,
                    binarySocket: toClient,
                    close: () => connection.onClose('closed'),
                });
                connection.onConnected({
                    clientAddress: () => 'test',
                    bufferedAmount: () => 0,
                    close: () => kernelConnection.close(),
                    writeBinary: buffer => kernelConnection.feed(buffer),
                    binarySocket: {
                        writableLength: 0,
                        write(buffer: Uint8Array) {
                            calls.write++;
                            kernelConnection.feed(buffer);
                        },
                        writeRange(buffer: Uint8Array, start: number, end: number) {
                            calls.range++;
                            kernelConnection.feed(buffer, end);
                        },
                    },
                });
            },
        };
    }

    test('frames are passed as a range, without a view', async () => {
        const calls = { range: 0, write: 0 };
        const client = new RpcClient(rangeAdapter(kernelWithController(), calls));
        const controller = client.controller<Controller>('main');
        await client.connect();

        calls.range = calls.write = 0;
        expect(await controller.add(1, 2)).toBe(3);
        expect(calls).toEqual({ range: 2, write: 0 });
        await client.disconnect();
    });

    test('the arguments of a call need no array of their own', async () => {
        const client = new DirectClient(kernelWithController());
        const controller = client.controller<Controller>('main');
        await client.connect();

        const seen: any[][] = [];
        const take = client.actionClient.takeArgs;
        client.actionClient.takeArgs = function (this: any, count: number) {
            const args = take.call(this, count);
            seen.push(args);
            return args;
        } as any;
        const action = jest.spyOn(client.actionClient, 'action');

        expect(await controller.add(1, 2)).toBe(3);
        expect(await controller.add(3, 4)).toBe(7);
        expect(await controller.add(5, 6)).toBe(11);
        expect(seen[0]).toBe(seen[1]);
        expect(seen[0]).toEqual([undefined, undefined]);
        // once the action is known a call doesn't go through the general entry point anymore
        expect(action.mock.calls.length).toBe(1);
        await client.disconnect();
    });

    test('a call whose arguments fail to serialize does not affect the next call', async () => {
        class Item {
            constructor(public name: string) {}
        }

        class Calls {
            @rpc.action()
            check(item: Item): void {}

            @rpc.action()
            echo(name: string): string {
                return name;
            }
        }

        const kernel = new RpcKernel();
        kernel.registerController(Calls, 'calls');
        const client = new DirectClient(kernel);
        const controller = client.controller<Calls>('calls');
        await client.connect();

        await expect(controller.check({} as any)).rejects.toThrow('Cannot convert undefined to string');
        expect(await controller.echo('after')).toBe('after');
        await client.disconnect();
    });

    test('arguments of calls that wait for the connection are kept', async () => {
        const client = new DirectClient(kernelWithController());
        const controller = client.controller<Controller>('main');
        const [a, b] = await Promise.all([controller.add(1, 2), controller.add(3, 4)]);
        expect([a, b]).toEqual([3, 7]);
        await client.disconnect();
    });

    test('the server decodes into one array and clears it after the call', async () => {
        let seen: any[] = [];

        class Args {
            @rpc.action()
            one(a: number, b: string): void {
                seen = [a, b];
            }
        }

        const kernel = new RpcKernel();
        kernel.registerController(Args, 'args');
        const client = new DirectClient(kernel);
        const controller = client.controller<Args>('args');
        await client.connect();
        await controller.one(1, 'a');
        expect(seen).toEqual([1, 'a']);

        const entry = (kernel as any).actions.entries[0];
        const frame = writeCall(entry);
        const array = entry.decode(frame, 7, frame.byteLength);
        expect(array).toEqual([2, 'b']);
        expect(entry.decode(frame, 7, frame.byteLength)).toBe(array);

        await controller.one(3, 'c');
        expect(seen).toEqual([3, 'c']);
        expect(array).toEqual([undefined, undefined]);
        await client.disconnect();
    });

    function writeCall(entry: any): Uint8Array {
        const size = writeActionFrameTransient(1, entry.id, createParameterSerializer(entry.parameters), [2, 'b']);
        return Uint8Array.prototype.slice.call(frameMemory(), 0, size);
    }

    test('async results reuse the continuation and go to the right call', async () => {
        const order: number[] = [];

        class Slow {
            @rpc.action()
            async wait(ms: number, value: number): Promise<number> {
                await sleep(ms);
                order.push(value);
                return value;
            }
        }

        const kernel = new RpcKernel();
        kernel.registerController(Slow, 'slow');
        let handler: any;
        kernel.onConnection((connection: any) => {
            handler = connection.actionHandler;
        });
        const client = new DirectClient(kernel);
        const controller = client.controller<Slow>('slow');
        await client.connect();

        const results = await Promise.all([controller.wait(0.02, 1), controller.wait(0.01, 2), controller.wait(0, 3)]);
        expect(results).toEqual([1, 2, 3]);
        expect(order).toEqual([3, 2, 1]);
        expect(handler.continuations.length).toBe(3);

        await controller.wait(0, 4);
        expect(handler.continuations.length).toBe(3);
        await client.disconnect();
    });

    test('values of every shape survive the direct decoding', async () => {
        class Shapes {
            @rpc.action()
            nothing(): null {
                return null;
            }

            @rpc.action()
            nullable(v: string | null): string | null {
                return v;
            }

            @rpc.action()
            union(v: number | string): number | string {
                return v;
            }

            @rpc.action()
            object(): { a: number; b: string[] } {
                return { a: 1, b: ['x'] };
            }

            @rpc.action()
            any(v: any): any {
                return v;
            }
        }

        const kernel = new RpcKernel();
        kernel.registerController(Shapes, 'shapes');
        const client = new DirectClient(kernel);
        const controller = client.controller<Shapes>('shapes');
        await client.connect();

        expect(await controller.nothing()).toBe(null);
        expect(await controller.nullable(null)).toBe(null);
        expect(await controller.nullable('a')).toBe('a');
        expect(await controller.union(5)).toBe(5);
        expect(await controller.union('b')).toBe('b');
        expect(await controller.object()).toEqual({ a: 1, b: ['x'] });
        expect(await controller.any({ q: [1] })).toEqual({ q: [1] });
        expect(await controller.any(undefined)).toBeUndefined();
        await client.disconnect();
    });
});

describe('the first call', () => {
    test('waits for the connection and uses the fast path', async () => {
        const recorded: Recorded = { fromClient: [], fromServer: [] };
        const client = new RpcClient(recordingAdapter(kernelWithController(), recorded));
        const controller = client.controller<Controller>('main');

        expect(await controller.add(1, 2)).toBe(3);

        const actions = recorded.fromClient.filter(v => frameType(v, MessageFlag.TypeAction));
        expect(actions.length).toBe(1);
        // the only other frame is asking for the client id during the handshake
        expect(recorded.fromClient.filter(v => frameType(v, MessageFlag.TypeControl)).length).toBe(1);
        await client.disconnect();
    });
});

describe('client.events', () => {
    test('calls on the fast path are reported', async () => {
        const recorded: Recorded = { fromClient: [], fromServer: [] };
        const client = new RpcClient(recordingAdapter(kernelWithController(), recorded));
        const controller = client.controller<Controller>('main');
        await client.connect();

        const events: any[] = [];
        client.events.subscribe(v => events.push(v));
        recorded.fromClient.length = 0;

        expect(await controller.add(1, 2)).toBe(3);
        expect(frameType(recorded.fromClient[0], MessageFlag.TypeAction)).toBe(true);

        expect(events.length).toBe(2);
        expect(events[0]).toMatchObject({ event: 'outgoing', type: 'action', body: { controller: 'main', method: 'add', args: [1, 2] } });
        expect(events[1]).toMatchObject({ event: 'incoming', type: 'result', body: { v: 3 } });

        const values: string[] = [];
        const observable = await controller.numbers('n', 1);
        events.length = 0;
        await new Promise<void>(resolve => observable.subscribe({ next: v => values.push(v), complete: () => resolve() }));
        expect(events.some(v => v.event === 'incoming' && v.type === 'next' && v.body.v === 'n0')).toBe(true);
        expect(values).toEqual(['n0']);
        await client.disconnect();
    });
});

describe('observable values', () => {
    test('are frames without a message object', async () => {
        const recorded: Recorded = { fromClient: [], fromServer: [] };
        const client = new RpcClient(recordingAdapter(kernelWithController(), recorded));
        const controller = client.controller<Controller>('main');
        await client.connect();

        const observable = await controller.numbers('a', 3);
        recorded.fromServer.length = 0;
        const values: string[] = [];
        await new Promise<void>(resolve => observable.subscribe({ next: v => values.push(v), complete: () => resolve() }));
        expect(values).toEqual(['a0', 'a1', 'a2']);

        const channel = recorded.fromServer.filter(v => frameType(v, MessageFlag.TypeChannel));
        expect(channel.length).toBe(3);
        await client.disconnect();
    });

    test('a BehaviorSubject value arrives before the reply describing the stream', async () => {
        class Streams {
            @rpc.action()
            behavior(): BehaviorSubject<number> {
                return new BehaviorSubject(42);
            }
        }

        const kernel = new RpcKernel();
        kernel.registerController(Streams, 'streams');
        const recorded: Recorded = { fromClient: [], fromServer: [] };
        const client = new RpcClient(recordingAdapter(kernel, recorded));
        const controller = client.controller<Streams>('streams');
        await client.connect();
        recorded.fromServer.length = 0;

        const behavior = await controller.behavior();
        expect(frameType(recorded.fromServer[0], MessageFlag.TypeChannel)).toBe(true);
        expect(behavior.value).toBe(42);
        behavior.unsubscribe();
        await client.disconnect();
    });

    test('a small value does not overtake a large one that is sent in chunks', async () => {
        class Streams {
            @rpc.action()
            values(): Observable<string> {
                return new Observable(observer => {
                    observer.next('x'.repeat(350_000));
                    observer.next('small');
                    observer.complete();
                });
            }
        }

        const kernel = new RpcKernel();
        kernel.registerController(Streams, 'streams');
        const client = new DirectClient(kernel);
        const controller = client.controller<Streams>('streams');
        await client.connect();

        const observable = await controller.values();
        const values: string[] = [];
        await new Promise<void>(resolve => observable.subscribe({ next: v => values.push(v), complete: () => resolve() }));
        expect(values.map(v => v.length)).toEqual([350_000, 5]);
        await client.disconnect();
    });

    test('values that are not typed or null work', async () => {
        class Streams {
            @rpc.action()
            untyped(): Observable<any> {
                return new Observable(observer => {
                    observer.next({ a: 1 });
                    observer.next(null);
                    observer.next(undefined);
                    observer.complete();
                });
            }
        }

        const kernel = new RpcKernel();
        kernel.registerController(Streams, 'streams');
        const client = new DirectClient(kernel);
        const controller = client.controller<Streams>('streams');
        await client.connect();

        const observable = await controller.untyped();
        const values: any[] = [];
        await new Promise<void>(resolve => observable.subscribe({ next: v => values.push(v), complete: () => resolve() }));
        expect(values).toEqual([{ a: 1 }, null, undefined]);
        await client.disconnect();
    });

    test('unsubscribing stops the values and frees the context once the server confirmed', async () => {
        const subject = new Subject<number>();

        class Streams {
            @rpc.action()
            stream(): Subject<number> {
                return subject;
            }
        }

        const kernel = new RpcKernel();
        kernel.registerController(Streams, 'streams');
        const client = new DirectClient(kernel);
        const controller = client.controller<Streams>('streams');
        await client.connect();

        const stream = await controller.stream();
        const values: number[] = [];
        const sub = stream.subscribe(v => values.push(v));
        subject.next(1);
        expect(values).toEqual([1]);
        sub.unsubscribe();
        stream.unsubscribe();
        subject.next(2);
        expect(values).toEqual([1]);
        expect((client as any).contexts.active).toBe(0);
        expect((client as any).contexts.active).toBe(0);
        await client.disconnect();
    });
});

describe('body layout', () => {
    class Layout {
        @rpc.action()
        add(a: number, b: number): number {
            return a + b;
        }

        @rpc.action()
        echo(v: string): string {
            return v;
        }

        @rpc.action()
        object(v: { a: number }): { a: number } {
            return v;
        }

        @rpc.action()
        mixed(a: number, b: number | string): number | string {
            return b;
        }

        @rpc.action()
        optional(a: number, b?: string, c?: boolean): [number, string | undefined, boolean | undefined] {
            return [a, b, c];
        }

        @rpc.action()
        nullable(v: string | null, w: number | undefined): string | null {
            return v;
        }

        @rpc.action()
        rest(first: number, ...others: string[]): string[] {
            return [String(first), ...others];
        }

        @rpc.action()
        fails(): number {
            throw new Error('x');
        }

        @rpc.action()
        preSerializedNumber(): number {
            return preSerialize<number>(70000) as any;
        }

        @rpc.action()
        numbers(): Observable<number> {
            return new Observable(observer => {
                observer.next(5);
                observer.next(preSerialize<number>(300) as any);
                observer.complete();
            });
        }

        @(rpc.action().strictSerialization(false))
        loose(v: number): any {
            return { v };
        }

        @rpc.action()
        slow(ms: number, value: number): Promise<number> {
            return new Promise(resolve => setTimeout(() => resolve(value), ms));
        }

        @rpc.action()
        big(value: string): number {
            return value.length;
        }

        @rpc.action()
        pair(a: number, b: string): [number, string] {
            return [a, b];
        }

        @rpc.action()
        sparse(a: number, c: boolean): [number, string | undefined, boolean] {
            return [a, undefined, c];
        }

        @rpc.action()
        preSerializedPair(): [number, string] {
            return preSerialize<[number, string]>([1, 'a']) as any;
        }

        @rpc.action()
        pairs(): Observable<[number, string]> {
            return new Observable(observer => {
                observer.next([1, 'a']);
                observer.next(preSerialize<[number, string]>([2, 'b']) as any);
                observer.complete();
            });
        }

        @rpc.action()
        subject(): Subject<number> {
            const subject = new Subject<number>();
            setTimeout(() => {
                subject.next(5);
                subject.complete();
            }, 1);
            return subject;
        }
    }

    async function setup() {
        const recorded: Recorded = { fromClient: [], fromServer: [] };
        const kernel = new RpcKernel();
        kernel.registerController(Layout, 'layout');
        const client = new RpcClient(recordingAdapter(kernel, recorded));
        const controller = client.controller<Layout>('layout');
        await client.connect();
        const reset = () => {
            recorded.fromClient.length = 0;
            recorded.fromServer.length = 0;
        };
        const hex = (b: Uint8Array) => Buffer.from(b).toString('hex');
        return { kernel, client, controller, recorded, reset, hex };
    }

    test('add(1, 2) is byte for byte what rpc2 sends', async () => {
        const { client, controller, recorded, reset, hex } = await setup();
        reset();
        expect(await controller.add(1, 2)).toBe(3);
        expect(hex(recorded.fromClient[0])).toBe('11000000' + '34' + '0000' + '1001000000' + '1002000000');
        expect(hex(recorded.fromServer[0])).toBe('0c000000' + '5c' + '0100' + '1003000000');
        await client.disconnect();
    });

    test('a tuple result is a sequence of values, not an array', async () => {
        const { client, controller, recorded, reset, hex } = await setup();
        reset();
        expect(await controller.pair(1, 'a')).toEqual([1, 'a']);
        expect(hex(recorded.fromServer[0].subarray(7))).toBe('1001000000' + '02' + '02000000' + '6100');

        reset();
        // #722: the undefined in the middle must not shift the value after it
        expect(await controller.sparse(1, true)).toEqual([1, undefined, true]);
        expect(hex(recorded.fromServer[0].subarray(7))).toBe('1001000000' + '06' + '0801');
        await client.disconnect();
    });

    test('each result gets its own array', async () => {
        const { client, controller } = await setup();
        const first = await controller.pair(1, 'a');
        const second = await controller.pair(2, 'b');
        expect(first).not.toBe(second);
        expect(first).toEqual([1, 'a']);
        await client.disconnect();
    });

    test('a pre-serialized tuple has the bytes of a serialized one', async () => {
        const { client, controller, recorded, reset, hex } = await setup();
        reset();
        expect(await controller.preSerializedPair()).toEqual([1, 'a']);
        expect(hex(recorded.fromServer[0].subarray(7))).toBe('1001000000' + '02' + '02000000' + '6100');

        const observable = await controller.pairs();
        reset();
        const values: [number, string][] = [];
        await new Promise<void>(resolve => observable.subscribe({ next: v => values.push(v), complete: () => resolve() }));
        expect(values).toEqual([
            [1, 'a'],
            [2, 'b'],
        ]);
        const frames = recorded.fromServer.filter(v => frameType(v, MessageFlag.TypeChannel));
        expect(hex(frames[0].subarray(7))).toBe('0b' + '1001000000' + '02' + '02000000' + '6100');
        expect(hex(frames[1].subarray(7))).toBe('0b' + '1002000000' + '02' + '02000000' + '6200');
        await client.disconnect();
    });

    test('a stream is announced with one byte after the context id', async () => {
        const { client, controller, recorded, reset, hex } = await setup();
        reset();
        await controller.numbers();
        expect(hex(recorded.fromServer[0])).toBe('08000000' + '68' + '0100' + '01');
        await client.disconnect();
    });

    test('a subject value is one byte of header, whatever the context id', async () => {
        const { client, controller, recorded, reset, hex } = await setup();
        await controller.add(1, 2);
        reset();
        const subject = await controller.subject();
        const value = await firstValueFrom(subject);
        expect(value).toBe(5);
        const frame = recorded.fromServer.find(v => frameType(v, MessageFlag.TypeChannel) && v.byteLength > 8)!;
        expect(hex(frame.subarray(7))).toBe('0b' + '1005000000');
        await client.disconnect();
    });

    test('a call sent while the reply of an earlier one is on its way', async () => {
        const recorded: Recorded = { fromClient: [], fromServer: [] };
        const hold = { held: [] as Uint8Array[], active: false };
        const kernel = new RpcKernel();
        kernel.registerController(Layout, 'layout');
        const client = new RpcClient(recordingAdapter(kernel, recorded, hold));
        const controller = client.controller<Layout>('layout');
        await client.connect();
        await controller.add(0, 0);

        // the server answers and is done with the first call before the client knows about it
        hold.active = true;
        const first = controller.add(1, 2);
        const second = controller.add(3, 4);
        hold.active = false;
        for (const frame of hold.held.splice(0)) (client as any).transporter.reader.feed(frame);

        const results = await Promise.race([Promise.all([first, second]), sleep(0.2).then(() => 'hangs')]);
        expect(results).toEqual([3, 7]);
        await client.disconnect();
    });

    test('strings, objects and tags', async () => {
        const { client, controller, recorded, reset, hex } = await setup();
        reset();
        expect(await controller.echo('hello')).toBe('hello');
        expect(hex(recorded.fromClient[0].subarray(4))).toBe('34' + '0100' + '02' + '06000000' + '68656c6c6f00');
        expect(hex(recorded.fromServer[0].subarray(4))).toBe('5c' + '0100' + '02' + '06000000' + '68656c6c6f00');

        reset();
        expect(await controller.object({ a: 1 })).toEqual({ a: 1 });
        expect(hex(recorded.fromClient[0].subarray(7))).toBe('03' + '0c000000' + '106100' + '01000000' + '00');

        reset();
        expect(await controller.mixed(1, 7)).toBe(7);
        expect(hex(recorded.fromClient[0].subarray(7))).toBe('1001000000' + '1007000000');
        expect(await controller.mixed(1, 'a')).toBe('a');
        await client.disconnect();
    });

    test('optional parameters at the end cost nothing, a gap one byte', async () => {
        const { client, controller, recorded, reset, hex } = await setup();
        reset();
        expect(await controller.optional(1)).toEqual([1, undefined, undefined]);
        expect(hex(recorded.fromClient[0].subarray(7))).toBe('1001000000');
        reset();
        expect(await controller.optional(1, undefined, true)).toEqual([1, undefined, true]);
        expect(hex(recorded.fromClient[0].subarray(7))).toBe('1001000000' + '06' + '0801');
        await client.disconnect();
    });

    test('a required parameter accepting undefined is not left out', async () => {
        const { client, controller } = await setup();
        expect(await controller.nullable(null, undefined)).toBe(null);
        await client.disconnect();
    });

    test('required parameters that are missing are undefined and left to the validation', () => {
        const decode = createParameterDeserializer(typeOf<[a: number, b: string]>() as TypeTuple);
        expect(decode(new Uint8Array(0), 0, 0).length).toBe(2);
    });

    test('rest parameters', async () => {
        const { client, controller } = await setup();
        expect(await controller.rest(1)).toEqual(['1']);
        expect(await controller.rest(1, 'a', 'b', 'c')).toEqual(['1', 'a', 'b', 'c']);
        await client.disconnect();
    });

    test('a value that is not of the type behaves as in BSON', async () => {
        const { client, controller } = await setup();
        await expect(controller.echo(1 as any)).rejects.toThrow('args.v(type)');
        await expect(controller.add('x' as any, 1)).rejects.toThrow('args.a(type): Cannot convert x to number');
        expect(await controller.add(1, 2)).toBe(3);
        await client.disconnect();
    });

    test('an error is a tuple', async () => {
        const { client, controller, recorded, reset } = await setup();
        reset();
        await expect(controller.fails()).rejects.toThrow('x');
        expect(frameType(recorded.fromServer[0], MessageFlag.TypeError)).toBe(true);
        expect(recorded.fromServer[0][4 + 3]).toBe(2); //the class name string is the first value
        await client.disconnect();
    });

    test('PreSerialized values', async () => {
        const { client, controller, recorded, reset, hex } = await setup();
        reset();
        expect(await controller.preSerializedNumber()).toBe(70000);
        expect(hex(recorded.fromServer[0].subarray(7))).toBe('10' + '70110100');

        const observable = await controller.numbers();
        reset();
        const values: number[] = [];
        await new Promise<void>(resolve => observable.subscribe({ next: v => values.push(v), complete: () => resolve() }));
        expect(values).toEqual([5, 300]);
        const frames = recorded.fromServer.filter(v => frameType(v, MessageFlag.TypeChannel));
        //the subscription, then the value
        expect(hex(frames[0].subarray(7))).toBe('0b' + '1005000000');
        expect(hex(frames[1].subarray(7))).toBe('0b' + '102c010000');
        await client.disconnect();
    });

    test('not strict serialization', async () => {
        const { client, controller } = await setup();
        expect(await controller.loose(1)).toEqual({ v: 1 });
        await client.disconnect();
    });

    test('a parameter with a validator is validated, a plain one needs no validator', async () => {
        class Checked {
            @rpc.action()
            plain(a: number, b: string): void {}

            @rpc.action()
            positive(a: number & Positive): number {
                return a;
            }
        }

        const kernel = new RpcKernel();
        kernel.registerController(Checked, 'checked');
        const client = new DirectClient(kernel);
        const controller = client.controller<Checked>('checked');
        await client.connect();

        await controller.plain(1, 'a');
        expect(await controller.positive(1)).toBe(1);
        await expect(controller.positive(-1)).rejects.toThrow('Validation error for arguments');
        const entries = (kernel as any).actions.entries;
        expect(entries.find((v: any) => v.methodName === 'plain').validate).toBe(false);
        expect(entries.find((v: any) => v.methodName === 'positive').validate).toBe(true);
        await client.disconnect();
    });

    test('methods become plain properties with a fixed parameter list', async () => {
        const { client, controller } = await setup();
        await controller.add(1, 2);
        const descriptor = Object.getOwnPropertyDescriptor(controller, 'add')!;
        expect(typeof descriptor.value).toBe('function');
        expect(descriptor.value.length).toBe(2);
        expect(await controller.add(3, 4)).toBe(7);
        await client.disconnect();
    });

    test('a fixed method leaves out an optional parameter that was not given', async () => {
        const { client, controller, recorded, reset, hex } = await setup();
        await controller.optional(1, 'a');
        reset();
        await controller.optional(1);
        expect(hex(recorded.fromClient[0].subarray(7))).toBe('1001000000');
        await client.disconnect();
    });

    describe('context ids without sending them', () => {
        test('replies in any order reach the right call', async () => {
            const { client, controller } = await setup();
            const slow = controller.slow(20, 1);
            const fast = controller.slow(0, 2);
            await fast;
            // the server's reply freed that id, but the next call must not be confused about it
            const next = controller.slow(0, 3);
            expect(await next).toBe(3);
            expect(await slow).toBe(1);
            await client.disconnect();
        });

        test('wrapped ids carry their id once and continue counting', async () => {
            const { client, controller, recorded, reset } = await setup();
            (client as any).contexts = new SequentialContextDispatcher(4, 4);
            reset();
            for (let i = 0; i < 10; i++) expect(await controller.add(i, 1)).toBe(i + 1);
            const sizes = recorded.fromClient.map(v => v.byteLength);
            const withId = sizes.filter(v => v === 17 + 2).length;
            expect(withId).toBeGreaterThan(0);
            expect(withId).toBeLessThan(10);
            await client.disconnect();
        });

        test('a long running call in the way of the ids', async () => {
            const { client, controller } = await setup();
            (client as any).contexts = new SequentialContextDispatcher(4, 4);
            const slow = controller.slow(30, 99);
            for (let i = 0; i < 12; i++) expect(await controller.slow(0, i)).toBe(i);
            expect(await slow).toBe(99);
            await client.disconnect();
        });

        test('a chunked call does not disturb the counting of later calls', async () => {
            const { client, controller } = await setup();
            let bigDone = false;
            const big = controller.big('x'.repeat(250_000)).then(v => {
                bigDone = true;
                return v;
            });
            const small = [controller.add(1, 2), controller.add(3, 4)];
            expect(await Promise.all(small)).toEqual([3, 7]);
            // short calls are not held back by a large one that is being sent in chunks
            expect(bigDone).toBe(false);
            expect(await big).toBe(250_000);
            expect(await controller.add(5, 6)).toBe(11);
            await client.disconnect();
        });

        test('more active calls than the first window of ids', async () => {
            const { client, controller } = await setup();
            (client as any).contexts = new SequentialContextDispatcher(0xffff, 8);
            const results = await Promise.all(Array.from({ length: 100 }, (_, i) => controller.slow(1, i)));
            expect(results).toEqual(Array.from({ length: 100 }, (_, i) => i));
            await client.disconnect();
        });
    });
});

describe('every way a stream ends gives its context back', () => {
    class Streams {
        @rpc.action()
        values(count: number): Observable<number> {
            return new Observable(observer => {
                for (let i = 0; i < count; i++) observer.next(i);
                observer.complete();
            });
        }

        @rpc.action()
        failing(): Observable<number> {
            return new Observable(observer => {
                observer.next(1);
                observer.error(new Error('stream failed'));
            });
        }

        @rpc.action()
        endless(): Observable<number> {
            return new Observable(observer => {
                observer.next(1);
                observer.next(2);
            });
        }

        @rpc.action()
        subject(): Subject<number> {
            return new Subject<number>();
        }

        @rpc.action()
        completingSubject(): Subject<number> {
            const subject = new Subject<number>();
            setTimeout(() => {
                subject.next(1);
                subject.complete();
            }, 1);
            return subject;
        }

        @rpc.action()
        behavior(): BehaviorSubject<number> {
            return new BehaviorSubject(1);
        }

        @rpc.action()
        unary(): number {
            return 1;
        }

        @rpc.action()
        nothing(): void {}

        @rpc.action()
        throwing(): number {
            throw new Error('unary failed');
        }
    }

    async function setup() {
        const kernel = new RpcKernel();
        kernel.registerController(Streams, 'streams');
        let handler: any;
        kernel.onConnection((connection: any) => {
            handler = connection.actionHandler;
        });
        const client = new DirectClient(kernel);
        const controller = client.controller<Streams>('streams');
        await client.connect();
        const expectAllReleased = () => {
            expect((client as any).contexts.active).toBe(0);
            expect((client as any).contexts.active).toBe(0);
            expect(Object.keys(handler.observables)).toEqual([]);
            expect(Object.keys(handler.observableSubjects)).toEqual([]);
            expect(handler.detachedContexts.size).toBe(0);
        };
        return { kernel, client, controller, expectAllReleased, handler: () => handler };
    }

    test('more streams than there are context ids', async () => {
        const { client, controller, expectAllReleased } = await setup();
        for (let i = 0; i < 70_000; i++) {
            await lastValueFrom(await controller.values(1));
        }
        expectAllReleased();
        await client.disconnect();
    }, 120_000);

    test('concurrent streams with a small context limit', async () => {
        const { client, controller, expectAllReleased } = await setup();
        (client as any).contexts = new SequentialContextDispatcher(16, 16);
        for (let round = 0; round < 50; round++) {
            await Promise.all(
                Array.from({ length: 16 }, async () => {
                    expect(await lastValueFrom(await controller.values(100))).toBe(99);
                }),
            );
        }
        expectAllReleased();
        await client.disconnect();
    });

    test('complete', async () => {
        const { client, controller, expectAllReleased } = await setup();
        await lastValueFrom(await controller.values(3));
        expectAllReleased();
        await client.disconnect();
    });

    test('error', async () => {
        const { client, controller, expectAllReleased } = await setup();
        await expect(lastValueFrom(await controller.failing())).rejects.toThrow('stream failed');
        expectAllReleased();
        await client.disconnect();
    });

    test('unsubscribe before complete and mid-stream', async () => {
        const { client, controller, expectAllReleased } = await setup();
        const first = await controller.endless();
        const values: number[] = [];
        const subscription = first.subscribe(v => values.push(v));
        expect(values).toEqual([1, 2]);
        subscription.unsubscribe();
        expectAllReleased();

        const taken: number[] = [];
        const again = await controller.endless();
        again.pipe(take(1)).subscribe(v => taken.push(v));
        expect(taken).toEqual([1]);
        expectAllReleased();
        await client.disconnect();
    });

    test('values arriving after lastValueFrom resolved', async () => {
        const { client, controller, expectAllReleased } = await setup();
        expect(await firstValueFrom(await controller.values(100))).toBe(0);
        expectAllReleased();
        await client.disconnect();
    });

    test('Subject and BehaviorSubject', async () => {
        const { client, controller, expectAllReleased } = await setup();
        (await controller.subject()).unsubscribe();
        expectAllReleased();
        (await controller.behavior()).unsubscribe();
        expectAllReleased();
        const behavior = await controller.behavior();
        behavior.complete();
        expectAllReleased();
        await lastValueFrom(await controller.completingSubject());
        expectAllReleased();
        await client.disconnect();
    });

    test('unary calls', async () => {
        const { client, controller, expectAllReleased } = await setup();
        await controller.unary();
        await controller.nothing();
        await expect(controller.throwing()).rejects.toThrow('unary failed');
        expectAllReleased();
        await client.disconnect();
    });

    test('disconnect', async () => {
        const { client, controller } = await setup();
        await controller.endless();
        (await controller.subject()).subscribe();
        await client.disconnect();
        expect((client as any).contexts.active).toBe(0);
        expect((client as any).contexts.active).toBe(0);
    });

    test('an observable that is never subscribed gives its context back', async () => {
        const { client, controller, expectAllReleased } = await setup();
        const observable = await controller.values(1);
        expect((client as any).contexts.active).toBe(1);
        await sleep(0.15);
        expectAllReleased();

        expect(await lastValueFrom(observable)).toBe(0);
        expectAllReleased();
        await client.disconnect();
    });

    test('an observable can be subscribed again, as often as wanted', async () => {
        const { client, controller, expectAllReleased, handler } = await setup();
        const observable = await controller.values(2);
        for (let i = 0; i < 3; i++) {
            expect(await lastValueFrom(observable)).toBe(1);
            expectAllReleased();
        }
        expect(Object.keys(handler().detachedObservables).length).toBe(1);
        await client.disconnect();
    });

    test('streams on the generic path', async () => {
        const { client, controller, expectAllReleased } = await setup();
        for (let i = 0; i < 3; i++) {
            ClientProgress.track();
            expect(await lastValueFrom(await controller.values(2))).toBe(1);
        }
        expectAllReleased();
        await client.disconnect();
    });

    test('streams of a back-controller release the contexts of the server', async () => {
        const kernel = new RpcKernel();
        let connection: any;
        kernel.onConnection(c => {
            connection = c;
        });
        const client = new DirectClient(kernel);
        client.registerController(Streams, 'streams');
        await client.connect();

        const controller = connection.controller('streams') as RemoteController<Streams>;
        for (let i = 0; i < 3; i++) {
            expect(await lastValueFrom(await controller.values(2))).toBe(1);
        }
        expect(connection.contexts.active).toBe(0);
        expect(connection.contexts.active).toBe(0);
        await client.disconnect();
    });

    test('a detached observable does not open a new connection', async () => {
        const { client, controller, expectAllReleased } = await setup();
        const observable = await controller.values(1);
        await lastValueFrom(observable);
        expectAllReleased();
        const connect = jest.spyOn(client.transporter, 'connect');

        await client.disconnect();
        await expect(lastValueFrom(observable)).rejects.toThrow('Connection closed');
        (client.actionClient as any).dropObservable(1, {}, (client.actionClient as any).connectionOfStream() - 1);

        expect(connect).not.toHaveBeenCalled();
        expect(client.transporter.isConnected()).toBe(false);
    });

    test('dropping an observable of a closed server connection does not throw', async () => {
        const kernel = new RpcKernel();
        let connection: any;
        kernel.onConnection(c => {
            connection = c;
        });
        const client = new DirectClient(kernel);
        await client.connect();
        await client.disconnect();
        expect(() => connection.actionClient.dropObservable(1, {}, 0)).not.toThrow();
    });

    test('a second subscriber keeps the context', async () => {
        const { client, controller, expectAllReleased } = await setup();
        const observable = await controller.endless();
        const a = observable.subscribe();
        const b = observable.subscribe();
        a.unsubscribe();
        expect((client as any).contexts.active).toBe(1);
        b.unsubscribe();
        expectAllReleased();
        await client.disconnect();
    });

    test('a dropped observable is released on the server', async () => {
        const { kernel, client, controller, handler } = await setup();
        await (async () => {
            await lastValueFrom(await controller.values(1));
        })();
        expect(kernel.stats.active.observables).toBe(1);
        for (let i = 0; i < 10 && kernel.stats.active.observables; i++) {
            await sleep(0.05);
            (gc as any)();
        }
        await sleep(0.05);
        expect(kernel.stats.active.observables).toBe(0);
        expect(Object.keys(handler().detachedObservables)).toEqual([]);
        await client.disconnect();
    });

    test('the end of a context is confirmed before the id is reused', async () => {
        const recorded: Recorded = { fromClient: [], fromServer: [] };
        const hold = { held: [] as Uint8Array[], active: false };
        const kernel = new RpcKernel();
        kernel.registerController(Streams, 'streams');
        const client = new RpcClient(recordingAdapter(kernel, recorded, hold));
        const controller = client.controller<Streams>('streams');
        await client.connect();

        const observable = await controller.endless();
        const subscription = observable.subscribe();
        hold.active = true;
        subscription.unsubscribe();
        expect((client as any).contexts.active).toBe(1);

        hold.active = false;
        for (const frame of hold.held.splice(0)) (client as any).transporter.reader.feed(frame);
        expect((client as any).contexts.active).toBe(0);
        await client.disconnect();
    });
});

describe('context release', () => {
    const contextsOf = (client: RpcClient) => (client as any).contexts as SequentialContextDispatcher<any>;

    test('a message without a reply gives its context back', async () => {
        const client = new DirectClient(new RpcKernel());
        await client.connect();
        const actions = (client as any).actionClient;
        for (let i = 0; i < 20; i++) actions.dropObservable(i, { peerId: undefined }, actions.connectionOfStream());
        expect((client as any).contexts.active).toBe(0);
        await client.disconnect();
    });

    test('ping gives its context back', async () => {
        const client = new DirectClient(new RpcKernel());
        await client.connect();
        await client.ping();
        for (let i = 0; i < 20; i++) await client.ping();
        expect((client as any).contexts.active).toBe(0);
        expect((client as any).contexts.active).toBe(0);
        await client.disconnect();
    });

    test('a BehaviorSubject gives its context back when unsubscribed', async () => {
        class Streams {
            @rpc.action()
            behavior(): BehaviorSubject<number> {
                return new BehaviorSubject(42);
            }
        }

        const kernel = new RpcKernel();
        kernel.registerController(Streams, 'streams');
        const client = new DirectClient(kernel);
        const controller = client.controller<Streams>('streams');
        await client.connect();

        for (let i = 0; i < 20; i++) (await controller.behavior()).unsubscribe();
        expect(contextsOf(client).active).toBe(0);
        expect((client as any).contexts.active).toBe(0);
        expect(kernel.stats.active.behaviorSubjects).toBe(0);
        await client.disconnect();
    });

    test('a frame for a context id that was never handed out is ignored', async () => {
        const client = new DirectClient(kernelWithController());
        await client.connect();
        const frame = new Uint8Array(7);
        frame[0] = 7;
        frame[4] = MessageFlag.RouteClient | MessageFlag.ContextEnd | MessageFlag.TypeAck;
        frame[5] = 0xff;
        frame[6] = 0xff;
        expect(() => (client as any).transporter.reader.feed(frame)).not.toThrow();
        await client.disconnect();
    });
});

describe('protocol version', () => {
    function adapterReplying(frame: () => Uint8Array): ClientTransportAdapter {
        return {
            connect(connection: TransportClientConnection) {
                connection.onConnected({
                    clientAddress: () => 'test',
                    bufferedAmount: () => 0,
                    close() {},
                    writeBinary() {
                        queueMicrotask(() => connection.readBinary(frame()));
                    },
                });
            },
        };
    }

    test('a newer server version fails the client with a clear error', async () => {
        const reply = serializeHello(rpcProtocolVersion + 1);
        const client = new RpcClient(adapterReplying(() => reply));
        await expect(client.connect()).rejects.toThrow(`server uses version ${rpcProtocolVersion + 1}`);
    });

    function serializeHello(version: number): Uint8Array {
        const reply = new Uint8Array(10);
        new DataView(reply.buffer).setUint32(0, 10, true);
        reply[4] = MessageFlag.TypeSchema;
        reply[5] = version;
        return reply;
    }

    test('the server answers a future client version and closes', () => {
        const kernel = kernelWithController();
        const written: Uint8Array[] = [];
        let closed = false;
        const connection = kernel.createConnection({
            writeBinary: (b: Uint8Array) => written.push(b.slice()),
            close: () => (closed = true),
        });
        const hello = copyWrittenFrame(writeHelloFrameTransient(0));
        hello[5] = rpcProtocolVersion + 1;
        connection.feed(hello);
        expect(written.length).toBe(1);
        expect(isTypeFlag(written[0][4], MessageFlag.TypeSchema)).toBe(true);
        expect(written[0][5]).toBe(rpcProtocolVersion);
        expect(closed).toBe(true);
    });

    test('no handshake reply fails with a timeout error', async () => {
        const client = new RpcClient({
            connect(connection: TransportClientConnection) {
                connection.onConnected({
                    close() {},
                    writeBinary() {},
                });
            },
        });
        client.transporter.writerOptions.handshakeTimeout = 10;
        await expect(client.connect()).rejects.toThrow('No reply to the RPC handshake');
    });
});

describe('chunking', () => {
    test('a chunk is sent only after the previous one was acknowledged', async () => {
        const reader = new RpcBinaryMessageReader(() => undefined);
        const options = new TransportOptions();
        options.chunkSize = 1000;
        const writer = new TransportBinaryMessageChunkWriter(reader, options);

        const buffers: Uint8Array[] = [];
        const message = copyWrittenFrame(writeResultFrameTransient(3, MessageFlag.RouteClient, createReturnSerializer(typeOf<string>()), 'x'.repeat(3500)));
        const done = writer.writeFull(b => buffers.push(b.slice()), message);

        const ack = () => reader.feed(copyWrittenFrame(writeChunkControlFrameTransient(3, MessageFlag.RouteClient, ChunkOp.Ack)));

        await Promise.resolve();
        expect(buffers.length).toBe(1); //back-pressure: waits for the ack of the first chunk

        ack();
        await sleep(0.001);
        expect(buffers.length).toBe(2);

        ack();
        await sleep(0.001);
        ack();
        await sleep(0.001);
        ack();
        await done;
        expect(buffers.length).toBe(4);
        expect(frameType(buffers[0], MessageFlag.TypeChunk)).toBe(true);
    });

    test('large arguments and results of the fast path are chunked and arrive intact', async () => {
        const client = new DirectClient(kernelWithController());
        const controller = client.controller<Controller>('main');
        await client.connect();

        const big = new Uint8Array(350_000);
        for (let i = 0; i < big.length; i++) big[i] = i % 251;

        const [a, b, c] = await Promise.all([controller.binary(big), controller.add(1, 2), controller.echo('x'.repeat(250_000))]);
        expect(Buffer.from(a).equals(Buffer.from(big))).toBe(true);
        expect(b).toBe(3);
        expect(c).toBe('x'.repeat(250_000));
        await client.disconnect();
    });
});

describe('streams', () => {
    test('interleaved streams and calls on one connection keep their data apart', async () => {
        const client = new DirectClient(kernelWithController());
        const controller = client.controller<Controller>('main');
        await client.connect();

        const collect = (name: string, count: number) =>
            new Promise<string[]>(async resolve => {
                const observable = await controller.numbers(name, count);
                const values: string[] = [];
                observable.subscribe({ next: v => values.push(v), complete: () => resolve(values) });
            });

        const results = await Promise.all([collect('a', 30), controller.add(1, 1), collect('b', 30), controller.echo('hello'), collect('c', 30)]);

        const expected = (name: string) => Array.from({ length: 30 }, (_, i) => name + i);
        expect(results[0]).toEqual(expected('a'));
        expect(results[1]).toBe(2);
        expect(results[2]).toEqual(expected('b'));
        expect(results[3]).toBe('hello');
        expect(results[4]).toEqual(expected('c'));

        await client.disconnect();
    });

    test('a returned Subject and BehaviorSubject work over the fast path', async () => {
        class Streams {
            @rpc.action()
            behavior(): BehaviorSubject<number> {
                return new BehaviorSubject(42);
            }

            @rpc.action()
            subject(): Subject<number> {
                const subject = new Subject<number>();
                setTimeout(() => {
                    subject.next(1);
                    subject.complete();
                }, 1);
                return subject;
            }
        }

        const kernel = new RpcKernel();
        kernel.registerController(Streams, 'streams');
        const client = new DirectClient(kernel);
        const controller = client.controller<Streams>('streams');
        await client.connect();
        // the first call of each kind runs while not yet connected through generic messages
        await controller.subject();

        const behavior = await controller.behavior();
        expect(behavior.value).toBe(42);
        behavior.unsubscribe();

        const subject = await controller.subject();
        const values: number[] = [];
        await new Promise<void>(resolve => subject.subscribe({ next: v => values.push(v), complete: () => resolve() }));
        expect(values).toEqual([1]);
        await client.disconnect();
    });
});

describe('binary values', () => {
    test('a returned Uint8Array survives later messages', async () => {
        const client = new DirectClient(kernelWithController());
        const controller = client.controller<Controller>('main');
        await client.connect();

        const first = await controller.binary(new Uint8Array([1, 2, 3, 4]));
        await controller.binary(new Uint8Array([9, 9, 9, 9]));
        await controller.echo('overwrites the shared buffer');
        expect([...first]).toEqual([1, 2, 3, 4]);

        // without a type the decoder returns the bytes as they are, not via a typed array that copies them
        const untyped = await controller.binaryAny(new Uint8Array([5, 6, 7, 8]));
        await controller.binaryAny(new Uint8Array([9, 9, 9, 9]));
        expect([...untyped]).toEqual([5, 6, 7, 8]);
        await client.disconnect();
    });
});

describe('transports', () => {
    test('transports without a binary socket get their own copy of every frame', async () => {
        const kernel = kernelWithController();
        const written: Uint8Array[] = [];
        const snapshots: number[][] = [];
        const client = new RpcClient({
            connect(connection: TransportClientConnection) {
                const kernelConnection = kernel.createConnection({
                    writeBinary: (buffer: Uint8Array) => connection.readBinary(buffer),
                    close: () => connection.onClose('closed'),
                });
                const transport: TransportConnection = {
                    close: () => kernelConnection.close(),
                    writeBinary(buffer) {
                        written.push(buffer);
                        snapshots.push([...buffer]);
                        kernelConnection.feed(buffer);
                    },
                };
                connection.onConnected(transport);
            },
        });
        const controller = client.controller<Controller>('main');

        expect(await controller.echo('a')).toBe('a');
        expect(await controller.echo('b')).toBe('b');

        expect(written.length).toBeGreaterThanOrEqual(2);
        expect(written.map(v => [...v])).toEqual(snapshots);
        await client.disconnect();
    });
});
