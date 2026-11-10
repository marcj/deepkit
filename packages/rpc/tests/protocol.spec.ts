import { describe, expect, test } from '@jest/globals';

import { InjectorModule } from '@deepkit/injector';
import { ContextDispatcher } from '@deepkit/net';
import { ReceiveType, ReflectionKind, TypeTuple, resolveReceiveType, typeOf } from '@deepkit/type';

import { createParameterSerializer, getBodyCodec } from '../src/action.js';
import { getActions, rpc } from '../src/decorators.js';
import {
    ControlOp,
    MessageFlag,
    actionIdSize,
    channelBodyOffset,
    contextIdSize,
    frameMemory,
    framePrefixSize,
    getAction,
    getActionOffset,
    getBodyOffset,
    getContextId,
    getContextIdOffset,
    getRouteDataSize,
    hasContext,
    isContextFlag,
    isRouteFlag,
    isTypeFlag,
    readChannelSubscription,
    readUint16LE,
    rpcProtocolVersion,
    setContextFlag,
    setRouteFlag,
    setTypeFlag,
    writeActionFrameTransient,
    writeChannelFrameTransient,
    writeControlFrameTransient,
    writeControlIdFrameTransient,
    writeHelloFrameTransient,
    writeHelloReplyFrameTransient,
    writeUint16LE,
} from '../src/protocol.js';
import { copyWrittenFrame } from '../src/protocol.js';

function frame(flag: number, size: number = 64): Uint8Array {
    const buffer = new Uint8Array(size);
    buffer[0] = size;
    buffer[4] = flag;
    return buffer;
}

test('assume newUin8Array is not copied', () => {
    const buffer = new Uint8Array(32);
    buffer[0] = 42;

    const reply = buffer.subarray(0, 1);

    expect(reply.buffer === buffer.buffer).toBe(true);

    // Modify `reply[0]`
    reply[0] = 99;

    expect(reply[0]).toBe(99);
    expect(buffer[0]).toBe(99);
});

test('header', () => {
    const routeSize = 16 + 16;
    expect(getContextIdOffset(frame(MessageFlag.RouteClient))).toBe(framePrefixSize);
    expect(getContextIdOffset(frame(MessageFlag.RouteServer))).toBe(framePrefixSize);
    expect(getContextIdOffset(frame(MessageFlag.RouteSourceDest))).toBe(framePrefixSize + routeSize);
    expect(getContextIdOffset(frame(MessageFlag.ContextNew))).toBe(framePrefixSize);

    expect(getActionOffset(frame(MessageFlag.RouteClient))).toBe(framePrefixSize);
    expect(getActionOffset(frame(MessageFlag.RouteClient | MessageFlag.ContextNone))).toBe(framePrefixSize);
    expect(getActionOffset(frame(MessageFlag.RouteClient | MessageFlag.ContextNew))).toBe(framePrefixSize);
    expect(getActionOffset(frame(MessageFlag.RouteClient | MessageFlag.ContextExisting))).toBe(framePrefixSize + contextIdSize);
    expect(getActionOffset(frame(MessageFlag.RouteClient | MessageFlag.ContextEnd))).toBe(framePrefixSize + contextIdSize);

    expect(getActionOffset(frame(MessageFlag.RouteSourceDest | MessageFlag.ContextExisting))).toBe(framePrefixSize + routeSize + contextIdSize);
    expect(getActionOffset(frame(MessageFlag.RouteSourceDest | MessageFlag.ContextNone))).toBe(framePrefixSize + routeSize);
});

test('peer route data is variable', () => {
    const buffer = frame(MessageFlag.RoutePeer);
    buffer[framePrefixSize + 16] = 'a'.charCodeAt(0);
    buffer[framePrefixSize + 17] = 0;
    expect(getRouteDataSize(buffer)).toBe(16 + 1 + 1);
    expect(getContextIdOffset(buffer)).toBe(framePrefixSize + 18);
});

test('setRouteFlag', () => {
    const message = frame(MessageFlag.RouteClient | MessageFlag.ContextExisting | MessageFlag.TypeAck);
    expect(isRouteFlag(message[4], MessageFlag.RouteClient)).toBe(true);
    expect(isRouteFlag(message[4], MessageFlag.RouteServer)).toBe(false);
    expect(isRouteFlag(message[4], MessageFlag.RouteSourceDest)).toBe(false);

    expect(isContextFlag(message[4], MessageFlag.ContextExisting)).toBe(true);
    expect(isContextFlag(message[4], MessageFlag.ContextNew)).toBe(false);
    expect(isContextFlag(message[4], MessageFlag.ContextNone)).toBe(false);
    expect(isContextFlag(message[4], MessageFlag.ContextEnd)).toBe(false);

    expect(isTypeFlag(message[4], MessageFlag.TypeAck)).toBe(true);
    expect(isTypeFlag(message[4], MessageFlag.TypeAction)).toBe(false);
    expect(isTypeFlag(message[4], MessageFlag.TypeChunk)).toBe(false);
    expect(isTypeFlag(message[4], MessageFlag.TypeError)).toBe(false);

    setRouteFlag(message, MessageFlag.RouteServer);
    expect(isRouteFlag(message[4], MessageFlag.RouteClient)).toBe(false);
    expect(isRouteFlag(message[4], MessageFlag.RouteServer)).toBe(true);

    setRouteFlag(message, MessageFlag.RouteSourceDest);
    expect(isRouteFlag(message[4], MessageFlag.RouteSourceDest)).toBe(true);

    setRouteFlag(message, MessageFlag.RouteClient);
    expect(isRouteFlag(message[4], MessageFlag.RouteClient)).toBe(true);
    expect(isTypeFlag(message[4], MessageFlag.TypeAck)).toBe(true);
});

