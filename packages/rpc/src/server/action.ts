/*
 * Deepkit Framework
 * Copyright (C) 2021 Deepkit UG, Marc J. Schmidt
 *
 * This program is free software: you can redistribute it and/or modify
 * it under the terms of the MIT License.
 *
 * You should have received a copy of the MIT License along with this program.
 */

import { ClassType, collectForMicrotask, ensureError, getClassName, isArray, isPlainObject, isPrototypeOfBase, toFastProperties } from '@deepkit/core';
import { isBehaviorSubject, isSubject, ProgressTracker, ProgressTrackerState } from '@deepkit/core-rxjs';
import { assertType, getValidatorFunction, Guard, parametersToTuple, ReflectionClass, ReflectionKind, serializeType, Type, TypeObjectLiteral, typeOf, TypeTuple, ValidationError, ValidationErrorItem } from '@deepkit/type';
import { isObservable, Observable, Subject, Subscription } from 'rxjs';
import { Collection, CollectionEvent, CollectionQueryModel, CollectionQueryModelInterface, CollectionState } from '../collection.js';
import { getActions } from '../decorators.js';
import {
    ActionMode,
    ActionObservableTypes,
    ActionStats,
    EntitySubject,
    isEntitySubject,
    NumericKeys,
    rpcAction,
    rpcActionObservableSubscribeId,
    rpcActionType,
    RpcError,
    rpcResponseActionCollectionRemove,
    rpcResponseActionCollectionSort,
    rpcResponseActionObservable,
    rpcResponseActionObservableSubscriptionError,
    rpcResponseActionType,
    RpcStats,
    RpcTypes,
} from '../model.js';
import { createBodyDecoder, rpcEncodeError, RpcMessage } from '../protocol.js';
import { RpcCache, RpcCacheAction, RpcKernelBaseConnection, RpcMessageBuilder } from './kernel.js';
import { RpcControllerAccess, RpcKernelSecurity, SessionState } from './security.js';
import { InjectorContext, InjectorModule } from '@deepkit/injector';
import { LoggerInterface } from '@deepkit/logger';
import { onRpcAction, onRpcControllerAccess, RpcActionTimings, RpcControllerAccessEventStart } from '../events.js';
import { DataEvent, EventDispatcher } from '@deepkit/event';

export type ActionTypes = {
    strictSerialization: boolean;
    actionCallSchema: TypeObjectLiteral, //with args as property
    parametersValidate: Guard<any>,

    parameters: TypeTuple,
    mode: ActionMode;
    type: Type; //the type T of Collection<T>, EntitySubject<T>, Observable<T>, or return type of the function if mode=arbitrary

    resultSchema: TypeObjectLiteral, //with v as property
    observableNextSchema?: TypeObjectLiteral, //with v as property
    collectionSchema?: Type, //with v as array property
    collectionQueryModel?: Type,

    noTypeWarned: boolean;
};

function createNoTypeError(classType: ClassType, method: string) {
    return new RpcError(`No observable type on RPC action ${getClassName(classType)}.${method} detected. Either no return type Observable<T> defined or wrong RxJS nominal type.`);
}

function createNoObservableWarning(classType: ClassType, method: string) {
    return `RPC action ${getClassName(classType)}.${method} returns an Observable, but no specific type (e.g. Observable<T>) or 'any | unknown' type is defined. This might lead to unexpected behavior and slow performance.`;
}

function createNoTypeWarning(classType: ClassType, method: string, value: any) {
    const firstKey = Object.keys(value)[0];
    return new RpcError(`RPC action ${getClassName(classType)}.${method} returns an object, but no specific type (e.g. { ${firstKey || 'v'}: T }) or 'any | unknown' type is defined. This might lead to slow performance.`);
}

function validV(type: Type, index = 0): boolean {
    if (type.kind !== ReflectionKind.objectLiteral) return false;
    const second = type.types[index];
    if (!second || second.kind !== ReflectionKind.propertySignature) return false;
    if (second.name !== 'v') return false;
    if (second.type.kind === ReflectionKind.any || second.type.kind === ReflectionKind.unknown) return false;
    return true;
}

