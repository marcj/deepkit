/*
 * Deepkit Framework
 * Copyright (C) 2021 Deepkit UG, Marc J. Schmidt
 *
 * This program is free software: you can redistribute it and/or modify
 * it under the terms of the MIT License.
 *
 * You should have received a copy of the MIT License along with this program.
 */
import { ClassType, arrayRemoveItem, bufferToString, ensureError, getClassName } from '@deepkit/core';
import {
    DataEvent,
    EventDispatcher,
    EventDispatcherUnsubscribe,
    EventListenerCallback,
    EventToken,
} from '@deepkit/event';
import { InjectorContext, InjectorModule, NormalizedProvider, Resolver } from '@deepkit/injector';
import { Logger, LoggerInterface } from '@deepkit/logger';
import { SequentialContextDispatcher } from '@deepkit/net';
import { TypeTuple, serialize, serializeType, stringifyUuid, typeOf, writeUuid } from '@deepkit/type';

import {
    ActionDispatcher,
    anyParametersType,
    anyType,
    createParameterDeserializer,
    createReturnSerializer,
    getBodyCodec,
} from '../action.js';
import { RpcActionClient, RpcControllerState, RpcFastHost, createRemoteController } from '../client/action.js';
import { RemoteController } from '../client/client.js';
import { RpcAction, rpcClass } from '../decorators.js';
import { ParsedSchemaMapping, parseSchemaMapping, schemaMapping } from '../encoders.js';
import { RpcAuthEventStart, onRpcAuth, onRpcConnection, onRpcConnectionClose } from '../events.js';
import {
    AuthenticationError,
    ControllerDefinition,
    ForwardedRpcStats,
    RpcError,
    RpcStats,
    RpcTransportStats,
    rpcEntityPatch,
    rpcEntityRemove,
} from '../model.js';
import { SingleProgress } from '../progress.js';
import {
    ChunkOp,
    ControlOp,
    MessageFlag,
    RouteFlag,
    RpcBinaryMessageReader,
    connectionContextBase,
    copyFrame,
    frameMemory,
    getContextIdOffset,
    getFrameContext,
    getPeerId,
    hasContext,
    helloOffset,
    readUint16LE,
    readUint32LE,
    releaseMessageBuffer,
    releaseMessageBufferIfLarge,
    routeMask,
    rpcEncodeError,
    rpcProtocolVersion,
    typeMask,
    writeAckFrameTransient,
    writeChunkControlFrameTransient,
    writeControlFrameTransient,
    writeErrorFrameTransient,
    writeHelloFrameTransient,
    writeHelloReplyFrameTransient,
    writeResultFrameTransient,
} from '../protocol.js';
import {
    RpcFrameSender,
    TransportBinaryMessageChunkWriter,
    TransportConnection,
    TransportOptions,
    createFrameSender,
} from '../transport.js';
import { ActionTypes, RpcServerAction, loadActionTypes } from './action.js';
import { RpcHttpRequest, RpcHttpResponse } from './http.js';
import { RpcControllerAccess, RpcKernelSecurity, SessionState } from './security.js';

type FrameHandler = (buffer: Uint8Array, start: number, end: number) => void;

const readOneValue = createParameterDeserializer(typeOf<[value: any]>() as TypeTuple);
const writeClientId = createReturnSerializer(typeOf<Uint8Array>());
const writeUsername = createReturnSerializer(typeOf<string>());

/**
 * This is a reference implementation and only works in a single process.
 * A real-life implementation would use an external message-bus, like Redis & co.
 */
export class RpcPeerExchange {
    protected registeredPeers = new Map<string, TransportConnection>();

    async isRegistered(id: string): Promise<boolean> {
        return this.registeredPeers.has(id);
    }

    async deregister(id: string | Uint8Array): Promise<void> {
        this.registeredPeers.delete('string' === typeof id ? id : stringifyUuid(id));
    }

    register(id: string | Uint8Array, writer: TransportConnection): void {
        this.registeredPeers.set('string' === typeof id ? id : stringifyUuid(id), writer);
    }

