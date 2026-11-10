/*
 * Deepkit Framework
 * Copyright (C) 2021 Deepkit UG, Marc J. Schmidt
 *
 * This program is free software: you can redistribute it and/or modify
 * it under the terms of the MIT License.
 *
 * You should have received a copy of the MIT License along with this program.
 */
import { Observable, Subject, Subscription, isObservable } from 'rxjs';

import { AutoBufferSerializer, AutoBufferSerializerState } from '@deepkit/bson';
import {
    ClassType,
    collectForMicrotask,
    ensureError,
    getClassName,
    isArray,
    isPlainObject,
    isPrototypeOfBase,
    toFastProperties,
} from '@deepkit/core';
import { ProgressTracker, ProgressTrackerState, isBehaviorSubject, isSubject } from '@deepkit/core-rxjs';
import { DataEvent, EventDispatcher } from '@deepkit/event';
import { InjectorContext, InjectorModule } from '@deepkit/injector';
import { LoggerInterface } from '@deepkit/logger';
import {
    Guard,
    ReflectionClass,
    ReflectionKind,
    Type,
    TypeObjectLiteral,
    TypeTuple,
    ValidationError,
    ValidationErrorItem,
    assertType,
    cast,
    getValidatorFunction,
    parametersToTuple,
    typeOf,
} from '@deepkit/type';

import { ActionDispatcher, ActionEntry, PreSerialized, getBodyCodec, nextValueType } from '../action.js';
import { Collection, CollectionEvent, CollectionQueryModelInterface, CollectionState } from '../collection.js';
import { getActions } from '../decorators.js';
import { RpcActionTimings, RpcControllerAccessEventStart, onRpcAction, onRpcControllerAccess } from '../events.js';
import {
    ActionMode,
    ActionStats,
    EntitySubject,
    NumericKeys,
    RpcError,
    RpcStats,
    isEntitySubject,
    rpcCollectionRemove,
    rpcCollectionSort,
} from '../model.js';
import {
    ChannelSubType,
    CollectionChangeKind,
    ControlOp,
    RouteFlag,
    copyFrame,
    frameMemory,
    readVarint,
    rpcEncodeError,
    writeAckFrameTransient,
    writeChannelAnnounceFrameTransient,
    writeChannelFrameTransient,
    writeControlFrameTransient,
    writeControlIdFrameTransient,
    writeErrorFrameTransient,
    writePreSerializedChannelFrameTransient,
    writePreSerializedResultFrameTransient,
    writeResultFrameTransient,
    writeStreamErrorFrameTransient,
} from '../protocol.js';
import { RpcCache, RpcCacheAction, RpcKernelBaseConnection } from './kernel.js';
import { RpcControllerAccess, RpcKernelSecurity, SessionState } from './security.js';

export type ActionTypes = {
    strictSerialization: boolean;
    parametersValidate: Guard<any>;

    parameters: TypeTuple;
    mode: ActionMode;
    type: Type; //the type T of Collection<T>, EntitySubject<T>, Observable<T>, or return type of the function if mode=arbitrary

    resultSchema: TypeObjectLiteral; //with v as property
    observableNextSchema?: TypeObjectLiteral; //with v as property
    collectionItems?: Type; //T[]
    collectionQueryModel?: Type;

    noTypeWarned: boolean;

    /** Writes one observable value on the fast path. */
    nextValueEncoder?: AutoBufferSerializer;
};

interface ActionContinuation {
    id: number;
    entry: ActionEntry;
    onValue: (value: any) => void;
    onError: (error: any) => void;
}

function createNoTypeError(classType: ClassType, method: string) {
    return new RpcError(
        `No observable type on RPC action ${getClassName(classType)}.${method} detected. Either no return type Observable<T> defined or wrong RxJS nominal type.`,
    );
}

function createNoObservableWarning(classType: ClassType, method: string) {
    return `RPC action ${getClassName(classType)}.${method} returns an Observable, but no specific type (e.g. Observable<T>) or 'any | unknown' type is defined. This might lead to unexpected behavior and slow performance.`;
}

function createNoTypeWarning(classType: ClassType, method: string, value: any) {
    const firstKey = Object.keys(value)[0];
    return new RpcError(
        `RPC action ${getClassName(classType)}.${method} returns an object, but no specific type (e.g. { ${firstKey || 'v'}: T }) or 'any | unknown' type is defined. This might lead to slow performance.`,
    );
}

function validV(type: Type, index = 0): boolean {
    if (type.kind !== ReflectionKind.objectLiteral) return false;
    const second = type.types[index];
    if (!second || second.kind !== ReflectionKind.propertySignature) return false;
    if (second.name !== 'v') return false;
    if (second.type.kind === ReflectionKind.any || second.type.kind === ReflectionKind.unknown) return false;
    return true;
}

