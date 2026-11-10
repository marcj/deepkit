/*
 * Deepkit Framework
 * Copyright (C) 2021 Deepkit UG, Marc J. Schmidt
 *
 * This program is free software: you can redistribute it and/or modify
 * it under the terms of the MIT License.
 *
 * You should have received a copy of the MIT License along with this program.
 */
import {
    AutoBuffer,
    AutoBufferSerializer,
    AutoBufferSerializerState,
    BSONType,
    BaseParser,
    Writer,
    getBSONSerializer,
    seekElementSize,
} from '@deepkit/bson';
import { ClassType, bufferConcat, createBuffer } from '@deepkit/core';
import { FrameReader } from '@deepkit/net';
import {
    ReceiveType,
    ReflectionClass,
    ReflectionKind,
    Type,
    TypeObjectLiteral,
    deserialize,
    resolveReceiveType,
    serialize,
    typeOf,
    typeSettings,
} from '@deepkit/type';

import { BodySerializer, PreSerialized, createReturnDeserializer, createReturnSerializer } from './action.js';
import { RpcError } from './model.js';
import type { SingleProgress } from './progress.js';

/**
 * Every frame on the wire is:
 *
 * <size:uint32le> <flag:uint8> [routeData] [contextId:uint16le] [typeHeader] [body]
 *
 * size includes everything. flag has 2 bits route, 2 bits context and 3 bits type.
 *
 * routeData is <source:16><destination:16> for sourceDest, <source:16><peerId:ascii>\0 for peer and absent otherwise.
 * The context id exists for ContextExisting and ContextEnd. For ContextNew it is implicit: see TypeAction.
 *
 * - TypeAction: typeHeader <action:uint16le>, body is the arguments as positional values, see action.ts. This is the hot path.
 *   Replies can arrive in any order, so ids can't be mirrored by reusing freed ones. Instead both sides count: with ContextNew the
 *   id is the last one plus 1. ContextEnd carries an id and continues counting from it (the ids wrapped or one was skipped),
 *   ContextExisting carries an id and leaves the counting alone (chunked calls and calls to peers).
 * - TypeResult: body is the value, see action.ts. ContextEnd.
 * - TypeAck: no body. ContextEnd, the action returned nothing.
 * - TypeError: body is the positional values of an EncodedErrorTuple. ContextEnd.
 * - TypeSchema: handshake with the protocol version and the action ids, see writeHelloFrameTransient().
 * - TypeChannel: typeHeader <sub:uint8>. Up to ChannelSubType.Reserved it says what kind of stream the action returned,
 *   no body. Above that it is one value of the stream, read without creating anything: sub is the
 *   subscription plus Reserved + 1, or 0xFF followed by a uint32le subscription. The body is the value.
 *   With ContextNone it is a value the server pushes on the connection, sub is the push channel,
 *   see writePushFrameTransient.
 * - TypeControl: typeHeader <op:uint8>, see ControlOp, each with a layout of its own.
 * - TypeChunk: typeHeader <op:uint8>, see ChunkOp, a piece of a larger frame or the answer to one.
 */
export enum MessageFlag {
    RouteClient = 0b0000_00,
    RouteServer = 0b0000_01,
    RouteSourceDest = 0b0000_10,
    RoutePeer = 0b0000_11,

    ContextNone = 0b00_00,
    ContextNew = 0b01_00,
    ContextExisting = 0b10_00,
    ContextEnd = 0b11_00,

    TypeAck = 0b000_0000,
    TypeError = 0b001_0000,
    TypeChunk = 0b010_0000,
    TypeAction = 0b011_0000,
    TypeSchema = 0b100_0000,
    TypeResult = 0b101_0000,
    TypeChannel = 0b110_0000,
    TypeControl = 0b111_0000,
}

export enum ChannelSubType {
    None = 0,
    Observable,
    Subject,
    BehaviorSubject,
    ProgressTracker,
    ReadableStream,
    WritableStream,
    TransformStream,
    Signal,

    Reserved = 10,
}

/**
 * What a TypeControl frame does. The body is positional values, or a varint for the ones with a subscription or token.
 */
export enum ControlOp {
    // with a context of their own, answered with TypeAck, TypeResult or TypeError
    Ping,
    ClientId,
    Authenticate, //[token]
    PeerRegister, //[id]
    PeerDeregister, //[id]

    // caller -> callee, on the context of a stream
    Subscribe, //varint subscription
    Unsubscribe, //varint subscription
    Disconnect,
    SubjectUnsubscribe,
    SubjectPause,
    SubjectResume,
    ContextEnd,
    Detach, //varint token
    Attach, //varint token
    ProgressNext, //ProgressTrackerState[]
    CollectionUnsubscribe,
    CollectionModel, //the query model
    Drop, //varint token, without context

    // callee -> caller, on the context of a stream
    Complete, //varint subscription
    StreamError, //varint subscription, EncodedErrorTuple
    Collection, //[model, state, items]
    CollectionChange, //any number of <CollectionChangeKind:uint8><size:uint32le><value>

