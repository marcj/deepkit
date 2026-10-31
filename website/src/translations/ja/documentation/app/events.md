# イベントシステム

イベントシステムは、同一プロセス内のアプリケーションコンポーネントがイベントの送信とリッスンによって通信できるようにします。これにより、互いを直接は認識していないかもしれない関数間でのメッセージ交換を容易にし、コードのモジュール化に役立ちます。

アプリケーションやライブラリは、処理の特定のポイントで追加の関数を実行する機会を提供します。これらの追加の関数は「イベントリスナー」として自身を登録します。

イベントはさまざまな形を取ります:

- アプリケーションの起動またはシャットダウン。
- 新しいユーザーの作成または削除。
- エラーがスローされる。
- 新しい HTTP リクエストを受信する。

Deepkit Framework と関連ライブラリは、ユーザーがリッスンして応答できるさまざまなイベントを提供します。さらに、必要に応じて好きなだけカスタムイベントを作成できる柔軟性もあり、アプリケーションをモジュール的に拡張できます。

## 使い方

Deepkit のアプリを使用している場合、イベントシステムはすでに含まれており、すぐに使用できます。

```typescript
import { App, onAppExecute } from '@deepkit/app';

const app = new App();

app.listen(onAppExecute, async (event) => {
    console.log('MyEvent triggered!');
});

app.run();
```

イベントは `listen()` メソッドを使用するか、`@eventDispatcher.listen` デコレーターを使用するクラスによって登録できます:

```typescript
import { App, onAppExecute } from '@deepkit/app';
import { eventDispatcher } from '@deepkit/event';

class MyListener {
    @eventDispatcher.listen(onAppExecute)
    onMyEvent(event: typeof onAppExecute.event) {
        console.log('MyEvent triggered!');
    }
}

const app = new App({
    listeners: [MyListener],
});
app.run();
```

## イベントトークン

Deepkit のイベントシステムの中心には Event Token があります。これは、イベント ID とイベントの型の両方を指定するユニークなオブジェクトです。イベントトークンは主に次の 2 つの目的を果たします。

- イベントをトリガーする役割。
- トリガーしたイベントをリッスンする役割。

イベントトークンを使ってイベントが開始されると、そのトークンの所有者が事実上イベントの発生源として認識されます。トークンは、イベントに関連付けられたデータを決定し、非同期のイベントリスナーが利用できるかどうかを指定します。

```typescript
import { EventToken } from '@deepkit/event';

const MyEvent = new EventToken('my-event');

app.listen(MyEvent, (event) => {
    console.log('MyEvent triggered!');
});

//app 参照経由でトリガー
await app.dispatch(MyEvent);

//または EventDispatcher を使用。App の DI コンテナが自動的に注入します
app.command('test', async (dispatcher: EventDispatcher) => {
    await dispatcher.dispatch(MyEvent);
});
```

### カスタムイベントデータの作成:

@deepkit/event の `DataEventToken` を使用する:

```typescript
import { DataEventToken } from '@deepkit/event';

class User {
}

const MyEvent = new DataEventToken<User>('my-event');
```

BaseEvent を拡張する:

```typescript
class MyEvent extends BaseEvent {
    user: User = new User;
}

const MyEventToken = new EventToken<MyEvent>('my-event');
```

## 関数型リスナー

関数型リスナーでは、シンプルな関数のコールバックをディスパッチャーに直接登録できます。方法は次のとおりです:

```typescript
app.listen(MyEvent, (event) => {
    console.log('MyEvent triggered!');
});
```

`logger: Logger` のような追加の引数を導入したい場合、Deepkit のランタイム型リフレクションにより、依存性注入システムによって自動的に注入されます。

```typescript
app.listen(MyEvent, (event, logger: Logger) => {
    console.log('MyEvent triggered!');
});
```

最初の引数は必ずイベント自体でなければならない点に注意してください。この引数を省略することはできません。

`@deepkit/app` を使用している場合、app.listen() を使って関数型リスナーを登録することもできます。

```typescript
import { App } from '@deepkit/app';

new App()
    .listen(MyEvent, (event) => {
        console.log('MyEvent triggered!');
    })
    .run();
```

## クラスベースのリスナー

クラスリスナーは、デコレーターを付与したクラスです。イベントをリッスンするための構造化された方法を提供します。

```typescript
import { App } from '@deepkit/app';

class MyListener {
    @eventDispatcher.listen(UserAdded)
    onUserAdded(event: typeof UserAdded.event) {
        console.log('User added!', event.user.username);
    }
}

new App({
    listeners: [MyListener],
}).run();
```

クラスリスナーでは、依存性注入はメソッドの引数またはコンストラクターを通して機能します。

## 依存性注入