export function loadActionTypes(
    cache: RpcCache,
    controllers: Map<string, { controller: ClassType; module?: InjectorModule }>,
    controller: string,
    methodName: string,
): ActionTypes {
    const cacheId = controller + '!' + methodName;
    let types = cache.actionsTypes[cacheId];
    if (types) return types;

    const classType = controllers.get(controller);
    if (!classType) {
        throw new RpcError(`No controller registered for id ${controller}`);
    }
    const action = getActions(classType.controller).get(methodName);
    if (!action) throw new RpcError(`Action unknown ${methodName}`);

    const methodReflection = ReflectionClass.from(classType.controller).getMethod(methodName);
    const method = methodReflection.type;
    assertType(method, ReflectionKind.method);

    let mode: ActionMode = 'arbitrary';
    const parameters: TypeTuple = parametersToTuple(methodReflection.getParameters().map(v => v.parameter));

    let unwrappedReturnType = methodReflection.getReturnType();
    if (unwrappedReturnType.kind === ReflectionKind.promise) {
        unwrappedReturnType = unwrappedReturnType.type;
    }

    const fullType = unwrappedReturnType;
    if (unwrappedReturnType.kind === ReflectionKind.union) {
        //if e.g. Subject | undefined, we take the non-undefined type
        const nonNullUndefined = unwrappedReturnType.types.filter(
            v => v.kind !== ReflectionKind.undefined && v.kind !== ReflectionKind.null,
        );
        if (nonNullUndefined.length === 1) {
            unwrappedReturnType = nonNullUndefined[0];
        }
    }

    let type: Type = fullType;
    let nextType: Type | undefined;
    let collectionItems: Type | undefined;
    let collectionQueryModel: Type | undefined;

    if (unwrappedReturnType.kind === ReflectionKind.class) {
        if (isPrototypeOfBase(unwrappedReturnType.classType, Collection)) {
            mode = 'collection';
            type = unwrappedReturnType.typeArguments
                ? unwrappedReturnType.typeArguments[0]
                : { kind: ReflectionKind.any };
            collectionItems = { kind: ReflectionKind.array, type: type };

            collectionQueryModel = typeOf<CollectionQueryModelInterface<unknown>>([type]) as TypeObjectLiteral;
        } else if (isPrototypeOfBase(unwrappedReturnType.classType, EntitySubject)) {
            mode = 'entitySubject';
            type = unwrappedReturnType.typeArguments
                ? unwrappedReturnType.typeArguments[0]
                : { kind: ReflectionKind.any };
        } else if (isPrototypeOfBase(unwrappedReturnType.classType, ProgressTracker)) {
            mode = 'observable';
            type = typeOf<ProgressTrackerState[] | undefined>();
            nextType = type;
        } else if (isPrototypeOfBase(unwrappedReturnType.classType, Observable)) {
            mode = 'observable';
            type = unwrappedReturnType.typeArguments
                ? unwrappedReturnType.typeArguments[0]
                : { kind: ReflectionKind.any };
            nextType = type;
        }
    }

    const resultSchema: TypeObjectLiteral = {
        kind: ReflectionKind.objectLiteral,
        types: [
            {
                kind: ReflectionKind.propertySignature,
                name: 'v',
                parent: Object as any,
                optional: true,
                type: type,
            },
        ],
    };

    types = cache.actionsTypes[cacheId] = {
        strictSerialization: !!action.strictSerialization,
        parameters,
        resultSchema,
        mode,
        type,
        get parametersValidate() {
            const validate = getValidatorFunction(undefined, parameters);
            Object.defineProperty(this, 'parametersValidate', { value: validate });
            return validate;
        },
        observableNextSchema: {
            kind: ReflectionKind.objectLiteral,
            types: [
                {
                    kind: ReflectionKind.propertySignature,
                    name: 'id',
                    parent: Object as any,
                    type: { kind: ReflectionKind.number },
                },
                {
                    kind: ReflectionKind.propertySignature,
                    name: 'v',
                    parent: Object as any,
                    optional: true,
                    type: nextType || { kind: ReflectionKind.any },
                },
            ],
        },
        collectionItems,
        collectionQueryModel,
        noTypeWarned: false,
    };
    if (!types.type) {
        throw new RpcError(`No type detected for action ${controller}.${methodName}`);
    }
    toFastProperties(cache.actionsTypes);

    return types;
}

export interface RpcServerActionObservableSubject {
    subject: Subject<any>;
    trackingType: NumericKeys<ActionStats>;
    completed: boolean;
    completedByClient: boolean;
    subscription: Subscription;
    subscribe: () => Subscription;
}

let progressState: Type | undefined;

function progressStateType(): Type {
    return (progressState ||= typeOf<ProgressTrackerState[]>());
}

interface CollectionEntry {
    kind: CollectionChangeKind;
    type: Type;
    value: any;
}

/** <kind:uint8><size:uint32le><value> of each entry, see ControlOp.CollectionChange. */
const writeCollectionEntries: AutoBufferSerializer = (entries: CollectionEntry[], state: AutoBufferSerializerState) => {
    const writer = state.writer!;
    for (const entry of entries) {
        writer.writeByte(entry.kind);
        const sizePosition = writer.offset;
        writer.writeUint32(0);
        const start = writer.offset;
        getBodyCodec(entry.type).serialize(entry.value, state);
        writer.writeDelayedSize(writer.offset - start, sizePosition);
    }
};