    // without context, the entities of this connection changed
    EntityPatch, //rpcEntityPatch
    EntityRemove, //rpcEntityRemove
}

export enum CollectionChangeKind {
    Model,
    Add,
    Remove,
    Update,
    Set,
    State,
    Sort,
}

export enum ChunkOp {
    Data, //<seq:uint32le><total:uint32le><bytes>
    Ack,
    Abort,
}

const channelValueBase = ChannelSubType.Reserved + 1;
const channelValueLong = 0xff;

export type RouteFlag =
    | MessageFlag.RouteClient
    | MessageFlag.RouteServer
    | MessageFlag.RouteSourceDest
    | MessageFlag.RoutePeer;
export type ContextFlag =
    | MessageFlag.ContextNone
    | MessageFlag.ContextNew
    | MessageFlag.ContextExisting
    | MessageFlag.ContextEnd;
export type TypeFlag =
    | MessageFlag.TypeAction
    | MessageFlag.TypeAck
    | MessageFlag.TypeChunk
    | MessageFlag.TypeError
    | MessageFlag.TypeSchema
    | MessageFlag.TypeResult
    | MessageFlag.TypeControl
    | MessageFlag.TypeChannel;

export const routeMask = 0b11;
export const contextMask = 0b1100;
export const typeMask = 0b111_0000;

export const framePrefixSize = 5;
export const contextIdSize = 2;
export const actionIdSize = 2;
const routeSourceDestSize = 16 + 16;

export const rpcProtocolVersion = 2;

/**
 * Context ids from here on are calls to the connection itself (see ControlOp) and schema requests. They are a range of
 * their own so that they don't disturb the implicit counting of TypeAction.
 */
export const connectionContextBase = 0xf000;

export function isRouteFlag(flags: number, route: RouteFlag): boolean {
    return (flags & routeMask) === route;
}

export function isContextFlag(flags: number, context: ContextFlag): boolean {
    return (flags & contextMask) === context;
}

/** Whether the frame carries a context id: ContextExisting or ContextEnd. */
export function hasContext(flags: number): boolean {
    return (flags & 0b1000) !== 0;
}

export function isTypeFlag(flags: number, type: TypeFlag): boolean {
    return (flags & typeMask) === type;
}

export function setRouteFlag(buffer: Uint8Array, route: RouteFlag, start: number = 0): void {
    buffer[start + 4] = (buffer[start + 4] & ~routeMask) | route;
}

export function setContextFlag(buffer: Uint8Array, context: ContextFlag, start: number = 0): void {
    buffer[start + 4] = (buffer[start + 4] & ~contextMask) | context;
}

export function setTypeFlag(buffer: Uint8Array, type: TypeFlag, start: number = 0): void {
    buffer[start + 4] = (buffer[start + 4] & ~typeMask) | type;
}

export function writeUint16LE(buffer: Uint8Array, offset: number, value: number): void {
    buffer[offset] = value & 0xff;
    buffer[offset + 1] = (value >> 8) & 0xff;
}

export function readUint16LE(buffer: Uint8Array, offset: number): number {
    return buffer[offset] + (buffer[offset + 1] << 8);
}

export function readUint32LE(buffer: Uint8Array, offset: number = 0): number {
    return buffer[offset] + buffer[offset + 1] * 2 ** 8 + buffer[offset + 2] * 2 ** 16 + buffer[offset + 3] * 2 ** 24;
}

/** The bytes that route data takes at the start of the frame at start. */
export function getRouteDataSize(buffer: Uint8Array, start: number = 0): number {
    const route = buffer[start + 4] & routeMask;
    if (route === MessageFlag.RouteSourceDest) return routeSourceDestSize;
    if (route === MessageFlag.RoutePeer) {
        let offset = start + framePrefixSize + 16;
        while (buffer[offset++] !== 0);
        return offset - start - framePrefixSize;
    }
    return 0;
}

export function getContextIdOffset(buffer: Uint8Array, start: number = 0): number {
    return start + framePrefixSize + getRouteDataSize(buffer, start);
}

export function getContextId(buffer: Uint8Array, start: number = 0): number {
    return readUint16LE(buffer, getContextIdOffset(buffer, start));
}

export function getActionOffset(buffer: Uint8Array, start: number = 0): number {
    const offset = getContextIdOffset(buffer, start);
    return hasContext(buffer[start + 4]) ? offset + contextIdSize : offset;
}

export function getAction(buffer: Uint8Array, start: number = 0): number {
    return readUint16LE(buffer, getActionOffset(buffer, start));
}

/** Offset of the body of a frame. For TypeChannel and TypeControl that is the offset of their type header. */
export function getBodyOffset(buffer: Uint8Array, start: number = 0): number {
    const offset = getActionOffset(buffer, start);
    return isTypeFlag(buffer[start + 4], MessageFlag.TypeAction) ? offset + actionIdSize : offset;
}

