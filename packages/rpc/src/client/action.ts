/*
 * Deepkit Framework
 * Copyright (C) 2021 Deepkit UG, Marc J. Schmidt
 *
 * This program is free software: you can redistribute it and/or modify
 * it under the terms of the MIT License.
 *
 * You should have received a copy of the MIT License along with this program.
 */
import { BehaviorSubject, Observable, Subject, Subscriber } from 'rxjs';
import { skip } from 'rxjs/operators';

import { AutoBufferSerializer } from '@deepkit/bson';
import { ClassType, asyncOperation, toFastProperties } from '@deepkit/core';
import { ProgressTracker, ProgressTrackerState } from '@deepkit/core-rxjs';
import { SequentialContextDispatcher } from '@deepkit/net';
import {
    ReflectionKind,
    Type,
    TypeObjectLiteral,
    TypePropertySignature,
    ValidationError,
    assertType,
    deserialize,
    deserializeType,
    serialize,
    typeOf,
} from '@deepkit/type';

import { ReturnDeserializer, createParameterSerializer, createReturnDeserializer, getBodyCodec } from '../action.js';
import { Collection, CollectionQueryModelInterface, CollectionState } from '../collection.js';
import { ParsedSchemaEntry, ParsedSchemaMapping, parseSchemaMapping, schemaMapping } from '../encoders.js';
import { ActionMode, IdInterface, RpcError, rpcCollectionRemove, rpcCollectionSort } from '../model.js';
import { ClientProgress, Progress, SingleProgress } from '../progress.js';
import {
    ChannelSubType,
    CollectionChangeKind,
    ControlOp,
    MessageFlag,
    RouteFlag,
    channelBodyOffset,
    connectionContextBase,
    frameMemory,
    getBodyOffset,
    readChannelSubscription,
    readErrorTuple,
    readUint16LE,
    readUint32LE,
    readVarint,
    rpcDecodeError,
    varintEnd,
    writeActionFrameTransient,
    writeControlFrameTransient,
    writeControlIdFrameTransient,
    writeHelloFrameTransient,
} from '../protocol.js';
import { EntityState, EntitySubjectStore } from './entity-state.js';
import { OfflineError } from './errors.js';

type ControllerStateActionTypes = {
    mode: ActionMode;
    resultSchema: TypeObjectLiteral; //with v as property
    parameters: Type;
    collectionItems?: Type; //T[]
    collectionQueryModel?: Type;
    classType?: ClassType; //if method returns an classType, this is set here
};

type ControllerStateActionState = {
    promise?: Promise<ControllerStateActionTypes>;
    types?: ControllerStateActionTypes;
    fast?: FastAction | false;
    /** The schema `fast` was resolved against, also when the action was not part of it. */
    fastEpoch?: number;
};

type FrameCallback = (buffer: Uint8Array, start: number, end: number) => void;

function noopFrame(): void {}

/**
 * An action resolved against the schema of the connected server.
 */
interface FastAction {
    action: number;
    label: string;
    controller: string;
    method: string;
    serialize: AutoBufferSerializer;
    deserialize: ReturnDeserializer;
    /** Compiled when the first stream value arrives. */
    deserializeNext?: ReturnDeserializer;
    valueType: Type;
    schemaEpoch: number;
    /** Parameters of the action, or -1 with a rest parameter. */
    arity: number;
    types: ControllerStateActionTypes;
    onReply: FrameCallback;
    route: RouteFlag;
    routeData?: Uint8Array;
}

export interface RpcFastHost {
    getSchemaMapping(): ParsedSchemaMapping | undefined;

    getSchemaEpoch(): number;

    isActionReady(dontWaitForConnection?: boolean): boolean;

    getContexts(): SequentialContextDispatcher<FrameCallback>;

    getChunkSize(): number;

    sendActionFrame(buffer: Uint8Array, size: number, progress?: SingleProgress): void;

    /** Whether somebody listens to client.events, which is built for that only. */
    isObserved(): boolean;

    emitEvent(event: any): void;

    connectForAction(): Promise<unknown>;

    hasBinaryTransport(): boolean;

    currentConnectionId(): number;

    /** The route of what this side sends: client to server, or server to client. */
    getRoute(): RouteFlag;

    /** Controllers can be registered while connected, this asks for the actions again. */
    refreshSchema?(): Promise<unknown>;

    registerDownloadProgress?(id: number, progress: SingleProgress): void;

    /** <source:16><peerId>\0 for a frame to the given peer. */
    getPeerRoute?(peerId: string): Uint8Array;

    getHttpTransport?(): RpcHttpTransport | undefined;

    getToken?(): any;
}

export interface RpcHttpActionTypes {
    mode: ActionMode;
    type: any;
    parameters: any;
}

/** A transport that calls actions by name, one request per call, without a connection or streams. */
export interface RpcHttpTransport {
    requestTypes(controller: string, method: string, token: any): Promise<RpcHttpActionTypes>;

    requestCall(controller: string, method: string, args: any[], token: any): Promise<any>;
}

export class RpcControllerState {
    protected state: { [method: string]: ControllerStateActionState } = {};
    public peerId?: string;

    constructor(public controller: string) {}

    getState(method: string): ControllerStateActionState {
        let state = this.state[method];
        if (state) return state;
        state = this.state[method] = {};
        toFastProperties(this.state);
        return state;
    }
}

interface ActionState {
    actionClient: RpcActionClient;
    peerId?: string;
    action: string;
    progress?: Progress;
    finalizer: FinalizationRegistry<any>;
    entityState?: EntityState;
    observableRef?: WeakRef<Observable<any>>;
    observableSubjectRef?: WeakRef<Subject<any>>;
    /**
     * Strong reference to the observable/subject while it has subscribers, see keepAliveWhileSubscribed().
     */
    observableKeepAlive?: Observable<any>;

    //necessary for BehaviorSubject, since we get ObservableNext before the Observable type call
    firstObservableNextCalled?: true;
    firstObservableNext?: any;

    collectionRef?: WeakRef<Collection<any>> | undefined;
    collectionEntityStore?: EntitySubjectStore<any>;
    types: ControllerStateActionTypes;
    fast: FastAction;

    subscriberId?: number;
    subscribers?: { [id: number]: Subscriber<any> };
    /** How many subscribers an Observable has right now. */
    activeSubscribers?: number;

