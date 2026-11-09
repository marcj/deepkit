# 查询

查询是一个对象,用于描述如何从数据库中检索或修改数据。它提供了多个用于描述查询的方法,以及用于执行查询的终止方法。数据库适配器可以通过多种方式扩展查询 API,以支持特定于数据库的功能。

你可以使用 `Database.query(T)` 或 `Session.query(T)` 创建查询。我们推荐使用 Session,因为它可以提升性能。

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

## 过滤

可以应用过滤器来限制结果集。

```typescript
//简单过滤器
const users = await database.query(User).filter({name: 'User1'}).find();

//多个过滤条件,全部以 AND 连接
const users = await database.query(User).filter({name: 'User1', id: 2}).find();

//范围过滤器:$gt、$lt、$gte、$lte(大于、小于……)
//等同于 WHERE created < NOW()
const users = await database.query(User).filter({created: {$lt: new Date}}).find();
//等同于 WHERE id > 500
const users = await database.query(User).filter({id: {$gt: 500}}).find();
//等同于 WHERE id >= 500
const users = await database.query(User).filter({id: {$gte: 500}}).find();

//集合过滤器:$in、$nin(in、not in)
//等同于 WHERE id IN (1, 2, 3)
const users = await database.query(User).filter({id: {$in: [1, 2, 3]}}).find();

//正则表达式过滤器
const users = await database.query(User).filter({username: {$regex: /User[0-9]+/}}).find();

//分组:$and、$nor、$or
//等同于 WHERE (username = 'User1') OR (username = 'User2')
const users = await database.query(User).filter({
    $or: [{username: 'User1'}, {username: 'User2'}]
}).find();


//嵌套分组
//等同于 WHERE username = 'User1' OR (username = 'User2' and id > 0)
const users = await database.query(User).filter({
    $or: [{username: 'User1'}, {username: 'User2', id: {$gt: 0}}]
}).find();


//嵌套分组
//等同于 WHERE username = 'User1' AND (created < NOW() OR id > 0)
const users = await database.query(User).filter({
    $and: [{username: 'User1'}, {$or: [{created: {$lt: new Date}, id: {$gt: 0}}]}]
}).find();
```

### 等于

### 大于 / 小于

### 正则表达式

### AND/OR 分组

### In

## Select

要缩小从数据库接收的字段范围,可以使用 `select('field1')`。

```typescript
const user = await database.query(User).select('username').findOne();
const user = await database.query(User).select('id', 'username').findOne();
```

需要注意的是,一旦使用 `select` 缩小了字段范围,结果就不再是实体的实例,而只是对象字面量。

```
const user = await database.query(User).select('username').findOne();
user instanceof User; //false
```

## 排序

使用 `orderBy(field, order)` 可以更改条目的顺序。
可以多次执行 `orderBy`,以逐步细化排序。

```typescript
const users = await session.query(User).orderBy('created', 'desc').find();
const users = await session.query(User).orderBy('created', 'asc').find();
```

## 分页

可以使用 `itemsPerPage()` 和 `page()` 方法对结果进行分页。页码从 1 开始。

```typescript
const users = await session.query(User).itemsPerPage(50).page(1).find();
```

也可以使用替代方法 `limit` 和 `skip` 手动分页。

```typescript
const users = await session.query(User).limit(5).skip(10).find();
```

