/*
 * Deepkit Framework
 * Copyright (C) 2021 Deepkit UG, Marc J. Schmidt
 *
 * This program is free software: you can redistribute it and/or modify
 * it under the terms of the MIT License.
 *
 * You should have received a copy of the MIT License along with this program.
 */

import { Column, DatabaseModel } from '../schema/table.js';
import { SQLConnection } from '../sql-adapter.js';
import { DefaultPlatform } from '../platform/default-platform.js';

const numberLiteral = /^[-+]?(\d+\.?\d*|\.\d+)(e[-+]?\d+)?$/i;
const stringLiteral = /^'((?:[^']|'')*)'$/s;

/**
 * Parses the default value of a column as reported by the database, if it is a literal (number, string,
 * true, false, null). A string containing JSON is parsed as JSON. Returns undefined for expressions like
 * CURRENT_TIMESTAMP, which are never evaluated.
 */
export function parseDefaultLiteral(dbDefault: string): { value: any } | undefined {
    const literal = dbDefault.trim();
    if (numberLiteral.test(literal)) return { value: Number(literal) };
    if (literal === 'true') return { value: true };
    if (literal === 'false') return { value: false };
    if (literal === 'null') return { value: null };

    const string = stringLiteral.exec(literal);
    if (!string) return;
    const value = string[1].replace(/''/g, "'");
    try {
        return { value: JSON.parse(value) };
    } catch {
        return { value };
    }
}

const type3Regex = /^([^(]+)\(\s*(\d+)\s*,\s*(\d+)\s*\)$/;
const type2Regex = /^([^(]+)\(\s*(\d+)\s*\)$/;

export function parseType(column: Column, type: string) {
    type = type.trim().toLowerCase();
    if (type.includes('unsigned')) {
        type = type.replace('unsigned', '').trim();
        column.unsigned = true;
    }

    if (type3Regex.exec(type)) {
        const match = type3Regex.exec(type)!;
        column.type = match[1];
        column.size = parseInt(match[2], 10);
        column.scale = parseInt(match[3], 10);
    } else if (type2Regex.exec(type)) {
        const match = type2Regex.exec(type)!;
        column.type = match[1];
        column.size = parseInt(match[2], 10);
    } else {
        if (type.includes('(')) throw new Error(`Could not detect type of sql type ${type}`);
        column.type = type;
    }
}


export abstract class SchemaParser {
    constructor(
        protected connection: SQLConnection,
        protected platform: DefaultPlatform,
    ) {
    }

    abstract parse(database: DatabaseModel, limitTableNames?: string[]): Promise<void>;
}