const validationState: { errors: ValidationErrorItem[] } = { errors: [] };

function isPromiseLike(value: any): value is Promise<any> {
    return (
        value instanceof Promise || ('object' === typeof value && value !== null && 'function' === typeof value.then)
    );
}

/** Tuples are written member by member, unless the action sends anything. */
function isPositionalTuple(types: ActionTypes, type: Type): boolean {
    return types.strictSerialization && type.kind === ReflectionKind.tuple;
}

export class RpcServerAction {
    protected observableSubjects: {
        [id: number]: RpcServerActionObservableSubject;
    } = {};

    protected collections: {
        [id: number]: {
            collection: Collection<any>;
            types: ActionTypes;
            unsubscribe: () => void;
        };
    } = {};

    protected observables: {
        [id: number]: {
            observable: Observable<any>;
            classType: ClassType;
            method: string;
            types: ActionTypes;
            subscriptions: { [id: number]: { sub?: Subscription; active: boolean; complete: () => void } };
            /** Subjects are counted in their own statistic. */
            trackedAsObservable: boolean;
        };
    } = {};

    /**
     * Observables without subscribers whose context was given up, by a token of the client.
     * They stay until the client drops its Observable.
     */
    protected detachedObservables: { [token: number]: RpcServerAction['observables'][number] } = {};

    /** Fast path contexts that gave up their observable and wait for the ActionContextEnd of the client. */
    protected detachedContexts = new Set<number>();

    protected context: { connection: RpcKernelBaseConnection; injector: InjectorContext } = {
        connection: this.connection,
        injector: this.injector,
    };
    protected readonly defaultSecurity: boolean =
        this.security.hasControllerAccess === RpcKernelSecurity.prototype.hasControllerAccess;

    constructor(
        protected stats: RpcStats,
        protected cache: RpcCache,
        protected connection: RpcKernelBaseConnection,
        protected controllers: Map<string, { controller: ClassType; module?: InjectorModule }>,
        protected injector: InjectorContext,
        protected eventDispatcher: EventDispatcher,
        protected security: RpcKernelSecurity,
        protected sessionState: SessionState,
        protected logger: LoggerInterface,
        protected dispatcher?: ActionDispatcher,
    ) {}

    /**
     * Frees everything held for a stream context. Returns false when nothing was held,
     * which also means the context already ended and no end frame must be sent again.
     */
    public closeContext(id: number): boolean {
        let found = false;

        const collection = this.collections[id];
        if (collection) {
            found = true;
            if (!collection.collection.closed) {
                collection.unsubscribe();
                collection.collection.unsubscribe();
            }
            delete this.collections[id];
        }

        const observable = this.observables[id];
        if (observable) {
            found = true;
            for (const sub of Object.values(observable.subscriptions)) {
                sub.active = false;
                if (sub.sub && !sub.sub.closed) sub.sub.unsubscribe();
            }
            if (observable.trackedAsObservable) this.stats.active.increase('observables', -1);
            delete this.observables[id];
        }

        const subject = this.observableSubjects[id];
        if (subject) {
            found = true;
            if (!subject.completed) {
                subject.completed = true;
                this.stats.active.increase(subject.trackingType, -1);
                subject.subscription.unsubscribe();
            }
            delete this.observableSubjects[id];
        }

        return found;
    }

    public async onClose() {
        for (const collection of Object.values(this.collections)) {
            if (!collection.collection.closed) {
                collection.unsubscribe();
                collection.collection.unsubscribe();
            }
        }

        for (const observable of Object.values(this.observables)) {
            for (const sub of Object.values(observable.subscriptions)) {
                if (sub.sub && !sub.sub.closed) sub.sub.unsubscribe();
            }
        }
        for (const subject of Object.values(this.observableSubjects)) {
            if (!subject.completed) {
                subject.completed = true;
                subject.subscription.unsubscribe();
            }
        }

        this.collections = {};
        this.observables = {};
        this.observableSubjects = {};
        this.detachedObservables = {};
        this.detachedContexts.clear();
    }

    protected async hasControllerAccess(
        controller: RpcControllerAccess,
        connection: RpcKernelBaseConnection,
    ): Promise<boolean> {
        const session = this.sessionState.getSession();

        if (!this.eventDispatcher.hasListeners(onRpcControllerAccess)) {
            return this.security.hasControllerAccess(session, controller, connection);
        }

        const event = new DataEvent<RpcControllerAccessEventStart>({
            phase: 'start',
            session,
            controller,
            context: this.context,
        });
        await this.eventDispatcher.dispatch(onRpcControllerAccess, event, this.injector);

        try {
            let granted = event.data.granted;
            if ('undefined' === typeof granted) {
                granted = await this.security.hasControllerAccess(session, controller, connection);
            }
            await this.eventDispatcher.dispatch(
                onRpcControllerAccess,
                () => ({
                    phase: granted ? 'success' : 'denied',
                    session,
                    controller,
                    context: this.context,
                }),
                this.injector,
            );
            return granted;
        } catch (error) {
            await this.eventDispatcher.dispatch(
                onRpcControllerAccess,
                () => ({
                    phase: 'fail',
                    error: ensureError(''),
                    session,
                    controller,
                    context: this.context,
                }),
                this.injector,
            );
            throw error;
        }
    }

