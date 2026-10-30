import { expect, test } from '@jest/globals';

import { createTable } from '../src/cli/table.js';

const rows = [
    { name: 'port', value: 8080 },
    { name: 'host', value: 'localhost' },
];

test('table', () => {
    expect(createTable(rows, ['name', 'value'])).toBe(['┌──────┬───────────┐', '│ name │ value     │', '├──────┼───────────┤', '│ port │ 8080      │', '│ host │ localhost │', '└──────┴───────────┘'].join('\n'));
});

test('table wraps to max width', () => {
    const table = createTable(rows, ['name', 'value'], { maxWidth: 16 });
    expect(table).toBe(['┌──────┬───────┐', '│ name │ value │', '├──────┼───────┤', '│ port │ 8080  │', '│ host │ local │', '│      │ host  │', '└──────┴───────┘'].join('\n'));
    for (const line of table.split('\n')) expect(line.length).toBeLessThanOrEqual(16);
});

test('table multi-line and colored cells', () => {
    const table = createTable([{ a: '\x1b[33mabcdef\x1b[39m', b: 'x\ny' }], ['a', 'b'], { maxWidth: 12 });
    expect(table).toBe(['┌──────┬───┐', '│ a    │ b │', '├──────┼───┤', '│ \x1b[33mabcd\x1b[0m │ x │', '│ \x1b[33mef\x1b[39m   │ y │', '└──────┴───┘'].join('\n'));
});
