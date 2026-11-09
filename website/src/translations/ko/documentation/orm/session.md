# 세션 / Unit Of Work

세션은 일종의 Unit Of Work입니다. 세션은 사용자가 수행하는 모든 작업을 추적하고, `commit()`이 호출될 때마다 변경 사항을 자동으로 기록합니다. 구문을 묶어서 매우 빠르게 실행하므로 데이터베이스의 변경 사항을 실행할 때 권장되는 방법입니다. 세션은 매우 가벼워서 예를 들어 요청-응답 라이프사이클 내에서도 쉽게 생성할 수 있습니다.

```typescript
import { SQLiteDatabaseAdapter } from '@deepkit/sqlite';
import { entity, PrimaryKey, AutoIncrement } from '@deepkit/type';
import { Database } from '@deepkit/orm';

async function main() {

    @entity.name('user')
    class User {
        id: number & PrimaryKey & AutoIncrement = 0;
        created: Date = new Date;

        constructor(public name: string) {
        }
    }

    const database = new Database(new SQLiteDatabaseAdapter(':memory:'), [User]);
    await database.migrate();

    const session = database.createSession();
    session.add(new User('User1'), new User('User2'), new User('User3'));

    await session.commit();

    const users = await session.query(User).find();
    console.log(users);
}

main();
```

`session.add(T)`로 세션에 새 인스턴스를 추가하거나 `session.remove(T)`로 기존 인스턴스를 제거할 수 있습니다. Session 객체의 사용이 끝나면 가비지 컬렉터가 제거할 수 있도록 모든 곳에서 참조를 해제하기만 하면 됩니다.

Session 객체를 통해 가져온 엔티티 인스턴스의 변경 사항은 자동으로 감지됩니다.

```typescript
const users = await session.query(User).find();
for (const user of users) {
    user.name += ' changed';
}

await session.commit();//모든 사용자를 저장합니다
```

## Identity Map

세션은 데이터베이스 항목당 JavaScript 객체가 항상 하나만 존재하도록 보장하는 Identity Map을 제공합니다. 예를 들어 동일한 세션 내에서 `session.query(User).find()`를 두 번 실행하면 서로 다른 두 개의 배열을 얻지만, 그 안에는 동일한 엔티티 인스턴스가 들어 있습니다.

`session.add(entity1)`로 새 엔티티를 추가한 후 다시 조회하면 정확히 동일한 엔티티 인스턴스 `entity1`을 얻습니다.

중요: 세션을 사용하기 시작했다면 `database.query` 대신 세션의 `session.query` Method를 사용해야 합니다. 세션 쿼리에서만 Identity Map 기능이 활성화됩니다.

## 변경 감지


각 커밋 후에는 모든 항목의 스냅샷이 생성되며, 다음 커밋은 이 스냅샷을 기준으로 변경 사항을 감지합니다. 세션이 항목을 삽입만 하고 이후에 변경하지 않는다면 `disableChangeDetection()`으로 스냅샷 생성을 건너뛸 수 있습니다. 이 경우 다음 커밋에서는 해당 항목의 변경 사항을 감지하지 않습니다.

```typescript
const session = database.createSession().disableChangeDetection();
session.add(...rows);
await session.commit();
```

## 요청/응답
