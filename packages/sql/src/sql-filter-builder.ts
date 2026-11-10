/*
 * Deepkit Framework
 * Copyright (C) 2021 Deepkit UG, Marc J. Schmidt
 *
 * This program is free software: you can redistribute it and/or modify
 * it under the terms of the MIT License.
 *
 * You should have received a copy of the MIT License along with this program.
 */

import { isArray, isPlainObject } from '@deepkit/core';
import {
    isBackReferenceType,
    isReferenceType,
    ReflectionClass,
    ReflectionKind,
    resolvePath,
    Serializer,
    Type,
} from '@deepkit/type';
import { SqlPlaceholderStrategy } from './platform/default-platform.js';
import { getPreparedEntity, PreparedAdapter, PreparedEntity } from './prepare.js';
import { SqlReference } from './sql-builder.js';

type Filter = { [name: string]: any };

export class SQLFilterBuilder {
    public params: any[] = [];
    protected entity: PreparedEntity;

    constructor(
        protected adapter: PreparedAdapter,
        protected schema: ReflectionClass<any>,
        protected tableName: string,
        protected serializer: Serializer,
        public placeholderStrategy: SqlPlaceholderStrategy,
    ) {
        this.entity = getPreparedEntity(adapter, schema);
    }

    isNull() {
        return 'IS NULL';
    }

    regexpComparator(lvalue: string, value: RegExp): string {
        return `${lvalue} REGEXP ${this.bindParam(value.source)}`;
    }

    isNotNull() {
        return 'IS NOT NULL';
    }

    convert(filter: Filter): string {
        return this.conditions(filter).trim();
    }

    protected bindParam(value: any): string {
        this.params.push(value);
        return this.placeholderStrategy.getPlaceholder();
    }

    /**
     * Normalizes values necessary for the connection driver to bind parameters for prepared statements.
     * E.g. SQLite does not support boolean, so we convert boolean to number.
     */
    bindValue(value: any): any {
        if (value === undefined) return null; //no SQL driver supports undefined
        if (value instanceof RegExp) return value.source;
        return value;
    }

    protected conditionsArray(filters: Filter[], join: 'AND' | 'OR'): string {
        const sql: string[] = [];

        for (const filter of filters) {
            sql.push(this.conditions(filter));
        }

        if (sql.length > 1) return '(' + sql.join(` ${join} `) + ')';
        return sql.join(` ${join} `);
    }

    protected quoteIdWithTable(id: string): string {
        return `${this.adapter.platform.getColumnAccessor(this.tableName, this.entity.fieldMap[id]?.columnName || id)}`;
    }

    requiresJson(type: Type): boolean {
        return type.kind === ReflectionKind.class || type.kind === ReflectionKind.objectLiteral || type.kind === ReflectionKind.array;
    }

    protected condition(fieldName: string | undefined, value: any, comparison: 'eq' | 'gt' | 'gte' | 'in' | 'lt' | 'lte' | 'ne' | 'nin' | 'like' | string): string {
        if (fieldName === undefined) {
            throw new Error('No comparison operators at root level allowed');
        }

        if (isPlainObject(value)) {
            return this.conditions(value, fieldName);
        }

        let cmpSign: string;

        if (comparison === 'eq') cmpSign = '=';
        else if (comparison === 'neq') cmpSign = '!=';
        else if (comparison === 'gt') cmpSign = '>';
        else if (comparison === 'gte') cmpSign = '>=';
        else if (comparison === 'lt') cmpSign = '<';
        else if (comparison === 'lte') cmpSign = '<=';
        else if (comparison === 'ne') cmpSign = '!=';
        else if (comparison === 'in') cmpSign = 'IN';
        else if (comparison === 'nin') cmpSign = 'NOT IN';
        else if (comparison === 'like') cmpSign = 'LIKE';
        else if (comparison === 'regex') {
            // { $regex: '^a' } like Mongo: the comparators read source and flags of a RegExp
            return this.regexpComparator(this.quoteIdWithTable(fieldName), value instanceof RegExp ? value : new RegExp(String(value)));
        }
        else throw new Error(`Comparator ${comparison} not supported.`);

        let rvalue = '';
        if (value instanceof SqlReference) {
            rvalue = `${this.quoteIdWithTable(value.field)}`;
        } else {
            if (value === undefined || value === null) {
                cmpSign = cmpSign === '!=' ? this.isNotNull() : this.isNull();
                rvalue = '';
            } else {
                const property = resolvePath(fieldName, this.schema.type);

                if (comparison === 'in' || comparison === 'nin') {
                    if (isArray(value)) {
                        const params: string[] = [];
                        for (let item of value) {
                            params.push(this.placeholderStrategy.getPlaceholder());

                            if ((fieldName.includes('.') && this.adapter.platform.deepColumnAccessorRequiresJsonString()) || !isReferenceType(property) && !isBackReferenceType(property) && this.requiresJson(property)) {
                                item = JSON.stringify(item);
                            }
                            this.params.push(this.bindValue(item));
                        }
                        rvalue = params.length ? `(${params.join(', ')})` : '(null)';
                    }
                } else {
                    rvalue = this.placeholderStrategy.getPlaceholder();

                    if ((fieldName.includes('.') && this.adapter.platform.deepColumnAccessorRequiresJsonString()) || !isReferenceType(property) && !isBackReferenceType(property) && this.requiresJson(property)) {
                        value = JSON.stringify(value);
                    }
                    this.params.push(this.bindValue(value));
                }
            }
        }

        return `${this.quoteIdWithTable(fieldName)} ${cmpSign} ${rvalue}`;
    }

    protected splitDeepFieldPath(path: string): [column: string, path: string] {
        const pos = path.indexOf('.');
        if (pos === -1) return [path, ''];
        return [path.substr(0, pos), path.substr(pos + 1)];
    }

    protected conditions(filter: Filter, fieldName?: string): string {
        const sql: string[] = [];

        for (const i in filter) {
            if (!filter.hasOwnProperty(i)) continue;

            // pushed, not returned: other keys of the same filter object were dropped
            if (i === '$or') sql.push(this.conditionsArray(filter[i], 'OR'));
            else if (i === '$and') sql.push(this.conditionsArray(filter[i], 'AND'));
            else if (i === '$nor') sql.push(`NOT (${this.conditionsArray(filter[i], 'OR')})`);
            else if (i === '$not') {
                const value = filter[i];
                if (fieldName === undefined || isArray(value)) {
                    // root level: { $not: [filter, ...] }
                    sql.push(`NOT (${this.conditionsArray(value, 'AND')})`);
                } else {
                    // field level: { name: { $not: /an/ } }, { age: { $not: { $gt: 3 } } }
                    sql.push(`NOT (${this.condition(fieldName, value, value instanceof RegExp ? 'regex' : 'eq')})`);
                }
            } else if (i === '$exists') sql.push(this.adapter.platform.quoteValue(this.schema.hasProperty(i)));
            else if (i[0] === '$') sql.push(this.condition(fieldName, filter[i], i.substring(1)));
            else if (filter[i] instanceof RegExp) sql.push(this.condition(i, filter[i], 'regex'));
            else sql.push(this.condition(i, filter[i], 'eq'));
        }

        // an empty $or/$and matches everything and adds no condition
        const conditions = sql.filter(v => v !== '');
        if (conditions.length > 1) return '(' + conditions.join(` AND `) + ')';
        return conditions.join(` AND `);
    }
}

