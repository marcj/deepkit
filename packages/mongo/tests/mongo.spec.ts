import { expect, jest, test } from '@jest/globals';
import { arrayBufferFrom, AutoIncrement, BackReference, cast, entity, MongoId, nodeBufferToArrayBuffer, PrimaryKey, Reference, ReflectionClass, ReflectionKind, serialize, Unique, UUID, uuid } from '@deepkit/type';
import { Database, getInstanceStateFromItem, UniqueConstraintFailure } from '@deepkit/orm';
import { SimpleModel, SuperSimple } from './entities.js';
import { createDatabase } from './utils.js';
import { MongoDatabaseAdapter } from '../src/adapter.js';
import { MemoryLogger } from '@deepkit/logger';
import { ObjectId } from '@deepkit/bson';

Error.stackTraceLimit = 100;
jest.setTimeout(10000);

test('logger', async () => {
    const database = new Database(new MongoDatabaseAdapter('mongodb://invalid-host'));
    const logger = new MemoryLogger();
    database.setLogger(logger);
    await expect(database.adapter.client.connect()).rejects.toThrow('Connection failed: no hosts available');
    expect(logger.memory.messageStrings[0]).toContain('Connection failed');
    database.disconnect();
});

test('test save undefined values', async () => {
    const database = await createDatabase('test save undefined values');

    @entity.name('undefined-model-value')
    class Model {
        _id: MongoId & PrimaryKey = '';

        constructor(public name?: string) {
        }
    }

    // const collection = await session.adapter.connection.getCollection(getClassSchema(Model));
    //
    // {
    //     await collection.deleteMany({});
    //     await db.persist(new Model(undefined));
    //     const mongoItem = await collection.find().toArray();
    //     expect(mongoItem[0].name).toBe(null);
    //     const marshalItem = await session.query(Model).findOne();
    //     expect(marshalItem.name).toBe(undefined);
    // }
    //
    // {
    //     await collection.deleteMany({});
    //     await db.persist(new Model('peter'));
    //     const mongoItem = await collection.find().toArray();
    //     expect(mongoItem[0].name).toBe('peter');
    // }
});

test('query patch', async () => {
    const database = await createDatabase('testing');

    const item = new SimpleModel('foo');
    await database.persist(item);

    const dbItem = await database.query(SimpleModel).filter({ name: 'foo' }).findOne();
    expect(dbItem).not.toBe(item);

    const patched = await database.query(SimpleModel).filter({ name: 'foo' }).patchOne({ name: 'bar' });
    expect(patched.modified).toBe(1);
    expect(await database.query(SimpleModel).filter({ name: 'foo' }).has()).toBe(false);
    expect(await database.query(SimpleModel).filter({ name: 'bar' }).has()).toBe(true);
    database.disconnect();
});

test('query filter with undefined filter', async () => {
    const database = await createDatabase('testing');

    const item1 = new SuperSimple();
    const item2 = new SuperSimple();
    item2.name = 'foo';

    await database.persist(item1, item2);

    {
        const items = await database.query(SuperSimple).find();
        expect(items.length).toBe(2);
        expect(await database.query(SuperSimple).has()).toBe(true);
    }

    {
        const items = await database.query(SuperSimple).filter({ name: undefined }).find();
        expect(items.length).toBe(1); //only one item has name: undefined
        expect(await database.query(SuperSimple).filter({ name: undefined }).count()).toBe(1); //only one item has name: undefined
        expect(await database.query(SuperSimple).filter({ name: undefined }).has()).toBe(true);
    }

    {
        await database.query(SuperSimple).patchMany({ name: undefined });
        expect(await database.query(SuperSimple).filter({ name: undefined }).count()).toBe(2);
    }
    database.disconnect();
});

