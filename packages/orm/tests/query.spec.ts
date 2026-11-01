import { AutoIncrement, BackReference, deserialize, Index, PrimaryKey, Reference, UUID, uuid } from '@deepkit/type';
import { expect, test } from '@jest/globals';
import { assert, IsExact } from 'conditional-type-checks';
import { Database } from '../src/database.js';
import { MemoryDatabaseAdapter, MemoryQuery } from '../src/memory-db.js';
import { AnyQuery, BaseQuery, Query } from '../src/query.js';
import { OrmEntity } from '../src/type.js';
import { getInstanceStateFromItem } from '../src/identity-map.js';

test('types do not interfere with type check', () => {
    class Books {
        bookId: UUID & Index = uuid();
    }

    const database = new Database(new MemoryDatabaseAdapter());

    function get(bookId: UUID) {
        return database
            .query(Books)
            // this should just compile and not error
            .filter({ bookId })
            .findOneOrUndefined();
    }
});

test('query select', async () => {
    class s {
        id!: number & PrimaryKey;
        username!: string;
    }

    const database = new Database(new MemoryDatabaseAdapter());
    await database.persist(deserialize<s>({ id: 0, username: 'Peter' }));
    await database.persist(deserialize<s>({ id: 0, username: 'Peter' }));

    {
        const item = await database.query(s).findOne();
        expect(item.username).toBe('Peter');
        assert<IsExact<InstanceType<typeof s>, typeof item>>(true);
        assert<IsExact<{ id: number & PrimaryKey, username: string }, typeof item>>(true);
    }

    {
        const item = await database.query(s).select('username').findOne();
        expect(item.username).toBe('Peter');
        assert<IsExact<InstanceType<typeof s>, typeof item>>(false);
        assert<IsExact<{ id: number & PrimaryKey, username: string }, typeof item>>(false);
        assert<IsExact<{ username: string }, typeof item>>(true);
    }
});

test('query filter', async () => {
    class s {
        id!: number & PrimaryKey;
        score!: number;
    }

    const database = new Database(new MemoryDatabaseAdapter());
    await database.persist(deserialize<s>({ id: 1, score: 1 }));
    await database.persist(deserialize<s>({ id: 2, score: 2 }));
    await database.persist(deserialize<s>({ id: 3, score: 3 }));

    {
        const results = await database.query(s).filter({ score: { $gt: 1 } }).find();
        expect(results).toHaveLength(2);
        expect(results).toMatchObject([{ id: 2 }, { id: 3 }]);
    }

    {
        const results = await database.query(s).filter({ score: { $gt: 1 } }).filter({ score: { $lt: 3 } }).find();
        expect(results).toHaveLength(1);
        expect(results).toMatchObject([{ id: 2 }]);
    }

    {
        const results = await database.query(s).filter({ score: { $gt: 1 } }).filterField('score', { $lt: 3 }).find();
        expect(results).toHaveLength(1);
        expect(results).toMatchObject([{ id: 2 }]);
    }

    {
        const results = await database.query(s).filter({ score: { $gt: 1 } }).clearFilter().find();
        expect(results).toHaveLength(3);
        expect(results).toMatchObject([{ id: 1 }, { id: 2 }, { id: 3 }]);
    }

});

