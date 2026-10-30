import { afterAll, expect, test } from '@jest/globals';
import { rmSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { sleep } from '@deepkit/core';
import { DatabaseEntityRegistry, UniqueConstraintFailure } from '@deepkit/orm';
import { User, UserCredentials } from '@deepkit/orm-integration';
import { sql } from '@deepkit/sql';
import {
    AutoIncrement,
    BackReference,
    cast,
    DatabaseField,
    Entity,
    entity,
    getPrimaryKeyExtractor,
    getPrimaryKeyHashGenerator,
    isReferenceInstance,
    PrimaryKey,
    Reference,
    ReflectionClass,
    serialize,
    typeOf,
    Unique,
    UUID,
    uuid,
} from '@deepkit/type';


import { SQLiteDatabaseAdapter, SQLiteDatabaseTransaction } from '../src/sqlite-adapter.js';
import { SQLitePlatform } from '../src/sqlite-platform.js';
import { databaseFactory } from './factory.js';
import { MemoryLogger } from '@deepkit/logger';


test('reflection circular reference', () => {
    const user = ReflectionClass.from(User);
    const credentials = ReflectionClass.from(UserCredentials);

    expect(user.getProperty('credentials').isBackReference()).toBe(true);
    expect(user.getProperty('credentials').getResolvedReflectionClass()).toBe(credentials);
    const userProperty = credentials.getProperty('user');
    expect(userProperty.getResolvedReflectionClass()).toBe(user);
    expect(userProperty.isPrimaryKey()).toBe(true);
    expect(userProperty.isReference()).toBe(true);
});

test('tables', () => {
    const [user] = new SQLitePlatform().createTables(DatabaseEntityRegistry.from([User]));
    expect(user.getColumn('birthdate').isNotNull).toBe(false);

    const [userCredentials] = new SQLitePlatform().createTables(DatabaseEntityRegistry.from([UserCredentials, User]));
    expect(userCredentials.getColumn('user').isPrimaryKey).toBe(true);
    expect(userCredentials.getColumn('user').type).toBe('integer');
});

test('class basic', async () => {
    class Product {
        id: number & PrimaryKey = 0;
        created: Date = new Date;

        constructor(public name: string) {
        }
    }

    const database = await databaseFactory([Product]);

    const product1 = cast<Product>({ id: 1, name: 'Yes', created: new Date() });
    const product2 = cast<Product>({ id: 2, name: 'Wow', created: new Date() });
    const product3 = cast<Product>({ id: 3, name: 'asdadasd', created: new Date() });

    {
        const session = database.createSession();

        expect(await session.query(Product).count()).toBe(0);

        session.add(product1, product2, product3);
        await session.commit();
        expect(await session.query(Product).count()).toBe(3);

        product1.name = 'Changed';
        await session.commit();
        expect(await session.query(Product).count()).toBe(3);
        expect((await session.query(Product).disableIdentityMap().filter(product1).findOne()).name).toBe('Changed');
    }

    {
        const session = database.createSession();
        const user1db = await session.query(Product).filter({ id: product1.id }).findOne();
        expect(user1db.name).toBe('Changed');
    }

    {
        const session = database.createSession();
        expect((await session.query(Product).deleteMany()).modified).toBe(3);
        expect((await session.query(Product).deleteMany()).modified).toBe(0);
    }
});

test('interface basic', async () => {
    interface Product extends Entity<{ name: 'product' }> {
        id: number & PrimaryKey;
        name: string;
        created: Date;
    }

    const database = await databaseFactory([typeOf<Product>()]);

    const product1: Product = { id: 1, name: 'Yes', created: new Date() };
    const product2: Product = { id: 2, name: 'Wow', created: new Date() };
    const product3: Product = { id: 3, name: 'asdadasd', created: new Date() };

    {
        const session = database.createSession();

        expect(await session.query<Product>().count()).toBe(0);

        session.add(product1, product2, product3);
        await session.commit();
        expect(await session.query<Product>().count()).toBe(3);

        product1.name = 'Changed';
        await session.commit();
        expect(await session.query<Product>().count()).toBe(3);
        expect((await session.query<Product>().disableIdentityMap().filter(product1).findOne()).name).toBe('Changed');
    }

    {
        const session = database.createSession();
        const user1db = await session.query<Product>().filter({ id: product1.id }).findOne();
        expect(user1db.name).toBe('Changed');
    }

    {
        const session = database.createSession();
        expect((await session.query<Product>().deleteMany()).modified).toBe(3);
        expect((await session.query<Product>().deleteMany()).modified).toBe(0);
    }
});

test('sqlite autoincrement', async () => {
    @entity.name('sqlite-user')
    class User {
        id?: number & PrimaryKey & AutoIncrement;
        created: Date = new Date;

        constructor(
            public name: string,
        ) {
        }
    }

    const database = await databaseFactory([User]);
    const session = database.createSession();

    expect(await session.query(User).count()).toBe(0);

    const peter = new User('Peter');
    const herbert = new User('Herbert');
    session.add(peter);
    session.add(herbert);
    await session.commit();
    expect(await session.query(User).count()).toBe(2);

    expect(peter.id).toBe(1);
    expect(herbert.id).toBe(2);

    expect(await session.query(User).count()).toBe(2);
});

test('sqlite relation', async () => {
    @entity.name('sqlite-author')
    class Author {
        created: Date = new Date;

        constructor(
            public id: number & PrimaryKey,
            public name: string,
        ) {
        }
    }

    @entity.name('sqlite-book')
    class Book {
        constructor(
            public id: number & PrimaryKey,
            public author: Author & Reference,
            public name: string,
        ) {
        }
    }

    const database = await databaseFactory([Author, Book]);
    const session = database.createSession();

    expect(await session.query(Author).count()).toBe(0);

    const peter = new Author(1, 'Peter');
    const herbert = new Author(2, 'Herbert');

    session.add(peter);
    session.add(herbert);

    const book1 = new Book(1, peter, 'Peters book');
    session.add(book1);
    await session.commit();

    expect(await session.query(Author).count()).toBe(2);
    expect(await session.query(Book).count()).toBe(1);
});


// the connection pool behaves differently for :memory:, so these tests need a file, which must not end up in the repo
const fileDatabase = join(tmpdir(), `deepkit-sqlite-test-${process.pid}.sqlite`);
afterAll(() => rmSync(fileDatabase, { force: true }));

test('transaction', async () => {
    const sqlite = new SQLiteDatabaseAdapter(fileDatabase);

    {
        const t1 = new SQLiteDatabaseTransaction();
        const c1 = await sqlite.connectionPool.getConnection(t1);
        const c2 = await sqlite.connectionPool.getConnection();

        expect(c1 === c2).toBe(false);

        c1.release(); //this doesnt release anything
        c2.release();

        expect(c1.released).toBe(false);

        {
            const c3 = await sqlite.connectionPool.getConnection();
            expect(c3 === c1).toBe(false);
        }

        c1.transaction!.ended = true;
        c1.release(); //now it can be released

        {
            const c3 = await sqlite.connectionPool.getConnection();
            expect(c3 === c1).toBe(true);
        }
    }
});

test('connection pool', async () => {
    const sqlite = new SQLiteDatabaseAdapter(fileDatabase);

    {
        const c1 = await sqlite.connectionPool.getConnection();
        const c2 = await sqlite.connectionPool.getConnection();

        expect(c1 === c2).toBe(false);

        c1.release();
        c2.release();

        const c3 = await sqlite.connectionPool.getConnection();
        expect(c3 === c1).toBe(true);

        c3.release();
    }

    {
        const c1 = await sqlite.connectionPool.getConnection();
        const c2 = await sqlite.connectionPool.getConnection();
        const c3 = await sqlite.connectionPool.getConnection();
        const c4 = await sqlite.connectionPool.getConnection();
        const c5 = await sqlite.connectionPool.getConnection();
        const c6 = await sqlite.connectionPool.getConnection();
        const c7 = await sqlite.connectionPool.getConnection();
        const c8 = await sqlite.connectionPool.getConnection();
        const c9 = await sqlite.connectionPool.getConnection();
        const c10 = await sqlite.connectionPool.getConnection();
        // this blocks
        let c11: any;
        sqlite.connectionPool.getConnection().then((c) => {
            c11 = c;
        });
        let c12: any;
        sqlite.connectionPool.getConnection().then((c) => {
            c12 = c;
        });
        await sleep(0.01);
        expect(c11).toBe(undefined);
        expect(c12).toBe(undefined);

        c1.release();
        await sleep(0.01);
        expect(c11).toBe(c1);

        c2.release();
        await sleep(0.01);
        expect(c12).toBe(c2);
    }
});

test('raw', async () => {
    class User {
        id!: number & PrimaryKey;
        name!: string;
    }

    const database = await databaseFactory([ReflectionClass.from<User>()]);

    await database.persist({ id: 1, name: 'Peter' });
    await database.persist({ id: 2, name: 'Marie' });

    {
        const row = await database.raw<{ count: bigint }>(sql`SELECT count(*) as count FROM user`).findOne();
        expect(row.count).toBe(2n);
    }

    {
        const rows = await database.raw<User>(sql`SELECT * FROM user`).find();
        expect(rows.length).toBe(2);
        expect(rows[0]).toEqual({ id: 1, name: 'Peter' });
        expect(rows[1]).toEqual({ id: 2, name: 'Marie' });
        expect(rows[0]).toBeInstanceOf(User);
    }
});

test(':memory: connection pool', async () => {
    const sqlite = new SQLiteDatabaseAdapter(':memory:');

    // create a connection, or return null if it takes longer than 100 ms
    const createConnectionOrNull = () => Promise.race([
        sqlite.connectionPool.getConnection(),
        sleep(0.1).then(() => null),
    ]);

    {
        const c1 = await sqlite.connectionPool.getConnection();
        const c2 = await createConnectionOrNull();
        const c3 = await createConnectionOrNull();

        expect(sqlite.connectionPool.getActiveConnections()).toBeLessThanOrEqual(sqlite.connectionPool.maxConnections);

        expect(c1).toBeDefined();
        expect(c2).toBeNull();
        expect(c3).toBeNull();

        c1.release();
        c2?.release();
        c3?.release();
    }
});

test(':memory: maxConnections can not be raised', async () => {
    // every connection to ':memory:' opens its own empty database, so more than one
    // connection would silently split data across separate databases.
    const sqlite = new SQLiteDatabaseAdapter(':memory:');
    expect(sqlite.connectionPool.maxConnections).toBe(1);
    expect(() => (sqlite.connectionPool.maxConnections = 2)).toThrow('only have one connection');
    expect(sqlite.connectionPool.maxConnections).toBe(1);
    sqlite.connectionPool.maxConnections = 1;
    expect(sqlite.connectionPool.maxConnections).toBe(1);
});

test('maxConnections must be at least 1', async () => {
    const pool = new SQLiteDatabaseAdapter('/tmp/deepkit-sqlite-max-connections.sqlite').connectionPool;
    expect(pool.maxConnections).toBe(10);
    // 0 would make getConnection() wait forever
    expect(() => (pool.maxConnections = 0)).toThrow('at least 1');
    expect(() => (pool.maxConnections = -1)).toThrow('at least 1');
    expect(() => (pool.maxConnections = NaN)).toThrow('at least 1');
    expect(pool.maxConnections).toBe(10);
    pool.maxConnections = 3;
    expect(pool.maxConnections).toBe(3);
});

test('optional', async () => {
    @entity.name('entity')
    class MyEntity {
        id: number & PrimaryKey & AutoIncrement = 0;
        value?: string;
    }

    const database = await databaseFactory([MyEntity]);

    const entity1 = new MyEntity();
    expect('value' in entity1).toBe(false);
    expect('value' in serialize<MyEntity>(entity1)).toBe(false);

    await database.persist(entity1);

    const entity2 = await database.query(MyEntity).findOne();
    expect('value' in entity2).toBe(false);
    expect('value' in serialize<MyEntity>(entity1)).toBe(false);
});

test('uuid', async () => {
    @entity.name('my-entity')
    class MyEntity {
        id: UUID & PrimaryKey = uuid();
    }

    const database = await databaseFactory([MyEntity]);

    const ent = new MyEntity();
    await database.persist(ent);
    expect(await database.query(MyEntity).count()).toBe(1);
    await database.remove(ent);
    expect(await database.query(MyEntity).count()).toBe(0);
});

test('m2m', async () => {
    class Book {
        id: number & PrimaryKey & AutoIncrement = 0;
        tags: Tag[] & BackReference<{ via: typeof BookToTag }> = [];

        constructor(public title: string) {
        }
    }

    class Tag {
        id: number & PrimaryKey & AutoIncrement = 0;
        books: Book[] & BackReference<{ via: typeof BookToTag }> = [];

        constructor(public name: string) {
        }
    }

    class BookToTag {
        id: number & PrimaryKey & AutoIncrement = 0;

        constructor(public book: Book & Reference, public tag: Tag & Reference) {
        }
    }

    const database = await databaseFactory([Book, Tag, BookToTag]);

    const book = new Book('title');
    const tag = new Tag('name');
    const pivot = new BookToTag(book, tag);
    await database.persist(book, tag, pivot);
    const tagQueried = await database.query(Tag).join('books').findOne();
    expect(tagQueried).toMatchObject({ name: 'name' });
});

test('bool and json', async () => {
    class Model {
        id: number & PrimaryKey & AutoIncrement = 0;
        flag: boolean = false;
        doc: { flag: boolean } = { flag: false };
    }

    const database = await databaseFactory([Model]);

    {
        const m = new Model;
        m.flag = true;
        m.doc.flag = true;
        await database.persist(m);
    }

    const m = await database.query(Model).findOne();
    expect(m).toMatchObject({ flag: true, doc: { flag: true } });
});

test('change different fields of multiple entities', async () => {
    @entity.name('model2')
    class Model {
        firstName: string = '';
        lastName: string = '';

        constructor(public id: number & PrimaryKey) {
        }
    }

    const database = await databaseFactory([Model]);

    {
        const m1 = new Model(1);
        m1.firstName = 'Peter';
        await database.persist(m1);
        const m2 = new Model(2);
        m2.lastName = 'Smith';
        await database.persist(m2);
    }

    {
        const m1 = await database.query(Model).filter({ id: 1 }).findOne();
        const m2 = await database.query(Model).filter({ id: 2 }).findOne();

        m1.firstName = 'Peter2';
        m2.lastName = 'Smith2';
        await database.persist(m1, m2);
    }

    {
        const m1 = await database.query(Model).filter({ id: 1 }).findOne();
        const m2 = await database.query(Model).filter({ id: 2 }).findOne();

        expect(m1).toMatchObject({ id: 1, firstName: 'Peter2', lastName: '' });
        expect(m2).toMatchObject({ id: 2, firstName: '', lastName: 'Smith2' });
    }
});

test('change pk', async () => {
    @entity.name('model3')
    class Model {
        firstName: string = '';

        constructor(public id: number & PrimaryKey) {
        }
    }

    const database = await databaseFactory([Model]);

    {
        const m1 = new Model(1);
        m1.firstName = 'Peter';
        await database.persist(m1);
    }

    {
        const m1 = await database.query(Model).filter({ id: 1 }).findOne();
        m1.id = 2;
        await database.persist(m1);
    }

    {
        const m1 = await database.query(Model).filter({ id: 2 }).findOne();
        expect(m1).toMatchObject({ id: 2, firstName: 'Peter' });
    }

    {
        const m1 = await database.query(Model).filter({ id: 2 }).findOne();
        m1.id = 3;
        m1.firstName = 'Peter2';
        await database.persist(m1);
    }

    {
        const m1 = await database.query(Model).filter({ id: 3 }).findOne();
        expect(m1).toMatchObject({ id: 3, firstName: 'Peter2' });
    }
});

test('for update/share', async () => {
    @entity.name('model4')
    class Model {
        firstName: string = '';

        constructor(public id: number & PrimaryKey) {
        }
    }

    const database = await databaseFactory([Model]);
    await database.persist(new Model(1), new Model(2));

    {
        const query = database.query(Model).forUpdate();
        const sql = database.adapter.createSelectSql(query);
        expect(sql.sql).not.toContain(' FOR UPDATE');
    }

    {
        const query = database.query(Model).forShare();
        const sql = database.adapter.createSelectSql(query);
        expect(sql.sql).not.toContain(' FOR SHARE');
    }

    const items = await database.query(Model).forUpdate().find();
    expect(items).toHaveLength(2);
});

test('deep documents', async () => {
    interface Definition {
        fields: string[];
    }

    class Project {
        id: number & PrimaryKey & AutoIncrement = 0;
        definitions: Definition[] = [];
    }

    const database = await databaseFactory([Project]);

    const project = new Project();
    project.definitions.push({ fields: ['a', 'b'] });
    await database.persist(project);

    const connection = await database.adapter.connectionPool.getConnection();
    const result = await connection.execAndReturnSingle('SELECT * FROM project');
    connection.release();
    expect(result.definitions).toBe(JSON.stringify(project.definitions));
    database.disconnect();
});

test('multiple joins', async () => {
    class Flat {
        public id: number & PrimaryKey & AutoIncrement = 0;

        constructor(public property: Property & Reference, public name: string) {
        }
    }

    class Tenant {
        public id: number & PrimaryKey & AutoIncrement = 0;

        constructor(public property: Property & Reference, public name: string) {
        }
    }

    class Property {
        public id: number & PrimaryKey & AutoIncrement = 0;
        flats: Flat[] & BackReference = [];
        tenants: Tenant[] & BackReference = [];

        constructor(public name: string) {
        }
    }

    const database = await databaseFactory([Property, Tenant, Flat]);
    // database.logger.enableLogging();

    const property1 = new Property('immo1');
    property1.flats.push(new Flat(property1, 'flat1'));
    property1.flats.push(new Flat(property1, 'flat2'));
    property1.tenants.push(new Tenant(property1, 'tenant1'));
    property1.tenants.push(new Tenant(property1, 'tenant2'));

    await database.persist(property1, ...property1.flats, ...property1.tenants);

    {
        const list = await database.query(Property).joinWith('flats').find();
        expect(list).toHaveLength(1);
        expect(list[0].flats).toMatchObject([{ name: 'flat1' }, { name: 'flat2' }]);
    }

    {
        const list = await database.query(Property).joinWith('tenants').find();
        expect(list).toHaveLength(1);
        expect(list[0].tenants).toMatchObject([{ name: 'tenant1' }, { name: 'tenant2' }]);
    }

    {
        const list = await database.query(Property).joinWith('flats').joinWith('tenants').find();
        expect(list).toHaveLength(1);
        expect(list[0].flats).toMatchObject([{ name: 'flat1' }, { name: 'flat2' }]);
        expect(list[0].tenants).toMatchObject([{ name: 'tenant1' }, { name: 'tenant2' }]);
    }

    {
        const list = await database.query(Property).joinWith('flats').useJoinWith('tenants').sort({ name: 'desc' }).end().find();
        expect(list).toHaveLength(1);
        expect(list[0].flats).toMatchObject([{ name: 'flat1' }, { name: 'flat2' }]);
        expect(list[0].tenants).toMatchObject([{ name: 'tenant2' }, { name: 'tenant1' }]);
    }

    {
        const list = await database.query(Property)
            .joinWith('flats')
            .joinWith('tenants', v => v.sort({ name: 'desc' }))
            .find();
        expect(list).toHaveLength(1);
        expect(list[0].flats).toMatchObject([{ name: 'flat1' }, { name: 'flat2' }]);
        expect(list[0].tenants).toMatchObject([{ name: 'tenant2' }, { name: 'tenant1' }]);
    }

    const property2 = new Property('immo2');
    property2.flats.push(new Flat(property2, 'flat3'));
    property2.flats.push(new Flat(property2, 'flat4'));
    property2.tenants.push(new Tenant(property2, 'tenant3'));
    property2.tenants.push(new Tenant(property2, 'tenant4'));

    await database.persist(property2, ...property2.flats, ...property2.tenants);

    {
        const list = await database.query(Property).joinWith('flats').find();
        expect(list).toHaveLength(2);
        expect(list[0].flats).toMatchObject([{ name: 'flat1' }, { name: 'flat2' }]);
        expect(list[1].flats).toMatchObject([{ name: 'flat3' }, { name: 'flat4' }]);
    }

    {
        const list = await database.query(Property).joinWith('tenants').find();
        expect(list).toHaveLength(2);
        expect(list[0].tenants).toMatchObject([{ name: 'tenant1' }, { name: 'tenant2' }]);
        expect(list[1].tenants).toMatchObject([{ name: 'tenant3' }, { name: 'tenant4' }]);
    }

    {
        const list = await database.query(Property).joinWith('flats').joinWith('tenants').find();
        expect(list).toHaveLength(2);
        expect(list[0].flats).toMatchObject([{ name: 'flat1' }, { name: 'flat2' }]);
        expect(list[0].tenants).toMatchObject([{ name: 'tenant1' }, { name: 'tenant2' }]);
        expect(list[1].flats).toMatchObject([{ name: 'flat3' }, { name: 'flat4' }]);
        expect(list[1].tenants).toMatchObject([{ name: 'tenant3' }, { name: 'tenant4' }]);
    }

    {
        const list = await database.query(Property).joinWith('flats').useJoinWith('tenants').sort({ name: 'desc' }).end().find();
        expect(list).toHaveLength(2);

        expect(list[0].name).toBe('immo2');
        expect(list[0].flats).toMatchObject([{ name: 'flat3' }, { name: 'flat4' }]);
        expect(list[0].tenants).toMatchObject([{ name: 'tenant4' }, { name: 'tenant3' }]);

        expect(list[1].name).toBe('immo1');
        expect(list[1].flats).toMatchObject([{ name: 'flat1' }, { name: 'flat2' }]);
        expect(list[1].tenants).toMatchObject([{ name: 'tenant2' }, { name: 'tenant1' }]);
    }

    {
        const list = await database.query(Property).joinWith('flats').useJoinWith('tenants').sort({ name: 'desc' }).end().sort({ id: 'asc' }).find();
        expect(list).toHaveLength(2);

        expect(list[0].name).toBe('immo1');
        expect(list[0].flats).toMatchObject([{ name: 'flat1' }, { name: 'flat2' }]);
        expect(list[0].tenants).toMatchObject([{ name: 'tenant2' }, { name: 'tenant1' }]);

        expect(list[1].name).toBe('immo2');
        expect(list[1].flats).toMatchObject([{ name: 'flat3' }, { name: 'flat4' }]);
        expect(list[1].tenants).toMatchObject([{ name: 'tenant4' }, { name: 'tenant3' }]);
    }
});

test('unloaded relation not deep checked', async () => {
    class BaseModel {
        id: number & PrimaryKey & AutoIncrement = 0;
        created: Date = new Date;
        modified: Date = new Date;

    }

    class Category extends BaseModel {
        constructor(public name: string, public title: string = '') {
            super();
            this.title = title || name;
        }
    }

    class Product extends BaseModel {
        constructor(public category: Category & Reference, public title: string) {
            super();
        }
    }

    const database = await databaseFactory([Product, Category]);
    {
        const category = new Category('cat1');
        const product = new Product(category, 'prod1');
        await database.persist(product);
    }

    {
        const product = await database.query(Product).findOne();
        expect(isReferenceInstance(product.category)).toBe(true);
        await database.persist(product);
    }
});

test('deep join population', async () => {
    @entity.name('product')
    class Product {
        id: number & PrimaryKey & AutoIncrement = 0;

        constructor(
            public title: string,
            public price: number,
        ) {
        }
    }

    @entity.name('basketEntry')
    class BasketItem {
        id: UUID & PrimaryKey = uuid();

        constructor(
            public basket: Basket & Reference,
            public product: Product & Reference,
            public amount: number = 1,
        ) {
        }
    }

    @entity.name('basket')
    class Basket {
        id: number & PrimaryKey & AutoIncrement = 0;
        items: BasketItem[] & BackReference = [];
    }

    const database = await databaseFactory([Product, BasketItem, Basket]);

    {
        const basket = new Basket();
        const product = new Product('prod1', 10);
        basket.items.push(new BasketItem(basket, product));
        basket.items.push(new BasketItem(basket, product));
        await database.persist(basket, product, ...basket.items);
    }

    {
        const basket = await database.query(Basket).useJoinWith('items').joinWith('product').end().findOne();
        expect(basket).toBeInstanceOf(Basket);
        expect(basket.items[0]).toBeInstanceOf(BasketItem);
        expect(basket.items[1]).toBeInstanceOf(BasketItem);
        expect(basket.items[0].product).toBeInstanceOf(Product);
        expect(basket.items[1].product).toBeInstanceOf(Product);
    }

    {
        const basket = await database.query(Basket)
            .joinWith('items', v => v.joinWith('product'))
            .findOne();
        expect(basket).toBeInstanceOf(Basket);
        expect(basket.items[0]).toBeInstanceOf(BasketItem);
        expect(basket.items[1]).toBeInstanceOf(BasketItem);
        expect(basket.items[0].product).toBeInstanceOf(Product);
        expect(basket.items[1].product).toBeInstanceOf(Product);
    }
});

test('joinWith', async () => {
    class MyEntity {
        ref?: MyEntity & Reference;
        refs?: MyEntity[] & BackReference;

        constructor(public id: number & PrimaryKey) {
        }
    }

    const database = await databaseFactory([MyEntity]);
    const entity1 = new MyEntity(1);
    const entity2 = new MyEntity(2);
    entity1.ref = entity2;
    await database.persist(entity1, entity2);

    const result = await database
        .query(MyEntity)
        .joinWith('ref')
        .joinWith('refs')
        .orderBy('id')
        .find();

    expect(result[0].id).toBe(1);
    expect(result[0].ref).toBe(result[1]);
    expect(result[0].refs).toEqual([]);


    expect(result[1].id).toBe(2);
    expect(result[1].ref).toBe(undefined);
    expect(result[1].refs![0]).toBe(result[0]);
    expect(result[1].refs![1]).toBe(undefined);

    expect(serialize<MyEntity[]>(result)).toEqual([
        {
            id: 1,
            ref: {
                id: 2,
                ref: null,
                refs: [undefined], //circular ref is serialised as undefined
            },
            refs: [],
        },
        {
            id: 2,
            ref: null,
            refs: [{ id: 1, ref: undefined, refs: [] }], //circular ref is serialised as undefined
        },
    ]);
});

test('self-reference serialization', async () => {
    class MyEntity {
        ref?: MyEntity & Reference;

        constructor(public id: number & PrimaryKey) {
        }
    }

    const database = await databaseFactory([MyEntity]);

    const entity = new MyEntity(1);
    entity.ref = new MyEntity(2);
    await database.persist(entity);

    const entities = await database.query(MyEntity).orderBy('id').find();

    expect(serialize<MyEntity[]>(entities)).toEqual([
        { id: 1, ref: 2 },
        { id: 2, ref: null },
    ]);
});

test('union object property', async () => {
    interface ServerConfigLocal {
        type: 'local';
    }

    interface ServerConfigRemote {
        type: 'remote';
        host: string;
    }

    type ServerConfig = ServerConfigLocal | ServerConfigRemote;

    class AppNode {
        id: number & PrimaryKey & AutoIncrement = 0;
        config: ServerConfig = { type: 'local' };
    }

    const database = await databaseFactory([AppNode]);

    {
        const node = new AppNode();
        await database.persist(node);
        const db = await database.query(AppNode).filter({ id: node.id }).findOne();
        expect(db.config).toEqual({ type: 'local' });
    }

    {
        const node = new AppNode();
        node.config = { type: 'remote', host: 'localhost' };
        await database.persist(node);
        const db = await database.query(AppNode).filter({ id: node.id }).findOne();
        expect(db.config).toEqual({ type: 'remote', host: 'localhost' });
    }
});

test('uuid 2', async () => {
    @entity.name('image_uuid')
    class Image {
        id: UUID & PrimaryKey = uuid();

        constructor(public path: string) {
        }
    }

    const database = await databaseFactory([Image]);

    expect(await database.query(Image).count()).toBe(0);
    const image = new Image('/foo.jpg');
    await database.persist(image);
    expect(await database.query(Image).count()).toBe(1);
    expect(await database.query(Image).filter({ id: image.id }).count()).toBe(1);
});

test('uuid 3', async () => {
    @entity.name('userJoin_uuid')
    class User {
        id: UUID & PrimaryKey = uuid();
    }

    @entity.name('bookJoin_uuid')
    class Book {
        id: UUID & PrimaryKey = uuid();

        constructor(public owner: User & Reference) {
        }
    }

    const database = await databaseFactory([User, Book]);

    const user = new User();
    const book = new Book(user);
    await database.persist(book);

    {
        const session = database.createSession();
        const book2 = await session.query(Book).join('owner').findOne();
    }

    const extractor = getPrimaryKeyExtractor(ReflectionClass.from(User));
    const id = extractor(user);
    expect(typeof user.id).toBe('string');
    expect(id).toEqual({ id: user.id });

    const hasher = getPrimaryKeyHashGenerator(ReflectionClass.from(User));
    const hash = hasher(user);
    expect(hash).toContain(user.id);
});

test('unique constraint 1', async () => {
    class Model {
        id: number & PrimaryKey & AutoIncrement = 0;

        constructor(public username: string & Unique = '') {
        }
    }

    const database = await databaseFactory([Model]);

    await database.persist(new Model('peter'));
    await database.persist(new Model('paul'));

    {
        const m1 = new Model('peter');
        await expect(database.persist(m1)).rejects.toThrow('constraint failed');
        await expect(database.persist(m1)).rejects.toBeInstanceOf(UniqueConstraintFailure);
    }

    {
        const m1 = new Model('marie');
        const m2 = new Model('marie');
        await expect(database.persist(m1, m2)).rejects.toThrow('constraint failed');
        await expect(database.persist(m1, m2)).rejects.toBeInstanceOf(UniqueConstraintFailure);
    }

    {
        const m = await database.query(Model).filter({ username: 'paul' }).findOne();
        m.username = 'peter';
        await expect(database.persist(m)).rejects.toThrow('constraint failed');
        await expect(database.persist(m)).rejects.toBeInstanceOf(UniqueConstraintFailure);
    }

    {
        const p = database.query(Model).filter({ username: 'paul' }).patchOne({ username: 'peter' });
        await expect(p).rejects.toThrow('constraint failed');
        await expect(p).rejects.toBeInstanceOf(UniqueConstraintFailure);
    }
});

test('forward raw types', async () => {
    const database = await databaseFactory([]);

    const q1 = await database.raw<{ count1: number }>(sql`SELECT 42 AS count1`);
    const r1 = await q1.findOne();

    const q2 = await database.raw(sql`SELECT 42 AS count2`);
    const r2: any = await q2.findOne();

    expect(r1.count1).toEqual(r2.count2);
});

test('database field name with filter', async () => {
    class User {
        constructor(public id: UUID & PrimaryKey & DatabaseField<{ name: 'uuid' }>) {
        }
    }

    const database = await databaseFactory([User]);

    const user = new User(uuid());

    await database.persist(user);

    {
        const dbUser = await database.query(User).filterField('id', user.id).findOne();
        expect(dbUser.id).toEqual(user.id);
    }
});

test('one to one', async () => {
    class PhoneNumber {
        id: number & PrimaryKey & AutoIncrement = 0;

        details?: SimDetails & BackReference;

        constructor(
            public msisdn: string,
        ) {
        }

        country: string = '';
        active: boolean = true;
    }

    class SimDetails {
        company?: Company & Reference;

        constructor(
            public number: PhoneNumber & Reference & PrimaryKey,
        ) {
        }

        iccid: string = '';
        imsi: string = '';
        pin: string = '';
        puk: string = '';
    }

    class Company {
        id: number & PrimaryKey & AutoIncrement = 0;

        constructor(public name: string) {
        }
    }

    const database = await databaseFactory([PhoneNumber, SimDetails, Company]);

    const phoneNumber = new PhoneNumber('1234567890');
    const simDetails = new SimDetails(phoneNumber);
    simDetails.iccid = 'ICCID1234567890';
    simDetails.imsi = 'IMSI1234567890';
    simDetails.pin = '1234';
    const company = new Company('MyCompany');
    simDetails.company = company;

    await database.persist(phoneNumber, simDetails, company);

    const result = await database.query(PhoneNumber).innerJoinWith('details', (details) => {
        return details.innerJoinWith('company', (company) => {
            return company.filter({ name: 'MyCompany' });
        });
    }).findOneOrUndefined();

    expect(result!.msisdn).toEqual('1234567890');
    expect(result!.details!.pin).toEqual('1234');
});

test('logger', async () => {
    class Entity {
        id: number & PrimaryKey & AutoIncrement = 0;
        constructor(public name: string) {
        }
    }

    const database = await databaseFactory([Entity]);
    const logger = new MemoryLogger();
    database.setLogger(logger);
    database.logger.setLevel('debug');

    await database.persist(new Entity('test1'));

    expect(logger.getOutput()).toContain(`INSERT INTO "Entity"`);
});
