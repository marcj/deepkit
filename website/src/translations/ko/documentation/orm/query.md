# 쿼리

쿼리는 데이터베이스에서 데이터를 조회하거나 수정하는 방법을 기술하는 객체입니다. 쿼리를 기술하는 여러 메서드와 이를 실행하는 종료 메서드를 제공합니다. 데이터베이스 어댑터는 데이터베이스 고유 기능을 지원하기 위해 다양한 방식으로 쿼리 API를 확장할 수 있습니다.

`Database.query(T)` 또는 `Session.query(T)`를 사용하여 쿼리를 생성할 수 있습니다. 성능이 향상되므로 Session 사용을 권장합니다.

```typescript
@entity.name('user')
class User {
    id: number & PrimaryKey & AutoIncrement = 0;
    created: Date = new Date;
    birthdate?: Date;
    visits: number = 0;

    constructor(public username: string) {
    }
}

const database = new Database(...);

//[ { username: 'User1' }, { username: 'User2' }, { username: 'User2' } ]
const users = await database.query(User).select('username').find();
```

## 필터

필터를 적용하여 결과 집합을 제한할 수 있습니다.

```typescript
//단순 필터
const users = await database.query(User).filter({name: 'User1'}).find();

//다중 필터, 모두 AND
const users = await database.query(User).filter({name: 'User1', id: 2}).find();

//범위 필터: $gt, $lt, $gte, $lte (초과, 미만, ...)
//WHERE created < NOW()와 동일
const users = await database.query(User).filter({created: {$lt: new Date}}).find();
//WHERE id > 500과 동일
const users = await database.query(User).filter({id: {$gt: 500}}).find();
//WHERE id >= 500과 동일
const users = await database.query(User).filter({id: {$gte: 500}}).find();

//집합 필터: $in, $nin (in, not in)
//WHERE id IN (1, 2, 3)과 동일
const users = await database.query(User).filter({id: {$in: [1, 2, 3]}}).find();

//정규식 필터
const users = await database.query(User).filter({username: {$regex: /User[0-9]+/}}).find();

//그룹화: $and, $nor, $or
//WHERE (username = 'User1') OR (username = 'User2')와 동일
const users = await database.query(User).filter({
    $or: [{username: 'User1'}, {username: 'User2'}]
}).find();


//중첩 그룹화
//WHERE username = 'User1' OR (username = 'User2' and id > 0)과 동일
const users = await database.query(User).filter({
    $or: [{username: 'User1'}, {username: 'User2', id: {$gt: 0}}]
}).find();


//중첩 그룹화
//WHERE username = 'User1' AND (created < NOW() OR id > 0)과 동일
const users = await database.query(User).filter({
    $and: [{username: 'User1'}, {$or: [{created: {$lt: new Date}, id: {$gt: 0}}]}]
}).find();
```

### 같음

### 크거나 작음

### RegExp

### AND/OR 그룹화

### In

## Select

데이터베이스에서 가져올 필드를 좁히려면 `select('field1')`를 사용할 수 있습니다.

```typescript
const user = await database.query(User).select('username').findOne();
const user = await database.query(User).select('id', 'username').findOne();
```

`select`를 사용하여 필드를 좁히는 순간 결과는 더 이상 엔티티의 인스턴스가 아니라 객체 리터럴이 된다는 점에 유의해야 합니다.

```
const user = await database.query(User).select('username').findOne();
user instanceof User; //false
```

## 정렬

`orderBy(field, order)`를 사용하면 항목의 순서를 변경할 수 있습니다.
`orderBy`를 여러 번 실행하여 순서를 점점 더 세밀하게 지정할 수 있습니다.

```typescript
const users = await session.query(User).orderBy('created', 'desc').find();
const users = await session.query(User).orderBy('created', 'asc').find();
```

## 페이지네이션

`itemsPerPage()`와 `page()` 메서드를 사용하여 결과를 페이지 단위로 나눌 수 있습니다. 페이지는 1부터 시작합니다.

```typescript
const users = await session.query(User).itemsPerPage(50).page(1).find();
```

대체 메서드인 `limit`과 `skip`을 사용하면 수동으로 페이지네이션할 수 있습니다.

```typescript
const users = await session.query(User).limit(5).skip(10).find();
```

