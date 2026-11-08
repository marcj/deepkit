
# Query

A query is an object that describes how to retrieve or modify data from the database. It has several methods to describe the query and termination methods that execute them. The database adapter can extend the query API in many ways to support database specific features.

You can create a query using `Database.query(T)` or `Session.query(T)`. We recommend Sessions as it improves performance.

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

## Filter

A filter can be applied to limit the result set.

```typescript
//simple filters
const users = await database.query(User).filter({name: 'User1'}).find();

//multiple filters, all AND
const users = await database.query(User).filter({name: 'User1', id: 2}).find();

//range filter: $gt, $lt, $gte, $lte (greater than, lower than, ...)
//equivalent to WHERE created < NOW()
const users = await database.query(User).filter({created: {$lt: new Date}}).find();
//equivalent to WHERE id > 500
const users = await database.query(User).filter({id: {$gt: 500}}).find();
//equivalent to WHERE id >= 500
const users = await database.query(User).filter({id: {$gte: 500}}).find();

//set filter: $in, $nin (in, not in)
//equivalent to WHERE id IN (1, 2, 3)
const users = await database.query(User).filter({id: {$in: [1, 2, 3]}}).find();

//regex filter
const users = await database.query(User).filter({username: {$regex: /User[0-9]+/}}).find();

//grouping: $and, $nor, $or
//equivalent to WHERE (username = 'User1') OR (username = 'User2')
const users = await database.query(User).filter({
    $or: [{username: 'User1'}, {username: 'User2'}]
}).find();


//nested grouping
//equivalent to WHERE username = 'User1' OR (username = 'User2' and id > 0)
const users = await database.query(User).filter({
    $or: [{username: 'User1'}, {username: 'User2', id: {$gt: 0}}]
}).find();


//nested grouping
//equivalent to WHERE username = 'User1' AND (created < NOW() OR id > 0)
const users = await database.query(User).filter({
    $and: [{username: 'User1'}, {$or: [{created: {$lt: new Date}, id: {$gt: 0}}]}]
}).find();
```

### Equal

### Greater / Smaller

### RegExp

### Grouping AND/OR

### In

## Select

To narrow down the fields to be received from the database, `select('field1')` can be used.

```typescript
const user = await database.query(User).select('username').findOne();
const user = await database.query(User).select('id', 'username').findOne();
```

It is important to note that as soon as the fields are narrowed down using `select`, the results are no longer instances of the entity, but only object literals.

```
const user = await database.query(User).select('username').findOne();
user instanceof User; //false
```

## Order

With `orderBy(field, order)` the order of the entries can be changed.
Several times `orderBy` can be executed to refine the order more and more.

```typescript
const users = await session.query(User).orderBy('created', 'desc').find();
const users = await session.query(User).orderBy('created', 'asc').find();
```

## Pagination

The `itemsPerPage()` and `page()` methods can be used to paginate the results. Page starts at 1.

```typescript
const users = await session.query(User).itemsPerPage(50).page(1).find();
```

With the alternative methods `limit` and `skip` you can paginate manually.

```typescript
const users = await session.query(User).limit(5).skip(10).find();
```