    /** Sends a whole frame on to where its route data says, nothing of it is read. */
    redirect(frame: Uint8Array) {
        const route = frame[4] & routeMask;
        let target: string;
        if (route === MessageFlag.RoutePeer) {
            target = getPeerId(frame);
        } else if (route === MessageFlag.RouteSourceDest) {
            //in this implementation we have to stringify it first, since v8 can not index Uint8Arrays
            target = stringifyUuid(frame.subarray(21, 37));
        } else {
            return;
        }
        const writer = this.registeredPeers.get(target);
        //we silently ignore when it's unknown, as a pub/sub would do as well
        if (writer?.writeBinary) writer.writeBinary(frame);
    }
}

export abstract class RpcKernelBaseConnection implements RpcFastHost {
    public sessionState = new SessionState();

    protected reader = new RpcBinaryMessageReader((id: number, active: boolean, route: RouteFlag) => {
        const frameSize = writeChunkControlFrameTransient(id, route, active ? ChunkOp.Ack : ChunkOp.Abort);
        this.sendFrame(frameMemory(), frameSize);
    });

    /** The calls this side made to the other side (server calling client). */
    protected contexts = new SequentialContextDispatcher<FrameHandler>(connectionContextBase - 1);

    /**
     * Statistics about the server->client communication.
     */
    public clientStats: RpcStats = new RpcStats();

    /**
     * When the server wants to execute an action on the client, it uses the actionClient.
     */
    protected actionClient: RpcActionClient = new RpcActionClient();

    protected id: Uint8Array = writeUuid(new Uint8Array(16));

    public transportOptions: TransportOptions = new TransportOptions();
    protected binaryChunkWriter = new TransportBinaryMessageChunkWriter(this.reader, this.transportOptions);

    protected frameSender?: RpcFrameSender;

    protected timeoutTimers: any[] = [];
    public readonly onClose: Promise<void>;
    protected onCloseResolve?: Function;
    public closed: boolean = false;

    /** The route data frames of this connection need, set when it answers a peer. */
    public routeData?: Uint8Array;

    /** The actions of the other side, delivered when the first one is called. */
    protected remoteSchema?: ParsedSchemaMapping;
    protected remoteSchemaEpoch: number = 0;
    protected remoteSchemaRequest?: { promise: Promise<void>; resolve: () => void };

    constructor(
        public stats: RpcStats,
        protected logger: Logger,
        public transportConnection: TransportConnection,
        protected connections: RpcKernelConnections,
        protected injector: InjectorContext,
        protected eventDispatcher: EventDispatcher,
    ) {
        this.stats.increase('connections', 1);
        this.stats.increase('totalConnections', 1);
        this.frameSender = createFrameSender(
            transportConnection,
            this.binaryChunkWriter,
            this.transportOptions,
            this.stats,
        );
        this.reader.onRawFrame = this.onFrame.bind(this);
        this.actionClient.fastHost = this;

        this.connections.connections.push(this);
        this.onClose = new Promise(resolve => {
            this.onCloseResolve = resolve;
        });
    }

    /**
     * Sends a frame. Valid only for transports with a binary connection.
     */
    sendFrame(buffer: Uint8Array, size: number, progress?: SingleProgress): void {
        if (!this.frameSender) throw new RpcError('Transport does not support binary messages');
        this.frameSender(buffer, size, progress);
    }

    get routeFlag(): RouteFlag {
        return MessageFlag.RouteClient;
    }

    /** Tells the client entities changed. */
    sendEntityPatch(patch: rpcEntityPatch): void {
        const codec = getBodyCodec(typeOf<rpcEntityPatch>());
        const frameSize = writeControlFrameTransient(
            0,
            this.routeFlag,
            ControlOp.EntityPatch,
            codec.serialize,
            patch,
            this.routeData,
        );
        this.sendFrame(frameMemory(), frameSize);
    }

    sendEntityRemove(remove: rpcEntityRemove): void {
        const codec = getBodyCodec(typeOf<rpcEntityRemove>());
        const frameSize = writeControlFrameTransient(
            0,
            this.routeFlag,
            ControlOp.EntityRemove,
            codec.serialize,
            remove,
            this.routeData,
        );
        this.sendFrame(frameMemory(), frameSize);
    }

    clientAddress(): string | undefined {
        return this.transportConnection.clientAddress ? this.transportConnection.clientAddress() : undefined;
    }

    /**
     * Creates a regular timer using setTimeout() and automatically cancel it once the connection breaks or server stops.
     */
    public setTimeout(cb: () => void, timeout: number): any {
        const timer = setTimeout(() => {
            cb();
            arrayRemoveItem(this.timeoutTimers, timer);
        }, timeout);
        this.timeoutTimers.push(timer);
        return timer;
    }