const anyType: Type = { kind: ReflectionKind.any };
const anyBodyType: Type = {
    kind: ReflectionKind.objectLiteral,
    types: [
        {
            kind: ReflectionKind.propertySignature,
            name: 'args',
            parent: Object as any,
            type: { kind: ReflectionKind.any },
        },
    ],
};
const anyParametersType: Type = {
    kind: ReflectionKind.tuple,
    types: [{
        kind: ReflectionKind.tupleMember,
        parent: undefined as any,
        type: {
            kind: ReflectionKind.rest,
            parent: undefined as any,
            type: { kind: ReflectionKind.any },
        },
    }],
};

export interface RpcServerActionObservableSubject {
    subject: Subject<any>,
    trackingType: NumericKeys<ActionStats>,
    completed: boolean,
    completedByClient: boolean,
    subscription: Subscription
}

export class RpcServerAction {
    rpcActionTypeDecoder = createBodyDecoder<rpcActionType>();
    rpcActionDecoder = createBodyDecoder<rpcAction>();
    protected observableSubjects: {
        [id: number]: RpcServerActionObservableSubject
    } = {};

    protected collections: {
        [id: number]: {
            collection: Collection<any>,
            unsubscribe: () => void
        }
    } = {};

    protected observables: {
        [id: number]: {
            observable: Observable<any>,
            classType: ClassType,
            method: string,
            types: ActionTypes,
            subscriptions: { [id: number]: { sub?: Subscription, active: boolean, complete: () => void } },
        }
    } = {};

    protected context: { connection: RpcKernelBaseConnection, injector: InjectorContext } = { connection: this.connection, injector: this.injector };

    constructor(
        protected stats: RpcStats,
        protected cache: RpcCache,
        protected connection: RpcKernelBaseConnection,
        protected controllers: Map<string, { controller: ClassType, module?: InjectorModule }>,
        protected injector: InjectorContext,
        protected eventDispatcher: EventDispatcher,
        protected security: RpcKernelSecurity,
        protected sessionState: SessionState,
        protected logger: LoggerInterface,
    ) {
    }

    public async handleActionTypes(message: RpcMessage, response: RpcMessageBuilder) {
        const body = message.decodeBody(this.rpcActionTypeDecoder);
        const types = this.loadTypes(body.controller, body.method);

        response.reply<rpcResponseActionType>(RpcTypes.ResponseActionType, {
            mode: types.mode,
            type: serializeType(types.strictSerialization ? types.type : anyType),
            parameters: serializeType(types.strictSerialization ? types.parameters : anyParametersType),
        });
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
    }

    protected async hasControllerAccess(controller: RpcControllerAccess, connection: RpcKernelBaseConnection): Promise<boolean> {
        const session = this.sessionState.getSession();

        const event = new DataEvent<RpcControllerAccessEventStart>({
            phase: 'start', session, controller, context: this.context,
        });
        await this.eventDispatcher.dispatch(onRpcControllerAccess, event, this.injector);

        try {
            let granted = event.data.granted;
            if ('undefined' === typeof granted) {
                granted = await this.security.hasControllerAccess(session, controller, connection);
            }
            await this.eventDispatcher.dispatch(onRpcControllerAccess, () => ({
                phase: granted ? 'success' : 'denied', session, controller, context: this.context,
            }), this.injector);
            return granted;
        } catch (error) {
            await this.eventDispatcher.dispatch(onRpcControllerAccess, () => ({
                phase: 'fail', error: ensureError(''), session, controller, context: this.context,
            }), this.injector);
            throw error;
        }
    }