/** The peer a frame routed via peer goes to. */
export function getPeerId(buffer: Uint8Array, start: number = 0): string {
    let id = '';
    for (let offset = start + framePrefixSize + 16, c = buffer[offset]; c !== 0; offset++, c = buffer[offset]) {
        id += String.fromCharCode(c);
    }
    return id;
}

/** Copy of a frame that outlives the read buffer. A Buffer's own slice() would only be a view. */
export function copyFrame(buffer: Uint8Array, start: number, end: number): Uint8Array {
    const copy = createBuffer(end - start);
    copy.set(buffer.subarray(start, end));
    return copy;
}

export class RpcProtocolVersionError extends RpcError {}

/** The context id of a frame that has one, without route data. */
export function frameContextId(buffer: Uint8Array): number {
    return readUint16LE(buffer, framePrefixSize);
}

/** The context id of a frame, 0 when it has none. */
export function getFrameContext(buffer: Uint8Array, start: number = 0): number {
    return hasContext(buffer[start + 4]) ? getContextId(buffer, start) : 0;
}

/**
 * The one buffer every frame is written to, so nothing has to compute its size first.
 * Serialization is synchronous, so it can be shared by all connections.
 */
let messageBuffer = new AutoBuffer(0, 64 * 1024);

/** The largest buffer that is kept between frames. */
const maxRetainedMessageBuffer = 16 * 1024 * 1024;

function writeFrameInMessageBuffer(write: AutoBufferSerializer, data: any): number {
    messageBuffer.apply(write, data);
    return messageBuffer.size;
}

/**
 * The memory the frames are written to: a frame is the range 0 to the size returned by the write function.
 * Only valid until the next frame is written.
 */
export function frameMemory(): Uint8Array {
    return messageBuffer._buffer;
}

/** A copy of the frame that was just written, which stays valid after the next one is written. */
export function copyWrittenFrame(size: number): Uint8Array {
    return copyFrame(frameMemory(), 0, size);
}

/**
 * Has to be called when something still holds on to the memory of a frame.
 */
export function releaseMessageBuffer(): void {
    messageBuffer.dispose();
    messageBuffer = new AutoBuffer(0, 64 * 1024);
}

export function releaseMessageBufferIfLarge(): void {
    if (messageBuffer._buffer.byteLength > maxRetainedMessageBuffer) messageBuffer.releaseLarge();
}

type ValueSerializer = AutoBufferSerializer;

// Writing is synchronous, so one reused description of the frame being written is enough.
const frame = {
    id: 0,
    action: 0,
    flag: 0,
    op: 0,
    serialize: undefined as ValueSerializer | undefined,
    routeData: undefined as Uint8Array | undefined,
    schema: undefined as Uint8Array | undefined,
    version: 0,
    hash: 0,
    seq: 0,
    total: 0,
    bytes: undefined as Uint8Array | undefined,
    start: 0,
    end: 0,
    pre: undefined as PreSerialized | undefined,
    tuple: false,
    subscription: 0,
};

function writeFrameStart(writer: Writer): void {
    writer.writeUint32(0);
    writer.writeByte(frame.flag);
    if (frame.routeData !== undefined) writer.writeBuffer(frame.routeData);
    if ((frame.flag & 0b1000) !== 0) {
        writer.writeByte(frame.id & 0xff);
        writer.writeByte((frame.id >>> 8) & 0xff);
    }
}

function writeFrameEnd(writer: Writer): void {
    writer.writeDelayedSize(writer.offset, 0);
}

function writeVarint(writer: Writer, value: number): void {
    while (value >= 0x80) {
        writer.writeByte((value & 0x7f) | 0x80);
        value = Math.floor(value / 128);
    }
    writer.writeByte(value);
}

/** The value of the varint at the offset. */
export function readVarint(buffer: Uint8Array, offset: number): number {
    let value = 0;
    let multiplier = 1;
    for (;;) {
        const byte = buffer[offset++];
        value += (byte & 0x7f) * multiplier;
        if (byte < 0x80) return value;
        multiplier *= 128;
    }
}

/** The offset after the varint at the offset. */
export function varintEnd(buffer: Uint8Array, offset: number): number {
    while (buffer[offset++] >= 0x80);
    return offset;
}

const writeActionFrame: AutoBufferSerializer = (args: any, state: AutoBufferSerializerState) => {
    const writer = state.writer!;
    writeFrameStart(writer);
    writer.writeByte(frame.action & 0xff);
    writer.writeByte((frame.action >>> 8) & 0xff);
    frame.serialize!(args, state);
    writeFrameEnd(writer);
};

const writeBodyFrame: AutoBufferSerializer = (body: any, state: AutoBufferSerializerState) => {
    const writer = state.writer!;
    writeFrameStart(writer);
    frame.serialize!(body, state);
    writeFrameEnd(writer);
};

const writeEmptyFrame: AutoBufferSerializer = (body: any, state: AutoBufferSerializerState) => {
    const writer = state.writer!;
    writeFrameStart(writer);
    writeFrameEnd(writer);
};

