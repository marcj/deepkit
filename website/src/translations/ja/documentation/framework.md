# TypeScript バックエンドフレームワーク

Deepkit Framework は、1 つの型がバリデーター、JSON フォーマット、データベーススキーマ、API ドキュメントを兼ねる TypeScript バックエンドフレームワークです。HTTP サーバーと RPC サーバー、ORM、依存性注入、CLI、設定を 1 つのアプリケーションにまとめて提供します。

```typescript
//app.ts
import { App } from '@deepkit/app';
import { FrameworkModule } from '@deepkit/framework';
import { http, HttpBody } from '@deepkit/http';
import { Logger } from '@deepkit/logger';
import { Email, MinLength } from '@deepkit/type';

interface CreateUser {
    username: string & MinLength<3>;
    email: string & Email;
}

class UserService {
    constructor(private logger: Logger) {}

    create(input: CreateUser) {
        this.logger.log(`New user ${input.username}`);
        return { id: 1, ...input };
    }
}

class UserController {
    constructor(private users: UserService) {}

    @http.POST('/users')
    create(body: HttpBody<CreateUser>) {
        return this.users.create(body);
    }
}

new App({
    controllers: [UserController],
    providers: [UserService],
    imports: [new FrameworkModule()],
}).run();
```

```sh
$ ts-node app.ts server:start

$ curl -X POST localhost:8080/users -H 'content-type: application/json' \
    -d '{"username":"Peter","email":"peter@example.com"}'
{"id":1,"username":"Peter","email":"peter@example.com"}

$ curl -X POST localhost:8080/users -H 'content-type: application/json' \
    -d '{"username":"ab","email":"nope"}'
HTTP/1.1 400 Bad Request
{
  "message": "Validation error: ...",
  "errors": [
    {
      "path": "username",
      "code": "minLength",
      "message": "Min length is 3",
      "value": "ab"
    },
    ...
  ]
}
```

リクエストボディはメソッドの実行前に `CreateUser` Interface に基づいて検証され、`UserService` はその Type から注入されます。新しいプロジェクトは `npm init @deepkit/app@latest my-app` で開始できます。

## NestJS および Express との比較

|                      | Deepkit Framework              | NestJS                                 | Express または Fastify    |
| -------------------- | ------------------------------ | -------------------------------------- | ------------------------- |
| リクエストのバリデーション | TypeScript の Type から        | デコレーター付き Class と validator pipe | 自分で追加                |
| 依存性注入           | 組み込み、デコレーター不要     | 組み込み、`@Injectable()` を使用       | 自分で追加                |
| ORM                  | 組み込み                       | 自分で追加                             | 自分で追加                |
| RPC                  | 組み込み                       | トランスポート経由で追加               | 自分で追加                |
| ビルドステップ       | Deepkit type compiler          | TypeScript compiler                    | 任意                      |

Deepkit は実行時に Type を読み取るため、ビルドに [type compiler](./runtime-types/getting-started.md) を組み込む必要があります。Express と NestJS にははるかに大きなエコシステムがあり、組み込み機能よりもそちらのほうが重要になる場合もあります。パフォーマンスについては [ベンチマークページ](/benchmarks) に掲載しています。

## フレームワークに含まれるもの

Deepkit Framework は `@deepkit/app` の [Deepkit App](./app.md) をベースとしており、`@deepkit/framework` で `FrameworkModule` モジュールを提供しています。このモジュールはアプリケーションにインポートできます。

`App` 抽象化は次の機能を提供します。

- CLI コマンド
- 設定の読み込み(環境変数、dotfile、カスタム)
- モジュールシステム
- 強力な Service Container
- コントローラー、プロバイダー、リスナーなどのレジストリとフック

`FrameworkModule` モジュールは次の追加機能を提供します。

- アプリケーションサーバー
    - HTTP サーバー
    - RPC サーバー
    - マルチプロセスのロードバランシング
    - SSL
- デバッグ用 CLI コマンド
- データベースマイグレーションの設定/コマンド
- `{debug: true}` オプションによるデバッグ/プロファイラー GUI
- インタラクティブな API ドキュメント(Swagger のようなもの)
- DatabaseRegistry、ProcessLocking、Broker、Sessions のプロバイダー
- 統合テスト API

アプリケーションは `FrameworkModule` を使っても使わなくても作成できます。

## インストール

Deepkit Framework は [Deepkit App](./app.md) をベースとしています。そのインストール手順を済ませていることを確認してください。
完了していれば、Deepkit Framework をインストールし、`App` に `FrameworkModule` をインポートできます。