[#database-join]
## Join

기본적으로 엔티티의 reference는 쿼리에 포함되지도 로드되지도 않습니다. reference를 로드하지 않고 쿼리에 join을 포함하려면 `join()`(left join) 또는 `innerJoin()`을 사용하세요. 쿼리에 join을 포함하고 reference도 로드하려면 `joinWith()` 또는 `innerJoinWith()`를 사용하세요.

다음의 모든 예제는 아래 모델 스키마를 전제로 합니다:

```typescript
@entity.name('group')
class Group {
    id: number & PrimaryKey & AutoIncrement = 0;
    created: Date = new Date;

    constructor(public username: string) {
    }
}

@entity.name('user')
class User {
    id: number & PrimaryKey & AutoIncrement = 0;
    created: Date = new Date;

    group?: Group & Reference;

    constructor(public username: string) {
    }
}
```

```typescript
//group이 할당된 user만 선택 (INNER JOIN)
const users = await session.query(User).innerJoin('group').find();
for (const user of users) {
    user.group; //reference가 로드되지 않았으므로 error 발생
}
```

```typescript
//group이 할당된 user만 선택 (INNER JOIN)하고 relation을 로드
const users = await session.query(User).innerJoinWith('group').find();
for (const user of users) {
    user.group.name; //정상 동작
}
```

join 쿼리를 수정하려면 동일한 메서드에 `use` 접두사를 붙여 사용하세요: `useJoin`, `useInnerJoin`, `useJoinWith` 또는 `useInnerJoinWith`. join 쿼리 수정을 끝내려면 `end()`를 사용하여 상위 쿼리로 돌아갑니다.

```typescript
//이름이 'admins'인 group이 할당된 user만 선택 (INNER JOIN)
const users = await session.query(User)
    .useInnerJoinWith('group')
        .filter({name: 'admins'})
        .end()  // 상위 쿼리로 돌아감
    .find();

for (const user of users) {
    user.group.name; //항상 admin
}
```

## 집계

집계 메서드를 사용하면 레코드 수를 세고 필드를 집계할 수 있습니다.

다음 예제는 아래 모델 스키마를 전제로 합니다:

```typescript
@entity.name('file')
class File {
    id: number & PrimaryKey & AutoIncrement = 0;
    created: Date = new Date;

    downloads: number = 0;

    category: string = 'none';

    constructor(public path: string & Index) {
    }
}
```

`groupBy`를 사용하면 지정한 필드로 결과를 그룹화할 수 있습니다.

```typescript
await database.persist(
    cast<File>({path: 'file1', category: 'images'}),
    cast<File>({path: 'file2', category: 'images'}),
    cast<File>({path: 'file3', category: 'pdfs'})
);

//[ { category: 'images' }, { category: 'pdfs' } ]
await session.query(File).groupBy('category').find();
```

집계 메서드에는 `withSum`, `withAverage`, `withCount`, `withMin`, `withMax`, `withGroupConcat`이 있습니다. 각 메서드는 첫 번째 인수로 필드 이름이 필요하며, 별칭을 변경하기 위한 선택적 두 번째 인수를 받습니다.

```typescript
// 먼저 일부 레코드를 업데이트합니다:
await database.query(File).filter({path: 'images/file1'}).patchOne({$inc: {downloads: 15}});
await database.query(File).filter({path: 'images/file2'}).patchOne({$inc: {downloads: 5}});

//[{ category: 'images', downloads: 20 },{ category: 'pdfs', downloads: 0 }]
await session.query(File).groupBy('category').withSum('downloads').find();

//[{ category: 'images', downloads: 10 },{ category: 'pdfs', downloads: 0 }]
await session.query(File).groupBy('category').withAverage('downloads').find();

//[ { category: 'images', amount: 2 }, { category: 'pdfs', amount: 1 } ]
await session.query(File).groupBy('category').withCount('id', 'amount').find();
```

## Returning

`returning`을 사용하면 `patch`와 `delete`로 변경할 때 추가 필드를 요청할 수 있습니다.

주의: 모든 데이터베이스 어댑터가 필드를 원자적으로 반환하는 것은 아닙니다. 데이터 일관성을 보장하려면 트랜잭션을 사용하세요.

```typescript
await database.query(User).patchMany({visits: 0});

//{ modified: 1, returning: { visits: [ 5 ] }, primaryKeys: [ 1 ] }
const result = await database.query(User)
    .filter({username: 'User1'})
    .returning('username', 'visits')
    .patchOne({$inc: {visits: 5}});
```

## Find

지정한 필터와 일치하는 항목의 배열을 반환합니다.

```typescript
const users: User[] = await database.query(User).filter({username: 'Peter'}).find();
```

## FindOne

지정한 필터와 일치하는 항목을 반환합니다.
항목을 찾지 못하면 `ItemNotFound` error가 발생합니다.

```typescript
const users: User = await database.query(User).filter({username: 'Peter'}).findOne();
```

## FindOneOrUndefined

지정한 필터와 일치하는 항목을 반환합니다.
항목을 찾지 못하면 undefined를 반환합니다.

```typescript
const query = database.query(User).filter({username: 'Peter'});
const users: User|undefined = await query.findOneOrUndefined();
```

## FindField

지정한 필터와 일치하는 필드의 목록을 반환합니다.

```typescript
const usernames: string[] = await database.query(User).findField('username');
```

## FindOneField

지정한 필터와 일치하는 필드의 목록을 반환합니다.
항목을 찾지 못하면 `ItemNotFound` error가 발생합니다.

```typescript
const username: string = await database.query(User).filter({id: 3}).findOneField('username');
```

## Patch

Patch는 쿼리에 기술된 레코드를 패치하는 변경 쿼리입니다. `patchOne`과 `patchMany` 메서드는 쿼리를 종료하고 패치를 실행합니다.

`patchMany`는 지정한 필터와 일치하는 데이터베이스의 모든 레코드를 변경합니다. 필터를 설정하지 않으면 테이블 전체가 변경됩니다. 한 번에 하나의 항목만 변경하려면 `patchOne`을 사용하세요.

```typescript
await database.query(User).filter({username: 'Peter'}).patch({username: 'Peter2'});

await database.query(User).filter({username: 'User1'}).patchOne({birthdate: new Date});
await database.query(User).filter({username: 'User1'}).patchOne({$inc: {visits: 1}});

await database.query(User).patchMany({visits: 0});
```

## Delete

`deleteMany`는 지정한 필터와 일치하는 데이터베이스의 모든 항목을 삭제합니다.
필터를 설정하지 않으면 테이블 전체가 삭제됩니다. 한 번에 하나의 항목만 삭제하려면 `deleteOne`을 사용하세요.

```typescript
const result = await database.query(User)
    .filter({visits: 0})
    .deleteMany();

const result = await database.query(User).filter({id: 4}).deleteOne();
```

결과의 `modified`에는 삭제된 항목의 수가 담깁니다. 삭제된 항목의 기본 키는 이를 읽어오면 삭제가 느려지므로 `returnPrimaryKeys()`를 사용할 때만 얻을 수 있습니다. 이를 사용하지 않고 `primaryKeys`를 읽으면 이벤트 리스너 내부에서도 `PrimaryKeysNotReturnedError`가 발생합니다.

```typescript
const result = await database.query(User)
    .filter({logins: 0})
    .returnPrimaryKeys()
    .deleteMany();
result.primaryKeys; //[{id: 4}, {id: 7}]
```

## Has

데이터베이스에 항목이 하나 이상 존재하는지 여부를 반환합니다.

```typescript
const userExists: boolean = await database.query(User).filter({username: 'Peter'}).has();
```

## Count

항목의 수를 반환합니다.

```typescript
const userCount: number = await database.query(User).count();
```

## Lift

쿼리를 lift한다는 것은 쿼리에 새로운 기능을 추가하는 것을 의미합니다. 이는 일반적으로 플러그인이나 복잡한 아키텍처에서 큰 쿼리 클래스를 사용하기 편리하고 재사용 가능한 여러 클래스로 분할하는 데 사용됩니다.

```typescript
import { FilterQuery, Query } from '@deepkit/orm';

class UserQuery<T extends {birthdate?: Date}> extends Query<T>  {
    hasBirthday() {
        const start = new Date();
        start.setHours(0,0,0,0);
        const end = new Date();
        end.setHours(23,59,59,999);

        return this.filter({$and: [{birthdate: {$gte: start}}, {birthdate: {$lte: end}}]} as FilterQuery<T>);
    }
}

await session.query(User).lift(UserQuery).hasBirthday().find();
```