test('uof sets undefined for optional field', async () => {
    const database = await createDatabase('testing');

    const item1 = new SuperSimple();
    item1.name = 'foo';

    await database.persist(item1);

    expect(await database.query(SuperSimple).filter({ name: undefined }).count()).toBe(0);

    {
        const session = database.createSession();
        const item = await session.query(SuperSimple).findOne();
        expect(item.name).toBe('foo');

        item.name = undefined;
        await session.commit();

        expect(await database.query(SuperSimple).filter({ name: undefined }).count()).toBe(1);
    }
    database.disconnect();
});

test('uow patch', async () => {
    const database = await createDatabase('testing');
    const session = database.createSession();

    const item = new SimpleModel('foo');
    session.add(item);
    await session.commit();

    item.name = 'bar';
    await session.commit();

    expect(await database.query(SimpleModel).filter({ name: 'foo' }).has()).toBe(false);
    expect(await database.query(SimpleModel).filter({ name: 'bar' }).has()).toBe(true);
    database.disconnect();
});

test('save model', async () => {
    const database = await createDatabase('testing');
    const session = database.createSession();

    const instance = cast<SimpleModel>({ name: 'myName' });
    expect(instance).toBeInstanceOf(SimpleModel);
    expect(instance.name).toBe('myName');

    session.add(instance);
    await session.commit();

    expect(await session.query(SimpleModel).count()).toBe(1);
    expect(await session.query(SimpleModel).filter({ name: 'myName' }).count()).toBe(1);
    expect(await session.query(SimpleModel).filter({ name: 'MyNameNOTEXIST' }).count()).toBe(0);

    expect(await session.query(SimpleModel).has()).toBe(true);
    expect(await session.query(SimpleModel).filter({ name: 'myName' }).has()).toBe(true);
    expect(await session.query(SimpleModel).filter({ name: 'myNameNOTEXIST' }).has()).toBe(false);

    expect(await session.query(SimpleModel).filter({ name: 'myName' }).findOneOrUndefined()).not.toBeUndefined();
    expect(await session.query(SimpleModel).filter({ name: 'myNameNOTEXIST' }).findOneOrUndefined()).toBeUndefined();

    await expect(session.query(SimpleModel).filter({ name: 'myNameNOTEXIST' }).findOne()).rejects.toThrowError('not found');

    const found = await session.query(SimpleModel).filter({ id: instance.id }).findOne();
    expect(found).toBeInstanceOf(SimpleModel);
    expect(found!.name).toBe('myName');
    expect(found!.id).toBe(instance.id);

    const list = await session.query(SimpleModel).filter({ id: instance.id }).find();
    expect(list[0]).toBeInstanceOf(SimpleModel);
    expect(list[0].name).toBe('myName');
    expect(list[0].id).toBe(instance.id);

    const listAll = await session.query(SimpleModel).find();
    expect(listAll[0]).toBeInstanceOf(SimpleModel);
    expect(listAll[0].name).toBe('myName');
    expect(listAll[0].id).toBe(instance.id);

    expect((await session.query(SimpleModel).filter({ name: 'noneExisting' }).patchOne({ name: 'myName2' })).modified).toBe(0);

    expect(await session.query(SimpleModel).filter({ id: instance.id }).ids(true)).toEqual([instance.id]);
    expect((await session.query(SimpleModel).filter({ id: instance.id }).patchOne({ name: 'myName2' })).modified).toBe(1);

    {
        const found = await session.query(SimpleModel).filter({ id: instance.id }).findOne();
        expect(found).toBeInstanceOf(SimpleModel);
        expect(found!.name).toBe('myName2'); //although we get the stuff from the identityMap, those were also adjusted in GenericQuery.patch
        expect(found === instance).toBe(true);
    }

    {
        const found = await session.query(SimpleModel).disableIdentityMap().filter({ id: instance.id }).findOne();
        expect(found).toBeInstanceOf(SimpleModel);
        expect(found!.name).toBe('myName2');
        expect(found === instance).toBe(false);
    }

    instance.name = 'New Name';
    await database.persist(instance);
    expect(await session.query(SimpleModel).filter({ name: 'MyName' }).has()).toBe(false);
    expect(await session.query(SimpleModel).filter({ name: 'New Name' }).has()).toBe(true);
    database.disconnect();
});

