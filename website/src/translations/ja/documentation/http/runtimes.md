# サーバーとランタイム

HTTP kernel は独自のサーバーを必要としません。同じコントローラーを持つ同じアプリが、Deepkit Framework サーバー、独自の Node.js サーバー、Express や Fastify の中、Bun、Deno、Cloudflare Workers の `fetch` ハンドラーの背後、そして AWS Lambda で動作します。

| エントリーポイント | 用途 |
|---|---|
| `FrameworkModule` | 完全なアプリケーション：サーバー、ワーカー、HTTPS、圧縮、CLI、デバッガー |
| `kernel.handleRequestMaybeSync(req, res)` | 独自の `node:http` / `node:https` サーバー |
| `kernel.createMiddleware()` | Express、Connect、Fastify（`@fastify/middie` 使用）への Deepkit ルートのマウント |
| `kernel.fetch(request)` | `Bun.serve`、`Deno.serve`、Cloudflare Workers、その他 Web 標準の `Request`/`Response` ハンドラーを持つすべての環境 |
| `createLambdaHandler(kernel)` | API Gateway（HTTP API および REST API）、Function URL、Application Load Balancer の背後の AWS Lambda |

すべての例は次のアプリを使用します：

```typescript
import { App } from '@deepkit/app';
import { http, HttpBody, HttpKernel, HttpModule } from '@deepkit/http';
import { MinLength } from '@deepkit/type';

class UserController {
    @http.GET('/hello')
    hello() {
        return { hello: 'world' };
    }

    @http.POST('/user')
    create(body: HttpBody<{ name: string & MinLength<3> }>) {
        return { id: 1, name: body.name };
    }
}

const app = new App({
    controllers: [UserController],
    imports: [new HttpModule()],
});
const kernel = app.get(HttpKernel);
```

## Deepkit Framework サーバー

`FrameworkModule` を使用すると、サーバーはすでに組み込まれており、`server:start` で起動します。HTTPS、圧縮、複数のワーカープロセス、グレースフルシャットダウン、HTTP アクセスログ、デバッガーが含まれています。

```typescript
import { FrameworkModule } from '@deepkit/framework';

new App({
    controllers: [UserController],
    imports: [new FrameworkModule({
        port: 8080,
        compression: 6,
        workers: 4,
    })],
}).run();
```

```sh
ts-node app.ts server:start
```

## 独自の Node.js サーバー

リクエストオブジェクトを変換する必要がないように、Deepkit のリクエストクラスを `createServer` に渡します：

```typescript
import { createServer } from 'http';
import { HttpRequest, HttpResponse } from '@deepkit/http';

createServer(
    { IncomingMessage: HttpRequest, ServerResponse: HttpResponse as any },
    (req, res) => kernel.handleRequestMaybeSync(req, res),
).listen(8080);
```

`handleRequestMaybeSync` は、リクエストが非同期で処理される場合（例えば `async` コントローラーの場合）にのみ promise を返します。`handleRequest` は常に promise を返します。

## Express、Fastify など

`createMiddleware` は Connect スタイルのミドルウェアを返します。`fallThroughOnNotFound` を使用すると、一致する Deepkit ルートがないリクエストは 404 で応答される代わりに次のミドルウェアに渡されます。

```typescript
import express from 'express';

const server = express();
server.use(kernel.createMiddleware({ fallThroughOnNotFound: true }));
server.get('/legacy', (req, res) => res.send('handled by express'));
server.listen(8080);
```

## Fetch ハンドラー

`kernel.fetch(request)` は Web 標準の `Request` を受け取り、`Response` を返します。同期ルートの場合、`Response` は promise なしで直接返されます。

### Bun

```typescript
Bun.serve({
    port: 8080,
    fetch: request => kernel.fetch(request),
});
```

Bun の `node:http` 互換レイヤーではなく `Bun.serve` を使用してください。リクエストあたりの CPU 時間が約半分になります。[パフォーマンス](./performance.md)を参照してください。

### Deno

```typescript
Deno.serve({ port: 8080 }, request => kernel.fetch(request));
```

### Cloudflare Workers

Workers には `nodejs_compat` フラグが必要です：

```toml
# wrangler.toml
compatibility_date = "2026-01-01"
compatibility_flags = ["nodejs_compat"]
```

Workers では、コード生成（`new Function`）はワーカーの起動中にのみ許可され、リクエストの処理中には許可されません。Deepkit はルーター、バリデーター、シリアライザーを JavaScript にコンパイルするため、モジュールレベルで `kernel.warmUp()` を呼び出してください。これにより、リクエストに必要なものがすべて事前にコンパイルされます：

```typescript
const kernel = app.get(HttpKernel);
kernel.warmUp();

export default {
    fetch: (request: Request) => kernel.fetch(request),
};
```

ファイルアップロード（ファイルを含む `multipart/form-data`）は Workers ではサポートされていません。アップロードされたファイルは一時ファイルに書き込まれますが、Workers にはファイルシステムがないためです。

### AWS Lambda

`createLambdaHandler` は kernel を Lambda ハンドラーに変換します。API Gateway HTTP API および Function URL のイベント（ペイロード形式 2.0）と、REST API および Application Load Balancer のイベント（ペイロード形式 1.0）を読み取り、バイナリボディを base64 エンコードして返します。

```typescript
import { createLambdaHandler } from '@deepkit/http';

const kernel = app.get(HttpKernel);
// 最初の呼び出し時ではなく、Lambda の init フェーズ中にコンパイルする
kernel.warmUp();

export const handler = createLambdaHandler(kernel);
```

アプリは Lambda インスタンスごとに一度作成され、その後そのインスタンスのすべての呼び出しを処理します。

### Node.js サーバーとの違い

- リクエストボディは、ルートが呼び出される前に完全に読み込まれます。JSON ボディはテキストとして読み込まれます。
- レスポンスは終了した時点で送信されます。返されたストリームは収集され、1 つのボディとして送信されます。
- クライアントのアドレスは Web 標準の `Request` には含まれていません。`request.getRemoteAddress()` が必要な場合は、オプションとして渡してください。`createLambdaHandler` はイベントからアドレスを取得します。

```typescript
// Bun
Bun.serve({
    fetch: (request, server) => kernel.fetch(request, { remoteAddress: server.requestIP(request)?.address }),
});

// Deno
Deno.serve((request, info) => kernel.fetch(request, { remoteAddress: info.remoteAddr.hostname }));
```

- `HttpRequest` と `HttpResponse` はその API（`headers`、`setHeader`、`writeHead`、`readBody()` など）を維持しているため、コントローラー、リスナー、ミドルウェアは変更なしで動作します。

## warmUp()

Deepkit は、各ルートのパラメーター解析、バリデーション、シリアライズを最初に必要になった時点でコンパイルします。`kernel.warmUp()` はこれをすべてのルートに対して事前に行います：

- 起動時にのみコード生成を許可する Cloudflare Workers では必須
- 最初のリクエストの前に init フェーズが実行される Lambda やその他のサーバーレスプラットフォームでは推奨
- 長時間稼働するサーバーでは、ルートごとの最初のリクエストのレイテンシーを解消

## サーバーなしでのテスト

どちらの方法でも、ネットワークを使わずに完全なリクエスト処理を実行します：

```typescript
import { HttpRequest } from '@deepkit/http';

const response = await kernel.request(HttpRequest.POST('/user').json({ name: 'Peter' }));
expect(response.json).toEqual({ id: 1, name: 'Peter' });

const fetched = await kernel.fetch(new Request('http://localhost/hello'));
expect(await fetched.json()).toEqual({ hello: 'world' });
```
