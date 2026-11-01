# 引数とフラグ

ターミナルにおけるコマンドの引数は、`execute` メソッドまたは関数の通常の引数です。これらは自動的にコマンドライン引数にマッピングされます。
パラメーターをオプショナルとしてマークすると、渡す必要はありません。デフォルト値がある場合も、渡す必要はありません。

型（string、number、union など）に応じて、渡された値は自動的にデシリアライズおよびバリデーションされます。

```typescript
import { cli } from '@deepkit/app';

//関数
new App().command('test', (name: string) => {
    console.log('Hello', name);
});

//クラス
@cli.controller('test')
class TestCommand {
    async execute(name: string) {
        console.log('Hello', name);
    }
}
```

name パラメーターを指定せずにこのコマンドを実行すると、エラーが発生します:

```sh
$ ts-node app.ts test
RequiredArgsError: Missing 1 required arg:
name
```

`--help` を使用すると、必須の引数についての詳細情報が得られます:

```sh
$ ts-node app.ts test --help
USAGE
  $ ts-node-script app.ts test NAME
```

name を引数として渡すと、コマンドが実行され、name が正しく渡されます。

```sh
$ ts-node app.ts test "beautiful world"
Hello beautiful world
```

string、number、boolean、文字列リテラル、それらの union、およびそれらの配列といったすべてのプリミティブなパラメーター型は、自動的に CLI 引数として使用され、
自動的にバリデーションおよびデシリアライズされます。パラメーターの順序が CLI 引数の順序を決定します。パラメーターはいくつでも追加できます。

複雑なオブジェクト（interface、class、オブジェクトリテラル）が定義されると、それはサービスの依存関係として扱われ、
Dependency Injection Container がそれを解決しようとします。詳細については [依存性注入](dependency-injection.md) の章を参照してください。

### 複数の値

配列として型付けされた引数は、残りのすべての位置引数を受け取ります。各値はデシリアライズされ、要素の型に対してバリデーションされます。
配列の後にある引数はその値を保持するため、`cp <files...> <target>` のようなコマンドも期待どおりに動作します。

```typescript
new App().command('copy', (files: string[], target: string) => {
    console.log('copy', files, 'to', target);
});

new App().command('delete', (ids: number[]) => {
    console.log('delete', ids);
});
```

```sh
$ ts-node app.ts copy a.txt b.txt backup/
copy [ 'a.txt', 'b.txt' ] to backup/

$ ts-node app.ts delete 1 2 3
delete [ 1, 2, 3 ]

$ ts-node app.ts delete 1 two
Invalid value for argument ids: 1,two. Cannot convert two to number [type]
```

必須の配列引数には少なくとも 1 つの値が必要です。`ids: number[] = []` のようにデフォルト値がある場合は、オプショナルになります。

## フラグ

フラグは、コマンドに値を渡すもう 1 つの方法です。ほとんどの場合オプショナルですが、そうである必要はありません。`Flag` 型で修飾されたパラメーターは、`--name value` または `--name=value` で渡すことができます。

```typescript
import { Flag } from '@deepkit/app';

//関数
new App().command('test', (id: number & Flag) => {
    console.log('id', name);
});

//クラス
class TestCommand {
    async execute(id: number & Flag) {
        console.log('id', id);
    }
}
```

```sh
$ ts-node app.ts test --help
USAGE
  $ ts-node app.ts test

OPTIONS
  --id=id  (required)
```

ヘルプ表示の「OPTIONS」で、`--id` フラグが必要であることがわかります。このフラグを正しく入力すると、コマンドはこの値を受け取ります。

```sh
$ ts-node app.ts test --id 23
id 23

$ ts-node app.ts test --id=23
id 23
```

### Boolean フラグ

フラグには、値なしのフラグとしても使用できるという利点があります。例えば、特定の動作を有効にするためなどです。パラメーターがオプショナルな Boolean としてマークされると、この動作が有効になります。

```typescript
import { Flag } from '@deepkit/app';

//関数
new App().command('test', (remove: boolean & Flag = false) => {
    console.log('delete?', remove);
});

//クラス
class TestCommand {
    async execute(remove: boolean & Flag = false) {
        console.log('delete?', remove);
    }
}
```

```sh
$ ts-node app.ts test
delete? false

$ ts-node app.ts test --remove
delete? true
```

