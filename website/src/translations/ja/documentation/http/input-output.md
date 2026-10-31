# 入力と出力

HTTP ルートの入力と出力とは、サーバーに送信されるデータおよびクライアントに返送されるデータのことです。これにはパスパラメータ、クエリパラメータ、Body、ヘッダー、そしてレスポンス自体が含まれます。本章では、HTTP ルートでデータを読み取り、逆シリアライズし、検証し、書き出す方法を見ていきます。

## 入力

以下のすべての入力バリエーションは、関数型 API とコントローラ API の両方で同じように機能します。これらは、HTTP リクエストからデータを型安全かつ疎結合な方法で読み取ることを可能にします。これによりセキュリティが大幅に向上するだけでなく、厳密にはルートをテストするのに HTTP リクエストオブジェクトすら必要ないため、ユニットテストも簡素化されます。

すべての Parameter は定義された TypeScript の Type に自動的に変換（逆シリアライズ）され、検証されます。これは Deepkit Runtime Types とその [シリアライゼーション](../runtime-types/serialization.md) および [バリデーション](../runtime-types/validation) 機能によって行われます。

簡潔さのため、以下では関数型 API を用いた例のみを示します。

### パスパラメータ

パスパラメータは、ルートの URL から抽出される値です。値の型は、関数またはメソッドの対応する Parameter の型に依存します。変換は [ソフト型変換](../runtime-types/serialization#soft-type-conversion) 機能によって自動的に行われます。

```typescript
router.get('/:text', (text: string) => {
    return 'Hello ' + text;
});
```

```sh
$ curl http://localhost:8080/galaxy
Hello galaxy
```

パスパラメータが string 以外の Type として定義されている場合、正しく変換されます。

```typescript
router.get('/user/:id', (id: number) => {
    return `${id} ${typeof id}`;
});
```

```sh
$ curl http://localhost:8080/user/23
23 number
```

追加のバリデーション制約を Type に適用することも可能です。

```typescript
import { Positive } from '@deepkit/type';

router.get('/user/:id', (id: number & Positive) => {
    return `${id} ${typeof id}`;
});
```

`@deepkit/type` のすべてのバリデーション Type を適用できます。詳細は [HTTP バリデーション](#validation) を参照してください。

パスパラメータは、URL マッチングの既定の正規表現として `[^]+` が設定されています。この RegExp は次のようにカスタマイズできます。

```typescript
import { HttpRegExp } from '@deepkit/http';
import { Positive } from '@deepkit/type';

router.get('/user/:id', (id: HttpRegExp<number & Positive, '[0-9]+'>) => {
    return `${id} ${typeof id}`;
});
```

多くの場合、Type とバリデーション Type の組み合わせだけで可能な値を正しく制限できるため、これは例外的なケースでのみ必要です。

### クエリパラメータ

クエリパラメータは、URL の `?` 以降の値で、`HttpQuery<T>` Type を使って読み取ることができます。Parameter 名はクエリパラメータの名前に対応します。

```typescript
import { HttpQuery } from '@deepkit/http';

router.get('/', (text: HttpQuery<number>) => {
    return `Hello ${text}`;
});
```

```sh
$ curl http://localhost:8080/\?text\=galaxy
Hello galaxy
```

クエリパラメータも自動的に逆シリアライズされ、検証されます。

```typescript
import { HttpQuery } from '@deepkit/http';
import { MinLength } from '@deepkit/type';

router.get('/', (text: HttpQuery<string> & MinLength<3>) => {
    return 'Hello ' + text;
}
```

```sh
$ curl http://localhost:8080/\?text\=galaxy
Hello galaxy
$ curl http://localhost:8080/\?text\=ga
error
```

`@deepkit/type` のすべてのバリデーション Type を適用できます。詳細は [HTTP バリデーション](#validation) を参照してください。

警告: Parameter の値はエスケープ/サニタイズされません。ルートで文字列としてそのまま HTML に返すと、セキュリティホール（XSS）になります。外部入力を決して信用せず、必要に応じてフィルタ/サニタイズ/変換を行ってください。

### クエリモデル

クエリパラメータが多くなるとすぐに混乱しがちです。これを整理するために、すべてのクエリパラメータをまとめるモデル（Class または Interface）を使用できます。

```typescript
import { HttpQueries } from '@deepkit/http';

class HelloWorldQuery {
    text!: string;
    page: number = 0;
}

router.get('/', (query: HttpQueries<HelloWorldQuery>)
{
    return 'Hello ' + query.text + ' at page ' + query.page;
}
```

```sh
$ curl http://localhost:8080/\?text\=galaxy&page=1
Hello galaxy at page 1
```

指定されたモデル内の Property には、`@deepkit/type` がサポートするあらゆる TypeScript の Type およびバリデーション Type を含めることができます。詳しくは [シリアライゼーション](../runtime-types/serialization.md) と [バリデーション](../runtime-types/validation.md) の章を参照してください。

### Body

HTTP Body を許可する HTTP メソッドでは、Body モデルを指定することもできます。HTTP リクエストの Body の Content-Type は `application/x-www-form-urlencoded`、`multipart/form-data`、または `application/json` のいずれかである必要があり、Deepkit はこれを自動的に JavaScript オブジェクトへ変換できます。

```typescript
import { HttpBody } from '@deepkit/type';

class HelloWorldBody {
    text!: string;
}

router.post('/', (body: HttpBody<HelloWorldBody>) => {
    return 'Hello ' + body.text;
}
```

### ヘッダー

### ストリーム

### バリデーションの手動処理

Body モデルの検証を手動で引き受けるには、特別な Type `HttpBodyValidation<T>` が使用できます。これにより、不正な Body データも受け取り、エラーメッセージに非常に具体的に対応できます。

```typescript
import { HttpBodyValidation } from '@deepkit/type';

class HelloWorldBody {
    text!: string;
}

router.post('/', (body: HttpBodyValidation<HelloWorldBody>) => {
    if (!body.valid()) {
        // ヒューストン、いくつかエラーがあります。
        const textError = body.getErrorMessageForPath('text');
        return 'Text is invalid, please fix it. ' + textError;
    }

    return 'Hello ' + body.text;
})
```

`valid()` が `false` を返した時点で、指定されたモデル内の値は不正な状態にある可能性があります。これはバリデーションに失敗したことを意味します。`HttpBodyValidation` を使用せずに誤った HTTP リクエストが受信された場合、リクエストは直接中断され、関数内のコードは実行されません。Body に関するエラーメッセージを同じルート内で手動処理したい場合などにのみ `HttpBodyValidation` を使用してください。

指定されたモデル内の Property には、`@deepkit/type` がサポートするあらゆる TypeScript の Type およびバリデーション Type を含めることができます。詳しくは [シリアライゼーション](../runtime-types/serialization.md) と [バリデーション](../runtime-types/validation.md) の章を参照してください。

### ファイルアップロード

クライアントにファイルのアップロードを許可するために、Body モデルに特別な Property Type を使用できます。任意の数の `UploadedFile` を使用できます。

```typescript
import { UploadedFile, HttpBody } from '@deepkit/http';
import { readFileSync } from 'fs';

class HelloWordBody {
    file!: UploadedFile;
}

router.post('/', (body: HttpBody<HelloWordBody>) => {
    const content = readFileSync(body.file.path);

    return {
        uploadedFile: body.file
    };
})
```

```sh
$ curl http://localhost:8080/ -X POST -H "Content-Type: multipart/form-data" -F "file=@Downloads/23931.png"
{
    "uploadedFile": {
        "size":6430,
        "path":"/var/folders/pn/40jxd3dj0fg957gqv_nhz5dw0000gn/T/upload_dd0c7241133326bf6afddc233e34affa",
        "name":"23931.png",
        "type":"image/png",
        "lastModifiedDate":"2021-06-11T19:19:14.775Z"
    }
}
```

既定では、Router はアップロードされたファイルをすべて一時フォルダに保存し、ルート内のコードが実行された後に削除します。そのため、`path` に指定されたパスでファイルを読み込み、永続的な場所（ローカルディスク、クラウドストレージ、データベース）に保存する必要があります。

## バリデーション

HTTP サーバーでのバリデーションは必須の機能です。というのも、ほぼ常に信用できないデータを扱うからです。データが検証される箇所が多いほど、サーバーはより安定します。HTTP ルートでのバリデーションは Type とバリデーション制約を通じて簡便に利用でき、`@deepkit/type` の高度に最適化されたバリデータでチェックされるため、パフォーマンス上の問題はありません。したがって、これらのバリデーション機能を積極的に使用することを強く推奨します。やり過ぎなくらいが、やり足りないより良いのです。

パスパラメータ、クエリパラメータ、Body パラメータなど、すべての入力は指定された TypeScript の Type に対して自動的に検証されます。`@deepkit/type` の Type を通じて追加の制約が指定されている場合、それらもチェックされます。

```typescript
import { HttpQuery, HttpQueries, HttpBody } from '@deepkit/http';
import { MinLength } from '@deepkit/type';

router.get('/:text', (text: string & MinLength<3>) => {
    return 'Hello ' + text;
}

router.get('/', (text: HttpQuery<string> & MinLength<3>) => {
    return 'Hello ' + text;
}

interface MyQuery {
    text: string & MinLength<3>;
}

router.get('/', (query: HttpQueries<MyQuery>) => {
    return 'Hello ' + query.text;
});

router.post('/', (body: HttpBody<MyQuery>) => {
    return 'Hello ' + body.text;
});
```

詳しくは [バリデーション](../runtime-types/validation.md) を参照してください。

## 出力

ルートはさまざまなデータ構造を返すことができます。リダイレクトやテンプレートなど特別に扱われるものもあれば、単純なオブジェクトのように JSON としてそのまま送信されるものもあります。

### JSON

既定では、通常の JavaScript の値はヘッダー `application/json; charset=utf-8` とともに JSON としてクライアントに返されます。

```typescript
router.get('/', () => {
    // application/json で送信されます
    return { hello: 'world' }
});
```

関数またはメソッドに明示的な Return Type が指定されている場合、データはその Type に従って Deepkit JSON Serializer で JSON にシリアライズされます。

```typescript
interface ResultType {
    hello: string;
}

router.get('/', (): ResultType => {
    // application/json で送信され、additionalProperty は破棄されます
    return { hello: 'world', additionalProperty: 'value' };
});
```

### HTML

HTML を送信するには 2 つの方法があります。`HtmlResponse` オブジェクトを使用するか、JSX を用いたテンプレートエンジンを使用します。

```typescript
import { HtmlResponse } from '@deepkit/http';

router.get('/', () => {
    // Content-Type: text/html で送信されます
    return new HtmlResponse('<b>Hello World</b>');
});
```

```typescript
router.get('/', () => {
    // Content-Type: text/html で送信されます
    return <b>Hello
    World < /b>;
});
```

JSX を用いたテンプレートエンジンのバリアントには、使用される変数が自動的に HTML エスケープされるという利点があります。詳しくは [テンプレート](../template.md) を参照してください。

### カスタム Content-Type

HTML と JSON 以外にも、特定の Content-Type でテキストまたはバイナリデータを送信することができます。これは `Response` オブジェクトを通じて行います。

```typescript
import { Response } from '@deepkit/http';

router.get('/', () => {
    return new Response('<title>Hello World</title>', 'text/xml');
});
```

### HTTP エラー

さまざまな HTTP エラーを投げることで、HTTP リクエストの処理を即座に中断し、そのエラーに対応する HTTP ステータスを出力できます。

```typescript
import { HttpNotFoundError } from '@deepkit/http';

router.get('/user/:id', async (id: number, database: Database) => {
    const user = await database.query(User).filter({ id }).findOneOrUndefined();
    if (!user) throw new HttpNotFoundError('User not found');
    return user;
});
```

既定では、すべてのエラーは JSON としてクライアントに返されます。この挙動はイベントシステムの `httpWorkflow.onControllerError` イベントでカスタマイズできます。セクション [HTTP イベント](./events.md) を参照してください。

| Error クラス               | ステータス |
|---------------------------|------------|
| HttpBadRequestError       | 400        |
| HttpUnauthorizedError     | 401        |
| HttpAccessDeniedError     | 403        |
| HttpNotFoundError         | 404        |
| HttpMethodNotAllowedError | 405        |
| HttpNotAcceptableError    | 406        |
| HttpTimeoutError          | 408        |
| HttpConflictError         | 409        |
| HttpGoneError             | 410        |
| HttpTooManyRequestsError  | 429        |
| HttpInternalServerError   | 500        |
| HttpNotImplementedError   | 501        |

`HttpAccessDeniedError` は特別なケースです。これが投げられると、HTTP ワークフロー（[HTTP イベント](./events.md) 参照）は `controllerError` ではなく `accessDenied` に移行します。

`createHttpError` を使ってカスタム HTTP エラーを作成してスローできます。

```typescript
export class HttpMyError extends createHttpError(412, 'My Error Message') {
}
```

コントローラアクションでスローされたエラーは、HTTP ワークフローイベント `onControllerError` によって処理されます。既定の実装では、エラーメッセージとステータスコードを含む JSON レスポンスを返します。これはこのイベントをリッスンし、別のレスポンスを返すことでカスタマイズできます。

```typescript
import { httpWorkflow } from '@deepkit/http';

new App()
    .listen(httpWorkflow.onControllerError, (event) => {
        if (event.error instanceof HttpMyError) {
            event.send(new Response('My Error Message', 'text/plain').status(500));
        } else {
            // 他のすべてのエラーについては、汎用的なエラーメッセージを返します
            event.send(new Response('Something went wrong. Sorry about that.', 'text/plain').status(500));
        }
    })
    .listen(httpWorkflow.onAccessDenied, (event) => {
        event.send(new Response('Access denied. Try to login first.', 'text/plain').status(403));
    });
```

### 追加ヘッダー

HTTP レスポンスのヘッダーを変更するには、`Response`、`JSONResponse`、`HTMLResponse` オブジェクト上で追加のメソッドを呼び出せます。

```typescript
import { Response } from '@deepkit/http';

router.get('/', () => {
    return new Response('Access Denied', 'text/plain')
        .header('X-Reason', 'unknown')
        .status(403);
});
```

### リダイレクト

レスポンスとして 301 または 302 のリダイレクトを返すには、`Redirect.toRoute` または `Redirect.toUrl` を使用します。

```typescript
import { Redirect } from '@deepkit/http';

router.get({ path: '/', name: 'homepage' }, () => {
    return <b>Hello
    World < /b>;
});

router.get({ path: '/registration/complete' }, () => {
    return Redirect.toRoute('homepage');
});
```

`Redirect.toRoute` メソッドはここでルート名を使用します。ルート名の設定方法は [HTTP ルート名](./getting-started.md#route-names) セクションを参照してください。参照されたルート（クエリまたはパス）に Parameter が含まれる場合は、第 2 引数で指定できます。

```typescript
router.get({ path: '/user/:id', name: 'user_detail' }, (id: number) => {

});

router.post('/user', (user: HttpBody<User>) => {
    //... ユーザーを保存して詳細ページにリダイレクト
    return Redirect.toRoute('user_detail', { id: 23 });
});
```

`Redirect.toUrl` を使って URL にリダイレクトすることもできます。

```typescript
router.post('/user', (user: HttpBody<User>) => {
    //... ユーザーを保存して詳細ページにリダイレクト
    return Redirect.toUrl('/user/' + 23);
});
```

既定では、どちらも 302 リダイレクトを使用します。これは `statusCode` 引数でカスタマイズできます。

## リゾルバ

Router は、複雑な Parameter Type を解決する方法をサポートしています。たとえば、`/user/:id` のようなルートが与えられた場合、この `id` をリゾルバを使ってルートの外で `user` オブジェクトに解決できます。これにより HTTP 抽象化とルートコードがさらに疎結合になり、テストやモジュール性が一層簡素化されます。

```typescript
import { App } from '@deepkit/app';
import { FrameworkModule } from '@deepkit/framework';
import { http, RouteParameterResolverContext, RouteParameterResolver } from '@deepkit/http';

class UserResolver implements RouteParameterResolver {
    constructor(protected database: Database) {
    }

    async resolve(context: RouteParameterResolverContext) {
        if (!context.parameters.id) throw new Error('No :id given');
        return await this.database.getUser(parseInt(context.parameters.id, 10));
    }
}

@http.resolveParameter(User, UserResolver)
class MyWebsite {
    @http.GET('/user/:id')
    getUser(user: User) {
        return 'Hello ' + user.username;
    }
}

new App({
    controllers: [MyWebsite],
    providers: [UserDatabase, UserResolver],
    imports: [new FrameworkModule]
})
    .run();
```

`@http.resolveParameter` のデコレータは、どの Class を `UserResolver` で解決するかを指定します。指定された Class `User` が関数またはメソッドの Parameter として指定されるとすぐに、リゾルバが使用されてそれが提供されます。

`@http.resolveParameter` が Class に指定されている場合、その Class のすべての Method にこのリゾルバが適用されます。デコレータはメソッド単位でも適用できます。

```typescript
class MyWebsite {
    @http.GET('/user/:id').resolveParameter(User, UserResolver)
    getUser(user: User) {
        return 'Hello ' + user.username;
    }
}
```

関数型 API も使用できます。

```typescript

router.add(
    http.GET('/user/:id').resolveParameter(User, UserResolver),
    (user: User) => {
        return 'Hello ' + user.username;
    }
);
```

`User` オブジェクトは必ずしも Parameter に依存する必要はありません。セッションや HTTP ヘッダーに依存し、ユーザーがログインしている場合にのみ提供されるようにしても構いません。`RouteParameterResolverContext` には HTTP リクエストに関する多くの情報が用意されているため、多くのユースケースを表現できます。

原則として、複雑な Parameter Type を `http` スコープの Dependency Injection コンテナ経由で提供することも可能です。これは、ルートの関数またはメソッドでも利用できるためです。ただし、DI コンテナは全体として同期的であるため、非同期関数呼び出しを使用できないという欠点があります。