    protected loadTypes(controller: string, methodName: string): ActionTypes {
        return loadActionTypes(this.cache, this.controllers, controller, methodName);
    }

    /** A control frame of a stream. The frame is only valid during this call. */
    public handleControl(op: ControlOp, id: number, buffer: Uint8Array, offset: number, end: number): void {
        switch (op) {
            case ControlOp.Subscribe: {
                const observable = this.observables[id];
                if (!observable) return this.sendError(id, new RpcError('No observable found'));

                const { types, classType, method } = observable;
                const subscription = readVarint(buffer, offset);
                if (observable.subscriptions[subscription]) {
                    this.closeContext(id);
                    return this.sendError(id, new RpcError('Subscription already created'));
                }
                if (!types.observableNextSchema) {
                    this.closeContext(id);
                    return this.sendError(id, createNoTypeError(classType, method));
                }

                if (!types.noTypeWarned && (types.mode !== 'observable' || !validV(types.observableNextSchema, 1))) {
                    types.noTypeWarned = true;
                    this.logger.warn(createNoObservableWarning(classType, method));
                }

                const sub: { active: boolean; sub?: Subscription; complete: () => void } = {
                    active: true,
                    complete: () => {
                        sub.active = false;
                        if (sub.sub) sub.sub.unsubscribe();
                        this.sendComplete(id, subscription);
                    },
                };
                observable.subscriptions[subscription] = sub;

                this.stats.total.increase('subscriptions', 1);
                const label = `Observable ${getClassName(observable.classType)}.${observable.method} next serialization error`;
                sub.sub = observable.observable.subscribe(
                    next => {
                        if (!sub.active) return;
                        this.sendNext(types, id, subscription, next, label, false);
                    },
                    error => {
                        this.stats.total.increase('subscriptions', -1);
                        this.sendStreamError(id, subscription, this.security.transformError(error));
                    },
                    () => {
                        this.stats.total.increase('subscriptions', -1);
                        this.sendComplete(id, subscription);
                    },
                );
                break;
            }

            case ControlOp.CollectionUnsubscribe: {
                const collection = this.collections[id];
                if (!collection) return this.sendError(id, new RpcError('No collection found'));
                collection.unsubscribe();
                delete this.collections[id];
                break;
            }

            case ControlOp.CollectionModel: {
                const collection = this.collections[id];
                if (!collection) return this.sendError(id, new RpcError('No collection found'));
                const model = getBodyCodec(collection.types.collectionQueryModel!).deserialize(buffer, offset, end);
                collection.collection.model.set(model);
                collection.collection.model.changed();
                break;
            }

            case ControlOp.Unsubscribe: {
                const observable = this.observables[id];
                if (!observable) return this.sendError(id, new RpcError('No observable to unsubscribe found'));
                const subscription = readVarint(buffer, offset);
                const sub = observable.subscriptions[subscription];
                if (!sub) return;
                sub.active = false;
                if (sub.sub) sub.sub.unsubscribe();
                delete observable.subscriptions[subscription];
                break;
            }

            case ControlOp.Disconnect: {
                const observable = this.observables[id];
                if (!observable) return this.sendError(id, new RpcError('No observable to disconnect found'));
                for (const sub of Object.values(observable.subscriptions)) {
                    sub.complete(); //we send all active subscriptions it was completed
                }
                this.stats.active.increase('observables', -1);
                delete this.observables[id];
                break;
            }

            case ControlOp.SubjectUnsubscribe: {
                //aka completed
                const subject = this.observableSubjects[id];
                if (!subject) return this.sendError(id, new RpcError('No subject to unsubscribe found'));
                if (subject.completed) return;
                subject.completedByClient = true;
                subject.completed = true;
                this.stats.active.increase(subject.trackingType, -1);
                subject.subscription.unsubscribe();
                delete this.observableSubjects[id];
                break;
            }

            case ControlOp.SubjectPause: {
                //the last client subscriber left
                const subject = this.observableSubjects[id];
                if (!subject || subject.completed) return;
                subject.subscription.unsubscribe();
                break;
            }

            case ControlOp.SubjectResume: {
                //a client subscriber arrived after a pause
                const subject = this.observableSubjects[id];
                if (!subject || subject.completed || !subject.subscription.closed) return;
                subject.subscription = subject.subscribe();
                break;
            }

            case ControlOp.ContextEnd: {
                if (this.closeContext(id) || this.detachedContexts.delete(id)) this.sendAck(id);
                break;
            }

            case ControlOp.Detach: {
                const observable = this.observables[id];
                if (!observable) return;
                this.detachedObservables[readVarint(buffer, offset)] = observable;
                delete this.observables[id];
                this.detachedContexts.add(id);
                break;
            }

            case ControlOp.Attach: {
                const token = readVarint(buffer, offset);
                const observable = this.detachedObservables[token];
                if (!observable) return this.sendError(id, new RpcError('No detached observable found'));
                delete this.detachedObservables[token];
                this.observables[id] = observable;
                break;
            }

            case ControlOp.Drop: {
                const token = readVarint(buffer, offset);
                if (!this.detachedObservables[token]) return;
                delete this.detachedObservables[token];
                this.stats.active.increase('observables', -1);
                break;
            }

            case ControlOp.ProgressNext: {
                //ProgressTracker changes from client (e.g. stop signal)
                const observable = this.observables[id];
                if (!observable || !(observable.observable instanceof ProgressTracker))
                    return this.sendError(id, new RpcError('No observable ProgressTracker to sync found'));
                observable.observable.next(getBodyCodec(progressStateType()).deserialize(buffer, offset, end));
                break;
            }
        }
    }

