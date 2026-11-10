/*
 * Deepkit Framework
 * Copyright (C) 2021 Deepkit UG, Marc J. Schmidt
 *
 * This program is free software: you can redistribute it and/or modify
 * it under the terms of the MIT License.
 *
 * You should have received a copy of the MIT License along with this program.
 */
import { BehaviorSubject, Subject } from 'rxjs';

import { ClassType, asyncOperation, formatError, sleep } from '@deepkit/core';
import { SequentialContextDispatcher } from '@deepkit/net';
import { TypeTuple, ValidationError, stringifyUuid, typeOf } from '@deepkit/type';

import { createParameterSerializer, createReturnDeserializer, getBodyCodec } from '../action.js';
import { ParsedSchemaMapping, parseSchemaMapping, schemaMapping } from '../encoders.js';
import { ControllerDefinition, RpcError, RpcStats, rpcEntityPatch, rpcEntityRemove } from '../model.js';
import { ClientProgress, SingleProgress } from '../progress.js';
import {
    ChunkOp,
    ControlOp,
    MessageFlag,
    RouteFlag,
    RpcBinaryMessageReader,
    RpcProtocolVersionError,
    connectionContextBase,
    copyFrame,
    frameMemory,
    getPeerId,
    getRouteDataSize,
    hasContext,
    helloOffset,
    isTypeFlag,
    readUint16LE,
    readUint32LE,
    routeMask,
    rpcProtocolVersion,
    writeChunkControlFrameTransient,
    writeHelloFrameTransient,
    writeHelloReplyFrameTransient,
} from '../protocol.js';
import { RpcKernel, RpcKernelConnection } from '../server/kernel.js';
import {
    RpcFrameSender,
    TransportBinaryMessageChunkWriter,
    TransportClientConnection,
    TransportConnection,
    TransportOptions,
    createFrameSender,
} from '../transport.js';
import {
    RpcActionClient,
    RpcControllerState,
    RpcFastHost,
    RpcHttpTransport,
    createRemoteController,
} from './action.js';
import { OfflineError } from './errors.js';

export { OfflineError };

type PromisifyFn<T extends (...args: any[]) => any> = (
    ...args: Parameters<T>
) => ReturnType<T> extends Promise<any> ? ReturnType<T> : Promise<ReturnType<T>>;
export type RemoteController<T> = {
    [P in keyof T]: T[P] extends (...args: any[]) => any ? PromisifyFn<T[P]> : never;
};

export interface ClientTransportAdapter {
    connect(connection: TransportClientConnection): Promise<void> | void;

    /**
     * Whether ClientId call is needed to get a client id.
     * This is disabled for http adapter.
     */
    supportsPeers?(): boolean;

    /**
     * Whether Authentication call is needed to authenticate the client.
     * This is disabled for http adapter (Authorization header is used).
     */
    supportsAuthentication?(): boolean;

    /** When set, actions are called through this instead of frames on a connection. */
    httpTransport?(): RpcHttpTransport;
}

export type RpcPushHandler = (buffer: Uint8Array, offset: number, end: number) => void;

export class RpcClientToken {
    constructor(protected token: any) {}

    get() {
        return this.token;
    }

    set(v: any) {
        this.token = v;
    }

    has() {
        return this.token !== undefined;
    }
}

export class RpcClientTransporter {
    protected connectionTries: number = 0;
    public connectionId: number = 0;
    protected transportConnection?: TransportConnection;
    protected connectionPromise?: Promise<void>;

    protected connected = false;
    public writerOptions: TransportOptions = new TransportOptions();

    public id?: Uint8Array;

    /**
     * When the connection is established (including handshake and authentication).
     */
    public readonly connection = new BehaviorSubject<boolean>(false);

    /**
     * When the connection was reconnected. This is not called for the very first connection.
     */
    public readonly reconnected = new Subject<number>();

    /**
     * When the connection was disconnected (due to error or close).
     * This increases the connectionId by one.
     */
    public readonly disconnected = new Subject<number>();

    /**
     * Triggered for any onError call from the transporter.
     * Right after this event, onDisconnect is called (and thus connection.next(false) and disconnected.next()).
     */
    public readonly errored = new Subject<{ connectionId: number; error: Error }>();

    public reader = this.createReader();

