/*
 * Deepkit Framework
 * Copyright (C) 2021 Deepkit UG, Marc J. Schmidt
 *
 * This program is free software: you can redistribute it and/or modify
 * it under the terms of the MIT License.
 *
 * You should have received a copy of the MIT License along with this program.
 */

import { BsonStreamReader, deserializeBSONWithoutOptimiser, getBSONDeserializer, getBSONSerializer, getBSONSizer, Writer } from '@deepkit/bson';
import { bufferConcat, ClassType, createBuffer } from '@deepkit/core';
import { rpcChunk, RpcError, rpcError, RpcTypes } from './model.js';
import type { SingleProgress } from './progress.js';
import { deserialize, ReceiveType, ReflectionClass, resolveReceiveType, serialize, Type, typeOf, typeSettings } from '@deepkit/type';

export const enum RpcMessageRouteType {
    client = 0,
    server = 1,
    sourceDest = 2,
    peer = 3,
}

export interface BodyDecoder<T> {
    type: Type;

    (buffer: Uint8Array, offset: number): T;
}

export function createBodyDecoder<T>(type?: ReceiveType<T>): BodyDecoder<T> {
    type = resolveReceiveType(type);
    const deserialize = getBSONDeserializer<T>(undefined, type);
    const fn = (buffer: Uint8Array, offset: number) => {
        return deserialize(buffer, offset);
    };
    fn.type = type;
    return fn;
}

/*
 * A message is binary data and has the following structure:
 *
 * <size> <version> <id> <route>[<routeConfig>] <composite> <messageBody>
 *
 * size: uint32 //total message size
 * version: uint8
 * id: uint32 //message id
 *
 * //type of routing:
 * //0=client (context from client -> server), //client initiated a message context (message id created on client)
 * //1=server (context from server -> client), //server initiated a message context (message id created on server)
 * //2=sourceDest //route this message to a specific client using its client id
 * //4=peer //route this message to a client using a peer alias (the peer alias needs to be registered). replies will be rewritten to sourceDest
 *
 * //when route=0
 * routeConfig: not defined
 *
 * //when route=1
 * routeConfig: not defined
 *
 * //when route=2
 * routeConfig: <source><destination>, each 16 bytes, uuid v4
 *
 * //when route=3
 * routeConfig: <source><peerId> //where source=uuid v4, and peerId=ascii string (terminated by \0)
 *
 * composite: uint8 //when 1 then there are multiple messageBody, each prefixed with uint32 for their size
 *
 * composite=0 then messageBody=<type><body>:
 *   type: uint8 (256 types supported) //supported type
 *   body: BSON|any //arbitrary payload passed to type
 *
 * composite=1 then messageBody=<size><type><body>:
 *   size: uint32
 *   type: uint8 (256 types supported) //supported type
 *   body: BSON|any //arbitrary payload passed to type
 *
 */
export class RpcMessage {
    protected peerId?: string;
    protected source?: string;
    protected destination?: string;

    constructor(
        public id: number,
        public composite: boolean,
        public type: number,
        public routeType: RpcMessageRouteType,
        public bodyOffset: number = 0,
        public bodySize: number = 0,
        public buffer?: Uint8Array,
    ) {
    }

    debug() {
        return {
            type: this.type,
            typeString: RpcTypes[this.type],
            id: this.id,
            date: new Date,
            composite: this.composite,
            body: this.bodySize ? this.parseGenericBody() : undefined,
            messages: this.composite ? this.getBodies().map(message => {
                return {
                    id: message.id,
                    type: message.type,
                    date: new Date,
                    body: message.bodySize ? message.parseGenericBody() : undefined,
                };
            }) : [],
        };
    }

    getBuffer(): Uint8Array {
        if (!this.buffer) throw new RpcError('No buffer');
        return this.buffer;
    }

