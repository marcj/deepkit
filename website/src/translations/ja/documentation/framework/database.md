# データベース

Deepkit には、Deepkit ORM と呼ばれる強力なデータベース抽象化ライブラリがあります。これは、SQL データベースや MongoDB の操作を容易にする Object-Relational Mapping（ORM）ライブラリです。

任意のデータベースライブラリを使用できますが、Deepkit フレームワークと完全に統合され、ワークフローと効率を向上させる多数の機能を備え、TypeScript で最速のデータベース抽象化ライブラリであるため、Deepkit ORM を推奨します。

この章では、Deepkit アプリで Deepkit ORM を使用する方法を説明します。Deepkit ORM の詳細については、[ORM](../orm.md) の章を参照してください。

## データベースクラス

アプリケーション内で Deepkit ORM の `Database` オブジェクトを使用する最も簡単な方法は、それを継承したクラスを登録することです。

```typescript
import { Database } from '@deepkit/orm';
import { SQLiteDatabaseAdapter } from '@deepkit/sqlite';
import { User } from './models';

export class SQLiteDatabase extends Database {
    constructor() {
        super(
            new SQLiteDatabaseAdapter('/tmp/myapp.sqlite'), 
            [User]
        );
    }
}
```

新しいクラスを作成し、そのコンストラクタでパラメータ付きのアダプタを指定し、このデータベースに接続すべきすべてのエンティティモデルを第 2 引数に追加します。

このデータベースクラスをプロバイダーとして登録できます。さらに、`migrateOnStartup` を有効にすると、ブートストラップ時にデータベース内のすべてのテーブルが自動的に作成されます。これは迅速なプロトタイピングに最適ですが、本格的なプロジェクトや本番環境では推奨されません。通常のデータベースマイグレーションを使用してください。

また `debug` も有効にします。これにより、アプリケーションのサーバー起動時にデバッガを開き、組み込みの ORM ブラウザでデータベースモデルを直接管理できます。

```typescript
import { App } from '@deepkit/app';
import { FrameworkModule } from '@deepkit/framework';
import { SQLiteDatabase } from './database.ts';

new App({
    providers: [SQLiteDatabase],
    imports: [
        new FrameworkModule({
            migrateOnStartup: true,
            debug: true,
        })
    ]
}).run();
```

Dependency Injection を使用して、どこからでも `SQLiteDatabase` にアクセスできます:

```typescript
import { SQLiteDatabase } from './database.ts';

export class Controller {
    constructor(protected database: SQLiteDatabase) {}

    @http.GET()
    async startPage(): Promise<User[]> {
        // すべてのユーザーを返す
        return await this.database.query(User).find();
    }
}
```

## 設定

多くの場合、接続認証情報を設定可能にしたいでしょう。例えば、本番とは異なるデータベースをテストで使用したい場合です。これは `Database` クラスの `config` オプションを用いることで実現できます。

```typescript
//database.ts
import { Database } from '@deepkit/orm';
import { PostgresDatabaseAdapter } from '@deepkit/sqlite';
import { User } from './models';

type DbConfig = Pick<AppConfig, 'databaseHost', 'databaseUser', 'databasePassword'>;

export class MainDatabase extends Database {
    constructor(config: DbConfig) {
        super(new PostgresDatabaseAdapter({
            host: config.databaseHost,
            user: config.databaseUser,
            password: config.databasePassword,
        }), [User]);
    }
}
```

```typescript
//config.ts
export class AppConfig {
    databaseHost: string = 'localhost';
    databaseUser: string = 'postgres';
    databasePassword: string = '';
}
```

```typescript
//app.ts
import { App } from '@deepkit/app';
import { FrameworkModule } from '@deepkit/framework';
import { MainDatabase } from './database.ts';
import { AppConfig } from './config.ts';

const app = new App({
    config: AppConfig,
    providers: [MainDatabase],
    imports: [
        new FrameworkModule({
            migrateOnStartup: true,
            debug: true,
        })
    ]
});
app.loadConfigFromEnv({prefix: 'APP_', namingStrategy: 'upper', envFilePath: ['local.env', 'prod.env']});
app.run();
```

これで、`loadConfigFromEnv` を使用しているため、環境変数を通じてデータベースの認証情報を設定できます。

```sh
APP_DATABASE_HOST=localhost APP_DATABASE_USER=postgres ts-node app.ts server:start
```

または `local.env` ファイルに記述し、事前に環境変数を設定せずに `ts-node app.ts server:start` を起動します。

```sh
APP_DATABASE_HOST=localhost
APP_DATABASE_USER=postgres
```

## 複数のデータベース

必要なだけデータベースクラスを追加し、任意の名前を付けられます。Deepkit ORM Browser を使用する際に他と衝突しないよう、各データベースの名前を必ず変更してください。

## データの管理