    protected createReader(): RpcBinaryMessageReader {
        const reader = new RpcBinaryMessageReader((id, active, route) => {
            const frameSize = writeChunkControlFrameTransient(id, route, active ? ChunkOp.Ack : ChunkOp.Abort);
            this.sendFrame(frameMemory(), frameSize);
        });
        reader.onRawFrame = (buffer, start, end) => this.onFrame(buffer, start, end);
        return reader;
    }

    protected frameSender?: RpcFrameSender;

    protected helloReply?: { resolve: () => void; reject: (error: Error) => void };

    /** Hash of the action schema the handshake delivered, to not transfer it again. */
    public schemaHash: number = 0;

    public constructor(
        public transport: ClientTransportAdapter,
        protected stats: RpcStats,
    ) {}

    bufferedAmount(): number {
        if (!this.transportConnection?.bufferedAmount) return 0;
        return this.transportConnection.bufferedAmount();
    }

    clientAddress(): string {
        if (!this.transportConnection?.clientAddress) return 'unknown';
        return this.transportConnection.clientAddress();
    }

    /**
     * True when fully connected (after successful handshake and authentication)
     */
    public isConnected(): boolean {
        return this.connected;
    }

    protected onError(error: Error) {
        this.errored.next({ connectionId: this.connectionId, error });
        this.onDisconnect(error);
    }

    protected onDisconnect(error?: Error) {
        this.id = undefined;
        this.connectionPromise = undefined;
        if (!this.transportConnection) return;

        this.transportConnection = undefined;
        this.stats.increase('connections', -1);
        this.frameSender = undefined;
        if (this.helloReply) {
            const reply = this.helloReply;
            this.helloReply = undefined;
            reply.reject(error || new OfflineError('Connection closed during the handshake'));
        }

        this.connection.next(false);
        this.connected = false;
        this.onClose(error);
        const id = this.connectionId;
        this.connectionId++;
        this.disconnected.next(id);
    }

    // this is overridden in RpcClient
    public onClose(error?: Error) {}

    protected onConnect() {
        this.connection.next(true);
        if (this.connectionId > 0) {
            this.reconnected.next(this.connectionId);
        }
    }

    /**
     * Optional handshake.
     * When peer messages are allowed, this needs to request the client id and returns id.
     */
    public async onHandshake(): Promise<Uint8Array | undefined> {
        return undefined;
    }

    public async onAuthenticate(token?: any): Promise<void> {}

    /**
     * Receives all frames that are not chunks. The buffer is only valid during this call.
     */
    public onFrame(buffer: Uint8Array, start: number, end: number): void {}

    public onSchema(mapping: ParsedSchemaMapping, hash: number): void {}

    /**
     * Reads the handshake reply: the protocol version of the server, and the action schema if it is new to us.
     */
    public onHelloReply(buffer: Uint8Array, start: number, end: number): void {
        const reply = this.helloReply;
        if (!reply) return;
        this.helloReply = undefined;

        const offset = helloOffset(buffer, start);
        const version = buffer[offset];
        if (version !== rpcProtocolVersion) {
            reply.reject(
                new RpcProtocolVersionError(
                    `RPC protocol mismatch: the server uses version ${version}, the client version ${rpcProtocolVersion}. Update the older side.`,
                ),
            );
            return;
        }

        const hash = readUint32LE(buffer, offset + 1);
        if (end > offset + 5) {
            this.onSchema(parseSchemaMapping(schemaMapping.decode(buffer, offset + 5)), hash);
            this.schemaHash = hash;
        }
        reply.resolve();
    }

    /**
     * Makes sure both sides speak the same protocol before anything else is sent.
     */
    protected hello(transport: TransportConnection): Promise<void> | undefined {
        if (!transport.writeBinary && !transport.binarySocket) return;

        return new Promise<void>((resolve, reject) => {
            const timeout =
                this.writerOptions.handshakeTimeout > 0
                    ? setTimeout(() => {
                          if (!this.helloReply) return;
                          this.helloReply = undefined;
                          reject(
                              new OfflineError(
                                  `No reply to the RPC handshake within ${this.writerOptions.handshakeTimeout}ms: the server does not speak a compatible protocol`,
                              ),
                          );
                      }, this.writerOptions.handshakeTimeout)
                    : undefined;

            const settled = () => {
                if (timeout !== undefined) clearTimeout(timeout);
            };
            this.helloReply = {
                resolve: () => {
                    settled();
                    resolve();
                },
                reject: error => {
                    settled();
                    reject(error);
                },
            };

            this.writeHello(transport);
        });
    }