    getPeerId(): string {
        if (!this.buffer) throw new RpcError('No buffer');
        if (this.routeType !== RpcMessageRouteType.peer) throw new RpcError(`Message is not routed via peer, but ${this.routeType}`);
        if (this.peerId) return this.peerId;
        this.peerId = '';
        for (let offset = 10 + 16, c: number = this.buffer[offset]; c !== 0; offset++, c = this.buffer[offset]) {
            this.peerId += String.fromCharCode(c);
        }

        return this.peerId;
    }

    getSource(): Uint8Array {
        if (!this.buffer) throw new RpcError('No buffer');
        if (this.routeType !== RpcMessageRouteType.sourceDest && this.routeType !== RpcMessageRouteType.peer) throw new RpcError(`Message is not routed via sourceDest, but ${this.routeType}`);
        return this.buffer.subarray(4 + 1 + 4 + 1, 4 + 1 + 4 + 1 + 16);
    }

    getDestination(): Uint8Array {
        if (!this.buffer) throw new RpcError('No buffer');
        if (this.routeType !== RpcMessageRouteType.sourceDest) throw new RpcError(`Message is not routed via sourceDest, but ${this.routeType}`);
        return this.buffer.subarray(4 + 1 + 4 + 1 + 16, 4 + 1 + 4 + 1 + 16 + 16);
    }

    getError(): Error {
        if (!this.buffer) throw new RpcError('No buffer');
        const error = getBSONDeserializer<rpcError>()(this.buffer, this.bodyOffset);
        return rpcDecodeError(error);
    }

    isError(): boolean {
        return this.type === RpcTypes.Error;
    }

    parseGenericBody(): object {
        if (!this.bodySize) throw new RpcError('Message has no body');
        if (!this.buffer) throw new RpcError('No buffer');
        if (this.composite) throw new RpcError('Composite message can not be read directly');

        return deserializeBSONWithoutOptimiser(this.buffer, this.bodyOffset);
    }

    parseBody<T>(type?: ReceiveType<T>): T {
        if (!this.bodySize) throw new RpcError('Message has no body');
        if (!this.buffer) throw new RpcError('No buffer');
        if (this.composite) throw new RpcError('Composite message can not be read directly');
        // console.log('parseBody raw', deserializeBSONWithoutOptimiser(this.buffer, this.bodyOffset));
        return getBSONDeserializer<T>(undefined, type)(this.buffer, this.bodyOffset);
    }

    decodeBody<T>(decoder: BodyDecoder<T>): T {
        if (!this.bodySize) throw new RpcError('Message has no body');
        if (!this.buffer) throw new RpcError('No buffer');
        if (this.composite) throw new RpcError('Composite message can not be read directly');
        return decoder(this.buffer, this.bodyOffset);
    }

    getBodies(): RpcMessage[] {
        if (!this.composite) throw new RpcError('Not a composite message');

        const messages: RpcMessage[] = [];
        const buffer = this.getBuffer();
        const view = new DataView(buffer.buffer, buffer.byteOffset, buffer.byteLength);
        const totalSize = view.getUint32(0, true);
        let offset = this.bodyOffset;

        while (offset < totalSize) {
            const bodySize = view.getUint32(offset, true);
            offset += 4;
            const type = view.getUint8(offset++);

            messages.push(new RpcMessage(this.id, false, type, this.routeType, offset, bodySize, buffer));
            offset += bodySize;
        }

        return messages;
    }
}

export class ErroredRpcMessage extends RpcMessage {
    constructor(
        public id: number,
        public error: Error,
    ) {
        super(id, false, RpcTypes.Error, 0, 0, 0);
    }

    getError(): Error {
        return this.error;
    }
}