    resolve?: (v: any) => void;
    reject?: (error: any) => void;
}

function handleCollection(
    entityStore: EntitySubjectStore<any>,
    types: ControllerStateActionTypes,
    collection: Collection<any>,
    buffer: Uint8Array,
    offset: number,
    end: number,
) {
    while (offset < end) {
        const kind = buffer[offset++] as CollectionChangeKind;
        const size = readUint32LE(buffer, offset);
        offset += 4;
        const bodyEnd = offset + size;
        applyCollectionEntry(entityStore, types, collection, kind, buffer, offset, bodyEnd);
        offset = bodyEnd;
    }
    collection.loaded();
}

function applyCollectionEntry(
    entityStore: EntitySubjectStore<any>,
    types: ControllerStateActionTypes,
    collection: Collection<any>,
    kind: CollectionChangeKind,
    buffer: Uint8Array,
    offset: number,
    end: number,
) {
    switch (kind) {
        case CollectionChangeKind.State: {
            collection.setState(getBodyCodec(typeOf<CollectionState>()).deserialize(buffer, offset, end));
            break;
        }

        case CollectionChangeKind.Sort: {
            const body = getBodyCodec(typeOf<rpcCollectionSort>()).deserialize(buffer, offset, end);
            collection.setSort(body.ids);
            break;
        }

        case CollectionChangeKind.Model: {
            if (!types.collectionQueryModel) throw new RpcError('No collectionQueryModel set');
            collection.model.set(getBodyCodec(types.collectionQueryModel).deserialize(buffer, offset, end));
            break;
        }

        case CollectionChangeKind.Update:
        case CollectionChangeKind.Add: {
            if (!types.collectionItems) return;
            const incomingItems = getBodyCodec(types.collectionItems).deserialize(buffer, offset, end) as IdInterface[];
            const items: IdInterface[] = [];

            for (const item of incomingItems) {
                if (!entityStore.isRegistered(item.id)) entityStore.register(item);
                if (kind === CollectionChangeKind.Update) entityStore.onSet(item.id, item);

                let fork = collection.entitySubjects.get(item.id);
                if (!fork) {
                    fork = entityStore.createFork(item.id);
                    collection.entitySubjects.set(item.id, fork);
                }
                items.push(fork.value);

                //fork is automatically unsubscribed once removed from the collection
                fork.pipe(skip(1)).subscribe(i => {
                    if (fork!.deleted) return; //we get deleted already
                    collection.deepChange.next(i);
                    collection.loaded();
                });
            }

            if (kind === CollectionChangeKind.Add) collection.add(items);
            else collection.update(items);
            break;
        }

        case CollectionChangeKind.Remove: {
            const body = getBodyCodec(typeOf<rpcCollectionRemove>()).deserialize(buffer, offset, end);
            collection.remove(body.ids); //this unsubscribes its EntitySubject as well
            break;
        }

        case CollectionChangeKind.Set: {
            if (!types.collectionItems) return;
            const incomingItems = getBodyCodec(types.collectionItems).deserialize(buffer, offset, end) as IdInterface[];
            const items: IdInterface[] = [];
            for (const item of incomingItems) {
                if (!entityStore.isRegistered(item.id)) entityStore.register(item);
                const fork = entityStore.createFork(item.id);
                collection.entitySubjects.set(item.id, fork);
                items.push(fork.value);

                //fork is automatically unsubscribed once removed from the collection
                fork.pipe(skip(1)).subscribe(i => {
                    if (fork.deleted) return; //we get deleted already
                    collection.deepChange.next(i);
                    collection.loaded();
                });
            }

            collection.set(items);
            break;
        }
    }
}

/**
 * Observables/Subjects are only weakly referenced, so that dropping them frees the server-side
 * resources via the finalizer. While they have subscribers (e.g. `await subject.toPromise()`),
 * user code might not reference them anymore either, so V8 could collect them mid-stream and the
 * subscription would never complete. Keep a strong reference via the action state (reachable
 * through the client's active replies) as long as there are subscribers.
 */
function keepAliveWhileSubscribed(
    state: ActionState,
    observable: Observable<any>,
    hooks?: { first(): void; last(subject: Subject<any>): void },
) {
    let subscriptions = 0;
    const subscribe = observable.subscribe;
    observable.subscribe = function (this: Observable<any>, ...args: any[]) {
        const subscription = subscribe.apply(this, args as any);
        if (subscription.closed) return subscription;
        if (++subscriptions === 1) hooks?.first();
        state.observableKeepAlive = this;
        subscription.add(() => {
            if (--subscriptions !== 0) return;
            state.observableKeepAlive = undefined;
            hooks?.last(this as Subject<any>);
        });
        return subscription;
    } as any;
}

function rejectAction(state: ActionState, error: any) {
    if (!state.reject) return;
    state.reject(error);

    // important to free Promise
    state.reject = undefined;
    state.resolve = undefined;
}

function resolveAction(state: ActionState, result: any) {
    if (!state.resolve) return;
    state.resolve(result);

    // important to free Promise
    state.reject = undefined;
    state.resolve = undefined;
}

function deliverObservableNext(state: ActionState, subscription: number, value: any) {
    if (state.observableRef) {
        if (!state.subscribers?.[subscription]) return; //we silently ignore this
        state.subscribers[subscription].next(value);
    } else if (state.observableSubjectRef) {
        const s = state.observableSubjectRef.deref();
        if (s && !s.closed) s.next(value);
    } else {
        state.firstObservableNext = value;
        state.firstObservableNextCalled = true;
    }
}

