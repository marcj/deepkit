/*
 * Deepkit Framework
 * Copyright (C) 2021 Deepkit UG, Marc J. Schmidt
 *
 * This program is free software: you can redistribute it and/or modify
 * it under the terms of the MIT License.
 *
 * You should have received a copy of the MIT License along with this program.
 */

import { asyncOperation, getClassName } from '@deepkit/core';
import { handleErrorResponse, MongoDatabaseError, MongoError } from '../error.js';
import type { MongoClientConfig } from '../config.js';
import type { Host } from '../host.js';
import type { MongoDatabaseTransaction } from '../connection.js';
import {
    InlineRuntimeType,
    ReceiveType,
    resolveReceiveType,
    SerializationError,
    stringifyType,
    Type,
    typeOf,
    typeSettings,
    UnpopulatedCheck,
    UUID,
    ValidationError,
} from '@deepkit/type';
import { BSONDeserializer, deserializeBSONWithoutOptimiser, getBSONDeserializer } from '@deepkit/bson';
import { mongoBinarySerializer } from '../../mongo-serializer.js';
import { CommandOptions, ConnectionOptions } from '../options.js';

export interface BaseResponse {
    ok: number;
    errmsg?: string;
    code?: number;
    codeName?: string;
    writeErrors?: Array<{ index: number, code: number, errmsg: string }>;
}

export interface TransactionalMessage {
    abortTransaction?: 1;
    commitTransaction?: 1;

    lsid?: { id: UUID };
    txnNumber?: bigint;
    startTransaction?: boolean;
    autocommit?: boolean;
}

export interface WriteConcernMessage {
    writeConcern?: { w?: string | number, j?: boolean, wtimeout?: number };
}

export interface CollationMessage {
    locale: string;
    caseLevel?: boolean;
    caseFirst?: string;
    strength?: number;
    numericOrdering?: boolean;
    alternate?: string;
    maxVariable?: string;
    backwards?: boolean;
}

export type HintMessage = string | {
    [name: string]: number;
};

export interface ReadPreferenceMessage {
    readConcern?: { level: ConnectionOptions['readConcernLevel'] };

    $readPreference?: {
        mode: ConnectionOptions['readPreference'];
        tags?: { [name: string]: string }[];
        maxStalenessSeconds?: number;
        hedge?: { enabled: boolean }
    };
}

export abstract class Command<T> {
    options: CommandOptions = {};
    protected current?: { responseType?: Type, resolve: Function, reject: Function };

    public sender?: <T>(schema: Type, message: T, command: Command<unknown>) => void;

    /** The id of the message this command currently waits for an answer to. */
    public requestId: number = 0;

    /**
     * Whether commands of others may wait behind this one on the same connection, which means it is expected to be short.
     */
    pipelinable(): boolean {
        return true;
    }

    reject(error: Error): void {
        this.current?.reject(error);
    }

    public sendAndWait<T, R extends BaseResponse = BaseResponse>(
        message: T, messageType?: ReceiveType<T>, responseType?: ReceiveType<R>,
    ): Promise<R> {
        if (!this.sender) throw new Error(`No sender set in command ${getClassName(this)}`);
        this.sender(resolveReceiveType(messageType), message, this);

        return asyncOperation((resolve, reject) => {
            this.current = {
                resolve,
                reject,
                responseType: responseType ? resolveReceiveType(responseType) : typeOf<BaseResponse>(),
            };
        });
    }

    abstract execute(config: MongoClientConfig, host: Host, transaction?: MongoDatabaseTransaction): Promise<T>;

    needsWritableHost(): boolean {
        return false;
    }

    handleResponse(response: Uint8Array, offset: number = 0): void {
        if (!this.current) throw new Error('Got handleResponse without active command');
        const deserializer: BSONDeserializer<BaseResponse> = this.current.responseType ? getBSONDeserializer(mongoBinarySerializer, this.current.responseType) : deserializeBSONWithoutOptimiser;

        const oldCheck = typeSettings.unpopulatedCheck;
        try {
            typeSettings.unpopulatedCheck = UnpopulatedCheck.None;
            const message = deserializer(response, offset);
            const error = handleErrorResponse(message);
            if (error) {
                this.current.reject(error);
                return;
            }

            if (!message.ok) {
                this.current.reject(Object.assign(new MongoDatabaseError(message.errmsg || 'error'), { code: message.code }));
            } else {
                this.current.resolve(message);
            }
        } catch (error: any) {
            if (error instanceof ValidationError || error instanceof SerializationError) {
                if (this.current.responseType) {
                    const raw = deserializeBSONWithoutOptimiser(response, offset);
                    if (raw.errmsg && raw.ok === 0) {
                        const error = handleErrorResponse(raw);
                        if (error) {
                            this.current.reject(error);
                            return;
                        }
                    }

                    this.current.reject(new MongoError(`Could not deserialize type ${stringifyType(this.current.responseType)}: ${error}`, { cause: error }));
                    return;
                }
            }
            this.current.reject(error);
        } finally {
            typeSettings.unpopulatedCheck = oldCheck;
        }
    }
}

interface CreateCommandOptions {
    // default false
    needsWritableHost: boolean;

    // default true
    transactional: boolean;

    // default true
    readPreference: boolean;
}

export function createCommand<Request extends { [name: string]: any }, Response>(
    request: Request | ((config: MongoClientConfig) => Request),
    optionsIn: Partial<CreateCommandOptions> = {},
    typeRequest?: ReceiveType<Request>,
    typeResponse?: ReceiveType<Response>,
): Command<Response & BaseResponse> {
    const options: CreateCommandOptions = Object.assign(
        { needsWritableHost: false, transactional: true, readPreference: true },
        optionsIn,
    );

    typeRequest = resolveReceiveType(typeRequest);
    type FullTypeRequest = InlineRuntimeType<typeof typeRequest> & TransactionalMessage & ReadPreferenceMessage;
    typeRequest = typeOf<FullTypeRequest>();

    typeResponse = resolveReceiveType(typeResponse);
    type FullTypeResponse = InlineRuntimeType<typeof typeResponse> & BaseResponse;
    typeResponse = typeOf<FullTypeResponse>();

    class DynamicCommand extends Command<Response> {
        async execute(config: MongoClientConfig, host: Host, transaction?: MongoDatabaseTransaction): Promise<Response & BaseResponse> {
            const cmd = 'function' === typeof request ? request(config) : request;
            if (options.transactional && transaction) transaction.applyTransaction(cmd);
            if (options.readPreference) config.applyReadPreference(host, cmd as any, this.options, transaction);
            return await this.sendAndWait(cmd, typeRequest, typeResponse as Type) as any;
        }

        needsWritableHost(): boolean {
            return options.needsWritableHost;
        }
    }

    return new DynamicCommand();
}