    /**
     * Looks up (and compiles once) what an action needs to be called by name or by its numeric id.
     */
    protected getCacheAction(controllerName: string, methodName: string): RpcCacheAction {
        const cacheKey = controllerName + '!' + methodName;
        let cache = this.cache.actions[cacheKey];
        if (cache) return cache;

        const classType = this.controllers.get(controllerName);
        if (!classType) throw new RpcError(`No controller registered for id ${controllerName}`);

        const action = getActions(classType.controller).get(methodName);
        if (!action) throw new RpcError(`Action unknown ${methodName}`);

        const controller: RpcControllerAccess = {
            controllerName,
            actionName: methodName,
            controllerClassType: classType.controller,
            actionGroups: action.groups,
            actionData: action.data,
        };
        const label = `${getClassName(classType.controller)}.${methodName}`;
        const types = this.loadTypes(controllerName, methodName);
        const fn = classType.controller.prototype[methodName] as Function;
        const resolver = this.injector.resolve(classType.module, classType.controller);
        cache = {
            controller,
            types,
            fn,
            resolver,
            action,
            label,
        } as RpcCacheAction;
        this.cache.actions[cacheKey] = cache;
        return cache;
    }

    /**
     * Whether the action can be executed without anything that observes or guards it, so that
     * the arguments can be decoded right away from the read buffer and no await is needed.
     */
    protected canExecuteDirectly(): boolean {
        return (
            this.defaultSecurity &&
            (!this.eventDispatcher.hasListeners() ||
                (!this.eventDispatcher.hasListeners(onRpcAction) &&
                    !this.eventDispatcher.hasListeners(onRpcControllerAccess)))
        );
    }

    /**
     * Runs the action of a fast path frame. Everything needed from the frame is read synchronously.
     */
    public execute(buffer: Uint8Array, id: number, actionId: number, bodyOffset: number, end: number): void {
        const entry = this.dispatcher?.entries[actionId];
        if (!entry) {
            this.sendError(id, new RpcError(`Action unknown ${actionId}`));
            return;
        }

        if (!entry.cache) {
            const cache = this.getCacheAction(entry.controllerName, entry.methodName);
            this.dispatcher!.prepare(entry, cache, !!cache.action.strictSerialization);
            entry.warnResultType = !validV(cache.types.resultSchema);
        }

        if (!this.canExecuteDirectly()) {
            this.executeThroughHandler(buffer, id, entry, bodyOffset, end);
            return;
        }

        const cache = entry.cache!;
        let args: any;
        try {
            args = entry.decode!(buffer, bodyOffset, end);
        } catch (error: any) {
            const message = `Validation error for arguments of ${cache.label}`;
            if (cache.action.logValidationErrors) this.logger.warn(message, error);
            this.sendError(id, `${message}: ${error.message}`);
            return;
        }

        if (entry.validate) {
            const types = cache.types;
            validationState.errors.length = 0;
            types.parametersValidate(args, validationState);

            if (validationState.errors.length) {
                const error = new ValidationError(validationState.errors.slice());
                if (cache.action.logValidationErrors) {
                    this.logger.warn(`Validation error for arguments of ${cache.label}, using 'any' now.`, error);
                }
                if (cache.action.strictSerialization) {
                    for (let i = 0; i < args.length; i++) args[i] = undefined;
                    this.sendError(id, `Validation error for arguments of ${cache.label}: ${error.message}`);
                    return;
                }
            }
        }

        this.stats.addAction();

        try {
            const controllerInstance = cache.resolver(this.injector.scope);
            if (!controllerInstance)
                throw new RpcError(`No instance of ${getClassName(cache.controller.controllerClassType)} found.`);

            const result = cache.fn.apply(controllerInstance, args);
            // apply() copied them, and the array is the one of this action for the next call
            for (let i = 0; i < args.length; i++) args[i] = undefined;
            if ('object' === typeof result && result !== null && isPromiseLike(result)) {
                const continuation = this.takeContinuation(id, entry);
                result.then(continuation.onValue, continuation.onError);
            } else {
                this.sendValue(id, entry, result);
            }
        } catch (error: any) {
            this.sendError(id, this.security.transformError(error));
        }
    }