/** The action returned a stream: creates what the caller gets for it. */
function onObservableAnnounced(type: ChannelSubType, subject: ClientStream, state: ActionState) {
    if (state.observableRef) return;

    // this observable can be subscribed multiple times now
    // each time we need to call the server again, since it's not a Subject
    if (type === ChannelSubType.Observable) {
        state.subscriberId = 0;
        state.subscribers = {};
        state.activeSubscribers = 0;

        // An Observable can be subscribed any time later, so it has to outlive its subscribers. A context
        // id is scarce and only comes back when the server confirmed the end, so while nobody is subscribed
        // the observable waits on the server under a token, without a context.
        let link = subject;
        let token: number | undefined;
        let detached = false;
        let dropped = false;
        let connection = 0;

        const detach = () => {
            if (detached || dropped || state.activeSubscribers !== 0) return;
            detached = true;
            connection = state.actionClient.connectionOfStream();
            token ??= state.actionClient.nextDetachToken();
            link.sendId(ControlOp.Detach, token);
            link.release();
        };

        const observable = new Observable(observer => {
            if (detached) {
                link = state.actionClient.attachObservable(token!, state, connection);
                detached = false;
            }
            const id = state.subscriberId!++;
            state.subscribers![id] = observer;
            state.activeSubscribers!++;
            link.sendId(ControlOp.Subscribe, id);

            return {
                unsubscribe: () => {
                    delete state.subscribers![id];
                    state.activeSubscribers!--;
                    link.sendId(ControlOp.Unsubscribe, id);
                    detach();
                },
            };
        });
        state.observableRef = new WeakRef(observable);
        keepAliveWhileSubscribed(state, observable);
        state.finalizer.register(observable, () => {
            dropped = true;
            if (detached) {
                state.actionClient.dropObservable(token!, state, connection);
            } else {
                link.send(ControlOp.Disconnect);
                link.release();
            }
        });
        // never subscribed at all: nothing else would give the context back
        state.actionClient.detachWhenIdle(detach);
        resolveAction(state, observable);
    } else if (type === ChannelSubType.Subject) {
        const observableSubject = new Subject();
        let freed = false;
        let paused = false;
        state.observableSubjectRef = new WeakRef(observableSubject);
        // A Subject without subscribers drops its values, so the server doesn't need to keep observing and
        // sending them. The client Subject stays usable: a new subscriber attaches the server observer again.
        keepAliveWhileSubscribed(state, observableSubject, {
            first() {
                if (!paused || freed) return;
                paused = false;
                subject.send(ControlOp.SubjectResume);
            },
            // takes the Subject as argument: this scope must not capture it, otherwise the finalizer callback,
            // which shares the scope, keeps it alive and it's never collected
            last(observable) {
                if (freed || observable.closed || observable.isStopped) return;
                paused = true;
                subject.send(ControlOp.SubjectPause);
            },
        });

        // we have to monkey patch unsubscribe, because there is no other way to hook into that
        // note: subject.subscribe().add(T), T is not called when subject.unsubscribe() is called.
        observableSubject.unsubscribe = function () {
            Subject.prototype.unsubscribe.call(this);
            state.observableKeepAlive = undefined;
            if (!freed) {
                freed = true;
                subject.send(ControlOp.SubjectUnsubscribe);
                state.finalizer.unregister(this);
                subject.release();
            }
        };

        observableSubject.complete = function () {
            Subject.prototype.complete.call(this);
            if (!freed) {
                freed = true;
                subject.send(ControlOp.SubjectUnsubscribe);
                state.finalizer.unregister(this);
                subject.release();
            }
        };

        if (state.firstObservableNextCalled) {
            observableSubject.next(state.firstObservableNext);
            state.firstObservableNext = undefined;
        }

        state.finalizer.register(observableSubject, () => {
            subject.send(ControlOp.SubjectUnsubscribe);
            freed = true;
            subject.release();
        });
        resolveAction(state, observableSubject);
    } else if (type === ChannelSubType.BehaviorSubject || type === ChannelSubType.ProgressTracker) {
        const classType = type === ChannelSubType.ProgressTracker ? ProgressTracker : BehaviorSubject;
        const observableSubject = new classType(state.firstObservableNext);
        state.observableSubjectRef = new WeakRef(observableSubject);
        keepAliveWhileSubscribed(state, observableSubject);
        state.firstObservableNext = undefined;
        let freed = false;

        // we have to monkey patch unsubscribe, because there is no other way to hook into that
        // note: subject.subscribe().add(T), T is not called when subject.unsubscribe() is called.
        observableSubject.unsubscribe = function () {
            Subject.prototype.unsubscribe.call(this);
            state.observableKeepAlive = undefined;
            if (!freed) {
                freed = true;
                subject.send(ControlOp.SubjectUnsubscribe);
                state.finalizer.unregister(this);
                subject.release();
            }
        };

        observableSubject.complete = function () {
            Subject.prototype.complete.call(this);
            if (!freed) {
                freed = true;
                subject.send(ControlOp.SubjectUnsubscribe);
                state.finalizer.unregister(this);
                subject.release();
            }
        };

        if (observableSubject instanceof ProgressTracker) {
            // whenever the client changes something, it's synced back to the server.
            // this is important to handle the stop signal.
            const oldChanged = observableSubject.changed;
            observableSubject.changed = function (this: ProgressTracker) {
                subject.send(
                    ControlOp.ProgressNext,
                    getBodyCodec(typeOf<ProgressTrackerState[]>()).serialize,
                    this.value,
                );
                return oldChanged.apply(this);
            };
        }

        state.finalizer.register(observableSubject, () => {
            subject.send(ControlOp.SubjectUnsubscribe);
            subject.release();
        });
        resolveAction(state, observableSubject);
    }
}

function collectionReady(state: ActionState, stream: ClientStream, buffer: Uint8Array, offset: number, end: number) {
    const types = state.types;
    if (!types.classType) throw new RpcError('No classType returned by the rpc action');
    if (!types.collectionQueryModel) throw new RpcError('No collectionQueryModel returned by the rpc action');
    if (!state.entityState) throw new RpcError('No entityState set');
    const collection = new Collection(types.classType);
    state.collectionRef = new WeakRef(collection);
    state.collectionEntityStore = state.entityState.getStore(types.classType);

    collection.model.change.subscribe(() => {
        stream.send(ControlOp.CollectionModel, getBodyCodec(types.collectionQueryModel!).serialize, collection!.model);
    });

    collection.addTeardown(() => {
        stream.send(ControlOp.CollectionUnsubscribe);
        stream.release();
    });

    handleCollection(state.collectionEntityStore, types, collection, buffer, offset, end);
    resolveAction(state, collection);
}

/** One open context of a stream or collection. Everything it receives comes through onFrame. */
class ClientStream {
    protected released = false;
    protected endSeen = false;
    protected readonly connectionId: number;

    constructor(
        readonly client: RpcActionClient,
        readonly host: RpcFastHost,
        readonly id: number,
        readonly state: ActionState,
    ) {
        this.connectionId = host.currentConnectionId();
    }