    protected writeHello(transport: TransportConnection): void {
        const size = writeHelloFrameTransient(this.schemaHash);
        if (transport.binarySocket?.writeRange) transport.binarySocket.writeRange(frameMemory(), 0, size);
        else transport.writeBinary!(copyFrame(frameMemory(), 0, size));
    }

    /** Whether a connection exists to send frames on. */
    public canSend(): boolean {
        return this.frameSender !== undefined;
    }

    /** Asks for the actions of the server again. */
    public async refreshSchema(): Promise<void> {
        if (this.transportConnection) await this.hello(this.transportConnection);
    }

    /**
     * Sends the frame in the range 0 to size of the buffer, see RpcFrameSender.
     */
    public sendFrame(buffer: Uint8Array, size: number, progress?: SingleProgress): void {
        if (!this.frameSender) throw new RpcError('Connection is not established');
        try {
            this.frameSender(buffer, size, progress);
        } catch (error: any) {
            if (error instanceof ValidationError) throw error;
            throw new OfflineError(error, { cause: error });
        }
    }

    public async disconnect() {
        // we have to wait for ongoing connection attempts
        while (this.connectionPromise) {
            // an attempt whose socket is open waits on the handshake as long as the
            // server stays silent; closing the socket fails it instead of hanging
            const connectionPromise = this.connectionPromise;
            if (this.transportConnection) {
                this.transportConnection.close();
                this.onDisconnect();
            }
            // a failed attempt leaves nothing to disconnect; rethrowing its error
            // made disconnect() reject because some other connect() failed
            await connectionPromise.catch(() => undefined);
        }

        if (this.transportConnection) {
            this.transportConnection.close();
            this.onDisconnect();
        }
    }

    protected async doConnect(token?: any): Promise<void> {
        this.connectionTries++;

        if (this.transportConnection) {
            this.transportConnection.close();
            this.transportConnection = undefined;
        }

        // This attempt's events act on the transporter only while its socket is
        // the current one. The late close event of a socket that was already
        // replaced used to run onDisconnect(), which cleared the next attempt's
        // connectionPromise or disconnected the next socket. Before the socket
        // opens, both are undefined.
        let transportConnection: TransportConnection | undefined;
        const isCurrent = () => this.transportConnection === transportConnection;

        return asyncOperation<void>(async (resolve, reject) => {
            await this.transport.connect({
                token,

                onClose: (reason: string) => {
                    if (isCurrent()) this.onDisconnect();
                    // a socket that closes before it is connected fails its attempt
                    // instead of leaving it pending forever; a no-op once connected
                    reject(new OfflineError(`Could not connect: ${reason || 'connection closed'}`));
                },

                onConnected: async (transport: TransportConnection) => {
                    transportConnection = transport;
                    this.transportConnection = transport;
                    this.stats.increase('connections', 1);
                    this.stats.increase('totalConnections', 1);
                    const chunkWriter = new TransportBinaryMessageChunkWriter(this.reader, this.writerOptions);
                    this.frameSender = createFrameSender(transport, chunkWriter, this.writerOptions, this.stats);

                    this.connected = false;
                    this.connectionTries = 0;

                    try {
                        await this.hello(transport);
                        this.id = await this.onHandshake();
                        await this.onAuthenticate(token);
                    } catch (error) {
                        // when the socket closed mid-handshake, onClose already
                        // disconnected it, and the transporter may by now belong
                        // to the next attempt
                        if (isCurrent()) {
                            this.connected = false;
                            this.connectionTries = 0;
                            this.onError(error instanceof Error ? error : new Error(String(error)));
                        }
                        reject(error);
                        return;
                    }

                    this.connected = true;
                    this.onConnect();
                    resolve(undefined);
                },

                onError: (error: Error) => {
                    if (isCurrent()) this.onError(error);
                    reject(new OfflineError(`Could not connect: ${formatError(error)}`, { cause: error }));
                },

                readBinary: (buffer: Uint8Array, bytes?: number) => {
                    this.reader.feed(buffer, bytes);
                },
            });
        });
    }

