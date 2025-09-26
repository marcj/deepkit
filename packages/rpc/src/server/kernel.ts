/*
 * Deepkit Framework
 * Copyright (C) 2021 Deepkit UG, Marc J. Schmidt
 *
 * This program is free software: you can redistribute it and/or modify
 * it under the terms of the MIT License.
 *
 * You should have received a copy of the MIT License along with this program.
 */

import { arrayRemoveItem, bufferToString, ClassType, createBuffer, ensureError, getClassName } from '@deepkit/core';
import { ReceiveType, ReflectionKind, resolveReceiveType, serialize, stringifyUuid, Type, typeOf, writeUuid } from '@deepkit/type';
import { RpcMessageSubject } from '../client/message-subject.js';
import { AuthenticationError, ControllerDefinition, ForwardedRpcStats, rpcAuthenticate, rpcClientId, RpcError, rpcError, rpcPeerRegister, rpcResponseAuthenticate, RpcStats, RpcTransportStats, RpcTypes } from '../model.js';
import {
    BodyDecoder,
    createRpcCompositeMessage,
    createRpcCompositeMessageSourceDest,
    createRpcMessage,
    createRpcMessageSourceDest,
    RpcBinaryMessageReader,
    RpcCreateMessageDef,
    rpcEncodeError,
    RpcMessage,
    RpcMessageDefinition,
    RpcMessageRouteType,
    serializeBinaryRpcMessage,
} from '../protocol.js';
import { ActionTypes, RpcServerAction } from './action.js';
import { RpcControllerAccess, RpcKernelSecurity, SessionState } from './security.js';
import { RpcActionClient, RpcControllerState } from '../client/action.js';
import { RemoteController } from '../client/client.js';
import { InjectorContext, InjectorModule, NormalizedProvider, Resolver } from '@deepkit/injector';
import { Logger, LoggerInterface } from '@deepkit/logger';
import { RpcAction, rpcClass } from '../decorators.js';
import { createWriter, RpcBinaryWriter, TransportBinaryMessageChunkWriter, TransportConnection, TransportMessageWriter, TransportOptions } from '../transport.js';
import { HttpRpcMessage, RpcHttpRequest, RpcHttpResponse } from './http.js';
import { SingleProgress } from '../progress.js';
import { DataEvent, EventDispatcher, EventDispatcherUnsubscribe, EventListenerCallback, EventToken } from '@deepkit/event';
import { onRpcAuth, onRpcConnection, onRpcConnectionClose, RpcAuthEventStart } from '../events.js';

const anyType: Type = { kind: ReflectionKind.any };

export class RpcCompositeMessage {
    protected messages: RpcCreateMessageDef<any>[] = [];

    public strictSerialization: boolean = false;
    public logValidationErrors: boolean = false;
    public errorLabel: string = 'Error in serialization';

    constructor(
        protected stats: RpcTransportStats,
        protected logger: Logger,
        public type: number,
        protected id: number,
        protected writer: TransportMessageWriter,
        protected transportOptions: TransportOptions,
        protected clientId?: Uint8Array,
        protected source?: Uint8Array,
        protected routeType: RpcMessageRouteType.client | RpcMessageRouteType.server = RpcMessageRouteType.client,
    ) {
    }

    add<T>(type: number, body?: T, receiveType?: ReceiveType<T>): this {
        if (!this.strictSerialization) {
            receiveType = anyType;
        }
        this.messages.push({ type, schema: receiveType ? resolveReceiveType(receiveType) : undefined, body });
        return this;
    }

    write(message: RpcMessageDefinition): void {
        try {
            this.writer(message, this.transportOptions, this.stats);
        } catch (error) {
            if (this.logValidationErrors) {
                this.logger.warn(this.errorLabel, error);
            }
            throw error;
        }
    }

    send() {
        if (this.clientId && this.source) {
            //we route back accordingly
            this.write(createRpcCompositeMessageSourceDest(this.id, this.clientId, this.source, this.type, this.messages));
        } else {
            this.write(createRpcCompositeMessage(this.id, this.type, this.messages, this.routeType));
        }
    }
}

