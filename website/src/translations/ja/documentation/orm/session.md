# セッション / Unit Of Work

セッションは Unit Of Work のようなものです。行ったすべての操作を追跡し、`commit()` が呼び出されるたびに変更を自動的に記録します。ステートメントを非常に高速に実行できるようにまとめるため、データベースの変更を実行する際に推奨される方法です。セッションは非常に軽量で、たとえばリクエスト-レスポンスのライフサイクル内で簡単に作成できます。

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

`session.add(T)` で新しいインスタンスをセッションに追加し、`session.remove(T)` で既存のインスタンスを削除します。Session オブジェクトの使用が終わったら、ガベージコレクタが回収できるように、すべての参照を解除するだけで済みます。

Session オブジェクトを介して取得した Entity インスタンスの変更は、自動的に検出されます。

```typescript
const users = await session.query(User).find();
for (const user of users) {
    user.name += ' changed';
}

await session.commit();//すべてのユーザーを保存します
```

## Identity Map

セッションは、データベースの 1 エントリにつき JavaScript オブジェクトが常に 1 つだけ存在することを保証する Identity Map を提供します。たとえば、同じセッション内で `session.query(User).find()` を 2 回実行すると、異なる 2 つの配列が返されますが、その中には同じ Entity インスタンスが含まれています。

`session.add(entity1)` で新しい Entity を追加して再度取得すると、まったく同じ Entity インスタンス `entity1` が返されます。

重要: セッションを使い始めたら、`database.query` ではなく `session.query` メソッドを使用してください。Identity Map 機能が有効になるのは、セッションのクエリのみです。

## 変更検出


各コミットの後に、すべてのアイテムのスナップショットが作成され、次のコミットではこのスナップショットをもとに変更が検出されます。セッションでアイテムの挿入のみを行い、その後に変更しない場合は、`disableChangeDetection()` によってスナップショットの作成をスキップできます。この場合、次のコミットではそのアイテムの変更は検出されません。

```typescript
const session = database.createSession().disableChangeDetection();
session.add(...rows);
await session.commit();
```

## リクエスト/レスポンス
