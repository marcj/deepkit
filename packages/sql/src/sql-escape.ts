/*
 * Deepkit Framework
 * Copyright (C) 2021 Deepkit UG, Marc J. Schmidt
 *
 * This program is free software: you can redistribute it and/or modify
 * it under the terms of the MIT License.
 *
 * You should have received a copy of the MIT License along with this program.
 */

const backslashEscapeChars = /[\0\b\t\n\r\x1a"'\\]/g; // eslint-disable-line no-control-regex
const backslashEscapeMap: { [char: string]: string } = {
    '\0': '\\0',
    '\b': '\\b',
    '\t': '\\t',
    '\n': '\\n',
    '\r': '\\r',
    '\x1a': '\\Z',
    '"': '\\"',
    "'": "\\'",
    '\\': '\\\\',
};

/**
 * Quotes a string literal with backslash escapes (MySQL style).
 */
export function quoteSqlStringBackslash(value: string): string {
    return "'" + value.replace(backslashEscapeChars, v => backslashEscapeMap[v]) + "'";
}

/**
 * Quotes a string literal by doubling single quotes (SQL standard, used by SQLite).
 */
export function quoteSqlString(value: string): string {
    return "'" + value.replace(/'/g, "''") + "'";
}

function zeroPad(value: number, length: number): string {
    return String(value).padStart(length, '0');
}

/**
 * Formats a date in local time as quoted literal `'YYYY-MM-DD HH:mm:ss.mmm'`, or NULL for invalid dates.
 */
export function sqlDateToString(date: Date): string {
    const dt = new Date(date);
    if (isNaN(dt.getTime())) return 'NULL';
    return (
        "'" +
        zeroPad(dt.getFullYear(), 4) +
        '-' +
        zeroPad(dt.getMonth() + 1, 2) +
        '-' +
        zeroPad(dt.getDate(), 2) +
        ' ' +
        zeroPad(dt.getHours(), 2) +
        ':' +
        zeroPad(dt.getMinutes(), 2) +
        ':' +
        zeroPad(dt.getSeconds(), 2) +
        '.' +
        zeroPad(dt.getMilliseconds(), 3) +
        "'"
    );
}

/**
 * Escapes a primitive value or Date as SQL literal: NULL for null/undefined, true/false, numbers as is,
 * Dates via sqlDateToString, everything else as quoted string.
 *
 * Objects and arrays need to be serialized (e.g. JSON.stringify) before.
 */
export function sqlEscape(value: any, quoteString: (value: string) => string = quoteSqlStringBackslash): string {
    if (value === undefined || value === null) return 'NULL';
    switch (typeof value) {
        case 'boolean':
            return value ? 'true' : 'false';
        case 'number':
            return value + '';
        case 'object':
            if (value instanceof Date) return sqlDateToString(value);
    }
    return quoteString('' + value);
}