    public close(reason: string | Error = 'closed'): void {
        if (this.closed) return;

        this.closed = true;
        this.actionClient.onDisconnect();
        this.contexts = new SequentialContextDispatcher<FrameHandler>(connectionContextBase - 1);
        this.remoteSchemaRequest?.resolve();
        this.remoteSchemaRequest = undefined;
        this.stats.increase('connections', -1);
        this.eventDispatcher.dispatch(
            onRpcConnectionClose,
            () => ({
                reason,
                context: { connection: this, injector: this.injector },
            }),
            this.injector,
        );
        for (const timeout of this.timeoutTimers) clearTimeout(timeout);
        if (this.onCloseResolve) this.onCloseResolve();
        arrayRemoveItem(this.connections.connections, this);
        this.transportConnection.close();
    }

    public feed(buffer: Uint8Array, bytes?: number): void {
        this.stats.increase('incomingBytes', bytes ?? buffer.byteLength);
        this.reader.feed(buffer, bytes);
    }

    /** A frame from an already split up stream. The buffer is only valid during this call. */
    public feedFrame(buffer: Uint8Array, start: number, end: number): void {
        this.onFrame(buffer, start, end);
    }

    /**
     * Receives all frames that are not chunks. The buffer is only valid during this call.
     */
    protected onFrame(buffer: Uint8Array, start: number, end: number): void {
        const flag = buffer[start + 4];
        if ((flag & typeMask) !== MessageFlag.TypeSchema) return;
        if ((flag & routeMask) === MessageFlag.RouteServer && this.routeFlag !== MessageFlag.RouteServer) {
            this.onRemoteSchema(buffer, start, end);
            return;
        }
        this.onHello(buffer, start);
    }

    protected getSchema(): { message: Uint8Array; hash: number } | undefined {
        return undefined;
    }

    /** The handshake is not a message of the application and does not count in the statistics. */
    protected sendHelloFrame(size: number): void {
        const socket = this.transportConnection.binarySocket;
        if (socket?.writeRange) {
            socket.writeRange(frameMemory(), 0, size);
            // node holds on to a large hello it could not write at once, the next frame must not overwrite it
            if (socket.writableLength > 0) releaseMessageBuffer();
            else releaseMessageBufferIfLarge();
        } else if (this.transportConnection.writeBinary)
            this.transportConnection.writeBinary(copyFrame(frameMemory(), 0, size));
    }

    protected onHello(buffer: Uint8Array, start: number): void {
        const offset = helloOffset(buffer, start);
        const version = buffer[offset];
        const id = getFrameContext(buffer, start);
        const route = this.routeFlag;
        if (version !== rpcProtocolVersion) {
            this.sendHelloFrame(
                writeHelloReplyFrameTransient(rpcProtocolVersion, 0, undefined, route, id, this.routeData),
            );
            this.close(`RPC client uses protocol version ${version}, the server ${rpcProtocolVersion}`);
            return;
        }

        const schema = this.getSchema();
        const knownHash = readUint32LE(buffer, offset + 1);
        const known = !schema || knownHash === schema.hash;
        this.sendHelloFrame(
            writeHelloReplyFrameTransient(
                rpcProtocolVersion,
                schema ? schema.hash : 0,
                known ? undefined : schema.message,
                route,
                id,
                this.routeData,
            ),
        );
    }

    /** The answer of the other side to the question for its actions. */
    protected onRemoteSchema(buffer: Uint8Array, start: number, end: number): void {
        const offset = helloOffset(buffer, start) + 5;
        this.remoteSchema = end > offset ? parseSchemaMapping(schemaMapping.decode(buffer, offset)) : {};
        this.remoteSchemaEpoch++;
        this.remoteSchemaRequest?.resolve();
        this.remoteSchemaRequest = undefined;
    }

    getSchemaMapping(): ParsedSchemaMapping | undefined {
        return this.remoteSchema;
    }

    getSchemaEpoch(): number {
        return this.remoteSchemaEpoch;
    }

    isActionReady(): boolean {
        return this.remoteSchema !== undefined;
    }

    getContexts(): SequentialContextDispatcher<FrameHandler> {
        return this.contexts;
    }

    getChunkSize(): number {
        return this.transportOptions.chunkSize;
    }