    protected loadTypes(controller: string, methodName: string): ActionTypes {
        const cacheId = controller + '!' + methodName;
        let types = this.cache.actionsTypes[cacheId];
        if (types) return types;

        const classType = this.controllers.get(controller);
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

        const actionCallSchema: TypeObjectLiteral = {
            kind: ReflectionKind.objectLiteral,
            types: [
                { kind: ReflectionKind.propertySignature, name: 'args', parent: Object as any, type: parameters },
            ],
        };

        let unwrappedReturnType = methodReflection.getReturnType();
        if (unwrappedReturnType.kind === ReflectionKind.promise) {
            unwrappedReturnType = unwrappedReturnType.type;
        }

        const fullType = unwrappedReturnType;
        if (unwrappedReturnType.kind === ReflectionKind.union) {
            //if e.g. Subject | undefined, we take the non-undefined type
            const nonNullUndefined = unwrappedReturnType.types.filter(v => v.kind !== ReflectionKind.undefined && v.kind !== ReflectionKind.null);
            if (nonNullUndefined.length === 1) {
                unwrappedReturnType = nonNullUndefined[0];
            }
        }

        let type: Type = fullType;
        let nextType: Type | undefined;
        let collectionSchema: Type | undefined;
        let collectionQueryModel: Type | undefined;

        if (unwrappedReturnType.kind === ReflectionKind.class) {
            if (isPrototypeOfBase(unwrappedReturnType.classType, Collection)) {
                mode = 'collection';
                type = unwrappedReturnType.typeArguments ? unwrappedReturnType.typeArguments[0] : { kind: ReflectionKind.any };
                collectionSchema = {
                    kind: ReflectionKind.objectLiteral,
                    types: [{
                        kind: ReflectionKind.propertySignature,
                        name: 'v',
                        parent: Object as any,
                        optional: true,
                        type: { kind: ReflectionKind.array, type: type },
                    }],
                };

                collectionQueryModel = typeOf<CollectionQueryModelInterface<unknown>>([type]) as TypeObjectLiteral;
            } else if (isPrototypeOfBase(unwrappedReturnType.classType, EntitySubject)) {
                mode = 'entitySubject';
                type = unwrappedReturnType.typeArguments ? unwrappedReturnType.typeArguments[0] : { kind: ReflectionKind.any };
            } else if (isPrototypeOfBase(unwrappedReturnType.classType, ProgressTracker)) {
                mode = 'observable';
                type = typeOf<ProgressTrackerState[] | undefined>();
                nextType = type;
            } else if (isPrototypeOfBase(unwrappedReturnType.classType, Observable)) {
                mode = 'observable';
                type = unwrappedReturnType.typeArguments ? unwrappedReturnType.typeArguments[0] : { kind: ReflectionKind.any };
                nextType = type;
            }
        }

        const resultSchema: TypeObjectLiteral = {
            kind: ReflectionKind.objectLiteral,
            types: [{
                kind: ReflectionKind.propertySignature,
                name: 'v',
                parent: Object as any,
                optional: true,
                type: type,
            }],
        };

        types = this.cache.actionsTypes[cacheId] = {
            strictSerialization: !!action.strictSerialization,
            parameters,
            actionCallSchema,
            resultSchema,
            mode,
            type,
            parametersValidate: getValidatorFunction(undefined, parameters),
            observableNextSchema: {
                kind: ReflectionKind.objectLiteral,
                types: [{
                    kind: ReflectionKind.propertySignature,
                    name: 'id',
                    parent: Object as any,
                    type: { kind: ReflectionKind.number },
                }, {
                    kind: ReflectionKind.propertySignature,
                    name: 'v',
                    parent: Object as any,
                    optional: true,
                    type: nextType || { kind: ReflectionKind.any },
                }],
            },
            collectionSchema,
            collectionQueryModel,
            noTypeWarned: false,
        };
        if (!types.type) {
            throw new RpcError(`No type detected for action ${controller}.${methodName}`);
        }
        toFastProperties(this.cache.actionsTypes);

        return types;
    }

