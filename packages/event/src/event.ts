/*
 * Deepkit Framework
 * Copyright (C) 2021 Deepkit UG, Marc J. Schmidt
 *
 * This program is free software: you can redistribute it and/or modify
 * it under the terms of the MIT License.
 *
 * You should have received a copy of the MIT License along with this program.
 */

import { asyncOperation, ClassType, CustomError, isClass, isFunction, isObject } from '@deepkit/core';
import { injectedFunction, InjectorContext, InjectorModule } from '@deepkit/injector';
import { ClassDecoratorResult, createClassDecoratorContext, createPropertyDecoratorContext, PropertyDecoratorResult } from '@deepkit/type';

export type EventListenerCallbackAsync<E> = (event: E, ...args: any[]) => Promise<void> | void;
export type EventListenerCallbackSync<E> = (event: E, ...args: any[]) => undefined | void;
export type EventListenerCallback<T extends EventToken<any> | EventTokenSync<any>> = T extends EventTokenSync<any> ? EventListenerCallbackSync<T['event']> : EventListenerCallbackAsync<T['event']>;

export class EventError extends CustomError {
}

/**
 * Result of `EventToken.listen(callback)`.
 */
export interface EventListener {
    eventToken: EventToken<any>;
    callback: (event: any) => any;
    module?: InjectorModule,
    /**
     * The lower the order, the sooner the listener is called. Default is 0.
     */
    order: number;
}

type EventOfEvent<E> = E extends SimpleDataEvent<infer D> ? D : (E | void);

/**
 * Extract the event type of EventToken.
 *
 * @example
 * ```typescript
 * type AppExecuteEvent = EventOfEventToken<typeof onAppExecute>;
 * ```
 */
export type EventOfEventToken<T> = T extends EventToken<infer E> | EventTokenSync<infer E> ? EventOfEvent<E> : void;

export type Dispatcher<T extends EventToken<any>> = (...args: DispatchArguments<T>) => EventDispatcherDispatchType<T>;

type ValueOrFactory<T> = T | (() => T);

/**
 * @reflection never
 */
export type DispatchArguments<T extends EventToken<any>> =
    T extends EventToken<infer E> | EventTokenSync<infer E>
        ? SimpleDataEvent<any> extends E
            ? E extends SimpleDataEvent<infer D>
                ? [event: ValueOrFactory<D | E>, injector?: InjectorContext]
                : BaseEvent extends E
                    ? [event?: ValueOrFactory<E>, injector?: InjectorContext]
                    : [event: ValueOrFactory<E>, injector?: InjectorContext]
            : BaseEvent extends E
                ? [event?: ValueOrFactory<E>, injector?: InjectorContext]
                : [event: ValueOrFactory<E>, injector?: InjectorContext]
        : [event: 'invalid-token', injector?: InjectorContext];


interface SimpleDataEvent<T> extends BaseEvent {
    data: T;
}

/**
 * Defines a new event token that is dispatched in an asynchronous way.
 * This token can be used to listen to events.
 * Per default this has no event data, so use DataEventToken for that.
 *
 * @example
 * ```typescript
 * const userAdded = new EventToken<DataEvent<{user: User}>>('user.added');
 *
 * eventDispatcher.listen(userAdded, (event) => {
 *    console.log('user added', event.data.user);
 * });
 *
 * eventDispatcher.dispatch(userAdded, {user: new User});
 * ```
 */
export class EventToken<T extends BaseEvent = BaseEvent> {
    /**
     * This is only to get easy the event-type. In reality this property is undefined.
     * e.g. `onHttpRequest(event: typeof onHttpRequest.event) {`
     */
    public readonly event!: T;

    constructor(
        public readonly id: string,
        event?: ClassType<T>,
    ) {
    }

    listen(callback: EventListenerCallback<EventToken<T>>, order: number = 0, module?: InjectorModule): EventListener {
        return { eventToken: this, callback, order: order, module };
    }
}

/**
 * Defines a new event token that is dispatched in a synchronous way.
 * It's not possible to subscribe to this event token with async listeners.
 *
 * ```typescript
 * const onChange = new EventTokenSync<DataEvent<{change: string}>>('change');
 *
 * eventDispatcher.listen(onChange, (event) => {
 *   console.log(event.data.change); // 'hello'
 * });
 *
 * eventDispatcher.dispatch(onChange, {change: 'hello'});
 * ```
 */
