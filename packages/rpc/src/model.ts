/*
 * Deepkit Framework
 * Copyright (C) 2021 Deepkit UG, Marc J. Schmidt
 *
 * This program is free software: you can redistribute it and/or modify
 * it under the terms of the MIT License.
 *
 * You should have received a copy of the MIT License along with this program.
 */
import { BehaviorSubject, Observable, Subject, TeardownLogic } from 'rxjs';
import { skip } from 'rxjs/operators';

import { ClassType, CustomError, bufferConcat, isObject } from '@deepkit/core';
import { tearDown } from '@deepkit/core-rxjs';
import { arrayBufferTo, entity } from '@deepkit/type';

export class RpcError extends CustomError {}

export type IdType = string | number;

export interface IdInterface {
    id: IdType;
}

export interface IdVersionInterface extends IdInterface {
    version: number;
}

type Writeable<T> = { -readonly [P in keyof T]: T[P] };

export type NumericKeys<T> = {
    [K in keyof T]: T[K] extends number ? K : never;
}[keyof T];

export class RpcTransportStats {
    readonly incomingBytes: number = 0;
    readonly outgoingBytes: number = 0;

    /**
     * Amount of incoming and outgoing messages.
     */
    public readonly incoming: number = 0;
    public readonly outgoing: number = 0;

    public increase(name: NumericKeys<RpcTransportStats>, count: number) {
        (this as Writeable<this>)[name] += count;
    }

    /** One incoming message. The same as increase(), without looking up a property by name per message. */
    public addIncoming(): void {
        (this as Writeable<this>).incoming++;
    }

    /** One outgoing message of the given size. */
    public addOutgoing(bytes: number): void {
        (this as Writeable<this>).outgoing++;
        (this as Writeable<this>).outgoingBytes += bytes;
    }
}

export class ActionStats {
    readonly observables: number = 0;
    readonly subjects: number = 0;
    readonly behaviorSubjects: number = 0;
    readonly progressTrackers: number = 0;
    readonly subscriptions: number = 0;

    public increase(name: NumericKeys<ActionStats>, count: number) {
        (this as Writeable<this>)[name] += count;
    }
}

export class ForwardedActionStats extends ActionStats {
    constructor(protected forward: ActionStats) {
        super();
    }

    public increase(name: NumericKeys<ActionStats>, count: number) {
        this.forward.increase(name, count);
        super.increase(name, count);
    }
}

export class RpcStats extends RpcTransportStats {
    public readonly connections: number = 0;
    public readonly totalConnections: number = 0;

    /**
     * How many actions have been executed.
     */
    public readonly actions: number = 0;

    public readonly active: ActionStats = new ActionStats();
    public readonly total: ActionStats = new ActionStats();

    public increase(name: NumericKeys<RpcStats>, count: number) {
        (this as Writeable<this>)[name] += count;
    }

    /** One executed action. */
    public addAction(): void {
        (this as Writeable<this>).actions++;
    }
}

export class ForwardedRpcStats extends RpcStats {
    public readonly active = new ForwardedActionStats(this.forward.active);
    public readonly total = new ForwardedActionStats(this.forward.total);

    constructor(protected forward: RpcStats) {
        super();
    }

    public increase(name: NumericKeys<RpcStats>, count: number) {
        this.forward.increase(name, count);
        super.increase(name, count);
    }

    public addIncoming(): void {
        this.forward.addIncoming();
        super.addIncoming();
    }

    public addOutgoing(bytes: number): void {
        this.forward.addOutgoing(bytes);
        super.addOutgoing(bytes);
    }

    public addAction(): void {
        this.forward.addAction();
        super.addAction();
    }
}

export class StreamBehaviorSubject<T> extends BehaviorSubject<T> {
    public readonly appendSubject = new Subject<T>();
    protected nextChange?: Subject<void>;

    protected nextOnAppend = false;
    protected unsubscribed = false;

    protected teardowns: TeardownLogic[] = [];

    constructor(item: T, teardown?: TeardownLogic) {
        super(item);
        if (teardown) {
            this.teardowns.push(teardown);
        }
    }

    public isUnsubscribed(): boolean {
        return this.unsubscribed;
    }

    get nextStateChange() {
        if (!this.nextChange) {
            this.nextChange = new Subject<void>();
        }
        return this.nextChange.toPromise();
    }

    addTearDown(teardown: TeardownLogic) {
        if (this.unsubscribed) {
            tearDown(teardown);
            return;
        }

        this.teardowns.push(teardown);
    }