test('test patchAll', async () => {
    const database = await createDatabase('testing');
    const session = database.createSession();

    await database.persist(new SimpleModel('myName1'));
    await database.persist(new SimpleModel('myName2'));
    await database.persist(new SimpleModel('peter'));

    expect(await session.query(SimpleModel).filter({ name: { $regex: /^myName?/ } }).count()).toBe(2);
    expect(await session.query(SimpleModel).filter({ name: { $regex: /^peter.*/ } }).count()).toBe(1);

    await session.query(SimpleModel).filter({ name: { $regex: /^myName?/ } }).patchMany({
        name: 'peterNew',
    });

    expect(await session.query(SimpleModel).filter({ name: { $regex: /^myName?/ } }).count()).toBe(0);
    expect(await session.query(SimpleModel).filter({ name: { $regex: /^peter.*/ } }).count()).toBe(3);

    const fields = await session.query(SimpleModel).filter({ name: 'peterNew' }).select('name').findOne();
    expect(fields!.name).toBe('peterNew');

    const fieldRows = await session.query(SimpleModel).select('name').find();
    expect(fieldRows.length).toBe(3);
    expect(fieldRows[0].name).toBe('peterNew');
    expect(fieldRows[1].name).toBe('peterNew');
    expect(fieldRows[2].name).toBe('peter');
    database.disconnect();
});

test('test delete', async () => {
    const database = await createDatabase('testing');
    const session = database.createSession();

    const instance1 = new SimpleModel('myName1');
    const instance2 = new SimpleModel('myName2');

    session.add(instance1);
    session.add(instance2);
    await session.commit();
    expect(getInstanceStateFromItem(instance1).isKnownInDatabase()).toBe(true);
    expect(getInstanceStateFromItem(instance2).isKnownInDatabase()).toBe(true);

    expect(await session.query(SimpleModel).count()).toBe(2);
    expect(await session.query(SimpleModel).filter({ name: 'myName1' }).count()).toBe(1);
    expect(await session.query(SimpleModel).filter({ name: 'myName2' }).count()).toBe(1);
    expect(await session.query(SimpleModel).filter({ name: 'myName3' }).count()).toBe(0);

    session.remove(instance1);
    await session.commit();

    expect(getInstanceStateFromItem(instance1).isKnownInDatabase()).toBe(false);

    expect(await session.query(SimpleModel).count()).toBe(1);
    expect(await session.query(SimpleModel).filter({ name: 'myName1' }).count()).toBe(0);
    expect(await session.query(SimpleModel).filter({ name: 'myName2' }).count()).toBe(1);
    expect(await session.query(SimpleModel).filter({ name: 'myName3' }).count()).toBe(0);

    session.remove(instance2);
    await session.commit();
    expect(getInstanceStateFromItem(instance2).isKnownInDatabase()).toBe(false);

    expect(await session.query(SimpleModel).count()).toBe(0);
    expect(await session.query(SimpleModel).filter({ name: 'myName1' }).count()).toBe(0);
    expect(await session.query(SimpleModel).filter({ name: 'myName2' }).count()).toBe(0);
    expect(await session.query(SimpleModel).filter({ name: 'myName3' }).count()).toBe(0);
    expect(getInstanceStateFromItem(instance1).isKnownInDatabase()).toBe(false);
    expect(getInstanceStateFromItem(instance2).isKnownInDatabase()).toBe(false);

    session.add(instance1);
    session.add(instance2);
    await session.commit();
    expect(getInstanceStateFromItem(instance1).isKnownInDatabase()).toBe(true);
    expect(getInstanceStateFromItem(instance2).isKnownInDatabase()).toBe(true);
    expect(await session.query(SimpleModel).count()).toBe(2);

    expect((await session.query(SimpleModel).filter({ name: { $regex: /myName[0-9]/ } }).find()).length).toBe(2);
    expect((await session.query(SimpleModel).filter({ name: { $regex: /myName[0-9]/ } }).deleteMany()).modified).toBe(2);
    expect(await session.query(SimpleModel).count()).toBe(0);

    expect(getInstanceStateFromItem(instance1).isKnownInDatabase()).toBe(false);

    session.add(instance1);
    session.add(instance2);
    await session.commit();
    expect(await session.query(SimpleModel).count()).toBe(2);

    await session.query(SimpleModel).filter({ name: { $regex: /myName[0-9]/ } }).deleteOne();
    expect(await session.query(SimpleModel).count()).toBe(1);

    await session.query(SimpleModel).filter({ name: { $regex: /myName[0-9]/ } }).deleteOne();
    expect(await session.query(SimpleModel).count()).toBe(0);
    database.disconnect();
});

