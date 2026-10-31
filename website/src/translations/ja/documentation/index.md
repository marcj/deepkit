# ドキュメント

Deepkit は、MIT ライセンスの下で自由に利用できるオープンソースの TypeScript フレームワークで、スケーラブルで保守しやすいバックエンドアプリケーションの構築を支援します。ブラウザと Node.js で動作するように設計されていますが、適切な JavaScript 環境であればどこでも実行できます。

ここでは Deepkit のさまざまなコンポーネントに関する章と、すべてのパッケージの API リファレンスを見つけることができます。

ヘルプが必要な場合は、[Discord サーバー](https://discord.com/invite/PtfVf7B8UU) に参加するか、[GitHub](https://github.com/deepkit/deepkit-framework) で issue を作成してください。

## 章


- [アプリ](/documentation/app.md) - コマンドラインインターフェイス (CLI) を使って Deepkit で最初のアプリケーションを作成します。
- [フレームワーク](/documentation/framework.md) - アプリケーションに (HTTP/RPC) サーバー、API ドキュメント、デバッガ、統合テストなどを追加します。
- [ランタイム型](/documentation/runtime-types.md) - TypeScript のランタイム型について学び、データの検証と変換を行います。
- [依存性注入](/documentation/dependency-injection.md) - 依存性注入コンテナ、制御の反転、依存性逆転。
- [ファイルシステム](/documentation/filesystem.md) - ローカルおよびリモートのファイルシステムを統一的に扱うためのファイルシステム抽象化。
- [ブローカー](/documentation/broker.md) - 分散 L2 キャッシュ、Pub/Sub、キュー、中央のアトミックロック、キー・バリューストアを扱うためのメッセージブローカー抽象化。
- [HTTP](/documentation/http.md) - 型安全なエンドポイントを構築するための HTTP サーバー抽象化。
- [RPC](/documentation/rpc.md) - フロントエンドとバックエンド、または複数のバックエンドサービスを接続するためのリモートプロシージャコール (RPC) 抽象化。
- [ORM](/documentation/orm.md) - 型安全にデータを保存およびクエリするための ORM と DBAL。
- [デスクトップ UI](/documentation/desktop-ui/getting-started) - Deepkit の Angular ベースの UI フレームワークで GUI アプリケーションを構築します。

## API リファレンス

以下は、すべての Deepkit パッケージとその API ドキュメントへのリンクの完全な一覧です。

### 構成

- [@deepkit/app](/documentation/package/app.md)
- [@deepkit/framework](/documentation/package/framework.md)
- [@deepkit/http](/documentation/package/http.md)
- [@deepkit/angular-ssr](/documentation/package/angular-ssr.md)

### インフラストラクチャ

- [@deepkit/rpc](/documentation/package/rpc.md)
- [@deepkit/rpc-tcp](/documentation/package/rpc-tcp.md)
- [@deepkit/broker](/documentation/package/broker.md)
- [@deepkit/broker-redis](/documentation/package/broker-redis.md)

### ファイルシステム

- [@deepkit/filesystem](/documentation/package/filesystem.md)
- [@deepkit/filesystem-ftp](/documentation/package/filesystem-ftp.md)
- [@deepkit/filesystem-sftp](/documentation/package/filesystem-sftp.md)
- [@deepkit/filesystem-s3](/documentation/package/filesystem-aws-s3.md)
- [@deepkit/filesystem-google](/documentation/package/filesystem-google.md)
- [@deepkit/filesystem-database](/documentation/package/filesystem-database.md)

### データベース

- [@deepkit/orm](/documentation/package/orm.md)
- [@deepkit/mysql](/documentation/package/mysql.md)
- [@deepkit/postgres](/documentation/package/postgres.md)
- [@deepkit/sqlite](/documentation/package/sqlite.md)
- [@deepkit/mongodb](/documentation/package/mongo.md)

### 基礎

- [@deepkit/type](/documentation/package/type.md)
- [@deepkit/event](/documentation/package/event.md)
- [@deepkit/injector](/documentation/package/injector.md)
- [@deepkit/template](/documentation/package/template.md)
- [@deepkit/logger](/documentation/package/logger.md)
- [@deepkit/workflow](/documentation/package/workflow.md)
- [@deepkit/stopwatch](/documentation/package/stopwatch.md)

### ツール

- [@deepkit/api-console](/documentation/package/api-console.md)
- [@deepkit/devtool](/documentation/package/devtool.md)
- [@deepkit/desktop-ui](/documentation/desktop-ui/getting-started.md)
- [@deepkit/orm-browser](/documentation/package/orm-browser.md)
- [@deepkit/bench](/documentation/package/bench.md)
- [@deepkit/run](/documentation/package/run.md)

### コア

- [@deepkit/bson](/documentation/package/bson.md)
- [@deepkit/core](/documentation/package/core.md)
- [@deepkit/topsort](/documentation/package/topsort.md)

### ランタイム

- [@deepkit/vite](/documentation/package/vite.md)
- [@deepkit/bun](/documentation/package/bun.md)
- [@deepkit/type-compiler](/documentation/package/type-compiler.md)