    /**
     * This method differs to BehaviorSubject in the way that this does not throw an error
     * when the subject is closed/unsubscribed.
     */
    getValue(): T {
        if (this.hasError) {
            throw this.thrownError;
        } else {
            return (this as any)._value;
        }
    }

    next(value: T): void {
        super.next(value);

        if (this.nextChange) {
            this.nextChange.complete();
            delete this.nextChange;
        }
    }

    activateNextOnAppend() {
        this.nextOnAppend = true;
    }

    toUTF8() {
        const subject = new StreamBehaviorSubject(
            this.value instanceof Uint8Array ? arrayBufferTo(this.value, 'utf8') : '',
        );
        const sub1 = this.pipe(skip(1)).subscribe(v => {
            subject.next(v instanceof Uint8Array ? arrayBufferTo(v, 'utf8') : '');
        });
        const sub2 = this.appendSubject.subscribe(v => {
            subject.append(v instanceof Uint8Array ? arrayBufferTo(v, 'utf8') : '');
        });

        subject.nextOnAppend = this.nextOnAppend;
        // const that = this;
        // Object.defineProperty(subject, 'nextStateChange', {
        //     get() {
        //         console.log('utf8 nextStateChange');
        //         return that.nextStateChange;
        //     }
        // });

        subject.addTearDown(() => {
            sub1.unsubscribe();
            sub2.unsubscribe();
            this.unsubscribe();
        });

        return subject;
    }

    append(value: T): void {
        this.appendSubject.next(value);

        if (this.nextOnAppend) {
            if (value instanceof Uint8Array) {
                if (this.value instanceof Uint8Array) {
                    this.next(bufferConcat([this.value as any, value as any]) as any);
                } else {
                    this.next(value as any);
                }
            } else {
                this.next(((this.getValue() as any) + value) as any as T);
            }
        } else {
            if ('string' === typeof value) {
                if (!(this as any)._value) ((this as any)._value as any) = '';
                ((this as any)._value as any) = ((this as any)._value as any) + value;
            }
        }
    }

    unsubscribe(): void {
        if (this.unsubscribed) return;
        this.unsubscribed = true;

        for (const teardown of this.teardowns) {
            tearDown(teardown);
        }

        super.unsubscribe();
    }
}

const IsEntitySubject = Symbol.for('deepkit/entitySubject');

export function isEntitySubject(v: any): v is EntitySubject<any> {
    return !!v && isObject(v) && v.hasOwnProperty(IsEntitySubject);
}

export class EntitySubject<T extends IdInterface> extends StreamBehaviorSubject<T> {
    /**
     * Patches are in class format.
     */
    public readonly patches = new Subject<EntityPatch>();
    public readonly delete = new Subject<boolean>();

    [IsEntitySubject] = true;

    public deleted: boolean = false;

    get id(): string | number {
        return this.value.id;
    }

    get onDeletion(): Observable<void> {
        return new Observable(observer => {
            if (this.deleted) {
                observer.next();
                return;
            }

            const sub = this.delete.subscribe(() => {
                observer.next();
                sub.unsubscribe();
            });

            return {
                unsubscribe(): void {
                    sub.unsubscribe();
                },
            };
        });
    }

    next(value: T | undefined): void {
        if (value === undefined) {
            this.deleted = true;
            this.delete.next(true);
            super.next(this.value);
            return;
        }

        super.next(value);
    }
}

export class ControllerDefinition<T> {
    constructor(
        public path: string,
        public entities: ClassType[] = [],
    ) {}
}

export function ControllerSymbol<T>(path: string, entities: ClassType[] = []): ControllerDefinition<T> {
    return new ControllerDefinition<T>(path, entities);
}

@entity.name('@error:json')
export class JSONError {
    constructor(public readonly json: any) {}
}

export type ActionMode = 'arbitrary' | 'collection' | 'entitySubject' | 'observable';

export interface rpcCollectionRemove {
    ids: (string | number)[];
}

export interface rpcCollectionSort {
    ids: (string | number)[];
}

export interface rpcEntityRemove {
    entityName: string;
    ids: (string | number)[];
}

export interface EntityPatch {
    $set?: { [path: string]: any };
    $unset?: { [path: string]: number };
    $inc?: { [path: string]: number };
}

export interface rpcEntityPatch {
    entityName: string;
    id: string | number;
    version: number;
    patch: {
        $set?: Record<string, any>;
        $unset?: Record<string, number>;
        $inc?: Record<string, number>;
    };
}

export class AuthenticationError extends CustomError {}
