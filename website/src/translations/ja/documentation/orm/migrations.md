# マイグレーション

マイグレーションは、データベーススキーマの変更を構造化され整理された方法で行うための仕組みです。マイグレーションはディレクトリ内に TypeScript ファイルとして保存され、コマンドラインツールを使用して実行できます。

Deepkit Framework を使用している場合、Deepkit ORM のマイグレーションはデフォルトで有効になっています。

## コマンド

- `migration:create` - データベースの差分に基づいて新しいマイグレーションファイルを生成します
- `migration:pending` - 保留中のマイグレーションファイルを表示します
- `migration:up` - 保留中のマイグレーションファイルを実行します。
- `migration:down` - down マイグレーションを実行し、古いマイグレーションファイルを元に戻します

これらのコマンドは、`FrameworkModule` をインポートした場合はアプリケーション内で、または `@deepkit/sql` の `deepkit-sql` コマンドラインツールを介して利用できます。

[FrameworkModule のマイグレーション統合](../framework/database.md#migration)は、データベースを自動的に読み込みます（データベースは provider として定義する必要があります）。一方、`deepkit-sql` では、データベースをエクスポートしている TypeScript ファイルを指定する必要があります。後者は、Deepkit Framework を使わずに Deepkit ORM をスタンドアロンで使用する場合に便利です。

## マイグレーションの作成

```typescript
//database.ts
import { Database } from '@deepkit/orm';
import { SQLiteDatabaseAdapter } from '@deepkit/sqlite';
import { User } from './models';

export class SQLiteDatabase extends Database {
    name = 'default';
    constructor() {
        super(new SQLiteDatabaseAdapter('/tmp/myapp.sqlite'), [User]);
    }
}

export const database = new SQLiteDatabase();
```

```sh
./node_modules/.bin/deepkit-sql migration:create --path database.ts --migrationDir src/migrations
```

`--path` には `Database` インスタンスをエクスポートしているファイルを指定します（複数回指定できます）。エンティティが実行時の型情報を取得できるように、TypeScript ファイルは `ts-node` で読み込まれるため、`ts-node` をインストールしておく必要があります。

新しいマイグレーションファイルが `src/migrations` に作成されます。

新しく作成されたマイグレーションファイルには、TypeScript アプリで定義されたエンティティと設定されたデータベースとの差分に基づいた up メソッドと down メソッドが含まれています。
up メソッドは必要に応じて変更できます。down メソッドは up メソッドに基づいて自動的に生成されます。
このファイルをリポジトリにコミットすることで、他の開発者も実行できるようになります。

## 保留中のマイグレーション

```sh
./node_modules/.bin/deepkit-sql migration:pending --path database.ts --migrationDir src/migrations
```

これにより、保留中のすべてのマイグレーションが表示されます。まだ実行されていない新しいマイグレーションファイルがある場合は、ここに一覧表示されます。

## マイグレーションの実行

```sh
./node_modules/.bin/deepkit-sql migration:up --path database.ts --migrationDir src/migrations
```

これにより、次の保留中のマイグレーションが実行されます。

## マイグレーションの取り消し

```sh
./node_modules/.bin/deepkit-sql migration:down --path database.ts --migrationDir src/migrations
```

これにより、最後に実行されたマイグレーションが元に戻されます。

## フェイクマイグレーション

マイグレーション（up または down）を実行しようとしたものの、失敗したとします。問題を手動で修正しましたが、そのマイグレーションはすでに実行済みであるため、再度実行することができません。このような場合、`--fake` オプションを使用してマイグレーションをフェイクすることで、実際には実行せずにデータベース上で実行済みとしてマークできます。これにより、次の保留中のマイグレーションを実行できるようになります。

```sh
./node_modules/.bin/deepkit-sql migration:up --path database.ts --migrationDir src/migrations --fake
```