test('query lift', async () => {
    class UserImage {
        id!: number & PrimaryKey;
        path!: string;
        size!: number;
    }

    class User {
        id!: number & PrimaryKey;
        username!: string;
        openBillings: number = 0;
        image?: UserImage & Reference;
    }

    const database = new Database(new MemoryDatabaseAdapter());
    const q = database.query(User);

    await database.persist(deserialize<User>({ id: 0, username: 'foo' }));
    await database.persist(deserialize<User>({ id: 1, username: 'bar', openBillings: 5 }));

    class MyBase<T extends OrmEntity> extends Query<T> {
        protected world = 'world';

        hello() {
            return this.world;
        }
    }

    class UserQuery<T extends { username: string }> extends MyBase<T> {
        findAllUserNames() {
            return this.findField('username');
        }

        //query classes should be able to infer the actual used class
        //so specialized routines could be executed (e.g. for SQL queries)
        detectMemoryQuery() {
            return this instanceof MemoryQuery;
        }
    }

    class BilligQuery<T extends { openBillings: number }> extends Query<T> {
        due() {
            return this.filterField('openBillings', { $gt: 0 });
        }
    }

    function filterBillingDue(q: AnyQuery<User>) {
        return q.filterField('openBillings', { $gt: 0 });
    }

    function filterMinBilling(q: BaseQuery<User>, min: number) {
        return q.filterField('openBillings', { $gt: min });
    }

    function allUserNames(q: Query<User>) {
        return q.findField('username');
    }

    function filterImageSize(q: BaseQuery<UserImage>) {
        return q.filterField('size', { $gt: 5 });
    }

    class OverwriteHello<T extends OrmEntity> extends Query<T> {
        hello() {
            return 'nope';
        }
    }

    expect(Query.is(q, UserQuery)).toBe(false);

    expect(Query.is(q.lift(UserQuery), UserQuery)).toBe(true);
    expect(Query.is(q.lift(UserQuery), MyBase)).toBe(true);

    expect(q.isMemoryDb()).toBe(true);

    expect(q.lift(UserQuery).isMemoryDb()).toBe(true);
    expect(q.lift(UserQuery).detectMemoryQuery()).toBe(true);
    expect(q.lift(UserQuery).hello()).toBe('world');
    expect(q.lift(UserQuery).lift(BilligQuery).hello()).toBe('world');
    expect(q.lift(UserQuery).lift(OverwriteHello).hello()).toBe('nope');

    expect(Query.is(q.lift(UserQuery).lift(OverwriteHello), MyBase)).toBe(true);
    expect(Query.is(q.lift(UserQuery).lift(OverwriteHello), OverwriteHello)).toBe(true);

    {
        const items = await q.lift(UserQuery).find();
        assert<IsExact<{ username: string, openBillings: number, id: number & PrimaryKey, image?: UserImage & Reference }[], typeof items>>(true);
    }

    {
        const items = await q.lift(UserQuery).find();
        assert<IsExact<{ username: string, openBillings: number, id: number & PrimaryKey, image?: UserImage & Reference }[], typeof items>>(true);
    }

    {
        const items = await q.lift(UserQuery).select('id').find();
        assert<IsExact<{ id: number & PrimaryKey }[], typeof items>>(true);
    }

    {
        const items = await UserQuery.from(q).find();
        assert<IsExact<{ username: string, openBillings: number, id: number & PrimaryKey, image?: UserImage & Reference }[], typeof items>>(true);
    }

    {
        const items = await UserQuery.from(q).select('id').find();
        assert<IsExact<{ id: number & PrimaryKey }[], typeof items>>(true);
    }

    {
        const names = await UserQuery.from(q).findAllUserNames();
        expect(names).toEqual(['foo', 'bar']);
    }

    {
        const names = await q.lift(UserQuery).findAllUserNames();
        expect(names).toEqual(['foo', 'bar']);
    }

    {
        const lifted = q.lift(UserQuery).lift(BilligQuery);
        assert<IsExact<UserQuery<any>['findAllUserNames'], typeof lifted['findAllUserNames']>>(true);
    }

    // {
    //     const lifted = BilligQuery.from(UserQuery.from(q));
    //     assert<IsExact<UserQuery<any>['findAllUserNames'], typeof lifted['findAllUserNames']>>(true);
    // }

    {
        const items = await UserQuery.from(q).filter({ username: 'foo' }).findAllUserNames();
        expect(items).toEqual(['foo']);
        assert<IsExact<string[], typeof items>>(true);
    }

    {
        const items = await q.lift(UserQuery).filter({ username: 'foo' }).findAllUserNames();
        expect(items).toEqual(['foo']);
        assert<IsExact<string[], typeof items>>(true);
    }

    {
        const items = await q.lift(UserQuery).lift(BilligQuery).findAllUserNames();
        expect(items).toEqual(['foo', 'bar']);
        assert<IsExact<string[], typeof items>>(true);
    }

    {
        const items = await q.lift(UserQuery).lift(BilligQuery).due().findAllUserNames();
        expect(items).toEqual(['bar']);
        assert<IsExact<string[], typeof items>>(true);
    }

    {
        const items = await q.use(filterBillingDue).find();
        expect(items).toEqual(items);
        assert<IsExact<User[], typeof items>>(true);
    }

    {
        const items = await allUserNames(q.use(filterBillingDue));
        expect(items).toEqual(['bar']);
        assert<IsExact<string[], typeof items>>(true);
    }

    {
        const items = await q.use(filterMinBilling, 1).fetch(allUserNames);
        expect(items).toEqual(['bar']);
        assert<IsExact<string[], typeof items>>(true);
    }

    {
        const items = await q.useJoinWith('image').use(filterImageSize).end().fetch(allUserNames);
        expect(items).toEqual(['foo', 'bar']);
        assert<IsExact<string[], typeof items>>(true);
    }

    {
        const items = await q.joinWith('image', filterImageSize).fetch(allUserNames);
        expect(items).toEqual(['foo', 'bar']);
        assert<IsExact<string[], typeof items>>(true);
    }
});

