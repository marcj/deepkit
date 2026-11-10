import { WritableSignal, signal } from '@angular/core';
import { Subject } from 'rxjs';

import { bufferConcat } from '@deepkit/core';
import {
    ChannelSubType,
    ChunkOp,
    ControlOp,
    EncodedError,
    MessageFlag,
    channelBodyOffset,
    createParameterDeserializer,
    createReturnDeserializer,
    frameContextId,
    getAction,
    getBodyOffset,
    parseSchemaMapping,
    readChannelSubscription,
    readErrorTuple,
    readUint32LE,
    schemaMapping,
} from '@deepkit/rpc';
import { deserializeType, stringifyType } from '@deepkit/type';

declare const chrome: any;

export interface WebSocketMessage {
    id?: number;
    idx: number;
    type?: string;
    direction: 'received' | 'sent';
    timestamp: number;
    size: number;
    data: string;
    binary: Uint8Array;
    deepkit?: Frame;
}

export interface Frame {
    id: number;
    kind: string;
    op?: ControlOp;
    subType?: number;
    size: number;
    body?: any;
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
    typesCache: Record<string, string>;
    /** The id of the next action call without an explicit one, see the protocol. */
    nextContext: number;
    messageReader: (frame: Frame) => void;
    timestamp: number;
    timestampMap: Record<number, number>;
    chunks: Record<number, { loaded: number; buffers: Uint8Array[] }>;
    /** The action behind each open context id. */
    pendingActions: Record<number, Client['schemaActions'][number] | undefined>;
    schemaActions: Record<
        number,
        {
            controller: string;
            method: string;
            parameters: any;
            type: any;
            decode?: (buffer: Uint8Array, offset: number, end: number) => any[];
            decodeResult?: (buffer: Uint8Array, offset: number, end: number) => any;
        }
    >;
}

export function clearClient(client: Client) {
    client.actions.update(() => []);
    client.messages.update(() => []);
}

/** What one RPC frame means for the inspector. Undefined for what isn't shown. */
function readFrame(client: Client, binary: Uint8Array, sent: boolean): Frame | undefined {
    const flag = binary[4];
    const size = binary.byteLength;

    if ((flag & 0b0111_0000) === MessageFlag.TypeChunk) {
        const hasContext = (flag & 0b1000) !== 0;
        const offset = hasContext ? 7 : 5;
        if (binary[offset] !== ChunkOp.Data) return undefined;
        const id = hasContext ? frameContextId(binary) : 0;
        const total = readUint32LE(binary, offset + 5);
        const chunks = client.chunks;
        const c = (chunks[id] ||= { loaded: 0, buffers: [] });
        const data = binary.subarray(offset + 9);
        c.buffers.push(data);
        c.loaded += data.byteLength;
        if (c.loaded !== total) return undefined;
        delete chunks[id];
        return readFrame(client, bufferConcat(c.buffers, total), sent);
    }

    const type = flag & 0b0111_0000;
    const contextFlag = flag & 0b1100;
    const hasContext = (flag & 0b1000) !== 0;
    let id = hasContext ? frameContextId(binary) : 0;

    if (type === MessageFlag.TypeAction) {
        if (contextFlag === MessageFlag.ContextNew) {
            id = client.nextContext++;
        } else if (contextFlag === MessageFlag.ContextEnd) {
            client.nextContext = id + 1;
        }
        const action = client.schemaActions[getAction(binary)];
        client.pendingActions[id] = action;
        const decode = (action.decode ??= createParameterDeserializer(deserializeType(action.parameters) as any));
        const args = decode(binary, getBodyOffset(binary), size).slice();
        return { id, kind: 'action', size, body: { controller: action.controller, method: action.method, args } };
    }

    const action = client.pendingActions[id];
    const body = getBodyOffset(binary);

    if (type === MessageFlag.TypeAck) return { id, kind: 'result', size };
    if (type === MessageFlag.TypeError) return { id, kind: 'error', size, body: readErrorTuple(binary, body, size) };

    if (type === MessageFlag.TypeResult) {
        if (!action) return { id, kind: 'result', size };
        const decode = (action.decodeResult ??= createReturnDeserializer(deserializeType(action.type) as any));
        return { id, kind: 'result', size, body: decode(binary, body, size) };
    }

    if (type === MessageFlag.TypeChannel) {
        if (!hasContext) return undefined;
        const sub = binary[body];
        if (sub <= ChannelSubType.Reserved) return { id, kind: 'announce', subType: sub, size };
        if (!action) return { id, kind: 'next', size };
        const decode = (action.decodeResult ??= createReturnDeserializer(deserializeType(action.type) as any));
        const value = decode(binary, channelBodyOffset(binary, body), size);
        return { id, kind: 'next', size, body: { id: readChannelSubscription(binary, body), v: value } };
    }

    if (type === MessageFlag.TypeControl) {
        const op = binary[body] as ControlOp;
        let error: EncodedError | undefined;
        if (op === ControlOp.StreamError) {
            let offset = body + 1;
            while (binary[offset++] >= 0x80);
            error = readErrorTuple(binary, offset, size);
        }
        return { id, kind: 'control', op, size, body: error };
    }

    return undefined;
}

