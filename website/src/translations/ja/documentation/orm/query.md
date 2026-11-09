# クエリ

クエリは、データベースからデータを取得または変更する方法を記述するオブジェクトです。クエリを記述するための複数のメソッドと、クエリを実行する終端メソッドを備えています。データベースアダプターは、データベース固有の機能をサポートするために、さまざまな方法でクエリ API を拡張できます。

クエリは `Database.query(T)` または `Session.query(T)` を使用して作成できます。パフォーマンスが向上するため、Session の使用を推奨します。

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

## フィルター

フィルターを適用すると、結果セットを絞り込めます。

```typescript
//単純なフィルター
const users = await database.query(User).filter({name: 'User1'}).find();

//複数のフィルター（すべて AND）
const users = await database.query(User).filter({name: 'User1', id: 2}).find();

//範囲フィルター: $gt, $lt, $gte, $lte (より大きい、より小さい、...)
//WHERE created < NOW() と同等
const users = await database.query(User).filter({created: {$lt: new Date}}).find();
//WHERE id > 500 と同等
const users = await database.query(User).filter({id: {$gt: 500}}).find();
//WHERE id >= 500 と同等
const users = await database.query(User).filter({id: {$gte: 500}}).find();

//集合フィルター: $in, $nin (in, not in)
//WHERE id IN (1, 2, 3) と同等
const users = await database.query(User).filter({id: {$in: [1, 2, 3]}}).find();

//正規表現フィルター
const users = await database.query(User).filter({username: {$regex: /User[0-9]+/}}).find();

//グループ化: $and, $nor, $or
//WHERE (username = 'User1') OR (username = 'User2') と同等
const users = await database.query(User).filter({
    $or: [{username: 'User1'}, {username: 'User2'}]
}).find();


//ネストされたグループ化
//WHERE username = 'User1' OR (username = 'User2' and id > 0) と同等
const users = await database.query(User).filter({
    $or: [{username: 'User1'}, {username: 'User2', id: {$gt: 0}}]
}).find();


//ネストされたグループ化
//WHERE username = 'User1' AND (created < NOW() OR id > 0) と同等
const users = await database.query(User).filter({
    $and: [{username: 'User1'}, {$or: [{created: {$lt: new Date}, id: {$gt: 0}}]}]
}).find();
```

### 等価

### より大きい / より小さい

### 正規表現

### AND/OR によるグループ化

### In

## Select

データベースから受け取るフィールドを絞り込むには、`select('field1')` を使用できます。

```typescript
const user = await database.query(User).select('username').findOne();
const user = await database.query(User).select('id', 'username').findOne();
```

`select` を使用してフィールドを絞り込むと、結果はエンティティのインスタンスではなく、単なるオブジェクトリテラルになる点に注意してください。

```
const user = await database.query(User).select('username').findOne();
user instanceof User; //false
```

## 並び順

`orderBy(field, order)` を使用すると、エントリの並び順を変更できます。
`orderBy` を複数回実行することで、並び順をさらに細かく指定できます。

```typescript
const users = await session.query(User).orderBy('created', 'desc').find();
const users = await session.query(User).orderBy('created', 'asc').find();
```

## ページネーション

`itemsPerPage()` メソッドと `page()` メソッドを使用すると、結果をページネーションできます。ページは 1 から始まります。

```typescript
const users = await session.query(User).itemsPerPage(50).page(1).find();
```

代替メソッドの `limit` と `skip` を使用すると、手動でページネーションできます。

```typescript
const users = await session.query(User).limit(5).skip(10).find();
```

