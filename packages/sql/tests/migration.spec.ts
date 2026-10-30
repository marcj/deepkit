import { expect, test } from '@jest/globals';
import { AutoIncrement, DatabaseField, entity, Index, PrimaryKey, Reference, ReflectionClass, ReflectionKind, Unique } from '@deepkit/type';
import { DatabaseComparator, DatabaseModel, IndexModel, TableComparator } from '../src/schema/table.js';
import { DefaultPlatform } from '../src/platform/default-platform.js';
import { SchemaParser } from '../src/reverse/schema-parser.js';
import { DatabaseEntityRegistry, MigrateOptions } from '@deepkit/orm';

@(entity.name('user')
    .index(['deleted'], {unique: true})
    .index(['deleted', 'created']))
class User {
    id!: number & PrimaryKey & AutoIncrement;
    username!: string & Unique;
    created!: Date;
    deleted!: boolean;
    logins!: number;
}

@entity.name('post')
class Post {
    id!: number & PrimaryKey & AutoIncrement;
    user?: User & Reference;
    created!: Date;
    slag!: string & Index;
    title!: string;
    content!: string;
}

class MySchemaParser extends SchemaParser {
    async parse(database: DatabaseModel, limitTableNames?: string[]) {
    }
}

class MyPlatform extends DefaultPlatform {
    schemaParserType = MySchemaParser;
    constructor() {
        super();
        this.addType(ReflectionKind.number, 'integer');
    }
}

test('migration basic', async () => {
    const user = ReflectionClass.from(User);
    expect(user.getProperty('id').getKind()).toBe(ReflectionKind.number);
    expect(user.getProperty('id').isPrimaryKey()).toBe(true);
    expect(user.getProperty('id').isAutoIncrement()).toBe(true);
    expect(user.getPrimary() === user.getProperty('id')).toBe(true);
    expect(user.getAutoIncrement() === user.getProperty('id')).toBe(true);
    expect(user.indexes.length).toBe(3);

    const [tableUser, tablePost] = new MyPlatform().createTables(DatabaseEntityRegistry.from([User, Post]));

    const userReflection = ReflectionClass.from(User);
    expect(userReflection.getProperty('username').getIndex()).toEqual({unique: true});

    expect(tableUser.hasColumn('id')).toBe(true);
    expect(tableUser.getColumn('id').isPrimaryKey).toBe(true);
    expect(tableUser.getColumn('id').isAutoIncrement).toBe(true);
    expect(tableUser.getColumn('id').type).toBe('integer');

    expect(tableUser.hasColumn('username')).toBe(true);
    expect(tableUser.getColumn('username').type).toBe('text');
    expect(tableUser.getColumn('username').isNotNull).toBe(true);

    const indexes = tableUser.getUnices();
    expect(indexes.length).toBe(2);
    expect(indexes[0]).toBeInstanceOf(IndexModel);
    expect(indexes[0]!.hasColumn('username')).toBe(true);

    expect(tablePost.foreignKeys.length).toBe(1);
    expect(tablePost.foreignKeys[0].foreign).toBe(tableUser);
    expect(tablePost.foreignKeys[0].localColumns[0].name).toBe('user');
    expect(tablePost.foreignKeys[0].foreignColumns[0].name).toBe('id');
});

test('add and remove column', async () => {
    const platform = new MyPlatform();

    @entity.name('leagues')
    class Leagues1 {
        id!: number & PrimaryKey;
        dayOfWeek!: number;
    }

    class Organisation {
        id!: number & PrimaryKey;
    }

    @entity.name('leagues')
    class Leagues2 {
        id!: number & PrimaryKey;
        organisation?: Organisation & Reference;
    }

    const db1 = platform.createTables(DatabaseEntityRegistry.from([Leagues1]));
    const db2 = platform.createTables(DatabaseEntityRegistry.from([Leagues2, Organisation]));
    const diff = TableComparator.computeDiff(db1[0], db2[0]);

    const sql = platform.getModifyTableDDL(diff!, new MigrateOptions());
    expect(sql).toContain('ALTER TABLE "leagues" ADD "organisation" integer NULL, DROP COLUMN "dayOfWeek"');
});