    protected get open(): boolean {
        return !this.released && this.connectionId === this.host.currentConnectionId();
    }

    send(op: ControlOp, serialize?: AutoBufferSerializer, value?: any): void {
        if (!this.open) return;
        const { route, routeData } = this.state.fast;
        const frameSize = writeControlFrameTransient(this.id, route, op, serialize, value, routeData);
        this.host.sendActionFrame(frameMemory(), frameSize);
    }

    sendId(op: ControlOp, value: number): void {
        if (!this.open) return;
        const { route, routeData } = this.state.fast;
        const frameSize = writeControlIdFrameTransient(this.id, route, op, value, routeData);
        this.host.sendActionFrame(frameMemory(), frameSize);
    }

    protected finish(): void {
        this.host.getContexts().release(this.id);
        this.client.streamEnded(this);
    }

    release(): void {
        if (this.released) return;
        if (this.endSeen || this.connectionId !== this.host.currentConnectionId()) {
            this.released = true;
            this.finish();
            return;
        }
        // the id stays taken until the server confirms it won't send anything on it anymore
        this.send(ControlOp.ContextEnd);
        this.released = true;
    }

    disconnect(error?: Error): void {
        rejectAction(this.state, error || new RpcError('Connection closed'));
        this.released = true;
        this.client.streamEnded(this);
    }

    readonly onFrame: FrameCallback = (buffer, start, end) => {
        const flag = buffer[start + 4];
        const isEnd = (flag & 0b1100) === MessageFlag.ContextEnd;
        if (isEnd) this.endSeen = true;
        if (this.released) {
            if (isEnd) this.finish();
            return;
        }

        try {
            this.handle(flag & 0b0111_0000, buffer, start, end);
        } catch (error) {
            console.warn('reply error', this.id, this.state.action, error);
            rejectAction(this.state, `Reply failed for ${this.state.action}: ${error}`);
        }

        if (isEnd && !this.released) this.release();
    };

    protected handle(type: number, buffer: Uint8Array, start: number, end: number): void {
        const { state, id, host } = this;
        if (type === MessageFlag.TypeChannel) {
            const sub = buffer[start + 7];
            if (sub <= ChannelSubType.Reserved) {
                if (host.isObserved()) this.client.emitIncoming(id, 'stream', { type: sub });
                onObservableAnnounced(sub as ChannelSubType, this, state);
                return;
            }

            const subscription = readChannelSubscription(buffer, start + 7);
            const fast = state.fast;
            const deserializeNext = (fast.deserializeNext ??= createReturnDeserializer(fast.valueType));
            const value = deserializeNext(buffer, channelBodyOffset(buffer, start + 7), end);
            if (host.isObserved()) this.client.emitIncoming(id, 'next', { id: subscription, v: value });
            deliverObservableNext(state, subscription, value);
            return;
        }

        if (type === MessageFlag.TypeError) {
            const encoded = readErrorTuple(buffer, getBodyOffset(buffer, start), end);
            if (host.isObserved()) this.client.emitIncoming(id, 'error', encoded);
            const error = rpcDecodeError(encoded);
            this.release();
            if (state.subscribers) {
                for (const sub of Object.values(state.subscribers)) sub.error(error);
            }
            rejectAction(state, error);
            return;
        }

        if (type !== MessageFlag.TypeControl) return;

        const op = buffer[start + 7] as ControlOp;
        const body = start + 8;
        switch (op) {
            case ControlOp.Collection:
                if (host.isObserved()) this.client.emitIncoming(id, 'collection', undefined);
                collectionReady(state, this, buffer, body, end);
                break;

            case ControlOp.CollectionChange: {
                if (!state.collectionRef) throw new RpcError('No collection loaded yet');
                if (!state.collectionEntityStore) throw new RpcError('no collectionEntityStore loaded yet');
                const collection = state.collectionRef.deref();
                if (collection)
                    handleCollection(state.collectionEntityStore, state.types, collection, buffer, body, end);
                break;
            }

            case ControlOp.Complete: {
                const subscription = readVarint(buffer, body);
                if (host.isObserved()) this.client.emitIncoming(id, 'complete', { id: subscription });
                if (state.observableRef) {
                    state.subscribers?.[subscription]?.complete();
                } else if (state.observableSubjectRef) {
                    state.observableSubjectRef.deref()?.complete();
                    this.release();
                }
                break;
            }

            case ControlOp.StreamError: {
                const subscription = readVarint(buffer, body);
                const encoded = readErrorTuple(buffer, varintEnd(buffer, body), end);
                if (host.isObserved()) this.client.emitIncoming(id, 'error', encoded);
                const error = rpcDecodeError(encoded);
                if (state.observableRef) {
                    state.subscribers?.[subscription]?.error(error);
                } else if (state.observableSubjectRef) {
                    state.observableSubjectRef.deref()?.error(error);
                    this.release();
                }
                break;
            }
        }
    }
}

function createActionTypes(mode: ActionMode, returnType: Type, parameters: Type): ControllerStateActionTypes {
    let collectionItems: Type | undefined;
    let collectionQueryModel: Type | undefined;
    let unwrappedReturnType = returnType;
    if (unwrappedReturnType.kind === ReflectionKind.promise) unwrappedReturnType = unwrappedReturnType.type;
    const classType: ClassType | undefined =
        unwrappedReturnType.kind === ReflectionKind.class ? unwrappedReturnType.classType : undefined;

    if (mode === 'collection') {
        collectionQueryModel = typeOf<CollectionQueryModelInterface<unknown>>([
            unwrappedReturnType,
        ]) as TypeObjectLiteral;
        collectionItems = { kind: ReflectionKind.array, type: unwrappedReturnType };
    }

    return {
        mode,
        classType,
        collectionQueryModel,
        collectionItems,
        parameters,
        resultSchema: {
            kind: ReflectionKind.objectLiteral,
            types: [{ kind: ReflectionKind.propertySignature, name: 'v', type: unwrappedReturnType }],
        } as TypeObjectLiteral,
    };
}

/**
 * The proxy behind client.controller<T>(). Each method is created once, not per call.
 */