test('test super simple model', async () => {
    const database = await createDatabase('testing-simple-model');
    const session = database.createSession();

    const instance = new SuperSimple('myName');

    expect(instance._id).toBe('');
    await database.persist(instance);
    expect(instance._id).not.toBeUndefined();

    {
        const items = await session.query(SuperSimple).find();
        expect(items[0]).toBeInstanceOf(SuperSimple);
        expect(items[0]._id).toBe(instance._id);
        expect(items[0].name).toBe(instance.name);
    }
    database.disconnect();
});

test('test databaseName', async () => {
    const database = await createDatabase('testing-databaseName');
    await database.adapter.client.dropDatabase('testing2');

    @(entity.name('DifferentDataBase').collection('differentCollection').databaseSchema('testing2'))
    class DifferentDatabase {
        _id: MongoId & PrimaryKey = '';
        name?: string;
    }

    const instance = cast<DifferentDatabase>({ name: 'myName' });

    const schema = ReflectionClass.from(DifferentDatabase);
    expect(schema.databaseSchemaName).toBe('testing2');

    expect(instance._id).toBe('');

    await database.persist(instance);

    const items = await database.query(DifferentDatabase).find();
    expect(items[0]._id).toBe(instance._id);
    expect(items[0].name).toBe(instance.name);
    database.disconnect();
});

test('no id', async () => {
    const database = await createDatabase('testing');

    @entity.name('NoId')
    class NoId {
        _id: MongoId & PrimaryKey = '';
        name?: string;
    }

    const instance = cast<NoId>({ name: 'myName' });

    //works as mongodb doesn't need any primary key to work correctly: for the moment
    await database.persist(instance);
    database.disconnect();
});


test('second object id', async () => {
    const database = await createDatabase('testing');
    const session = database.createSession();

    @entity.name('SecondObjectId')
    class SecondObjectId {
        _id: MongoId & PrimaryKey = '';
        name?: string;
        preview: ArrayBuffer = arrayBufferFrom('FooBar', 'utf8');
        secondId?: MongoId;
    }

    const instance = cast<SecondObjectId>({
        name: 'myName',
        secondId: '5bf4a1ccce060e0b38864c9e',
        preview: nodeBufferToArrayBuffer(Buffer.from('QmFhcg==', 'base64')), //Baar
    });

    session.add(instance);
    await session.commit();

    const dbItem = await session.query(SecondObjectId).filter({ name: 'myName' }).findOne();
    expect(dbItem!.name).toBe('myName');

    const dbItemBySecondId = await session.query(SecondObjectId).filter({ secondId: '5bf4a1ccce060e0b38864c9e' }).findOne();
    expect(dbItemBySecondId!.name).toBe('myName');

    // const collection = await session.adapter.connection.getCollection(getClassSchema(SecondObjectId));
    // const mongoItem = await collection.find().toArray();
    // expect(mongoItem.length).toBe(1);
    // expect(mongoItem[0].name).toBe('myName');
    // expect(mongoItem[0].preview).toBeInstanceOf(mongodb.Binary);
    // expect(mongoItem[0].preview.buffer.toString('utf8')).toBe('Baar');
    //
    // expect(mongoItem[0]._id).toBeInstanceOf(mongodb.ObjectID);
    // expect(mongoItem[0].secondId).toBeInstanceOf(mongodb.ObjectID);
    // expect(mongoItem[0]._id.toHexString()).toBe(instance._id);
    // expect(mongoItem[0].secondId.toHexString()).toBe(instance.secondId);
    database.disconnect();
});

