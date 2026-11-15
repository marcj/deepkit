# はじめに

Deepkit HTTP は Runtime Types をベースにしているため、Runtime Types があらかじめ正しくインストールされている必要があります。[Runtime Types のインストール](../runtime-types/getting-started.md)を参照してください。

これが正常に完了したら、`@deepkit/app` をインストールするか、内部ですでにこのライブラリを使用している Deepkit フレームワークをインストールできます。

```sh
npm install @deepkit/http
```

コントローラー API 用の `@deepkit/http` は TypeScript のアノテーションに基づいているため、コントローラー API を使用する場合は `experimentalDecorators` でこの機能を有効にする必要があることに注意してください。
クラスを使用しない場合は、この機能を有効にする必要はありません。

_ファイル: tsconfig.json_

```json
{
  "compilerOptions": {
    "module": "CommonJS",
    "target": "es6",
    "moduleResolution": "node",
    "experimentalDecorators": true
  },
  "reflection": true
}
```

ライブラリがインストールされると、その API を直接使用できます。

## 関数型 API

関数型 API は関数をベースにしており、アプリの DI コンテナから取得できるルーターレジストリを介して登録できます。

```typescript
import { App } from '@deepkit/app';
import { FrameworkModule } from '@deepkit/framework';
import { HttpRouterRegistry } from '@deepkit/http';

const app = new App({
    imports: [new FrameworkModule]
});

const router = app.get(HttpRouterRegistry);

router.get('/', () => {
    return "Hello World!";
});

app.run();
```

モジュールを使用する場合、関数型のルートはモジュールによって動的に提供することもできます。

```typescript
import { App, createModuleClass } from '@deepkit/app';
import { FrameworkModule } from '@deepkit/framework';
import { HttpRouterRegistry } from '@deepkit/http';

class MyModule extends createModuleClass({}) {
  override process() {
    this.configureProvider<HttpRouterRegistry>(router => {
      router.get('/', () => {
        return "Hello World!";
      });
    });
  }
}

const app = new App({
  imports: [new FrameworkModule, new MyModule]
});
```

App Modules の詳細については、[Framework Modules](../app/modules) を参照してください。

## コントローラー API

コントローラー API はクラスをベースにしており、App-API の `controllers` オプションで登録できます。

```typescript
import { App } from '@deepkit/app';
import { FrameworkModule } from '@deepkit/framework';
import { http } from '@deepkit/http';

class MyPage {
    @http.GET('/')
    helloWorld() {
        return "Hello World!";
    }
}

new App({
    controllers: [MyPage],
    imports: [new FrameworkModule]
}).run();
```

モジュールを使用する場合、コントローラーはモジュールによって提供することもできます。

```typescript
import { App, createModuleClass } from '@deepkit/app';
import { FrameworkModule } from '@deepkit/framework';
import { http } from '@deepkit/http';

class MyPage {
  @http.GET('/')
  helloWorld() {
    return "Hello World!";
  }
}

class MyModule extends createModuleClass({}) {
  override process() {
    this.addController(MyPage);
  }
}

const app = new App({
  imports: [new FrameworkModule, new MyModule]
});
```

コントローラーを動的に提供するには（例えば設定オプションに応じて）、`process` フックを使用できます。

```typescript
class MyModuleConfiguration {
    debug: boolean = false;
}

class MyModule extends createModuleClass({
    config: MyModuleConfiguration
}) {
    override process() {
        if (this.config.debug) {
            class DebugController {
                @http.GET('/debug/')
                root() {
                    return 'Hello Debugger';
                }
            }
            this.addController(DebugController);
        }
    }
}
```

App Modules の詳細については、[Framework Modules](../app/modules) を参照してください。

## HTTP サーバー

Deepkit Framework を使用する場合、HTTP サーバーはすでに組み込まれています。ただし、HTTP ライブラリは Deepkit フレームワークを使用せずに独自の HTTP サーバーで使用することもでき、Express 内、`Bun.serve`、`Deno.serve`、Cloudflare Workers、AWS Lambda でも使用できます。