export class RpcMessageBuilder {
    public routeType: RpcMessageRouteType.client | RpcMessageRouteType.server = RpcMessageRouteType.client;

    public strictSerialization: boolean = true;
    public logValidationErrors: boolean = false;

    public errorLabel: string = 'Error in serialization';

    constructor(
        protected stats: RpcTransportStats,
        protected logger: Logger,
        protected writer: TransportMessageWriter,
        protected transportOptions: TransportOptions,
        protected id: number,
        protected clientId?: Uint8Array,
        protected source?: Uint8Array,
    ) {
    }

    protected messageFactory<T>(type: RpcTypes, schemaOrBody?: ReceiveType<T>, data?: T): RpcMessageDefinition {
        if (!this.strictSerialization) {
            schemaOrBody = anyType;
        }

        if (this.source && this.clientId) {
            //we route back accordingly
            return createRpcMessageSourceDest(this.id, type, this.clientId, this.source, data, schemaOrBody);
        } else {
            return createRpcMessage(this.id, type, data, this.routeType, schemaOrBody);
        }
    }

    write(message: RpcMessageDefinition): void {
        try {
            this.writer(message, this.transportOptions, this.stats);
        } catch (error: any) {
            if (this.logValidationErrors) {
                this.logger.warn(this.errorLabel, error);
            }
            throw new RpcError(this.errorLabel + ': ' + error.message, { cause: error });
        }
    }

    ack(): void {
        this.write(this.messageFactory(RpcTypes.Ack));
    }

    error(error: Error | string): void {
        const extracted = rpcEncodeError(error);

        this.write(this.messageFactory(RpcTypes.Error, typeOf<rpcError>(), extracted));
    }

    reply<T>(type: number, body?: T, receiveType?: ReceiveType<T>): void {
        this.write(this.messageFactory(type, receiveType, body));
    }

    /**
     * @deprecated
     */
    replyBinary<T>(type: number, body?: Uint8Array): void {
        throw new RpcError('replyBinary deprecated');
    }

    composite(type: number): RpcCompositeMessage {
        const composite = new RpcCompositeMessage(this.stats, this.logger, type, this.id, this.writer, this.transportOptions, this.clientId, this.source);
        composite.strictSerialization = this.strictSerialization;
        composite.logValidationErrors = this.logValidationErrors;
        composite.errorLabel = this.errorLabel;
        return composite;
    }
}

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

    redirect(message: RpcMessage) {
        if (message.routeType == RpcMessageRouteType.peer) {
            const peerId = message.getPeerId();
            const writer = this.registeredPeers.get(peerId);
            if (!writer) {
                //we silently ignore, as a pub/sub would do as well
                console.log('NO writer found for peer', peerId);
                return;
            }
            if (writer.writeBinary) writer.writeBinary(message.getBuffer());
        }

        if (message.routeType == RpcMessageRouteType.sourceDest) {
            const destination = message.getDestination();

            //in this implementation we have to stringify it first, since v8 can not index Uint8Arrays
            const uuid = stringifyUuid(destination);
            const writer = this.registeredPeers.get(uuid);
            if (!writer) {
                console.log('NO writer found for destination', uuid);
                //we silently ignore, as a pub/sub would do as well
                return;
            }
            if (writer.writeBinary) writer.writeBinary(message.getBuffer());
        }
    }
}

export abstract class RpcKernelBaseConnection {
    protected messageId: number = 0;
    public sessionState = new SessionState();

    public writer: TransportMessageWriter;

    protected reader = new RpcBinaryMessageReader(
        this.handleMessage.bind(this),
        (id: number, active: boolean) => {
            const message = active ? createRpcMessage(id, RpcTypes.ChunkAck) : createRpcMessage(id, RpcTypes.Error)
            this.writer(message, this.transportOptions, this.stats);
        },
    );