const writeChannelAnnounceFrame: AutoBufferSerializer = (body: any, state: AutoBufferSerializerState) => {
    const writer = state.writer!;
    writeFrameStart(writer);
    writer.writeByte(frame.action);
    writeFrameEnd(writer);
};

const writeChannelFrame: AutoBufferSerializer = (body: any, state: AutoBufferSerializerState) => {
    const writer = state.writer!;
    writeFrameStart(writer);
    writeSubscription(writer, frame.action);
    frame.serialize!(body, state);
    writeFrameEnd(writer);
};

const writePushFrame: AutoBufferSerializer = (body: any, state: AutoBufferSerializerState) => {
    const writer = state.writer!;
    writeFrameStart(writer);
    writer.writeByte(frame.action);
    frame.serialize!(body, state);
    writeFrameEnd(writer);
};

const writeControlFrame: AutoBufferSerializer = (body: any, state: AutoBufferSerializerState) => {
    const writer = state.writer!;
    writeFrameStart(writer);
    writer.writeByte(frame.op);
    if (frame.serialize !== undefined) frame.serialize(body, state);
    writeFrameEnd(writer);
};

const writeControlIdFrame: AutoBufferSerializer = (value: number, state: AutoBufferSerializerState) => {
    const writer = state.writer!;
    writeFrameStart(writer);
    writer.writeByte(frame.op);
    writeVarint(writer, value);
    writeFrameEnd(writer);
};

const writeStreamErrorFrame: AutoBufferSerializer = (body: any, state: AutoBufferSerializerState) => {
    const writer = state.writer!;
    writeFrameStart(writer);
    writer.writeByte(ControlOp.StreamError);
    writeVarint(writer, frame.subscription);
    frame.serialize!(body, state);
    writeFrameEnd(writer);
};

const writeHelloFrame: AutoBufferSerializer = (body: any, state: AutoBufferSerializerState) => {
    const writer = state.writer!;
    writeFrameStart(writer);
    writer.writeByte(frame.version);
    writer.writeUint32(frame.hash);
    if (frame.schema !== undefined) writer.writeBuffer(frame.schema);
    writeFrameEnd(writer);
};

const writeChunkFrame: AutoBufferSerializer = (body: any, state: AutoBufferSerializerState) => {
    const writer = state.writer!;
    writeFrameStart(writer);
    writer.writeByte(ChunkOp.Data);
    writer.writeUint32(frame.seq);
    writer.writeUint32(frame.total);
    const bytes = frame.bytes!;
    if (writer.offset + frame.end - frame.start <= writer.buffer.byteLength) {
        writer.buffer.set(bytes.subarray(frame.start, frame.end), writer.offset);
    }
    writer.offset += frame.end - frame.start;
    writeFrameEnd(writer);
};

const writeChunkControlFrame: AutoBufferSerializer = (body: any, state: AutoBufferSerializerState) => {
    const writer = state.writer!;
    writeFrameStart(writer);
    writer.writeByte(frame.op);
    writeFrameEnd(writer);
};

/**
 * The element of a PreSerialized value is <type byte><"v\0"><value>, without the name it is what a body contains.
 * A tuple is positional in a body, so its array is taken apart into <type byte><value> of each member.
 */
const writePreSerializedFrame: AutoBufferSerializer = (body: any, state: AutoBufferSerializerState) => {
    const writer = state.writer!;
    writeFrameStart(writer);
    if (frame.action >= 0) writeSubscription(writer, frame.action);
    const element = frame.pre!.element;
    if (frame.tuple) {
        writeTupleMembers(writer, element);
    } else {
        writer.writeByte(element[0]);
        writer.writeBuffer(element, 3);
    }
    writeFrameEnd(writer);
};

function writeTupleMembers(writer: Writer, element: Uint8Array): void {
    if (element[0] !== BSONType.ARRAY)
        throw new RpcError('A PreSerialized value for a tuple needs to be serialized as tuple');
    const parser = new BaseParser(element, 7);
    const end = element.byteLength - 1;
    while (parser.offset < end) {
        const type = parser.eatByte();
        writer.writeByte(type);
        while (element[parser.offset++] !== 0);
        const start = parser.offset;
        seekElementSize(type, parser);
        for (let i = start; i < parser.offset; i++) writer.writeByte(element[i]);
    }
}

function writeSubscription(writer: Writer, subscription: number): void {
    if (subscription < channelValueLong - channelValueBase) {
        writer.writeByte(channelValueBase + subscription);
    } else {
        writer.writeByte(channelValueLong);
        writer.writeUint32(subscription);
    }
}

/** The offset of the value of a TypeChannel frame, given the offset of its sub byte. */
export function channelBodyOffset(buffer: Uint8Array, offset: number): number {
    return buffer[offset] !== channelValueLong ? offset + 1 : offset + 5;
}