test('references back', async () => {
    const database = await createDatabase('testing-references-back');
    const session = database.createSession();

    @entity.name('user1')
    class User {
        id: UUID & PrimaryKey = uuid();

        public images: Image[] & BackReference = [];

        constructor(public name: string) {
        }
    }

    @entity.name('image1')
    class Image {
        id: UUID & PrimaryKey = uuid();

        constructor(
            public user: User & Reference,
            public title: string,
        ) {
            if (user.images && !user.images.includes(this)) {
                user.images.push(this);
            }
        }
    }

    const userSchema = ReflectionClass.from(User);
    expect(userSchema.getProperty('images').isBackReference()).toBe(true);

    const imageSchema = ReflectionClass.from(Image);
    expect(imageSchema.getProperty('user').type.kind).toBe(ReflectionKind.class);
    expect(imageSchema.getProperty('user').getResolvedReflectionClass().getClassType()).toBe(User);

    const marc = new User('marc');
    const peter = new User('peter');
    const marcel = new User('marcel');

    session.add(marc);
    session.add(peter);
    session.add(marcel);

    const image2 = new Image(marc, 'image2');
    session.add(new Image(marc, 'image1'));
    session.add(image2);
    session.add(new Image(marc, 'image3'));

    session.add(new Image(peter, 'image1'));
    await session.commit();

    {
        expect(getInstanceStateFromItem(marc).isFromDatabase()).toBe(false);
        expect(getInstanceStateFromItem(image2).isFromDatabase()).toBe(false);
        const marcFromDb = await session.query(User).joinWith('images').filter({ name: 'marc' }).findOne();
        expect(marcFromDb === marc).toBe(true);
        expect(getInstanceStateFromItem(marcFromDb).isFromDatabase()).toBe(false);

        //make sure that it returns the image2 we already have
        const imageDb = await session.query(Image).joinWith('user').filter({ title: 'image2' }).findOne();
        expect(getInstanceStateFromItem(imageDb).isFromDatabase()).toBe(false);

        expect(imageDb).toBe(image2);
        expect(imageDb.title).toBe('image2');
        expect(imageDb.user).toBeInstanceOf(User);
        //reference is still correct and not overwritten
        expect(imageDb.user.name).toBe('marc');
        expect(imageDb.user).toBe(marc);

        const marcFromDb2 = await session.query(User).joinWith('images').filter({ name: 'marc' }).findOne();
        expect(marcFromDb2 === marc).toBe(true);
    }

    {
        const marcFromDb = await session.query(User).disableIdentityMap().filter({ name: 'marc' }).findOne();
        expect(getInstanceStateFromItem(marcFromDb).isFromDatabase()).toBe(true);

        expect(() => {
            marcFromDb.images;
        }).toThrow('images was not populated');
        expect(typeof marcFromDb.id).toBe('string');
        expect(marcFromDb.name).toBe('marc');

        const plain = serialize<User>(marcFromDb);
        expect(typeof plain.id).toBe('string');
        expect(plain.name).toBe('marc');
        expect(plain.images).toBe(undefined);
    }

    {
        const marcFromDb = await session.query(User).joinWith('images').filter({ name: 'marc' }).findOne();
        expect(marcFromDb === marc).toBe(true);
        expect(getInstanceStateFromItem(marcFromDb).isFromDatabase()).toBe(false);
        expect(marcFromDb.name).toBe('marc');
        expect(marcFromDb.images.length).toBe(3);
        expect(marcFromDb.images[0]).toBeInstanceOf(Image);
        expect(marcFromDb.images[1]).toBeInstanceOf(Image);
        expect(marcFromDb.images[2]).toBeInstanceOf(Image);
    }

    {
        const image2 = await session.query(Image).disableIdentityMap().filter({ title: 'image2' }).findOne();
        expect(() => {
            image2.user.name;
        }).toThrow(`Can not access User.name since class was not completely hydrated`);
        image2.user.name = 'changed';
        expect(image2.user.name).toBe('changed');
        expect(image2.title).toBe('image2');

        //writing is allowed again
        const mowla = new User('mowla');
        image2.user = mowla;
        image2.user.name = 'mowla2';
        expect(image2.user).toBe(mowla);
    }

    {
        const image2 = await session.query(Image).joinWith('user').filter({ title: 'image2' }).findOne();
        expect(image2.title).toBe('image2');
        expect(image2.user).toBeInstanceOf(User);
        expect(image2.user.name).toBe('marc');
    }
    database.disconnect();
});