    sendActionFrame(buffer: Uint8Array, size: number, progress?: SingleProgress): void {
        this.sendFrame(buffer, size, progress);
    }

    isObserved(): boolean {
        return false;
    }

    emitEvent(event: any): void {}

    /** The other side may have registered controllers since it was last asked. */
    refreshSchema(): Promise<unknown> {
        this.remoteSchema = undefined;
        return this.connectForAction();
    }

    connectForAction(): Promise<unknown> {
        if (this.remoteSchema) return Promise.resolve();
        if (this.remoteSchemaRequest) return this.remoteSchemaRequest.promise;
        let resolve!: () => void;
        const promise = new Promise<void>(r => (resolve = r));
        this.remoteSchemaRequest = { promise, resolve };
        const frameSize = writeHelloFrameTransient(0, MessageFlag.RouteServer);
        this.sendFrame(frameMemory(), frameSize);
        return promise;
    }

    hasBinaryTransport(): boolean {
        return true;
    }

    currentConnectionId(): number {
        return 0;
    }

    getRoute(): RouteFlag {
        return MessageFlag.RouteServer;
    }

    onRequest(basePath: string, request: RpcHttpRequest, response: RpcHttpResponse): void | Promise<void> {
        throw new RpcError('Not supported');
    }

    public controller<T>(
        nameOrDefinition: string | ControllerDefinition<T>,
        timeoutInSeconds = 60,
    ): RemoteController<T> {
        const controller = new RpcControllerState(
            'string' === typeof nameOrDefinition ? nameOrDefinition : nameOrDefinition.path,
        );

        return createRemoteController<RemoteController<T>>(this.actionClient, controller, {});
    }
}

export class RpcKernelConnections {
    public connections: RpcKernelBaseConnection[] = [];

    public stats: RpcTransportStats = new RpcTransportStats();
}

export interface RpcCacheAction {
    controller: RpcControllerAccess;
    fn: Function;
    types: ActionTypes;
    action: RpcAction;
    resolver: Resolver<any>;
    label: string; //controller.action
}

export class RpcCache {
    actionsTypes: { [id: string]: ActionTypes } = {};
    actions: { [id: string]: RpcCacheAction } = {};
}

export class RpcKernelConnection extends RpcKernelBaseConnection {
    public myPeerId?: string;
    protected actionHandler = new RpcServerAction(
        this.stats,
        this.cache,
        this,
        this.controllers,
        this.injector,
        this.eventDispatcher,
        this.security,
        this.sessionState,
        this.logger,
        this.actionDispatcher,
    );

    public routeType: MessageFlag.RouteClient | MessageFlag.RouteServer = MessageFlag.RouteClient;
    /** The id of the next action call that doesn't carry one, see TypeAction. */
    protected nextContext: number = 1;
    protected context: { connection: RpcKernelBaseConnection; injector: InjectorContext } = {
        connection: this,
        injector: this.injector,
    };

    constructor(
        stats: RpcStats,
        logger: Logger,
        transport: TransportConnection,
        connections: RpcKernelConnections,
        injector: InjectorContext,
        eventDispatcher: EventDispatcher,
        protected cache: RpcCache,
        protected controllers: Map<string, { controller: ClassType; module?: InjectorModule }>,
        protected security = new RpcKernelSecurity(),
        protected peerExchange: RpcPeerExchange,
        protected actionDispatcher?: ActionDispatcher,
    ) {
        super(stats, logger, transport, connections, injector, eventDispatcher);
        this.onClose.then(async () => {
            try {
                await this.peerExchange.deregister(this.id);
                await this.actionHandler.onClose();
            } catch (e) {
                logger.error('Could no deregister/action close: ' + e);
            }
        });
        //register the current client so it can receive messages
        this.peerExchange.register(this.id, this.transportConnection);
    }

    public close(): void {
        super.close();
    }

    get routeFlag(): RouteFlag {
        return this.routeData ? MessageFlag.RouteSourceDest : this.routeType;
    }

    protected getSchema() {
        const dispatcher = this.actionDispatcher;
        dispatcher?.rebuild?.();
        return dispatcher ? { message: dispatcher.schemaMessage, hash: dispatcher.schemaHash } : undefined;
    }

