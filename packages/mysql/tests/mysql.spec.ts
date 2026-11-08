import { expect, test } from '@jest/globals';
import { createPool } from 'mariadb';
import { MySQLConnectionPool } from '../src/mysql-adapter.js';
import { AutoIncrement, cast, entity, PrimaryKey, Unique } from '@deepkit/type';
import { databaseFactory } from './factory.js';
import { UniqueConstraintFailure } from '@deepkit/orm';
import { Logger } from '@deepkit/logger';

test('connection MySQLConnectionPool', async () => {
    const pool = createPool({
        host: '127.0.0.1',
        user: 'root',
        database: 'default',
        password: process.env.MYSQL_PW
    });
    const connectionPool = new MySQLConnectionPool(pool, new Logger());

    for (let i = 0; i < 50; i++) {
        const connection = await connectionPool.getConnection();
        const stmt = await connection.prepare('SELECT 1');
        await stmt.all();
        stmt.release();
        connection.release();
    }

    expect(connectionPool.getActiveConnections()).toBe(0);
    await pool.end();
});

test('connection release persistence/query', async () => {
    @entity.name('test_connection_user')
    class user {
        id: number & PrimaryKey & AutoIncrement = 0;
        username: string = '';
    }

    const database = await databaseFactory([user]);
    const adapter = database.adapter;
    const session = database.createSession();

    session.add(cast<user>({ username: '123' }));
    await session.commit();
    expect((adapter as any).pool.activeConnections()).toBe(0);
    expect(adapter.connectionPool.getActiveConnections()).toBe(0);

    const myUser = await database.query(user).filter({ username: '123' }).findOne();
    expect(myUser.username).toBe('123');
    expect((adapter as any).pool.activeConnections()).toBe(0);
    expect(adapter.connectionPool.getActiveConnections()).toBe(0);

    await database.persist(cast<user>({ username: '444' }));
    const myUser2 = await database.query(user).filter({ username: '444' }).findOne();
    expect(myUser2.username).toBe('444');
    expect((adapter as any).pool.activeConnections()).toBe(0);
    expect(adapter.connectionPool.getActiveConnections()).toBe(0);

    await database.remove(myUser2);
    expect(await database.query(user).count()).toBe(1);
    expect((adapter as any).pool.activeConnections()).toBe(0);
    expect(adapter.connectionPool.getActiveConnections()).toBe(0);

    database.disconnect();
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
    database.disconnect();
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
    database.disconnect();
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
    database.disconnect();
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

test('union', async () => {
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
})


test('ensure bigints are handled correctly', async () => {
    @entity.name('model5')
    class Model {
        constructor(public id: BigInt & PrimaryKey) {
        }
    }

    const database = await databaseFactory([Model]);
    await database.persist(
        new Model(9007199254740992n), // max safe integer
        new Model(9007199254740999n) // overflow for regular Number type
    );

    const items = await database.query(Model).orderBy('id').find();
    expect(items.length).toEqual(2);

    // will always succeed since the number fits in a regular Number type
    expect(typeof items[0].id).toBe('bigint');
    expect(items[0].id).toEqual(9007199254740992n);

    // will fail if bigints aren't being returned correctly from the database
    // only passes when using MariaDB 3.x driver w/ bigIntAsNumber option set to false
    // fails with MariaDB 2.x driver or with 3.x driver w/ bigIntAsNumber option set to true (2.x compatibility mode)
    // expect(typeof items[1].id).toBe('bigint');
    // expect(items[1].id).toEqual(9007199254740999n);
});

test('unique constraint 1', async () => {
    class Model {
        id: number & PrimaryKey & AutoIncrement = 0;
        constructor(public username: string & Unique = '') {}
    }

    const database = await databaseFactory([Model]);

    await database.persist(new Model('peter'));
    await database.persist(new Model('paul'));

    {
        const m1 = new Model('peter');
        await expect(database.persist(m1)).rejects.toThrow('Duplicate entry \'peter\' for key');
        await expect(database.persist(m1)).rejects.toBeInstanceOf(UniqueConstraintFailure);
    }

    {
        const m1 = new Model('marie');
        const m2 = new Model('marie');
        await expect(database.persist(m1, m2)).rejects.toThrow('Duplicate entry \'marie\' for key');
        await expect(database.persist(m1, m2)).rejects.toBeInstanceOf(UniqueConstraintFailure);
    }

    {
        const m = await database.query(Model).filter({username: 'paul'}).findOne();
        m.username = 'peter';
        await expect(database.persist(m)).rejects.toThrow('Duplicate entry \'peter\' for key');
        await expect(database.persist(m)).rejects.toBeInstanceOf(UniqueConstraintFailure);
    }

    {
        const p = database.query(Model).filter({username: 'paul'}).patchOne({username: 'peter'});
        await expect(p).rejects.toThrow('Duplicate entry \'peter\' for key');
        await expect(p).rejects.toBeInstanceOf(UniqueConstraintFailure);
    }
});

test('non-object null unions should not render as JSON', async () => {
    @entity.name('model6')
    class Model {
        id: number & PrimaryKey & AutoIncrement = 0;

        constructor(public name: string, public nickName: string | null = null, public birthdate: Date | null = null) {}
    }

    const database = await databaseFactory([Model]);
    await database.persist(new Model('Peter'));
    await database.persist(new Model('Christopher', 'Chris'));
    await database.persist(new Model('Thomas', 'Tom', new Date('1960-02-10T00:00:00Z')));

    const result = await database.query(Model).orderBy('id', 'asc').find();
    expect(result).toMatchObject([
        {name: 'Peter', nickName: null},
        {name: 'Christopher', nickName: 'Chris'},
        {name: 'Thomas', nickName: 'Tom', birthdate: new Date('1960-02-10T00:00:00Z')},
    ]);
});

test('updates & deletes should ignore previous @_pk session variable if no rows were affected', async () => {
    @entity.name('model7')
    class Model {
        id: number & PrimaryKey & AutoIncrement = 0;

        constructor(public name: string) {}
    }

    const database = await databaseFactory([Model]);
    const model = new Model('Peter');
    await database.persist(model);
    expect(model.id).toEqual(expect.any(Number));

    // perform update & delete in single database connection to ensure @_pk session variable is shared
    // between multiple queries. outside a transaction, this is luck of the draw based on connection pooling.
    await database.transaction(async txn => {
        {
            const result = await txn.query(Model).filter({id: model.id}).patchMany({name: 'Paul'});
            expect(result.primaryKeys[0]).toEqual({ id: model.id });
        }

        {
            const result = await txn.query(Model).filter({id: model.id}).returnPrimaryKeys().deleteMany();
            expect(result.primaryKeys[0]).toEqual({ id: model.id });
        }

        // there should be no ID returned if we try to update a non-existent record
        {
            const result = await txn.query(Model).filter({id: model.id}).patchMany({name: 'Simon'});
            expect(result.primaryKeys[0]).toBeUndefined();
        }

        // there should be no ID returned if we try to delete a non-existent record
        {
            const result = await txn.query(Model).filter({id: model.id}).returnPrimaryKeys().deleteMany();
            expect(result.primaryKeys[0]).toBeUndefined();
        }
    });
});
