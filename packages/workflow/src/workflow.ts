/*
 * Deepkit Framework
 * Copyright (C) 2021 Deepkit UG, Marc J. Schmidt
 *
 * This program is free software: you can redistribute it and/or modify
 * it under the terms of the MIT License.
 *
 * You should have received a copy of the MIT License along with this program.
 */

import { capitalize, ClassType, CompilerContext, CustomError, ExtractClassType, getClassName, isArray, toFastProperties } from '@deepkit/core';
import { BaseEvent, EventDispatcher, EventToken, isEventListenerContainerEntryCallback, isEventListenerContainerEntryService } from '@deepkit/event';
import { injectedFunction, InjectorContext } from '@deepkit/injector';
import { FrameCategory, Stopwatch } from '@deepkit/stopwatch';
import { ReflectionClass } from '@deepkit/type';

interface WorkflowTransition<T> {
    from: keyof T & string,
    to: keyof T & string,
    label?: string;
}

export class WorkflowEvent extends BaseEvent {
    public nextState?: any;
    public nextStateEvent?: any;

    clearNext() {
        this.nextState = undefined;
        this.nextStateEvent = undefined;
    }

    /**
     * @see WorkflowNextEvent.next
     */
    next(nextState: string, event?: any) {
        this.nextState = nextState;
        this.nextStateEvent = event;
    }

    hasNext(): boolean {
        return this.nextState !== undefined;
    }
}

export type WorkflowPlaces = { [name: string]: ClassType<WorkflowEvent> };

export interface WorkflowNextEvent<T extends WorkflowPlaces> {
    nextState?: keyof T & string;

    /**
     * Schedule to apply the next workflow step when all event listeners have been called.
     */
    next<S extends keyof T & string>(nextState: S, event?: ExtractClassType<T[S]>): void;
}

export type WorkflowDefinitionEvents<T extends WorkflowPlaces> = {
    [K in keyof T & string as `on${Capitalize<K>}`]: EventToken<BaseEvent & Omit<ExtractClassType<T[K]>, 'next' | 'nextState'> & WorkflowNextEvent<T>>
}

export class WorkflowDefinition<T extends WorkflowPlaces> {
    public transitions: WorkflowTransition<T>[] = [];
    public tokens: { [name in keyof T]?: EventToken<any> } = {};
    public next: { [name in keyof T]?: (keyof T & string)[] } = {};

    public symbol = Symbol('workflow');

    constructor(
        public readonly name: string,
        public readonly places: T,
        transitions: WorkflowTransitions<T> = {}
    ) {
        for (const placeName in this.places) {
            if (!this.places.hasOwnProperty(placeName)) continue;
            const token = new EventToken(name + '.' + placeName, this.places[placeName] as any);
            this.tokens[placeName] = token;
            (this as any)['on' + capitalize(placeName)] = token;
        }
        for (const [i, value] of Object.entries(transitions)) {
            if (isArray(value)) {
                for (const v of value) this.addTransition(i, v);
            } else if (value !== undefined) {
                this.addTransition(i, value);
            }
        }
        toFastProperties(this.tokens);
        toFastProperties(this.next);
    }

    getEventToken<K extends keyof T>(name: K): EventToken<ExtractClassType<T[K]>> {
        if (!this.tokens[name]) throw new Error(`No event token found for ${String(name)}`);

        return this.tokens[name]!;
    }

    addTransition(from: keyof T & string, to: keyof T & string, label?: string) {
        this.transitions.push({ from, to, label });
        if (!this.next[from]) this.next[from] = [];
        this.next[from]!.push(to);
    }

    public create(state: keyof T & string, eventDispatcher: EventDispatcher, stopwatch: Stopwatch, injector?: InjectorContext): Workflow<T> {
        return new Workflow(this, new WorkflowStateSubject(state), eventDispatcher, injector || eventDispatcher.injector, stopwatch);
    }

    getTransitionsFrom(state: keyof T & string): (keyof T & string)[] {
        return this.next[state]! || [];
    }