test('test identityMap', async () => {
    const database = await createDatabase('testing');
    const session = database.createSession();

    const item = new SimpleModel('myName1');
    session.add(item);
    await session.commit();

    const pkHash = getInstanceStateFromItem(item).getLastKnownPKHash();
    const idItem = session.identityMap.getByHash(ReflectionClass.from(SimpleModel), pkHash);
    expect(idItem).toBe(item);

    const dbItem = await session.query(SimpleModel).filter({ name: 'myName1' }).findOne();
    expect(dbItem === item).toBe(true);
    expect(dbItem).toBe(item);
    database.disconnect();
});

test('aggregation without accumulators', async () => {
    class File {
        public _id: MongoId & PrimaryKey = '';
        created: Date = new Date;

        downloads: number = 0;

        category: string = 'none';

        constructor(public path: string) {
        }
    }

    const database = await createDatabase('aggregation');

    await database.persist(cast<File>({ path: 'file1', category: 'images' }),
        cast<File>({ path: 'file2', category: 'images' }),
        cast<File>({ path: 'file3', category: 'pdfs' }));

    await database.query(File).filter({ path: 'file1' }).patchOne({ $inc: { downloads: 15 } });
    await database.query(File).filter({ path: 'file2' }).patchOne({ $inc: { downloads: 5 } });

    const res = await database.query(File)
        .groupBy('category')
        .orderBy('category', 'asc')
        .find();
    expect(res).toEqual([{ category: 'images' }, { category: 'pdfs' }]);

    const res2 = await database.query(File)
        .withSum('downloads', 'downloadsSum')
        .groupBy('category')
        .orderBy('category', 'asc')
        .find();

    expect(res2).toEqual([
        { downloadsSum: 20, category: 'images' },
        { downloadsSum: 0, category: 'pdfs' },
    ]);
    database.disconnect();
});

test('raw', async () => {
    class Model {
        public _id: MongoId & PrimaryKey = '';

        constructor(public id: number) {
        }
    }

    const database = await createDatabase('raw');

    {
        const session = database.createSession();
        for (let i = 0; i < 1000; i++) session.add(new Model(i));
        await session.commit();
    }

    const result = await database.raw<Model, { count: number }>([{ $match: { id: { $gt: 500 } } }, { $count: 'count' }]).findOne();
    expect(result.count).toBe(499);

    const items = await database.raw<Model>([{ $match: { id: { $lt: 500 } } }]).find();
    expect(items.length).toBe(500);
    expect(items[0]).toBeInstanceOf(Model);
    database.disconnect();
});