test('setTypeFlag and setContextFlag', () => {
    const message = frame(MessageFlag.RouteServer | MessageFlag.ContextNew | MessageFlag.TypeAck);
    expect(isRouteFlag(message[4], MessageFlag.RouteServer)).toBe(true);
    expect(isContextFlag(message[4], MessageFlag.ContextNew)).toBe(true);
    expect(isTypeFlag(message[4], MessageFlag.TypeAck)).toBe(true);

    setTypeFlag(message, MessageFlag.TypeChunk);
    expect(isTypeFlag(message[4], MessageFlag.TypeChunk)).toBe(true);
    expect(isRouteFlag(message[4], MessageFlag.RouteServer)).toBe(true);

    setContextFlag(message, MessageFlag.ContextEnd);
    expect(isContextFlag(message[4], MessageFlag.ContextEnd)).toBe(true);
    expect(isTypeFlag(message[4], MessageFlag.TypeChunk)).toBe(true);
});

test('hasContext', () => {
    expect(hasContext(MessageFlag.ContextNone)).toBe(false);
    expect(hasContext(MessageFlag.ContextNew)).toBe(false);
    expect(hasContext(MessageFlag.ContextExisting)).toBe(true);
    expect(hasContext(MessageFlag.ContextEnd)).toBe(true);
});

test('action', () => {
    class Controller {
        @rpc.action()
        myAction() {}
    }

    const module = new InjectorModule([Controller]);

    expect(getActions(Controller).has('myAction')).toBe(true);
    expect(module).toBeDefined();
});

test('dispatcher', () => {
    const dispatcher = new ContextDispatcher();

    let called = 0;
    const ids: number[] = [];
    for (let i = 0; i < 60000; i++) {
        const id = dispatcher.create(() => {
            called++;
        });
        ids.push(id);
    }

    const message = new Uint8Array();
    for (const id of ids) {
        dispatcher.dispatch(id, message);
    }
    expect(called).toBe(60000);
});

test('uint16', () => {
    const message = Buffer.allocUnsafe(4);
    writeUint16LE(message, 0, 1);
    expect(readUint16LE(message, 0)).toBe(1);

    writeUint16LE(message, 0, 126);
    expect(readUint16LE(message, 0)).toBe(126);

    writeUint16LE(message, 2, 20000);
    expect(readUint16LE(message, 0)).toBe(126);
    expect(readUint16LE(message, 2)).toBe(20000);
});

test('message - client - context - ack', () => {
    const message = frame(MessageFlag.RouteClient | MessageFlag.ContextExisting | MessageFlag.TypeAck);
    writeUint16LE(message, getContextIdOffset(message), 1);

    expect(isContextFlag(message[4], MessageFlag.ContextExisting)).toBe(true);
    expect(getContextId(message)).toBe(1);
    expect(isTypeFlag(message[4], MessageFlag.TypeAck)).toBe(true);
});

test('message - client - end context - ack', () => {
    const message = frame(MessageFlag.RouteClient | MessageFlag.ContextEnd | MessageFlag.TypeAck);
    writeUint16LE(message, getContextIdOffset(message), 1);

    expect(isContextFlag(message[4], MessageFlag.ContextEnd)).toBe(true);
    expect(getContextId(message)).toBe(1);
    expect(isTypeFlag(message[4], MessageFlag.TypeAck)).toBe(true);
});

test('message - client - no context - ack', () => {
    const message = frame(MessageFlag.RouteClient | MessageFlag.ContextNone | MessageFlag.TypeAck);
    expect(isContextFlag(message[4], MessageFlag.ContextNone)).toBe(true);
    expect(isTypeFlag(message[4], MessageFlag.TypeAck)).toBe(true);
});

test('message - direct route - context', () => {
    const message = frame(MessageFlag.RouteSourceDest | MessageFlag.ContextExisting | MessageFlag.TypeAction);
    writeUint16LE(message, getContextIdOffset(message), 7);
    expect(getContextId(message)).toBe(7);
    expect(isRouteFlag(message[4], MessageFlag.RouteSourceDest)).toBe(true);
});