    /**
     * Builds the function that applies a state (and all states scheduled via event.next()).
     *
     * It runs synchronously and returns undefined as long as all listeners are synchronous. Only when a listener
     * returns a promise (or a stopwatch records), it continues in an async function and returns its promise. Most
     * HTTP requests have only synchronous listeners, so they save the async function and its microtask ticks.
     */
    public buildApplier(eventDispatcher: EventDispatcher): (scopedContext: InjectorContext, state: WorkflowState<T>, nextState: string, event: WorkflowEvent, stopwatch: Stopwatch) => Promise<void> | void {
        const compiler = new CompilerContext();
        compiler.context.set('WorkflowError', WorkflowError);
        compiler.context.set('WorkflowEvent', WorkflowEvent);
        compiler.context.set('getClassName', getClassName);

        const places: { place: string, stateString: string, check: string, listeners: { prelude: string, call: string, label: string }[] }[] = [];

        for (const [place, eventType] of Object.entries(this.places)) {
            const stateString = JSON.stringify(place);
            const eventTypeVar = compiler.reserveVariable('eventType', eventType);
            const allowedFrom = this.transitions.filter(v => v.to === place);
            const allowedFromCondition = allowedFrom.map(v => `currentState === ${JSON.stringify(v.from)}`).join(' || ');
            const checkFrom = `if (!(${allowedFromCondition})) throw new WorkflowError(\`Can not apply state change from \${currentState}->\${nextState}. There's no transition between them or it was blocked.\`);`;
            const check = `
                ${allowedFrom.length ? checkFrom : ''}
                if (!(event instanceof ${eventTypeVar})) {
                    throw new Error(\`State ${place} got the wrong event. Expected ${getClassName(eventType)}, got \${getClassName(event)}\`);
                }`;

            const eventToken = this.tokens[place]!;
            const listeners = eventDispatcher.getListeners(eventToken);
            listeners.sort((a, b) => {
                if (a.order > b.order) return +1;
                if (a.order < b.order) return -1;
                return 0;
            });

            const placeListeners: { prelude: string, call: string, label: string }[] = [];
            for (const listener of listeners) {
                if (isEventListenerContainerEntryCallback(listener)) {
                    const injector = listener.module ? eventDispatcher.injector.getInjector(listener.module) : eventDispatcher.injector.getRootInjector();
                    const fn = injectedFunction(listener.fn, injector, 1);
                    const fnVar = compiler.reserveVariable('fn', fn);
                    placeListeners.push({ prelude: '', call: `${fnVar}(scopedContext.scope, event)`, label: 'callback' });
                } else if (isEventListenerContainerEntryService(listener)) {
                    const injector = listener.module ? eventDispatcher.injector.getInjector(listener.module) : eventDispatcher.injector.getRootInjector();
                    const classTypeVar = compiler.reserveVariable('classType', listener.classType);
                    const moduleVar = listener.module ? ', ' + compiler.reserveVariable('module', listener.module) : '';

                    const method = ReflectionClass.from(listener.classType).getMethod(listener.methodName);
                    const resolvedVar = compiler.reserveVariable('resolved');
                    let call = `${resolvedVar}.${listener.methodName}(event)`;

                    if (method.getParameters().length > 1) {
                        const fn = injectedFunction((event, classInstance, ...args: any[]) => {
                            return classInstance[listener.methodName](event, ...args);
                        }, injector, 2, method.type, 1);
                        call = `${compiler.reserveVariable('fn', fn)}(scopedContext.scope, event, ${resolvedVar})`;
                    }
                    placeListeners.push({
                        prelude: `if (!${resolvedVar}) ${resolvedVar} = scopedContext.get(${classTypeVar}${moduleVar});`,
                        call,
                        label: `${getClassName(listener.classType)}.${listener.methodName}`,
                    });
                }
            }
            places.push({ place, stateString, check, listeners: placeListeners });
        }

        const awaitListener = (l: { prelude: string, call: string, label: string }) => `
            //${l.label}
            if (!event.immediatePropagationStopped) {
                ${l.prelude}
                const result = ${l.call};
                if (result && typeof result.then === 'function') await result;
            }`;

        const continueWithNext = `
                if (event.nextState) {
                    nextState = event.nextState;
                    event = event.nextStateEvent || new WorkflowEvent();
                    continue;
                }
                return;`;

        // async variant: used when a stopwatch records, so frames wrap each state
        const asyncCases: string[] = [];
        for (const p of places) {
            const stopWatchId = this.name + '.' + p.place;
            asyncCases.push(`
            case ${p.stateString}: {
                ${p.check}
                const frame = stopwatch.start(${JSON.stringify(stopWatchId)}, ${FrameCategory.workflow});
                try {
                    await frame.run(async () => {
                        ${p.listeners.map(awaitListener).join('\n')}
                    });
                    state.set(${p.stateString});
                } finally {
                    frame.end();
                }
                break;
            }`);
        }
        const asyncApplier = compiler.buildAsync(`
            while (true) {
                const currentState = state.get();
                switch (nextState) {
                    ${asyncCases.join('\n')}
                }
                ${continueWithNext}
            }
        `, 'scopedContext', 'state', 'nextState', 'event', 'stopwatch');
        compiler.context.set('asyncApplier', asyncApplier);

        // sync variant: runs listeners directly; once a listener returns a promise, the rest of the state
        // continues in an async tail function, which then hands over to self() for the following states.
        const tails: string[] = [];
        const syncCases: string[] = [];
        for (const [pi, p] of places.entries()) {
            const code: string[] = [];
            for (const [li, l] of p.listeners.entries()) {
                const tailName = `tail_${pi}_${li + 1}`;
                tails.push(`
                async function ${tailName}(scopedContext, state, event, stopwatch) {
                    ${p.listeners.slice(li + 1).map(awaitListener).join('\n')}
                    state.set(${p.stateString});
                    if (event.nextState) return self(scopedContext, state, event.nextState, event.nextStateEvent || new WorkflowEvent(), stopwatch);
                }`);
                code.push(`
                //${l.label}
                if (!event.immediatePropagationStopped) {
                    ${l.prelude}
                    const result = ${l.call};
                    if (result && typeof result.then === 'function') return result.then(() => ${tailName}(scopedContext, state, event, stopwatch));
                }`);
            }
            syncCases.push(`
            case ${p.stateString}: {
                ${p.check}
                ${code.join('\n')}
                state.set(${p.stateString});
                break;
            }`);
        }

        return compiler.raw(`
            ${tails.join('\n')}
            function self(scopedContext, state, nextState, event, stopwatch) {
                if (stopwatch && stopwatch.active) return asyncApplier(scopedContext, state, nextState, event, stopwatch);
                while (true) {
                    const currentState = state.get();
                    switch (nextState) {
                        ${syncCases.join('\n')}
                    }
                    ${continueWithNext}
                }
            }
            return self;
        `) as any;
    }
}