test('join with maintains model', () => {
    class Flat {
        public id: number & PrimaryKey & AutoIncrement = 0;
    }

    class Tenant {
        public id: number & PrimaryKey & AutoIncrement = 0;
        name!: string;
    }

    class Property {
        id!: number & PrimaryKey;
        flats: Flat[] & BackReference = [];
        tenants: Tenant[] & BackReference = [];
    }

    const database = new Database(new MemoryDatabaseAdapter());
    {
        const query = database.query(Property)
            .joinWith('flats').joinWith('tenants');

        expect(query.model.joins[0].populate).toBe(true);
        expect(query.model.joins[1].populate).toBe(true);
    }

    {
        const query = database.query(Property)
            .joinWith('flats').useJoinWith('tenants').sort({ name: 'desc' }).end();

        expect(query.model.joins[0].populate).toBe(true);
        expect(query.model.joins[1].populate).toBe(true);
    }
});


// test('query aggregate', async () => {
//     const product = t.schema({
//         id: t.number.primary,
//         category: t.string,
//         title: t.string,
//         price: t.integer,
//         rating: t.integer.default(0),
//     }, { name: 'Product' });

//     const database = new Database(new MemoryDatabaseAdapter());

//     database.query(product).find();
//     const query = database.query(product) as any;

//     query.groupBy('category').sum('sum').find();
//     query.groupBy('category').count('id').find();
//     query.groupBy('category').groupConcat('id').find();

//     query.groupBy('category').min('rating').find();
//     query.groupBy('category').avg('rating').find();
//     query.groupBy('category').max('rating').find();

//     // await database.persist(deserialize<s>({ id: 0, username: 'Peter' }));
// });


test('optional join', () => {
    class User {
        constructor(public id: number & PrimaryKey, public name: string) {
        }

        userAuth?: UserAuth & BackReference;
    }

    class UserAuth {
        constructor(
            public id: number & PrimaryKey,
        ) {
        }

        type!: string;
    }

    const database = new Database(new MemoryDatabaseAdapter());

    database
        .query(User)
        .useInnerJoinWith('userAuth')
        .filter({ type: 'bar' })
        .end();
});

test('disableChangeDetection survives further query calls', async () => {
    class Item {
        id: number & PrimaryKey & AutoIncrement = 0;
        constructor(public name: string) {}
    }

    const database = new Database(new MemoryDatabaseAdapter(), [Item]);
    await database.persist(new Item('a'), new Item('b'));

    const query = database.query(Item).disableChangeDetection();
    expect(query.model.withChangeDetection).toBe(false);
    // every call clones the query model
    expect(query.filter({ name: 'a' }).limit(10).orderBy('id').model.withChangeDetection).toBe(false);

    const [item] = await query.filter({ name: 'a' }).find();
    expect(getInstanceStateFromItem(item).isKnownInDatabase()).toBe(false);

    const [tracked] = await database.query(Item).filter({ name: 'a' }).find();
    expect(getInstanceStateFromItem(tracked).isKnownInDatabase()).toBe(true);
});
