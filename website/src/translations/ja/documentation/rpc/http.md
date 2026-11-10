# HTTP

Deepkit RPC は、[WebSocket](./websocket.md)、[TCP](./tcp.md)、[IPC](./ipc.md) に加えて、プレーンな HTTP 上でも動作します。各 action 呼び出しは、JSON レスポンスを返す 1 つの HTTP リクエストです。controller はそのままで、変わるのはクライアントのトランスポートだけです。

これは、永続的な接続が望ましくない、または不可能な場合に役立ちます。

- サーバーサイドレンダリング。ページの各リクエストが、それぞれ短命なクライアントでレンダリングされる場合。
- HTTP リクエストのみを転送する serverless および edge プラットフォーム。
- WebSocket 接続を通さないプロキシ、ロードバランサー、ファイアウォール。
- デバッグ。すべての呼び出しがブラウザのネットワークタブに表示され、`curl` で再実行できます。

呼び出しは引き続き完全に型付けされています。パラメータと結果は TypeScript の型に基づいてシリアライズされるため、`Date`、`bigint`、`Map`、`Set`、`Uint8Array`、enum、union、class は本来の型のまま届き、サーバーはすべてのパラメータをバリデーションします。

## サーバー

Deepkit アプリでは、`FrameworkModule` の `httpRpcBasePath` を設定します。これにより、すべての RPC controller が WebSocket に加えて、そのパス配下でも利用可能になります。

```typescript
import { App } from '@deepkit/app';
import { FrameworkModule } from '@deepkit/framework';
import { rpc } from '@deepkit/rpc';
import { MinLength } from '@deepkit/type';

class User {
    created: Date = new Date();

    constructor(public id: number, public name: string & MinLength<3>) {}
}

@rpc.controller('user')
class UserController {
    @rpc.action()
    add(a: number, b: number): number {
        return a + b;
    }

    @rpc.action()
    create(user: User): User {
        return user;
    }
}

new App({
    controllers: [UserController],
    imports: [new FrameworkModule({ httpRpcBasePath: 'api/v1' })],
}).run();
```

これで action は `/api/v1/user/add` と `/api/v1/user/create` でアクセスできるようになります。

## クライアント

`RpcClient` のトランスポートとして `RpcHttpClientAdapter` を使用します。それ以外の API は WebSocket の場合と同じです。

```typescript
import { RpcClient, RpcHttpClientAdapter } from '@deepkit/rpc';

const client = new RpcClient(new RpcHttpClientAdapter('https://example.com/api/v1'));
const user = client.controller<UserController>('user');

await user.add(2, 3); // 5
const created = await user.create(new User(1, 'Peter'));
created.created instanceof Date; // true
```

クライアントは、action の型を最初の呼び出し時に一度だけ取得し、それを使ってパラメータをシリアライズし、結果をデシリアライズします。WebSocket の場合と同様に、返される class は、サーバーが記述する型から構築された class のインスタンスです。プロパティは持っていますが、独自の class のメソッドは持っていません。

dependency injection を使うフロントエンドでは、`createRpcHttpClientProvider` がクライアントを提供します。引数を指定しない場合は、ページの origin が使用されます。

```typescript
import { createRpcHttpClientProvider } from '@deepkit/rpc';

providers: [createRpcHttpClientProvider('https://example.com/api/v1')];
```

### ヘッダーと HTTP 実装

`RpcHttpClientAdapter` の第 2 引数は、すべてのリクエストで送信されるヘッダーです。第 3 引数は `fetch` を置き換えます。たとえば Angular の `HttpClient` に置き換えることで、サーバーサイドレンダリングがレスポンスを再リクエストする代わりにブラウザへ転送できるようになります。

```typescript
import { HttpClient } from '@angular/common/http';
import { firstValueFrom } from 'rxjs';
import { RpcClient, RpcHttpClientAdapter, RpcHttpInterface, RpcHttpResponseInterface } from '@deepkit/rpc';

class AngularHttp implements RpcHttpInterface {
    constructor(private http: HttpClient) {}

    async fetch(url: string, options: { headers: { [name: string]: string }; method: string; body?: string }): Promise<RpcHttpResponseInterface> {
        const res = await firstValueFrom(
            this.http.request(options.method, url, { body: options.body, headers: options.headers, observe: 'response', responseType: 'json' }),
        );
        const headers: { [name: string]: string } = {};
        for (const key of res.headers.keys()) headers[key] = String(res.headers.get(key));
        return { status: res.status, headers, body: res.body };
    }
}

const client = new RpcClient(new RpcHttpClientAdapter('api/v1', {}, new AngularHttp(httpClient)));
```