/** The subscription of a TypeChannel frame that is a value. */
export function readChannelSubscription(buffer: Uint8Array, offset: number): number {
    const sub = buffer[offset];
    return sub !== channelValueLong ? sub - channelValueBase : readUint32LE(buffer, offset + 1);
}

/**
 * The frames are written into the shared buffer, see frameMemory. They return the size of the frame.
 */
export function writeActionFrameTransient(
    id: number,
    action: number,
    serialize: ValueSerializer,
    args: any[],
    context: ContextFlag = MessageFlag.ContextNew,
    route: RouteFlag = MessageFlag.RouteClient,
    routeData?: Uint8Array,
): number {
    frame.id = id;
    frame.action = action;
    frame.flag = route | context | MessageFlag.TypeAction;
    frame.serialize = serialize;
    frame.routeData = routeData;
    return writeFrameInMessageBuffer(writeActionFrame, args);
}

export function writeResultFrameTransient(
    id: number,
    route: RouteFlag,
    serialize: ValueSerializer,
    value: any,
    routeData?: Uint8Array,
): number {
    frame.id = id;
    frame.flag = route | MessageFlag.ContextEnd | MessageFlag.TypeResult;
    frame.serialize = serialize;
    frame.routeData = routeData;
    return writeFrameInMessageBuffer(writeBodyFrame, value);
}

export function writeChannelFrameTransient(
    id: number,
    route: RouteFlag,
    subscription: number,
    serialize: ValueSerializer,
    value: any,
    routeData?: Uint8Array,
): number {
    frame.id = id;
    frame.action = subscription;
    frame.flag = route | MessageFlag.ContextExisting | MessageFlag.TypeChannel;
    frame.serialize = serialize;
    frame.routeData = routeData;
    return writeFrameInMessageBuffer(writeChannelFrame, value);
}

export function writeChannelAnnounceFrameTransient(
    id: number,
    route: RouteFlag,
    kind: ChannelSubType,
    routeData?: Uint8Array,
): number {
    frame.id = id;
    frame.action = kind;
    frame.flag = route | MessageFlag.ContextExisting | MessageFlag.TypeChannel;
    frame.serialize = undefined;
    frame.routeData = routeData;
    return writeFrameInMessageBuffer(writeChannelAnnounceFrame, undefined);
}

/**
 * A value the server sends on the connection without the client having called anything for it, for protocols built on
 * RPC that push many small values. There is no stream to set up and no context: <size> <flag> <channel:uint8> <values>.
 * The frame is in the shared buffer, see frameMemory, so one write serves any number of connections with sendFrame.
 */
export function writePushFrameTransient(channel: number, serialize: ValueSerializer, values: any[]): number {
    frame.id = 0;
    frame.action = channel;
    frame.flag = MessageFlag.RouteClient | MessageFlag.ContextNone | MessageFlag.TypeChannel;
    frame.serialize = serialize;
    frame.routeData = undefined;
    return writeFrameInMessageBuffer(writePushFrame, values);
}

/** A control frame, with a body written by the given serializer, if any. */
export function writeControlFrameTransient(
    id: number,
    route: RouteFlag,
    op: ControlOp,
    serialize?: ValueSerializer,
    value?: any,
    routeData?: Uint8Array,
    context: ContextFlag = id === 0 ? MessageFlag.ContextNone : MessageFlag.ContextExisting,
): number {
    frame.id = id;
    frame.op = op;
    frame.flag = route | context | MessageFlag.TypeControl;
    frame.serialize = serialize;
    frame.routeData = routeData;
    return writeFrameInMessageBuffer(writeControlFrame, value);
}

/** A control frame whose body is a subscription or token. */
export function writeControlIdFrameTransient(
    id: number,
    route: RouteFlag,
    op: ControlOp,
    value: number,
    routeData?: Uint8Array,
): number {
    frame.id = id;
    frame.op = op;
    frame.flag = route | (id === 0 ? MessageFlag.ContextNone : MessageFlag.ContextExisting) | MessageFlag.TypeControl;
    frame.routeData = routeData;
    return writeFrameInMessageBuffer(writeControlIdFrame, value);
}

export type EncodedErrorTuple = [
    classType: string,
    properties: { [name: string]: any },
    stack: string,
    message: string,
];

function toErrorTuple(error: EncodedError): EncodedErrorTuple {
    return [error.classType, error.properties || {}, error.stack, error.message];
}

let errorTupleType: Type | undefined;
let errorTupleSerializer: BodySerializer | undefined;
let errorTupleDeserializer: ReturnType<typeof createReturnDeserializer> | undefined;

function serializeErrorTuple(): BodySerializer {
    return (errorTupleSerializer ||= createReturnSerializer((errorTupleType ||= typeOf<EncodedErrorTuple>())));
}

/** The error of a TypeError frame, at the offset of its body. */
export function readErrorTuple(buffer: Uint8Array, offset: number, end: number): EncodedError {
    errorTupleDeserializer ||= createReturnDeserializer((errorTupleType ||= typeOf<EncodedErrorTuple>()));
    return errorFromTuple(errorTupleDeserializer(buffer, offset, end));
}

