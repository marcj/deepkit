# セキュリティ

Deepkit HTTP は、すべての入力を TypeScript の型に基づいて検証し、内部のエラー詳細をクライアントに漏らしません。認証、認可、CORS、セキュリティヘッダー、レート制限はフレームワークにハードコードされていません。代わりに、[HTTP イベント](./events.md)または[ミドルウェア](./middleware.md)を使って実装するため、アプリケーションに正確に適合させることができます。

このページでは、組み込みの保護機能と、それ以外の機能を利用可能な API で実装する方法を紹介します。

## 入力のバリデーション

すべてのルートパラメータ（path、query、header、body）は、ルートが呼び出される前に宣言された型に変換され、検証されます。無効なデータを含むリクエストがあなたのコードに到達することはなく、ステータス 400 で応答されます。これは、インジェクション攻撃や不正な形式のデータに対する最初の防御線です。

```typescript
import { http, HttpBody, HttpQuery } from '@deepkit/http';
import { Email, MaxLength, Maximum, MinLength, Pattern, Positive } from '@deepkit/type';

const slug = /^[a-z0-9-]+$/;

class RegisterBody {
    email!: Email;
    username!: string & MinLength<3> & MaxLength<32> & Pattern<typeof slug>;
}

class UserController {
    @http.POST('/register')
    register(body: HttpBody<RegisterBody>) {
        // body は有効な RegisterBody であることが保証されています
    }

    @http.GET('/users')
    list(limit: HttpQuery<number & Positive & Maximum<100>> = 20) {
        // limit は 1 から 100 までの数値です
    }
}
```

```sh
$ curl -X POST http://localhost:8080/register -H 'Content-Type: application/json' -d '{"email": "nope", "username": "a"}'
{"message":"Validation error:...","errors":[{"path":"email","code":"pattern",...},{"path":"username","code":"minLength",...}]}
```

型に含まれないプロパティは body から削除されます。クライアントが `{"email": "...", "username": "peter", "isAdmin": true}` を送信した場合、コントローラーは `isAdmin` を含まないオブジェクトを受け取ります。body の型にクライアントが設定を許可されたプロパティのみが含まれている限り、これによりマスアサインメントの脆弱性を防ぐことができます。完全なエンティティではなく、専用の body 型（または `Pick<User, 'email' | 'username'>`）を使用してください。

文字列の長さと配列のサイズは `MaxLength` で、数値の範囲は `Maximum`/`Minimum` で制限し、クライアントが任意に大きな値をデータベースやビジネスロジックに送信できないようにしてください。

利用可能なすべての型については、[入力と出力](./input-output.md)および[バリデーション](../runtime-types/validation.md)を参照してください。

## 認証

認証は `httpWorkflow.onAuth` イベントで行うのが最適です。このイベントはルートが解決された後、ルートパラメータが解決される前に実行されるため、ルートとそのメタデータにアクセスできます。イベントリスナーは依存性注入コンテナによって作成されるため、独自のサービスを注入できます。

次の例では、bearer トークンを読み取り、ユーザーを読み込み、それを `request.store` に保存します。HTTP スコープのプロバイダーにより、依存性注入を介してコントローラーでユーザーを利用できるようになります。

```typescript
import { App } from '@deepkit/app';
import { eventDispatcher } from '@deepkit/event';
import { FrameworkModule } from '@deepkit/framework';
import { http, HttpRequest, HttpUnauthorizedError, httpWorkflow } from '@deepkit/http';

class User {
    constructor(public id: number, public role: 'admin' | 'user') {
    }
}

class UserRepository {
    async findByToken(token: string): Promise<User | undefined> {
        //データベースでトークンを検索します
        return undefined;
    }
}

class AuthListener {
    constructor(private users: UserRepository) {
    }

    @eventDispatcher.listen(httpWorkflow.onAuth)
    async onAuth(event: typeof httpWorkflow.onAuth.event) {
        const header = event.request.headers.authorization;
        if (!header?.startsWith('Bearer ')) return;

        const user = await this.users.findByToken(header.slice('Bearer '.length));
        if (user) event.request.store.user = user;
    }
}

class ProfileController {
    @http.GET('/me')
    me(user: User) {
        return { id: user.id };
    }
}

new App({
    controllers: [ProfileController],
    providers: [
        UserRepository,
        {
            provide: User, scope: 'http',
            useFactory(request: HttpRequest): User {
                if (!request.store.user) throw new HttpUnauthorizedError('Not logged in');
                return request.store.user;
            }
        },
    ],
    listeners: [AuthListener],
    imports: [new FrameworkModule()],
}).run();
```

