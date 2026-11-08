import { AutoIncrement, entity, PrimaryKey, Reference } from '@deepkit/type';
import { expect, test } from '@jest/globals';

import { Database } from '../src/database.js';
import { MemoryDatabaseAdapter } from '../src/memory-db.js';
import { LogPlugin, LogType } from '../src/plugin/log-plugin.js';
import { Query } from '../src/query.js';
import { PrimaryKeysNotReturnedError } from '../src/type.js';

test('primaryKeys throws unless requested', async () => {
    @entity.name('deleteKeysItem')
    class Item {
        constructor(public id: number & PrimaryKey) {}
    }

    const database = new Database(new MemoryDatabaseAdapter(), [Item]);
    await database.persist(new Item(1), new Item(2));

    const plain = await database.query(Item).filter({ id: 1 }).deleteMany();
    expect(plain.modified).toBe(1);
    expect(() => plain.primaryKeys).toThrow(PrimaryKeysNotReturnedError);
    expect(() => plain.primaryKeys).toThrow('returnPrimaryKeys()');

    const returned = await database.query(Item).filter({ id: 2 }).returnPrimaryKeys().deleteMany();
    expect(returned.primaryKeys).toHaveLength(1);
    expect(JSON.parse(JSON.stringify(returned))).toEqual({ modified: 1, primaryKeys: [{ id: 2 }] });
});

test('a pre listener replacing the query decides about the keys', async () => {
    @entity.name('deleteKeysReplaced')
    class Item {
        constructor(public id: number & PrimaryKey) {}
    }

    const database = new Database(new MemoryDatabaseAdapter(), [Item]);
    await database.persist(new Item(1));
    database.listen(Query.onDeletePre, event => {
        event.query = event.query.returnPrimaryKeys();
    });

    const result = await database.query(Item).deleteMany();
    expect(result.primaryKeys).toHaveLength(1);
});

test('a pre listener can read the keys of a query that requested them', async () => {
    @entity.name('deleteKeysPre')
    class Item {
        constructor(public id: number & PrimaryKey) {}
    }

    const database = new Database(new MemoryDatabaseAdapter(), [Item]);
    await database.persist(new Item(1));
    let seen: any;
    database.listen(Query.onDeletePre, event => {
        seen = event.deleteResult.primaryKeys.length;
    });

    await database.query(Item).returnPrimaryKeys().deleteMany();
    expect(seen).toBe(0);
});

test('virtual foreign keys get the keys of referenced entities only', async () => {
    @entity.name('deleteKeysAuthor')
    class Author {
        constructor(public id: number & PrimaryKey) {}
    }

    @entity.name('deleteKeysBook')
    class Book {
        constructor(
            public id: number & PrimaryKey,
            public author: Author & Reference,
        ) {}
    }

    const database = new Database(new MemoryDatabaseAdapter(), [Author, Book]);
    const author = new Author(1);
    await database.persist(author, new Book(1, author));

    const loaded: { [name: string]: number } = {};
    database.listen(Query.onDeletePost, event => {
        loaded[event.classSchema.getName()] = event.deleteResult.loadedPrimaryKeys.length;
    });

    await database.query(Book).deleteMany();
    const result = await database.query(Author).deleteMany();

    expect(loaded).toEqual({ deleteKeysBook: 0, deleteKeysAuthor: 1 });
    expect(() => result.primaryKeys).toThrow(PrimaryKeysNotReturnedError);
});

test('the log plugin works without returnPrimaryKeys', async () => {
    @entity.name('deleteKeysLogged')
    class Item {
        id: number & PrimaryKey & AutoIncrement = 0;
    }

    const database = new Database(new MemoryDatabaseAdapter(), [Item]);
    database.registerPlugin(new LogPlugin);
    const logEntity = database.pluginRegistry.getPlugin(LogPlugin).getLogEntity(Item);
    await database.persist(new Item, new Item);

    const result = await database.query(Item).deleteMany();
    expect(() => result.primaryKeys).toThrow(PrimaryKeysNotReturnedError);

    const logs = await database.query(logEntity).filter({ type: LogType.Deleted }).find();
    expect(logs.map(v => v.reference).sort()).toEqual([1, 2]);
});
