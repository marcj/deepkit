import { expect, jest, test } from '@jest/globals';

import { AutoIncrement, PrimaryKey, UUID, entity, uuid } from '@deepkit/type';

import { PostgresConnection } from '../src/postgres-adapter.js';
import { databaseFactory } from './factory.js';

enum Color {
    red = 'red',
    green = 'green',
}

@entity.name('batch_insert_row')
class Row {
    id: number & PrimaryKey & AutoIncrement = 0;
    note?: string;
    count: number = 0;
    ratio: number = 0;
    big: bigint = 0n;
    ready: boolean = false;
    created: Date = new Date(0);
    token: UUID = uuid();
    bytes: Uint8Array = new Uint8Array(0);
    color: Color = Color.red;

    constructor(public name: string) {}
}

@entity.name('batch_insert_json')
class WithJson {
    id: number & PrimaryKey & AutoIncrement = 0;
    tags: string[] = [];

    constructor(public name: string) {}
}

function spyOnSql() {
    const spy = jest.spyOn(PostgresConnection.prototype, 'run');
    return {
        statements: () => spy.mock.calls.map(v => v[0] as string).filter(v => v.startsWith('INSERT')),
        restore: () => spy.mockRestore(),
    };
}

test('a batch insert sends one array per column and roundtrips every value', async () => {
    const database = await databaseFactory([Row]);
    const names = ['plain', 'with "quote"', 'back\\slash', 'comma,brace{}', 'NULL', '', 'ünï çødé 🎉', "it's", 'new\nline'];
    const rows = names.map((name, i) => {
        const row = new Row(name);
        row.note = i % 2 ? undefined : 'note ' + i;
        row.count = i - 3;
        row.ratio = i / 4;
        row.big = 9007199254740993n + BigInt(i);
        row.ready = i % 2 === 0;
        row.created = new Date(1_700_000_000_000 + i);
        row.bytes = new Uint8Array([0, i, 255]);
        row.color = i % 2 ? Color.green : Color.red;
        return row;
    });

    const sql = spyOnSql();
    try {
        await database.persist(...rows);
        const [statement] = sql.statements();
        expect(statement).toContain('unnest(');
        expect(statement).not.toContain('VALUES');
    } finally {
        sql.restore();
    }

    expect(new Set(rows.map(v => v.id)).size).toBe(rows.length);
    const loaded = await database.query(Row).orderBy('id').find();
    expect(loaded.map(v => v.id)).toEqual(rows.map(v => v.id));
    for (let i = 0; i < rows.length; i++) {
        const expected = rows[i];
        const actual = loaded[i];
        expect(actual.name).toBe(expected.name);
        expect(actual.note).toBe(expected.note);
        expect(actual.count).toBe(expected.count);
        expect(actual.ratio).toBe(expected.ratio);
        expect(actual.big).toBe(expected.big);
        expect(actual.ready).toBe(expected.ready);
        expect(actual.created).toEqual(expected.created);
        expect(actual.token).toBe(expected.token);
        expect([...actual.bytes]).toEqual([...expected.bytes]);
        expect(actual.color).toBe(expected.color);
    }
    database.disconnect();
});

test('rows with JSON columns keep working', async () => {
    const database = await databaseFactory([WithJson]);
    const a = new WithJson('a');
    a.tags = ['x', 'y"z'];
    const b = new WithJson('b');
    await database.persist(a, b);

    const loaded = await database.query(WithJson).orderBy('id').find();
    expect(loaded.map(v => v.tags)).toEqual([['x', 'y"z'], []]);
    expect(a.id).toBeGreaterThan(0);
    database.disconnect();
});
