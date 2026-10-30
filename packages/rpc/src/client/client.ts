/*
 * Deepkit Framework
 * Copyright (C) 2021 Deepkit UG, Marc J. Schmidt
 *
 * This program is free software: you can redistribute it and/or modify
 * it under the terms of the MIT License.
 *
 * You should have received a copy of the MIT License along with this program.
 */

import { asyncOperation, ClassType, CustomError, formatError, sleep } from '@deepkit/core';
import { ReceiveType, resolveReceiveType, ValidationError } from '@deepkit/type';
import { BehaviorSubject, Subject } from 'rxjs';
import {
    ControllerDefinition,
    rpcAuthenticate,
    rpcClientId,
    RpcError,
    rpcPeerDeregister,
    rpcPeerRegister,
    rpcResponseAuthenticate,
    RpcStats,
    RpcTypes,
} from '../model.js';
import {
    createErrorMessage,
    createRpcMessage,
    createRpcMessagePeer,
    RpcBinaryMessageReader,
    RpcMessage,
    RpcMessageDefinition,
    RpcMessageRouteType,
} from '../protocol.js';
import { RpcKernel, RpcKernelConnection } from '../server/kernel.js';
import { ClientProgress, SingleProgress } from '../progress.js';
import { RpcActionClient, RpcControllerState } from './action.js';
import { RpcMessageSubject } from './message-subject.js';
import { createWriter, TransportClientConnection, TransportConnection, TransportMessageWriter, TransportOptions } from '../transport.js';

export class OfflineError extends CustomError {
}

type PromisifyFn<T extends ((...args: any[]) => any)> = (...args: Parameters<T>) => ReturnType<T> extends Promise<any> ? ReturnType<T> : Promise<ReturnType<T>>;
export type RemoteController<T> = {
    [P in keyof T]: T[P] extends (...args: any[]) => any ? PromisifyFn<T[P]> : never
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
}

export interface WritableClient {
    clientStats: RpcStats;

    sendMessage<T>(
        type: number,
        body?: T,
        receiveType?: ReceiveType<T>,
        options?: {
            dontWaitForConnection?: boolean,
            connectionId?: number,
            peerId?: string,
            timeout?: number
        },
    ): RpcMessageSubject;
}

export class RpcClientToken {
    constructor(protected token: any) {
    }

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
    protected writer?: TransportMessageWriter;
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
    public readonly errored = new Subject<{ connectionId: number, error: Error }>();

    public reader = new RpcBinaryMessageReader(
        (v) => {
            this.stats.increase('incoming', 1);
            this.onMessage(v);
        },
        (id) => {
            this.writer!(createRpcMessage(id, RpcTypes.ChunkAck), this.writerOptions, this.stats);
        },
    );

    public constructor(
        public transport: ClientTransportAdapter,
        protected stats: RpcStats,
    ) {
    }

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