export class EventTokenSync<T extends BaseEvent = BaseEvent> extends EventToken<T> {
    public readonly sync: boolean = true;
}

export function isSyncEventToken(eventToken: any): eventToken is EventTokenSync<any> {
    return eventToken instanceof EventTokenSync;
}

/**
 * @example
 * ```typescript
 * const userAdded = new DataEventToken<User>('user.added');
 *
 * eventDispatcher.listen(userAdded, (event) => {
 *    console.log('user added', event.data); //event.data is from type User
 * });
 *
 * eventDispatcher.dispatch(userAdded, new User);
 * ```
 */
export class DataEventToken<T> extends EventToken<SimpleDataEvent<T>> {

}

export class BaseEvent {
    immediatePropagationStopped: boolean = false;
    defaultPrevented: boolean = false;

    preventDefault() {
        this.defaultPrevented = true;
    }

    stopImmediatePropagation() {
        this.immediatePropagationStopped = true;
    }
}

export class DataEvent<T> extends BaseEvent implements SimpleDataEvent<T> {
    constructor(public data: T) {
        super();
    }
}

class EventStore {
    token?: EventToken<any>;
    order: number = 0;
}

class EventClassStore {
    listeners: { eventToken: EventToken<any>, methodName: string, order: number }[] = [];
}

class EventClassApi {
    t = new EventClassStore;

    addListener(eventToken: EventToken<any>, methodName: string, order: number) {
        this.t.listeners.push({ eventToken, methodName, order: order });
    }
}

export const eventClass: ClassDecoratorResult<typeof EventClassApi> = createClassDecoratorContext(EventClassApi);

class EventDispatcherApi {
    t = new EventStore;

    onDecorator(target: ClassType, property?: string) {
        if (!this.t.token) throw new Error('@eventDispatcher.listen(eventToken) is the correct syntax.');
        if (!property) throw new Error('@eventDispatcher.listen(eventToken) works only on class properties.');

        eventClass.addListener(this.t.token, property, this.t.order)(target);
    }

    /**
     * Register a new event listener for given token.
     *
     * order: The lower the order, the sooner the listener is called. Default is 0.
     */
    listen(eventToken: EventToken<any>, order: number = 0) {
        if (!eventToken) new Error('@eventDispatcher.listen() No event token given');
        this.t.token = eventToken;
        this.t.order = order;
    }
}

export const eventDispatcher: PropertyDecoratorResult<typeof EventDispatcherApi> = createPropertyDecoratorContext(EventDispatcherApi);

type BuiltFn = (event: BaseEvent, injector: InjectorContext) => any;

export type EventListenerContainerEntryCallback = {
    order: number,
    fn: EventListenerCallback<any>,
    module?: InjectorModule,
    builtFn?: BuiltFn,
};

export type EventListenerContainerEntryService = {
    module: InjectorModule,
    order: number,
    classType: ClassType,
    methodName: string;
    builtFn?: BuiltFn,
};

export type EventListenerContainerEntry = EventListenerContainerEntryCallback | EventListenerContainerEntryService;

export function isEventListenerContainerEntryCallback(obj: any): obj is EventListenerContainerEntryCallback {
    return obj && isFunction(obj.fn);
}

export function isEventListenerContainerEntryService(obj: any): obj is EventListenerContainerEntryService {
    return obj && isClass(obj.classType);
}

function compareListenerEntry(a: EventListenerContainerEntry, b: EventListenerContainerEntry): boolean {
    if (isEventListenerContainerEntryCallback(a)) {
        if (!isEventListenerContainerEntryCallback(b)) return false;
        return a.fn == b.fn;
    } else if (isEventListenerContainerEntryService(a)) {
        if (!isEventListenerContainerEntryService(b)) return false;
        return a.module == b.module && a.classType == b.classType && a.methodName == b.methodName;
    }
    return false;
}

interface EventDispatcherFn {
    (event: BaseEvent, scopedContext: InjectorContext): Promise<void> | void;
}

export type EventDispatcherUnsubscribe = () => void;

export type EventDispatcherDispatchType<T extends EventToken<any>> = T extends EventTokenSync<any> ? void : Promise<void>;

function resolveEvent(event?: ValueOrFactory<BaseEvent>): BaseEvent {
    if (!event) return new BaseEvent();
    event = 'function' === typeof event ? event() : event;
    if (event instanceof BaseEvent) return event;
    return new DataEvent(event);
}