    /**
     * Simply connect with login using the token, without auto re-connect.
     */
    public async connect(token?: any): Promise<void> {
        while (this.connectionPromise) {
            await this.connectionPromise;
            await sleep(0.01);
        }

        if (this.connected) {
            return;
        }

        // when this attempt's socket closes, onDisconnect() clears
        // connectionPromise and a new attempt can start before this one settles,
        // so clear only our own
        const connectionPromise = (this.connectionPromise = this.doConnect(token));

        try {
            await connectionPromise;
        } finally {
            if (this.connectionPromise === connectionPromise) this.connectionPromise = undefined;
        }
    }
}

export class RpcClientPeer {
    constructor(
        protected actionClient: RpcActionClient,
        protected peerId: string,
        protected onDisconnect: (peerId: string) => void,
    ) {}

    public controller<T>(
        nameOrDefinition: string | ControllerDefinition<T>,
        options: {
            timeout?: number;
            dontWaitForConnection?: true;
        } = {},
    ): RemoteController<T> {
        const controller = new RpcControllerState(
            'string' === typeof nameOrDefinition ? nameOrDefinition : nameOrDefinition.path,
        );
        controller.peerId = this.peerId;

        return createRemoteController<RemoteController<T>>(this.actionClient, controller, options);
    }

    disconnect() {
        this.onDisconnect(this.peerId);
    }
}

type FrameHandler = (buffer: Uint8Array, start: number, end: number) => void;

export type RpcEventMessage = { id: number; date: Date; type: string; body: any };
export type RpcClientEventIncomingMessage = { event: 'incoming' } & RpcEventMessage;
export type RpcClientEventOutgoingMessage = { event: 'outgoing' } & RpcEventMessage;

export type RpcClientEvent = RpcClientEventIncomingMessage | RpcClientEventOutgoingMessage;

const writeOneValue = createParameterSerializer(typeOf<[value: any]>() as TypeTuple);
const readClientId = createReturnDeserializer(typeOf<Uint8Array>());
const readUsername = createReturnDeserializer(typeOf<string>());

export class RpcBaseClient implements RpcFastHost {
    /** One callback slot per call or stream in flight, per connection. */
    protected contexts = new SequentialContextDispatcher<FrameHandler>(connectionContextBase - 1);
    protected schema?: ParsedSchemaMapping;
    protected schemaEpoch: number = 0;
    protected pushHandlers: (RpcPushHandler | undefined)[] = [];

    public clientStats: RpcStats = new RpcStats();

    public actionClient = new RpcActionClient();
    public readonly token = new RpcClientToken(undefined);
    public readonly transporter: RpcClientTransporter;

    public username?: string;

    public typeReuseDisabled: boolean = false;

    public events = new Subject<RpcClientEvent>();

    constructor(protected transport: ClientTransportAdapter) {
        this.transporter = new RpcClientTransporter(this.transport, this.clientStats);
        this.transporter.onHandshake = this.onHandshake.bind(this);
        this.transporter.onAuthenticate = this.onAuthenticate.bind(this);
        this.transporter.onClose = this.onClose.bind(this);
        this.transporter.onFrame = this.onFrame.bind(this);
        this.transporter.onSchema = this.onSchema.bind(this);
        this.transporter.reader.onRawFrame = this.onFrame.bind(this);
        this.transporter.reader.onAbort = (id, error) => this.actionClient.abort(id, error);
        this.actionClient.fastHost = this;
    }

    /** A frame that is not simply for this client. Returns true when it was handled. */
    protected onRoutedFrame(flag: number, buffer: Uint8Array, start: number, end: number): boolean {
        return false;
    }

    onFrame(buffer: Uint8Array, start: number, end: number): void {
        const flag = buffer[start + 4];
        if ((flag & routeMask) !== MessageFlag.RouteClient && this.onRoutedFrame(flag, buffer, start, end)) return;

        if (isTypeFlag(flag, MessageFlag.TypeSchema) && !hasContext(flag)) {
            this.transporter.onHelloReply(buffer, start, end);
            return;
        }

        this.clientStats.addIncoming();

        if (hasContext(flag)) {
            const id = readUint16LE(buffer, start + 5);
            if (id >= connectionContextBase) this.actionClient.onConnectionFrame(id, buffer, start, end);
            // undefined for an id this client never handed out
            else this.contexts.get(id)?.(buffer, start, end);
            return;
        }

        if (isTypeFlag(flag, MessageFlag.TypeChannel)) {
            this.pushHandlers[buffer[start + 5]]?.(buffer, start + 6, end);
        } else if (isTypeFlag(flag, MessageFlag.TypeControl)) {
            this.onConnectionControl(buffer[start + 5] as ControlOp, buffer, start + 6, end);
        }
    }

