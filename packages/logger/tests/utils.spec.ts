import { expect, test } from '@jest/globals';

import { format, style } from '../src/utils.js';

test('format', () => {
    expect(format('a %s b %d', 'x', '5')).toBe('a x b 5');
    expect(format('100%% done')).toBe('100%% done'); // like util.format, %% stays without arguments
    expect(format('%s', 'a', 'b', 3)).toBe('a b 3');
    expect(format({ a: 1 })).toBe('{ a: 1 }');
});

test('style', () => {
    expect(style.red).toEqual({ open: '\u001B[31m', close: '\u001B[39m' });
    expect(style.gray).toEqual({ open: '\u001B[90m', close: '\u001B[39m' });
    expect(style.bgBlueBright).toEqual({ open: '\u001B[104m', close: '\u001B[49m' });
    expect(style.bold).toEqual({ open: '\u001B[1m', close: '\u001B[22m' });
});
