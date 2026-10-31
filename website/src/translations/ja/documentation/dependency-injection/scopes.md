# スコープ

デフォルトでは、DI コンテナのすべてのプロバイダーはシングルトンであり、一度だけインスタンス化されます。つまり、UserRepository の例では、実行全体を通して常に UserRepository のインスタンスは 1 つだけです。ユーザーが "new" キーワードで手動で作成しない限り、2 つ目のインスタンスが作成されることはありません。

しかし、プロバイダーを短時間だけ、または特定のイベント中だけインスタンス化すべきさまざまなユースケースがあります。そのようなイベントは、たとえば HTTP リクエストや RPC 呼び出しです。これは、各イベントごとに新しいインスタンスが作成され、そのインスタンスが使用されなくなった後は自動的に（ガーベジコレクタによって）除去されることを意味します。

HTTP リクエストはスコープの典型的な例です。たとえば、セッション、ユーザーオブジェクト、その他のリクエスト関連のプロバイダーなどをこのスコープに登録できます。スコープを作成するには、任意のスコープ名を選び、プロバイダーにそのスコープを指定します。

```typescript
import { InjectorContext } from '@deepkit/injector';

class UserSession {}

const injector = InjectorContext.forProviders([
    {provide: UserSession, scope: 'http'}
]);
```

スコープを指定すると、そのプロバイダーは DI コンテナから直接取得できなくなるため、次の呼び出しは失敗します。

```typescript
const session = injector.get(UserSession); //例外をスロー
```

代わりに、スコープ付きの DI コンテナを作成する必要があります。これは HTTP リクエストが来るたびに行われます。

```typescript
const httpScope = injector.createChildScope('http');
```

このスコープに登録されたプロバイダーだけでなく、スコープを定義していないすべてのプロバイダーも、このスコープ付き DI コンテナから取得できます。

```typescript
const session = httpScope.get(UserSession); //動作する
```

すべてのプロバイダーはデフォルトでシングルトンであるため、各スコープ付きコンテナ内では `get(UserSession)` を呼び出すたびに常に同じインスタンスが返されます。複数のスコープ付きコンテナを作成すると、複数の UserSession が作成されます。

スコープ付き DI コンテナは、外部から動的に値を設定できます。たとえば、HTTP スコープでは HttpRequest と HttpResponse オブジェクトを簡単にセットできます。

```typescript
const injector = InjectorContext.forProviders([
    {provide: HttpResponse, scope: 'http'},
    {provide: HttpRequest, scope: 'http'},
]);

httpServer.on('request', (req, res) => {
    const httpScope = injector.createChildScope('http');
    httpScope.set(HttpRequest, req);
    httpScope.set(HttpResponse, res);
});
```

Deepkit フレームワークを使用するアプリケーションには、デフォルトで `http`、`rpc`、`cli` のスコープがあります。詳しくはそれぞれ [CLI](../app.md)、[HTTP](../http.md)、[RPC](../rpc.md) の章を参照してください。