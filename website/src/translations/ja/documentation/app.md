# Deepkit App

Deepkit App の抽象化は、Deepkit アプリケーションの最も基本的な構成要素です。ライブラリを単体で使用しない場合、通常はここからアプリケーションの構築を始めます。
これは Node.js などのランタイムで実行する通常の TypeScript ファイルです。アプリケーションのエントリーポイントであり、CLI コマンド、サービス、設定、イベントなどを定義する手段を提供します。

コマンドラインインターフェース (CLI) プログラムは、テキスト入力とテキスト出力の形でターミナルを介して対話するプログラムです。この方式でアプリケーションと対話する利点は、ローカルまたは SSH 接続経由でターミナルさえあればよいという点です。

以下の機能を提供します:

- CLI コマンド
- モジュールシステム
- サービスコンテナ
- 依存性注入
- イベントシステム
- Logger
- 設定ローダー (env、dotenv、json)

Deepkit のコマンドは DI コンテナに完全にアクセスできるため、すべてのプロバイダーと設定オプションにアクセスできます。CLI コマンドの引数とオプションは TypeScript の型によるパラメーター宣言で制御され、自動的にシリアライズおよびバリデーションされます。

`@deepkit/framework` を使用する [Deepkit Framework](./framework.md) は、HTTP/RPC 用のアプリケーションサーバー、デバッガー/プロファイラーなどでこれをさらに拡張します。

例:

```typescript
import { App, Flag } from '@deepkit/app';
import { Database } from './database';

const app = new App({
    providers: [Database]
});

async function testCommand(
    name: string, // CLI argument
    age: number & Flag, // CLI flag
    database: Database, // Dependency Injection
) {
    console.log(`Hello ${name}!`);
    const users = await database.query<User>().find();
}

app.command('test', testCommand);

void app.run();
```

```sh
ts-node app.ts test John --age 42
```

## 簡単なインストール

最も簡単に始める方法は、NPM init を使用して新しい Deepkit プロジェクトを作成することです。

```shell
npm init @deepkit/app@latest my-deepkit-app
````

これにより、すべての依存関係と基本的な `app.ts` ファイルを含む新しいフォルダー `my-deepkit-app` が作成されます。

```sh
cd my-deepkit-app
npm run app
````

これにより `app.ts` ファイルが `ts-node` で実行され、利用可能なコマンドが表示されます。ここから始めて、独自のコマンドやコントローラーなどを追加できます。

## 手動でのインストール

Deepkit App は [Deepkit Runtime Types](./runtime-types.md) に基づいているため、すべての依存関係をインストールしましょう:

```bash
mkdir my-project && cd my-project

npm install typescript ts-node 
npm install @deepkit/app @deepkit/type @deepkit/type-compiler
```

次に、以下のコマンドを実行して、Deepkit の型コンパイラが `node_modules/typescript` にインストールされた TypeScript パッケージに組み込まれるようにします:

```sh
./node_modules/.bin/deepkit-type-install
```

すべての peer dependencies がインストールされていることを確認してください。デフォルトでは、NPM 7 以降はそれらを自動的にインストールします。

アプリケーションをコンパイルするには TypeScript コンパイラが必要で、アプリを簡単に実行するために `ts-node` を推奨します。

`ts-node` を使用する代わりに、TypeScript コンパイラでソースコードをコンパイルし、JavaScript のソースコードを直接実行する方法もあります。これには、短いコマンドの実行速度が劇的に向上するという利点があります。しかし、コンパイラを手動で実行するか、ウォッチャーを設定する必要があるため、ワークフローに追加のオーバーヘッドが生じます。このため、本ドキュメントのすべての例では `ts-node` を使用しています。

## 最初のアプリケーション

Deepkit フレームワークは設定ファイルや特別なフォルダー構造を使用しないため、プロジェクトは自由に構成できます。始めるのに必要なファイルは、TypeScript の app.ts ファイルと TypeScript の設定ファイル tsconfig.json の 2 つだけです。

目標は、プロジェクトフォルダーに以下のファイルを用意することです:

```
.
├── app.ts
├── node_modules
├── package-lock.json
└── tsconfig.json
```

基本的な tsconfig ファイルを用意し、`reflection` を `true` に設定して Deepkit の型コンパイラを有効にします。
これは依存性注入コンテナやその他の機能を使用するために必要です。

```json title=tsconfig.json
{
  "compilerOptions": {
    "outDir": "./dist",
    "experimentalDecorators": true,
    "strict": true,
    "esModuleInterop": true,
    "target": "es2020",
    "module": "CommonJS",
    "moduleResolution": "node"
  },
  "reflection": true,
  "files": [
    "app.ts"
  ]
}
```

```typescript title=app.ts
import { App } from '@deepkit/app';
import { Logger } from '@deepkit/logger';

const app = new App();

app.command('test', (logger: Logger) => {
    logger.log('Hello World!');
});

app.run();
```

このコードでは、test コマンドを定義し、新しいアプリを作成して `run()` で直接実行していることがわかります。このスクリプトを実行することで、アプリが起動します。

そして直接実行します。

```sh
$ ./node_modules/.bin/ts-node app.ts
VERSION
  Node

USAGE
  $ ts-node app.ts [COMMAND]

COMMANDS
  test
```

次に、test コマンドを実行するには、以下のコマンドを実行します。

```sh
$ ./node_modules/.bin/ts-node app.ts test
Hello World
```

Deepkit では、すべてがこの `app.ts` を介して行われます。ファイル名は自由に変更でき、さらにファイルを作成することもできます。カスタム CLI コマンド、HTTP/RPC サーバー、マイグレーションコマンドなどは、すべてこのエントリーポイントから起動されます。

## 引数とフラグ

Deepkit App は関数のパラメーターを自動的に CLI の引数とフラグに変換します。パラメーターの順序が CLI 引数の順序を決定します。

パラメーターには任意の TypeScript の型を使用でき、自動的にバリデーションおよびデシリアライズされます。

詳細については、[引数とフラグ](./app/arguments.md) の章を参照してください。

## 依存性注入

Deepkit App はサービスコンテナを構築し、インポートされた各モジュールに対して、親から継承する独自の依存性注入コンテナを用意します。
サービス、コントローラー、イベントリスナーに自動的に注入できる以下のプロバイダーが標準で用意されています:

- ロギング用の `Logger`
- イベント処理用の `EventDispatcher`
- 登録された CLI コマンド用の `CliControllerRegistry`
- 登録されたミドルウェア用の `MiddlewareRegistry`
- 現在のインジェクターコンテキスト用の `InjectorContext`

Deepkit Framework をインポートすると、追加のプロバイダーが利用可能になります。詳細は [Deepkit Framework](./framework.md) を参照してください。

## 終了コード

終了コードはデフォルトで 0 であり、コマンドが正常に実行されたことを意味します。終了コードを変更するには、execute メソッドまたはコマンドのコールバックで 0 以外の数値を返す必要があります。

```typescript

@cli.controller('test')
export class TestCommand {
    async execute() {
        console.error('Error :(');
        return 12;
    }
}
```
