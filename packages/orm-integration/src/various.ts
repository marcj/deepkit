import { expect } from '@jest/globals';
import {
    AutoIncrement,
    BackReference,
    cast,
    DatabaseField,
    entity,
    isReferenceInstance,
    PrimaryKey,
    Reference,
    Unique,
    uuid,
    UUID,
} from '@deepkit/type';
import { identifier, sql, SQLDatabaseAdapter } from '@deepkit/sql';
import { DatabaseFactory } from './test.js';
import { hydrateEntity, isDatabaseOf, UniqueConstraintFailure } from '@deepkit/orm';
import { randomBytes } from 'crypto';

Error.stackTraceLimit = 20;

export const variousTests = {
    async testFilterUndefinedIsNotEmptyFilter(databaseFactory: DatabaseFactory) {
        // { name: undefined } means "name is not set", it must never become {} which matches everything (#692)
        @entity.name('test_filter_undefined')
        class Item {
            id: number & PrimaryKey & AutoIncrement = 0;
            name: string = '';
            opt?: string;
        }

        const database = await databaseFactory([Item]);
        await database.persist(cast<Item>({ name: 'a' }), cast<Item>({ name: 'b', opt: 'x' }));
        const names = async (filter: any) => (await database.query(Item).filter(filter).orderBy('name').find()).map(v => v.name);

        expect(await names({})).toEqual(['a', 'b']);
        expect(await names({ name: undefined })).toEqual([]);
        expect(await names({ id: undefined })).toEqual([]);
        expect(await names({ opt: undefined })).toEqual(['a']);
        expect(await names({ name: 'b', opt: undefined })).toEqual([]);
        expect(await database.query(Item).filter({ name: undefined } as any).count()).toBe(0);

        await database.query(Item).filter({ name: undefined } as any).deleteMany();
        await database.query(Item).filter({ id: undefined } as any).patchMany({ name: 'changed' });
        expect(await names({})).toEqual(['a', 'b']);
    },
    async testOneToOneCircularReferenceRelation(databaseFactory: DatabaseFactory) {
        @entity.name('totocrr_inventory')
        class Inventory {
            id: number & PrimaryKey & AutoIncrement = 0;
            constructor(public user: User & Reference) {}
        }

        @entity.name('totocrr_user')
        class User {
            id: number & PrimaryKey & AutoIncrement = 0;
            inventory: Inventory & BackReference = new Inventory(this);
        }

        const database = await databaseFactory([Inventory, User]);

        const user = cast<User>({});

        await database.persist(user.inventory, user);
    },
    async testSkipDatabaseFieldForInserts(databaseFactory: DatabaseFactory) {
        @entity.name('test_skip_database_field_insert')
        class User {
            id: number & PrimaryKey & AutoIncrement = 0;
            username?: string & DatabaseField<{ skip: true }>
        }

        const database = await databaseFactory([User]);

        const user = cast<User>({ username: 'peter' });

        await database.persist(user);

        {
            const result = await database.query(User).findOne();
            expect(result.id).toBe(1)
            expect(result).not.toHaveProperty('username');
        }
    },
    async testRawQuery(databaseFactory: DatabaseFactory) {
        @entity.name('test_connection_user')
        class user {
            id: number & PrimaryKey & AutoIncrement = 0;
            username!: string;
        }

        const database = await databaseFactory([user]);

        if (!isDatabaseOf(database, SQLDatabaseAdapter)) return;

        await database.persist(cast<user>({ username: 'peter' }));
        await database.persist(cast<user>({ username: 'marie' }));

        type Count = {count: number};

        {
            const result = await database.raw<Count>(sql`SELECT count(*) as count
                                                  FROM ${user}`).findOne();
            expect(result.count).toBe(2);
        }

        {
            const result = await database.createSession().raw<Count>(sql`SELECT count(*) as count
                                                                  FROM ${user}`).findOne();
            expect(result.count).toBe(2);
        }

        {
            const id = 1;
            const result = await database.createSession().raw<Count>(sql`SELECT count(*) as count
                                                                  FROM ${user}
                                                                  WHERE id > ${id}`).findOne();
            expect(result.count).toBe(1);
        }

        {
            const result = await database.raw<user>(sql`SELECT * FROM ${user}`).find();
            expect(result).toEqual([
                { id: 1, username: 'peter' },
                { id: 2, username: 'marie' },
            ]);
        }

        {
            const result = await database.createSession().raw<user>(sql`SELECT * FROM ${user}`).find();
            expect(result).toEqual([
                { id: 1, username: 'peter' },
                { id: 2, username: 'marie' },
            ]);
        }

        await database.raw(sql`DELETE FROM ${user}`).execute();

        {
            const result = await database.raw<Count>(sql`SELECT count(*) as count FROM ${user}`).findOne();
            expect(result.count).toBe(0);
        }
        database.disconnect();
    },
    async testRawWhere(databaseFactory: DatabaseFactory) {
        @entity.name('test_connection_user')
        class user {
            id: number & PrimaryKey & AutoIncrement = 0;
            username!: string;
        }

        const database = await databaseFactory([user]);
        if (!isDatabaseOf(database, SQLDatabaseAdapter)) return;

        if (isDatabaseOf(database, SQLDatabaseAdapter)) {
            await database.persist(cast<user>({ username: 'peter' }), cast<user>({ username: 'marie' }), cast<user>({ username: 'mueller' }));

            {
                const result = await database.query(user).where(sql`id > 1`).findOne();
                expect(result).toMatchObject({ id: 2, username: 'marie' });
            }

            {
                const id = 1;
                const result = await database.query(user).where(sql`id = ${id}`).findOne();
                expect(result).toMatchObject({ id: 1, username: 'peter' });
            }

            {
                const id = 3;
                const result = await database.query(user).filter({ id: { $gt: 1 } })
                    .where(sql`${identifier('id')} < ${id}`).find();
                expect(result).toMatchObject([{ id: 2, username: 'marie' }]);
            }

            {
                const result = await database.query(user).withSum('id', 'countUsers').withMax('id', 'maxId').withMin('id').findOne();
                expect(result.countUsers).toBe(1 + 2 + 3);
                expect(result.maxId).toBe(3);
                expect(result.id).toBe(1);
            }

            {
                const result = await database.query(user).sqlSelect(sql`count(*) as count`).findOne();
                expect(result.count).toBe(3);
            }
        }
        database.disconnect();
    },
    async testSelfReference(databaseFactory: DatabaseFactory) {
        @(entity.name('explorer/block').collection('blocks'))
        class ExplorerBlock {
            public id: number & PrimaryKey & AutoIncrement = 0;

            level: number = 0;
            transactions: number = 0;

            constructor(
                public hash: Uint8Array,
                public created: Date,
                public previous?: ExplorerBlock & Reference
            ) {
            }
        }

        const database = await databaseFactory([ExplorerBlock]);
        const session = database.createSession();

        let previous: ExplorerBlock | undefined = undefined;

        for (let i = 0; i < 10; i++) {
            previous = new ExplorerBlock(randomBytes(16), new Date, previous);

            previous.level = Math.ceil(Math.random() * 1000);
            previous.transactions = Math.ceil(Math.random() * 1000);
            session.add(previous);
        }

        await session.commit();

        expect(await database.query(ExplorerBlock).count()).toBe(10);

        const blocks = await database.query(ExplorerBlock).sort({ id: 'desc' }).find();

        for (const block of blocks) {
            expect(isReferenceInstance(block)).toBe(false);
            if (block.previous) {
                expect(block.previous).toBeInstanceOf(ExplorerBlock);
                expect(isReferenceInstance(block.previous)).toBe(true);
            }
            expect(block.level).toBeGreaterThan(0);
        }
        database.disconnect();
    },
    async transactionSimple(databaseFactory: DatabaseFactory) {
        @entity.collection('users')
        class User {
            public id: number & AutoIncrement & PrimaryKey = 0;

            constructor(public username: string) {
            }
        }

        const database = await databaseFactory([User]);

        {
            await database.query(User).deleteMany();
            await database.persist(new User('user1'));
            const session = database.createSession();
            session.useTransaction();
            const user = await session.query(User).findOne();
            expect(user.username).toBe('user1');

            expect(session.hasTransaction()).toBe(true);

            user.username = 'user1 changed';
            await session.flush(); //no transaction commit
            expect(session.hasTransaction()).toBe(true);

            expect(await session.query(User).filter({ username: 'user1 changed' }).has()).toBe(true);

            //in another connection we still have the old changed
            expect(await database.query(User).filter({ username: 'user1 changed' }).has()).toBe(false);

            await session.commit();
            expect(session.hasTransaction()).toBe(false);

            //in another connection we now have the changes
            expect(await database.query(User).filter({ username: 'user1 changed' }).has()).toBe(true);
        }

        {
            await database.query(User).deleteMany();
            await database.persist(new User('user1'));
            const session = database.createSession();
            session.useTransaction();
            const user = await session.query(User).findOne();
            expect(user.username).toBe('user1');

            user.username = 'user1 changed';
            await session.flush(); //no transaction commit

            expect(await session.query(User).filter({ username: 'user1 changed' }).has()).toBe(true);

            //in another connection we still have the old changed
            expect(await database.query(User).filter({ username: 'user1 changed' }).has()).toBe(false);

            await session.rollback();
            expect(session.hasTransaction()).toBe(false);

            //user1 changed is not there anymore
            expect(await session.query(User).filter({ username: 'user1 changed' }).has()).toBe(false);

            //in another connection still user1 is not changed.
            expect(await database.query(User).filter({ username: 'user1 changed' }).has()).toBe(false);
        }

        {
            await database.query(User).deleteMany();
            await database.createSession().transaction(async (session) => {
                session.add(new User('user 1'), new User('user 2'), new User('user 3'));
            });
            expect(await database.query(User).count()).toBe(3);
        }

        {
            await database.query(User).deleteMany();
            expect(await database.query(User).count()).toBe(0);
            await database.createSession().transaction(async (session) => {
                session.add(new User('user 1'), new User('user 2'), new User('user 3'));
                await session.flush();

                expect(await session.query(User).count()).toBe(3);

                //not yet committed
                expect(await database.query(User).count()).toBe(0);
            });
            expect(await database.query(User).count()).toBe(3);
        }

        {
            await database.query(User).deleteMany();
            expect(await database.query(User).count()).toBe(0);
            await database.transaction(async (session) => {
                session.add(new User('user 1'), new User('user 2'), new User('user 3'));
                await session.flush();

                expect(await session.query(User).count()).toBe(3);

                //not yet committed
                expect(await database.query(User).count()).toBe(0);
            });
            expect(await database.query(User).count()).toBe(3);
        }

        {
            //empty transaction
            const session = database.createSession();
            session.useTransaction();
            await session.commit();
        }

        {
            //empty transaction
            const session = database.createSession();
            session.useTransaction();
            await session.rollback();
        }

        {
            //empty transaction
            const session = database.createSession();
            await database.createSession().transaction(async (session) => {

            });
        }
        database.disconnect();
    },
    async uniqueConstraintFailure(databaseFactory: DatabaseFactory) {
        @entity.collection('usersConstraints')
        class User {
            public id: number & PrimaryKey & AutoIncrement = 0;

            constructor(public username: string & Unique) {
            }
        }

        const database = await databaseFactory([User]);

        await database.persist(new User('Peter'));

        await expect(async () => {
            await database.persist(new User('Peter'));
        }).rejects.toThrow(UniqueConstraintFailure);

        await expect(async () => {
            const session = database.createSession();
            session.add(new User('Peter'));
            await session.commit();
        }).rejects.toThrow(UniqueConstraintFailure);

        await expect(async () => {
            await database.persist(new User('Peter2'));
            await database.query(User).filter({ username: 'Peter2' }).patchOne({ username: 'Peter' });
        }).rejects.toThrow(UniqueConstraintFailure);
        database.disconnect();
    },
    async emptyEntity(databaseFactory: DatabaseFactory) {
        @entity.name('empty-entity')
        class EmptyEntity {
            id: number & PrimaryKey & AutoIncrement = 0;
        }

        const database = await databaseFactory([EmptyEntity]);

        await expect(database.persist(new EmptyEntity())).resolves.not.toThrow();
    },
    async findOneWithRelation(databaseFactory: DatabaseFactory) {
        @entity.name('bookshelf')
        class BookShelf {
            id: number & PrimaryKey & AutoIncrement = 0;
            books: Book[] & BackReference = [];
        }

        @entity.name('book')
        class Book {
            id: number & PrimaryKey & AutoIncrement = 0;

            constructor(public bookShelf?: BookShelf & Reference) {
            }
        }

        const database = await databaseFactory([Book, BookShelf]);

        const bookShelf = new BookShelf();
        await database.persist(bookShelf, new Book(bookShelf), new Book(bookShelf), new Book(bookShelf));

        const shelf = await database.query(BookShelf).joinWith('books').findOne();
        expect(shelf.books.length).toBe(3);
    },
    async likeOperator(databaseFactory: DatabaseFactory) {
        class Model {
            id: number & PrimaryKey & AutoIncrement = 0;

            constructor(public username: string) {
            }
        }

        const database = await databaseFactory([Model]);
        await database.query(Model).deleteMany();

        await database.persist(new Model('Peter2'), new Model('Peter3'), new Model('Marie'));

        {
            const items = await database.query(Model)
                .filter({ username: { $like: 'Peter%' } }).orderBy('username').find();
            expect(items).toHaveLength(2);
            expect(items).toMatchObject([{ username: 'Peter2' }, { username: 'Peter3' }]);
        }

        {
            const items = await database.query(Model)
                .filter({ username: { $like: 'Pet%' } }).orderBy('username').find();
            expect(items).toHaveLength(2);
            expect(items).toMatchObject([{ username: 'Peter2' }, { username: 'Peter3' }]);
        }

        {
            const items = await database.query(Model)
                .filter({ username: { $like: 'Peter_' } }).orderBy('username').find();
            expect(items).toHaveLength(2);
            expect(items).toMatchObject([{ username: 'Peter2' }, { username: 'Peter3' }]);
        }

        {
            const items = await database.query(Model)
                .filter({ username: { $like: '%r%' } }).orderBy('username').find();
            expect(items).toHaveLength(3);
            expect(items).toMatchObject([ { username: 'Marie' }, { username: 'Peter2' }, { username: 'Peter3' }]);
        }

        {
            await database.query(Model).filter({ username: { $like: 'Mar%' } }).patchOne({ username: 'Marie2' });
            const items = await database.query(Model).orderBy('username').find();
            expect(items).toMatchObject([ { username: 'Marie2' }, { username: 'Peter2' }, { username: 'Peter3' } ]);
        }
    },
    async deepObjectPatch(databaseFactory: DatabaseFactory) {
        class FullName {
            forename: string = '';
            surname: string = '';
            changes: number = 0;
        }

        class Person {
            id: number & PrimaryKey & AutoIncrement = 0;
            name: FullName = new FullName();
        }

        const db = await databaseFactory([Person]);

        const person1 = new Person();
        person1.name.forename = 'Max';
        person1.name.surname = 'Mustermann';

        const person2 = new Person();
        person2.name.forename = 'Max';
        person2.name.surname = 'Meier';

        await db.persist(person1, person2);

        await db.query(Person)
            .filter({ 'name.surname': 'Meier' })
            .patchOne({ 'name.forename': 'Klaus' });

        await db.query(Person)
            .filter({ 'name.surname': 'Meier' })
            .patchOne({ $inc: { 'name.changes': 1 } });

        const person = await db.query(Person).filter({ 'name.surname': 'Meier' }).findOne();
        expect(person.name.forename).toEqual('Klaus');
        expect(person.name.changes).toEqual(1);
    },
    async deepArrayPatch(databaseFactory: DatabaseFactory) {
        class Address {
            name: string = '';
            street: string = '';
            zip: string = '';
        }

        class Person {
            id: number & PrimaryKey & AutoIncrement = 0;
            tags: string[] = [];
            addresses: Address[] = [];
        }

        const db = await databaseFactory([Person]);

        const person1 = new Person();
        person1.tags = ['a', 'b'];
        person1.addresses = [{ name: 'home', street: 'street1', zip: '1234' }];

        const person2 = new Person();
        person2.tags = ['c', 'd'];

        await db.persist(person1, person2);

        await db.query(Person)
            .filter(person1)
            .patchOne({ 'addresses.0.zip': '5678' });

        const person = await db.query(Person).filter(person1).findOne();
        expect(person.addresses).toEqual([{ name: 'home', street: 'street1', zip: '5678' }]);
    },

    async anyType(databaseFactory: DatabaseFactory) {
        class Page {
            id: number & PrimaryKey & AutoIncrement = 0;

            constructor(public content: any) {
            };
        }

        const db = await databaseFactory([Page]);

        await db.persist(new Page([{ insert: 'abc\n' }]));

        db.disconnect();
    },

    async arrayElement(databaseFactory: DatabaseFactory) {
        //this tests that the array element type is correctly serialized
        class Page {
            id: number & PrimaryKey & AutoIncrement = 0;

            constructor(public content: { id: UUID, insert: string, attributes?: { [name: string]: any } }[]) {
            };
        }

        const db = await databaseFactory([Page]);
        const myId = uuid();

        await db.persist(new Page([{ id: myId, insert: 'abc\n', attributes: { header: 1 } }]));

        const page = await db.query(Page).findOne();
        expect(page.content[0]).toEqual({ id: myId, insert: 'abc\n', attributes: { header: 1 } });

        db.disconnect();
    },

    async lazyLoad(databaseFactory: DatabaseFactory) {
        class Page {
            id: number & PrimaryKey & AutoIncrement = 0;
            title: string = '';
            content: Uint8Array = new Uint8Array();
        }

        const db = await databaseFactory([Page]);

        {
            const page = new Page();
            page.title = 'test';
            page.content = new Uint8Array([1, 2, 3]);
            await db.persist(page);
        }

        const page = await db.query(Page).lazyLoad('content').findOne();
        expect(page.title).toBe('test');
        expect(() => page.content).toThrowError('Property Page.content was not populated. Remove lazyLoad(\'content\') or call \'await hydrateEntity(item)\'');

        await hydrateEntity(page);
        expect(page.content).toEqual(new Uint8Array([1, 2, 3]));

        db.disconnect();
    },

    async emptyPatch(databaseFactory: DatabaseFactory) {
        @entity.name('model5')
        class Model {
            firstName: string = '';

            constructor(public id: number & PrimaryKey) {
            }
        }

        const database = await databaseFactory([Model]);
        await database.persist(new Model(1), new Model(2));

        {
            const result = await database
                .query(Model)
                .filter({ id: { $gt: 5 } })
                .patchMany({ firstName: 'test' });
            expect(result.modified).toEqual(0);
            expect(result.primaryKeys.length).toEqual(0);
        }

        {
            const result = await database
                .query(Model)
                .filter({ id: { $gt: 1 } })
                .patchMany({ firstName: 'test' });
            expect(result.modified).toEqual(1);
            expect(result.primaryKeys).toEqual([{ id: 2 }]);
        }
    },

    async deepJoin(databaseFactory: DatabaseFactory) {
        class BaseModel {
            id: number & PrimaryKey & AutoIncrement = 0;
        }

        @entity.name('productCategory')
        class ProductCategory extends BaseModel {
            constructor(public name: string) {
                super();
            }
        }

        @entity.name('media')
        class MediaFile extends BaseModel {
            product?: Product & Reference;

            constructor(public file: string) {
                super();
            }
        }

        @entity.name('brand')
        class Brand extends BaseModel {
            constructor(public name: string) {
                super();
            }
        }

        @entity.name('product')
        class Product extends BaseModel {
            brand?: Brand & Reference;

            constructor(
                public sku: string,
            ) {
                super();
            }

            images?: MediaFile[] & BackReference;
        }

        @entity.name('productInCategory')
        class ProductInCategory extends BaseModel {
            constructor(public product: Product & Reference, public category: ProductCategory & Reference) {
                super();
            }
        }

        const database = await databaseFactory([Product, ProductCategory, ProductInCategory, MediaFile, Brand]);

        {
            const category1 = new ProductCategory('test1');
            const product1 = new Product('1');
            // const product = new Product('2');
            const image1 = new MediaFile('test1.jpg');
            image1.product = product1;
            const image2 = new MediaFile('test2.jpg');
            image2.product = product1;
            const brand = new Brand('abc');
            product1.brand = brand;
            const product2 = new Product('2');

            const category2 = new ProductCategory('test2');

            const productInCategory1 = new ProductInCategory(product1, category1);
            const productInCategory2 = new ProductInCategory(product1, category2);

            await database.persist(product1, product2, category1, productInCategory1, productInCategory2, image1, image2, brand);
        }

        {
            const products = await database.query(Product).joinWith('images').joinWith('brand').find();
            expect(products[0].images!.length).toBe(2);
        }

        {
            const products = await database.query(ProductInCategory).useInnerJoinWith('product').joinWith('images').joinWith('brand').end().find();
            expect(products[0].product === products[1].product).toBe(true);
            expect(products[0].product.images!.length).toBe(2);
            expect(products[1].product.images!.length).toBe(2);
        }
    },
    async nestedEmbeddedTypes(databaseFactory: DatabaseFactory) {
        class Country {
            name!: string;
            id!: string;
        }
        class Author {
            name!: string;
            country: Country = new Country();
        }

        @entity.collection('nested-entity')
        class Book {
            id!: number & PrimaryKey;
            name!: string;
            author: Author = new Author();
            anyType: any = {};
        }
        const database = await databaseFactory([Book]);

        {
            const book = new Book();
            book.id = 12345678;
            book.name = 'Book1';
            book.author.name = 'Author1';
            book.author.country.name = 'Country1';
            book.author.country.id = '1';
            book.anyType.test1 = '1';
            book.anyType.test2 = {deep1: '1'};
            await database.persist(book);
        }

        {
            const session = database.createSession();
            const book = await session.query(Book).filter({ id: 12345678 }).findOne();
            book.author.country.name = 'somewhere';
            book.anyType.test1 = '2';
            book.anyType.test2.deep1 = '2';
            await session.commit();
        }

        {
            const session = database.createSession();
            const book = await session.query(Book).filter({ id: 12345678 }).findOne();
            expect(book.author.country.name).toBe('somewhere');
            expect(book.anyType.test1).toBe('2');
            expect(book.anyType.test2.deep1).toBe('2');
        }
    },
    async union1(databaseFactory: DatabaseFactory) {
        @entity.name('union1_service')
        class Service {
            restartPolicy: 'always' | 'on-failure' | 'no' = 'always';
            ids: 23 | 42 = 23;
            complexUnion: { foo: string } | 54 = 54;
            doc: { name: string } | null = null;

            constructor(public id: number & PrimaryKey) {
            }
        }

        const database = await databaseFactory([Service]);

        {
            const service = new Service(1);
            service.restartPolicy = 'no';
            service.ids = 42;
            await database.persist(service);
        }
        {
            const service = new Service(2);
            service.complexUnion = { foo: 'bar' };
            service.doc = { name: 'peter' };
            await database.persist(service);
        }

        {
            const service = await database.query(Service).filter({ id: 1 }).findOne();
            expect(service.restartPolicy).toBe('no');
            expect(service.ids).toBe(42);
            expect(service.complexUnion).toBe(54);
        }

        {
            const service = await database.query(Service).filter({ id: 2 }).findOne();
            expect(service.restartPolicy).toBe('always');
            expect(service.ids).toBe(23);
            expect(service.complexUnion).toEqual({ foo: 'bar' });

            service.complexUnion = 54;
            service.ids = 42;
            service.restartPolicy = 'no';
            service.doc = null;
            await database.persist(service);

            const service2 = await database.query(Service).filter({ id: 2 }).findOne();
            expect(service2.restartPolicy).toBe('no');
            expect(service2.ids).toBe(42);
            expect(service2.complexUnion).toBe(54);
            expect(service2.doc).toBe(null);
        }

        {
            await database.query(Service)
                .filter({id: 2})
                .patchOne({
                    restartPolicy: 'no',
                    ids: 42,
                    complexUnion: 54,
                    doc: null,
                });
        }
    },
    async jsonNull(databaseFactory: DatabaseFactory) {
        @entity.name('jsonNull')
        class Model {
            doc: { name: string } | null = null;
            constructor(public id: number & PrimaryKey) {
            }
        }

        const database = await databaseFactory([Model]);

        {
            const m = new Model(1);
            m.doc = { name: 'Peter' };
            await database.persist(m);
        }
        {
            const m = new Model(2);
            m.doc = { name: 'Peter2' };
            await database.persist(m);
        }

        {
            const m = await database.query(Model).filter({id: 1}).findOne();
            expect(m).toMatchObject({ doc: { name: 'Peter' } });
            m.doc = null;
            await database.persist(m);
        }

        {
            // create with null JSON object
            const m = new Model(3);
            m.doc = null;
            await database.persist(m);
        }

        {
            const items = await database.query(Model).orderBy('id').find();
            expect(items.length).toBe(3);
            expect(items[0]).toMatchObject({ id: 1, doc: null });
            expect(items[1]).toMatchObject({ id: 2, doc: { name: 'Peter2' } });
            expect(items[2]).toMatchObject({ id: 3, doc: null });
        }

        {
            const items = await database.query(Model)
                .filter({doc: null}).orderBy('id').find();
            expect(items.length).toBe(2);
            expect(items[0]).toMatchObject({ id: 1, doc: null });
            expect(items[1]).toMatchObject({ id: 3, doc: null });
        }

        {
            const items = await database.query(Model)
                .filter({doc: {$ne: null}}).orderBy('id').find();
            expect(items.length).toBe(1);
            expect(items[0]).toMatchObject({ id: 2, doc: { name: 'Peter2' } });
        }
    },
    async jsonUndefined(databaseFactory: DatabaseFactory) {
        @entity.name('model5')
        class Model {
            doc?: { name: string };
            constructor(public id: number & PrimaryKey) {
            }
        }

        const database = await databaseFactory([Model]);

        {
            const m = new Model(1);
            m.doc = { name: 'Peter' };
            await database.persist(m);
        }
        {
            const m = new Model(2);
            m.doc = { name: 'Peter2' };
            await database.persist(m);
        }

        {
            const m = await database.query(Model).filter({id: 1}).findOne();
            expect(m).toMatchObject({ doc: { name: 'Peter' } });
            m.doc = undefined;
            await database.persist(m);
        }

        {
            // create with null JSON object
            const m = new Model(3);
            m.doc = undefined;
            await database.persist(m);
        }

        {
            const items = await database.query(Model).orderBy('id').find();
            expect(items.length).toBe(3);
            expect(items[0]).toMatchObject({ id: 1 });
            expect(items[0].doc).toBe(undefined);
            expect(items[1]).toMatchObject({ id: 2, doc: { name: 'Peter2' } });
            expect(items[2]).toMatchObject({ id: 3 });
            expect(items[2].doc).toBe(undefined);
        }

        {
            const items = await database.query(Model)
                .filter({doc: undefined}).orderBy('id').find();
            expect(items.length).toBe(2);
            expect(items[0]).toMatchObject({ id: 1 });
            expect(items[1]).toMatchObject({ id: 3 });
            expect(items[0].doc).toBe(undefined);
            expect(items[1].doc).toBe(undefined);
        }

        {
            const items = await database.query(Model)
                .filter({doc: {$ne: undefined}}).orderBy('id').find();
            expect(items.length).toBe(1);
            expect(items[0]).toMatchObject({ id: 2, doc: { name: 'Peter2' } });
        }
    },
    async remapName(databaseFactory: DatabaseFactory) {
        @entity.name('map_name_user')
        class User {
            id: number & PrimaryKey & AutoIncrement = 0;
            group?: Group & Reference & DatabaseField<{name: 'group_id'}>;

            constructor(public username: string) {}
        }

        @entity.name('map_name_group')
        class Group {
            id: number & PrimaryKey & AutoIncrement = 0;
            constructor(public name: string) {}
        }

        const database = await databaseFactory([User, Group]);
        {
            const group1 = new Group('admin');
            const group2 = new Group('users');
            const user = new User('peter');
            user.group = group1;
            await database.persist(user, group1, group2);
        }

        {
            const user = await database.query(User).joinWith('group').filter({username: 'peter'}).findOne();
            expect(user.group).toMatchObject({name: 'admin'});
            const userGroup = await database.query(Group).filter({name: 'users'}).findOne();
            user.group = userGroup;
            await database.persist(user);
        }

        {
            const user = await database.query(User).joinWith('group').filter({username: 'peter'}).findOne();
            expect(user.group).toMatchObject({name: 'users'});
        }

        {
            const userGroup = await database.query(Group).filter({name: 'users'}).findOne();
            const user = await database.query(User).joinWith('group').filter({group: userGroup}).findOne();
            expect(user).toMatchObject({username: 'peter'});
            expect(user.group).toMatchObject({name: 'users'});
        }
    }
};