    /**
     * Statistics about the server->client communication.
     */
    public clientStats: RpcStats = new RpcStats();

    /**
     * When the server wants to execute an action on the client, it uses the actionClient.
     */
    protected actionClient: RpcActionClient = new RpcActionClient(this);

    protected id: Uint8Array = writeUuid(createBuffer(16));

    protected replies = new Map<number, RpcMessageSubject>();
    public transportOptions: TransportOptions = new TransportOptions();
    protected binaryChunkWriter = new TransportBinaryMessageChunkWriter(this.reader, this.transportOptions);

    protected timeoutTimers: any[] = [];
    public readonly onClose: Promise<void>;
    protected onCloseResolve?: Function;
    public closed: boolean = false;

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
        this.writer = createWriter(transportConnection, this.transportOptions, this.reader);

        this.connections.connections.push(this);
        this.onClose = new Promise((resolve) => {
            this.onCloseResolve = resolve;
        });
    }

    write(message: RpcMessageDefinition): void {
        this.writer(message, this.transportOptions, this.stats);
    }

    /**
     * Serializes the message (binary) and sends it to the client using
     * a chunk writer (splitting the message into smaller parts if necessary,
     * so they can be tracked).
     */
    sendBinary(message: RpcMessageDefinition, writer: RpcBinaryWriter): void {
        this.binaryChunkWriter.write(writer, serializeBinaryRpcMessage(message));
    }

    clientAddress(): string | undefined {
        return this.transportConnection.clientAddress ? this.transportConnection.clientAddress() : undefined;
    }

    createMessageBuilder(): RpcMessageBuilder {
        return new RpcMessageBuilder(this.stats, this.logger, this.writer, this.transportOptions, this.messageId++);
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
        for (const subject of this.replies.values()) {
            subject.disconnect();
        }
        this.replies.clear();
        this.stats.increase('connections', -1);
        this.eventDispatcher.dispatch(onRpcConnectionClose, () => ({
            reason,
            context: { connection: this, injector: this.injector },
        }), this.injector);
        for (const timeout of this.timeoutTimers) clearTimeout(timeout);
        if (this.onCloseResolve) this.onCloseResolve();
        arrayRemoveItem(this.connections.connections, this);
        this.transportConnection.close();
    }

    public feed(buffer: Uint8Array, bytes?: number): void {
        this.stats.increase('incomingBytes', bytes ?? buffer.byteLength);
        this.reader.feed(buffer, bytes);
    }

    public handleMessage(message: RpcMessage): void {
        this.stats.increase('incoming', 1);
        if (message.routeType === RpcMessageRouteType.server) {
            //initiated by the server, so we check replies
            const callback = this.replies.get(message.id);
            if (callback) {
                callback.next(message);
                return;
            }
        }

        const response = new RpcMessageBuilder(this.stats, this.logger, this.writer, this.transportOptions, message.id);
        this.onMessage(message, response);
    }

    onRequest(basePath: string, request: RpcHttpRequest, response: RpcHttpResponse): void | Promise<void> {
        throw new RpcError('Not supported');
    }

    abstract onMessage(message: RpcMessage, response: RpcMessageBuilder): void | Promise<void>;

    public controller<T>(nameOrDefinition: string | ControllerDefinition<T>, timeoutInSeconds = 60): RemoteController<T> {
        const controller = new RpcControllerState('string' === typeof nameOrDefinition ? nameOrDefinition : nameOrDefinition.path);

        return new Proxy(this, {
            get: (target, propertyName) => {
                return (...args: any[]) => {
                    return this.actionClient.action(controller, propertyName as string, args);
                };
            },
        }) as any as RemoteController<T>;
    }

    public sendMessage<T>(
        type: number,
        body?: T,
        receiveType?: ReceiveType<T>,
    ): RpcMessageSubject {
        if (this.closed) throw new RpcError('Connection closed');
        const id = this.messageId++;
        const continuation = <T>(type: number, body?: T, receiveType?: ReceiveType<T>) => {
            //send a message with the same id. Don't use sendMessage() again as this would lead to a memory leak
            // and a new id generated. We want to use the same id.
            const message = createRpcMessage(id, type, body, RpcMessageRouteType.server, receiveType);
            this.writer(message, this.transportOptions, this.stats);
        };

        const subject = new RpcMessageSubject(continuation, () => {
            this.replies.delete(id);
        });

        this.replies.set(id, subject);

        const message = createRpcMessage(id, type, body, RpcMessageRouteType.server, receiveType);
        this.writer(message, this.transportOptions, this.stats);

        return subject;
    }
}