test('action frame', () => {
    const serialize = (data: any, state: any) => {
        state.writer.writeByte(42);
    };
    const implicit = frameMemory().subarray(0, writeActionFrameTransient(300, 1234, serialize, []));
    expect(implicit[4]).toBe(MessageFlag.RouteClient | MessageFlag.ContextNew | MessageFlag.TypeAction);
    expect(getAction(implicit)).toBe(1234);
    expect(getActionOffset(implicit) + actionIdSize).toBe(getBodyOffset(implicit));
    expect(implicit[getBodyOffset(implicit)]).toBe(42);
    expect(implicit.byteLength).toBe(framePrefixSize + actionIdSize + 1);

    const explicit = frameMemory().subarray(0, writeActionFrameTransient(300, 1234, serialize, [], MessageFlag.ContextEnd));
    expect(getContextId(explicit)).toBe(300);
    expect(getAction(explicit)).toBe(1234);
    expect(explicit.byteLength).toBe(framePrefixSize + contextIdSize + actionIdSize + 1);
});

test('hello frame', () => {
    const size = writeHelloFrameTransient(0xaabbccdd);
    const hello = frameMemory().subarray(0, size);
    expect(hello.byteLength).toBe(10);
    expect(hello[0]).toBe(10);
    expect(isTypeFlag(hello[4], MessageFlag.TypeSchema)).toBe(true);
    expect(hello[5]).toBe(rpcProtocolVersion);
    expect(new DataView(hello.buffer, hello.byteOffset).getUint32(6, true)).toBe(0xaabbccdd);
});

test('hello reply frame', () => {
    const size = writeHelloReplyFrameTransient(rpcProtocolVersion, 7, new Uint8Array([1, 2, 3]));
    const reply = frameMemory().subarray(0, size);
    expect(new DataView(reply.buffer, reply.byteOffset).getUint32(0, true)).toBe(reply.byteLength);
    expect(isTypeFlag(reply[4], MessageFlag.TypeSchema)).toBe(true);
    expect(reply[5]).toBe(rpcProtocolVersion);
    expect([...reply.subarray(10)]).toEqual([1, 2, 3]);
});

test('channel subscription: one byte up to the limit, then a marker and 32 bit', () => {
    const encode = createParameterSerializer(typeOf<[number]>() as TypeTuple);
    const body = (subscription: number) => {
        writeChannelFrameTransient(1, MessageFlag.RouteClient, subscription, encode, [7]);
        return frameMemory();
    };

    const small = body(243);
    expect(small[7]).toBe(254);
    expect(readChannelSubscription(small, 7)).toBe(243);
    expect(channelBodyOffset(small, 7)).toBe(8);

    const large = body(244);
    expect(large[7]).toBe(0xff);
    expect(readChannelSubscription(large, 7)).toBe(244);
    expect(channelBodyOffset(large, 7)).toBe(12);
});

describe('message bodies', () => {
    interface Subscribe {
        id: number;
    }

    const hex = (buffer: Uint8Array) => Buffer.from(buffer).toString('hex');

    function frameOf<T>(id: number, body: T, type?: ReceiveType<T>): Uint8Array {
        const size = writeControlFrameTransient(id, MessageFlag.RouteClient, ControlOp.CollectionModel, getBodyCodec(resolveReceiveType(type)).serialize, body);
        return copyWrittenFrame(size);
    }

    function readOf<T>(frame: Uint8Array, type?: ReceiveType<T>): T {
        return getBodyCodec(resolveReceiveType(type)).deserialize(frame, getActionOffset(frame) + 1, frame.byteLength);
    }

    test('a control message is flag, context, type and a one byte number', () => {
        const size = writeControlIdFrameTransient(0x8001, MessageFlag.RouteClient, ControlOp.Subscribe, 0);
        expect(hex(frameMemory().subarray(0, size))).toBe('09000000' + '78' + '0180' + ControlOp.Subscribe.toString(16).padStart(2, '0') + '00');
    });

    test.each([0, 1, 126, 127, 255, -1, 1.5, 2147483648])('number %d keeps its value', id => {
        const frame = frameOf<Subscribe>(1, { id });
        expect(readOf<Subscribe>(frame)).toEqual({ id });
    });

    test('there are no field names on the wire', () => {
        interface Named {
            someVeryLongFieldName: string;
        }
        const frame = frameOf<Named>(1, { someVeryLongFieldName: 'x' });
        expect(Buffer.from(frame).includes('someVeryLongFieldName')).toBe(false);
        expect(readOf<Named>(frame)).toEqual({ someVeryLongFieldName: 'x' });
    });

    test('an optional property in the middle keeps the position of the following ones', () => {
        interface Gap {
            a?: string;
            b: string;
        }
        const frame = frameOf<Gap>(1, { b: 'x' });
        expect(readOf<Gap>(frame)).toEqual({ b: 'x' });
    });

    test('only optional properties and none given is still a body', () => {
        interface Empty {
            v?: Uint8Array;
        }
        expect(readOf<Empty>(frameOf<Empty>(1, {}))).toEqual({});
    });
});
