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
import type { MongoClientConfig } from '../config.js';
import type { Host } from '../host.js';
import type { MongoDatabaseTransaction } from '../connection.js';

type DropDatabase = {
    dropDatabase: 1;
    $db: string;
} & WriteConcernMessage;

export class DropDatabaseCommand<T> extends Command<void> {
    override pipelinable(): boolean {
        return false;
    }

    constructor(protected dbName: any) {
        super();
    }

    async execute(config: MongoClientConfig, host: Host, transaction?: MongoDatabaseTransaction): Promise<void> {
        const cmd: DropDatabase = {
            dropDatabase: 1, $db: this.dbName,
        };
        config.applyWriteConcern(cmd, this.options);
        await this.sendAndWait<DropDatabase>(cmd);
    }

    needsWritableHost(): boolean {
        return true;
    }
}