export class RpcKernelConnections {
    public connections: RpcKernelBaseConnection[] = [];

    public stats: RpcTransportStats = new RpcTransportStats;

    broadcast(buffer: RpcMessageDefinition) {
        for (const connection of this.connections) {
            connection.writer(buffer, connection.transportOptions, this.stats);
        }
    }
}

export interface RpcCacheAction {
    controller: RpcControllerAccess;
    fn: Function;
    types: ActionTypes;
    action: RpcAction;
    resolver: Resolver<any>;
    bodyDecoder: BodyDecoder<any>;
    label: string; //controller.action
}

export class RpcCache {
    actionsTypes: { [id: string]: ActionTypes } = {};
    actions: { [id: string]: RpcCacheAction } = {};
}

export class RpcKernelConnection extends RpcKernelBaseConnection {
    public myPeerId?: string;
    protected actionHandler = new RpcServerAction(this.stats, this.cache, this, this.controllers, this.injector, this.eventDispatcher, this.security, this.sessionState, this.logger);

    public routeType: RpcMessageRouteType.client | RpcMessageRouteType.server = RpcMessageRouteType.client;
    protected context: { connection: RpcKernelBaseConnection, injector: InjectorContext } = { connection: this, injector: this.injector };

    constructor(
        stats: RpcStats,
        logger: Logger,
        transport: TransportConnection,
        connections: RpcKernelConnections,
        injector: InjectorContext,
        eventDispatcher: EventDispatcher,
        protected cache: RpcCache,
        protected controllers: Map<string, { controller: ClassType, module?: InjectorModule }>,
        protected security = new RpcKernelSecurity(),
        protected peerExchange: RpcPeerExchange,
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

    async onRequest(basePath: string, request: RpcHttpRequest, response: RpcHttpResponse) {
        let routeType: any = RpcMessageRouteType.client;
        const id = 0;
        let source: Uint8Array | undefined = undefined;
        if (!basePath.endsWith('/')) basePath += '/';
        if (!basePath.startsWith('/')) basePath = '/' + basePath;
        const url = new URL(request.url || '', 'http://localhost/' + basePath);

        try {
            const messageResponse = new RpcMessageBuilder(this.stats, this.logger, (message: RpcMessageDefinition, options: TransportOptions, stats: RpcTransportStats, progress?: SingleProgress) => {
                response.setHeader('Content-Type', 'application/json');
                response.setHeader('X-Message-Type', message.type);
                response.setHeader('X-Message-Composite', String(!!message.composite));
                response.setHeader('X-Message-RouteType', String(message.routeType));
                response.writeHead(200);

                if (message.body) {
                    let body = serialize(message.body.body, undefined, undefined, undefined, message.body.type);
                    if (message.type === RpcTypes.ResponseActionSimple) {
                        body = body.v;
                    }
                    response.end(JSON.stringify(body));
                }
            }, this.transportOptions, id, this.id, routeType === RpcMessageRouteType.peer ? source : undefined);
            messageResponse.routeType = this.routeType;

            const urlPath = url.pathname.substring(basePath.length);
            const lastSlash = urlPath.lastIndexOf('/');
            const base: { controller: string, method: string, args?: any[] } = {
                controller: urlPath.substring(0, lastSlash),
                method: decodeURIComponent(urlPath.substring(lastSlash + 1)),
            };

            let type = false;
            if (base.method.endsWith('.type')) {
                base.method = base.method.substring(0, base.method.length - 5);
                type = true;
            }

            if (request.headers['Authorization']) {
                const auth = String(request.headers['Authorization']);
                const token = auth.startsWith('Bearer ') ? auth.substring(7) : auth;
                const session = await this.security.authenticate(token, this);
                this.sessionState.setSession(session);
            }

            if (type) {
                await this.actionHandler.handleActionTypes(
                    new HttpRpcMessage(1, false, RpcTypes.ActionType, RpcMessageRouteType.client, request.headers, base),
                    messageResponse,
                );
            } else {
                const body = request.body && request.body.byteLength > 0 ? JSON.parse(bufferToString(request.body)) : { args: url.searchParams.getAll('arg').map(v => v) };
                base.args = body.args || [];
                await this.actionHandler.handleAction(
                    new HttpRpcMessage(1, false, RpcTypes.Action, RpcMessageRouteType.client, request.headers, base),
                    messageResponse,
                );
            }
        } catch (error: any) {
            this.logger.error('onRequest failed', error);
            response.writeHead(400);
            response.end(JSON.stringify({ error: error.message }));
        }
    }

    async onMessage(message: RpcMessage): Promise<void> {
        if (message.routeType == RpcMessageRouteType.peer && message.getPeerId() !== this.myPeerId) {
            // console.log('Redirect peer message', RpcTypes[message.type]);
            if (!await this.security.isAllowedToSendToPeer(this.sessionState.getSession(), message.getPeerId())) {
                new RpcMessageBuilder(this.stats, this.logger, this.writer, this.transportOptions, message.id).error(new RpcError('Access denied'));
                return;
            }
            this.peerExchange.redirect(message);
            return;
        }

        if (message.routeType == RpcMessageRouteType.sourceDest) {
            // console.log('Redirect sourceDest message', RpcTypes[message.type]);
            this.peerExchange.redirect(message);
            return;
        }

        if (message.type === RpcTypes.Ping) {
            this.writer(createRpcMessage(message.id, RpcTypes.Pong), this.transportOptions, this.stats);
            return;
        }

        //all outgoing replies need to be routed to the source via sourceDest messages.
        const response = new RpcMessageBuilder(this.stats, this.logger, this.writer, this.transportOptions, message.id, this.id, message.routeType === RpcMessageRouteType.peer ? message.getSource() : undefined);
        response.routeType = this.routeType;

        try {
            if (message.routeType === RpcMessageRouteType.client) {
                switch (message.type) {
                    case RpcTypes.ClientId:
                        return response.reply<rpcClientId>(RpcTypes.ClientIdResponse, { id: this.id });
                    case RpcTypes.PeerRegister:
                        return await this.registerAsPeer(message, response);
                    case RpcTypes.PeerDeregister:
                        return this.deregisterAsPeer(message, response);
                }
            }

            switch (message.type) {
                case RpcTypes.Authenticate:
                    return await this.authenticate(message, response);
                case RpcTypes.ActionType:
                    return await this.actionHandler.handleActionTypes(message, response);
                case RpcTypes.Action:
                    return await this.actionHandler.handleAction(message, response);
                default:
                    return await this.actionHandler.handle(message, response);
            }
        } catch (error: any) {
            response.error(this.security.transformError(error));
        }
    }

    protected async authenticate(message: RpcMessage, response: RpcMessageBuilder) {
        const body = message.parseBody<rpcAuthenticate>();
        const event = new DataEvent<RpcAuthEventStart>({
            phase: 'start', context: this.context, token: body.token,
        });
        await this.eventDispatcher.dispatch(onRpcAuth, event, this.injector);

        try {
            let session = event.data.session;
            if ('undefined' === typeof session) {
                session = await this.security.authenticate(body.token, this);
            }
            await this.eventDispatcher.dispatch(onRpcAuth, () => ({
                phase: 'success', context: this.context, token: body.token, session,
            }), this.injector);
            this.sessionState.setSession(session);

            response.reply<rpcResponseAuthenticate>(RpcTypes.AuthenticateResponse, { username: session.username });
        } catch (error) {
            await this.eventDispatcher.dispatch(onRpcAuth, () => ({
                phase: 'fail', context: this.context, token: body.token, error: ensureError(error, RpcError),
            }), this.injector);
            if (error instanceof AuthenticationError) throw new RpcError(error.message);
            this.logger.error('authenticate failed', error);
            throw new AuthenticationError('Authentication failed', { cause: error });
        }
    }

    protected async deregisterAsPeer(message: RpcMessage, response: RpcMessageBuilder) {
        const body = message.parseBody<rpcPeerRegister>();

        try {
            if (body.id !== this.myPeerId) {
                return response.error(new RpcError(`Not registered as that peer`));
            }
            this.myPeerId = undefined;
            await this.peerExchange.deregister(body.id);
            response.ack();
        } catch (error) {
            this.logger.error('deregisterAsPeer failed', error);
            response.error(new RpcError('Failed'));
        }
    }

    protected async registerAsPeer(message: RpcMessage, response: RpcMessageBuilder) {
        const body = message.parseBody<rpcPeerRegister>();

        try {
            if (await this.peerExchange.isRegistered(body.id)) {
                return response.error(new RpcError(`Peer ${body.id} already registered`));
            }

            if (!await this.security.isAllowedToRegisterAsPeer(this.sessionState.getSession(), body.id)) {
                response.error(new RpcError('Access denied'));
                return;
            }

            await this.peerExchange.register(body.id, this.transportConnection);
            this.myPeerId = body.id;
            response.ack();
        } catch (error) {
            this.logger.error('registerAsPeer failed', error);
            response.error(new RpcError('Failed'));
        }
    }
}

export type OnConnectionCallback = (connection: RpcKernelConnection, injector: InjectorContext, logger: LoggerInterface) => void;


/**
 * The kernel is responsible for parsing the message header, redirecting to peer if necessary, loading the body parser,
 * and encode/send outgoing messages.
 *
 * @reflection never
 */
export class RpcKernel {
    public readonly controllers = new Map<string, { controller: ClassType, module: InjectorModule }>();

