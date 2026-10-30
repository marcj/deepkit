/*
 * Deepkit Framework
 * Copyright (C) 2021 Deepkit UG, Marc J. Schmidt
 *
 * This program is free software: you can redistribute it and/or modify
 * it under the terms of the MIT License.
 *
 * You should have received a copy of the MIT License along with this program.
 */

/**
 * ANSI escape codes by name, the same names as the ansi-styles package, usable as tags like `<red>text</red>`.
 */
export const style: { [name: string]: { open: string; close: string } } = {};

function addStyle(name: string, open: number, close: number) {
    style[name] = { open: `\u001B[${open}m`, close: `\u001B[${close}m` };
}

const modifiers: [string, number, number][] = [
    ['reset', 0, 0],
    ['bold', 1, 22],
    ['dim', 2, 22],
    ['italic', 3, 23],
    ['underline', 4, 24],
    ['overline', 53, 55],
    ['inverse', 7, 27],
    ['hidden', 8, 28],
    ['strikethrough', 9, 29],
];
for (const [name, open, close] of modifiers) addStyle(name, open, close);

const colors = ['black', 'red', 'green', 'yellow', 'blue', 'magenta', 'cyan', 'white'];
for (let i = 0; i < colors.length; i++) {
    const name = colors[i];
    const bgName = 'bg' + name[0].toUpperCase() + name.slice(1);
    addStyle(name, 30 + i, 39);
    addStyle(name + 'Bright', 90 + i, 39);
    addStyle(bgName, 40 + i, 49);
    addStyle(bgName + 'Bright', 100 + i, 49);
}
style.gray = style.grey = style.blackBright;
style.bgGray = style.bgGrey = style.bgBlackBright;

// Node, Bun and Deno have util.format, which also formats objects (like console.log)
const nodeFormat: ((...args: any[]) => string) | undefined = (globalThis as any).process?.getBuiltinModule?.(
    'util',
)?.format;

/**
 * printf-like formatting. Uses util.format where available, otherwise supports %s, %d, %j (and %% for a literal %).
 * Remaining arguments are appended separated by a space.
 */
export function format(fmt?: any, ...args: any[]): string {
    if (nodeFormat) return nodeFormat(fmt, ...args);

    if (args.length) {
        fmt = String(fmt).replace(
            /(%?)(%([jds]))/g,
            (match: string, escaped: string, pattern: string, flag: string) => {
                let arg = args.shift();
                if (flag === 's') arg = '' + arg;
                else if (flag === 'd') arg = Number(arg);
                else if (flag === 'j') arg = JSON.stringify(arg);
                if (!escaped) return arg;
                args.unshift(arg);
                return match;
            },
        );
    }

    if (args.length) fmt += ' ' + args.join(' ');

    return ('' + fmt).replace(/%{2,2}/g, '%');
}
