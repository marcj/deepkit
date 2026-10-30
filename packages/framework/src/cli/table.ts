/*
 * Deepkit Framework
 * Copyright (C) 2021 Deepkit UG, Marc J. Schmidt
 *
 * This program is free software: you can redistribute it and/or modify
 * it under the terms of the MIT License.
 *
 * You should have received a copy of the MIT License along with this program.
 */

const ansiCode = /\x1b\[[0-9;]*m/g;

function visibleLength(value: string): number {
    return value.replace(ansiCode, '').length;
}

/**
 * Splits a line into chunks of at most `width` visible characters.
 * ANSI colors are closed at the end of a chunk and reopened in the next one, so they don't bleed into the borders.
 */
function wrapLine(line: string, width: number): string[] {
    if (visibleLength(line) <= width) return [line];
    const chunks: string[] = [];
    const tokens = line.split(/(\x1b\[[0-9;]*m)/);
    let chunk = '';
    let length = 0;
    let active = '';

    for (const token of tokens) {
        if (token.startsWith('\x1b[')) {
            chunk += token;
            active = token === '\x1b[0m' || token === '\x1b[39m' || token === '\x1b[22m' ? '' : token;
            continue;
        }
        for (const char of token) {
            if (length === width) {
                chunks.push(active ? chunk + '\x1b[0m' : chunk);
                chunk = active;
                length = 0;
            }
            chunk += char;
            length++;
        }
    }
    if (length) chunks.push(chunk);
    return chunks;
}

/**
 * Renders rows as a table with box-drawing borders. Cells are converted with `stringify` and wrapped
 * so that the table fits into `maxWidth` (as long as every column can be at least 3 characters wide).
 */
export function createTable<T>(
    rows: T[],
    columns: (keyof T & string)[],
    options: { maxWidth?: number; stringify?: (value: any) => string } = {},
): string {
    const stringify = options.stringify || ((value: any) => String(value));
    const cells: string[][][] = [
        columns.map(column => [column]),
        ...rows.map(row => columns.map(column => stringify(row[column]).split('\n'))),
    ];

    const widths = columns.map((_, i) => Math.max(...cells.map(row => Math.max(...row[i].map(visibleLength)))));
    //each column has 3 border/padding characters, plus the last border
    const available = (options.maxWidth || Infinity) - columns.length * 3 - 1;
    while (widths.reduce((sum, width) => sum + width, 0) > available) {
        const widest = widths.indexOf(Math.max(...widths));
        if (widths[widest] <= 3) break;
        widths[widest]--;
    }

    const border = (left: string, middle: string, right: string) =>
        left + widths.map(width => '─'.repeat(width + 2)).join(middle) + right;
    const lines: string[] = [border('┌', '┬', '┐')];

    for (let r = 0; r < cells.length; r++) {
        const wrapped = cells[r].map((cell, i) => cell.flatMap(line => wrapLine(line, widths[i])));
        const height = Math.max(...wrapped.map(cell => cell.length));
        for (let l = 0; l < height; l++) {
            lines.push(
                '│' +
                    wrapped
                        .map((cell, i) => {
                            const line = cell[l] || '';
                            return ' ' + line + ' '.repeat(widths[i] - visibleLength(line)) + ' ';
                        })
                        .join('│') +
                    '│',
            );
        }
        if (r === 0) lines.push(border('├', '┼', '┤'));
    }

    lines.push(border('└', '┴', '┘'));
    return lines.join('\n');
}