[#database-join]
## Join

デフォルトでは、エンティティの参照はクエリに含まれず、ロードもされません。参照をロードせずにクエリに join を含めるには、`join()`（left join）または `innerJoin()` を使用します。クエリに join を含めて参照もロードするには、`joinWith()` または `innerJoinWith()` を使用します。

以下の例はすべて、次のモデルスキーマを前提としています。

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
//グループが割り当てられたユーザーのみを選択 (INNER JOIN)
const users = await session.query(User).innerJoin('group').find();
for (const user of users) {
    user.group; //参照がロードされていないためエラー
}
```

```typescript
//グループが割り当てられたユーザーのみを選択 (INNER JOIN) し、リレーションをロード
const users = await session.query(User).innerJoinWith('group').find();
for (const user of users) {
    user.group.name; //動作する
}
```

join クエリを変更するには、同じメソッドに `use` プレフィックスを付けた `useJoin`、`useInnerJoin`、`useJoinWith`、`useInnerJoinWith` を使用します。join クエリの変更を終了するには、`end()` を使用して親クエリに戻ります。

```typescript
//名前が 'admins' のグループが割り当てられたユーザーのみを選択 (INNER JOIN)
const users = await session.query(User)
    .useInnerJoinWith('group')
        .filter({name: 'admins'})
        .end()  // 親クエリに戻る
    .find();

for (const user of users) {
    user.group.name; //常に admin
}
```

## 集計

集計メソッドを使用すると、レコードをカウントしたり、フィールドを集計したりできます。

以下の例は、次のモデルスキーマを前提としています。

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

`groupBy` を使用すると、指定したフィールドで結果をグループ化できます。

```typescript
await database.persist(
    cast<File>({path: 'file1', category: 'images'}),
    cast<File>({path: 'file2', category: 'images'}),
    cast<File>({path: 'file3', category: 'pdfs'})
);

//[ { category: 'images' }, { category: 'pdfs' } ]
await session.query(File).groupBy('category').find();
```

集計メソッドには、`withSum`、`withAverage`、`withCount`、`withMin`、`withMax`、`withGroupConcat` があります。いずれも第 1 引数にフィールド名を必要とし、オプションの第 2 引数でエイリアスを変更できます。

```typescript
// まず、いくつかのレコードを更新します:
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

`returning` を使用すると、`patch` および `delete` による変更時に追加のフィールドを要求できます。

注意: すべてのデータベースアダプターがフィールドをアトミックに返すわけではありません。データの整合性を確保するには、トランザクションを使用してください。

```typescript
await database.query(User).patchMany({visits: 0});

//{ modified: 1, returning: { visits: [ 5 ] }, primaryKeys: [ 1 ] }
const result = await database.query(User)
    .filter({username: 'User1'})
    .returning('username', 'visits')
    .patchOne({$inc: {visits: 5}});
```

## Find

指定したフィルターに一致するエントリの配列を返します。

```typescript
const users: User[] = await database.query(User).filter({username: 'Peter'}).find();
```

## FindOne

指定したフィルターに一致するアイテムを返します。
アイテムが見つからない場合は、`ItemNotFound` エラーがスローされます。

```typescript
const users: User = await database.query(User).filter({username: 'Peter'}).findOne();
```

## FindOneOrUndefined

指定したフィルターに一致するエントリを返します。
エントリが見つからない場合は、undefined を返します。

```typescript
const query = database.query(User).filter({username: 'Peter'});
const users: User|undefined = await query.findOneOrUndefined();
```

## FindField

指定したフィルターに一致するフィールドのリストを返します。

```typescript
const usernames: string[] = await database.query(User).findField('username');
```

## FindOneField

指定したフィルターに一致するフィールドのリストを返します。
エントリが見つからない場合は、`ItemNotFound` エラーがスローされます。

```typescript
const username: string = await database.query(User).filter({id: 3}).findOneField('username');
```

## Patch

Patch は、クエリで記述されたレコードにパッチを適用する変更クエリです。`patchOne` メソッドと `patchMany` メソッドはクエリを終了し、パッチを実行します。

`patchMany` は、指定したフィルターに一致するデータベース内のすべてのレコードを変更します。フィルターが設定されていない場合は、テーブル全体が変更されます。一度に 1 つのエントリのみを変更するには、`patchOne` を使用してください。

```typescript
await database.query(User).filter({username: 'Peter'}).patch({username: 'Peter2'});

await database.query(User).filter({username: 'User1'}).patchOne({birthdate: new Date});
await database.query(User).filter({username: 'User1'}).patchOne({$inc: {visits: 1}});

await database.query(User).patchMany({visits: 0});
```

## Delete

`deleteMany` は、指定したフィルターに一致するデータベース内のすべてのエントリを削除します。
フィルターが設定されていない場合は、テーブル全体が削除されます。一度に 1 つのエントリのみを削除するには、`deleteOne` を使用してください。

```typescript
const result = await database.query(User)
    .filter({visits: 0})
    .deleteMany();

const result = await database.query(User).filter({id: 4}).deleteOne();
```

結果の `modified` には、削除されたアイテムの数が含まれます。削除されたアイテムの primary key は、読み取ると削除処理が遅くなるため、`returnPrimaryKeys()` を使用した場合にのみ取得できます。これを使用せずに `primaryKeys` を読み取ると、イベントリスナー内であっても `PrimaryKeysNotReturnedError` がスローされます。

```typescript
const result = await database.query(User)
    .filter({logins: 0})
    .returnPrimaryKeys()
    .deleteMany();
result.primaryKeys; //[{id: 4}, {id: 7}]
```

## Has

データベースに少なくとも 1 つのエントリが存在するかどうかを返します。

```typescript
const userExists: boolean = await database.query(User).filter({username: 'Peter'}).has();
```

## Count

エントリの数を返します。

```typescript
const userCount: number = await database.query(User).count();
```

## Lift

クエリを Lift するとは、クエリに新しい機能を追加することを意味します。これは通常、プラグインや複雑なアーキテクチャにおいて、大きなクエリクラスを便利で再利用可能な複数のクラスに分割するために使用されます。

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