    public async handle(message: RpcMessage, response: RpcMessageBuilder) {
        switch (message.type) {
            case RpcTypes.ActionObservableSubscribe: {
                const observable = this.observables[message.id];
                if (!observable) return response.error(new RpcError('No observable found'));
                response.strictSerialization = observable.types.strictSerialization;

                const { types, classType, method } = observable;
                const body = message.parseBody<rpcActionObservableSubscribeId>();
                if (observable.subscriptions[body.id]) return response.error(new RpcError('Subscription already created'));
                if (!types.observableNextSchema) return response.error(createNoTypeError(classType, method));

                if (!types.noTypeWarned && (types.mode !== 'observable' || !validV(types.observableNextSchema, 1))) {
                    types.noTypeWarned = true;
                    this.logger.warn(createNoObservableWarning(classType, method));
                }

                const sub: { active: boolean, sub?: Subscription, complete: () => void } = {
                    active: true,
                    complete: () => {
                        sub.active = false;
                        if (sub.sub) sub.sub.unsubscribe();
                        response.reply<rpcActionObservableSubscribeId>(RpcTypes.ResponseActionObservableComplete, {
                            id: body.id,
                        });
                    },
                };
                observable.subscriptions[body.id] = sub;

                this.stats.total.increase('subscriptions', 1);
                response.errorLabel = `Observable ${getClassName(observable.classType)}.${observable.method} next serialization error`;
                sub.sub = observable.observable.subscribe((next) => {
                    if (!sub.active) return;
                    response.reply(RpcTypes.ResponseActionObservableNext, {
                        id: body.id,
                        v: next,
                    }, types.observableNextSchema);
                }, (error) => {
                    this.stats.total.increase('subscriptions', -1);
                    const extracted = rpcEncodeError(this.security.transformError(error));
                    response.reply<rpcResponseActionObservableSubscriptionError>(RpcTypes.ResponseActionObservableError, {
                        ...extracted,
                        id: body.id,
                    });
                }, () => {
                    this.stats.total.increase('subscriptions', -1);
                    response.reply<rpcActionObservableSubscribeId>(RpcTypes.ResponseActionObservableComplete, {
                        id: body.id,
                    });
                });

                break;
            }

            case RpcTypes.ActionCollectionUnsubscribe: {
                const collection = this.collections[message.id];
                if (!collection) return response.error(new RpcError('No collection found'));
                collection.unsubscribe();
                delete this.collections[message.id];
                break;
            }

            case RpcTypes.ActionCollectionModel: {
                const collection = this.collections[message.id];
                if (!collection) return response.error(new RpcError('No collection found'));
                const body = message.parseBody<CollectionQueryModel<any>>(); //todo, add correct type argument
                collection.collection.model.set(body);
                collection.collection.model.changed();
                break;
            }

            case RpcTypes.ActionObservableUnsubscribe: {
                const observable = this.observables[message.id];
                if (!observable) return response.error(new RpcError('No observable to unsubscribe found'));
                const body = message.parseBody<rpcActionObservableSubscribeId>();
                const sub = observable.subscriptions[body.id];
                if (!sub) return;
                sub.active = false;
                if (sub.sub) {
                    sub.sub.unsubscribe();
                }
                delete observable.subscriptions[body.id];
                break;
            }

            case RpcTypes.ActionObservableDisconnect: {
                const observable = this.observables[message.id];
                if (!observable) return response.error(new RpcError('No observable to disconnect found'));
                for (const sub of Object.values(observable.subscriptions)) {
                    sub.complete(); //we send all active subscriptions it was completed
                }
                this.stats.active.increase('observables', -1);
                delete this.observables[message.id];
                break;
            }

            case RpcTypes.ActionObservableSubjectUnsubscribe: { //aka completed
                const subject = this.observableSubjects[message.id];
                if (!subject) return response.error(new RpcError('No subject to unsubscribe found'));
                if (subject.completed) return;
                subject.completedByClient = true;
                subject.completed = true;
                this.stats.active.increase(subject.trackingType, -1);
                subject.subscription.unsubscribe();
                delete this.observableSubjects[message.id];
                break;
            }

            case RpcTypes.ActionObservableProgressNext: { //ProgressTracker changes from client (e.g. stop signal)
                const observable = this.observables[message.id];
                if (!observable || !(observable.observable instanceof ProgressTracker)) return response.error(new RpcError('No observable ProgressTracker to sync found'));
                response.strictSerialization = observable.types.strictSerialization;
                observable.observable.next(message.parseBody<ProgressTrackerState[]>());
                break;
            }
        }
    }