    protected onFrame(buffer: Uint8Array, start: number, end: number): void {
        const flag = buffer[start + 4];
        const route = flag & routeMask;
        if (route === MessageFlag.RoutePeer || route === MessageFlag.RouteSourceDest) {
            this.redirect(copyFrame(buffer, start, end), route);
            return;
        }

        const type = flag & typeMask;
        if (type === MessageFlag.TypeSchema) {
            super.onFrame(buffer, start, end);
            return;
        }

        if (route === MessageFlag.RouteServer && this.routeType !== MessageFlag.RouteServer) {
            //the reply to something the server asked the client
            this.stats.addIncoming();
            if (hasContext(flag)) this.contexts.get(readUint16LE(buffer, start + 5))?.(buffer, start, end);
            return;
        }

        if (type === MessageFlag.TypeAction) {
            this.stats.addIncoming();
            const context = flag & 0b1100;
            let id: number;
            let bodyStart = start + 5;
            if (context === MessageFlag.ContextNew) {
                id = this.nextContext++;
            } else {
                id = readUint16LE(buffer, bodyStart);
                bodyStart += 2;
                if (context === MessageFlag.ContextEnd) this.nextContext = id + 1;
            }
            const actionId = readUint16LE(buffer, bodyStart);
            try {
                this.actionHandler.execute(buffer, id, actionId, bodyStart + 2, end);
            } catch (error: any) {
                this.sendError(id, this.security.transformError(error));
            }
            return;
        }

        if (type === MessageFlag.TypeControl) {
            this.stats.increase('incoming', 1);
            let offset = start + 5;
            let id = 0;
            if (hasContext(flag)) {
                id = readUint16LE(buffer, offset);
                offset += 2;
            }
            const op = buffer[offset++] as ControlOp;
            try {
                if (op <= ControlOp.PeerDeregister) this.onSystem(op, id, buffer, offset, end);
                else this.actionHandler.handleControl(op, id, buffer, offset, end);
            } catch (error: any) {
                if (id) this.sendError(id, this.security.transformError(error));
                else this.logger.error('RPC control message failed', error);
            }
        }
    }

    protected sendAck(id: number): void {
        const frameSize = writeAckFrameTransient(id, this.routeFlag, this.routeData);
        this.sendFrame(frameMemory(), frameSize);
    }

    protected sendError(id: number, error: Error | string): void {
        const frameSize = writeErrorFrameTransient(id, this.routeFlag, rpcEncodeError(error), this.routeData);
        this.sendFrame(frameMemory(), frameSize);
    }

    /** A frame on its way to a peer, or from a peer on its way back. */
    protected async redirect(frame: Uint8Array, route: number): Promise<void> {
        if (route === MessageFlag.RoutePeer) {
            const peerId = getPeerId(frame);
            if (!(await this.security.isAllowedToSendToPeer(this.sessionState.getSession(), peerId))) {
                if (hasContext(frame[4])) {
                    this.sendError(readUint16LE(frame, getContextIdOffset(frame)), new RpcError('Access denied'));
                }
                return;
            }
        }
        this.peerExchange.redirect(frame);
    }

    protected onSystem(op: ControlOp, id: number, buffer: Uint8Array, offset: number, end: number): void {
        switch (op) {
            case ControlOp.Ping:
                return this.sendAck(id);
            case ControlOp.ClientId: {
                // the size first: writing a small frame after a large one switches the frame memory
                const size = writeResultFrameTransient(id, this.routeFlag, writeClientId, this.id, this.routeData);
                return this.sendFrame(frameMemory(), size);
            }
            case ControlOp.Authenticate: {
                const token = readOneValue(buffer, offset, end)[0];
                this.authenticate(token).then(
                    username => {
                        const size = writeResultFrameTransient(
                            id,
                            this.routeFlag,
                            writeUsername,
                            username,
                            this.routeData,
                        );
                        this.sendFrame(frameMemory(), size);
                    },
                    error => this.sendError(id, this.security.transformError(error)),
                );
                return;
            }
            case ControlOp.PeerRegister: {
                this.registerAsPeer(readOneValue(buffer, offset, end)[0] as string).then(
                    () => this.sendAck(id),
                    error => this.sendError(id, error),
                );
                return;
            }
            case ControlOp.PeerDeregister: {
                this.deregisterAsPeer(readOneValue(buffer, offset, end)[0] as string).then(
                    () => this.sendAck(id),
                    error => this.sendError(id, error),
                );
                return;
            }
        }
    }