export function readBinaryRpcMessage(buffer: Uint8Array): RpcMessage {
    const view = new DataView(buffer.buffer, buffer.byteOffset, buffer.byteLength);
    const size = view.getUint32(0, true);
    if (size !== buffer.byteLength) {
        let message = `Message buffer size wrong. Message size=${size}, buffer size=${buffer.byteLength}.`;
        let hex = '';
        for (let i = 0; i < buffer.byteLength; i++) {
            hex += buffer[i].toString(16).padStart(2, '0');
        }
        message += ' Buffer hex: '
            + hex.substr(0, 500) + (hex.length > 500 ? '...' : '');
        throw new RpcError(message);
    }

    const id = view.getUint32(5, true);

    let offset = 9;
    const routeType = buffer[offset++];

    if (routeType === RpcMessageRouteType.peer) {
        offset += 16; //<source>
        while (buffer[offset++] !== 0) ; //feed until \0 byte
    } else if (routeType === RpcMessageRouteType.sourceDest) {
        offset += 16 + 16; //uuid is each 16 bytes
    }

    const composite = buffer[offset++] === 1;
    const type = buffer[offset++];

    return new RpcMessage(id, composite, type, routeType, offset, size - offset, buffer);
}

export interface RpcCreateMessageDef<T> {
    type: number;
    schema?: Type;
    body?: T;
}

export function createRpcCompositeMessage<T>(
    id: number,
    type: number,
    messages: RpcCreateMessageDef<any>[],
    routeType: RpcMessageRouteType.client | RpcMessageRouteType.server = RpcMessageRouteType.client,
): RpcMessageDefinition {
    return {
        id,
        type,
        routeType,
        composite: messages,
    };
}

export function serializeBinaryRpcCompositeMessage(message: RpcMessageDefinition): Uint8Array {
    if (!message.composite) throw new RpcError('No messages set');

    let bodySize = 0;
    for (const sub of message.composite) {
        bodySize += 4 + 1 + (sub.schema && sub.body ? getBSONSizer(undefined, sub.schema)(sub.body) : 0);
    }

    //<size> <version> <messageId> <routeType>[routeData] <isComposite> <type> <body...>
    const messageSize = 4 + 1 + 4 + 1 + 1 + 1 + bodySize;

    const writer = new Writer(createBuffer(messageSize));
    writer.writeUint32(messageSize);
    writer.writeByte(1); //version
    writer.writeUint32(message.id);

    writer.writeByte(message.routeType);
    writer.writeByte(1);
    writer.writeByte(message.type);

    for (const sub of message.composite) {
        writer.writeUint32(sub.schema && sub.body ? getBSONSizer(undefined, sub.schema)(sub.body) : 0);
        writer.writeByte(sub.type); //type

        if (sub.schema && sub.body) {
            //BSON object contain already their size at the beginning
            getBSONSerializer(undefined, sub.schema)(sub.body, { writer });
        }
    }

    return writer.buffer;
}

export function createRpcCompositeMessageSourceDest(
    id: number,
    source: Uint8Array,
    destination: Uint8Array,
    type: number,
    messages: RpcCreateMessageDef<any>[],
): RpcMessageDefinition {
    return {
        id,
        type,
        routeType: RpcMessageRouteType.sourceDest,
        composite: messages,
        source,
        destination,
    };
}

export function serializeBinaryRpcCompositeMessageSourceDest(message: RpcMessageDefinition): Uint8Array {
    if (!message.composite) throw new RpcError('No messages set');
    if (!message.source) throw new RpcError('No source set');
    if (!message.destination) throw new RpcError('No destination set');

    let bodySize = 0;
    for (const sub of message.composite) {
        bodySize += 4 + 1 + (sub.schema && sub.body ? getBSONSizer(undefined, sub.schema)(sub.body) : 0);
    }

    //<size> <version> <messageId> <routeType>[routeData] <composite> <type> <body...>
    const messageSize = 4 + 1 + 4 + 1 + (16 + 16) + 1 + 1 + bodySize;

    const writer = new Writer(createBuffer(messageSize));
    writer.writeUint32(messageSize);
    writer.writeByte(1); //version
    writer.writeUint32(message.id);

    writer.writeByte(RpcMessageRouteType.sourceDest);
    if (message.source.byteLength !== 16) throw new RpcError(`Source invalid byteLength of ${message.source.byteLength}`);
    if (message.destination.byteLength !== 16) throw new RpcError(`Destination invalid byteLength of ${message.destination.byteLength}`);
    writer.writeBuffer(message.source);
    writer.writeBuffer(message.destination);
    writer.writeByte(1); //composite=true
    writer.writeByte(message.type);

    for (const sub of message.composite) {
        writer.writeUint32(sub.schema && sub.body ? getBSONSizer(undefined, sub.schema)(sub.body) : 0);
        writer.writeByte(sub.type); //type

        if (sub.schema && sub.body) {
            //BSON object contain already their size at the beginning
            getBSONSerializer(undefined, sub.schema)(sub.body, { writer });
        }
    }

    return writer.buffer;
}