これで Deepkit ORM Browser を使ってデータベースのデータを管理する準備が整いました。Deepkit ORM Browser を開いて内容を管理するには、上記のすべての手順を `app.ts` に記述し、サーバーを起動します。

```sh
$ ts-node app.ts server:start
2021-06-11T15:08:54.330Z [LOG] Start HTTP server, using 1 workers.
2021-06-11T15:08:54.333Z [LOG] Migrate database default
2021-06-11T15:08:54.336Z [LOG] RPC DebugController deepkit/debug/controller
2021-06-11T15:08:54.337Z [LOG] RPC OrmBrowserController orm-browser/controller
2021-06-11T15:08:54.337Z [LOG] HTTP OrmBrowserController
2021-06-11T15:08:54.337Z [LOG]     GET /_orm-browser/query httpQuery
2021-06-11T15:08:54.337Z [LOG] HTTP StaticController
2021-06-11T15:08:54.337Z [LOG]     GET /_debug/:any serviceApp
2021-06-11T15:08:54.337Z [LOG] HTTP listening at http://localhost:8080/
```

http://localhost:8080/_debug/database/default を開けます。

![デバッガ データベース](/assets/documentation/framework/debugger-database.png)

ER（エンティティリレーションシップ）図が表示されます。現在は 1 つのエンティティしかありません。リレーションを持つものを追加すると、すべての情報が一目で分かります。

左側のサイドバーで `User` をクリックすると、その内容を管理できます。`+` アイコンをクリックして新しいレコードのタイトルを変更します。必要な値（ユーザー名など）を変更したら、`Confirm` をクリックします。これにより、すべての変更がデータベースにコミットされ、永続化されます。自動採番された ID は自動的に割り当てられます。

![デバッガ データベース ユーザー](/assets/documentation/framework/debugger-database-user.png)

## さらに詳しく

`SQLiteDatabase` の動作についてさらに知るには、[データベース](../orm.md) の章と、そのサブチャプター（データのクエリ、セッションを介したデータ操作、リレーションの定義など）を参照してください。
なお、そこにある章はスタンドアロンライブラリ `@deepkit/orm` を対象としており、この章で説明した Deepkit フレームワークの部分のドキュメントは含まれていません。スタンドアロンライブラリでは、例えば `new SQLiteDatabase()` のようにデータベースクラスを手動でインスタンス化します。しかし Deepkit アプリでは、これは Dependency Injection コンテナによって自動的に行われます。

## マイグレーション

Deepkit フレームワークには、マイグレーションの作成・実行・取り消しを可能にする強力なマイグレーションシステムがあります。マイグレーションシステムは Deepkit ORM ライブラリに基づいており、フレームワークに完全に統合されています。

`FrameworkModule` はマイグレーションを管理するための複数のコマンドを提供します。

- `migration:create` - データベースの差分に基づいて新しいマイグレーションファイルを生成します
- `migration:pending` - 保留中のマイグレーションファイルを表示します
- `migration:up` - 保留中のマイグレーションファイルを実行します。
- `migration:down` - ダウンマイグレーションを実行し、古いマイグレーションを取り消します

```sh
ts-node app.ts migration:create --migrationDir src/migrations
```

新しいマイグレーションファイルが `migrations` に作成されます。このフォルダは FrameworkModule で設定されているデフォルトのディレクトリです。変更するには、環境変数（[設定](../app/configuration.md) の章で説明）で構成を変更するか、`FrameworkModule` のコンストラクタに `migrationDir` オプションを渡します。

```typescript
new FrameworkModule({
    migrationDir: 'src/migrations',
})
```

新しく作成されたマイグレーションファイルには、TypeScript アプリで定義されたエンティティと設定済みデータベースの差分に基づく up メソッドと down メソッドが含まれています。
必要に応じて up メソッドを変更できます。down メソッドは up メソッドに基づいて自動生成されます。
このファイルをリポジトリにコミットし、他の開発者も実行できるようにします。

### 保留中のマイグレーション

```sh
ts-node app.ts migration:pending --migrationDir src/migrations
```

保留中のマイグレーションがすべて表示されます。まだ実行されていない新しいマイグレーションファイルがある場合、ここに表示されます。

### マイグレーションの実行

```sh
ts-node app.ts migration:up --migrationDir src/migrations
```

次の保留中のマイグレーションを実行します。

### マイグレーションの取り消し

```sh
ts-node app.ts migration:down --migrationDir src/migrations
```

最後に実行したマイグレーションを取り消します。

### 疑似マイグレーション

たとえば、あるマイグレーション（up または down）を実行しようとして失敗したとします。問題を手作業で修正したものの、そのマイグレーションはすでに実行済みとして扱われるため、再実行できません。`--fake` オプションを使うと、実際には実行せずにデータベース上で実行済みとして印を付けることができます。これにより、次の保留中のマイグレーションを実行できるようになります。

```sh
ts-node app.ts migration:up --migrationDir src/migrations --fake
```