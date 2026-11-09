# 入力と出力

HTTP ルートの入力と出力とは、サーバーに送信されるデータと、クライアントに返送されるデータのことです。これには、パスパラメータ、クエリパラメータ、ボディ、ヘッダー、そしてレスポンス自体が含まれます。この章では、HTTP ルートでデータを読み取り、デシリアライズし、バリデーションし、書き込む方法について説明します。

## 入力

以下の入力方法はすべて、関数型 API とコントローラー API のどちらでも同じように機能します。これらを使用すると、HTTP リクエストから型安全かつ疎結合な方法でデータを読み取ることができます。これによりセキュリティが大幅に向上するだけでなく、ユニットテストも簡単になります。厳密に言えば、ルートをテストするために HTTP リクエストオブジェクトすら存在する必要がないためです。

すべてのパラメータは、定義された TypeScript の型に自動的に変換（デシリアライズ）され、バリデーションされます。これは Deepkit Runtime Types とその [シリアライゼーション](../runtime-types/serialization.md) および [バリデーション](../runtime-types/validation) 機能によって行われます。

簡潔にするため、以下ではすべて関数型 API の例を示します。

### パスパラメータ

パスパラメータは、ルートの URL から抽出される値です。値の型は、関数またはメソッドの対応する Parameter の型によって決まります。変換は [ソフト型変換](../runtime-types/serialization#soft-type-conversion) 機能によって自動的に行われます。

```typescript
router.get('/:text', (text: string) => {
    return 'Hello ' + text;
});
```

```sh
$ curl http://localhost:8080/galaxy
Hello galaxy
```

パスパラメータが string 以外の型として定義されている場合は、その型に正しく変換されます。

```typescript
router.get('/user/:id', (id: number) => {
    return `${id} ${typeof id}`;
});
```

```sh
$ curl http://localhost:8080/user/23
23 number
```

型に追加のバリデーション制約を適用することもできます。

```typescript
import { Positive } from '@deepkit/type';

router.get('/user/:id', (id: number & Positive) => {
    return `${id} ${typeof id}`;
});
```

`@deepkit/type` のすべてのバリデーション型を適用できます。詳しくは [HTTP バリデーション](#validation) を参照してください。

パスパラメータには、URL マッチングの正規表現としてデフォルトで `[^]+` が設定されています。この RegExp は次のようにカスタマイズできます。

```typescript
import { HttpRegExp } from '@deepkit/http';
import { Positive } from '@deepkit/type';

router.get('/user/:id', (id: HttpRegExp<number & Positive, '[0-9]+'>) => {
    return `${id} ${typeof id}`;
});
```

これが必要になるのは例外的な場合のみです。多くの場合、型とバリデーション型の組み合わせだけで、取り得る値を正しく制限できるためです。

### クエリパラメータ

クエリパラメータは URL の `?` 文字以降の値で、`HttpQuery<T>` 型を使って読み取ることができます。Parameter の名前がクエリパラメータの名前に対応します。

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

クエリパラメータも自動的にデシリアライズされ、バリデーションされます。

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

`@deepkit/type` のすべてのバリデーション型を適用できます。詳しくは [HTTP バリデーション](#validation) を参照してください。

警告: パラメータの値はエスケープ／サニタイズされません。ルート内で文字列に埋め込んで HTML としてそのまま返すと、セキュリティホール（XSS）が生じます。外部からの入力は決して信頼せず、必要に応じてデータをフィルタリング／サニタイズ／変換してください。

### クエリモデル

クエリパラメータの数が多いと、すぐに見通しが悪くなります。これを整理するために、取り得るすべてのクエリパラメータをまとめたモデル（Class または Interface）を使用できます。

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

指定したモデルの Property には、`@deepkit/type` がサポートするすべての TypeScript の型とバリデーション型を使用できます。[シリアライゼーション](../runtime-types/serialization.md) および [バリデーション](../runtime-types/validation.md) の章を参照してください。

### ボディ

HTTP ボディを許可する HTTP メソッドでは、ボディモデルを指定することもできます。Deepkit がボディを JavaScript オブジェクトに自動変換できるように、HTTP リクエストのボディのコンテンツタイプは `application/x-www-form-urlencoded`、`multipart/form-data`、`application/json` のいずれかである必要があります。

```typescript
import { HttpBody } from '@deepkit/http';

class HelloWorldBody {
    text!: string;
}

router.post('/', (body: HttpBody<HelloWorldBody>) => {
    return 'Hello ' + body.text;
}
```

### ヘッダー

### ストリーム

### 手動でのバリデーション処理

ボディモデルのバリデーションを手動で行うには、特別な型 `HttpBodyValidation<T>` を使用できます。これにより、無効なボディデータも受け取り、エラーメッセージに対してきめ細かく対応できます。

```typescript
import { HttpBodyValidation } from '@deepkit/http';

class HelloWorldBody {
    text!: string;
}

router.post('/', (body: HttpBodyValidation<HelloWorldBody>) => {
    if (!body.valid()) {
        // ヒューストン、エラーが発生しました。
        const textError = body.getErrorMessageForPath('text');
        return 'Text is invalid, please fix it. ' + textError;
    }

    return 'Hello ' + body.text;
})
```

`valid()` が `false` を返した場合、指定したモデルの値は不正な状態である可能性があります。これはバリデーションが失敗したことを意味します。`HttpBodyValidation` を使用せずに不正な HTTP リクエストを受け取った場合、リクエストは直ちに中断され、関数内のコードは実行されません。`HttpBodyValidation` は、たとえばボディに関するエラーメッセージを同じルート内で手動処理する必要がある場合にのみ使用してください。

指定したモデルの Property には、`@deepkit/type` がサポートするすべての TypeScript の型とバリデーション型を使用できます。[シリアライゼーション](../runtime-types/serialization.md) および [バリデーション](../runtime-types/validation.md) の章を参照してください。

### ファイルアップロード

ボディモデルで特別な Property の型を使用すると、クライアントがファイルをアップロードできるようになります。`UploadedFile` はいくつでも使用できます。

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

デフォルトでは、Router はアップロードされたすべてのファイルを一時フォルダに保存し、ルート内のコードの実行が完了すると削除します。そのため、`path` で指定されたパスのファイルを読み取り、永続的な場所（ローカルディスク、クラウドストレージ、データベース）に保存する必要があります。

## バリデーション

HTTP サーバーが扱うデータはほぼ常に信頼できないものであるため、バリデーションは必須の機能です。データをバリデーションする箇所が多いほど、サーバーの安定性は高まります。HTTP ルートのバリデーションは、型とバリデーション制約を通じて手軽に利用でき、`@deepkit/type` の高度に最適化されたバリデーターによってチェックされるため、パフォーマンス上の問題はありません。したがって、これらのバリデーション機能を積極的に利用することを強く推奨します。バリデーションは、足りないよりは多すぎるほうが良いのです。

パスパラメータ、クエリパラメータ、ボディパラメータなどのすべての入力は、指定された TypeScript の型に基づいて自動的にバリデーションされます。`@deepkit/type` の型によって追加の制約が指定されている場合は、それらもチェックされます。

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

ルートはさまざまなデータ構造を返すことができます。リダイレクトやテンプレートなど特別に処理されるものもあれば、単純なオブジェクトのようにそのまま JSON として送信されるものもあります。

### JSON

デフォルトでは、通常の JavaScript の値は、ヘッダー `applicationjson; charset=utf-8` とともに JSON としてクライアントに返されます。

```typescript
router.get('/', () => {
    // application/json として送信されます
    return { hello: 'world' }
});
```

関数またはメソッドに明示的な戻り値の型が指定されている場合、データはその型に従って Deepkit JSON Serializer により JSON にシリアライズされます。

```typescript
interface ResultType {
    hello: string;
}

router.get('/', (): ResultType => {
    // application/json として送信され、additionalProperty は除去されます
    return { hello: 'world', additionalProperty: 'value' };
});
```

### HTML

HTML を送信する方法は 2 つあります。`HtmlResponse` オブジェクトを使用するか、JSX によるテンプレートエンジンを使用します。

```typescript
import { HtmlResponse } from '@deepkit/http';

router.get('/', () => {
    // Content-Type: text/html として送信されます
    return new HtmlResponse('<b>Hello World</b>');
});
```

```typescript
router.get('/', () => {
    // Content-Type: text/html として送信されます
    return <b>Hello
    World < /b>;
});
```

JSX によるテンプレートエンジンには、使用した変数が自動的に HTML エスケープされるという利点があります。[テンプレート](../template.md) も参照してください。

### カスタムコンテンツタイプ

HTML や JSON のほかに、特定のコンテンツタイプでテキストやバイナリデータを送信することもできます。これには `Response` オブジェクトを使用します。

```typescript
import { Response } from '@deepkit/http';

router.get('/', () => {
    return new Response('<title>Hello World</title>', 'text/xml');
});
```

### HTTP エラー

各種 HTTP エラーをスローすることで、HTTP リクエストの処理を直ちに中断し、そのエラーに対応する HTTP ステータスを出力できます。

```typescript
import { HttpNotFoundError } from '@deepkit/http';

router.get('/user/:id', async (id: number, database: Database) => {
    const user = await database.query(User).filter({ id }).findOneOrUndefined();
    if (!user) throw new HttpNotFoundError('User not found');
    return user;
});
```

デフォルトでは、すべてのエラーは JSON としてクライアントに返されます。この動作は、イベントシステムの `httpWorkflow.onControllerError` イベントでカスタマイズできます。[HTTP イベント](./events.md) のセクションを参照してください。

| Error クラス              | ステータス |
|---------------------------|--------|
| HttpBadRequestError       | 400    |
| HttpUnauthorizedError     | 401    |
| HttpAccessDeniedError     | 403    |
| HttpNotFoundError         | 404    |
| HttpMethodNotAllowedError | 405    |
| HttpNotAcceptableError    | 406    |
| HttpTimeoutError          | 408    |
| HttpConflictError         | 409    |
| HttpGoneError             | 410    |
| HttpTooManyRequestsError  | 429    |
| HttpInternalServerError   | 500    |
| HttpNotImplementedError   | 501    |

`HttpAccessDeniedError` は特殊なケースです。これがスローされると、HTTP ワークフロー（[HTTP イベント](./events.md) を参照）は `controllerError` ではなく `accessDenied` にジャンプします。

カスタム HTTP エラーは `createHttpError` で作成してスローできます。

```typescript
export class HttpMyError extends createHttpError(412, 'My Error Message') {
}
```

コントローラーアクションでスローされたエラーは、HTTP ワークフローの `onControllerError` イベントによって処理されます。デフォルトの実装では、エラーメッセージとステータスコードを含む JSON レスポンスを返します。この動作は、このイベントをリッスンして別のレスポンスを返すことでカスタマイズできます。

```typescript
import { httpWorkflow } from '@deepkit/http';

new App()
    .listen(httpWorkflow.onControllerError, (event) => {
        if (event.error instanceof HttpMyError) {
            event.send(new Response('My Error Message', 'text/plain').status(500));
        } else {
            //その他すべてのエラーには、汎用的なエラーメッセージを返します
            event.send(new Response('Something went wrong. Sorry about that.', 'text/plain').status(500));
        }
    })
    .listen(httpWorkflow.onAccessDenied, (event) => {
        event.send(new Response('Access denied. Try to login first.', 'text/plain').status(403));
    });
```

### 追加のヘッダー

HTTP レスポンスのヘッダーを変更するには、`Response`、`JSONResponse`、`HTMLResponse` オブジェクトの追加の Method を呼び出します。

```typescript
import { Response } from '@deepkit/http';

router.get('/', () => {
    return new Response('Access Denied', 'text/plain')
        .header('X-Reason', 'unknown')
        .status(403);
});
```

### リダイレクト

レスポンスとして 301 または 302 リダイレクトを返すには、`Redirect.toRoute` または `Redirect.toUrl` を使用できます。

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

ここでは、`Redirect.toRoute` Method はルート名を使用します。ルート名の設定方法については、[HTTP ルート名](./getting-started.md#route-names) のセクションを参照してください。参照先のルートに（クエリまたはパスの）パラメータが含まれている場合は、第 2 Argument で指定できます。

```typescript
router.get({ path: '/user/:id', name: 'user_detail' }, (id: number) => {

});

router.post('/user', (user: HttpBody<User>) => {
    //... ユーザーを保存し、その詳細ページにリダイレクトします
    return Redirect.toRoute('user_detail', { id: 23 });
});
```

または、`Redirect.toUrl` を使用して URL にリダイレクトすることもできます。

```typescript
router.post('/user', (user: HttpBody<User>) => {
    //... ユーザーを保存し、その詳細ページにリダイレクトします
    return Redirect.toUrl('/user/' + 23);
});
```

デフォルトでは、どちらも 302 リダイレクトを使用します。これは `statusCode` Argument でカスタマイズできます。

## リゾルバー

Router は、複雑な Parameter の型を解決する仕組みをサポートしています。たとえば、`/user/:id` のようなルートがある場合、リゾルバーを使用して、ルートの外部でこの `id` を `user` オブジェクトに解決できます。これにより HTTP の抽象化とルートのコードがさらに分離され、テストとモジュール化がいっそう容易になります。

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

`@http.resolveParameter` デコレーターは、どの Class を `UserResolver` で解決するかを指定します。指定した Class である `User` が関数またはメソッドの Parameter として指定されると、リゾルバーがそれを提供します。

`@http.resolveParameter` を Class に指定すると、その Class のすべての Method にこのリゾルバーが適用されます。このデコレーターは Method ごとに適用することもできます。

```typescript
class MyWebsite {
    @http.GET('/user/:id').resolveParameter(User, UserResolver)
    getUser(user: User) {
        return 'Hello ' + user.username;
    }
}
```

関数型 API を使用することもできます。

```typescript

router.add(
    http.GET('/user/:id').resolveParameter(User, UserResolver),
    (user: User) => {
        return 'Hello ' + user.username;
    }
);
```

`User` オブジェクトは、必ずしもパラメータに依存する必要はありません。セッションや HTTP ヘッダーに依存させ、ユーザーがログインしている場合にのみ提供することもできます。`RouteParameterResolverContext` では HTTP リクエストに関する多くの情報を利用できるため、さまざまなユースケースに対応できます。

原則として、複雑な Parameter の型を `http` スコープの Dependency Injection コンテナから提供することも可能です。これらもルートの関数またはメソッドで利用できるためです。ただし、DI コンテナは全体が同期的であるため、非同期の関数呼び出しを使用できないという欠点があります。