test('batch', async () => {
    class Model {
        public _id: MongoId & PrimaryKey = '';

        constructor(public id: number) {
        }
    }

    const database = await createDatabase('batch');
    {
        const session = database.createSession();
        for (let i = 0; i < 1000; i++) session.add(new Model(i));
        await session.commit();
    }

    {
        const items = await database.query(Model).withBatchSize(10).find();
        expect(items.length).toBe(1000);
    }

    {
        const session = database.createSession();
        session.useTransaction();
        const items = await session.query(Model).withBatchSize(10).find();
        expect(items.length).toBe(1000);
        await session.commit();
    }
    database.disconnect();
});

test('unique constraint 1', async () => {
    class Model {
        id: number & PrimaryKey & AutoIncrement = 0;

        constructor(public username: string & Unique = '') {
        }
    }

    const database = await createDatabase('unique');
    database.registerEntity(Model);
    await database.migrate();

    await database.persist(new Model('peter'));
    await database.persist(new Model('paul'));

    {
        const m1 = new Model('peter');
        await expect(database.persist(m1)).rejects.toThrow('username dup key');
        await expect(database.persist(m1)).rejects.toBeInstanceOf(UniqueConstraintFailure);
    }

    {
        const m1 = new Model('marie');
        const m2 = new Model('marie');
        await expect(database.persist(m1, m2)).rejects.toThrow('username dup key');
        await expect(database.persist(m1, m2)).rejects.toBeInstanceOf(UniqueConstraintFailure);
    }

    {
        const m = await database.query(Model).filter({ username: 'paul' }).findOne();
        m.username = 'peter';
        await expect(database.persist(m)).rejects.toThrow('username dup key');
        await expect(database.persist(m)).rejects.toBeInstanceOf(UniqueConstraintFailure);
    }

    {
        const p = database.query(Model).filter({ username: 'paul' }).patchOne({ username: 'peter' });
        await expect(p).rejects.toThrow('username dup key');
        await expect(p).rejects.toBeInstanceOf(UniqueConstraintFailure);
    }
    database.disconnect();
});

test('collation', async () => {
    class User {
        _id: MongoId & PrimaryKey = '';

        constructor(public name: string) {
        }
    }

    const database = await createDatabase('collation');
    const logger = new MemoryLogger();
    database.setLogger(logger);

    await database.persist(new User('eclair'), new User('éclair'), new User('Napoleon'));

    {
        const users = await database.query(User)
            .filter({ name: 'eclair' })
            .withOptions({ collation: { locale: 'en', strength: 1 } })
            .select('name')
            .find();
        expect(users).toEqual([{ name: 'eclair' }, { name: 'éclair' }]);
    }
    {
        const users = await database.query(User)
            .filter({ name: 'eclair' })
            .withOptions({ collation: { locale: 'en', strength: 1 } })
            .count();
        expect(users).toBe(2);
    }

    {
        const users = await database.query(User)
            .filter({ name: 'eclair' })
            .select('name')
            .find();
        expect(users).toEqual([{ name: 'eclair' }]);
    }

    {
        const users = await database.raw<User, { name: string }>([
            { $match: { name: 'eclair' } },
            { $project: { name: 1 } },
        ]).find();
        expect(users).toEqual([{ name: 'eclair' }]);
    }

    {
        const users = await database.raw<User, { name: string }>([
            { $match: { name: 'eclair' } },
            { $project: { name: 1 } },
        ])
            .withOptions({ collation: { locale: 'en', strength: 1 } })
            .find();
        expect(users).toEqual([{ name: 'eclair' }, { name: 'éclair' }]);
    }

    {
        const users = await database.raw<User, { name: string }>([
            { $match: { name: 'eclair' } },
            { $project: { name: 1 } },
        ])
            .withOptions({ collation: { locale: 'en', strength: 1 } })
            .find();
        expect(users).toEqual([{ name: 'eclair' }, { name: 'éclair' }]);
    }

    {
        const users = await database.raw<User, { name: string }>([
            { $match: { name: 'eclair' } },
            { $project: { name: 1 } },
        ])
            .withOptions({ collation: { locale: 'en', strength: 1 } })
            .explain();
        expect(users.queryPlanner.winningPlan.stage).toBe('PROJECTION_SIMPLE');
    }

    {
        const users = await database.query(User)
            .filter({ name: 'eclair' })
            .withOptions({ collation: { locale: 'en', strength: 1 } })
            .explain('find');
        expect(users.queryPlanner.winningPlan.stage).toBe('COLLSCAN');
    }

    {
        const users = await database.query(User)
            .filter({ name: 'eclair' })
            .withOptions({ collation: { locale: 'en', strength: 1 } })
            .explain('find', 'queryPlanner');
        expect(users.queryPlanner.winningPlan.stage).toBe('COLLSCAN');
    }

    {
        const users = await database.query(User)
            .filter({ name: 'eclair' })
            .withOptions({ collation: { locale: 'en', strength: 1 } })
            .explain('find', 'executionStats');
        expect(users.queryPlanner.winningPlan.stage).toBe('COLLSCAN');
    }

    {
        logger.clear();
        const users = await database.query(User)
            .filter({ name: 'eclair' })
            .withOptions({ collation: { locale: 'en', strength: 1 } })
            .logExplain()
            .find();
        expect(users).toHaveLength(2);
        expect(logger.getOutput()).toContain(`winningPlan: { stage: 'COLLSCAN`);
    }
    database.disconnect();
});

