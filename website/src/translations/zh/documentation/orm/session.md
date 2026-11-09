# Session / 工作单元

Session 类似于一个工作单元。它会跟踪你所做的一切，并在每次调用 `commit()` 时自动记录这些更改。它是在数据库中执行更改的首选方式，因为它会以一种非常高效的方式对语句进行批量处理。Session 非常轻量，例如可以很方便地在请求-响应生命周期中创建。

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

使用 `session.add(T)` 将新实例添加到 Session 中，或使用 `session.remove(T)` 移除现有实例。使用完 Session 对象后，只需在所有地方解除对它的引用，垃圾回收器便可将其回收。

对于通过 Session 对象获取的实体实例，其更改会被自动检测。

```typescript
const users = await session.query(User).find();
for (const user of users) {
    user.name += ' changed';
}

await session.commit();//保存所有用户
```

## Identity Map

Session 提供了 Identity Map，可确保每条数据库记录只对应一个 JavaScript 对象。例如，如果在同一个 Session 中运行两次 `session.query(User).find()`，你会得到两个不同的数组，但其中包含的是相同的实体实例。

如果使用 `session.add(entity1)` 添加一个新实体，然后再次检索它，你得到的正是同一个实体实例 `entity1`。

重要提示：一旦开始使用 Session，就应该使用其 `session.query` 方法，而不是 `database.query`。只有 Session 查询才启用了 Identity Map 功能。

## 变更检测


每次提交后，都会为每个条目创建快照，下一次提交时将基于该快照检测更改。如果 Session 只插入条目，之后不再修改它们，可以使用 `disableChangeDetection()` 跳过快照。这样，下一次提交便不会检测其条目的任何更改。

```typescript
const session = database.createSession().disableChangeDetection();
session.add(...rows);
await session.commit();
```

## 请求/响应
