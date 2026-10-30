import { expect, test } from '@jest/globals';

import { DefaultPlatform } from '../src/platform/default-platform.js';
import { SchemaParser } from '../src/reverse/schema-parser.js';
import { DatabaseModel } from '../src/schema/table.js';
import { quoteSqlString, quoteSqlStringBackslash, sqlDateToString, sqlEscape } from '../src/sql-escape.js';

class MySchemaParser extends SchemaParser {
    async parse(database: DatabaseModel, limitTableNames?: string[]) {}
}

class MyPlatform extends DefaultPlatform {
    schemaParserType = MySchemaParser;
}

test('quoteSqlStringBackslash', () => {
    expect(quoteSqlStringBackslash('')).toBe(`''`);
    expect(quoteSqlStringBackslash('abc')).toBe(`'abc'`);
    expect(quoteSqlStringBackslash(`it's`)).toBe(`'it\\'s'`);
    expect(quoteSqlStringBackslash(`a"b`)).toBe(`'a\\"b'`);
    expect(quoteSqlStringBackslash('back\\slash')).toBe(`'back\\\\slash'`);
    expect(quoteSqlStringBackslash('a\0b')).toBe(`'a\\0b'`);
    expect(quoteSqlStringBackslash('\b\t\n\r\x1a')).toBe(`'\\b\\t\\n\\r\\Z'`);
    expect(quoteSqlStringBackslash(`'; DROP TABLE x; --`)).toBe(`'\\'; DROP TABLE x; --'`);
    expect(quoteSqlStringBackslash('ü€\u{1F600}')).toBe(`'ü€\u{1F600}'`);
});

test('quoteSqlString', () => {
    expect(quoteSqlString('')).toBe(`''`);
    expect(quoteSqlString(`it's`)).toBe(`'it''s'`);
    expect(quoteSqlString(`''`)).toBe(`''''''`);
    expect(quoteSqlString('back\\slash "x"\0\n')).toBe(`'back\\slash "x"\0\n'`);
});

test('sqlDateToString', () => {
    expect(sqlDateToString(new Date(2020, 0, 2, 3, 4, 5, 6))).toBe(`'2020-01-02 03:04:05.006'`);
    expect(sqlDateToString(new Date(1999, 11, 31, 23, 59, 59, 999))).toBe(`'1999-12-31 23:59:59.999'`);
    const early = new Date(2000, 0, 1);
    early.setFullYear(5);
    expect(sqlDateToString(early)).toBe(`'0005-01-01 00:00:00.000'`);
    expect(sqlDateToString(new Date(NaN))).toBe('NULL');
});

test('sqlEscape', () => {
    expect(sqlEscape(null)).toBe('NULL');
    expect(sqlEscape(undefined)).toBe('NULL');
    expect(sqlEscape(true)).toBe('true');
    expect(sqlEscape(false)).toBe('false');
    expect(sqlEscape(0)).toBe('0');
    expect(sqlEscape(-1.5)).toBe('-1.5');
    expect(sqlEscape(1e21)).toBe('1e+21');
    expect(sqlEscape(NaN)).toBe('NaN');
    expect(sqlEscape(12345678901234567890n)).toBe(`'12345678901234567890'`);
    expect(sqlEscape(`it's`)).toBe(`'it\\'s'`);
    expect(sqlEscape(`it's`, quoteSqlString)).toBe(`'it''s'`);
    expect(sqlEscape(new Date(2020, 0, 2, 3, 4, 5, 6))).toBe(`'2020-01-02 03:04:05.006'`);
    expect(sqlEscape(new Date(NaN))).toBe('NULL');
    expect(() => sqlEscape(Symbol('x'))).toThrow(TypeError);
});

test('DefaultPlatform.quoteValue', () => {
    const platform = new MyPlatform();
    expect(platform.quoteValue(`it's`)).toBe(`'it\\'s'`);
    expect(platform.quoteValue(42)).toBe('42');
    expect(platform.quoteValue(null)).toBe('NULL');
    expect(platform.quoteValue({ a: `x'y` })).toBe(`'{\\"a\\":\\"x\\'y\\"}'`);
    expect(platform.quoteValue([1, 'a'])).toBe(`'[1,\\"a\\"]'`);
    expect(platform.quoteValue(new Date(2020, 0, 2, 3, 4, 5, 6))).toBe(`'2020-01-02 03:04:05.006'`);
});
