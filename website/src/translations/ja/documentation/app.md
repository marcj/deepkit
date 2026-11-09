# TypeScript CLI フレームワーク

Deepkit App は、関数シグネチャがそのままコマンド定義となる TypeScript CLI フレームワークです。引数、フラグ、デフォルト値、バリデーションはすべて TypeScript の型から導出されるため、同じ内容を二重に宣言する必要はありません。

```typescript title=app.ts
import { App, Flag } from '@deepkit/app';
import { Logger } from '@deepkit/logger';
import { Maximum } from '@deepkit/type';

class Greeter {
    constructor(private logger: Logger) {}

    greet(name: string) {
        this.logger.log(`Hello ${name}`);
    }
}

function greet(
    name: string,
    times: number & Maximum<5> & Flag = 1,
    greeter: Greeter,
) {
    for (let i = 0; i < times; i++) greeter.greet(name);
}

new App({ providers: [Greeter] })
    .command('greet', greet)
    .run();
```

`name` は必須の引数に、`times` はデフォルト値 1 の `--times` フラグになり、`greeter` は依存性注入コンテナから提供されます。

```sh
$ ts-node app.ts greet Peter --times 2
Hello Peter
Hello Peter

$ ts-node app.ts greet Peter --times 9
Invalid value for option --times: 9.
Number needs to be smaller than or equal to 5

$ ts-node app.ts greet Peter --times abc
Invalid value for option --times: abc.
Cannot convert abc to number [type]

$ ts-node app.ts greet --help
Usage: ts-node app.ts greet [OPTIONS] [name]

Arguments:
  name	[required]
Options:
  --times number [default=1]
```

## Commander、Yargs、oclif との比較

|                        | Deepkit App                      | Commander                 | Yargs                        | oclif                     |
| ---------------------- | -------------------------------- | ------------------------- | ---------------------------- | ------------------------- |
| オプションの定義方法   | コマンドの TypeScript 型         | `.option()` の呼び出し    | Builder の呼び出し           | クラスの静的 `flags`      |
| バリデーション         | 型から導出（例: `Maximum<5>`）   | 独自のパーサー関数        | `choices`、`coerce`、`check` | フラグオプションとパーサー |
| 依存性注入             | 組み込み                         | なし                      | なし                         | なし                      |
| 設定、モジュール       | 組み込み                         | なし                      | 設定ファイルのみ             | プラグイン                |

Deepkit は実行時に型を読み取るため、ビルドに [Deepkit 型コンパイラ](./runtime-types/getting-started.md)が必要です。ビルドステップのない小さなスクリプトであれば、Commander のようなライブラリの方が手軽です。

## Deepkit App に含まれるもの

Deepkit App は Deepkit アプリケーションの最も基本的な構成要素であり、ライブラリを単体で使用するのでなければ、通常はここから始めることになります。Node.js などのランタイムで実行する通常の TypeScript ファイルであり、次の機能を提供します。

- CLI コマンド
- モジュールシステム
- サービスコンテナ
- 依存性注入
- イベントシステム
- Logger
- 設定ローダー（env、dotenv、json）

コマンドは DI コンテナに完全にアクセスできるため、すべてのプロバイダーと設定オプションを利用できます。Deepkit 専用のグローバル CLI ツールはなく、HTTP/RPC サーバー、マイグレーション、独自のコマンドはすべて同じファイルから起動します。

`@deepkit/framework` を使用する [Deepkit Framework](./framework.md) は、HTTP/RPC 用のアプリケーションサーバーやデバッガー/プロファイラーなどを追加して、これをさらに拡張します。

## かんたんインストール

最も簡単に始める方法は、NPM init を使って新しい Deepkit プロジェクトを作成することです。

```shell
npm init @deepkit/app@latest my-deepkit-app
```

これにより、すべての依存関係と基本的な `app.ts` ファイルを含む新しいフォルダー `my-deepkit-app` が作成されます。

```sh
cd my-deepkit-app
npm run app
```

これは `ts-node` で `app.ts` ファイルを実行し、利用可能なコマンドを表示します。ここから独自のコマンドやコントローラーなどを追加していくことができます。