[#database-join]
## Join

默认情况下,实体中的引用既不会包含在查询中,也不会被加载。要在查询中包含 join 但不加载引用,请使用 `join()`(left join)或 `innerJoin()`。要在查询中包含 join 并加载引用,请使用 `joinWith()` 或 `innerJoinWith()`。

以下所有示例均假定使用这些模型 schema:

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
//仅选择已分配 group 的用户(INNER JOIN)
const users = await session.query(User).innerJoin('group').find();
for (const user of users) {
    user.group; //错误,因为引用未被加载
}
```

```typescript
//仅选择已分配 group 的用户(INNER JOIN)并加载关系
const users = await session.query(User).innerJoinWith('group').find();
for (const user of users) {
    user.group.name; //正常工作
}
```

要修改 join 查询,请使用带 `use` 前缀的相同方法:`useJoin`、`useInnerJoin`、`useJoinWith` 或 `useInnerJoinWith`。要结束对 join 查询的修改,请使用 `end()` 返回父查询。

```typescript
//仅选择已分配名称为 'admins' 的 group 的用户(INNER JOIN)
const users = await session.query(User)
    .useInnerJoinWith('group')
        .filter({name: 'admins'})
        .end()  // 返回父查询
    .find();

for (const user of users) {
    user.group.name; //始终为 admin
}
```

## 聚合

聚合方法允许你统计记录数量并对字段进行聚合。

以下示例均假定使用此模型 schema:

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

`groupBy` 允许按指定字段对结果进行分组。

```typescript
await database.persist(
    cast<File>({path: 'file1', category: 'images'}),
    cast<File>({path: 'file2', category: 'images'}),
    cast<File>({path: 'file3', category: 'pdfs'})
);

//[ { category: 'images' }, { category: 'pdfs' } ]
await session.query(File).groupBy('category').find();
```

有多种聚合方法:`withSum`、`withAverage`、`withCount`、`withMin`、`withMax`、`withGroupConcat`。每个方法都需要将字段名作为第一个参数,并可通过可选的第二个参数更改别名。

```typescript
// 首先更新一些记录:
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

使用 `returning` 可以在通过 `patch` 和 `delete` 进行更改时请求返回额外的字段。

注意:并非所有数据库适配器都以原子方式返回字段。请使用事务来确保数据一致性。

```typescript
await database.query(User).patchMany({visits: 0});

//{ modified: 1, returning: { visits: [ 5 ] }, primaryKeys: [ 1 ] }
const result = await database.query(User)
    .filter({username: 'User1'})
    .returning('username', 'visits')
    .patchOne({$inc: {visits: 5}});
```

## Find

返回与指定过滤器匹配的条目数组。

```typescript
const users: User[] = await database.query(User).filter({username: 'Peter'}).find();
```

## FindOne

返回与指定过滤器匹配的一个条目。
如果未找到条目,则抛出 `ItemNotFound` 错误。

```typescript
const users: User = await database.query(User).filter({username: 'Peter'}).findOne();
```

## FindOneOrUndefined

返回与指定过滤器匹配的一个条目。
如果未找到条目,则返回 undefined。

```typescript
const query = database.query(User).filter({username: 'Peter'});
const users: User|undefined = await query.findOneOrUndefined();
```

## FindField

返回与指定过滤器匹配的某个字段的列表。

```typescript
const usernames: string[] = await database.query(User).findField('username');
```

## FindOneField

返回与指定过滤器匹配的某个字段的列表。
如果未找到条目,则抛出 `ItemNotFound` 错误。

```typescript
const username: string = await database.query(User).filter({id: 3}).findOneField('username');
```

## Patch

Patch 是一种变更查询,用于修补查询所描述的记录。`patchOne` 和 `patchMany` 方法会结束查询并执行修补。

`patchMany` 会更改数据库中与指定过滤器匹配的所有记录。如果未设置过滤器,则会更改整张表。使用 `patchOne` 可以每次仅更改一个条目。

```typescript
await database.query(User).filter({username: 'Peter'}).patch({username: 'Peter2'});

await database.query(User).filter({username: 'User1'}).patchOne({birthdate: new Date});
await database.query(User).filter({username: 'User1'}).patchOne({$inc: {visits: 1}});

await database.query(User).patchMany({visits: 0});
```

## Delete

`deleteMany` 会删除数据库中与指定过滤器匹配的所有条目。
如果未设置过滤器,则会删除整张表。使用 `deleteOne` 可以每次仅删除一个条目。

```typescript
const result = await database.query(User)
    .filter({visits: 0})
    .deleteMany();

const result = await database.query(User).filter({id: 4}).deleteOne();
```

结果的 `modified` 中包含已删除条目的数量。已删除条目的主键只有在使用 `returnPrimaryKeys()` 时才可用,因为读取它们会使删除操作变慢。未使用该方法时读取 `primaryKeys` 会抛出 `PrimaryKeysNotReturnedError`,在事件监听器中也是如此。

```typescript
const result = await database.query(User)
    .filter({logins: 0})
    .returnPrimaryKeys()
    .deleteMany();
result.primaryKeys; //[{id: 4}, {id: 7}]
```

## Has

返回数据库中是否至少存在一个条目。

```typescript
const userExists: boolean = await database.query(User).filter({username: 'Peter'}).has();
```

## Count

返回条目的数量。

```typescript
const userCount: number = await database.query(User).count();
```

## Lift

Lift 查询意味着为其添加新功能。这通常由插件或复杂架构使用,以便将较大的查询类拆分为多个方便且可复用的类。

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
