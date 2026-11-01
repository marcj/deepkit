# 마이그레이션

마이그레이션은 구조화되고 체계적인 방식으로 데이터베이스 스키마를 변경하는 방법입니다. 마이그레이션은 디렉터리에 TypeScript 파일로 저장되며 command-line 도구를 사용하여 실행할 수 있습니다.

Deepkit Framework를 사용하는 경우 Deepkit ORM 마이그레이션은 기본적으로 활성화되어 있습니다. 

## 명령어

- `migration:create` - 데이터베이스 diff를 기반으로 새 마이그레이션 파일을 생성합니다
- `migration:pending` - 대기 중인 마이그레이션 파일을 표시합니다
- `migration:up` - 대기 중인 마이그레이션 파일을 실행합니다.
- `migration:down` - down 마이그레이션을 실행하여 이전 마이그레이션 파일을 되돌립니다

이 명령어들은 `FrameworkModule`을 import한 경우 애플리케이션에서 사용하거나, `@deepkit/sql`의 `deepkit-sql` command-line 도구를 통해 사용할 수 있습니다.

[FrameworkModule의 마이그레이션 통합](../framework/database.md#migration)은 Database를 자동으로 읽어오지만(Database를 provider로 정의해야 합니다), `deepkit-sql`을 사용하는 경우에는 데이터베이스를 export하는 TypeScript 파일을 지정해야 합니다. 후자는 Deepkit Framework 없이 Deepkit ORM을 독립적으로 사용하는 경우에 유용합니다.

## 마이그레이션 생성하기

```typescript
//database.ts
import { Database } from '@deepkit/orm';
import { SQLiteDatabaseAdapter } from '@deepkit/sqlite';
import { User } from './models';

export class SQLiteDatabase extends Database {
    name = 'default';
    constructor() {
        super(new SQLiteDatabaseAdapter('/tmp/myapp.sqlite'), [User]);
    }
}

export const database = new SQLiteDatabase();
```

```sh
./node_modules/.bin/deepkit-sql migration:create --path database.ts --migrationDir src/migrations
```

`--path`는 `Database` 인스턴스를 export하는 파일을 받습니다(여러 번 지정할 수 있습니다). 엔티티가 런타임 타입을 얻을 수 있도록 TypeScript 파일은 `ts-node`로 로드되므로, `ts-node`가 설치되어 있어야 합니다.

새 마이그레이션 파일이 `src/migrations`에 생성됩니다. 

새로 생성된 마이그레이션 파일에는 TypeScript 앱에 정의된 엔티티와 설정된 데이터베이스 간의 차이를 기반으로 한 up 및 down 메서드가 포함되어 있습니다. 
이제 필요에 따라 up 메서드를 수정할 수 있습니다. down 메서드는 up 메서드를 기반으로 자동 생성됩니다.
다른 개발자도 실행할 수 있도록 이 파일을 저장소에 커밋합니다.

## 대기 중인 마이그레이션

```sh
./node_modules/.bin/deepkit-sql migration:pending --path database.ts --migrationDir src/migrations
```

대기 중인 모든 마이그레이션을 표시합니다. 아직 실행되지 않은 새 마이그레이션 파일이 있다면 여기에 나열됩니다.

## 마이그레이션 실행하기

```sh
./node_modules/.bin/deepkit-sql migration:up --path database.ts --migrationDir src/migrations
```

다음 대기 중인 마이그레이션을 실행합니다. 

## 마이그레이션 되돌리기

```sh
./node_modules/.bin/deepkit-sql migration:down --path database.ts --migrationDir src/migrations
```

마지막으로 실행된 마이그레이션을 되돌립니다.

## Fake 마이그레이션

마이그레이션(up 또는 down)을 실행하려 했지만 실패했다고 가정해 봅시다. 문제를 수동으로 해결했지만, 이미 실행된 것으로 처리되어 마이그레이션을 다시 실행할 수 없습니다. 이때 `--fake` 옵션을 사용하여 마이그레이션을 fake 처리할 수 있으며, 이렇게 하면 실제로 실행하지 않고도 데이터베이스에 실행된 것으로 표시됩니다. 이 방법으로 다음 대기 중인 마이그레이션을 실행할 수 있습니다.

```sh
./node_modules/.bin/deepkit-sql migration:up --path database.ts --migrationDir src/migrations --fake
```