test('allowDiskUse', async () => {
    class User {
        _id: MongoId & PrimaryKey = '';

        constructor(public name: string) {
        }
    }

    const database = await createDatabase('allowDiskUse');
    const logger = new MemoryLogger();
    database.setLogger(logger);

    await database.persist(new User('eclair'), new User('éclair'), new User('Napoleon'));

    {
        const users = await database.query(User)
            .filter({ name: 'eclair' })
            .withOptions({ allowDiskUse: true })
            .find();

        expect(users[0]).toMatchObject({ name: 'eclair' });
    }

    {
        const users = await database.raw<User, { name: string }>([
            { $match: { name: 'eclair' } },
            { $project: { name: 1 } },
        ])
            .withOptions({ allowDiskUse: true })
            .find();
        expect(users).toEqual([{ name: 'eclair' }]);
    }
    database.disconnect();
});

test('non-optional MongoId', async () => {
    class Model {
        _id: MongoId & PrimaryKey = '';

        constructor(public teamId: MongoId) {

        }
    }

    const database = await createDatabase('non-optional-mongo-id');

    const model1 = new Model(ObjectId.generate());
    await database.persist(model1);

    const items1 = await database.query(Model)
        .filter({ teamId: undefined })
        .find();
    expect(items1.length).toBe(0);

    const items2 = await database.query(Model)
        .filter({ teamId: null as any })
        .find();
    expect(items2.length).toBe(0);

    const items3 = await database.query(Model)
        .filter({ teamId: '' })
        .find();
    expect(items3.length).toBe(0);

    const items4 = await database.query(Model)
        .filter({ teamId: model1.teamId })
        .find();
    expect(items4.length).toBe(1);
    expect(items4[0]).toBeInstanceOf(Model);
});

test('filter with a dot path into an embedded object (#697)', async () => {
    class Message { _id: MongoId & PrimaryKey = ''; channel: string = ''; text: string = ''; }
    class Channel {
        _id: MongoId & PrimaryKey = '';
        tailMessage?: Omit<Message, 'channel'>;
    }
    const db = await createDatabase('dot-path-filter');
    db.registerEntity(Channel);
    const channel = new Channel();
    channel.tailMessage = { _id: '5be340cb2ffb5e901a9b62e4', text: 'hi' };
    await db.persist(channel);

    expect(await db.query(Channel).filter({ 'tailMessage._id': '5be340cb2ffb5e901a9b62e4' } as any).count()).toBe(1);
});
