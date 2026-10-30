import { signal, WritableSignal } from '@angular/core';
import { Subject } from 'rxjs';
import { ActionObservableTypes, readBinaryRpcMessage, RpcMessage, RpcTypes } from '@deepkit/rpc';
import { deserializeType, stringifyType } from '@deepkit/type';
import { bufferConcat } from '@deepkit/core';
import { safeJsonStringify } from './utils.js';

declare const chrome: any;

export interface WebSocketMessage {
    id?: number;
    idx: number;
    type?: RpcTypes;
    direction: 'received' | 'sent';
    timestamp: number;
    size: number;
    data: string;
    binary: Uint8Array;
    deepkit?: {
        message: RpcMessage,
        debug: ReturnType<RpcMessage['debug']>,
    };
}

export interface ActionObservables {
    observables: number;
    subjects: number;
    behaviorSubjects: number;
    progressTrackers: number;
    subscriptions: number;
}

export interface RpcActionEmit {
    timestamp: number;
    data: string;
}

export interface RpcAction {
    id: number;
    idx: number;
    controller: string;
    method: string;
    action: string;
    status: string;
    loaded?: Date;
    executed?: Date;
    returned?: Date;
    mode: 'static' | 'observable' | 'subject' | 'behaviorSubject' | 'progressTracker';
    responses: number;
    size: number; //response size, sum of all responses
    sizeSent: number;
    sizeReceived: number;
    took?: number;
    returnType: string;
    timestamp: number;
    completed: number;
    args: any[];
    response?: any;
    errors: number;
    active: ActionObservables;
    emits: RpcActionEmit[];
}

export interface Summary {
    received: number;
    receivedBytes: number;
    sent: number;
    sentBytes: number;
    actionsTotal: number;
    actions: Record<string, number>;
    active: ActionObservables;
    total: ActionObservables;
}

export interface Client {
    id: number;
    url: string;
    closed: boolean;
    createdAt: Date;
    closedAt?: Date;
    type: 'unknown' | 'deepkit' | 'unsupported';
    actionIdx: number;
    actions: WritableSignal<RpcAction[]>;
    actionMap: Record<number, RpcAction>;
    messages: WritableSignal<WebSocketMessage[]>;
    summary: WritableSignal<Summary>;
    messages$: Subject<WebSocketMessage>;
    actionLoadTypes: Record<number, { action: string }>;
    typesCache: Record<string, string>;
    messageReader: (message: RpcMessage) => void;
    timestamp: number;
    timestampMap: Record<number, number>;
    chunks: Record<number, { loaded: number, buffers: Uint8Array[] }>;
}

export function clearClient(client: Client) {
    client.actions.update(() => []);
    client.messages.update(() => []);
}

function binaryToHex(binary: Uint8Array) {
    return Array.from(binary).map((v) => v.toString(16).padStart(2, '0')).join('');
}

function decreaseObservableStats(mode: RpcAction['mode'], summary: ActionObservables) {
    switch (mode) {
        case 'observable':
            summary.observables -= 1;
            break;
        case 'subject':
            summary.subjects -= 1;
            break;
        case 'behaviorSubject':
            summary.behaviorSubjects -= 1;
            break;
        case 'progressTracker':
            summary.progressTrackers -= 1;
            break;
    }
}

function completeObservable(status: string, action: RpcAction, observables: ActionObservables) {
    if (action.status === status) return;
    action.status = status;
    decreaseObservableStats(action.mode, observables);
    decreaseObservableStats(action.mode, action.active);
    action.completed = Date.now();
}

export const clients: WritableSignal<WritableSignal<Client>[]> = signal([]);
const clientMap: Record<number, WritableSignal<Client>> = {};

let messageIds = 0;
let socketIds = 0;

function base64ToArrayBuffer(base64: string) {
    const binary = atob(base64);
    const buffer = new ArrayBuffer(binary.length);
    const bytes = new Uint8Array(buffer);
    for (let i = 0; i < binary.length; i++) {
        bytes[i] = binary.charCodeAt(i);
    }
    return bytes;
}