    /** Continuations of async actions, reused so that an awaited result doesn't need new closures per call. */
    protected continuations: ActionContinuation[] = [];

    protected takeContinuation(id: number, entry: ActionEntry): ActionContinuation {
        const continuation = this.continuations.pop() ?? this.createContinuation();
        continuation.id = id;
        continuation.entry = entry;
        return continuation;
    }

    protected createContinuation(): ActionContinuation {
        const continuation: ActionContinuation = {
            id: 0,
            entry: undefined as any,
            onValue: (value: any) => {
                const { id, entry } = continuation;
                this.continuations.push(continuation);
                this.sendValue(id, entry, value);
            },
            onError: (error: any) => {
                const { id } = continuation;
                this.continuations.push(continuation);
                this.sendError(id, this.security.transformError(error));
            },
        };
        return continuation;
    }

    protected get routeFlag(): RouteFlag {
        return this.connection.routeFlag;
    }

    protected get routeData(): Uint8Array | undefined {
        return this.connection.routeData;
    }

    protected sendValue(id: number, entry: ActionEntry, value: any): void {
        try {
            if (value === undefined) {
                const size = writeAckFrameTransient(id, this.routeFlag, this.routeData);
                this.connection.sendFrame(frameMemory(), size);
                return;
            }

            if ('object' === typeof value && value !== null) {
                if (value instanceof PreSerialized) {
                    const size = writePreSerializedResultFrameTransient(
                        id,
                        this.routeFlag,
                        value,
                        isPositionalTuple(entry.cache!.types, entry.type),
                        this.routeData,
                    );
                    this.connection.sendFrame(frameMemory(), size);
                    return;
                }

                if (isEntitySubject(value)) {
                    const size = writeResultFrameTransient(
                        id,
                        this.routeFlag,
                        entry.encodeResult!,
                        value.value,
                        this.routeData,
                    );
                    this.connection.sendFrame(frameMemory(), size);
                    return;
                }

                if (value instanceof Collection || isObservable(value)) {
                    this.openStream(value, id, entry.cache!, entry.methodName);
                    return;
                }

                const cache = entry.cache!;
                if (entry.warnResultType && !cache.types.noTypeWarned && isPlainObject(value)) {
                    cache.types.noTypeWarned = true;
                    this.logger.warn(
                        createNoTypeWarning(cache.controller.controllerClassType, entry.methodName, value),
                    );
                }
            }

            let size: number;
            try {
                size = writeResultFrameTransient(id, this.routeFlag, entry.encodeResult!, value, this.routeData);
            } catch (error: any) {
                const cache = entry.cache!;
                if (cache.action.logValidationErrors)
                    this.logger.warn(`Action ${cache.label} return type serialization error`, error);
                throw new RpcError(`Action ${cache.label} return type serialization error: ${error.message}`, {
                    cause: error,
                });
            }
            this.connection.sendFrame(frameMemory(), size);
        } catch (error: any) {
            this.sendError(id, this.security.transformError(error));
        }
    }

    protected sendError(id: number, error: Error | string): void {
        const size = writeErrorFrameTransient(id, this.routeFlag, rpcEncodeError(error), this.routeData);
        this.connection.sendFrame(frameMemory(), size);
    }

    protected sendAck(id: number): void {
        const size = writeAckFrameTransient(id, this.routeFlag, this.routeData);
        this.connection.sendFrame(frameMemory(), size);
    }

    protected sendComplete(id: number, subscription: number): void {
        const size = writeControlIdFrameTransient(id, this.routeFlag, ControlOp.Complete, subscription, this.routeData);
        this.connection.sendFrame(frameMemory(), size);
    }

    protected sendStreamError(id: number, subscription: number, error: Error | string): void {
        const size = writeStreamErrorFrameTransient(
            id,
            this.routeFlag,
            subscription,
            rpcEncodeError(error),
            this.routeData,
        );
        this.connection.sendFrame(frameMemory(), size);
    }

    /**
     * Sends one value of an observable or subject: a frame the client reads without a message object, written like an action result.
     */
    protected sendNext(
        types: ActionTypes,
        contextId: number,
        subscription: number,
        value: any,
        label: string,
        logValidationErrors: boolean,
    ): void {
        let size: number;
        try {
            size =
                value instanceof PreSerialized
                    ? writePreSerializedChannelFrameTransient(
                          contextId,
                          this.routeFlag,
                          subscription,
                          value,
                          isPositionalTuple(types, nextValueType(types)),
                          this.routeData,
                      )
                    : writeChannelFrameTransient(
                          contextId,
                          this.routeFlag,
                          subscription,
                          types.nextValueEncoder!,
                          value,
                          this.routeData,
                      );
        } catch (error: any) {
            if (logValidationErrors) this.logger.warn(label, error);
            throw new RpcError(label + ': ' + error.message, { cause: error });
        }
        this.connection.sendFrame(frameMemory(), size);
    }