    protected onConnectionControl(op: ControlOp, buffer: Uint8Array, offset: number, end: number): void {
        if (op === ControlOp.EntityPatch) {
            this.actionClient.entityState.onEntityPatch(
                getBodyCodec(typeOf<rpcEntityPatch>()).deserialize(buffer, offset, end),
            );
        } else if (op === ControlOp.EntityRemove) {
            this.actionClient.entityState.onEntityRemove(
                getBodyCodec(typeOf<rpcEntityRemove>()).deserialize(buffer, offset, end),
            );
        }
    }

    /**
     * Receives the frames of a push channel, see writePushFrameTransient. The range of the values is only valid during the call.
     */
    onPush(channel: number, handler: RpcPushHandler): void {
        this.pushHandlers[channel] = handler;
    }

    protected onSchema(mapping: ParsedSchemaMapping, hash: number): void {
        this.schema = mapping;
        this.schemaEpoch++;
    }

    getSchemaMapping(): ParsedSchemaMapping | undefined {
        return this.schema;
    }

    getSchemaEpoch(): number {
        return this.schemaEpoch;
    }

    isActionReady(dontWaitForConnection?: boolean): boolean {
        return dontWaitForConnection
            ? this.schema !== undefined
            : this.transporter.isConnected() && this.schema !== undefined;
    }

    getContexts(): SequentialContextDispatcher<FrameHandler> {
        return this.contexts;
    }

    getChunkSize(): number {
        return this.transporter.writerOptions.chunkSize;
    }

    sendActionFrame(buffer: Uint8Array, size: number, progress?: SingleProgress): void {
        this.transporter.sendFrame(buffer, size, progress);
    }

    registerDownloadProgress(id: number, progress: SingleProgress): void {
        this.transporter.reader.registerProgress(id, progress);
    }

    isObserved(): boolean {
        return this.events.observers.length > 0;
    }

    emitEvent(event: RpcClientEvent): void {
        this.events.next(event);
    }

    connectForAction(): Promise<unknown> {
        return this.connect();
    }

    refreshSchema(): Promise<unknown> {
        return this.transporter.refreshSchema();
    }

    hasBinaryTransport(): boolean {
        return !this.transport.httpTransport;
    }

    getHttpTransport(): RpcHttpTransport | undefined {
        return this.transport.httpTransport?.();
    }

    getToken(): any {
        return this.token.get();
    }

    currentConnectionId(): number {
        return this.transporter.connectionId;
    }

    getRoute(): RouteFlag {
        return MessageFlag.RouteClient;
    }

    onClose(error?: Error) {
        this.actionClient.onDisconnect(error);
        // the next connection starts with empty contexts on both sides
        this.contexts = new SequentialContextDispatcher<FrameHandler>(connectionContextBase - 1);
    }

    /**
     * Per default entity types with a name (@entity.name()) will be reused. If a entity with a given name
     * was not loaded and error is thrown. This to ensure nominal typing (object instanceof T).
     * Use this method to disable this behavior and construct new nominal types if an entity is not loaded.
     */
    disableTypeReuse(): this {
        this.typeReuseDisabled = true;
        return this;
    }

    /**
     * The connection process is only finished when this method resolves and doesn't throw.
     * When an error is thrown, the authentication was unsuccessful.
     *
     * If you use controllers in this callback, make sure to use dontWaitForConnection=true, otherwise you get an endless loop.
     *
     * ```typescript
     * async onAuthenticate(token?: any): Promise<void> {
     *     const auth = this.controller<AuthController>('auth', {dontWaitForConnection: true});
     *     const result = auth.login('username', 'password');
     *     if (!result) throw new AuthenticationError('Authentication failed);
     * }
     * ```
     */
    protected async onAuthenticate(token?: any): Promise<void> {
        if (undefined === token) return;
        if (this.transport.supportsPeers && !this.transport.supportsPeers()) return;

        this.username = await this.actionClient.systemCall(
            ControlOp.Authenticate,
            writeOneValue,
            [token],
            readUsername,
        );
    }