```sh
npm install @deepkit/framework
```

```typescript
import { App } from '@deepkit/app';
import { FrameworkModule } from '@deepkit/framework';
import { Logger } from '@deepkit/logger';

const app = new App({
    imports: [new FrameworkModule({ debug: true })]
});

app.command('test', (logger: Logger) => {
    logger.log('Hello World!');
});

app.run();
```

アプリが `FrameworkModule` をインポートしたことで、トピックごとにグループ化された、より多くのコマンドが利用できるようになったことがわかります。

そのうちの 1 つが HTTP サーバーを起動する `server:start` です。これを使用するには、少なくとも 1 つの HTTP ルートを登録する必要があります。

```typescript
import { App } from '@deepkit/app';
import { FrameworkModule } from '@deepkit/framework';
import { HttpRouterRegistry } from '@deepkit/http';
import { Logger } from '@deepkit/logger';

const app = new App({
    imports: [new FrameworkModule({ debug: true })]
});

app.command('test', (logger: Logger) => {
    logger.log('Hello World!');
});


const router = app.get(HttpRouterRegistry);

router.get('/', () => {
    return 'Hello World';
})

app.run();
```

`server:start` コマンドを再度実行すると、HTTP サーバーが起動し、ルート `/` が利用可能になっていることがわかります。

```sh
$ ts-node app.ts server:start
```

```sh
$ curl http://localhost:8080/
Hello World
```

リクエストを処理する方法については、[HTTP](http.md) または [RPC](rpc.md) の章をお読みください。CLI コマンドの詳細については、[App](app.md) の章で学べます。

## App

`App` Class はアプリケーションのメインエントリーポイントです。すべてのモジュールと設定を読み込み、アプリケーションを起動する役割を担います。
また、すべての CLI コマンドを読み込んで実行する役割も担います。FrameworkModule のようなモジュールは、追加のコマンドの提供、イベントリスナーの登録、
HTTP/RPC 用コントローラーやサービスプロバイダーの提供などを行います。

この `app` オブジェクトを使えば、CLI コントローラーを実行せずに Dependency Injection コンテナへアクセスすることもできます。

```typescript
const app = new App({
    imports: [new FrameworkModule]
});

//登録されたすべてのサービスにアクセスする
const eventDispatcher = app.get(EventDispatcher);
```

`EventDispatcher` を取得できるのは、`FrameworkModule` がこれを他の多くのサービス(Logger、ApplicationServer、[その他多数](https://github.com/deepkit/deepkit-framework/blob/master/packages/framework/src/module.ts))と同様にサービスプロバイダーとして登録しているためです。

独自のサービスを登録することもできます。

```typescript

class MyService {
    constructor(private logger: Logger) {
    }

    helloWorld() {
        this.logger.log('Hello World');
    }
}

const app = new App({
    providers: [MyService],
    imports: [new FrameworkModule]
});

const service = app.get(MyService);

service.helloWorld();
```

### デバッガー

アプリケーションとすべてのモジュールの設定値は、デバッガーで表示できます。`FrameworkModule` の debug オプションを有効にして、`http://localhost:8080/_debug/configuration` を開いてください。

```typescript
import { App } from '@deepkit/app';
import { FrameworkModule } from '@deepkit/framework';

new App({
    imports: [
        new FrameworkModule({
            debug: true,
        })
    ]
}).run();
```

![デバッガーの設定画面](/assets/documentation/framework/debugger-configuration.png)

`ts-node app.ts debug:config` を使用して、利用可能なすべての設定オプション、現在の値、デフォルト値、説明、データ型を表示することもできます。

## イベント

Deepkit Framework には、イベントリスナーを登録できるさまざまなイベントトークンが用意されています。

イベントの仕組みの詳細については、[イベント](./app/events.md) の章を参照してください。

### イベントのディスパッチ

イベントは `EventDispatcher` Class を介して送信されます。Deepkit アプリでは、これを依存性注入によって取得できます。

```typescript
import { cli, Command } from '@deepkit/app';
import { BaseEvent, EventDispatcher, EventToken } from '@deepkit/event';

class UserEvent extends BaseEvent {
    constructor(public user: { username: string }) {
        super();
    }
}

const UserAdded = new EventToken<UserEvent>('user.added');

@cli.controller('test')
export class TestCommand implements Command {
    constructor(protected eventDispatcher: EventDispatcher) {
    }

    async execute() {
        const event = new UserEvent({ username: 'Peter' });
        await this.eventDispatcher.dispatch(UserAdded, event);
    }
}
```
