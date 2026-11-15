# 数据填充（Seeding）

数据库填充（Database seeding）是指为数据库初始填充数据。它是一种初始数据库填充形式，用于开发、测试或生产环境中的数据库初始化。

Deepkit ORM 没有专门的 seeding API。seed 是一个普通函数，它接收一个 `Database`，并通过 `database.persist()` 或 [session](session.md) 插入实体。这使得同一个 seed 可以在 CLI 命令中、应用启动时以及测试中使用。

## Seed 函数

本页示例中使用以下实体：

```typescript
import { AutoIncrement, entity, PrimaryKey, Reference, Unique } from '@deepkit/type';

@entity.name('author')
export class Author {
    id: number & PrimaryKey & AutoIncrement = 0;

    constructor(public username: string & Unique) {
    }
}

@entity.name('book')
export class Book {
    id: number & PrimaryKey & AutoIncrement = 0;

    constructor(public title: string, public author: Author & Reference) {
    }
}
```

seed 函数将所有实体添加到一个 session 中，并一次性提交。unit of work 会根据依赖关系对插入操作排序，因此作者会在引用它的书籍之前插入，并且作者的自增 ID 会自动赋给这些书籍。

```typescript
import { Database } from '@deepkit/orm';

export async function seed(database: Database) {
    const session = database.createSession();

    const peter = new Author('peter');
    session.add(peter);

    for (let i = 1; i <= 3; i++) {
        session.add(new Book(`Book ${i}`, peter));
    }

    await session.commit();
}
```

对于少量互不相关的实体，使用 `database.persist()` 就足够了：

```typescript
await database.persist(new Author('peter'), new Author('marie'));
```

## 幂等填充

会被执行多次的 seed（例如在每次启动开发服务器时）不应重复插入相同的数据，也不应因唯一约束错误而失败。在插入之前先检查数据是否已存在：

```typescript
export async function seed(database: Database) {
    const exists = await database.query(Author).filter({ username: 'peter' }).has();
    if (exists) return;

    const session = database.createSession();
    const peter = new Author('peter');
    session.add(peter, new Book('Book 1', peter));
    await session.commit();
}
```

如果希望从干净的状态开始，请先删除现有记录。应先删除引用其他实体的实体，再删除被引用的实体：

```typescript
await database.query(Book).deleteMany();
await database.query(Author).deleteMany();
```

如果 seed 必须要么完全应用、要么完全不应用，请使用 `database.transaction(async (session) => { ... })` 在 [事务](transactions.md) 中运行它。

## CLI 命令

在 Deepkit 应用中，数据填充通常在 CLI 命令中完成。数据库类与其他服务一样通过依赖注入进行注入。有关命令的更多信息，请参阅 [CLI](../cli/getting-started.md)。

```typescript
import { App, cli, Flag } from '@deepkit/app';
import { FrameworkModule } from '@deepkit/framework';
import { Logger } from '@deepkit/logger';
import { Database } from '@deepkit/orm';
import { SQLiteDatabaseAdapter } from '@deepkit/sqlite';

class AppDatabase extends Database {
    constructor() {
        super(new SQLiteDatabaseAdapter('./app.sqlite'), [Author, Book]);
    }
}

@cli.controller('db:seed', {
    description: 'Seed the database with initial data',
})
class SeedCommand {
    constructor(
        protected database: AppDatabase,
        protected logger: Logger,
    ) {
    }

    async execute(reset: boolean & Flag = false) {
        if (reset) {
            await this.database.query(Book).deleteMany();
            await this.database.query(Author).deleteMany();
        }

        await seed(this.database);
        this.logger.log(`Database seeded, ${await this.database.query(Book).count()} books.`);
    }
}

new App({
    providers: [AppDatabase],
    controllers: [SeedCommand],
    imports: [new FrameworkModule()],
}).run();
```

```sh
$ ts-node app.ts db:seed
$ ts-node app.ts db:seed --reset
```

在填充之前，数据表必须已经存在。请使用 [迁移](migrations.md) 创建它们（或在原型开发阶段使用 `database.migrate()` / `migrateOnStartup`）。

## Fixture 数据

seed 数据不一定需要由假数据库生成。在 fixture 文件中使用普通的对象字面量更易于阅读，并且每次运行都会产生相同的数据，这使测试具有确定性。使用 `@deepkit/type` 中的 `cast` 将它们转换为实体实例。`cast` 还会验证数据，因此无效的 fixture 会尽早失败。

```typescript
import { cast } from '@deepkit/type';

const authorFixtures = [
    { username: 'peter' },
    { username: 'marie' },
];

await database.persist(...authorFixtures.map(v => cast<Author>(v)));
```

对于大量数据，可以用一个简单的循环生成：

```typescript
const session = database.createSession();
for (let i = 0; i < 1000; i++) {
    session.add(new Author(`user${i}`));
}
await session.commit();
```

## 测试中的数据填充

在测试中，使用 `@deepkit/orm` 中的 `MemoryDatabaseAdapter`。它不需要运行数据库服务器，也不需要迁移，并且每个测试都会获得一个全新的、隔离的数据库。

```typescript
import { expect, test } from '@jest/globals';
import { Database, MemoryDatabaseAdapter } from '@deepkit/orm';

test('books by author', async () => {
    const database = new Database(new MemoryDatabaseAdapter(), [Author, Book]);
    await seed(database);

    const peter = await database.query(Author).filter({ username: 'peter' }).findOne();
    const books = await database.query(Book).filter({ author: peter }).find();
    expect(books.map(book => book.title)).toEqual(['Book 1', 'Book 2', 'Book 3']);
});
```

当你使用 `createTestingApp` 测试 Deepkit 应用时，将实体作为第二个参数传入。这会注册一个使用 `MemoryDatabaseAdapter` 的 `Database`，你可以在运行测试之前对其进行填充。请参阅 [测试](../framework/testing.md)。

```typescript
import { createTestingApp } from '@deepkit/framework';
import { Database } from '@deepkit/orm';

test('seeded app', async () => {
    const testing = createTestingApp({ controllers: [BookController] }, [Author, Book]);
    await seed(testing.app.get(Database));

    // ...
});
```

内存适配器不支持 join，也不执行 SQL。对于依赖 join 或特定数据库行为（约束、排序规则、原生 SQL）的测试，请使用 `@deepkit/sqlite` 中的 `new SQLiteDatabaseAdapter(':memory:')`（在填充之前调用 `database.migrate()`）或你实际使用的数据库适配器。
