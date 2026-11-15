# Seeding

데이터베이스 seeding은 데이터베이스에 초기 데이터를 채워 넣는 작업입니다. 이는 초기 데이터베이스 채우기의 한 형태로, 개발, 테스트 또는 프로덕션 데이터베이스 초기화 시 사용하기 위한 것입니다.

Deepkit ORM에는 특별한 seeding API가 없습니다. seed는 `Database`를 받아 `database.persist()` 또는 [session](session.md)으로 엔티티를 삽입하는 일반 함수입니다. 덕분에 동일한 seed를 CLI 명령, 애플리케이션 시작 시, 그리고 테스트에서 사용할 수 있습니다.

## Seed 함수

이 페이지의 예제에서는 다음 엔티티를 사용합니다:

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

seed 함수는 모든 엔티티를 session에 추가하고 한 번에 커밋합니다. unit of work는 삽입 작업을 의존성에 따라 정렬하므로, author가 이를 참조하는 book들보다 먼저 삽입되고 author의 auto-increment ID가 book들에 자동으로 할당됩니다.

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

서로 관련 없는 몇 개의 엔티티라면 `database.persist()`로 충분합니다:

```typescript
await database.persist(new Author('peter'), new Author('marie'));
```

## 멱등적 Seeding

여러 번 실행되는 seed(예: 개발 서버를 시작할 때마다)는 같은 데이터를 두 번 삽입하거나 unique 제약 조건 오류로 실패해서는 안 됩니다. 삽입하기 전에 데이터가 이미 존재하는지 확인하세요:

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

대신 깨끗한 상태에서 시작하려면 먼저 기존 레코드를 삭제하세요. 다른 엔티티를 참조하는 엔티티를 참조되는 엔티티보다 먼저 삭제해야 합니다:

```typescript
await database.query(Book).deleteMany();
await database.query(Author).deleteMany();
```

seed가 완전히 적용되거나 전혀 적용되지 않아야 한다면, `database.transaction(async (session) => { ... })`를 사용해 [transaction](transactions.md) 안에서 실행하세요.

## CLI 명령

Deepkit 애플리케이션에서 seeding은 일반적으로 CLI 명령에서 수행됩니다. 데이터베이스 클래스는 다른 서비스와 마찬가지로 dependency injection을 통해 주입됩니다. 명령에 대한 자세한 내용은 [CLI](../cli/getting-started.md)를 참조하세요.

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

seeding 전에 테이블이 존재해야 합니다. [migrations](migrations.md)로 테이블을 생성하세요(프로토타이핑 중에는 `database.migrate()` / `migrateOnStartup` 사용 가능).

## Fixture 데이터

seed 데이터를 가짜 데이터 라이브러리로 생성할 필요는 없습니다. fixture 파일의 일반 객체 리터럴은 읽기 쉽고 매 실행마다 동일한 데이터를 생성하므로 테스트를 결정적으로 만들어 줍니다. `@deepkit/type`의 `cast`를 사용해 이를 엔티티 인스턴스로 변환하세요. `cast`는 데이터의 유효성도 검사하므로, 잘못된 fixture는 조기에 실패합니다.

```typescript
import { cast } from '@deepkit/type';

const authorFixtures = [
    { username: 'peter' },
    { username: 'marie' },
];

await database.persist(...authorFixtures.map(v => cast<Author>(v)));
```

더 많은 양의 데이터는 간단한 루프로 생성하세요:

```typescript
const session = database.createSession();
for (let i = 0; i < 1000; i++) {
    session.add(new Author(`user${i}`));
}
await session.commit();
```

## 테스트에서의 Seeding

테스트에서는 `@deepkit/orm`의 `MemoryDatabaseAdapter`를 사용하세요. 실행 중인 데이터베이스 서버나 migration이 필요 없으며, 모든 테스트가 새롭고 격리된 데이터베이스를 갖게 됩니다.

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

`createTestingApp`으로 Deepkit 애플리케이션을 테스트할 때는 엔티티를 두 번째 인수로 전달하세요. 이렇게 하면 `MemoryDatabaseAdapter`를 사용하는 `Database`가 등록되며, 테스트를 실행하기 전에 이를 seed할 수 있습니다. [Testing](../framework/testing.md)을 참조하세요.

```typescript
import { createTestingApp } from '@deepkit/framework';
import { Database } from '@deepkit/orm';

test('seeded app', async () => {
    const testing = createTestingApp({ controllers: [BookController] }, [Author, Book]);
    await seed(testing.app.get(Database));

    // ...
});
```

memory adapter는 join을 지원하지 않으며 SQL을 실행하지 않습니다. join이나 데이터베이스별 동작(제약 조건, collation, raw SQL)에 의존하는 테스트에는 `@deepkit/sqlite`의 `new SQLiteDatabaseAdapter(':memory:')`(seeding 전에 `database.migrate()` 호출) 또는 실제 데이터베이스 adapter를 사용하세요.
