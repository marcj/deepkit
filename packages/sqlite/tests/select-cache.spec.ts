import { Database } from '@deepkit/orm';
import { SqlBuilder } from '@deepkit/sql';
import { DatabaseField, PrimaryKey, Reference, ReflectionClass, entity } from '@deepkit/type';
import { expect, jest, test } from '@jest/globals';

import { SQLiteDatabaseAdapter } from '../src/sqlite-adapter.js';

function createDatabase() {
    return new Database(new SQLiteDatabaseAdapter(':memory:'), [Owner, Item]);
}

@entity.name('selectOwner')
class Owner {
    id: number & PrimaryKey = 0;
}

@entity.name('selectItem')
class Item {
    id: number & PrimaryKey = 0;
    name: string = '';
    fullName: string & DatabaseField<{ name: 'full_name' }> = '';
    ready: boolean = false;
    age?: number;
    created?: Date;
    tags: string[] = [];
    data: { a: number } = { a: 0 };
    owner?: Owner & Reference;
    lazy?: string;
}

const schema = ReflectionClass.from(Item);

function build(database: Database, change: (query: any) => any) {
    const sql = new SqlBuilder(database.adapter as any).select(schema, change(database.query(Item)).model);
    return { sql: sql.sql, params: sql.params };
}

function attempt(database: Database, change: (query: any) => any) {
    try {
        return build(database, change);
    } catch (error: any) {
        return error.message;
    }
}

/** How often the filter was built, which a cached query doesn't do. */
function countBuilds(database: Database) {
    return jest.spyOn((database.adapter as any).platform, 'createSqlFilterBuilder');
}

const reusable: [string, (query: any) => any, (query: any) => any][] = [
    ['one number', q => q.filter({ id: 1 }), q => q.filter({ id: 2 })],
    ['a string', q => q.filter({ name: 'a' }), q => q.filter({ name: 'b' })],
    ['several fields', q => q.filter({ id: 1, name: 'a' }), q => q.filter({ id: 2, name: 'b' })],
    ['a boolean', q => q.filter({ ready: true }), q => q.filter({ ready: false })],
    ['a renamed column', q => q.filter({ fullName: 'a' }), q => q.filter({ fullName: 'b' })],
    ['a value that is converted', q => q.filter({ id: 1 }), q => q.filter({ id: '7' })],
    ['no filter', q => q, q => q],
    ['limit', q => q.filter({ id: 1 }).limit(1), q => q.filter({ id: 2 }).limit(1)],
    ['limit and skip', q => q.filter({ id: 1 }).limit(10).skip(5), q => q.filter({ id: 2 }).limit(10).skip(5)],
    ['sort', q => q.filter({ id: 1 }).sort({ name: 'desc' }), q => q.filter({ id: 2 }).sort({ name: 'desc' })],
];

test.each(reusable)('%s is built once, with the result of a fresh build', (name, first, second) => {
    const database = createDatabase();
    const builds = countBuilds(database);
    build(database, first);
    const calls = builds.mock.calls.length;
    const cached = build(database, second);
    expect(builds.mock.calls.length).toBe(calls);

    const fresh = build(createDatabase(), second);
    expect(cached).toEqual(fresh);
});

const notReusable: [string, (query: any) => any, (query: any) => any][] = [
    ['null', q => q.filter({ age: null }), q => q.filter({ age: null })],
    ['an operator', q => q.filter({ id: { $gt: 1 } }), q => q.filter({ id: { $gt: 2 } })],
    ['a list', q => q.filter({ id: { $in: [1, 2] } }), q => q.filter({ id: { $in: [3] } })],
    ['$or', q => q.filter({ $or: [{ id: 1 }, { id: 2 }] }), q => q.filter({ $or: [{ id: 1 }] })],
    ['a date', q => q.filter({ created: new Date(1) }), q => q.filter({ created: new Date(2) })],
    ['an array column', q => q.filter({ tags: 'a' }), q => q.filter({ tags: 'b' })],
    ['an object column', q => q.filter({ data: { a: 1 } }), q => q.filter({ data: { a: 2 } })],
    ['a deep path', q => q.filter({ 'data.a': 1 }), q => q.filter({ 'data.a': 2 })],
    ['a reference', q => q.filter({ owner: 1 }), q => q.filter({ owner: 2 })],
    ['a regex', q => q.filter({ name: /a/ }), q => q.filter({ name: /b/ })],
    ['select', q => q.filter({ id: 1 }).select('name'), q => q.filter({ id: 2 }).select('name')],
    ['lazy load', q => q.filter({ id: 1 }).lazyLoad('lazy'), q => q.filter({ id: 2 }).lazyLoad('lazy')],
    ['group by', q => q.filter({ id: 1 }).groupBy('name'), q => q.filter({ id: 2 }).groupBy('name')],
];