export interface EventListenerRegistered {
    listener: EventListenerContainerEntry;
    eventToken: EventToken<any>;
}

function noop() {
}

interface Context {
    listeners: EventListenerContainerEntry[],
    built: boolean,
    dispatcher: (event: BaseEvent, injector: InjectorContext) => any
}

/** @reflection never */
export class EventDispatcher {
    protected context = new Map<EventToken<any>, Context>();
    protected awaiter = new Map<EventToken<any>, { promise?: Promise<any>, resolve?: (value: any) => void }>();
    protected instances: any[] = [];
    protected registeredClassTypes = new Set<ClassType>();

    protected symbol = Symbol('eventDispatcher');

    constructor(
        public injector: InjectorContext = InjectorContext.forProviders([]),
    ) {
    }

    public registerListener(classType: ClassType, module: InjectorModule): EventListenerRegistered[] {
        if (this.registeredClassTypes.has(classType)) return [];
        this.registeredClassTypes.add(classType);
        const config = eventClass._fetch(classType);
        if (!config) return [];
        const result: EventListenerRegistered[] = [];
        for (const entry of config.listeners) {
            const listener = { module, classType: classType, methodName: entry.methodName, order: entry.order };
            this.add(entry.eventToken, listener);
            result.push({ eventToken: entry.eventToken, listener });
        }
        return result;
    }

    /**
     * Register a new event listener for given token.
     *
     * order: The lower the order, the sooner the listener is called. Default is 0.
     */
    listen<T extends EventToken<any>>(eventToken: T, callback: EventListenerCallback<T>, order: number = 0): EventDispatcherUnsubscribe {
        return this.add(eventToken, { fn: callback, order: order });
    }

    add(eventToken: EventToken<any>, listener: EventListenerContainerEntry): EventDispatcherUnsubscribe {
        const listeners = this.getListeners(eventToken);
        listeners.push(listener);

        this.scheduleDispatcherRebuild(eventToken);

        return () => {
            const index = listeners.findIndex(v => compareListenerEntry(v, listener));
            if (index !== -1) listeners.splice(index, 1);
            this.scheduleDispatcherRebuild(eventToken);
        };
    }

    /**
     * Waits for the next event of given token.
     */
    next<T extends EventToken<any>>(eventToken: T): Promise<T['event']> {
        let awaiter = this.awaiter.get(eventToken);
        if (!awaiter) {
            awaiter = {};
            this.awaiter.set(eventToken, awaiter);
            this.listen<any>(eventToken, (event) => {
                if (!awaiter!.resolve) return;
                awaiter!.resolve(event);
                awaiter!.resolve = undefined;
                awaiter!.promise = undefined;
            });
        }

        if (!awaiter.promise) {
            awaiter.promise = new Promise<any>((resolve) => {
                awaiter!.resolve = resolve;
            });
        }

        this.awaiter.set(eventToken, awaiter);

        return asyncOperation((resolve) => {
            awaiter.promise!.then(resolve);
        });
    }

    protected getContext(eventToken: EventToken<any>): Context {
        let context = this.context.get(eventToken);
        if (!context) {
            context = { listeners: [], built: false, dispatcher: () => undefined };
            this.context.set(eventToken, context);
        }
        return context;
    }

    protected scheduleDispatcherRebuild(eventToken: EventToken<any>) {
        const context = this.getContext(eventToken);
        context.built = false;
        context.dispatcher = (event: BaseEvent, injector?: InjectorContext) => {
            const fn = buildDispatcher(context.listeners, eventToken, this.injector);
            context.dispatcher = fn;
            context.built = true;
            return fn(event, injector || this.injector);
        };
    }

    getTokens(): EventToken<any>[] {
        return [...this.context.keys()];
    }

    hasListeners(eventToken?: EventToken<any>): boolean {
        return eventToken ? this.context.has(eventToken) : !!this.context.size;
    }

    getListeners(eventToken: EventToken<any>): EventListenerContainerEntry[] {
        return this.getContext(eventToken).listeners;
    }

    mergeContextsFrom(sourceDispatcher: EventDispatcher): void {
        if (this !== sourceDispatcher && sourceDispatcher.hasListeners()) {
            for (const [eventToken, context] of sourceDispatcher.context) {
                this.context.set(eventToken, context);
            }
        }
    }