    public async handleAction(message: RpcMessage, response: RpcMessageBuilder) {
        const body = message.decodeBody(this.rpcActionDecoder);
        const cacheKey = body.controller + '!' + body.method;

        let cache = this.cache.actions[cacheKey];
        if (!cache) {
            const classType = this.controllers.get(body.controller);
            if (!classType) throw new RpcError(`No controller registered for id ${body.controller}`);

            const action = getActions(classType.controller).get(body.method);
            if (!action) throw new RpcError(`Action unknown ${body.method}`);

            const controller: RpcControllerAccess = {
                controllerName: body.controller,
                actionName: body.method,
                controllerClassType: classType.controller,
                actionGroups: action.groups,
                actionData: action.data,
            };
            const label = `${getClassName(classType.controller)}.${body.method}`;
            const types = this.loadTypes(body.controller, body.method);
            const fn = classType.controller.prototype[body.method] as Function;
            const resolver = this.injector.resolve(classType.module, classType.controller);
            const bodyDecoder = createBodyDecoder(action.strictSerialization ? types.actionCallSchema : anyBodyType);
            cache = {
                controller, types, fn, resolver, action, label,
                bodyDecoder,
            } as RpcCacheAction;
            this.cache.actions[cacheKey] = cache;
        }

        const { controller, types, fn, resolver, action, label, bodyDecoder } = cache;

        const timing = { start: performance.now(), end: 0 } as RpcActionTimings;

        this.eventDispatcher.dispatch(onRpcAction, () => ({
            phase: 'start', context: this.context, timing, controller,
        }), this.injector);

        const triggerError = (error?: any) => {
            timing.end = performance.now();
            this.eventDispatcher.dispatch(onRpcAction, () => ({
                phase: 'fail', error: ensureError(error, RpcError), context: this.context, timing, controller,
            }), this.injector);
        };

        const access = await this.hasControllerAccess(controller, this.connection);
        timing.controllerAccess = performance.now() - timing.start;
        if (!access) {
            const error = new RpcError(`Access denied to action ${body.method}`);
            triggerError(error);
            return response.error(error);
        }

        timing.types = performance.now() - timing.start;
        let value: { args: any[] } = { args: [] };

        response.strictSerialization = !!action.strictSerialization;
        response.logValidationErrors = !!action.logValidationErrors;

        try {
            value = message.decodeBody(bodyDecoder);
            timing.parseBody = performance.now() - timing.start;
        } catch (error: any) {
            const message = `Validation error for arguments of ${label}`;
            if (action.logValidationErrors) {
                this.logger.warn(message, error);
            }
            triggerError(error);
            return response.error(`${message}: ${error.message}`);
        }

        const controllerInstance = resolver(this.injector.scope);

        if (!controllerInstance) {
            const error = new RpcError(`No instance of ${getClassName(controller.controllerClassType)} found.`);
            triggerError(error);
            return response.error(error);
        }

        if (!isArray(value.args)) {
            const message = `Invalid arguments for ${label} - expected array`;
            this.logger.error(`${message} but got`, value.args);
            triggerError(message);
            return response.error(message);
        }

        // const converted = types.parametersDeserialize(value.args);
        const errors: ValidationErrorItem[] = [];
        types.parametersValidate(value.args, { errors });
        timing.validate = performance.now() - timing.start;

        if (errors.length) {
            const error = new ValidationError(errors);
            if (action.logValidationErrors) {
                this.logger.warn(`Validation error for arguments of ${label}, using 'any' now.`, error);
            }
            if (action.strictSerialization) {
                const message = `Validation error for arguments of ${label}: ${error.message}`;
                triggerError(error);
                return response.error(message);
            }
        }

        this.stats.increase('actions', 1);
        response.errorLabel = `Action ${label} return type serialization error`;

        try {
            // In some environments, we get "TypeError: Spread syntax requires ...iterable[Symbol.iterator] to be a function"
            // so we use `apply` instead of `method(...value.args)`
            const result = await fn.apply(controllerInstance, value.args);
            timing.end = performance.now();
            this.eventDispatcher.dispatch(onRpcAction, () => ({
                phase: 'success', context: this.context, timing, controller,
            }), this.injector);

            if (isEntitySubject(result)) {
                response.reply(RpcTypes.ResponseEntity, { v: result.value }, types.resultSchema);
            } else if (result instanceof Collection) {
                const collection = result;
                if (!types.collectionSchema) throw new RpcError('No collectionSchema set');
                if (!types.collectionQueryModel) throw new RpcError('No collectionQueryModel set');

                response.composite(RpcTypes.ResponseActionCollection)
                    .add(RpcTypes.ResponseActionCollectionModel, collection.model, types.collectionQueryModel)
                    .add<CollectionState>(RpcTypes.ResponseActionCollectionState, collection.state)
                    .add(RpcTypes.ResponseActionCollectionSet, { v: collection.all() }, types.collectionSchema)
                    .send();

                let unsubscribed = false;

                //we queue many events up for the next microtask using collectForMicrotask, and then send
                //everything as one composite message.
                const eventsSub = collection.event.subscribe(collectForMicrotask((events: CollectionEvent<any>[]) => {
                    if (unsubscribed) return;
                    const composite = response.composite(RpcTypes.ResponseActionCollectionChange);

                    for (const event of events) {
                        if (event.type === 'add') {
                            //when the user has already a EntitySubject on one of those event.items,
                            //then we technically send it unnecessarily. However, we would have to introduce
                            //a new RpcType to send only the IDs, which is not yet implemented.
                            composite.add(RpcTypes.ResponseActionCollectionAdd, { v: event.items }, types.collectionSchema);
                        } else if (event.type === 'remove') {
                            composite.add<rpcResponseActionCollectionRemove>(RpcTypes.ResponseActionCollectionRemove, { ids: event.ids });
                        } else if (event.type === 'update') {
                            composite.add(RpcTypes.ResponseActionCollectionUpdate, { v: event.items }, types.collectionSchema);
                        } else if (event.type === 'set') {
                            composite.add(RpcTypes.ResponseActionCollectionSet, { v: collection.all() }, types.collectionSchema);
                        } else if (event.type === 'state') {
                            composite.add<CollectionState>(RpcTypes.ResponseActionCollectionState, collection.state);
                        } else if (event.type === 'sort') {
                            composite.add<rpcResponseActionCollectionSort>(RpcTypes.ResponseActionCollectionSort, { ids: event.ids });
                        }
                    }
                    composite.send();
                }));

                collection.addTeardown(() => {
                    const c = this.collections[message.id];
                    if (c) c.unsubscribe();
                });

                this.collections[message.id] = {
                    collection,
                    unsubscribe: () => {
                        if (unsubscribed) return;
                        unsubscribed = true;
                        eventsSub.unsubscribe();
                        collection.unsubscribe();
                    },
                };
            } else if (isObservable(result)) {
                let trackingType: NumericKeys<ActionStats> = 'observables';

                this.observables[message.id] = {
                    observable: result,
                    subscriptions: {},
                    types,
                    classType: controller.controllerClassType,
                    method: body.method,
                };

                let type: ActionObservableTypes = ActionObservableTypes.observable;
                if (isSubject(result)) {
                    trackingType = 'subjects';
                    type = ActionObservableTypes.subject;

                    if (isBehaviorSubject(result)) {
                        trackingType = 'behaviorSubjects';
                        type = ActionObservableTypes.behaviorSubject;
                        if (result instanceof ProgressTracker) {
                            trackingType = 'progressTrackers';
                            type = ActionObservableTypes.progressTracker;
                        }
                    }

                    const v = this.observableSubjects[message.id] = {
                        subject: result,
                        trackingType,
                        completed: false,
                        completedByClient: false,
                        subscription: result.subscribe((next) => {
                            response.reply(RpcTypes.ResponseActionObservableNext, {
                                id: message.id,
                                v: next,
                            }, types.observableNextSchema);
                        }, (error) => {
                            if (v.completed) return;
                            v.completed = true;
                            this.stats.active.increase(trackingType, -1);
                            const extracted = rpcEncodeError(this.security.transformError(error));
                            response.reply<rpcResponseActionObservableSubscriptionError>(RpcTypes.ResponseActionObservableError, {
                                ...extracted,
                                id: message.id,
                            });
                        }, () => {
                            if (v.completed) return;
                            v.completed = true;
                            this.stats.active.increase(trackingType, -1);
                            if (v.completedByClient) return; //we don't send ResponseActionObservableComplete when the client issued unsubscribe
                            response.reply<rpcActionObservableSubscribeId>(RpcTypes.ResponseActionObservableComplete, {
                                id: message.id,
                            });
                        }),
                    } as RpcServerActionObservableSubject;
                }

                this.stats.active.increase(trackingType, 1);
                this.stats.total.increase(trackingType, 1);

                response.reply<rpcResponseActionObservable>(RpcTypes.ResponseActionObservable, { type });
            } else {
                if (!types.noTypeWarned && isPlainObject(result) && !validV(types.resultSchema)) {
                    types.noTypeWarned = true;
                    this.logger.warn(createNoTypeWarning(controller.controllerClassType, body.method, result));
                }

                response.reply(RpcTypes.ResponseActionSimple, { v: result }, types.resultSchema);
            }
        } catch (error: any) {
            triggerError(error);
            response.error(this.security.transformError(error));
        }
    }
}