export interface RpcMessageDefinition {
    id: number;
    type: number;
    routeType: RpcMessageRouteType;
    composite?: RpcCreateMessageDef<any>[];
    peerId?: string;
    source?: Uint8Array;
    destination?: Uint8Array;
    body?: {
        type: Type;
        body: any;
    };
}

export function createRpcMessage<T>(
    id: number, type: number,
    body?: T,
    routeType: RpcMessageRouteType.client | RpcMessageRouteType.server = RpcMessageRouteType.client,
    schema?: ReceiveType<T>,
): RpcMessageDefinition {
    return {
        id,
        type,
        routeType,
        body: body && {
            type: resolveReceiveType(schema),
            body,
        },
    };

}

export function serializeBinaryRpcMessage(message: RpcMessageDefinition): Uint8Array {
    if (message.composite) {
        if (message.routeType === RpcMessageRouteType.sourceDest) {
            return serializeBinaryRpcCompositeMessageSourceDest(message);
        }
        return serializeBinaryRpcCompositeMessage(message);
    }

    if (message.routeType === RpcMessageRouteType.peer) {
        return serializeBinaryRpcMessagePeer(message);
    }

    if (message.routeType === RpcMessageRouteType.sourceDest) {
        return serializeBinaryRpcMessageSourceDest(message);
    }

    return serializeBinaryRpcMessageSingleBody(message);
}

export function serializeBinaryRpcMessageSingleBody(message: RpcMessageDefinition): Uint8Array {
    const bodySize = message.body ? getBSONSizer(undefined, message.body.type)(message.body.body) : 0;
    //<size> <version> <messageId> <routeType>[routeData] <composite> <type> <body...>
    const messageSize = 4 + 1 + 4 + 1 + 1 + 1 + bodySize;

    const writer = new Writer(createBuffer(messageSize));
    writer.writeUint32(messageSize);
    writer.writeByte(1); //version
    writer.writeUint32(message.id);

    writer.writeByte(message.routeType);
    writer.writeByte(0); //composite=false
    writer.writeByte(message.type);

    if (message.body) {
        const offset = writer.offset;
        const serializer = getBSONSerializer(undefined, message.body.type);
        serializer(message.body.body, { writer });
    }

    return writer.buffer;
}

export function createRpcMessagePeer<T>(
    id: number, type: number,
    source: Uint8Array,
    peerId: string,
    body?: T,
    schema?: ReceiveType<T>,
): RpcMessageDefinition {
    return {
        id,
        type,
        routeType: RpcMessageRouteType.peer,
        source,
        peerId,
        body: body && {
            type: resolveReceiveType(schema),
            body,
        },
    };
}