    async onRequest(basePath: string, request: RpcHttpRequest, response: RpcHttpResponse) {
        if (!basePath.endsWith('/')) basePath += '/';
        if (!basePath.startsWith('/')) basePath = '/' + basePath;
        const url = new URL(request.url || '', 'http://localhost/' + basePath);

        const urlPath = url.pathname.substring(basePath.length);
        const lastSlash = urlPath.lastIndexOf('/');
        const controller = urlPath.substring(0, lastSlash);
        let method = decodeURIComponent(urlPath.substring(lastSlash + 1));

        const respond = (body: any) => {
            response.setHeader('Content-Type', 'application/json');
            response.writeHead(200);
            response.end(JSON.stringify(body));
        };

        try {
            if (request.headers['Authorization']) {
                const auth = String(request.headers['Authorization']);
                const token = auth.startsWith('Bearer ') ? auth.substring(7) : auth;
                const session = await this.security.authenticate(token, this);
                this.sessionState.setSession(session);
            }

            if (method.endsWith('.type')) {
                method = method.substring(0, method.length - 5);
                const types: ActionTypes = this.actionHandler.jsonTypes(controller, method);
                respond({
                    mode: types.mode,
                    type: serializeType(types.strictSerialization ? types.type : anyType),
                    parameters: serializeType(types.strictSerialization ? types.parameters : anyParametersType),
                });
                return;
            }

            const body =
                request.body && request.body.byteLength > 0 ? JSON.parse(bufferToString(request.body)) : undefined;
            const args = Array.isArray(body) ? body : body?.args || url.searchParams.getAll('arg');
            const { value, type } = await this.actionHandler.invokeJson(controller, method, args);
            respond(serialize(value, undefined, undefined, undefined, type).v);
        } catch (error: any) {
            response.setHeader('X-Rpc-Error', '1');
            respond(rpcEncodeError(error));
        }
    }

    protected async authenticate(token: any): Promise<string> {
        const event = new DataEvent<RpcAuthEventStart>({
            phase: 'start',
            context: this.context,
            token,
        });
        await this.eventDispatcher.dispatch(onRpcAuth, event, this.injector);

        try {
            let session = event.data.session;
            if ('undefined' === typeof session) {
                session = await this.security.authenticate(token, this);
            }
            await this.eventDispatcher.dispatch(
                onRpcAuth,
                () => ({
                    phase: 'success',
                    context: this.context,
                    token,
                    session,
                }),
                this.injector,
            );
            this.sessionState.setSession(session);
            return session.username;
        } catch (error) {
            await this.eventDispatcher.dispatch(
                onRpcAuth,
                () => ({
                    phase: 'fail',
                    context: this.context,
                    token,
                    error: ensureError(error, RpcError),
                }),
                this.injector,
            );
            if (error instanceof AuthenticationError) throw new RpcError(error.message);
            this.logger.error('authenticate failed', error);
            throw new AuthenticationError('Authentication failed', { cause: error });
        }
    }

    protected async deregisterAsPeer(id: string): Promise<void> {
        if (id !== this.myPeerId) throw new RpcError(`Not registered as that peer`);
        try {
            this.myPeerId = undefined;
            await this.peerExchange.deregister(id);
        } catch (error) {
            this.logger.error('deregisterAsPeer failed', error);
            throw new RpcError('Failed');
        }
    }

    protected async registerAsPeer(id: string): Promise<void> {
        let registered: boolean;
        try {
            registered = await this.peerExchange.isRegistered(id);
        } catch (error) {
            this.logger.error('registerAsPeer failed', error);
            throw new RpcError('Failed');
        }
        if (registered) throw new RpcError(`Peer ${id} already registered`);

        try {
            if (!(await this.security.isAllowedToRegisterAsPeer(this.sessionState.getSession(), id))) {
                throw new RpcError('Access denied');
            }
            await this.peerExchange.register(id, this.transportConnection);
            this.myPeerId = id;
        } catch (error) {
            if (error instanceof RpcError) throw error;
            this.logger.error('registerAsPeer failed', error);
            throw new RpcError('Failed');
        }
    }
}

export type OnConnectionCallback = (
    connection: RpcKernelConnection,
    injector: InjectorContext,
    logger: LoggerInterface,
) => void;

/**
 * The kernel is responsible for parsing the message header, redirecting to peer if necessary, loading the body parser,
 * and encode/send outgoing messages.
 *
 * @reflection never
 */