    protected async onHandshake(): Promise<Uint8Array | undefined> {
        return undefined;
    }

    public getId(): Uint8Array {
        throw new RpcError('RpcBaseClient does not load its client id, and thus does not support peer message');
    }

    debug() {
        return {
            activeMessages: this.contexts.active,
        };
    }

    async connect(): Promise<this> {
        await this.transporter.connect(this.token.get());
        return this;
    }

    async disconnect() {
        await this.transporter.disconnect();
    }
}

export class RpcClient extends RpcBaseClient {
    protected registeredAsPeer?: string;

    /**
     * For server->client (us) communication.
     * This is automatically created when registerController is called.
     * Set this property earlier to work with a custom RpcKernel.
     */
    public clientKernel?: RpcKernel;

    /**
     * Once the server starts actively with first RPC action for the client,
     * a RPC connection is created.
     */
    protected clientKernelConnection?: RpcKernelConnection;

    /**
     * For peer->client(us) communication.
     * This is automatically created when registerAsPeer is called.
     * Set this property earlier to work with a custom RpcKernel.
     */
    public peerKernel?: RpcKernel;

    protected peerConnections = new Map<string, RpcClientPeer>();

    /** The route data of frames to a peer. */
    protected peerRoutes = new Map<string, Uint8Array>();

    protected async onHandshake(): Promise<Uint8Array | undefined> {
        this.clientKernelConnection = undefined;
        this.peerKernelConnection.clear();
        this.peerRoutes.clear();
        if (this.transport.supportsPeers && !this.transport.supportsPeers()) return;

        return await this.actionClient.systemCall(ControlOp.ClientId, undefined, undefined, readClientId);
    }

    protected peerKernelConnection = new Map<string, RpcKernelConnection>();

    public async ping(): Promise<void> {
        await this.connect();
        await this.actionClient.systemCall(ControlOp.Ping);
    }

    getPeerRoute(peerId: string): Uint8Array {
        let route = this.peerRoutes.get(peerId);
        if (!route) {
            route = new Uint8Array(16 + peerId.length + 1);
            route.set(this.getId());
            for (let i = 0; i < peerId.length; i++) route[16 + i] = peerId.charCodeAt(i);
            this.peerRoutes.set(peerId, route);
        }
        return route;
    }

    /** Everything an internal connection sends goes out on the one connection of this client as it is. */
    protected createInternalConnection(kernel: RpcKernel, close: () => void): RpcKernelConnection {
        const connection = kernel.createConnection({
            // a late answer of a controller after this client disconnected goes nowhere
            writeBinary: frame => {
                if (this.transporter.canSend()) this.transporter.sendFrame(frame, frame.byteLength);
            },
            close,
            clientAddress: () => this.transporter.clientAddress(),
            bufferedAmount: () => this.transporter.bufferedAmount(),
        });
        if (!(connection instanceof RpcKernelConnection))
            throw new RpcError('Expected RpcKernelConnection from kernel.createConnection');
        // Important to disable since the frames are chunked by this client's connection already.
        connection.transportOptions.chunkSize = 0;
        return connection;
    }

    /** A frame seen by what it is for: the route data is taken off, and the flag moves right in front of the rest. */
    protected unroute(flag: number, buffer: Uint8Array, start: number): number {
        const shifted = start + getRouteDataSize(buffer, start);
        buffer[shifted + 4] = (flag & ~routeMask) | MessageFlag.RouteClient;
        return shifted;
    }

    protected onRoutedFrame(flag: number, buffer: Uint8Array, start: number, end: number): boolean {
        const route = flag & routeMask;
        if (route === MessageFlag.RouteSourceDest) {
            this.onFrame(buffer, this.unroute(flag, buffer, start), end);
            return true;
        }

        if (route === MessageFlag.RoutePeer) {
            this.onPeerFrame(flag, buffer, start, end);
            return true;
        }

        if (!this.clientKernel) {
            if (isTypeFlag(flag, MessageFlag.TypeSchema)) {
                const frameSize = writeHelloReplyFrameTransient(
                    rpcProtocolVersion,
                    0,
                    undefined,
                    MessageFlag.RouteServer,
                );
                this.transporter.sendFrame(frameMemory(), frameSize);
            }
            return true;
        }

        if (!this.clientKernelConnection) {
            const connection = this.createInternalConnection(this.clientKernel, () => {
                this.transporter.disconnect().catch(() => undefined);
            });
            connection.routeType = MessageFlag.RouteServer;
            this.clientKernelConnection = connection;
        }
        this.clientKernelConnection.feedFrame(buffer, start, end);
        return true;
    }