export function errorFromTuple(error: EncodedErrorTuple): EncodedError {
    const properties = Object.keys(error[1]).length ? error[1] : undefined;
    return { classType: error[0], properties, stack: error[2], message: error[3] };
}

export function writeErrorFrameTransient(
    id: number,
    route: RouteFlag,
    error: EncodedError,
    routeData?: Uint8Array,
): number {
    frame.id = id;
    frame.flag = route | MessageFlag.ContextEnd | MessageFlag.TypeError;
    frame.serialize = serializeErrorTuple();
    frame.routeData = routeData;
    return writeFrameInMessageBuffer(writeBodyFrame, toErrorTuple(error));
}

/** The error of one subscription of a stream, or of the stream when it is a subject. */
export function writeStreamErrorFrameTransient(
    id: number,
    route: RouteFlag,
    subscription: number,
    error: EncodedError,
    routeData?: Uint8Array,
): number {
    frame.id = id;
    frame.flag = route | MessageFlag.ContextExisting | MessageFlag.TypeControl;
    frame.subscription = subscription;
    frame.serialize = serializeErrorTuple();
    frame.routeData = routeData;
    return writeFrameInMessageBuffer(writeStreamErrorFrame, toErrorTuple(error));
}

export function writeAckFrameTransient(id: number, route: RouteFlag, routeData?: Uint8Array): number {
    frame.id = id;
    frame.flag = route | MessageFlag.ContextEnd | MessageFlag.TypeAck;
    frame.serialize = undefined;
    frame.routeData = routeData;
    return writeFrameInMessageBuffer(writeEmptyFrame, undefined);
}

/** A result that was serialized once with preSerialize(). */
export function writePreSerializedResultFrameTransient(
    id: number,
    route: RouteFlag,
    value: PreSerialized,
    tuple: boolean = false,
    routeData?: Uint8Array,
): number {
    frame.id = id;
    frame.action = -1;
    frame.flag = route | MessageFlag.ContextEnd | MessageFlag.TypeResult;
    frame.pre = value;
    frame.tuple = tuple;
    frame.routeData = routeData;
    const size = writeFrameInMessageBuffer(writePreSerializedFrame, undefined);
    frame.pre = undefined;
    return size;
}

/** One value of an observable that was serialized once with preSerialize(). */
export function writePreSerializedChannelFrameTransient(
    id: number,
    route: RouteFlag,
    subscription: number,
    value: PreSerialized,
    tuple: boolean = false,
    routeData?: Uint8Array,
): number {
    frame.id = id;
    frame.action = subscription;
    frame.flag = route | MessageFlag.ContextExisting | MessageFlag.TypeChannel;
    frame.pre = value;
    frame.tuple = tuple;
    frame.routeData = routeData;
    const size = writeFrameInMessageBuffer(writePreSerializedFrame, undefined);
    frame.pre = undefined;
    return size;
}

/**
 * The first frame of a connection: <size> <flag> [routeData] [context] <version> <schemaHash:uint32le>
 *
 * Also how a controller of the other side or of a peer asks for its action schema, then with a route and a context.
 */
export function writeHelloFrameTransient(
    schemaHash: number,
    route: RouteFlag = MessageFlag.RouteClient,
    id: number = 0,
    routeData?: Uint8Array,
): number {
    frame.id = id;
    frame.flag = route | (id === 0 ? MessageFlag.ContextNone : MessageFlag.ContextExisting) | MessageFlag.TypeSchema;
    frame.routeData = routeData;
    frame.version = rpcProtocolVersion;
    frame.hash = schemaHash;
    frame.schema = undefined;
    return writeFrameInMessageBuffer(writeHelloFrame, undefined);
}

/**
 * <size> <flag> [routeData] [context] <version> <schemaHash:uint32le> [schema]
 * The schema is omitted when the other side already knows it.
 */
export function writeHelloReplyFrameTransient(
    version: number,
    schemaHash: number,
    schema?: Uint8Array,
    route: RouteFlag = MessageFlag.RouteClient,
    id: number = 0,
    routeData?: Uint8Array,
): number {
    frame.id = id;
    frame.flag = route | (id === 0 ? MessageFlag.ContextNone : MessageFlag.ContextExisting) | MessageFlag.TypeSchema;
    frame.routeData = routeData;
    frame.version = version;
    frame.hash = schemaHash;
    frame.schema = schema;
    const size = writeFrameInMessageBuffer(writeHelloFrame, undefined);
    frame.schema = undefined;
    return size;
}

/** The offset of the version of a TypeSchema frame. */
export function helloOffset(buffer: Uint8Array, start: number = 0): number {
    return hasContext(buffer[start + 4]) ? start + framePrefixSize + contextIdSize : start + framePrefixSize;
}