export function createRemoteController<T>(
    actionClient: RpcActionClient,
    controller: RpcControllerState,
    options: {
        timeout?: number;
        dontWaitForConnection?: true;
        typeReuseDisabled?: boolean;
    },
): T {
    // The Proxy is only hit the first time a method is read. It then becomes a property of the object in front,
    // and from there on the methods are plain property reads.
    const lookup = new Proxy(
        {},
        {
            get: (target, propertyName, receiver) => {
                return installMethod(
                    receiver,
                    propertyName,
                    createMethod(actionClient, controller, propertyName, options, receiver),
                );
            },
        },
    );
    return Object.create(lookup) as T;
}

function installMethod(receiver: any, name: string | symbol, method: Function): Function {
    Object.defineProperty(receiver, name, { value: method, writable: true, configurable: true, enumerable: false });
    return method;
}

/** The arguments are copied from `arguments`, a rest parameter would allocate its array per call. */
function createMethod(
    actionClient: RpcActionClient,
    controller: RpcControllerState,
    name: string | symbol,
    options: any,
    receiver: any,
) {
    const method = function () {
        const count = arguments.length;
        const args = actionClient.takeArgs(count);
        for (let i = 0; i < count; i++) args[i] = arguments[i];
        const result = actionClient.action(controller, name as string, args, options);
        const fast = controller.getState(name as string).fast;
        if (fast && fast.arity >= 0 && fast.arity <= 4) {
            installMethod(
                receiver,
                name,
                createFixedMethod(actionClient, controller, name as string, options, fast, receiver, method),
            );
        }
        return result;
    };
    return method;
}

/**
 * Once the parameters of an action are known it needs neither `arguments` nor a rest parameter.
 * A missing argument is undefined, the same as what the encoder then leaves out.
 */
function createFixedMethod(
    actionClient: RpcActionClient,
    controller: RpcControllerState,
    name: string,
    options: any,
    fast: FastAction,
    receiver: any,
    method: (...args: any[]) => any,
) {
    const state = controller.getState(name);
    const dontWait = options.dontWaitForConnection;
    const call = (args: any[]) =>
        actionClient.fastCall(fast, args, dontWait) ?? actionClient.action(controller, name, args, options);
    const fallback = (a?: any, b?: any, c?: any, d?: any) => {
        // the schema changed with a reconnect, the arity may be a different one now
        installMethod(receiver, name, method);
        return method(a, b, c, d);
    };

    switch (fast.arity) {
        case 0:
            return function () {
                if (state.fast !== fast) return fallback();
                return call(actionClient.takeArgs(0));
            };
        case 1:
            return function (a: any) {
                if (state.fast !== fast) return fallback(a);
                const args = actionClient.takeArgs(1);
                args[0] = a;
                return call(args);
            };
        case 2:
            return function (a: any, b: any) {
                if (state.fast !== fast) return fallback(a, b);
                const args = actionClient.takeArgs(2);
                args[0] = a;
                args[1] = b;
                return call(args);
            };
        case 3:
            return function (a: any, b: any, c: any) {
                if (state.fast !== fast) return fallback(a, b, c);
                const args = actionClient.takeArgs(3);
                args[0] = a;
                args[1] = b;
                args[2] = c;
                return call(args);
            };
        default:
            return function (a: any, b: any, c: any, d: any) {
                if (state.fast !== fast) return fallback(a, b, c, d);
                const args = actionClient.takeArgs(4);
                args[0] = a;
                args[1] = b;
                args[2] = c;
                args[3] = d;
                return call(args);
            };
    }
}

export class RpcActionClient {
    public entityState = new EntityState();

    private finalizer = new FinalizationRegistry<() => void>(heldValue => {
        heldValue();
    });

    public fastHost?: RpcFastHost;

    /** The callbacks of the promise of each in-flight call, by context id. */
    protected resolvers: (((value: any) => void) | undefined)[] = [];
    protected rejecters: (((error: any) => void) | undefined)[] = [];

    protected streams = new Set<ClientStream>();

    protected detachToken: number = 0;
    protected idleDetaches = new Set<() => void>();
    protected idleTimer?: ReturnType<typeof setTimeout>;

    /** @internal */
    nextDetachToken(): number {
        return ++this.detachToken;
    }

    /** @internal */
    connectionOfStream(): number {
        return this.fastHost ? this.fastHost.currentConnectionId() : 0;
    }

    /** @internal */
    streamEnded(stream: ClientStream): void {
        this.streams.delete(stream);
    }

    protected openStream(id: number, state: ActionState): ClientStream {
        const stream = new ClientStream(this, this.fastHost!, id, state);
        this.streams.add(stream);
        this.fastHost!.getContexts().set(id, stream.onFrame);
        return stream;
    }

    /** @internal */
    attachObservable(token: number, state: ActionState, connection: number): ClientStream {
        // detached observables live and die with their connection, and this must not open a new one
        if (connection !== this.connectionOfStream()) throw new RpcError('Connection closed');
        const host = this.fastHost!;
        const id = host.getContexts().create(noopFrame);
        const stream = this.openStream(id, state);
        stream.sendId(ControlOp.Attach, token);
        return stream;
    }

    /** @internal */
    dropObservable(token: number, state: ActionState, connection: number): void {
        if (connection !== this.connectionOfStream()) return;
        try {
            const { route, routeData } = state.fast;
            const frameSize = writeControlIdFrameTransient(0, route, ControlOp.Drop, token, routeData);
            this.fastHost!.sendActionFrame(frameMemory(), frameSize);
        } catch {
            // called by the garbage collector, and the server already forgot it when its connection closed
        }
    }

    /** @internal */
    detachWhenIdle(detach: () => void): void {
        this.idleDetaches.add(detach);
        if (this.idleTimer !== undefined) return;
        this.idleTimer = setTimeout(() => {
            this.idleTimer = undefined;
            const detaches = this.idleDetaches;
            this.idleDetaches = new Set();
            for (const run of detaches) run();
        }, 100);
        (this.idleTimer as any).unref?.();
    }

    /** What the promise executor works on, as the executor itself takes no arguments. */
    protected nextFast?: FastAction;
    /** The id the server counts next, see TypeAction. */
    protected nextContext: number = 1;
    protected nextArgs?: any[];
    protected nextProgress?: Progress;
    protected readonly fastExecutor = this.startFastCall.bind(this);