export function serializeBinaryRpcMessagePeer(message: RpcMessageDefinition): Uint8Array {
    if (!message.peerId) throw new RpcError('No peerId set');
    if (!message.source) throw new RpcError('No source set');

    const bodySize = message.body ? getBSONSizer(undefined, message.body.type)(message.body.body) : 0;
    //<size> <version> <messageId> <routeType>[routeData] <composite> <type> <body...>
    const messageSize = 4 + 1 + 4 + 1 + (16 + message.peerId.length + 1) + 1 + 1 + bodySize;

    const writer = new Writer(createBuffer(messageSize));
    writer.writeUint32(messageSize);
    writer.writeByte(1); //version
    writer.writeUint32(message.id);

    writer.writeByte(RpcMessageRouteType.peer);
    if (message.source.byteLength !== 16) throw new RpcError(`Source invalid byteLength of ${message.source.byteLength}`);
    writer.writeBuffer(message.source);
    writer.writeAsciiString(message.peerId);
    writer.writeNull();

    writer.writeByte(0); //composite=false
    writer.writeByte(message.type);

    if (message.body) getBSONSerializer(undefined, message.body.type)(message.body.body, { writer });

    return writer.buffer;
}

export function createRpcMessageSourceDest<T>(
    id: number,
    type: number,
    source: Uint8Array,
    destination: Uint8Array,
    body?: T,
    schema?: ReceiveType<T>,
): RpcMessageDefinition {
    return {
        id,
        type,
        routeType: RpcMessageRouteType.sourceDest,
        source,
        destination,
        body: body && {
            type: resolveReceiveType(schema),
            body,
        },
    };
}

export function serializeBinaryRpcMessageSourceDest(message: RpcMessageDefinition): Uint8Array {
    if (!message.source) throw new RpcError('No source set');
    if (!message.destination) throw new RpcError('No destination set');

    const bodySize = message.body ? getBSONSizer(undefined, message.body.type)(message.body.body) : 0;
    //<size> <version> <messageId> <routeType>[routeData] <composite> <type> <body...>
    const messageSize = 4 + 1 + 4 + 1 + (16 + 16) + 1 + 1 + bodySize;

    const writer = new Writer(createBuffer(messageSize));
    writer.writeUint32(messageSize);
    writer.writeByte(1); //version
    writer.writeUint32(message.id);

    writer.writeByte(RpcMessageRouteType.sourceDest);
    if (message.source.byteLength !== 16) throw new RpcError(`Source invalid byteLength of ${message.source.byteLength}`);
    if (message.destination.byteLength !== 16) throw new RpcError(`Destination invalid byteLength of ${message.destination.byteLength}`);
    writer.writeBuffer(message.source);
    writer.writeBuffer(message.destination);

    writer.writeByte(0); //composite=false
    writer.writeByte(message.type);

    if (message.body) getBSONSerializer(undefined, message.body.type)(message.body.body, { writer });

    return writer.buffer;
}

export function createRpcMessageSourceDestForBody<T>(
    id: number, type: number,
    source: Uint8Array,
    destination: Uint8Array,
    body: Uint8Array,
): Uint8Array {
    //<size> <version> <messageId> <routeType>[routeData] <composite> <type> <body...>
    const messageSize = 4 + 1 + 4 + 1 + (16 + 16) + 1 + 1 + body.byteLength;

    const writer = new Writer(createBuffer(messageSize));
    writer.writeUint32(messageSize);
    writer.writeByte(1); //version
    writer.writeUint32(id);

    writer.writeByte(RpcMessageRouteType.sourceDest);
    if (source.byteLength !== 16) throw new RpcError(`Source invalid byteLength of ${source.byteLength}`);
    if (destination.byteLength !== 16) throw new RpcError(`Destination invalid byteLength of ${destination.byteLength}`);
    writer.writeBuffer(source);
    writer.writeBuffer(destination);

    writer.writeByte(0); //composite=false
    writer.writeByte(type);

    writer.writeBuffer(body);

    return writer.buffer;
}

export class RpcBinaryMessageReader {
    protected chunks = new Map<number, { loaded: number, buffers: Uint8Array[], last: number }>();
    protected progress = new Map<number, SingleProgress>();
    protected chunkAcks = new Map<number, (active: boolean) => void>();
    protected streamReader = new BsonStreamReader(this.gotMessage.bind(this));
    protected lastCleanUpTimeout?: ReturnType<typeof setTimeout>;
    protected chunkTimeout = 60_000; // 60 seconds

