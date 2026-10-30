import { expect, test } from '@jest/globals';
import pg from 'pg';
import { assertInstanceOf } from '@deepkit/core';
import { Database, DatabaseError, DatabaseInsertError, UniqueConstraintFailure } from '@deepkit/orm';
import { sql } from '@deepkit/sql';
import { AutoIncrement, cast, DatabaseField, entity, PrimaryKey, Reference, Unique, UUID, uuid } from '@deepkit/type';

import { PostgresDatabaseAdapter } from '../src/postgres-adapter.js';
import { databaseFactory } from './factory.js';
import { ConsoleLogger } from '@deepkit/logger';


test('count', async () => {
    const pool = new pg.Pool({
        host: 'localhost',
        database: 'postgres',
        user: 'postgres',
    });

    pg.types.setTypeParser(1700, parseFloat);
    pg.types.setTypeParser(20, BigInt);

    (BigInt.prototype as any).toJSON = function() {
        return this.toString();
    };

    const connection = await pool.connect();

    {
        const count = (await connection.query('SELECT 1.55 as count')).rows[0].count;
        expect(count).toBe(1.55);
    }

    {
        const count = (await connection.query('SELECT COUNT(*) as count FROM (select 1) as tmp')).rows[0].count;
        expect(count).toBe(1n);
    }
});

test('bool and json', async () => {
    @entity.name('model1')
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
        expect(sql.sql).toContain(' FOR UPDATE');
    }

    {
        const query = database.query(Model).forShare();
        const sql = database.adapter.createSelectSql(query);
        expect(sql.sql).toContain(' FOR SHARE');
    }

    const items = await database.query(Model).forUpdate().find();
    expect(items).toHaveLength(2);
});

test('json field and query', async () => {
    @(entity.name('product').collection('products'))
    class Product {
        id: number & PrimaryKey & AutoIncrement = 0;
        raw?: { [key: string]: any };
    }

    const database = await databaseFactory([Product]);

    await database.persist(cast<Product>({ raw: { productId: 1, name: 'first' } }));
    await database.persist(cast<Product>({ raw: { productId: 2, name: 'second' } }));

    {
        const res = await database.query(Product).filter({ 'raw.productId': 1 }).find();
        expect(res).toMatchObject([{ id: 1, raw: { productId: 1, name: 'first' } }]);
    }

    {
        const res = await database.query(Product).filter({ 'raw.productId': 2 }).find();
        expect(res).toMatchObject([{ id: 2, raw: { productId: 2, name: 'second' } }]);
    }
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
        await expect(database.persist(m1)).rejects.toThrow('Key (username)=(peter) already exists');
        await expect(database.persist(m1)).rejects.toBeInstanceOf(UniqueConstraintFailure);

        try {
            await database.persist(m1);
        } catch (error: any) {
            assertInstanceOf(error, UniqueConstraintFailure);
            assertInstanceOf(error.cause, DatabaseInsertError);
            assertInstanceOf(error.cause.cause, DatabaseError);
            // error.cause.cause.cause is from the driver
            expect((error.cause.cause.cause as any).table).toBe('Model');
        }
    }

    {
        const m1 = new Model('marie');
        const m2 = new Model('marie');
        await expect(database.persist(m1, m2)).rejects.toThrow('Key (username)=(marie) already exists');
        await expect(database.persist(m1, m2)).rejects.toBeInstanceOf(UniqueConstraintFailure);
    }

    {
        const m = await database.query(Model).filter({ username: 'paul' }).findOne();
        m.username = 'peter';
        await expect(database.persist(m)).rejects.toThrow('Key (username)=(peter) already exists');
        await expect(database.persist(m)).rejects.toBeInstanceOf(UniqueConstraintFailure);
    }

    {
        const p = database.query(Model).filter({ username: 'paul' }).patchOne({ username: 'peter' });
        await expect(p).rejects.toThrow('Key (username)=(peter) already exists');
        await expect(p).rejects.toBeInstanceOf(UniqueConstraintFailure);
    }
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

test('json array', async () => {
    type Block = { type: string, data: any };

    class Model {
        id: number & PrimaryKey & AutoIncrement = 0;
        blocks: any[] = [];
        createdAt: Date = new Date();
        updatedAt: Date = new Date();

        publishedAt: Date = new Date(0);
        published: boolean = false;

        slug: string = '';
        title: string = '';
    }

    const database = await databaseFactory([Model]);
    const logger = new ConsoleLogger();
    logger.setLevel('debug');
    database.setLogger(logger);

    {
        const model = new Model();
        model.title = '13';
        model.blocks = [{ type: 'a', data: { yes: 1 } }];
        await database.persist(model);
    }

    {
        const model = await database.query(Model).findOne();
        model.title = '14';
        model.blocks = [{ type: 'a', data: { yes: 0 } }, { type: 'a', data: { no: '23' } }];
        await database.persist(model);
    }
    {
        const model = await database.query(Model).findOne();
        expect(model.title).toBe('14');
        expect(model.blocks.length).toEqual(2);
    }
});

test('migrate creates tables before foreign keys pointing to later entities', async () => {
    // database.migrate() ran the DDL entity by entity, so the FK of an entity registered before
    // its referenced entity was added before that table existed: relation "migrate_fk_address" does not exist.
    @entity.name('migrate_fk_user')
    class User {
        id: number & PrimaryKey & AutoIncrement = 0;
        address?: Address & Reference;
    }

    @entity.name('migrate_fk_address')
    class Address {
        id: number & PrimaryKey & AutoIncrement = 0;
        street: string = '';
    }

    const adapter = new PostgresDatabaseAdapter({ host: 'localhost', database: 'postgres', user: 'postgres' });
    const database = new Database(adapter, [User, Address]);
    try {
        await database.raw(sql`DROP TABLE IF EXISTS migrate_fk_user, migrate_fk_address CASCADE`).execute();
        await database.migrate();

        const address = new Address();
        address.street = 'Main';
        const user = new User();
        user.address = address;
        await database.persist(address, user);
        const loaded = await database.query(User).joinWith('address').findOne();
        expect(loaded.address!.street).toBe('Main');
    } finally {
        database.disconnect();
    }
});