    protected startFastCall(resolve: (value: any) => void, reject: (error: any) => void): void {
        const fast = this.nextFast!;
        const args = this.nextArgs!;
        const progress = this.nextProgress;
        this.nextFast = undefined;
        this.nextArgs = undefined;
        this.nextProgress = undefined;

        const host = this.fastHost!;
        const contexts = host.getContexts();

        let id: number;
        try {
            id = contexts.create(fast.onReply);
        } catch (error: any) {
            this.releaseArgs(args);
            reject(new RpcError(`Too many active actions on this connection: ${error.message}`, { cause: error }));
            return;
        }

        this.resolvers[id] = resolve;
        this.rejecters[id] = reject;

        try {
            if (progress) host.registerDownloadProgress?.(id, progress.download);
            // calls to a peer and calls that arrive late can't take part in counting the ids
            const counted = fast.routeData === undefined && progress === undefined;
            let size = writeActionFrameTransient(
                id,
                fast.action,
                fast.serialize,
                args,
                !counted
                    ? MessageFlag.ContextExisting
                    : id === this.nextContext
                      ? MessageFlag.ContextNew
                      : MessageFlag.ContextEnd,
                fast.route,
                fast.routeData,
            );
            if (counted) {
                const chunkSize = host.getChunkSize();
                if (chunkSize > 0 && size >= chunkSize) {
                    size = writeActionFrameTransient(
                        id,
                        fast.action,
                        fast.serialize,
                        args,
                        MessageFlag.ContextExisting,
                        fast.route,
                        fast.routeData,
                    );
                } else {
                    this.nextContext = id + 1;
                }
            }
            if (host.isObserved()) {
                host.emitEvent({
                    event: 'outgoing',
                    date: new Date(),
                    id,
                    type: 'action',
                    body: { controller: fast.controller, method: fast.method, args: args.slice() },
                });
            }
            this.releaseArgs(args);
            host.sendActionFrame(frameMemory(), size, progress?.upload);
        } catch (error: any) {
            this.releaseArgs(args);
            this.finishFastCall(id);
            contexts.release(id);
            reject(error instanceof ValidationError ? error : new OfflineError(error, { cause: error }));
        }
    }

    /**
     * Arrays for the arguments of a call with a known count, so that a call doesn't create one.
     * The arguments only live until the frame is written.
     */
    protected argArrays: any[][] = Array.from({ length: 9 }, (_, length) => new Array(length).fill(undefined));
    protected argsInUse: any[] | undefined;

    /**
     * The call of a method that knows its action. Returns undefined when it has to go the regular way.
     * @internal
     */
    fastCall(fast: FastAction, args: any[], dontWaitForConnection?: true): Promise<any> | undefined {
        const host = this.fastHost!;
        if (
            ClientProgress.nextProgress !== undefined ||
            fast.schemaEpoch !== host.getSchemaEpoch() ||
            !host.isActionReady(dontWaitForConnection)
        )
            return undefined;
        this.nextFast = fast;
        this.nextArgs = args;
        return new Promise<any>(this.fastExecutor);
    }

    /** @internal */
    takeArgs(count: number): any[] {
        if (this.argsInUse || count >= this.argArrays.length) return new Array(count);
        return (this.argsInUse = this.argArrays[count]);
    }

    protected releaseArgs(args: any[]): void {
        if (args !== this.argsInUse) return;
        this.argsInUse = undefined;
        for (let i = 0; i < args.length; i++) args[i] = undefined;
    }

    /** The arguments as an array that may outlive this call. */
    protected ownArgs(args: any[]): any[] {
        if (args !== this.argsInUse) return args;
        const copy = args.slice();
        this.releaseArgs(args);
        return copy;
    }

    protected finishFastCall(id: number): void {
        this.resolvers[id] = undefined;
        this.rejecters[id] = undefined;
    }

    /** A transfer was aborted: nothing will be answered anymore. */
    public abort(id: number, error: Error): void {
        const reject = this.rejecters[id];
        if (!reject) return;
        this.finishFastCall(id);
        this.fastHost!.getContexts().release(id);
        reject(error);
    }

    /**
     * The connection is gone, nothing on it can be answered anymore.
     */
    public onDisconnect(error?: Error): void {
        this.nextContext = 1;
        const connectionCalls = Array.from(this.connectionCalls.values());
        this.connectionCalls.clear();
        for (const call of connectionCalls) call.reject(error || new RpcError('Connection closed'));
        const rejecters = this.rejecters;
        this.resolvers = [];
        this.rejecters = [];
        for (let id = 0; id < rejecters.length; id++) {
            const reject = rejecters[id];
            if (reject) reject(error || new RpcError('Connection closed'));
        }
        const streams = Array.from(this.streams);
        this.streams.clear();
        for (const stream of streams) stream.disconnect(error);
    }

    /** Open calls to the connection itself, by context id. */
    protected connectionCalls = new Map<number, { onFrame: FrameCallback; reject: (error: any) => void }>();
    protected nextConnectionContext: number = connectionContextBase;

    protected createConnectionContext(onFrame: FrameCallback, reject: (error: any) => void): number {
        do {
            this.nextConnectionContext =
                this.nextConnectionContext === 0xffff ? connectionContextBase : this.nextConnectionContext + 1;
        } while (this.connectionCalls.has(this.nextConnectionContext));
        this.connectionCalls.set(this.nextConnectionContext, { onFrame, reject });
        return this.nextConnectionContext;
    }

    /** @internal */
    onConnectionFrame(id: number, buffer: Uint8Array, start: number, end: number): void {
        const call = this.connectionCalls.get(id);
        if (!call) return;
        this.connectionCalls.delete(id);
        call.onFrame(buffer, start, end);
    }

    /**
     * A call to the connection itself: authentication, peers and the like.
     */
    public systemCall(
        op: ControlOp,
        serialize?: AutoBufferSerializer,
        value?: any,
        deserialize?: ReturnDeserializer,
    ): Promise<any> {
        const host = this.fastHost!;
        return new Promise<any>((resolve, reject) => {
            const id = this.createConnectionContext((buffer, start, end) => {
                const type = buffer[start + 4] & 0b0111_0000;
                if (type === MessageFlag.TypeError) {
                    reject(rpcDecodeError(readErrorTuple(buffer, start + 7, end)));
                } else if (type === MessageFlag.TypeResult && deserialize) {
                    resolve(deserialize(buffer, start + 7, end));
                } else {
                    resolve(undefined);
                }
            }, reject);
            try {
                const frameSize = writeControlFrameTransient(id, host.getRoute(), op, serialize, value);
                host.sendActionFrame(frameMemory(), frameSize);
            } catch (error) {
                this.connectionCalls.delete(id);
                reject(error);
            }
        });
    }