export class RpcKernel {
    public readonly controllers = new Map<string, { controller: ClassType; module: InjectorModule }>();

    protected cache: RpcCache = new RpcCache();
    protected actions = new ActionDispatcher();
    protected built: boolean = false;

    protected peerExchange = new RpcPeerExchange();
    protected connections = new RpcKernelConnections();

    protected RpcKernelConnection = RpcKernelConnection;

    protected onConnectionListeners: OnConnectionCallback[] = [];
    protected autoInjector: boolean = false;

    public stats = new RpcStats();

    public injector: InjectorContext;

    constructor(
        injector?: InjectorContext | NormalizedProvider[],
        protected logger: Logger = new Logger(),
    ) {
        this.actions.rebuild = () => this.buildActions();
        if (injector instanceof InjectorContext) {
            this.injector = injector;
        } else {
            this.injector = InjectorContext.forProviders([
                EventDispatcher,
                { provide: SessionState, scope: 'rpc' },
                { provide: RpcKernelSecurity, scope: 'rpc' },
                { provide: InjectorContext, scope: 'rpc' },

                //will be provided when scope is created
                { provide: RpcKernelConnection, scope: 'rpc', useValue: undefined },
                { provide: RpcKernelBaseConnection, scope: 'rpc', useValue: undefined },

                { provide: Logger, useValue: logger },

                ...(injector || []),
            ]);
            this.autoInjector = true;
        }
    }

    /**
     * Register a new event listener for given token.
     *
     * order: The lower the order, the sooner the listener is called. Default is 0.
     */
    listen<T extends EventToken<any>>(
        eventToken: T,
        callback: EventListenerCallback<T>,
        order: number = 0,
    ): EventDispatcherUnsubscribe {
        return this.getEventDispatcher().listen(eventToken, callback, order);
    }

    public getEventDispatcher(): EventDispatcher {
        const result = this.injector.get(EventDispatcher);
        this.getEventDispatcher = () => result;
        return result;
    }

    public onConnection(callback: OnConnectionCallback) {
        this.onConnectionListeners.push(callback);
        return () => {
            arrayRemoveItem(this.onConnectionListeners, callback);
        };
    }

    /**
     * This registers the controller and when no custom InjectorContext was given adds it as provider to the injector.
     *
     * Note: Controllers can not be added to the injector when the injector was already built.
     */
    public registerController(controller: ClassType, id?: string | ControllerDefinition<any>, module?: InjectorModule) {
        if (this.autoInjector) {
            if (!this.injector.rootModule.isProvided(controller)) {
                this.injector.rootModule.addProvider({ provide: controller, scope: 'rpc' });
            }
        }
        if (!id) {
            const rpcConfig = rpcClass._fetch(controller);
            if (!rpcConfig)
                throw new RpcError(
                    `Controller ${getClassName(controller)} has no @rpc.controller() decorator and no controller id was provided.`,
                );
            id = rpcConfig.getPath();
        }
        this.controllers.set('string' === typeof id ? id : id.path, {
            controller,
            module: module || this.injector.rootModule,
        });
        this.built = false;
    }

    protected buildActions(): void {
        if (this.built) return;
        this.built = true;
        this.actions.build(this.controllers, (controller, method) =>
            loadActionTypes(this.cache, this.controllers, controller, method),
        );
    }

    createConnection(transport: TransportConnection, injector?: InjectorContext): RpcKernelBaseConnection {
        if (!injector) injector = this.injector.createChildScope('rpc');

        this.buildActions();

        const connection = new this.RpcKernelConnection(
            new ForwardedRpcStats(this.stats),
            this.logger.scoped('rpc:connection'),
            transport,
            this.connections,
            injector,
            this.getEventDispatcher(),
            this.cache,
            this.controllers,
            injector.get(RpcKernelSecurity),
            this.peerExchange,
            this.actions,
        );
        injector.set(InjectorContext, injector);
        injector.set(RpcKernelConnection, connection);
        injector.set(RpcKernelBaseConnection, connection);
        // a custom injector doesn't have to provide it, the framework binds it on its own
        if (this.autoInjector) injector.set(SessionState, connection.sessionState);
        for (const on of this.onConnectionListeners) on(connection, injector, this.logger);
        this.getEventDispatcher().dispatch(onRpcConnection, { context: { connection, injector } });
        return connection;
    }
}