    /**
     * Something observes or guards this action (custom security, event listeners, stopwatch): the regular handler runs.
     * The arguments are decoded here since the frame is gone after this call, an error surfaces where
     * the handler would decode them, after the access check.
     */
    protected executeThroughHandler(
        buffer: Uint8Array,
        id: number,
        entry: ActionEntry,
        bodyOffset: number,
        end: number,
    ): void {
        let args: any[] = [];
        let decodeError: any;
        try {
            // a copy, the handler is async and the decoder reuses its array for the next call
            args = entry.decode!(buffer, bodyOffset, end).slice();
            // the frame is gone when the handler runs
            for (const i of entry.transient!) {
                if (args[i]) args[i] = copyFrame(args[i], 0, args[i].byteLength);
            }
        } catch (error) {
            decodeError = error;
        }

        this.invoke(entry.cache!, args, decodeError).then(
            value => this.sendValue(id, entry, value),
            error => this.sendError(id, error),
        );
    }

    /**
     * Calls an action with everything that observes or guards it. An error is what should be sent to the client.
     */
    public async invoke(cache: RpcCacheAction, args: any[], decodeError?: any): Promise<any> {
        const { controller, types, fn, resolver, action, label } = cache;

        //the timings exist for the listeners only
        const timed = this.eventDispatcher.hasListeners(onRpcAction);
        const timing = { start: timed ? performance.now() : 0, end: 0 } as RpcActionTimings;

        if (timed) {
            this.eventDispatcher.dispatch(
                onRpcAction,
                () => ({
                    phase: 'start',
                    context: this.context,
                    timing,
                    controller,
                }),
                this.injector,
            );
        }

        const triggerError = (error?: any) => {
            timing.end = performance.now();
            this.eventDispatcher.dispatch(
                onRpcAction,
                () => ({
                    phase: 'fail',
                    error: ensureError(error, RpcError),
                    context: this.context,
                    timing,
                    controller,
                }),
                this.injector,
            );
        };

        const access = await this.hasControllerAccess(controller, this.connection);
        if (timed) timing.controllerAccess = performance.now() - timing.start;
        if (!access) {
            const error = new RpcError(`Access denied to action ${controller.actionName}`);
            triggerError(error);
            throw error;
        }

        if (timed) timing.types = performance.now() - timing.start;

        if (decodeError) {
            const message = `Validation error for arguments of ${label}`;
            if (action.logValidationErrors) this.logger.warn(message, decodeError);
            triggerError(decodeError);
            throw new RpcError(`${message}: ${decodeError.message}`);
        }
        if (timed) timing.parseBody = performance.now() - timing.start;

        const controllerInstance = resolver(this.injector.scope);

        if (!controllerInstance) {
            const error = new RpcError(`No instance of ${getClassName(controller.controllerClassType)} found.`);
            triggerError(error);
            throw error;
        }

        if (!isArray(args)) {
            const message = `Invalid arguments for ${label} - expected array`;
            this.logger.error(`${message} but got`, args);
            triggerError(message);
            throw new RpcError(message);
        }

        const errors: ValidationErrorItem[] = [];
        types.parametersValidate(args, { errors });
        if (timed) timing.validate = performance.now() - timing.start;

        if (errors.length) {
            const error = new ValidationError(errors);
            if (action.logValidationErrors) {
                this.logger.warn(`Validation error for arguments of ${label}, using 'any' now.`, error);
            }
            if (action.strictSerialization) {
                triggerError(error);
                throw new RpcError(`Validation error for arguments of ${label}: ${error.message}`);
            }
        }

        this.stats.increase('actions', 1);

        try {
            // In some environments, we get "TypeError: Spread syntax requires ...iterable[Symbol.iterator] to be a function"
            // so we use `apply` instead of `method(...args)`
            const result = await fn.apply(controllerInstance, args);
            if (timed) {
                timing.end = performance.now();
                this.eventDispatcher.dispatch(
                    onRpcAction,
                    () => ({
                        phase: 'success',
                        context: this.context,
                        timing,
                        controller,
                    }),
                    this.injector,
                );
            }
            return result;
        } catch (error: any) {
            triggerError(error);
            throw this.security.transformError(error);
        }
    }

    /** An action called over HTTP: the arguments are JSON, and so is what is returned. */
    public async invokeJson(
        controllerName: string,
        methodName: string,
        args: any[],
    ): Promise<{ value: any; type: Type }> {
        const cache = this.getCacheAction(controllerName, methodName);
        const { parameters, resultSchema } = cache.types;
        const value = await this.invoke(cache, cast(args, undefined, undefined, undefined, parameters) as any[]);
        return { value: { v: value }, type: resultSchema };
    }

    /** What the HTTP client needs to know to call an action, without the handshake a connection has. */
    public jsonTypes(controllerName: string, methodName: string): ActionTypes {
        return this.loadTypes(controllerName, methodName);
    }