## 手動インストール

Deepkit App は [Deepkit Runtime Types](./runtime-types.md) をベースにしているため、すべての依存関係をインストールします。

```bash
mkdir my-project && cd my-project

npm install typescript ts-node 
npm install @deepkit/app @deepkit/type @deepkit/type-compiler
```

次に、以下のコマンドを実行して、`node_modules/typescript` にインストールされた TypeScript パッケージへ Deepkit の型コンパイラがインストールされるようにします。

```sh
./node_modules/.bin/deepkit-type-install
```

すべての peer dependencies がインストールされていることを確認してください。NPM 7 以降では、デフォルトで自動的にインストールされます。

アプリケーションをコンパイルするには TypeScript コンパイラが必要です。また、アプリを簡単に実行するために `ts-node` を推奨します。

`ts-node` を使用する代わりに、TypeScript コンパイラでソースコードをコンパイルし、生成された JavaScript を直接実行する方法もあります。この方法には、短時間で終わるコマンドの実行速度が劇的に向上するという利点があります。
ただし、コンパイラを手動で実行するか watcher をセットアップする必要があるため、ワークフローに追加の負担が生じます。
そのため、このドキュメントのすべての例では `ts-node` を使用しています。

## 最初のアプリケーション

Deepkit フレームワークは設定ファイルや特別なフォルダー構造を使用しないため、プロジェクトは自由に構成できます。始めるために必要なファイルは、TypeScript の app.ts ファイルと TypeScript の設定ファイル tsconfig.json の 2 つだけです。

プロジェクトフォルダーに次のファイルが揃った状態を目指します。

```
.
├── app.ts
├── node_modules
├── package-lock.json
└── tsconfig.json
```

基本的な tsconfig ファイルを用意し、`reflection` を `true` に設定して Deepkit の型コンパイラを有効にします。
これは、依存性注入コンテナやその他の機能を使用するために必要です。

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

このコードでは、test コマンドを定義し、新しいアプリを作成して `run()` で直接実行しています。このスクリプトを実行すると、アプリが起動します。

では、直接実行してみましょう。

```sh
$ ./node_modules/.bin/ts-node app.ts
VERSION
  Node

USAGE
  $ ts-node app.ts [COMMAND]

COMMANDS
  test
```

次に、test コマンドを実行するために、以下のコマンドを実行します。

```sh
$ ./node_modules/.bin/ts-node app.ts test
Hello World
```

Deepkit では、すべてこの `app.ts` を介して行います。ファイル名は自由に変更でき、複数作成することもできます。カスタム CLI コマンド、HTTP/RPC サーバー、マイグレーションコマンドなどは、すべてこのエントリーポイントから起動します。

## 引数とフラグ

Deepkit App は、関数のパラメーターを CLI の引数とフラグに自動的に変換します。パラメーターの順序が CLI 引数の順序を決定します。

パラメーターには任意の TypeScript 型を使用でき、自動的にバリデーションとデシリアライズが行われます。

詳しくは[引数とフラグ](./app/arguments.md)の章を参照してください。

## 依存性注入

Deepkit App はサービスコンテナをセットアップし、インポートされた各モジュールに対して、親から継承する専用の依存性注入コンテナを用意します。
次のプロバイダーが標準で提供されており、サービス、コントローラー、イベントリスナーに自動的に注入できます。

- ロギング用の `Logger`
- イベント処理用の `EventDispatcher`
- 登録済み CLI コマンド用の `CliControllerRegistry`
- 登録済みミドルウェア用の `MiddlewareRegistry`
- 現在のインジェクターコンテキスト用の `InjectorContext`

Deepkit Framework をインポートすると、追加のプロバイダーを利用できます。詳しくは [Deepkit Framework](./framework.md) を参照してください。

## 終了コード

終了コードはデフォルトで 0 であり、コマンドが正常に実行されたことを意味します。終了コードを変更するには、execute メソッドまたはコマンドのコールバックで 0 以外の数値を返します。

```typescript
import { cli } from '@deepkit/app';

@cli.controller('test')
export class TestCommand {
    async execute() {
        console.error('Error :(');
        return 12;
    }
}
```