    /** The action schema of a peer, asked for on a context of this connection. */
    protected peerSchemas = new Map<string, { epoch: number; schema: Promise<ParsedSchemaMapping> }>();

    protected getPeerSchema(peerId: string): Promise<ParsedSchemaMapping> {
        const host = this.fastHost!;
        const known = this.peerSchemas.get(peerId);
        if (known && known.epoch === host.getSchemaEpoch()) return known.schema;

        const schema = new Promise<ParsedSchemaMapping>((resolve, reject) => {
            const id = this.createConnectionContext((buffer, start, end) => {
                const type = buffer[start + 4] & 0b0111_0000;
                if (type === MessageFlag.TypeError) {
                    this.peerSchemas.delete(peerId);
                    reject(rpcDecodeError(readErrorTuple(buffer, start + 7, end)));
                    return;
                }
                const offset = start + 7 + 5;
                resolve(end > offset ? parseSchemaMapping(schemaMapping.decode(buffer, offset)) : {});
            }, reject);
            const frameSize = writeHelloFrameTransient(0, MessageFlag.RoutePeer, id, host.getPeerRoute!(peerId));
            host.sendActionFrame(frameMemory(), frameSize);
        });
        this.peerSchemas.set(peerId, { epoch: host.getSchemaEpoch(), schema });
        return schema;
    }

    protected onFastReply(fast: FastAction, buffer: Uint8Array, start: number, end: number): void {
        const flag = buffer[start + 4];
        const id = readUint16LE(buffer, start + 5);
        const contexts = this.fastHost!.getContexts();

        switch (flag & 0b0111_0000) {
            case MessageFlag.TypeResult: {
                const resolve = this.resolvers[id]!;
                const reject = this.rejecters[id]!;
                this.finishFastCall(id);
                contexts.release(id);
                let value: any;
                try {
                    value = fast.deserialize(buffer, start + 7, end);
                    if (fast.types.mode === 'entitySubject') value = this.createEntitySubject(fast, value);
                } catch (error: any) {
                    console.warn('reply error', id, fast.label, error);
                    reject(`Reply failed for ${fast.label}: ${error}`);
                    return;
                }
                if (this.fastHost!.isObserved()) this.emitIncoming(id, 'result', { v: value });
                resolve(value);
                return;
            }

            case MessageFlag.TypeAck: {
                const resolve = this.resolvers[id]!;
                this.finishFastCall(id);
                contexts.release(id);
                if (this.fastHost!.isObserved()) this.emitIncoming(id, 'result', undefined);
                resolve(undefined);
                return;
            }

            case MessageFlag.TypeError: {
                const reject = this.rejecters[id]!;
                this.finishFastCall(id);
                contexts.release(id);
                try {
                    const encoded = readErrorTuple(buffer, getBodyOffset(buffer, start), end);
                    if (this.fastHost!.isObserved()) this.emitIncoming(id, 'error', encoded);
                    reject(rpcDecodeError(encoded));
                } catch (error: any) {
                    console.warn('reply error', id, fast.label, error);
                    reject(`Reply failed for ${fast.label}: ${error}`);
                }
                return;
            }

            case MessageFlag.TypeControl:
            case MessageFlag.TypeChannel: {
                // a BehaviorSubject sends its value before the frame saying what kind of stream this is
                this.upgradeToStream(fast, id, buffer, start, end);
                return;
            }
        }
    }

    protected createEntitySubject(fast: FastAction, item: any): any {
        if (!fast.types.classType) throw new RpcError('No classType returned by the rpc action');
        const store = this.entityState.getStore(fast.types.classType);
        if (!store.isRegistered(item.id)) store.register(item);
        return store.createFork(item.id);
    }

    /** @internal */
    emitIncoming(id: number, type: string, body: any): void {
        this.fastHost!.emitEvent({
            event: 'incoming',
            date: new Date(),
            id,
            type,
            body,
        });
    }

    /**
     * The action returned more than a single value: an observable, subject or collection.
     */
    protected upgradeToStream(fast: FastAction, id: number, buffer: Uint8Array, start: number, end: number): void {
        const state: ActionState = {
            actionClient: this,
            action: fast.label,
            finalizer: this.finalizer,
            types: fast.types,
            fast,
            entityState: this.entityState,
            resolve: this.resolvers[id],
            reject: this.rejecters[id],
        };
        this.finishFastCall(id);
        this.openStream(id, state).onFrame(buffer, start, end);
    }

    protected missingAction(controller: RpcControllerState, method: string, schema?: ParsedSchemaMapping): RpcError {
        if (schema && this.fastHost!.getRoute() === MessageFlag.RouteServer && !Object.keys(schema).length) {
            return new RpcError('RpcClient has no controllers registered');
        }
        return schema?.[controller.controller]
            ? new RpcError(`Action unknown ${method}`)
            : new RpcError(`No controller registered for id ${controller.controller}`);
    }

    protected compileFast(
        controller: RpcControllerState,
        method: string,
        options: { typeReuseDisabled?: boolean },
        schema: ParsedSchemaMapping | undefined,
        route: RouteFlag,
        routeData?: Uint8Array,
    ): FastAction | false {
        const host = this.fastHost!;
        const entry: ParsedSchemaEntry | undefined = schema?.[controller.controller]?.[method];
        if (!entry) return false;
        if (entry.action === -1) throw new RpcError(entry.parameters);

        const disableReuse = options.typeReuseDisabled === true;
        const type = deserializeType(entry.type, { disableReuse });
        const parameters = deserializeType(entry.parameters);
        assertType(parameters, ReflectionKind.tuple);
        const types = createActionTypes(entry.mode, type, parameters);
        const valueType = (types.resultSchema.types[0] as TypePropertySignature).type;

        const fast: FastAction = {
            action: entry.action,
            label: `${controller.controller}.${method}`,
            controller: controller.controller,
            method,
            serialize: createParameterSerializer(parameters),
            deserialize: createReturnDeserializer(valueType),
            valueType,
            schemaEpoch: host.getSchemaEpoch(),
            arity: parameters.types.some(v => v.type.kind === ReflectionKind.rest) ? -1 : parameters.types.length,
            types,
            onReply: undefined as any,
            route,
            routeData,
        };
        fast.onReply = this.onFastReply.bind(this, fast);
        return fast;
    }