    constructor(
        protected readonly onMessage: (response: RpcMessage) => void,
        protected readonly onChunk?: (id: number, abort: boolean) => void,
    ) {
    }

    cleanUp() {
        if (this.lastCleanUpTimeout) return;
        this.lastCleanUpTimeout = setTimeout(() => {
            this.lastCleanUpTimeout = undefined;

            const now = Date.now();
            for (const [id, chunks] of this.chunks.entries()) {
                if (now - chunks.last > this.chunkTimeout) {
                    // remove chunk
                    this.removeChunkAck(id, true);
                }
            }
        }, 5000);
    }

    public onChunkAck(id: number, callback: (active: boolean) => void) {
        this.chunkAcks.set(id, callback);
    }

    removeChunkAck(id: number, aborted = false) {
        this.chunkAcks.delete(id);
        if (aborted) {
            this.onMessage(new ErroredRpcMessage(id, new RpcError('Aborted')));
        }
    }

    public registerProgress(id: number, progress: SingleProgress) {
        this.progress.set(id, progress);

        progress.abortController.signal.addEventListener('abort', () => {
            this.onMessage(new ErroredRpcMessage(id, new RpcError('Aborted')));
            this.chunks.delete(id);
        });
    }

    public feed(buffer: Uint8Array, bytes?: number) {
        this.streamReader.feed(buffer, bytes);
    }

    protected gotMessage(buffer: Uint8Array) {
        const message = readBinaryRpcMessage(buffer);

        if (message.type === RpcTypes.ChunkAck) {
            const ack = this.chunkAcks.get(message.id);
            if (ack) ack(true);
        } else if (message.type === RpcTypes.Chunk) {
            const progress = this.progress.get(message.id);
            if (progress?.aborted) {
                this.progress.delete(message.id);
                this.chunks.delete(message.id);
                this.onChunk?.(message.id, false);
                return;
            }

            const body = message.parseBody<rpcChunk>();
            let chunks = this.chunks.get(message.id);
            if (!chunks) {
                if (body.seq > 0) return;
                chunks = { buffers: [], loaded: 0, last: Date.now() };
                this.chunks.set(message.id, chunks);
            }
            chunks.buffers.push(body.v);
            chunks.last = Date.now();
            chunks.loaded += body.v.byteLength;

            this.onChunk?.(message.id, true);
            progress?.set(body.total, chunks.loaded);
            this.cleanUp();

            if (chunks.loaded === body.total) {
                // We're done
                this.progress.delete(message.id);
                this.chunks.delete(message.id);
                this.chunkAcks.delete(message.id);
                const newBuffer = bufferConcat(chunks.buffers, body.total);
                const packedMessage = readBinaryRpcMessage(newBuffer);
                this.onMessage(packedMessage);
            }
        } else {
            const progress = this.progress.get(message.id);
            if (progress) {
                progress.set(buffer.byteLength, buffer.byteLength);
                this.progress.delete(message.id);
                this.chunks.delete(message.id);
                this.chunkAcks.delete(message.id);
            }
            const ack = this.chunkAcks.get(message.id);
            ack?.(false);

            this.onMessage(message);
        }
    }
}

export function readUint32LE(buffer: Uint8Array, offset: number = 0): number {
    return buffer[offset] + (buffer[offset + 1] * 2 ** 8) + (buffer[offset + 2] * 2 ** 16) + (buffer[offset + 3] * 2 ** 24);
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
            throw new RpcError(`Could not find an entity named ${error.classType} for an error thrown. ` +
                `Make sure the class is loaded and correctly defined using @entity.name(${JSON.stringify(error.classType)})`);
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

    if(error.stack === "") {
        e.stack = ""
    }

    return e;
}

export function createErrorMessage(id: number, error: Error | string, routeType: RpcMessageRouteType.client | RpcMessageRouteType.server): RpcMessageDefinition {
    const extracted = rpcEncodeError(error);

    return createRpcMessage(id, RpcTypes.Error, extracted, routeType, typeOf<rpcError>());
}