    protected cache: RpcCache = new RpcCache;

    protected peerExchange = new RpcPeerExchange;
    protected connections = new RpcKernelConnections;

    protected RpcKernelConnection = RpcKernelConnection;

    protected onConnectionListeners: OnConnectionCallback[] = [];
    protected autoInjector: boolean = false;

    public stats = new RpcStats();

    public injector: InjectorContext;

    constructor(
        injector?: InjectorContext | NormalizedProvider[],
        protected logger: Logger = new Logger(),
    ) {
        if (injector instanceof InjectorContext) {
            this.injector = injector;
        } else {
            this.injector = InjectorContext.forProviders([
                EventDispatcher,
                { provide: SessionState, scope: 'rpc' },
                { provide: RpcKernelSecurity, scope: 'rpc' },

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
    listen<T extends EventToken<any>>(eventToken: T, callback: EventListenerCallback<T>, order: number = 0): EventDispatcherUnsubscribe {
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
            if (!rpcConfig) throw new RpcError(`Controller ${getClassName(controller)} has no @rpc.controller() decorator and no controller id was provided.`);
            id = rpcConfig.getPath();
        }
        this.controllers.set('string' === typeof id ? id : id.path, {
            controller,
            module: module || this.injector.rootModule,
        });
    }

    createConnection(transport: TransportConnection, injector?: InjectorContext): RpcKernelBaseConnection {
        if (!injector) injector = this.injector.createChildScope('rpc');

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
        );
        injector.set(RpcKernelConnection, connection);
        injector.set(RpcKernelBaseConnection, connection);
        for (const on of this.onConnectionListeners) on(connection, injector, this.logger);
        this.getEventDispatcher().dispatch(onRpcConnection, { context: { connection, injector } });
        return connection;
    }
}