Deepkit のイベントシステムは強力な依存性注入メカニズムを備えています。関数型リスナーを使用する場合、ランタイム型リフレクションシステムのおかげで、追加の引数が自動的に注入されます。同様に、クラスベースのリスナーもコンストラクターまたはメソッドの引数を通じて依存性注入をサポートします。

例えば、関数型リスナーの場合、`logger: Logger` のような引数を追加すると、関数が呼び出される際に適切な Logger インスタンスが自動的に提供されます。

```typescript
import { App } from '@deepkit/app';
import { Logger } from '@deepkit/logger';

new App()
    .listen(MyEvent, (event, logger: Logger) => {
        console.log('MyEvent triggered!');
    })
    .run();
```

## イベント伝播

すべてのイベントオブジェクトには stop() Function が備わっており、イベントの伝播を制御できます。イベントが停止されると、その後に追加された順序でのリスナーは実行されません。これは、特定の条件でイベント処理を停止する必要があるシナリオで特に有用で、イベントの実行と処理をきめ細かく制御できます。

例えば:

```typescript
dispatcher.listen(MyEventToken, (event) => {
    if (someCondition) {
        event.stop();
    }
    // さらなる処理
});
```

Deepkit フレームワークのイベントシステムにより、開発者はモジュール性が高く、スケーラブルで、メンテナブルなアプリケーションを容易に構築できます。イベントシステムを理解することで、特定の出来事や条件に基づいてアプリケーションの挙動を柔軟に調整できます。

## フレームワークのイベント

Deepkit Framework 自体にも、アプリケーションサーバーから発火する複数のイベントがあり、リッスンできます。

_関数型リスナー_

```typescript
import { onServerMainBootstrap } from '@deepkit/framework';
import { onAppExecute } from '@deepkit/app';

new App({
    imports: [new FrameworkModule]
})
    .listen(onAppExecute, (event) => {
        console.log('Command about to execute');
    })
    .listen(onServerMainBootstrap, (event) => {
        console.log('Server started');
    })
    .run();
```

| 名前                        | 説明                                                                                                                           |
|-----------------------------|--------------------------------------------------------------------------------------------------------------------------------|
| onServerBootstrap           | アプリケーションサーバーのブートストラップ時（メインプロセスおよびワーカー）に一度だけ呼び出されます。                         |
| onServerBootstrapDone       | アプリケーションサーバーが起動した直後に、ブートストラップ時（メインプロセスおよびワーカー）に一度だけ呼び出されます。        |
| onServerMainBootstrap       | アプリケーションサーバーのブートストラップ時（メインプロセス）に一度だけ呼び出されます。                                       |
| onServerMainBootstrapDone   | アプリケーションサーバーが起動した直後に、ブートストラップ時（メインプロセス）に一度だけ呼び出されます。                      |
| onServerWorkerBootstrap     | アプリケーションサーバーのブートストラップ時（ワーカープロセス）に一度だけ呼び出されます。                                     |
| onServerWorkerBootstrapDone | アプリケーションサーバーが起動した直後に、ブートストラップ時（ワーカープロセス）に一度だけ呼び出されます。                    |
| onServerShutdownEvent       | アプリケーションサーバーがシャットダウンするとき（マスタープロセスと各ワーカー）に呼び出されます。                            |
| onServerMainShutdown        | アプリケーションサーバーがメインプロセスでシャットダウンするときに呼び出されます。                                             |
| onServerWorkerShutdown      | アプリケーションサーバーがワーカープロセスでシャットダウンするときに呼び出されます。                                           |
| onAppExecute                | コマンドが実行されようとしているとき。                                                                                         |
| onAppExecuted               | コマンドが正常に実行されたとき。                                                                                               |
| onAppError                  | コマンドの実行に失敗したとき。                                                                                                 |
| onAppShutdown               | アプリケーションがシャットダウンしようとしているとき。                                                                         |

## 低レベル API

以下は @deepkit/event の低レベル API の例です。Deepkit App を使用する場合、イベントリスナーは EventDispatcher を通じて直接登録されるのではなく、モジュールを介して登録されます。とはいえ、必要であれば低レベル API も使用できます。

```typescript
import { EventDispatcher, EventToken } from '@deepkit/event';

//最初の引数には、依存性注入のために依存関係を解決する Injector コンテキストを渡せます
const dispatcher = new EventDispatcher();
const MyEvent = new EventToken('my-event');

dispatcher.listen(MyEvent, (event) => {
    console.log('MyEvent triggered!');
});
dispatcher.dispatch(MyEvent);

```

### インストール

イベントシステムは @deepkit/app に含まれています。スタンドアロンで使用したい場合は、手動でインストールできます:

インストール手順は [イベント](../package/event.md) を参照してください。