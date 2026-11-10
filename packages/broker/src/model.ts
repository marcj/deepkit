/*
 * Deepkit Framework
 * Copyright (C) 2021 Deepkit UG, Marc J. Schmidt
 *
 * This program is free software: you can redistribute it and/or modify
 * it under the terms of the MIT License.
 *
 * You should have received a copy of the MIT License along with this program.
 */

import { TransientBytes } from '@deepkit/rpc';

/**
 * What the broker pushes to a connection.
 * @internal
 */
export enum BrokerPush {
    bus,
    queue,
    invalidation,
    entityFields,
}

/**
 * A message published on a bus channel, as sent to each subscribed connection.
 * @internal
 */
export type BrokerBusEvent = [channel: string, value: TransientBytes];

/**
 * A queue message delivered to a consumer, which answers it with queueMessageHandled.
 * @internal
 */
export type BrokerQueueEvent = [queue: string, id: number, value: Uint8Array];

/**
 * @internal
 */
export type BrokerEntityFieldsEvent = [name: string, fields: string[]];

/**
 * @internal
 */
export type BrokerInvalidationEvent = [key: string];

/**
 * @internal
 */
export interface BrokerQueuePublish {
    process: QueueMessageProcessing;
    deduplicationInterval?: number;
    hash?: string | number;
    delay?: number;
    priority?: number;
    c: string;
    v: Uint8Array;
}

/**
 * @internal
 */
export enum SnapshotEntryType {
    queue,
}

/**
 * @internal
 */
export type SnapshotEntry = {
    type: SnapshotEntryType.queue;
    currentId: number;
    name: string;
    amount: number;
};

/**
 * @internal
 */
export enum QueueMessageState {
    pending,
    inFlight,
    done,
    error,
}

/**
 * @internal
 */
export interface QueueMessage {
    id: number;
    state: QueueMessageState;
    hash?: string | number;
    process: QueueMessageProcessing;
    // absolute time
    ttl?: number;
    delay: number;
    priority?: number;
    lastError?: string;
    tries: number;
    v: Uint8Array;
}

/**
 * @internal
 */
export enum QueueMessageProcessing {
    exactlyOnce,
    atLeastOnce,
    // atMostOnce,
}