type WorkflowTransitions<T extends WorkflowPlaces> = { [name in keyof T]?: (keyof T & string) | (keyof T & string)[] };

export function createWorkflow<T extends WorkflowPlaces>(
    name: string,
    definition: T,
    transitions: WorkflowTransitions<T> = {}
): WorkflowDefinition<T> & WorkflowDefinitionEvents<T> {
    return new WorkflowDefinition(name, definition, transitions) as any;
}

export interface WorkflowState<T> {
    get(): keyof T & string;

    set(v: keyof T & string): void;
}

export class WorkflowStateSubject<T extends WorkflowPlaces> implements WorkflowState<T> {
    constructor(public value: keyof T & string) {
    }

    get() {
        return this.value;
    }

    set(v: keyof T & string) {
        this.value = v;
    }
}

const resolvedPromise: Promise<void> = Promise.resolve();

export class WorkflowError extends CustomError {
}

export class Workflow<T extends WorkflowPlaces> {
    protected events: { [name in keyof T]?: Function } = {};

    constructor(
        public definition: WorkflowDefinition<T>,
        public state: WorkflowState<T>,
        private eventDispatcher: EventDispatcher,
        private injector: InjectorContext,
        private stopwatch: Stopwatch
    ) {
    }

    /**
     * Compiles the applier upfront (it's otherwise built on the first apply()), e.g. for runtimes that only
     * allow code generation at startup like Cloudflare Workers.
     */
    prepare(): void {
        this.getApplier();
    }

    protected getApplier(): (scopedContext: InjectorContext, state: WorkflowState<T>, nextState: string, event: WorkflowEvent, stopwatch: Stopwatch) => Promise<void> | void {
        // cached on the dispatcher, rebuilt when its listeners changed
        let cache = (this.eventDispatcher as any)[this.definition.symbol] as { version: number, fn: any } | undefined;
        if (!cache || cache.version !== this.eventDispatcher.version) {
            cache = (this.eventDispatcher as any)[this.definition.symbol] = {
                version: this.eventDispatcher.version,
                fn: this.definition.buildApplier(this.eventDispatcher),
            };
        }
        return cache!.fn;
    }

    can(nextState: keyof T & string): boolean {
        return this.definition.getTransitionsFrom(this.state.get()).includes(nextState);
    }

    /**
     * @throws WorkflowError when next state is not possible to apply.
     */
    apply<K extends keyof T>(
        nextState: K,
        event?: ExtractClassType<T[K]>,
    ): Promise<void> {
        const fn = this.getApplier();

        try {
            return fn(this.injector, this.state, nextState as string, event || new WorkflowEvent() as ExtractClassType<T[K]>, this.stopwatch) || resolvedPromise;
        } catch (error) {
            return Promise.reject(error);
        }
    }

    /**
     * Like apply(), but returns undefined instead of a promise when all listeners ran synchronously,
     * and throws synchronously. Saves the promise and microtask for hot paths like HTTP requests.
     */
    applyMaybeSync<K extends keyof T>(nextState: K, event?: ExtractClassType<T[K]>): Promise<void> | void {
        const fn = this.getApplier();
        return fn(this.injector, this.state, nextState as string, event || new WorkflowEvent() as ExtractClassType<T[K]>, this.stopwatch);
    }

    isDone(): boolean {
        return this.definition.getTransitionsFrom(this.state.get()).length === 0;
    }
}