Angular の transfer cache を使用する場合は、エラーを示すヘッダーである `RpcHttpHeaderNames` を含めてください。これにより、エラーレスポンスがブラウザでも引き続きエラーとして扱われます。

```typescript
import { RpcHttpHeaderNames } from '@deepkit/rpc';

provideClientHydration(withHttpTransferCacheOptions({ includeHeaders: RpcHttpHeaderNames, includePostRequests: true }));
```

## 認証

クライアントに設定されたトークンは、すべてのリクエストで `Authorization` ヘッダーとして送信されます。

```typescript
client.token.set('my-session-token');
```

サーバーは各リクエストを `RpcKernelSecurity.authenticate` で認証し(失敗した場合は `Authentication failed` が返され、理由はサーバー側でログに記録されます)、他の接続と同様に `hasControllerAccess` がアクセスの可否を判断します。先頭の `Bearer ` は、トークンが渡される前に取り除かれます。セッションは action 内で `SessionState` を通じて利用でき、`rpc` スコープのすべての provider を注入できます。

```typescript
import { RpcKernelSecurity, Session, SessionState, rpc } from '@deepkit/rpc';

class AppSecurity extends RpcKernelSecurity {
    async authenticate(token: any): Promise<Session> {
        const user = await findUserByToken(token);
        if (!user) throw new Error('Invalid token');
        return new Session(user.name, token);
    }
}

@rpc.controller('user')
class UserController {
    constructor(private session: SessionState) {}

    @rpc.action()
    whoami(): string {
        return this.session.getSession().username;
    }
}

new App({
    controllers: [UserController],
    providers: [{ provide: RpcKernelSecurity, useClass: AppSecurity, scope: 'rpc' }],
    imports: [new FrameworkModule({ httpRpcBasePath: 'api/v1' })],
});
```

ヘッダーであるため、トークンは文字列でなければなりません。トークンを持たないクライアントは匿名となります。

## リクエスト

プロトコルは十分にシンプルなので、Deepkit クライアントなしでも呼び出せます。

| リクエスト                                    | 内容                                                                           |
| --------------------------------------------- | ------------------------------------------------------------------------------ |
| `GET /api/v1/user/add?arg=2&arg=3`            | `add(2, 3)` を呼び出します。すべてのパラメータがプリミティブ値の場合にクライアントが使用します。 |
| `POST /api/v1/user/create` with `[{...}]`     | JSON 配列をパラメータとして `create(...)` を呼び出します。                     |
| `GET /api/v1/user/create.type`                | パラメータと結果の型。クライアントが一度だけ読み込みます。                     |

```bash
curl 'https://example.com/api/v1/user/add?arg=2&arg=3'
# 5

curl -X POST -H 'Content-Type: application/json' \
  -d '[{"id": 1, "name": "Peter"}]' https://example.com/api/v1/user/create
# {"created":"2026-01-02T03:04:05.000Z","id":1,"name":"Peter"}
```

クエリパラメータはパラメータの型に変換されるため、`number` パラメータに対する `?arg=2` は数値の `2` になります。レスポンスは JSON としてシリアライズされた結果です。たとえば、`Date` は ISO 文字列、`bigint` は文字列になります。

バリデーションの失敗を含むエラーは、`X-Rpc-Error` ヘッダーとともにエラーをボディとして返されます。クライアントはそれを再びスローし、その class が登録されている場合はその class でスローします([エラー](./errors)を参照)。

```json
{
    "classType": "@error:validation",
    "properties": {
        "name": "ValidationError",
        "errors": [{ "path": "user.name", "code": "minLength", "message": "Min length is 3", "value": "ab" }]
    }
}
```

## 制限事項

各呼び出しはそれぞれ独立したリクエストであり、レスポンスは 1 つの値です。接続を必要とするものはすべて、WebSocket または TCP 経由でのみ利用可能です。

- `Observable`、`Subject`、`BehaviorSubject`、`ProgressTracker`、`Collection` を返す action。HTTP 経由では、その旨を示すエラーで失敗します。
- アップロードとダウンロードの進捗、および back controller(サーバーがクライアントを呼び出すもの)。
- ピアツーピアメッセージとエンティティパッチ。

また、各呼び出しには完全な HTTP リクエストのコストがかかるため、既存の WebSocket や TCP 接続上の呼び出しよりも遅くなります。連続した多数の呼び出しやライブデータには、WebSocket を使用してください。

HTTP 経由では `bigint` にサイズ制限はありません。WebSocket と TCP 経由では、通常の `bigint` は 64 ビット整数です。より大きな値には `BinaryBigInt` を使用してください。