test('skip index', async () => {
    const platform = new MyPlatform();

    @entity.name('leagues')
    class Leagues1 {
        id!: number & PrimaryKey;
        dayOfWeek!: number & Index<{name: 'dayindex'}>;
    }

    const db = new DatabaseModel();
    platform.createTables(DatabaseEntityRegistry.from([Leagues1]), db);
    const diff = DatabaseComparator.computeDiff(new DatabaseModel(), db);

    {
        const options = new MigrateOptions();
        const sql = platform.getModifyDatabaseDDL(diff!, options);
        expect(sql).toEqual([`CREATE TABLE "leagues" (
    "id" integer NOT NULL,
    "dayOfWeek" integer NOT NULL,
    PRIMARY KEY ("id")
)`, `CREATE INDEX "dayindex" ON "leagues" ("dayOfWeek")`]);
    }

    {
        const options = new MigrateOptions();
        options.skipIndex = true;
        const sql = platform.getModifyDatabaseDDL(diff!, options);
        expect(sql).toEqual([`CREATE TABLE "leagues" (
    "id" integer NOT NULL,
    "dayOfWeek" integer NOT NULL,
    PRIMARY KEY ("id")
)`]);
    }
});

test('no drop per default', () => {
    const platform = new MyPlatform();

    @entity.name('leagues')
    class Leagues1 {
        id!: number & PrimaryKey;
        dayOfWeek!: number & Index<{name: 'dayindex'}>;
    }

    const db = new DatabaseModel();
    platform.createTables(DatabaseEntityRegistry.from([Leagues1]), db);
    const diff = DatabaseComparator.computeDiff(db, new DatabaseModel());

    {
        const options = new MigrateOptions();
        const sql = platform.getModifyDatabaseDDL(diff!, options);
        expect(sql).toEqual([]);
    }

    {
        const options = new MigrateOptions();
        options.drop = true;
        const sql = platform.getModifyDatabaseDDL(diff!, options);
        expect(sql).toEqual([`DROP TABLE IF EXISTS "leagues"`]);
    }
});

test('skip property', () => {
    class Entity {
        id: PrimaryKey & number = 0;
        firstName?: string;
        firstName_tsvector: any & DatabaseField<{ skip: true }> = '';
        anotherone: any & DatabaseField<{ skipMigration: true }> = '';
    }

    const platform = new MyPlatform();
    const tables = platform.createTables(DatabaseEntityRegistry.from([Entity]));

    expect(tables.length).toBe(1);
    const table = tables[0];

    expect(table.columns.map(v => v.name)).toEqual([
        'id', 'firstName'
    ]);
});

test('dynamic default values are not frozen into the schema', () => {
    let i = 0;
    const next = () => ++i;

    @entity.name('dynamic_default')
    class Model {
        id: number & PrimaryKey & AutoIncrement = 0;
        createdNoParens: Date = new Date;
        createdParens: Date = new Date();
        counter: number = next();
        title: string = 'abc';
        count: number = 5;
    }

    const [table] = new MyPlatform().createTables(DatabaseEntityRegistry.from([Model]));
    expect(table.getColumn('createdNoParens').defaultValue).toBe(undefined);
    expect(table.getColumn('createdParens').defaultValue).toBe(undefined);
    expect(table.getColumn('counter').defaultValue).toBe(undefined);
    expect(table.getColumn('title').defaultValue).toBe('abc');
    expect(table.getColumn('count').defaultValue).toBe(5);

    const [table2] = new MyPlatform().createTables(DatabaseEntityRegistry.from([Model]));
    expect(TableComparator.computeDiff(table, table2)).toBe(undefined);
});