export function writeChunkFrameTransient(
    id: number,
    route: RouteFlag,
    seq: number,
    total: number,
    bytes: Uint8Array,
    start: number,
    end: number,
): number {
    frame.id = id;
    frame.flag = route | (id === 0 ? MessageFlag.ContextNone : MessageFlag.ContextExisting) | MessageFlag.TypeChunk;
    frame.routeData = undefined;
    frame.seq = seq;
    frame.total = total;
    frame.bytes = bytes;
    frame.start = start;
    frame.end = end;
    const size = writeFrameInMessageBuffer(writeChunkFrame, undefined);
    frame.bytes = undefined;
    return size;
}

export function writeChunkControlFrameTransient(id: number, route: RouteFlag, op: ChunkOp): number {
    frame.id = id;
    frame.flag = route | (id === 0 ? MessageFlag.ContextNone : MessageFlag.ContextExisting) | MessageFlag.TypeChunk;
    frame.routeData = undefined;
    frame.op = op;
    return writeFrameInMessageBuffer(writeChunkControlFrame, undefined);
}

const preSerializeWrapperTypes = new WeakMap<Type, TypeObjectLiteral>();

/** `{ v: type }`, so `v` is encoded exactly as it is inside a body. */
function preSerializeWrapperType(type: Type): TypeObjectLiteral {
    let wrapper = preSerializeWrapperTypes.get(type);
    if (!wrapper) {
        wrapper = { kind: ReflectionKind.objectLiteral, types: [] };
        wrapper.types.push({ kind: ReflectionKind.propertySignature, name: 'v', parent: wrapper, type });
        preSerializeWrapperTypes.set(type, wrapper);
    }
    return wrapper;
}

/**
 * Serializes `value` once, to be sent as the result of an action or as a value of an observable
 * without serializing it again, for example the same value to many connections.
 */
export function preSerialize<T>(value: T, type?: ReceiveType<T>): PreSerialized {
    const wrapper = preSerializeWrapperType(resolveReceiveType(type));
    const size = writeFrameInMessageBuffer(getBSONSerializer(undefined, wrapper), { v: value });
    //document layout: <uint32 size> <element "v"> <0x00>
    const element = copyFrame(frameMemory(), 4, size - 1);
    releaseMessageBufferIfLarge();
    return new PreSerialized(element);
}

function noopFrame(): void {}

const chunkKeySpace = 2 ** 32;

function chunkKey(id: number, route: number): number {
    return route * chunkKeySpace + id;
}

/**
 * Splits the byte stream into frames. Frames are passed on with no copy and nothing allocated: the owner sets
 * onRawFrame and decodes what it needs inside the call. Chunked frames are put together here.
 */
export class RpcBinaryMessageReader extends FrameReader {
    protected readonly headerSize = 4;
    protected chunks = new Map<number, { loaded: number; buffers: Uint8Array[]; last: number }>();
    protected progress = new Map<number, SingleProgress>();
    protected chunkAcks = new Map<number, (active: boolean) => void>();
    protected lastCleanUpTimeout?: ReturnType<typeof setTimeout>;
    protected chunkTimeout = 60_000; // 60 seconds

    /**
     * Receives every frame except chunks. Only valid during the call.
     */
    public onRawFrame?: (buffer: Uint8Array, start: number, end: number) => void;

    /** A transfer of the context was aborted. */
    public onAbort?: (id: number, error: Error) => void;

    constructor(protected readonly onChunk?: (id: number, abort: boolean, route: RouteFlag) => void) {
        super(noopFrame);
        this.onFrame = this.gotFrame.bind(this);
    }

    protected frameSize(buffer: Uint8Array, offset: number): number {
        return buffer[offset] | (buffer[offset + 1] << 8) | (buffer[offset + 2] << 16) | (buffer[offset + 3] << 24);
    }

    cleanUp() {
        if (this.lastCleanUpTimeout) return;
        this.lastCleanUpTimeout = setTimeout(() => {
            this.lastCleanUpTimeout = undefined;

            const now = Date.now();
            for (const [key, chunks] of this.chunks.entries()) {
                if (now - chunks.last > this.chunkTimeout) {
                    this.chunks.delete(key);
                    this.removeChunkAck(key % chunkKeySpace, true, Math.floor(key / chunkKeySpace) as RouteFlag);
                }
            }
        }, 5000);
    }

    public onChunkAck(id: number, callback: (active: boolean) => void, route: RouteFlag = MessageFlag.RouteClient) {
        this.chunkAcks.set(chunkKey(id, route), callback);
    }

    removeChunkAck(id: number, aborted = false, route: RouteFlag = MessageFlag.RouteClient) {
        this.chunkAcks.delete(chunkKey(id, route));
        if (aborted) this.onAbort?.(id, new RpcError('Aborted'));
    }

    public registerProgress(id: number, progress: SingleProgress) {
        const key = chunkKey(id, MessageFlag.RouteClient);
        this.progress.set(key, progress);

        progress.abortController.signal.addEventListener('abort', () => {
            this.onAbort?.(id, new RpcError('Aborted'));
            this.chunks.delete(key);
        });
    }

