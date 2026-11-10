/*
 * Deepkit Framework
 * Copyright (C) 2021 Deepkit UG, Marc J. Schmidt
 *
 * This program is free software: you can redistribute it and/or modify
 * it under the terms of the MIT License.
 *
 * You should have received a copy of the MIT License along with this program.
 */

import { Command, WriteConcernMessage } from './command.js';
import { ReflectionClass } from '@deepkit/type';
import type { MongoClientConfig } from '../config.js';
import type { Host } from '../host.js';
import type { MongoDatabaseTransaction } from '../connection.js';

type RequestSchema = {
    dropIndexes: string;
    $db: string;
    index: string[];
} & WriteConcernMessage;

export class DropIndexesCommand<T extends ReflectionClass<any>> extends Command<void> {
    override pipelinable(): boolean {
        return false;
    }

    constructor(
        public schema: T,
        public names: string[],
    ) {
        super();
    }

    async execute(config: MongoClientConfig, host: Host, transaction?: MongoDatabaseTransaction): Promise<void> {
        const cmd: RequestSchema = {
            dropIndexes: this.schema.getCollectionName() || 'unknown',
            $db: this.schema.databaseSchemaName || config.defaultDb || 'admin',
            index: this.names,
        };

        config.applyWriteConcern(cmd, this.options);

        try {
            await this.sendAndWait<RequestSchema>(cmd);
        } catch (error) {
            throw new Error(`Could not drop indexes ${JSON.stringify(this.names)}: ${error}`);
        }
    }

    needsWritableHost(): boolean {
        return false;
    }
}
