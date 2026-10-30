/*
 * Deepkit Framework
 * Copyright (C) 2021 Deepkit UG, Marc J. Schmidt
 *
 * This program is free software: you can redistribute it and/or modify
 * it under the terms of the MIT License.
 *
 * You should have received a copy of the MIT License along with this program.
 */

import { ControllerSymbol } from '@deepkit/rpc';
import { ChangesInterface, deserializeType, entity, ReflectionClass } from '@deepkit/type';

export type DatabaseCommit = {
    [dbName: string]: {
        addedIds: { [entityName: string]: number[] },
        added: { [entityName: string]: any[] },
        removed: { [entityName: string]: { [pkName: string]: any }[] },
        changed: {
            [entityName: string]: {
                pk: { [pkName: string]: any },
                changes: ChangesInterface<any>
            }[]
        }
    }
}

@entity.name('orm-browser/database')
export class DatabaseInfo {
    constructor(
        public name: string,
        public adapter: string,
        public serializedTypes: any[] = []
    ) {
    }

    protected classSchemas?: ReflectionClass<any>[];

    getClassSchemas(): ReflectionClass<any>[] {
        if (!this.classSchemas) {
            this.classSchemas = this.serializedTypes.map(v => ReflectionClass.from(deserializeType(v)));
        }

        return this.classSchemas;
    }

    getEntity(name: string): ReflectionClass<any> {
        for (const schema of this.getClassSchemas()) {
            if (schema.getName() === name) return schema;
        }
        throw new Error(`No type for ${name} found`);
    }
}

@entity.name('orm-broser/migration/entity')
export class MigrationEntityInfo {
    constructor(public name: string) {
    }
}

@entity.name('orm-broser/migration')
export class MigrationInfo {
    entites: { [name: string]: MigrationEntityInfo } = {};
}

export type QueryResult = { error?: string, log: string[], executionTime: number, result: any };

export const BrowserControllerInterface = ControllerSymbol<BrowserControllerInterface>('orm-browser/controller', [DatabaseInfo]);

export interface BrowserControllerInterface {
    getDatabases(): DatabaseInfo[];

    resetAllTables(name: string): Promise<void>;

    migrate(name: string): Promise<void>;

    getMigrations(name: string): Promise<{ [name: string]: { sql: string[], diff: string } }>;

    getDatabase(name: string): DatabaseInfo;

    query(dbName: string, entityName: string, query: string): Promise<QueryResult>;

    getItems(dbName: string, entityName: string, filter: { [name: string]: any }, sort: { [name: string]: any }, limit: number, skip: number): Promise<{ items: any[], executionTime: number }>;

    getCount(dbName: string, entityName: string, filter: { [name: string]: any }): Promise<number>;

    create(dbName: string, entityName: string): Promise<any>;

    commit(commit: DatabaseCommit): Promise<any>;
}