    /**
     * Dispatches the given event to all listeners for the given event token.
     */
    dispatch<T extends EventToken<any>>(eventToken: T, ...args: DispatchArguments<T>): EventDispatcherDispatchType<T> {
        const context = this.getContext(eventToken);
        return context.dispatcher(args[0], args[1] || this.injector);
    }

    /**
     * Returns a dispatcher function for the given event token.
     * This is the most performant way to dispatch events, as it's pre-compiled
     * and if there are no listeners attached it's a noop.
     */
    getDispatcher<T extends EventToken<any>>(eventToken: T): Dispatcher<T> {
        const context = this.getContext(eventToken);
        return ((event: BaseEvent, injector: InjectorContext = this.injector) => {
            return context.dispatcher(event, injector);
        }) as any as Dispatcher<T>;
    }
}

function buildDispatcher(entries: EventListenerContainerEntry[], eventToken: EventToken<any>, injector: InjectorContext): EventDispatcherFn {
    if (entries.length === 0) {
        if (isSyncEventToken(eventToken)) {
            return () => {
            };
        }
        return async () => {
        };
    }

    entries.sort((a, b) => {
        if (a.order > b.order) return +1;
        if (a.order < b.order) return -1;
        return 0;
    });

    const calls: Array<(event: BaseEvent, injector: InjectorContext) => any> = [];

    for (const listener of entries) {
        if (isEventListenerContainerEntryCallback(listener)) {
            if (!listener.builtFn) {
                const thisInjector = listener.module ? injector.getInjector(listener.module) : injector.getRootInjector();
                if (!(listener.fn as any).__type) {
                    // no types available
                    const fn = listener.fn;
                    listener.builtFn = (event: BaseEvent) => fn(event);
                } else {
                    const fn = injectedFunction(listener.fn, thisInjector, 1);
                    listener.builtFn = (event: BaseEvent, injector: InjectorContext) => fn(injector.scope, event);
                }
            }

            calls.push(listener.builtFn);
        } else if (isEventListenerContainerEntryService(listener)) {
            if (!listener.builtFn) {
                const resolve = injector.resolve(listener.module, listener.classType);
                listener.builtFn = (event, injector) => resolve(injector.scope)[listener.methodName](event);
            }

            calls.push(listener.builtFn);
        }
    }

    if (isSyncEventToken(eventToken)) {
        return (_event: ValueOrFactory<BaseEvent>, injector: InjectorContext) => {
            const event = resolveEvent(_event);
            for (const call of calls) {
                call(event, injector);
                if (event.immediatePropagationStopped) return;
            }
        };
    }

    return async (_event: ValueOrFactory<BaseEvent>, injector: InjectorContext) => {
        const event = resolveEvent(_event);
        for (const call of calls) {
            await call(event, injector);
            if (event.immediatePropagationStopped) return;
        }
    };
}

export function eventWatcher(eventDispatcher: EventDispatcher, tokens: readonly EventToken<any>[]) {
    const dispatches: [eventTokenId: string, event: BaseEvent | any][] = [];
    const messages: string[] = [];

    function debugData(data: object): string {
        const lines: string[] = [];
        for (const i in data) {
            if (isObject((data as any)[i])) continue;
            lines.push(`${i}=${((data as any)[i])}`);
        }
        return lines.join(' ');
    }

    for (const token of tokens) {
        eventDispatcher.listen(token, (event) => {
            const data = event instanceof DataEvent ? event.data : event;
            dispatches.push([token.id, data]);
            const string = debugData(data);
            messages.push(`${token.id}${string ? ` ${string}` : ''}`);
        });
    }

    type EventTokenSimpleData<T> = T extends EventToken<infer E> | EventTokenSync<infer E> ? E extends SimpleDataEvent<infer D> ? D : E : never;

    return {
        dispatches,
        messages,
        clear() {
            dispatches.length = 0;
            messages.length = 0;
        },
        get<T extends EventToken>(token: T, filter?: (event: EventTokenSimpleData<T>) => boolean): EventTokenSimpleData<T> {
            for (const [id, event] of dispatches) {
                const data = event instanceof DataEvent ? event.data : event;
                if (id === token.id && (!filter || filter(data))) return data;
            }
            throw new Error(`No event dispatched for token ${token.id}`);
        },
    };
}
