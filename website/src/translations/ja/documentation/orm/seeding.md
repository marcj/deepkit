# シーディング

データベースシーディングとは、データベースに初期データを投入することです。これはデータベースの初期データ投入の一形態であり、開発、テスト、または本番環境のデータベース初期化時に使用することを目的としています。

Deepkit ORM には専用のシーディング API はありません。シードは `Database` を受け取り、`database.persist()` または [セッション](session.md) を使用してエンティティを挿入する通常の関数です。これにより、同じシードを CLI コマンド、アプリケーション起動時、テストのいずれでも使用できます。

## シード関数

このページの例では、以下のエンティティを使用します:

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

シード関数はすべてのエンティティをセッションに追加し、一度にコミットします。Unit of Work は挿入を依存関係に従って並べ替えるため、author はそれを参照する book より先に挿入され、author の auto-increment ID は自動的に book に割り当てられます。

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

互いに関連のない少数のエンティティであれば、`database.persist()` で十分です:

```typescript
await database.persist(new Author('peter'), new Author('marie'));
```

## 冪等なシーディング

複数回実行されるシード（例: 開発サーバーの起動ごと）は、同じデータを二重に挿入したり、一意制約エラーで失敗したりすべきではありません。挿入する前に、データが既に存在するかどうかを確認してください:

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

代わりにクリーンな状態から始めたい場合は、まず既存のレコードを削除します。他のエンティティを参照しているエンティティは、参照されている側より先に削除してください:

```typescript
await database.query(Book).deleteMany();
await database.query(Author).deleteMany();
```

シードを完全に適用するか、まったく適用しないかのどちらかにする必要がある場合は、`database.transaction(async (session) => { ... })` を使用して [トランザクション](transactions.md) 内で実行してください。

## CLI コマンド

Deepkit アプリケーションでは、シーディングは通常 CLI コマンドで行います。データベースクラスは、他のサービスと同様に依存性注入によって注入されます。コマンドの詳細については [CLI](../cli/getting-started.md) を参照してください。

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

シーディングの前にテーブルが存在している必要があります。[マイグレーション](migrations.md)（またはプロトタイピング中は `database.migrate()` / `migrateOnStartup`）を使用してテーブルを作成してください。

## フィクスチャデータ

シードデータをフェイクデータライブラリで生成する必要はありません。フィクスチャファイル内のプレーンなオブジェクトリテラルの方が読みやすく、実行のたびに同じデータが生成されるため、テストが決定的になります。`@deepkit/type` の `cast` を使用して、それらをエンティティのインスタンスに変換します。`cast` はデータのバリデーションも行うため、不正なフィクスチャは早い段階で失敗します。

```typescript
import { cast } from '@deepkit/type';

const authorFixtures = [
    { username: 'peter' },
    { username: 'marie' },
];

await database.persist(...authorFixtures.map(v => cast<Author>(v)));
```

大量のデータの場合は、シンプルなループで生成します:

```typescript
const session = database.createSession();
for (let i = 0; i < 1000; i++) {
    session.add(new Author(`user${i}`));
}
await session.commit();
```

## テストでのシーディング

テストでは、`@deepkit/orm` の `MemoryDatabaseAdapter` を使用します。稼働中のデータベースサーバーもマイグレーションも不要で、各テストは新しい独立したデータベースを使用できます。

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

`createTestingApp` を使用して Deepkit アプリケーションをテストする場合は、第 2 引数としてエンティティを渡します。これにより `MemoryDatabaseAdapter` を使用した `Database` が登録され、テスト実行前にシードできます。[テスト](../framework/testing.md) を参照してください。

```typescript
import { createTestingApp } from '@deepkit/framework';
import { Database } from '@deepkit/orm';

test('seeded app', async () => {
    const testing = createTestingApp({ controllers: [BookController] }, [Author, Book]);
    await seed(testing.app.get(Database));

    // ...
});
```

メモリアダプターは join をサポートしておらず、SQL も実行しません。join やデータベース固有の動作（制約、照合順序、生の SQL）に依存するテストでは、`@deepkit/sqlite` の `new SQLiteDatabaseAdapter(':memory:')`（シーディングの前に `database.migrate()` を呼び出してください）または実際のデータベースアダプターを使用してください。