function binaryToHex(binary: Uint8Array) {
    return Array.from(binary)
        .map(v => v.toString(16).padStart(2, '0'))
        .join('');
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
                nextContext: 1,
                timestampMap: {},
                actionIdx: 0,
                chunks: {},
                pendingActions: {},
                schemaActions: {},
                summary: summarySignal,
                messageReader: frame => {
                    const summary: Summary = summarySignal();
                    const timestamp = client.timestampMap[frame.id];
                    let actionChanged = false;
                    const action = client.actionMap[frame.id];
                    const received = () => {
                        if (!action) return;
                        action.size += frame.size;
                        action.sizeReceived += frame.size;
                    };
                    const sent = () => {
                        if (!action) return;
                        action.size += frame.size;
                        action.sizeSent += frame.size;
                    };
                    switch (frame.kind) {
                        case 'action': {
                            actionChanged = true;
                            summary.actionsTotal += 1;
                            const body = frame.body as { controller: string; method: string; args: any[] };
                            const actionName = `${body.controller}.${body.method}`;
                            summary.actions[actionName] = (summary.actions[actionName] || 0) + 1;
                            const created: RpcAction = {
                                idx: ++client.actionIdx,
                                id: frame.id,
                                controller: body.controller,
                                method: body.method,
                                loaded: new Date(timestamp),
                                executed: new Date(timestamp),
                                status: 'executing',
                                action: actionName,
                                responses: 0,
                                size: frame.size,
                                sizeSent: frame.size,
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
                            client.actions.update(v => [...v, created]);
                            client.actionMap[created.id] = created;
                            break;
                        }
                        case 'result': {
                            actionChanged = true;
                            // a stream ends with the acknowledgement of its closed context, which is no result
                            if (action && action.mode === 'static') {
                                action.status = 'executed';
                                action.responses += 1;
                                received();
                                action.response = frame.body;
                                action.took = timestamp - action.timestamp;
                            }
                            break;
                        }
                        case 'error': {
                            actionChanged = true;
                            if (action) {
                                received();
                                action.errors += 1;
                                action.emits.push({
                                    timestamp,
                                    data: `Error ${JSON.stringify(frame.body, null, 4)}`,
                                });
                                completeObservable('errored', action, summary.active);
                            }
                            break;
                        }
                        case 'announce': {
                            actionChanged = true;
                            if (action) {
                                received();
                                action.status = 'observableReady';
                                if (frame.subType === ChannelSubType.Observable) {
                                    summary.active.observables += 1;
                                    summary.total.observables += 1;
                                    action.active.observables += 1;
                                    action.mode = 'observable';
                                    action.returnType = `Observable<${action.returnType}>`;
                                } else if (frame.subType === ChannelSubType.Subject) {
                                    summary.active.subjects += 1;
                                    summary.total.subjects += 1;
                                    action.active.subjects += 1;
                                    action.mode = 'subject';
                                    action.returnType = `Subject<${action.returnType}>`;
                                } else if (frame.subType === ChannelSubType.BehaviorSubject) {
                                    summary.active.behaviorSubjects += 1;
                                    summary.total.behaviorSubjects += 1;
                                    action.active.behaviorSubjects += 1;
                                    action.mode = 'behaviorSubject';
                                    action.returnType = `BehaviorSubject<${action.returnType}>`;
                                } else if (frame.subType === ChannelSubType.ProgressTracker) {
                                    summary.active.progressTrackers += 1;
                                    summary.total.progressTrackers += 1;
                                    action.active.progressTrackers += 1;
                                    action.mode = 'progressTracker';
                                    action.returnType = `ProgressTracker<${action.returnType}>`;
                                }
                            }
                            break;
                        }
                        case 'next': {
                            actionChanged = true;
                            if (action) {
                                action.responses += 1;
                                received();
                                action.response = frame.body;
                                action.emits.push({ timestamp, data: JSON.stringify(action.response, null, 4) });
                            }
                            break;
                        }
                        case 'control': {
                            actionChanged = true;
                            if (!action) break;
                            switch (frame.op) {
                                case ControlOp.Subscribe:
                                    sent();
                                    action.active.subscriptions += 1;
                                    summary.active.subscriptions += 1;
                                    summary.total.subscriptions += 1;
                                    action.status = `subscribed (${action.active.subscriptions}x)`;
                                    break;
                                case ControlOp.SubjectUnsubscribe:
                                    sent();
                                    completeObservable('completed', action, summary.active);
                                    break;
                                case ControlOp.Unsubscribe:
                                    sent();
                                    action.active.subscriptions -= 1;
                                    summary.active.subscriptions -= 1;
                                    if (action.status !== 'completed') {
                                        action.status = `subscribed (${action.active.subscriptions}x)`;
                                    }
                                    break;
                                case ControlOp.Disconnect:
                                    sent();
                                    if (action.status !== 'completed') {
                                        action.status = 'completed';
                                        summary.active.observables -= 1;
                                        action.active.observables -= 1;
                                    }
                                    break;
                                case ControlOp.Complete:
                                    received();
                                    completeObservable('completed', action, summary.active);
                                    break;
                                case ControlOp.StreamError:
                                    received();
                                    action.errors += 1;
                                    action.emits.push({
                                        timestamp,
                                        data: `Error ${JSON.stringify(frame.body, null, 4)}`,
                                    });
                                    completeObservable('errored', action, summary.active);
                                    break;
                            }
                            break;
                        }
                    }

                    if (actionChanged) {
                        client.actions.update(v => [...v]);
                    }

                    client.summary.update(v => ({ ...v }));
                },
            };
            clientMap[message.socket] = signal(client);
            clients.update(v => [...v, signal(client)]);
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
                client().messages.update(v => [...v, data]);
                client().messages$.next(data);

                const summary = client().summary();
                if (message.type === 'sent') {
                    summary.sent += 1;
                    summary.sentBytes += binary.byteLength;
                } else {
                    summary.received += 1;
                    summary.receivedBytes += binary.byteLength;
                }
                client().summary.update(v => ({ ...v }));

                if (client().type !== 'unsupported') {
                    // console.log('message', message.socket, message.type, message.timestamp, binary.byteLength);
                    try {
                        if ((binary[4] & 0b0111_0000) === MessageFlag.TypeSchema) {
                            // the handshake of protocol version 2: the action ids have to be known to show calls by their name
                            if (message.type !== 'sent' && binary.byteLength > 10) {
                                const parsed = parseSchemaMapping(schemaMapping.decode(binary, 10));
                                const actions: Client['schemaActions'] = {};
                                for (const controller of Object.keys(parsed)) {
                                    for (const method of Object.keys(parsed[controller])) {
                                        const entry = parsed[controller][method];
                                        actions[entry.action] = {
                                            controller,
                                            method,
                                            parameters: entry.parameters,
                                            type: entry.type,
                                        };
                                    }
                                }
                                client().schemaActions = actions;
                            }
                            client().type = 'deepkit';
                            return;
                        }

                        const frame = readFrame(client(), binary, message.type === 'sent');
                        if (frame) {
                            data.deepkit = frame;
                            data.data = JSON.stringify(frame.body, null, 4);
                            data.id = frame.id;
                            data.type = frame.kind;
                            client().timestampMap[frame.id] = message.timestamp;
                            client().messageReader(frame);
                        }
                        client().type = 'deepkit';
                    } catch (error) {
                        client().type = 'unsupported';
                        console.log('reading RPC frame failed', error);
                    }
                } else {
                    //binary to hex
                    data.data = binaryToHex(binary);
                }
                client.update(v => ({ ...v }));
            }
        } else if (message.type === 'close') {
            const client = clientMap[message.socket];
            if (client) {
                client.update(v => ({ ...v, closed: true, closedAt: new Date(message.timestamp) }));
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