test.each(notReusable)('%s is always built', (name, first, second) => {
    const database = createDatabase();
    const builds = countBuilds(database);
    build(database, first);
    const calls = builds.mock.calls.length;
    const result = build(database, second);
    expect(builds.mock.calls.length).toBeGreaterThan(calls);
    expect(result).toEqual(build(createDatabase(), second));
});

const distinct: [string, (query: any) => any, (query: any) => any][] = [
    ['fields', q => q.filter({ id: 1 }), q => q.filter({ name: 'a' })],
    ['order of fields', q => q.filter({ id: 1, name: 'a' }), q => q.filter({ name: 'a', id: 1 })],
    ['limit', q => q.filter({ id: 1 }).limit(1), q => q.filter({ id: 1 }).limit(2)],
    ['no limit', q => q.filter({ id: 1 }).limit(1), q => q.filter({ id: 1 })],
    ['skip', q => q.filter({ id: 1 }).limit(1).skip(1), q => q.filter({ id: 1 }).limit(1).skip(2)],
    ['sort direction', q => q.sort({ id: 'asc' }), q => q.sort({ id: 'desc' })],
    ['sort field', q => q.sort({ id: 'asc' }), q => q.sort({ name: 'asc' })],
    ['a filter and none', q => q.filter({ id: 1 }), q => q],
    ['a field name with a separator', q => q.filter({ id: 1, name: 'a' }), q => q.filter({ ['id\0name']: 1 })],
];

test.each(distinct)('a different %s is not mixed up', (name, first, second) => {
    const database = createDatabase();
    build(database, first);
    expect(attempt(database, second)).toEqual(attempt(createDatabase(), second));
});

test('a query with existing parameters is not cached', () => {
    const database = createDatabase();
    const builds = countBuilds(database);
    const model = (database.query(Item).filter({ id: 1 }) as any).model;
    new SqlBuilder(database.adapter as any, ['before']).select(schema, model);
    const calls = builds.mock.calls.length;
    const sql = new SqlBuilder(database.adapter as any, ['before']).select(schema, model);
    expect(builds.mock.calls.length).toBeGreaterThan(calls);
    expect(sql.params).toEqual(['before', 1]);
});

test('invalid values still fail like without the cache', () => {
    const database = createDatabase();
    build(database, q => q.filter({ id: 1 }));
    const run = (db: Database) => {
        try {
            return build(db, q => q.filter({ id: 'not a number' }));
        } catch (error: any) {
            return error.message;
        }
    };
    expect(run(database)).toEqual(run(createDatabase()));
});

test('queries of the same shape return their own rows', async () => {
    const database = createDatabase();
    await database.migrate();
    for (let id = 1; id <= 3; id++) await database.persist(Object.assign(new Item(), { id, name: 'item ' + id, ready: id === 2 }));
    expect((await database.query(Item).filter({ id: 1 }).findOne()).name).toBe('item 1');
    expect((await database.query(Item).filter({ id: 3 }).findOne()).name).toBe('item 3');
    expect((await database.query(Item).filter({ ready: true }).findOne()).id).toBe(2);
    expect((await database.query(Item).filter({ ready: false }).sort({ id: 'desc' }).findOne()).id).toBe(3);
    database.disconnect();
});
