/*
 * Deepkit Framework
 * Copyright (C) 2021 Deepkit UG, Marc J. Schmidt
 *
 * This program is free software: you can redistribute it and/or modify
 * it under the terms of the MIT License.
 *
 * You should have received a copy of the MIT License along with this program.
 */

import { asyncOperation, ClassType, toFastProperties } from '@deepkit/core';
import { BehaviorSubject, Observable, Subject, Subscriber } from 'rxjs';
import { skip } from 'rxjs/operators';
import { Collection, CollectionQueryModelInterface, CollectionState } from '../collection.js';
import {
    ActionMode,
    ActionObservableTypes,
    IdInterface,
    rpcActionObservableNext,
    rpcActionObservableSubscribeId,
    rpcActionType,
    RpcError,
    rpcResponseActionCollectionRemove,
    rpcResponseActionCollectionSort,
    rpcResponseActionObservable,
    rpcResponseActionObservableSubscriptionError,
    rpcResponseActionType,
    RpcTypes,
    WrappedV,
} from '../model.js';
import { rpcDecodeError, RpcMessage } from '../protocol.js';
import type { WritableClient } from './client.js';
import { EntityState, EntitySubjectStore } from './entity-state.js';
import { assertType, deserializeType, ReflectionKind, Type, TypeObjectLiteral, typeOf } from '@deepkit/type';
import { RpcMessageSubject } from './message-subject.js';
import { ClientProgress, Progress } from '../progress.js';
import { ProgressTracker, ProgressTrackerState } from '@deepkit/core-rxjs';

type ControllerStateActionTypes = {
    mode: ActionMode;
    callSchema: TypeObjectLiteral, //with args, method, and controller as property
    resultSchema: TypeObjectLiteral, //with v as property
    observableNextSchema?: Type, //with v as property
    collectionSchema?: Type, //with v as property
    collectionQueryModel?: Type,
    classType?: ClassType, //if method returns an classType, this is set here
};

type ControllerStateActionState = {
    promise?: Promise<ControllerStateActionTypes>,
    types?: ControllerStateActionTypes
};

export class RpcControllerState {
    protected state: { [method: string]: ControllerStateActionState } = {};
    public peerId?: string;

    constructor(
        public controller: string,
    ) {

    }

    getState(method: string): ControllerStateActionState {
        let state = this.state[method];
        if (state) return state;
        state = this.state[method] = {};
        toFastProperties(this.state);
        return state;
    }
}

interface ActionState {
    action: string;
    progress?: Progress;
    finalizer: FinalizationRegistry<any>;
    entityState?: EntityState,
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
    collectionEntityStore?: EntitySubjectStore<any>
    types: ControllerStateActionTypes;

    subscriberId?: number;
    subscribers?: { [id: number]: Subscriber<any> };

    resolve?: (v: any) => void;
    reject?: (error: any) => void;
}