```sh
$ curl http://localhost:8080/me
{"message":"Not logged in"}  # ステータス 401
$ curl http://localhost:8080/me -H 'Authorization: Bearer secret-token'
{"id":2}
```

これで、`User` パラメータを宣言するすべてのルートはログイン済みユーザーを必要とし、それを宣言しないルートはパブリックのままとなります。ファクトリーで throw された `HttpUnauthorizedError` は 401 レスポンスに変換されます。

bearer トークンの代わりに、同じ方法でセッション cookie や API キーヘッダーを読み取ったり、JWT を検証したりできます。リスナー内でリクエスト body を読み取るには（例: ログインフォーム）、body は非同期にパースされるため、`HttpRequestParser<T>` を使用します:

```typescript
import { HttpRequestParser, httpWorkflow } from '@deepkit/http';

app.listen(httpWorkflow.onAuth, async (event, parser: HttpRequestParser<{ apiKey?: string }>) => {
    const data = await parser();
    //data.apiKey はヘッダー、body、またはクエリから取得されます
});
```

別の選択肢として[パラメータリゾルバー](./input-output.md#resolver)があり、これはユーザーを使用するルートでのみユーザーを解決します。

## 認可

ルートを特定のユーザーに制限するには、ルートにメタデータを付与し、リスナーでそれをチェックします。ルートは `.group()` によるグループと、`.data()` による任意の値をサポートしています。どちらも、すべての HTTP イベントで `event.route` を介して利用できます。

```typescript
class AdminController {
    @http.GET('/admin/stats').data('role', 'admin')
    stats(user: User) {
        return { users: 1000 };
    }

    @http.GET('/admin/users').group('admin')
    users(user: User) {
        return [];
    }
}

app.listen(httpWorkflow.onAuth, (event) => {
    const user: User | undefined = event.request.store.user;

    const role = event.route.data.get('role');
    if (role && user?.role !== role) {
        event.accessDenied();
        return;
    }

    if (event.route.groups.includes('admin') && user?.role !== 'admin') {
        event.accessDenied();
    }
}, 10);
```

3 番目の引数はリスナーの順序です。`10` を指定すると、認証リスナー（デフォルトの順序 `0`）の後に実行されるため `request.store.user` はすでに設定されており、かつ HTTP モジュールのデフォルトハンドラー（順序 `100`）の前に実行されます。あるいは、両方を同じリスナーで行うこともできます。

関数型ルーターでは、`groups` および `data` オプションを使用します:

```typescript
router.get({ path: '/admin/stats', data: { role: 'admin' }, groups: ['admin'] }, (user: User) => {
    return { users: 1000 };
});
```

`event.accessDenied()` は `accessDenied` ワークフロー状態にジャンプし、デフォルトではステータス 403 で応答します。コントローラー内では、`HttpAccessDeniedError` を throw することで同じことができます。読み込んだデータに依存するチェック（例: 「このユーザーはこのドキュメントの所有者か？」）は、コントローラーまたはサービスで行います:

```typescript
import { HttpAccessDeniedError, HttpNotFoundError } from '@deepkit/http';

class DocumentController {
    @http.GET('/document/:id')
    async get(id: number, user: User, documents: DocumentRepository) {
        const document = await documents.find(id);
        if (!document) throw new HttpNotFoundError();
        if (document.ownerId !== user.id) throw new HttpAccessDeniedError();
        return document;
    }
}
```

アクセス拒否時のレスポンスを変更するには、`httpWorkflow.onAccessDenied` をリッスンします:

```typescript
import { httpWorkflow, JSONResponse } from '@deepkit/http';

app.listen(httpWorkflow.onAccessDenied, (event) => {
    if (event.sent) return;
    event.send(new JSONResponse({ message: 'Access denied' }, 403));
});
```

## エラーハンドリング

HTTP エラーではないエラー（例: 失敗したデータベースクエリ）は、サーバー上でログに記録され、汎用的な `500 Internal error` で応答されます。スタックトレースやエラーメッセージは、環境に関係なくクライアントに送信されることはありません。

```typescript
class MyController {
    @http.GET('/crash')
    crash() {
        throw new Error('Connection to db.internal:5432 failed');
    }
}
```

```sh
$ curl http://localhost:8080/crash
Internal error
```

`HttpNotFoundError` や `HttpBadRequestError` などの HTTP エラーのメッセージは、クライアント向けのものであるため、クライアントに送信*されます*。これらに内部情報を含めないでください。バリデーションエラーには、パス、エラーコード、および無効な値が含まれます。

エラーレスポンスを変更するには、`httpWorkflow.onControllerError`（コントローラーで throw されたエラー）および `httpWorkflow.onParametersFailed`（パラメータ解決中のエラー、例: バリデーションエラー）をリッスンします。[HTTP エラー](./input-output.md#http-errors)を参照してください。

## リクエストサイズとタイムアウト

`multipart/form-data` および `application/x-www-form-urlencoded` リクエストの body は、HTTP 設定の `parser` オプションで構成できる制限付きでパースされます:

```typescript
new App({
    imports: [
        new FrameworkModule({
            http: {
                parser: {
                    maxFileSize: 10 * 1024 * 1024,      //ファイルごと、デフォルト 200 MB
                    maxTotalFileSize: 20 * 1024 * 1024, //リクエストのすべてのファイル、デフォルト maxFileSize
                    maxFiles: 5,                        //デフォルト Infinity
                    maxFields: 100,                     //デフォルト 1000
                    maxFieldsSize: 1024 * 1024,         //ファイル以外のすべてのフィールドの合計、デフォルト 20 MB
                },
            },
        }),
    ],
}).run();
```

フレームワークなしで `HttpModule` を使用する場合は、同じオプションを `new HttpModule({ parser: {...} })` に渡します。ファイル制限を超えたリクエストは、コントローラーが呼び出される前に `413 Payload Too Large`（`HttpPayloadTooLargeError`）で拒否されます。

JSON body には組み込みのサイズ制限がありません。`Content-Length` ヘッダーをチェックするミドルウェアで制限してください。ミドルウェアは body が読み取られる前に実行されるため、大きすぎる body がパースされることはありません:

```typescript
import { httpMiddleware, HttpRequest, HttpResponse } from '@deepkit/http';

function bodyLimit(maxBytes: number) {
    return (request: HttpRequest, response: HttpResponse, next: (err?: any) => void) => {
        const length = Number(request.headers['content-length'] || 0);
        if (length > maxBytes) {
            response.writeHead(413, { 'Content-Type': 'text/plain' });
            response.end('Payload too large');
            return;
        }
        next();
    };
}

new App({
    middlewares: [httpMiddleware.for(bodyLimit(1024 * 1024))],
    imports: [new FrameworkModule()],
}).run();
```

`Transfer-Encoding: chunked` のリクエストには `Content-Length` ヘッダーがありません。本番環境では、リバースプロキシでも body サイズを制限してください（例: nginx の `client_max_body_size`）。

Deepkit Framework の Node.js サーバーを直接公開する場合は、低速なクライアントから保護するためにタイムアウトと制限を構成してください:

```typescript
new FrameworkModule({
    http: {
        headersTimeout: 20_000,  //ヘッダー全体を受信するまでの ms
        requestTimeout: 60_000,  //リクエスト全体を受信するまでの ms
        keepAliveTimeout: 5_000,
        maxHeadersCount: 100,
        maxRequestsPerSocket: 1000,
    },
})
```

## ファイルアップロード

アップロードされたファイルは `UploadedFile` として利用できます（[ファイルアップロード](./input-output.md#file-upload)を参照）。`UploadedFile` は、フレームワークの body パーサーによってのみ作成できます。クライアントがアップロードされたファイルのように見える JSON オブジェクト（例: `path: '/etc/passwd'` を含むもの）を送信した場合、バリデーションはエラーコード `uploadSecurity` で失敗します。

アップロードされたファイルは一時ディレクトリに保存され、リクエスト後に削除されます。`name` と `type` はクライアントによって送信されるため信頼できないことに注意してください。`name` をファイルパスとして使用せず、型が重要な場合はファイルの内容をチェックしてください。

```typescript
import { http, HttpBadRequestError, HttpBody, UploadedFile } from '@deepkit/http';
import { copyFile } from 'fs/promises';
import { randomUUID } from 'crypto';

class AvatarController {
    @http.POST('/avatar')
    async upload(body: HttpBody<{ file: UploadedFile }>) {
        if (body.file.size > 2 * 1024 * 1024) throw new HttpBadRequestError('File too large');
        //body.file.name を決してパスとして使用しないでください
        await copyFile(body.file.path, `/var/uploads/${randomUUID()}`);
    }
}
```

## CORS

組み込みの CORS 処理はありません。`onRequest` リスナーでヘッダーを追加し、ルーターが実行される前に `onRoute` リスナーでプリフライトリクエスト（`OPTIONS`）に応答します。リスナーはルーターの前に実行されるため、`OPTIONS` メソッドを定義していないルートでも機能します。

```typescript
import { httpWorkflow, Response } from '@deepkit/http';

const allowedOrigins = ['https://app.example.com'];

app.listen(httpWorkflow.onRequest, (event) => {
    const origin = event.request.headers.origin;
    if (origin && allowedOrigins.includes(origin)) {
        event.response.setHeader('Access-Control-Allow-Origin', origin);
        event.response.setHeader('Access-Control-Allow-Credentials', 'true');
        event.response.setHeader('Vary', 'Origin');
    }
});

app.listen(httpWorkflow.onRoute, (event) => {
    if (event.request.method !== 'OPTIONS') return;
    event.response.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, PATCH, DELETE');
    event.response.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
    event.response.setHeader('Access-Control-Max-Age', '600');
    event.send(new Response('', 'text/plain').status(204));
});
```

許可リストにあるオリジンのみを反映してください。任意の `Origin` ヘッダーを `Access-Control-Allow-Credentials: true` と一緒に反映すると、すべての Web サイトが API に対して認証付きリクエストを行えるようになってしまいます。

あるいは、Express/Connect の CORS ミドルウェアを `httpMiddleware.for()` で登録することもできます。[ミドルウェア](./middleware.md)を参照してください。ミドルウェアはルートに一致するリクエストに対してのみ実行されることに注意してください。

## セキュリティヘッダー

`onRequest` リスナーで `event.response` に設定されたヘッダーは、エラーレスポンスを含むすべてのレスポンスで送信されます:

```typescript
import { httpWorkflow } from '@deepkit/http';

app.listen(httpWorkflow.onRequest, (event) => {
    event.response.setHeader('X-Content-Type-Options', 'nosniff');
    event.response.setHeader('X-Frame-Options', 'DENY');
    event.response.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
    event.response.setHeader('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
    event.response.setHeader('Content-Security-Policy', "default-src 'self'");
});
```

単一のルートの場合は、レスポンスオブジェクトで `.header()` を使用します:

```typescript
import { HtmlResponse } from '@deepkit/http';

router.get('/embed', () => {
    return new HtmlResponse('<p>Embeddable</p>')
        .header('Content-Security-Policy', "frame-ancestors https://partner.example.com");
});
```

## レート制限

レート制限は組み込まれていません。`onRoute` リスナーはルートが解決される前、かつ body が読み取られる前に実行されるため、リクエストを低コストで拒否できる場所です:

```typescript
import { httpWorkflow, JSONResponse } from '@deepkit/http';

const limit = 100; //1 分あたりのリクエスト数
const hits = new Map<string, { count: number, reset: number }>();

app.listen(httpWorkflow.onRoute, (event) => {
    const key = event.request.getRemoteAddress();
    const now = Date.now();

    let entry = hits.get(key);
    if (!entry || entry.reset < now) {
        entry = { count: 0, reset: now + 60_000 };
        hits.set(key, entry);
    }

    if (++entry.count > limit) {
        event.response.setHeader('Retry-After', String(Math.ceil((entry.reset - now) / 1000)));
        event.send(new JSONResponse({ message: 'Too many requests' }, 429));
    }
});
```

このインメモリストアは単一プロセスでのみ機能し、クライアント数に応じて増大します。複数のプロセスやサーバーの場合は、Redis のような共有ストアを使用するか、リバースプロキシでレート制限を行ってください。リバースプロキシの背後では、`getRemoteAddress()` はプロキシのアドレスを返します。プロキシが設定するヘッダー（例: `X-Forwarded-For`）からクライアントアドレスを読み取ってください。ただし、リクエストが本当にプロキシから来た場合に限ります。

コントローラー内では、ユーザーやアクションに依存する制限（例: アカウントごとのログイン試行回数）に対して `HttpTooManyRequestsError`（ステータス 429）を throw できます。

## Cookie

Deepkit HTTP には、組み込みの cookie パーサーやセッションシステムはありません。`Cookie` ヘッダーから cookie を読み取り、`Set-Cookie` ヘッダーで設定します:

```typescript
import { http, HttpHeader, JSONResponse } from '@deepkit/http';

function parseCookies(header: string = ''): Record<string, string> {
    const cookies: Record<string, string> = {};
    for (const part of header.split(';')) {
        const index = part.indexOf('=');
        if (index === -1) continue;
        cookies[part.slice(0, index).trim()] = decodeURIComponent(part.slice(index + 1).trim());
    }
    return cookies;
}

class SessionController {
    @http.POST('/login')
    login() {
        const sessionId = createSession(); //あなたのセッションストア
        return new JSONResponse({ ok: true })
            .header('Set-Cookie', `session=${sessionId}; HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=86400`);
    }

    @http.GET('/session')
    session(cookie?: HttpHeader<string, { name: 'cookie' }>) {
        const { session } = parseCookies(cookie);
        //...
    }
}
```

`onAuth` リスナーでは、`event.request.headers.cookie` を介してヘッダーを読み取ります。

セッション cookie には、常に `HttpOnly`（JavaScript から読み取り不可）、`Secure`（HTTPS 経由でのみ送信）、および `SameSite=Lax` または `Strict`（ほとんどのリクエストで CSRF から保護）を設定してください。API が認証に cookie を使用し、ブラウザからの状態変更リクエストを受け付ける場合は、追加で CSRF 対策を行ってください。例えば、`Origin` ヘッダーをチェックするか、CSRF トークンを使用します。

## HTML 出力

[JSX ビュー](./views.md)で HTML をレンダリングする場合、テキストコンテンツと属性値は自動的にエスケープされます。`html()` は信頼できる HTML に対してのみ使用し、`href` や `src` に入れる URL は検証してください。[エスケープ](./views.md#escaping)を参照してください。

## 静的ファイル

フレームワークの静的ファイル配信（`publicDir`）は、`..` を含むパスをステータス 403 で拒否し、ドットファイル（例: `.env`）やドットディレクトリ内のファイルは配信しません。それでも、公開ディレクトリには公開を意図したファイルのみを置いてください。

## 本番環境チェックリスト

- デバッグモードを無効にしてください（`FrameworkModule({ debug: false })`、デフォルト）。デバッガーは `/_debug` でアプリケーションの内部情報を公開し、デバッグモードでは RPC エラーにスタックトレースが含まれます。
- RPC アクションを HTTP 経由で呼び出せるようにしたい場合にのみ、`httpRpcBasePath` を設定してください。
- TLS を終端し、body サイズとリクエストレートを制限するリバースプロキシの背後で実行するか、上記のサーバータイムアウトを構成してください。
- リクエスト body には専用の型を使用し、文字列、配列、数値をバリデーション型で制限してください。
- ユーザー入力を決して `html()` に渡さないでください。
