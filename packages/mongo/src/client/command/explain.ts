/*
 * Deepkit Framework
 * Copyright (C) 2021 Deepkit UG, Marc J. Schmidt
 *
 * This program is free software: you can redistribute it and/or modify
 * it under the terms of the MIT License.
 *
 * You should have received a copy of the MIT License along with this program.
 */

import { BaseResponse, Command, ReadPreferenceMessage, TransactionalMessage } from './command.js';
import type { MongoClientConfig } from '../config.js';
import type { Host } from '../host.js';
import type { MongoDatabaseTransaction } from '../connection.js';
import { FindCommand } from './find.js';
import { AggregateCommand } from './aggregate.js';
import { UpdateCommand } from './update.js';
import { FindAndModifyCommand } from './findAndModify.js';
import { CountCommand } from './count.js';

export interface MongoExplain extends BaseResponse {
    queryPlanner: {
        namespace: string;
        indexFilterSet: boolean;
        winningPlan: {
            stage: string;
            inputStage?: any;
            inputStages?: any[];
            indexName?: string;
            indexBounds?: any;
            direction?: string;
            filter?: any;
        };
        rejectedPlans?: any[];
        [key: string]: any;
    };
    executionStats?: {
        nReturned: number;
        executionTimeMillis: number;
        totalKeysExamined: number;
        totalDocsExamined: number;
        [key: string]: any;
    };
    serverInfo: {
        host: string;
        port: number;
        version: string;
        [key: string]: any;
    };

    [key: string]: any;
}

type ExplainSchema = {
    explain: any;
    $db: string;
    verbosity: string;
} & TransactionalMessage & ReadPreferenceMessage;

export class ExplainCommand extends Command<MongoExplain> {
    override pipelinable(): boolean {
        return false;
    }

    constructor(
        public command: FindCommand<any> | AggregateCommand<any, any> | UpdateCommand<any> | FindAndModifyCommand<any> | CountCommand<any>,
        public verbosity: string,
    ) {
        super();
    }

    async execute(config: MongoClientConfig, host: Host, transaction?: MongoDatabaseTransaction): Promise<MongoExplain> {
        const cmd: ExplainSchema = {
            explain: this.command.getCommand(config, host, transaction),
            $db: config.defaultDb || 'admin',
            verbosity: this.verbosity,
        };

        delete cmd.explain.$db;

        if (transaction) transaction.applyTransaction(cmd);

        // MongoDB does not guarantee any specific output format from the explain command, even when using the Stable API.
        return await this.sendAndWait<ExplainSchema, MongoExplain>(cmd);
    }
}