    protected onPeerFrame(flag: number, buffer: Uint8Array, start: number, end: number): void {
        if (!this.peerKernel) return;
        const peerId = getPeerId(buffer, start);
        if (this.registeredAsPeer !== peerId) return;

        const source = buffer.slice(start + 5, start + 21);
        const key = stringifyUuid(source);
        let connection = this.peerKernelConnection.get(key);
        if (!connection) {
            //todo: set up timeout for idle detection. Make the timeout configurable
            const created: RpcKernelConnection = this.createInternalConnection(this.peerKernel, () => {
                created.close();
                this.peerKernelConnection.delete(key);
            });
            connection = created;
            connection.myPeerId = peerId; //necessary so that the kernel does not redirect the frames again.
            const routeData = new Uint8Array(32);
            routeData.set(this.getId());
            routeData.set(source, 16);
            connection.routeData = routeData;
            this.peerKernelConnection.set(key, connection);
        }

        connection.feedFrame(buffer, this.unroute(flag, buffer, start), end);
    }

    public getId(): Uint8Array {
        if (!this.transporter.id) throw new RpcError('Not fully connected yet');
        return this.transporter.id;
    }

    /**
     * Registers a new controller for the peer's RPC kernel.
     * Use `registerAsPeer` first.
     */
    public registerPeerController<T>(classType: ClassType<T>, nameOrDefinition: string | ControllerDefinition<T>) {
        if (!this.peerKernel) throw new RpcError('Not registered as peer. Call registerAsPeer() first');
        this.peerKernel.registerController(classType, nameOrDefinition);
    }

    /**
     * Registers a new controller for the server's RPC kernel.
     * This is when the server wants to communicate actively with the client (us).
     */
    public registerController<T>(classType: ClassType<T>, nameOrDefinition: string | ControllerDefinition<T>) {
        if (!this.clientKernel) this.clientKernel = new RpcKernel();
        this.clientKernel.registerController(classType, nameOrDefinition);
    }

    public async registerAsPeer(id: string) {
        if (this.registeredAsPeer) {
            throw new RpcError('Already registered as a peer');
        }

        this.peerKernel = new RpcKernel();

        await this.connect();
        await this.actionClient.systemCall(ControlOp.PeerRegister, writeOneValue, [id]);
        this.registeredAsPeer = id;

        return {
            deregister: async () => {
                await this.actionClient.systemCall(ControlOp.PeerDeregister, writeOneValue, [id]);
                this.registeredAsPeer = undefined;
            },
        };
    }

    /**
     * Creates a new peer connection, or re-uses an existing non-disconnected one.
     *
     * Make sure to call disconnect() on it once you're done using it, otherwise the peer
     * will leak memory. (connection will be dropped if idle for too long automatically tough)
     */
    public peer(peerId: string): RpcClientPeer {
        let peer = this.peerConnections.get(peerId);
        if (peer) return peer;
        peer = new RpcClientPeer(this.actionClient, peerId, () => {
            //todo, send disconnect message so the peer can release its kernel connection
            // also implement a timeout on peer side
            this.peerConnections.delete(peerId);
        });
        this.peerConnections.set(peerId, peer);
        return peer;
    }

    public controller<T>(
        nameOrDefinition: string | ControllerDefinition<T>,
        options: {
            timeout?: number;
            dontWaitForConnection?: true;
            typeReuseDisabled?: boolean;
        } = {},
    ): RemoteController<T> {
        const controller = new RpcControllerState(
            'string' === typeof nameOrDefinition ? nameOrDefinition : nameOrDefinition.path,
        );

        options = options || {};
        if ('undefined' === typeof options.typeReuseDisabled) {
            options.typeReuseDisabled = this.typeReuseDisabled;
        }

        return createRemoteController<RemoteController<T>>(this.actionClient, controller, options);
    }
}
