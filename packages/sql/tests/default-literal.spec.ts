import { expect, test } from '@jest/globals';
import { parseDefaultLiteral } from '../src/reverse/schema-parser.js';

test('parses SQL literals of column defaults', () => {
    expect(parseDefaultLiteral('1')).toEqual({ value: 1 });
    expect(parseDefaultLiteral('-1.5')).toEqual({ value: -1.5 });
    expect(parseDefaultLiteral(`'abc'`)).toEqual({ value: 'abc' });
    expect(parseDefaultLiteral(`'it''s'`)).toEqual({ value: `it's` });
    expect(parseDefaultLiteral(`''`)).toEqual({ value: '' });
    expect(parseDefaultLiteral(`'{"a":1}'`)).toEqual({ value: { a: 1 } });
    expect(parseDefaultLiteral(`'[1,2]'`)).toEqual({ value: [1, 2] });
    expect(parseDefaultLiteral('true')).toEqual({ value: true });
    expect(parseDefaultLiteral('false')).toEqual({ value: false });
    expect(parseDefaultLiteral('null')).toEqual({ value: null });
});

test('expressions are not literals', () => {
    expect(parseDefaultLiteral('CURRENT_TIMESTAMP')).toBeUndefined();
    expect(parseDefaultLiteral('NULL')).toBeUndefined();
    expect(parseDefaultLiteral(`nextval('seq')`)).toBeUndefined();
    expect(parseDefaultLiteral(`'a' || 'b'`)).toBeUndefined();
});

test('defaults are never executed', () => {
    // the schema parsers used eval(), so a default value in the database could run code
    (globalThis as any).deepkitDefaultExecuted = false;
    expect(parseDefaultLiteral('globalThis.deepkitDefaultExecuted = true')).toBeUndefined();
    expect(parseDefaultLiteral(`(globalThis.deepkitDefaultExecuted = true, 'x')`)).toBeUndefined();
    expect((globalThis as any).deepkitDefaultExecuted).toBe(false);
});