### 複数のフラグ

同じフラグに複数の値を渡すには、フラグを配列としてマークします。

```typescript
import { Flag } from '@deepkit/app';

//関数
new App().command('test', (id: number[] & Flag = []) => {
    console.log('ids', id);
});

//クラス
class TestCommand {
    async execute(id: number[] & Flag = []) {
        console.log('ids', id);
    }
}
```

```sh
$ ts-node app.ts test
ids: []

$ ts-node app.ts test --id 12
ids: [12]

$ ts-node app.ts test --id 12 --id 23
ids: [12, 23]
```

### 1 文字のフラグ

フラグを 1 文字でも渡せるようにするには、`Flag<{char: 'x'}>` を使用します。

```typescript
import { Flag } from '@deepkit/app';

//関数
new App().command('test', (output: string & Flag<{char: 'o'}>) => {
    console.log('output: ', output);
});

//クラス
class TestCommand {
    async execute(output: string & Flag<{char: 'o'}>) {
        console.log('output: ', output);
    }
}
```

```sh
$ ts-node app.ts test --help
USAGE
  $ ts-node app.ts test

OPTIONS
  -o, --output=output  (required)


$ ts-node app.ts test --output test.txt
output: test.txt

$ ts-node app.ts test -o test.txt
output: test.txt
```

## オプショナル / デフォルト

メソッド/関数のシグネチャによって、どの引数やフラグがオプショナルかが定義されます。型システムでパラメーターがオプショナルであれば、ユーザーはそれを指定する必要はありません。

```typescript

//関数
new App().command('test', (name?: string) => {
    console.log('Hello', name || 'nobody');
});

//クラス
class TestCommand {
    async execute(name?: string) {
        console.log('Hello', name || 'nobody');
    }
}
```

```sh
$ ts-node app.ts test
Hello nobody
```

デフォルト値を持つパラメーターも同様です:

```typescript
//関数
new App().command('test', (name: string = 'body') => {
    console.log('Hello', name);
});

//クラス
class TestCommand {
    async execute(name: string = 'body') {
        console.log('Hello', name);
    }
}
```

```sh
$ ts-node app.ts test
Hello nobody
```

これはフラグにも同様に適用されます。


## シリアライズ / バリデーション

すべての引数とフラグは、その型に基づいて自動的にデシリアライズおよびバリデーションされ、追加の制約を付与することもできます。

そのため、コマンドラインインターフェイスはテキスト、つまり文字列に基づいているにもかかわらず、number として定義された引数は、コントローラー内では常に実際の数値であることが保証されます。

```typescript
//関数
new App().command('test', (id: number) => {
    console.log('id', id, typeof id);
});

//クラス
class TestCommand {
    async execute(id: number) {
        console.log('id', id, typeof id);
    }
}
```

```sh
$ ts-node app.ts test 123
id 123 number
```

追加の制約は、`@deepkit/type` の型アノテーションで定義できます。

```typescript
import { Positive } from '@deepkit/type';
//関数
new App().command('test', (id: number & Positive) => {
    console.log('id', id, typeof id);
});

//クラス
class TestCommand {
    async execute(id: number & Positive) {
        console.log('id', id, typeof id);
    }
}
```

`id` の `Postive` 型は、正の数のみが許可されることを示します。ユーザーが負の数を渡すと、コードはまったく実行されず、エラーメッセージが表示されます。

```sh
$ ts-node app.ts test -123
Validation error in id: Number needs to be positive [positive]
```

この非常に簡単に行える追加のバリデーションにより、コマンドは誤った入力に対してはるかに堅牢になります。詳細については [バリデーション](../runtime-types/validation.md) の章を参照してください。

## 説明

フラグや引数を説明するには、`@description` コメントデコレーターを使用します。

```typescript
import { Positive } from '@deepkit/type';

class TestCommand {
    async execute(
        /** @description The users identifier */
        id: number & Positive,
        /** @description Delete the user? */
        remove: boolean = false
    ) {
        console.log('id', id, typeof id);
    }
}
```

ヘルプ表示では、この説明がフラグまたは引数の後に表示されます:

```sh
$ ts-node app.ts test --help
USAGE
  $ ts-node app.ts test ID

ARGUMENTS
  ID  The users identifier

OPTIONS
  --remove  Delete the user?
```