```typescript
import { createServer } from 'http';
import { HttpKernel, HttpRequest, HttpResponse } from '@deepkit/http';

const app = new App({
    controllers: [MyPage],
    imports: [new HttpModule]
});

const httpKernel = app.get(HttpKernel);

createServer(
    { IncomingMessage: HttpRequest, ServerResponse: HttpResponse as any },
    (req, res) => httpKernel.handleRequestMaybeSync(req, res),
).listen(8080, () => {
    console.log('listen at 8080');
});
```

HTTP カーネルを実行するすべての方法については、[サーバーとランタイム](./runtimes.md)を参照してください。

## HTTP クライアント

Deepkit HTTP は特別なクライアントを必要としません。任意の HTTP クライアントが動作します。例えば、ブラウザ、Node.js、Bun、Deno で利用可能な `fetch` API などです。

JSON レスポンスには JSON 型のみが含まれるため、`Date` は文字列として届き、データの形状は何も保証されません。サーバーとクライアントの間で型を共有する場合、`@deepkit/type` はサーバーが使用するのと同じ型でレスポンスを変換し、バリデーションします。

```typescript
import { cast } from '@deepkit/type';

interface User {
    id: number;
    username: string;
    created: Date;
}

const response = await fetch('http://localhost:8080/user/1');
if (!response.ok) throw new Error(`Request failed with status ${response.status}`);

// "created" を ISO 文字列から Date に変換し、結果をバリデーションします。
// データが User と一致しない場合は ValidationError をスローします。
const user = cast<User>(await response.json());
```

必要に応じて、いくつかの関数があります。

| Function               | 説明                                                                                                  |
|------------------------|--------------------------------------------------------------------------------------------------------------|
| `cast<T>(data)`        | データを変換し（例: ISO 文字列を `Date` に、`'2'` を `2` に）、バリデーションします。無効な場合は `ValidationError` をスローします。 |
| `deserialize<T>(data)` | バリデーションせずにデータを変換します。信頼できるソースに対してのみ使用してください。                                    |
| `is<T>(data)`          | 型ガード。データを変換せずに、データがすでに型と一致する場合は `true` を返します。                      |
| `assert<T>(data)`      | `is` と同様ですが、`false` を返す代わりに `ValidationError` をスローします。                                      |
| `validate<T>(data)`    | `ValidationErrorItem` の配列を返します。データが有効な場合は空です。                                       |

同じ型を使用して、リクエストボディを送信前にチェックすることもできます。例えば、フォームのエラーを早期に表示する場合などです。いずれにせよ、サーバーはボディをバリデーションします（[入力と出力](./input-output.md)を参照）。

```typescript
import { MinLength, validate } from '@deepkit/type';

interface CreateUser {
    username: string & MinLength<3>;
}

const body: CreateUser = { username: 'Pe' };
const errors = validate<CreateUser>(body);
if (errors.length) {
    // [{ path: 'username', code: 'minLength', message: 'Min length is 3', ... }]
} else {
    await fetch('http://localhost:8080/user', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
    });
}
```

無効な入力のためにサーバーがリクエストを拒否した場合、ステータス 400 と JSON ボディ `{ message: string, errors: { path, code, message }[] }` で応答します。

詳細については、[シリアライゼーション](../runtime-types/serialization.md)と[バリデーション](../runtime-types/validation.md)を参照してください。

## ルート名

ルートには、転送時に参照できる一意の名前を付けることができます。API によって、名前の定義方法が異なります。

```typescript
//関数型 API
router.get({
    path: '/user/:id',
    name: 'userDetail'
}, (id: number) => {
    return {userId: id};
});

//コントローラー API
class UserController {
    @http.GET('/user/:id').name('userDetail')
    userDetail(id: number) {
        return {userId: id};
    }
}
```

名前を持つすべてのルートについて、`Router.resolveUrl()` で URL を取得できます。

```typescript
import { HttpRouter } from '@deepkit/http';
const router = app.get(HttpRouter);
router.resolveUrl('userDetail', {id: 2}); //=> '/user/2'
```

## セキュリティ

## セッション