    public feed(buffer: Uint8Array, length: number = buffer.byteLength) {
        let offset = 0;
        if (this.tailLength > 0) {
            offset = this.fill(buffer, length);
            if (this.tailLength > 0) return;
        }

        while (length - offset >= 4) {
            const size =
                buffer[offset] | (buffer[offset + 1] << 8) | (buffer[offset + 2] << 16) | (buffer[offset + 3] << 24);
            if (size < framePrefixSize) throw new RpcError(`Invalid message size ${size}`);
            if (offset + size > length) break;
            this.gotFrame(buffer, offset, offset + size);
            offset += size;
        }

        if (offset < length) this.stash(buffer, offset, length);
    }

    protected gotFrame(buffer: Uint8Array, start: number, end: number): void {
        if ((buffer[start + 4] & typeMask) === MessageFlag.TypeChunk) {
            this.gotChunk(buffer, start, end);
            return;
        }

        if (this.progress.size > 0 || this.chunks.size > 0 || this.chunkAcks.size > 0) {
            this.trackReply(getFrameContext(buffer, start), (buffer[start + 4] & routeMask) as RouteFlag, end - start);
        }

        this.onRawFrame?.(buffer, start, end);
    }

    protected trackReply(id: number, route: RouteFlag, size: number): void {
        const key = chunkKey(id, route);
        const progress = this.progress.get(key);
        if (progress) {
            progress.set(size, size);
            this.progress.delete(key);
            this.chunks.delete(key);
            this.chunkAcks.delete(key);
        }
        this.chunkAcks.get(key)?.(false);
    }

    protected gotChunk(buffer: Uint8Array, start: number, end: number): void {
        const flag = buffer[start + 4];
        const route = (flag & routeMask) as RouteFlag;
        let offset = start + framePrefixSize;
        let id = 0;
        if (hasContext(flag)) {
            id = readUint16LE(buffer, offset);
            offset += contextIdSize;
        }
        const key = chunkKey(id, route);
        const op = buffer[offset++];

        if (op === ChunkOp.Ack) {
            this.chunkAcks.get(key)?.(true);
            return;
        }
        if (op === ChunkOp.Abort) {
            this.chunkAcks.get(key)?.(false);
            return;
        }

        const progress = this.progress.get(key);
        if (progress?.aborted) {
            this.progress.delete(key);
            this.chunks.delete(key);
            this.onChunk?.(id, false, route);
            return;
        }

        const seq = readUint32LE(buffer, offset);
        const total = readUint32LE(buffer, offset + 4);
        offset += 8;

        let chunks = this.chunks.get(key);
        if (!chunks) {
            if (seq > 0) return;
            chunks = { buffers: [], loaded: 0, last: Date.now() };
            this.chunks.set(key, chunks);
        }
        chunks.buffers.push(copyFrame(buffer, offset, end));
        chunks.last = Date.now();
        chunks.loaded += end - offset;

        this.onChunk?.(id, true, route);
        progress?.set(total, chunks.loaded);
        this.cleanUp();

        if (chunks.loaded === total) {
            this.progress.delete(key);
            this.chunks.delete(key);
            this.chunkAcks.delete(key);
            const whole = bufferConcat(chunks.buffers, total);
            this.gotFrame(whole, 0, whole.byteLength);
        }
    }
}

export interface EncodedError {
    classType: string;
    message: string;
    stack: string;
    properties?: { [name: string]: any };
}

export function rpcEncodeError(error: Error | string): EncodedError {
    let classType = '';
    let stack = '';
    let properties: { [name: string]: any } | undefined;

    if ('string' !== typeof error) {
        const schema = ReflectionClass.from(error['constructor'] as ClassType<typeof error>);
        stack = error.stack || '';
        if (schema.name) {
            classType = schema.name;
            if (schema.getProperties().length) {
                properties = serialize(error, undefined, undefined, undefined, schema.type);
            }
        }
    }

    return {
        classType,
        properties,
        stack,
        message: 'string' === typeof error ? error : error.message || '',
    };
}

export function rpcDecodeError(error: EncodedError): Error {
    if (error.classType) {
        const entity = typeSettings.registeredEntities[error.classType];
        if (!entity) {
            throw new RpcError(
                `Could not find an entity named ${error.classType} for an error thrown. ` +
                    `Make sure the class is loaded and correctly defined using @entity.name(${JSON.stringify(error.classType)})`,
            );
        }
        const schema = ReflectionClass.from(entity);
        if (error.properties) {
            const e = deserialize(error.properties, undefined, undefined, undefined, schema.type) as Error;
            e.stack = error.stack + '\nat ___SERVER___';
            return e;
        }

        const classType = schema.getClassType()! as ClassType<Error>;
        return new classType(error.message);
    }

    const e = new RpcError(error.message);
    e.stack = error.stack + '\nat ___SERVER___';

    if (error.stack === '') {
        e.stack = '';
    }

    return e;
}