export function clearMessages() {
    for (const client of clients()) {
        client().messages.update(() => []);
    }
}

export class RpcCollector {
    started = false;

    start(port: any) {
        if (this.started) return;
        this.started = true;
        startCollecting(port);
    }
}

export function startCollecting(port: any) {
    if (!chrome || !chrome.runtime) return;

    const tabId = chrome.devtools.inspectedWindow.tabId;

    port ||= chrome.runtime.connect({
        name: `${tabId}`,
    });

    clients.update(() => []);

    let first = true;

    port.onMessage.addListener((message: any) => {
        if (first) {
            first = false;
            clearMessages();
        }

        if (message.type === 'client') {
            const summarySignal = signal<Summary>({
                received: 0,
                receivedBytes: 0,
                sent: 0,
                sentBytes: 0,
                actionsTotal: 0,
                actions: {},
                total: {
                    observables: 0,
                    subjects: 0,
                    behaviorSubjects: 0,
                    progressTrackers: 0,
                    subscriptions: 0,
                },
                active: {
                    observables: 0,
                    subjects: 0,
                    behaviorSubjects: 0,
                    progressTrackers: 0,
                    subscriptions: 0,
                },
            });

            const client: Client = {
                id: socketIds++,
                url: message.url,
                type: 'unknown',
                closed: false,
                messages: signal([]),
                timestamp: message.timestamp,
                createdAt: new Date(message.timestamp),
                messages$: new Subject<WebSocketMessage>(),
                actions: signal([]),
                actionMap: {},
                typesCache: {},
                actionLoadTypes: {},
                timestampMap: {},
                actionIdx: 0,
                chunks: {},
                summary: summarySignal,
                messageReader: (message) => {
                    const summary: Summary = summarySignal();
                    const timestamp = client.timestampMap[message.id];
                    // console.log('message', RpcTypes[message.type], message.id, message.type, message.debug());
                    let actionChanged = false;
                    switch (message.type) {
                        case RpcTypes.Action: {
                            actionChanged = true;
                            let action = client.actionMap[message.id];
                            if (action) {
                                if (message.type) {
                                    action.executed = new Date(timestamp);
                                    action.status = 'executing';
                                }
                            } else {
                                summary.actionsTotal += 1;
                                const body = message.debug().body as {
                                    controller: string, method: string, args: any[]
                                };
                                const actionName = `${body.controller}.${body.method}`;
                                summary.actions[actionName] = (summary.actions[actionName] || 0) + 1;
                                action = {
                                    idx: ++client.actionIdx,
                                    id: message.id,
                                    controller: body.controller,
                                    method: body.method,
                                    loaded: new Date(timestamp),
                                    status: 'pending',
                                    action: actionName,
                                    responses: 0,
                                    size: message.bodySize,
                                    sizeSent: message.bodySize,
                                    sizeReceived: 0,
                                    mode: 'static',
                                    errors: 0,
                                    returnType: client.typesCache[actionName] || '',
                                    timestamp: timestamp,
                                    completed: 0,
                                    args: body.args,
                                    emits: [],
                                    active: {
                                        observables: 0,
                                        subjects: 0,
                                        behaviorSubjects: 0,
                                        progressTrackers: 0,
                                        subscriptions: 0,
                                    },
                                };
                                client.actions.update((v) => [...v, action]);
                                client.actionMap[action.id] = action;
                            }

                            break;
                        }
                        case RpcTypes.ActionType: {
                            const body = message.debug().body as {
                                controller: string, method: string
                            };
                            const actionName = `${body.controller}.${body.method}`;
                            client.actionLoadTypes[message.id] = { action: actionName };
                            break;
                        }
                        case RpcTypes.ResponseActionType: {
                            actionChanged = true;
                            const action = client.actionLoadTypes[message.id];
                            if (!action) break;
                            const body = message.debug().body as {
                                type: any;
                                mode: string;
                            };
                            const returnType = stringifyType(deserializeType(body.type));
                            client.typesCache[action.action] = returnType;
                            break;
                        }
                        case RpcTypes.ActionObservableSubscribe: {
                            // create new observable subscription
                            actionChanged = true;
                            const action = client.actionMap[message.id];
                            if (action) {
                                action.size += message.bodySize;
                                action.sizeSent += message.bodySize;
                                // action.status = `subscription`;
                                action.active.subscriptions += 1;
                                summary.active.subscriptions += 1;
                                summary.total.subscriptions += 1;
                                action.status = `subscribed (${action.active.subscriptions}x)`;
                            }
                            break;
                        }
                        case RpcTypes.ActionObservableSubjectUnsubscribe: {
                            // called for Subjects/BehaviorSubject/ProgressTracker
                            actionChanged = true;
                            const action = client.actionMap[message.id];
                            if (action) {
                                action.size += message.bodySize;
                                action.sizeSent += message.bodySize;
                                completeObservable('completed', action, summary.active);
                            }
                            break;
                        }
                        case RpcTypes.ActionObservableUnsubscribe: {
                            // unsubscribe a observable subscription
                            actionChanged = true;
                            const action = client.actionMap[message.id];
                            if (action) {
                                action.size += message.bodySize;
                                action.sizeSent += message.bodySize;
                                action.active.subscriptions -= 1;
                                summary.active.subscriptions -= 1;
                                action.status = `subscribed (${action.active.subscriptions}x)`;
                            }
                            break;
                        }
                        case RpcTypes.ActionObservableDisconnect: {
                            // client unsubscribes/disconnects an observable object
                            actionChanged = true;
                            const action = client.actionMap[message.id];
                            if (action) {
                                action.size += message.bodySize;
                                action.sizeSent += message.bodySize;
                                if (action.status !== 'completed') {
                                    action.status = 'completed';
                                    summary.active.observables -= 1;
                                    action.active.observables -= 1;
                                }
                            }
                            break;
                        }
                        case RpcTypes.ResponseActionObservableComplete: {
                            //  called for Subjects/BehaviorSubject/ProgressTracker and created Observable subscriptions
                            actionChanged = true;
                            const action = client.actionMap[message.id];
                            if (action) {
                                action.size += message.bodySize;
                                action.sizeReceived += message.bodySize;
                                completeObservable('completed', action, summary.active);
                            }
                            break;
                        }
                        case RpcTypes.ResponseActionObservable: {
                            actionChanged = true;
                            const action = client.actionMap[message.id];
                            if (action) {
                                action.size += message.bodySize;
                                action.sizeReceived += message.bodySize;
                                action.status = 'observableReady';
                                const body = message.debug().body as {
                                    type: ActionObservableTypes;
                                };
                                switch (body.type) {
                                    case ActionObservableTypes.observable: {
                                        summary.active.observables += 1;
                                        summary.total.observables += 1;
                                        action.active.observables += 1;
                                        action.mode = 'observable';
                                        action.returnType = `Observable<${action.returnType}>`;
                                        break;
                                    }
                                    case ActionObservableTypes.subject: {
                                        summary.active.subjects += 1;
                                        summary.total.subjects += 1;
                                        action.active.subjects += 1;
                                        action.mode = 'subject';
                                        action.returnType = `Subject<${action.returnType}>`;
                                        break;
                                    }
                                    case ActionObservableTypes.behaviorSubject: {
                                        summary.active.behaviorSubjects += 1;
                                        summary.total.behaviorSubjects += 1;
                                        action.active.behaviorSubjects += 1;
                                        action.mode = 'behaviorSubject';
                                        action.returnType = `BehaviorSubject<${action.returnType}>`;
                                        break;
                                    }
                                    case ActionObservableTypes.progressTracker: {
                                        summary.active.progressTrackers += 1;
                                        summary.total.progressTrackers += 1;
                                        action.active.progressTrackers += 1;
                                        action.mode = 'progressTracker';
                                        action.returnType = `ProgressTracker<${action.returnType}>`;
                                        break;
                                    }
                                }
                            }
                            break;
                        }
                        case RpcTypes.ResponseActionObservableNext: {
                            actionChanged = true;
                            const action = client.actionMap[message.id];
                            if (action) {
                                action.responses += 1;
                                action.sizeReceived += message.bodySize;
                                action.size += message.bodySize;
                                action.response = (message.debug().body as any).v;
                                action.emits.push({ timestamp, data: safeJsonStringify(action.response, 4) });
                            }
                            break;
                        }
                        case RpcTypes.ResponseActionSimple: {
                            actionChanged = true;
                            const action = client.actionMap[message.id];
                            if (action) {
                                action.status = 'executed';
                                action.responses += 1;
                                action.size += message.bodySize;
                                action.sizeReceived += message.bodySize;
                                action.response = (message.debug().body as any).v;
                                action.took = timestamp - action.timestamp;
                            }
                            break;
                        }
                        case RpcTypes.ResponseActionObservableError:
                        case RpcTypes.Error: {
                            actionChanged = true;
                            const action = client.actionMap[message.id];
                            if (action) {
                                action.size += message.bodySize;
                                action.sizeReceived += message.bodySize;
                                action.errors += 1;
                                action.emits.push({ timestamp, data: `Error ${safeJsonStringify(message.debug().body, 4)}` });
                                completeObservable('errored', action, summary.active);
                            }
                            break;
                        }
                    }

                    if (actionChanged) {
                        client.actions.update((v) => [...v]);
                    }

                    client.summary.update((v) => ({ ...v }));
                },
            };
            clientMap[message.socket] = signal(client);
            clients.update((v) => [...v, signal(client)]);

        } else if (message.type === 'received' || message.type === 'sent') {
            const client = clientMap[message.socket];
            const binary = base64ToArrayBuffer(message.data);
            if (client) {
                const data: WebSocketMessage = {
                    idx: messageIds++,
                    direction: message.type,
                    timestamp: message.timestamp,
                    size: binary.byteLength,
                    binary,
                    data: '',
                };
                client().messages.update((v) => [...v, data]);
                client().messages$.next(data);

                const summary = client().summary();
                if (message.type === 'sent') {
                    summary.sent += 1;
                    summary.sentBytes += binary.byteLength;
                } else {
                    summary.received += 1;
                    summary.receivedBytes += binary.byteLength;
                }
                client().summary.update((v) => ({ ...v }));

                if (client().type !== 'unsupported') {
                    // console.log('message', message.socket, message.type, message.timestamp, binary.byteLength);
                    try {
                        let rpcMessage = readBinaryRpcMessage(binary);
                        if (rpcMessage.type === RpcTypes.Chunk) {
                            const body = rpcMessage.debug().body as {
                                id: number;
                                total: number;
                                v: Uint8Array;
                            };

                            const chunks = client().chunks;
                            const c = chunks[body.id] ||= { loaded: 0, buffers: [] };
                            c.buffers.push(body.v);
                            c.loaded += body.v.byteLength;
                            if (c.loaded === body.total) {
                                const newBuffer = bufferConcat(c.buffers, body.total);
                                rpcMessage = readBinaryRpcMessage(newBuffer);
                                delete chunks[body.id];
                            } else {
                                return;
                            }
                        }

                        data.deepkit = {
                            message: rpcMessage,
                            debug: rpcMessage.debug(),
                        };

                        data.data = safeJsonStringify(data.deepkit.debug.body, 4);
                        data.id = rpcMessage.id;
                        data.type = rpcMessage.type;
                        client().timestampMap[rpcMessage.id] = message.timestamp;

                        client().messageReader(rpcMessage);
                        client().type = 'deepkit';
                    } catch (error) {
                        client().type = 'unsupported';
                        console.log('readBinaryRpcMessage error', error);
                    }
                } else {
                    //binary to hex
                    data.data = binaryToHex(binary);
                }
                client.update((v) => ({ ...v }));
            }
        } else if (message.type === 'close') {
            const client = clientMap[message.socket];
            if (client) {
                client.update((v) => ({ ...v, closed: true, closedAt: new Date(message.timestamp) }));
            }
        }
    });

    console.log('start sending');
    port.postMessage({ type: 'start' });

    port.onDisconnect.addListener(() => {
        console.log('disconnected');
        setTimeout(startCollecting, 1000);
    });
}