    protected resolveFast(
        controller: RpcControllerState,
        method: string,
        options: { typeReuseDisabled?: boolean },
    ): FastAction | false {
        const host = this.fastHost!;
        const state = controller.getState(method);
        if (state.fastEpoch !== host.getSchemaEpoch()) {
            state.fast = this.compileFast(controller, method, options, host.getSchemaMapping(), host.getRoute());
            state.fastEpoch = host.getSchemaEpoch();
        }
        return state.fast || false;
    }

    protected startCall(fast: FastAction, args: any[], progress: Progress | undefined): Promise<any> {
        this.nextFast = fast;
        this.nextArgs = args;
        this.nextProgress = progress;
        return new Promise<any>(this.fastExecutor);
    }

    public action<T>(
        controller: RpcControllerState,
        method: string,
        args: any[],
        options: {
            timeout?: number;
            dontWaitForConnection?: true;
            typeReuseDisabled?: boolean;
        } = {},
    ): Promise<any> {
        const host = this.fastHost!;
        const http = host.getHttpTransport?.();
        if (http) return this.httpCall(http, controller, method, this.ownArgs(args), options);

        const progress = ClientProgress.getNext();

        if (controller.peerId !== undefined) {
            return this.peerCall(controller, method, this.ownArgs(args), options, progress);
        }

        if (!host.isActionReady(options.dontWaitForConnection)) {
            if (options.dontWaitForConnection) {
                this.ownArgs(args);
                return Promise.reject(new OfflineError('Connection is not established'));
            }
            return this.connectThenCall(controller, method, this.ownArgs(args), options, progress);
        }

        let fast: FastAction | false;
        try {
            fast = this.resolveFast(controller, method, options);
        } catch (error) {
            this.ownArgs(args);
            return Promise.reject(error);
        }
        if (fast) return this.startCall(fast, args, progress);
        return this.refreshThenCall(controller, method, this.ownArgs(args), options, progress);
    }

    /** The schema arrives with the connection, so a first call waits for it. */
    protected async connectThenCall(
        controller: RpcControllerState,
        method: string,
        args: any[],
        options: { typeReuseDisabled?: boolean; dontWaitForConnection?: true },
        progress: Progress | undefined,
    ): Promise<any> {
        await this.fastHost!.connectForAction();
        if (!this.fastHost!.isActionReady()) throw new OfflineError('Connection is not established');
        const fast = this.resolveFast(controller, method, options);
        if (fast) return this.startCall(fast, args, progress);
        return this.refreshThenCall(controller, method, args, options, progress);
    }

    /** The controller may have been registered after this connection got its schema. */
    protected async refreshThenCall(
        controller: RpcControllerState,
        method: string,
        args: any[],
        options: { typeReuseDisabled?: boolean },
        progress: Progress | undefined,
    ): Promise<any> {
        const host = this.fastHost!;
        await host.refreshSchema?.();
        controller.getState(method).fastEpoch = undefined;
        const fast = this.resolveFast(controller, method, options);
        if (!fast) throw this.missingAction(controller, method, host.getSchemaMapping());
        return this.startCall(fast, args, progress);
    }

    protected async peerCall(
        controller: RpcControllerState,
        method: string,
        args: any[],
        options: { typeReuseDisabled?: boolean },
        progress: Progress | undefined,
    ): Promise<any> {
        const host = this.fastHost!;
        await host.connectForAction();
        const state = controller.getState(method);
        let fast = state.fast;
        if (!fast || state.fastEpoch !== host.getSchemaEpoch()) {
            const schema = await this.getPeerSchema(controller.peerId!);
            fast = this.compileFast(
                controller,
                method,
                options,
                schema,
                MessageFlag.RoutePeer,
                host.getPeerRoute!(controller.peerId!),
            );
            if (!fast) throw this.missingAction(controller, method, schema);
            state.fast = fast;
            state.fastEpoch = host.getSchemaEpoch();
        }
        return this.startCall(fast, args, progress);
    }

    /** Calls by name over HTTP, the types come from the server once. */
    protected async httpCall(
        http: RpcHttpTransport,
        controller: RpcControllerState,
        method: string,
        args: any[],
        options: { typeReuseDisabled?: boolean },
    ): Promise<any> {
        const types = await this.loadHttpTypes(http, controller, method, options);
        const json = serialize(args, undefined, undefined, undefined, types.parameters) as any[];
        const value = await http.requestCall(controller.controller, method, json, this.fastHost!.getToken?.());
        // deserialized like the binary path: validating it rejected class instances, the class built from the
        // server's type description has the methods in its type but not on its instances
        return (deserialize({ v: value }, undefined, undefined, undefined, types.resultSchema) as { v: any }).v;
    }

    protected async loadHttpTypes(
        http: RpcHttpTransport,
        controller: RpcControllerState,
        method: string,
        options: { typeReuseDisabled?: boolean },
    ): Promise<ControllerStateActionTypes> {
        const state = controller.getState(method);
        if (state.types) return state.types;
        state.promise ||= (async () => {
            const parsed = await http.requestTypes(controller.controller, method, this.fastHost!.getToken?.());
            const parameters = deserializeType(parsed.parameters);
            assertType(parameters, ReflectionKind.tuple);
            const type = deserializeType(parsed.type, { disableReuse: options.typeReuseDisabled === true });
            return (state.types = createActionTypes(parsed.mode, type, parameters));
        })();
        try {
            return await state.promise;
        } catch (error) {
            state.promise = undefined;
            throw error;
        }
    }

    /** The types of an action, as they are described by the server. */
    public async loadActionTypes(
        controller: RpcControllerState,
        method: string,
        options: {
            timeout?: number;
            dontWaitForConnection?: true;
            typeReuseDisabled?: boolean;
        } = {},
    ): Promise<ControllerStateActionTypes> {
        const host = this.fastHost!;
        const http = host.getHttpTransport?.();
        if (http) return this.loadHttpTypes(http, controller, method, options);
        if (!host.isActionReady(options.dontWaitForConnection)) await host.connectForAction();
        const fast = this.resolveFast(controller, method, options);
        if (!fast) throw this.missingAction(controller, method, host.getSchemaMapping());
        return fast.types;
    }
}