        this.connection.next(false);
        this.connected = false;
        this.onClose(error);
        const id = this.connectionId;
        this.connectionId++;
        this.disconnected.next(id);
    }

    // this is overridden in RpcClient
    public onClose(error?: Error) {

    }

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

    public async onAuthenticate(token?: any): Promise<void> {
    }

    public onMessage(message: RpcMessage) {
    }

    public async disconnect() {
        // we have to wait for ongoing connection attempts
        while (this.connectionPromise) {
            // a failed attempt leaves nothing to disconnect; rethrowing its error
            // made disconnect() reject because some other connect() failed
            await this.connectionPromise.catch(() => undefined);
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
                    this.writer = createWriter(transport, this.writerOptions, this.reader);

                    this.connected = false;
                    this.connectionTries = 0;

                    try {
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

                read: (message: RpcMessage) => {
                    this.stats.increase('incoming', 1);
                    this.onMessage(message);
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

    public send(message: RpcMessageDefinition, progress?: SingleProgress) {
        if (this.writer === undefined) {
            throw new RpcError('Transport connection not created yet');
        }

        try {
            this.writer(message, this.writerOptions, this.stats, progress);
        } catch (error: any) {
            if (error instanceof ValidationError) throw error;
            throw new OfflineError(error, { cause: error });
        }
    }
}

export class RpcClientPeer {
    constructor(
        protected actionClient: RpcActionClient,
        protected peerId: string,
        protected onDisconnect: (peerId: string) => void,
    ) {

    }

    public controller<T>(nameOrDefinition: string | ControllerDefinition<T>, options: {
        timeout?: number,
        dontWaitForConnection?: true
    } = {}): RemoteController<T> {
        const controller = new RpcControllerState('string' === typeof nameOrDefinition ? nameOrDefinition : nameOrDefinition.path);
        controller.peerId = this.peerId;

        return new Proxy(this, {
            get: (target, propertyName) => {
                return (...args: any[]) => {
                    return this.actionClient.action(controller, propertyName as string, args, options);
                };
            },
        }) as any as RemoteController<T>;
    }

    disconnect() {
        this.onDisconnect(this.peerId);
    }
}


export type RpcEventMessage = { id: number, date: Date, type: number, body: any };
export type RpcClientEventIncomingMessage =
    { event: 'incoming', composite: boolean, messages: RpcEventMessage[] }
    & RpcEventMessage;
export type RpcClientEventOutgoingMessage =
    { event: 'outgoing', composite: boolean, messages: RpcEventMessage[] }
    & RpcEventMessage;

export type RpcClientEvent = RpcClientEventIncomingMessage | RpcClientEventOutgoingMessage;

export class RpcBaseClient implements WritableClient {
    protected messageId: number = 1;
    protected replies = new Map<number, RpcMessageSubject>();

    public clientStats: RpcStats = new RpcStats;

    public actionClient = new RpcActionClient(this);
    public readonly token = new RpcClientToken(undefined);
    public readonly transporter: RpcClientTransporter;

    public username?: string;

    public typeReuseDisabled: boolean = false;

    public events = new Subject<RpcClientEvent>();

    constructor(
        protected transport: ClientTransportAdapter,
    ) {
        this.transporter = new RpcClientTransporter(this.transport, this.clientStats);
        this.transporter.onMessage = this.onMessage.bind(this);
        this.transporter.onHandshake = this.onHandshake.bind(this);
        this.transporter.onAuthenticate = this.onAuthenticate.bind(this);
        this.transporter.onClose = this.onClose.bind(this);
    }

    onClose(error?: Error) {
        for (const subject of this.replies.values()) {
            subject.disconnect(error);
        }
        this.replies.clear();
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

        const reply: RpcMessage = await this.sendMessage<rpcAuthenticate>(RpcTypes.Authenticate, { token }, undefined, { dontWaitForConnection: true })
            .waitNextMessage();

        if (reply.isError()) throw reply.getError();

        if (reply.type === RpcTypes.AuthenticateResponse) {
            const body = reply.parseBody<rpcResponseAuthenticate>();
            this.username = body.username;
            return;
        }

        throw new RpcError('Invalid response');
    }

    protected async onHandshake(): Promise<Uint8Array | undefined> {
        return undefined;
    }

    public getId(): Uint8Array {
        throw new RpcError('RpcBaseClient does not load its client id, and thus does not support peer message');
    }

    protected onMessage(message: RpcMessage) {
        if (this.events.observers.length) {
            this.events.next({
                event: 'incoming',
                ...message.debug(),
            });
        }

        // console.log('client: received message', message.id, message.type, RpcTypes[message.type], message.routeType);

        if (message.type === RpcTypes.Entity) {
            this.actionClient.entityState.handle(message);
        } else {
            const subject = this.replies.get(message.id);
            if (subject) subject.next(message);
        }
    }

    debug() {
        return {
            activeMessages: this.replies.size,
        };
    }

    public sendMessage<T>(
        type: number,
        body?: T,
        schema?: ReceiveType<T>,
        options: {
            dontWaitForConnection?: boolean,
            connectionId?: number,
            peerId?: string,
            timeout?: number;
        } = {},
    ): RpcMessageSubject {
        const resolvedSchema = schema ? resolveReceiveType(schema) : undefined;
        if (body && !schema) throw new RpcError('Body given, but not type');
        const id = this.messageId++;
        const connectionId = options && options.connectionId ? options.connectionId : this.transporter.connectionId;
        const dontWaitForConnection = !!options.dontWaitForConnection;
        // const timeout = options && options.timeout ? options.timeout : 0;

        const continuation = <T>(type: number, body?: T, schema?: ReceiveType<T>) => {
            if (connectionId === this.transporter.connectionId) {
                //send a message with the same id. Don't use sendMessage() again as this would lead to a memory leak
                // and a new id generated. We want to use the same id.
                if (this.events.observers.length) {
                    this.events.next({
                        event: 'outgoing',
                        date: new Date,
                        id, type, body, messages: [], composite: false,
                    });
                }
                const message = createRpcMessage(id, type, body, undefined, schema);
                this.transporter.send(message);
            }
        };

        const subject = new RpcMessageSubject(continuation, () => {
            this.replies.delete(id);
        });

        this.replies.set(id, subject);

        const progress = ClientProgress.getNext();
        if (progress) {
            this.transporter.reader.registerProgress(id, progress.download);
        }

        if (dontWaitForConnection || this.transporter.isConnected()) {
            const message = options && options.peerId
                ? createRpcMessagePeer(id, type, this.getId(), options.peerId, body, resolvedSchema)
                : createRpcMessage(id, type, body, undefined, resolvedSchema);

            if (this.events.observers.length) {
                this.events.next({
                    event: 'outgoing',
                    date: new Date,
                    id, type, body, messages: [], composite: false,
                });
            }

            this.transporter.send(message, progress?.upload);
        } else {
            this.connect().then(() => {
                //this.getId() only now available
                const message = options && options.peerId
                    ? createRpcMessagePeer(id, type, this.getId(), options.peerId, body, resolvedSchema)
                    : createRpcMessage(id, type, body, undefined, resolvedSchema);

                if (this.events.observers.length) {
                    this.events.next({
                        event: 'outgoing',
                        date: new Date,
                        id, type, body, messages: [], composite: false,
                    });
                }
                this.transporter.send(message, progress?.upload);
            }, () => {
                // we ignore errors here since created `RpcMessageSubject` receive them
                // onClose(error)
            });
        }

        return subject;
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

    protected async onHandshake(): Promise<Uint8Array | undefined> {
        this.clientKernelConnection = undefined;
        if (this.transport.supportsPeers && !this.transport.supportsPeers()) return;

        const reply = await this.sendMessage(RpcTypes.ClientId, undefined, undefined, { dontWaitForConnection: true })
            .firstThenClose<rpcClientId>(RpcTypes.ClientIdResponse);
        return reply.id;
    }

    protected peerKernelConnection = new Map<string, RpcKernelConnection>();

    public async ping(): Promise<void> {
        await this.sendMessage(RpcTypes.Ping).waitNext(RpcTypes.Pong);
    }

    protected onMessage(message: RpcMessage) {
        if (message.routeType === RpcMessageRouteType.peer) {
            if (!this.peerKernel) return;

            const peerId = message.getPeerId();
            if (this.registeredAsPeer !== peerId) return;

            let connection = this.peerKernelConnection.get(peerId);
            if (!connection) {
                //todo: create a connection per message.getSource()
                const writer = {
                    close: () => {
                        if (connection) connection.close();
                        this.peerKernelConnection.delete(peerId);
                    },
                    write: (answer: RpcMessageDefinition) => {
                        //should we modify the package?
                        this.transporter.send(answer);
                    },
                };

                //todo: set up timeout for idle detection. Make the timeout configurable

                const c = this.peerKernel.createConnection(writer);
                if (!(c instanceof RpcKernelConnection)) throw new RpcError('Expected RpcKernelConnection from peerKernel.createConnection');
                connection = c;
                connection.myPeerId = peerId; //necessary so that the kernel does not redirect the package again.
                this.peerKernelConnection.set(peerId, connection);
            }

            connection.handleMessage(message);
        } else {
            if (message.routeType === RpcMessageRouteType.server) {
                if (!this.clientKernel) {
                    this.transporter.send(createErrorMessage(message.id, 'RpcClient has no controllers registered', RpcMessageRouteType.server));
                    return;
                }
                if (!this.clientKernelConnection) {
                    const c = this.clientKernel.createConnection({
                        write: (answer: RpcMessageDefinition) => {
                            this.transporter.send(answer);
                        },
                        close: () => {
                            this.transporter.disconnect().catch(() => undefined);
                        },
                        clientAddress: () => {
                            return this.transporter.clientAddress();
                        },
                        bufferedAmount: () => {
                            return this.transporter.bufferedAmount();
                        },
                    });
                    // Important to disable since transporter.send chunks already,
                    // otherwise data is chunked twice and protocol breaks.
                    c.transportOptions.chunkSize = 0;
                    if (!(c instanceof RpcKernelConnection)) throw new RpcError('Expected RpcKernelConnection from clientKernel.createConnection');
                    this.clientKernelConnection = c;
                }
                this.clientKernelConnection.routeType = RpcMessageRouteType.server;
                this.clientKernelConnection.handleMessage(message);
                return;
            }
            super.onMessage(message);
        }
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

        await this.sendMessage<rpcPeerRegister>(RpcTypes.PeerRegister, { id }).firstThenClose(RpcTypes.Ack);
        this.registeredAsPeer = id;

        return {
            deregister: async () => {
                await this.sendMessage<rpcPeerDeregister>(RpcTypes.PeerDeregister, { id }).firstThenClose(RpcTypes.Ack);
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

    public controller<T>(nameOrDefinition: string | ControllerDefinition<T>, options: {
        timeout?: number,
        dontWaitForConnection?: true,
        typeReuseDisabled?: boolean
    } = {}): RemoteController<T> {
        const controller = new RpcControllerState('string' === typeof nameOrDefinition ? nameOrDefinition : nameOrDefinition.path);

        options = options || {};
        if ('undefined' === typeof options.typeReuseDisabled) {
            options.typeReuseDisabled = this.typeReuseDisabled;
        }

        return new Proxy(this, {
            get: (target, propertyName) => {
                return (...args: any[]) => {
                    return this.actionClient.action(controller, propertyName as string, args, options);
                };
            },
        }) as any as RemoteController<T>;
    }

}