[#database-join]
## Join

By default, references from the entity are neither included in queries nor loaded. To include a join in the query without loading the reference, use `join()` (left join) or `innerJoin()`. To include a join in the query and load the reference, use `joinWith()` or `innerJoinWith()`.

All the following examples assume these model schemas:

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
//select only users with a group assigned (INNER JOIN)
const users = await session.query(User).innerJoin('group').find();
for (const user of users) {
    user.group; //error, since reference was not loaded
}
```

```typescript
//select only users with a group assigned (INNER JOIN) and load the relation
const users = await session.query(User).innerJoinWith('group').find();
for (const user of users) {
    user.group.name; //works
}
```

To modify join queries, use the same methods, but with the `use` prefix: `useJoin`, `useInnerJoin`, `useJoinWith` or `useInnerJoinWith`. To end the join query modification, use `end()` to get back the parent query.

```typescript
//select only users with a group with name 'admins' assigned (INNER JOIN)
const users = await session.query(User)
    .useInnerJoinWith('group')
        .filter({name: 'admins'})
        .end()  // returns to the parent query
    .find();

for (const user of users) {
    user.group.name; //always admin
}
```

## Aggregation

Aggregation methods allow you to count records and aggregate fields.

The following examples assume this model scheme:

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

`groupBy` allows to group the result by the specified field.

```typescript
await database.persist(
    cast<File>({path: 'file1', category: 'images'}),
    cast<File>({path: 'file2', category: 'images'}),
    cast<File>({path: 'file3', category: 'pdfs'})
);

//[ { category: 'images' }, { category: 'pdfs' } ]
await session.query(File).groupBy('category').find();
```

There are several aggregation methods: `withSum`, `withAverage`, `withCount`, `withMin`, `withMax`, `withGroupConcat`. Each requires a field name as the first argument and an optional second argument to change the alias.

```typescript
// first let's update some of the records:
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

With `returning` additional fields can be requested in case of changes via `patch` and `delete`.

Caution: Not all database adapters return fields atomically. Use transactions to ensure data consistency.

```typescript
await database.query(User).patchMany({visits: 0});

//{ modified: 1, returning: { visits: [ 5 ] }, primaryKeys: [ 1 ] }
const result = await database.query(User)
    .filter({username: 'User1'})
    .returning('username', 'visits')
    .patchOne({$inc: {visits: 5}});
```

## Find

Returns an array of entries matching the specified filter.

```typescript
const users: User[] = await database.query(User).filter({username: 'Peter'}).find();
```

## FindOne

Returns an item that matches the specified filter.
If no item is found, an `ItemNotFound` error is thrown.

```typescript
const users: User = await database.query(User).filter({username: 'Peter'}).findOne();
```

## FindOneOrUndefined

Returns an entry that matches the specified filter.
If no entry is found, undefined is returned.

```typescript
const query = database.query(User).filter({username: 'Peter'});
const users: User|undefined = await query.findOneOrUndefined();
```

## FindField

Returns a list of a field that match the specified filter.

```typescript
const usernames: string[] = await database.query(User).findField('username');
```

## FindOneField

Returns a list of a field that match the specified filter.
If no entry is found, an `ItemNotFound` error is thrown.

```typescript
const username: string = await database.query(User).filter({id: 3}).findOneField('username');
```

## Patch

Patch is a change query that patches the records described in the query. The methods
`patchOne` and `patchMany` finish the query and execute the patch.

`patchMany` changes all records in the database that match the specified filter. If no filter is set, the whole table will be changed. Use `patchOne` to change only one entry at a time.

```typescript
await database.query(User).filter({username: 'Peter'}).patch({username: 'Peter2'});

await database.query(User).filter({username: 'User1'}).patchOne({birthdate: new Date});
await database.query(User).filter({username: 'User1'}).patchOne({$inc: {visits: 1}});

await database.query(User).patchMany({visits: 0});
```

## Delete

`deleteMany` deletes all entries in the database that match the specified filter.
If no filter is set, the whole table will be deleted. Use `deleteOne` to delete only one entry at a time.

```typescript
const result = await database.query(User)
    .filter({visits: 0})
    .deleteMany();

const result = await database.query(User).filter({id: 4}).deleteOne();
```

The result contains the number of deleted items in `modified`. The primary keys of the deleted items are only available with `returnPrimaryKeys()`, since reading them makes the delete slower. Reading `primaryKeys` without it throws a `PrimaryKeysNotReturnedError`, also inside event listeners.

```typescript
const result = await database.query(User)
    .filter({logins: 0})
    .returnPrimaryKeys()
    .deleteMany();
result.primaryKeys; //[{id: 4}, {id: 7}]
```

## Has

Returns whether at least one entry exists in the database.

```typescript
const userExists: boolean = await database.query(User).filter({username: 'Peter'}).has();
```

## Count

Returns the number of entries.

```typescript
const userCount: number = await database.query(User).count();
```

## Lift

Lifting a query means adding new functionality to it. This is usually used either by plugins or complex architectures to split larger query classes into several convenient, reusable classes.

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