    /** Observables, subjects and collections keep the context open. */
    protected openStream(result: any, id: number, cache: RpcCacheAction, method: string): void {
        const { types } = cache;

        if (result instanceof Collection) {
            this.openCollection(result, id, types);
            return;
        }

        let trackingType: NumericKeys<ActionStats> = 'observables';

        this.observables[id] = {
            observable: result,
            subscriptions: {},
            types,
            classType: cache.controller.controllerClassType,
            method: method,
            trackedAsObservable: !isSubject(result),
        };

        let type: ChannelSubType = ChannelSubType.Observable;
        if (isSubject(result)) {
            trackingType = 'subjects';
            type = ChannelSubType.Subject;

            if (isBehaviorSubject(result)) {
                trackingType = 'behaviorSubjects';
                type = ChannelSubType.BehaviorSubject;
                if (result instanceof ProgressTracker) {
                    trackingType = 'progressTrackers';
                    type = ChannelSubType.ProgressTracker;
                }
            }

            const label = `Action ${cache.label} return type serialization error`;
            const logValidationErrors = !!cache.action.logValidationErrors;
            const subscribe = () =>
                result.subscribe(
                    (next: any) => {
                        this.sendNext(types, id, 0, next, label, logValidationErrors);
                    },
                    (error: any) => {
                        if (v.completed) return;
                        v.completed = true;
                        this.stats.active.increase(trackingType, -1);
                        this.sendStreamError(id, id, this.security.transformError(error));
                    },
                    () => {
                        if (v.completed) return;
                        v.completed = true;
                        this.stats.active.increase(trackingType, -1);
                        if (v.completedByClient) return; //we don't send Complete when the client issued unsubscribe
                        this.sendComplete(id, id);
                    },
                );

            const v = (this.observableSubjects[id] = {
                subject: result,
                trackingType,
                completed: false,
                completedByClient: false,
                subscribe,
                subscription: subscribe(),
            } as RpcServerActionObservableSubject);
        }

        this.stats.active.increase(trackingType, 1);
        this.stats.total.increase(trackingType, 1);

        const size = writeChannelAnnounceFrameTransient(id, this.routeFlag, type, this.routeData);
        this.connection.sendFrame(frameMemory(), size);
    }

    protected sendCollection(
        id: number,
        op: ControlOp.Collection | ControlOp.CollectionChange,
        entries: CollectionEntry[],
    ): void {
        const size = writeControlFrameTransient(
            id,
            this.routeFlag,
            op,
            writeCollectionEntries,
            entries,
            this.routeData,
        );
        this.connection.sendFrame(frameMemory(), size);
    }

    protected openCollection(collection: Collection<any>, id: number, types: ActionTypes): void {
        const items = types.collectionItems;
        const queryModel = types.collectionQueryModel;
        if (!items) throw new RpcError('No collectionItems set');
        if (!queryModel) throw new RpcError('No collectionQueryModel set');
        const state = typeOf<CollectionState>();
        const removed = typeOf<rpcCollectionRemove>();
        const sorted = typeOf<rpcCollectionSort>();

        this.sendCollection(id, ControlOp.Collection, [
            { kind: CollectionChangeKind.Model, type: queryModel, value: collection.model },
            { kind: CollectionChangeKind.State, type: state, value: collection.state },
            { kind: CollectionChangeKind.Set, type: items, value: collection.all() },
        ]);

        let unsubscribed = false;

        //we queue many events up for the next microtask using collectForMicrotask, and then send
        //everything as one frame.
        const eventsSub = collection.event.subscribe(
            collectForMicrotask((events: CollectionEvent<any>[]) => {
                if (unsubscribed) return;
                const entries: CollectionEntry[] = [];

                for (const event of events) {
                    if (event.type === 'add') {
                        entries.push({ kind: CollectionChangeKind.Add, type: items, value: event.items });
                    } else if (event.type === 'remove') {
                        entries.push({ kind: CollectionChangeKind.Remove, type: removed, value: { ids: event.ids } });
                    } else if (event.type === 'update') {
                        entries.push({ kind: CollectionChangeKind.Update, type: items, value: event.items });
                    } else if (event.type === 'set') {
                        entries.push({ kind: CollectionChangeKind.Set, type: items, value: collection.all() });
                    } else if (event.type === 'state') {
                        entries.push({ kind: CollectionChangeKind.State, type: state, value: collection.state });
                    } else if (event.type === 'sort') {
                        entries.push({ kind: CollectionChangeKind.Sort, type: sorted, value: { ids: event.ids } });
                    }
                }
                this.sendCollection(id, ControlOp.CollectionChange, entries);
            }),
        );

        collection.addTeardown(() => {
            const c = this.collections[id];
            if (c) c.unsubscribe();
        });

        this.collections[id] = {
            collection,
            types,
            unsubscribe: () => {
                if (unsubscribed) return;
                unsubscribed = true;
                eventsSub.unsubscribe();
                collection.unsubscribe();
            },
        };
    }
}