function handleCollection(entityStore: EntitySubjectStore<any>, types: ControllerStateActionTypes, collection: Collection<any>, messages: RpcMessage[]) {
    for (const next of messages) {
        switch (next.type) {
            case RpcTypes.ResponseActionCollectionState: {
                const state = next.parseBody<CollectionState>();
                collection.setState(state);
                break;
            }

            case RpcTypes.ResponseActionCollectionSort: {
                const body = next.parseBody<rpcResponseActionCollectionSort>();
                collection.setSort(body.ids);
                break;
            }

            case RpcTypes.ResponseActionCollectionModel: {
                if (!types.collectionQueryModel) throw new RpcError('No collectionQueryModel set');
                collection.model.set(next.parseBody(types.collectionQueryModel));
                break;
            }

            case RpcTypes.ResponseActionCollectionUpdate:
            case RpcTypes.ResponseActionCollectionAdd: {
                if (!types.collectionSchema) continue;
                const incomingItems = next.parseBody<WrappedV>(types.collectionSchema).v as IdInterface[];
                const items: IdInterface[] = [];

                for (const item of incomingItems) {
                    if (!entityStore.isRegistered(item.id)) entityStore.register(item);
                    if (next.type === RpcTypes.ResponseActionCollectionUpdate) {
                        entityStore.onSet(item.id, item);
                    }

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

                if (next.type === RpcTypes.ResponseActionCollectionAdd) {
                    collection.add(items);
                } else if (next.type === RpcTypes.ResponseActionCollectionUpdate) {
                    collection.update(items);
                }
                break;
            }

            case RpcTypes.ResponseActionCollectionRemove: {
                const ids = next.parseBody<rpcResponseActionCollectionRemove>().ids;
                collection.remove(ids); //this unsubscribes its EntitySubject as well
                break;
            }

            case RpcTypes.ResponseActionCollectionSet: {
                if (!types.collectionSchema) continue;
                const incomingItems = next.parseBody<WrappedV>(types.collectionSchema).v as IdInterface[];
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
    collection.loaded();
}


/**
 * Observables/Subjects are only weakly referenced, so that dropping them frees the server-side
 * resources via the finalizer. While they have subscribers (e.g. `await subject.toPromise()`),
 * user code might not reference them anymore either, so V8 could collect them mid-stream and the
 * subscription would never complete. Keep a strong reference via the action state (reachable
 * through the client's active replies) as long as there are subscribers.
 */
function keepAliveWhileSubscribed(state: ActionState, observable: Observable<any>) {
    let subscriptions = 0;
    const subscribe = observable.subscribe;
    observable.subscribe = function (this: Observable<any>, ...args: any[]) {
        const subscription = subscribe.apply(this, args as any);
        if (subscription.closed) return subscription;
        subscriptions++;
        state.observableKeepAlive = this;
        subscription.add(() => {
            if (--subscriptions === 0) state.observableKeepAlive = undefined;
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

function actionProtocolError(reply: RpcMessage, subject: RpcMessageSubject, state: ActionState) {
    subject.release();
    const error = reply.getError();
    if (state.subscribers) {
        for (const sub of Object.values(state.subscribers)) {
            sub.error(error);
        }
    }
    rejectAction(state, error);
}

function actionProtocolFull(reply: RpcMessage, subject: RpcMessageSubject, state: ActionState) {
    switch (reply.type) {
        case RpcTypes.ResponseActionSimple: {
            try {
                const result = reply.parseBody<WrappedV>(state.types.resultSchema);
                resolveAction(state, result.v);
            } catch (error: any) {
                console.log('parse error, got', reply.parseBody<WrappedV>());
                throw error;
            }
            subject.release();
            break;
        }


        case RpcTypes.ResponseEntity: {
            if (!state.types.classType || !state.entityState) throw new RpcError('No classType returned by the rpc action');
            resolveAction(state, state.entityState.createEntitySubject(state.types.classType, state.types.resultSchema, reply));
            break;
        }

        case RpcTypes.ResponseActionCollectionChange: {
            if (!state.collectionRef) throw new RpcError('No collection loaded yet');
            if (!state.types.collectionSchema) throw new RpcError('no collectionSchema loaded yet');
            if (!state.collectionEntityStore) throw new RpcError('no collectionEntityStore loaded yet');

            const collection = state.collectionRef.deref();
            if (state.collectionEntityStore && collection) {
                handleCollection(state.collectionEntityStore, state.types, collection, reply.getBodies());
            }

            break;
        }

        case RpcTypes.ResponseActionCollection: {
            if (!state.types.classType) throw new RpcError('No classType returned by the rpc action');
            if (!state.types.collectionQueryModel) throw new RpcError('No collectionQueryModel returned by the rpc action');
            if (!state.entityState) throw new RpcError('No entityState set');
            const collection = new Collection(state.types.classType);
            state.collectionRef = new WeakRef(collection);
            state.collectionEntityStore = state.entityState.getStore(state.types.classType);

            collection.model.change.subscribe(() => {
                subject.send(RpcTypes.ActionCollectionModel, collection!.model, state.types.collectionQueryModel);
            });

            collection.addTeardown(() => {
                subject.send(RpcTypes.ActionCollectionUnsubscribe);
                subject.release();
            });

            handleCollection(state.collectionEntityStore, state.types, collection, reply.getBodies());

            resolveAction(state, collection);
            break;
        }

        case RpcTypes.ResponseActionObservableError: {
            const body = reply.parseBody<rpcResponseActionObservableSubscriptionError>();
            const error = rpcDecodeError(body);
            if (state.observableRef) {
                if (!state.subscribers?.[body.id]) return; //we silently ignore this
                state.subscribers![body.id].error(error);
            } else if (state.observableSubjectRef) {
                state.observableSubjectRef.deref()?.error(error);
                subject.release();
            }
            break;
        }

        case RpcTypes.ResponseActionObservableComplete: {
            const body = reply.parseBody<rpcActionObservableSubscribeId>();

            if (state.observableRef) {
                if (!state.subscribers?.[body.id]) return; //we silently ignore this
                state.subscribers[body.id].complete();
            } else if (state.observableSubjectRef) {
                state.observableSubjectRef.deref()?.complete();
                subject.release();
            }
            break;
        }

        case RpcTypes.ResponseActionObservableNext: {
            if (!state.types.observableNextSchema) throw new RpcError('No observableNextSchema set');

            const body = reply.parseBody<rpcActionObservableNext>(state.types.observableNextSchema);

            if (state.observableRef) {
                if (!state.subscribers?.[body.id]) return; //we silently ignore this
                state.subscribers[body.id].next(body.v);
            } else if (state.observableSubjectRef) {
                const s = state.observableSubjectRef.deref();
                if (s && !s.closed) s.next(body.v);
            } else {
                state.firstObservableNext = body.v;
                state.firstObservableNextCalled = true;
            }

            break;
        }

        case RpcTypes.ResponseActionObservable: {
            if (state.observableRef) break;
            const body = reply.parseBody<rpcResponseActionObservable>();

            // this observable can be subscribed multiple times now
            // each time we need to call the server again, since it's not a Subject
            if (body.type === ActionObservableTypes.observable) {
                state.subscriberId = 0;
                state.subscribers = {};
                const observable = new Observable((observer) => {
                    const id = state.subscriberId!++;
                    state.subscribers![id] = observer;
                    subject.send<rpcActionObservableSubscribeId>(RpcTypes.ActionObservableSubscribe, { id });

                    return {
                        unsubscribe: () => {
                            delete state.subscribers![id];
                            subject.send<rpcActionObservableSubscribeId>(RpcTypes.ActionObservableUnsubscribe, { id });
                        },
                    };
                });
                state.observableRef = new WeakRef(observable);
                keepAliveWhileSubscribed(state, observable);
                state.finalizer.register(observable, () => {
                    subject.send(RpcTypes.ActionObservableDisconnect);
                    subject.release();
                });
                resolveAction(state, observable);
            } else if (body.type === ActionObservableTypes.subject) {
                const observableSubject = new Subject();
                let freed = false;
                state.observableSubjectRef = new WeakRef(observableSubject);
                keepAliveWhileSubscribed(state, observableSubject);

                // we have to monkey patch unsubscribe, because there is no other way to hook into that
                // note: subject.subscribe().add(T), T is not called when subject.unsubscribe() is called.
                observableSubject.unsubscribe = function() {
                    Subject.prototype.unsubscribe.call(this);
                    state.observableKeepAlive = undefined;
                    if (!freed) {
                        freed = true;
                        subject.send(RpcTypes.ActionObservableSubjectUnsubscribe);
                        state.finalizer.unregister(this);
                        subject.release();
                    }
                };

                observableSubject.complete = function() {
                    Subject.prototype.complete.call(this);
                    if (!freed) {
                        freed = true;
                        subject.send(RpcTypes.ActionObservableSubjectUnsubscribe);
                        state.finalizer.unregister(this);
                        subject.release();
                    }
                };

                if (state.firstObservableNextCalled) {
                    observableSubject.next(state.firstObservableNext);
                    state.firstObservableNext = undefined;
                }

                state.finalizer.register(observableSubject, () => {
                    subject.send(RpcTypes.ActionObservableSubjectUnsubscribe);
                    freed = true;
                    subject.release();
                });
                resolveAction(state, observableSubject);
            } else if (body.type === ActionObservableTypes.behaviorSubject || body.type === ActionObservableTypes.progressTracker) {
                const classType = body.type === ActionObservableTypes.progressTracker ? ProgressTracker : BehaviorSubject;
                const observableSubject = new classType(state.firstObservableNext);
                state.observableSubjectRef = new WeakRef(observableSubject);
                keepAliveWhileSubscribed(state, observableSubject);
                state.firstObservableNext = undefined;
                let freed = false;

                // we have to monkey patch unsubscribe, because there is no other way to hook into that
                // note: subject.subscribe().add(T), T is not called when subject.unsubscribe() is called.
                observableSubject.unsubscribe = function() {
                    Subject.prototype.unsubscribe.call(this);
                    state.observableKeepAlive = undefined;
                    if (!freed) {
                        freed = true;
                        subject.send(RpcTypes.ActionObservableSubjectUnsubscribe);
                        state.finalizer.unregister(this);
                    }
                };

                observableSubject.complete = function() {
                    Subject.prototype.complete.call(this);
                    if (!freed) {
                        freed = true;
                        subject.send(RpcTypes.ActionObservableSubjectUnsubscribe);
                        state.finalizer.unregister(this);
                    }
                };

                if (observableSubject instanceof ProgressTracker) {
                    // whenever the client changes something, it's synced back to the server.
                    // this is important to handle the stop signal.
                    const oldChanged = observableSubject.changed;
                    observableSubject.changed = function(this: ProgressTracker) {
                        subject.send(RpcTypes.ActionObservableProgressNext, this.value, typeOf<ProgressTrackerState[]>());
                        return oldChanged.apply(this);
                    };
                }

                state.finalizer.register(observableSubject, () => {
                    subject.send(RpcTypes.ActionObservableSubjectUnsubscribe);
                    subject.release();
                });
                resolveAction(state, observableSubject);
            }

            break;
        }
        case RpcTypes.Error: {
            actionProtocolError(reply, subject, state);
            break;
        }
        default: {
            console.log(`Unexpected type received ${reply.type} ${RpcTypes[reply.type]}`);
        }
    }
}

function actionProtocol(reply: RpcMessage, subject: RpcMessageSubject, state: ActionState) {
    try {
        actionProtocolFull(reply, subject, state);
    } catch (error) {
        console.warn('reply error', reply.id, RpcTypes[reply.type], error);
        rejectAction(state, `Reply failed for ${state.action}: ${error}`);
    }
}

export class RpcActionClient {
    public entityState = new EntityState;

    private finalizer = new FinalizationRegistry<() => void>((heldValue) => {
        heldValue();
    });

    constructor(protected client: WritableClient) {
    }

    public action<T>(controller: RpcControllerState, method: string, args: any[], options: {
        timeout?: number,
        dontWaitForConnection?: true,
        typeReuseDisabled?: boolean
    } = {}) {
        const progress = ClientProgress.getNext();

        return asyncOperation<any>(async (resolve, reject) => {
            const types = controller.getState(method)?.types || await this.loadActionTypes(controller, method, options);

            // forwarded caught progress to client sendMessage
            ClientProgress.nextProgress = progress;

            const state: ActionState = {
                action: `${controller.controller}.${method}`,
                finalizer: this.finalizer,
                types,
                entityState: this.entityState,
                resolve,
                reject,
                progress,
            };

            this.client.sendMessage(RpcTypes.Action, {
                controller: controller.controller,
                method: method,
                args,
            }, types.callSchema, {
                peerId: controller.peerId,
                dontWaitForConnection: options.dontWaitForConnection,
                timeout: options.timeout,
            }).onRejected((error) => {
                rejectAction(state, error);
            }).onReply(function(reply: RpcMessage, subject: RpcMessageSubject) {
                actionProtocol(reply, subject, state);
            });
        });
    }

    public async loadActionTypes(controller: RpcControllerState, method: string, options: {
        timeout?: number,
        dontWaitForConnection?: true,
        typeReuseDisabled?: boolean
    } = {}): Promise<ControllerStateActionTypes> {
        const state = controller.getState(method);
        if (state.types) return state.types;

        const typeReuseDisabled = options ? options.typeReuseDisabled === true : false;

        if (state.promise) {
            return state.promise;
        }

        state.promise = asyncOperation<ControllerStateActionTypes>(async (resolve, reject) => {
            try {
                const a = this.client.sendMessage<rpcActionType>(RpcTypes.ActionType, {
                    controller: controller.controller,
                    method: method,
                    disableTypeReuse: typeReuseDisabled,
                }, undefined, {
                    peerId: controller.peerId,
                    dontWaitForConnection: options.dontWaitForConnection,
                    timeout: options.timeout,
                }).onRejected(reject);

                const parsed = await a.firstThenClose<rpcResponseActionType>(RpcTypes.ResponseActionType, typeOf<rpcResponseActionType>());

                const returnType = deserializeType(parsed.type, { disableReuse: typeReuseDisabled });

                let collectionSchema: Type | undefined;
                let collectionQueryModel: Type | undefined;
                let unwrappedReturnType = returnType;
                if (unwrappedReturnType.kind === ReflectionKind.promise) unwrappedReturnType = unwrappedReturnType.type;
                const classType: ClassType | undefined = unwrappedReturnType.kind === ReflectionKind.class ? unwrappedReturnType.classType : undefined;

                const parameters: Type = deserializeType(parsed.parameters);
                assertType(parameters, ReflectionKind.tuple);

                if (parsed.mode === 'observable') {
                } else if (parsed.mode === 'entitySubject') {
                } else if (parsed.mode === 'collection') {
                    collectionQueryModel = typeOf<CollectionQueryModelInterface<unknown>>([unwrappedReturnType]) as TypeObjectLiteral;
                    collectionSchema = {
                        kind: ReflectionKind.objectLiteral,
                        types: [{
                            kind: ReflectionKind.propertySignature,
                            name: 'v',
                            parent: Object as any,
                            optional: true,
                            type: { kind: ReflectionKind.array, type: unwrappedReturnType },
                        }],
                    };
                }

                state.types = {
                    mode: parsed.mode,
                    classType,
                    collectionQueryModel,
                    collectionSchema,
                    callSchema: {
                        kind: ReflectionKind.objectLiteral,
                        types: [
                            { kind: ReflectionKind.propertySignature, name: 'controller', type: { kind: ReflectionKind.string } },
                            { kind: ReflectionKind.propertySignature, name: 'method', type: { kind: ReflectionKind.string } },
                            { kind: ReflectionKind.propertySignature, name: 'args', type: parameters },
                        ],
                    } as TypeObjectLiteral,
                    resultSchema: {
                        kind: ReflectionKind.objectLiteral,
                        types: [
                            { kind: ReflectionKind.propertySignature, name: 'v', type: unwrappedReturnType },
                        ],
                    } as TypeObjectLiteral,
                    observableNextSchema: {
                        kind: ReflectionKind.objectLiteral,
                        types: [
                            { kind: ReflectionKind.propertySignature, name: 'id', type: { kind: ReflectionKind.number } },
                            { kind: ReflectionKind.propertySignature, name: 'v', type: unwrappedReturnType },
                        ],
                    } as TypeObjectLiteral,
                };

                resolve(state.types);
            } catch (error) {
                reject(error);
            }
        });

        try {
            return await state.promise;
        } catch (error) {
            state.promise = undefined;
            throw error;
        }
    }

}
