# バリデーション

バリデーションは、データの正確性と整合性を検証する体系的なプロセスです。これは、データ型が期待される型に一致しているかどうかだけでなく、追加で定義された制約が満たされているかどうかの確認も含みます。

不確実または信頼できないソースからのデータを扱う際には、バリデーションが最重要となります。「不確実」なソースとは、データの型や内容が予測できず、実行時に任意の値を取りうるものを指します。典型例には、ユーザー入力、HTTP リクエスト（クエリパラメータやボディなど）、CLI 引数、プログラムに読み込まれるファイルなどがあります。このようなデータは本質的にリスクがあり、誤った型や値はプログラムの障害やセキュリティ脆弱性の原因になりえます。

例えば、Variable に数値を格納することが期待される場合、実際に数値が入っていることを検証することは極めて重要です。不一致は予期せぬクラッシュやセキュリティ侵害につながります。

たとえば HTTP ルートコントローラを設計する際には、クエリパラメータやリクエストボディなど、あらゆるユーザー入力のバリデーションを最優先にすべきです。特に TypeScript を使用する環境では、型キャストの使用を避けることが重要です。型キャストは誤解を招き、根本的なセキュリティリスクをもたらします。

```typescript
app.post('/user', function(request) {
    const limit = request.body.limit as number;
});
```

コーディングで頻繁に見られる Error は、実行時の安全性を提供しない型キャストに関するものです。例えば、Variable を number に型キャストしても、ユーザーが string を入力した場合、プログラムは string を number として扱ってしまいます。このような見落としはシステムクラッシュや深刻なセキュリティ上の脅威を引き起こす可能性があります。これらのリスクを軽減するため、開発者はバリデータや型ガードを活用できます。さらに、シリアライザを用いて Variable を変換（たとえば 'limit' を number に変換）することも役立ちます。このトピックの詳細はシリアライゼーションの章で確認できます。

バリデーションは単なる選択肢ではなく、堅牢なソフトウェア設計の不可欠な構成要素です。常に用心深くあるべきで、過剰なくらいにバリデーションする方が、後で不十分だったと後悔するよりも良いのです。Deepkit はこの重要性を理解しており、豊富なバリデーションツールを提供します。さらに、高性能な設計により、実行時間への影響は最小限に抑えられています。指針として、たとえ冗長に感じられる場合でも、アプリケーションを保護するために包括的なバリデーションを実施してください。

Deepkit の多くのコンポーネント（HTTP ルーター、RPC 抽象化、データベース抽象化を含む）には、組み込みのバリデーションシステムがあります。これらは自動的にトリガーされ、多くの場合、手動での介入は不要です。


自動バリデーションがいつ、どのように行われるかの包括的な理解については、各章（[CLI](../app.md)、[HTTP](../http.md)、[RPC](../rpc.md)、[ORM](../orm.md)）を参照してください。
必要な制約やデータ型に慣れておきましょう。適切に定義された Parameter により、Deepkit の自動バリデーション機能を引き出し、手作業を減らし、よりクリーンで安全なコードを実現できます。

## 使い方

バリデータの基本的な Function は、値の型をチェックすることです。例えば、値が string かどうかなど。ここで扱うのは文字列の内容ではなく、その型のみです。TypeScript には多くの型があり、string、number、boolean、bigint、objects、classes、interface、generics、mapped types など多岐にわたります。TypeScript の強力な型システムにより、非常に多様な型が利用可能です。

JavaScript 自体では、プリミティブ型は `typeof` 演算子で判定できます。interface、mapped types、または汎用的な set/map のような複雑な型では、もはや容易ではないため、`@deepkit/type` のようなバリデータライブラリが必要になります。Deepkit は、TypeScript のあらゆる型を回避策なしで直接バリデーションできる唯一のソリューションです。



Deepkit では、型のバリデーションは `validate`、`is`、`assert` のいずれかの Function を使用して行えます。
`is` はいわゆる型ガードであり、`assert` は型アサーションです。両者については次のセクションで説明します。
`validate` は見つかったエラーの配列を返し、成功時は空配列を返します。この配列の各エントリは、正確なエラーコードとエラーメッセージ、さらに objects や arrays のような複雑な型がバリデーションされた場合のパスを説明します。

これら 3 つの Function はほぼ同じ方法で使用します。型は最初の型引数で指定または参照し、データは最初の引数として渡します。

```typescript
import { validate, is, assert } from '@deepkit/type';

const errors = validate<string>('abc'); //[]
const errors = validate<string>(123); //[{code: 'type', message: 'string ではありません'}]

if (is<string>(value)) {
    // value は string であることが保証されます
}

function doSomething(value: any) {
    assert<string>(value); //無効なデータの場合は例外をスローします

    // value は string であることが保証されます
}
```

classes や interface のような、より複雑な型を扱う場合、配列には複数のエントリが含まれることがあります。

```typescript
import { validate } from '@deepkit/type';

interface User {
    id: number;
    username: string;
}

validate<User>({id: 1, username: 'Joe'}); //[]

validate<User>(undefined); //[{code: 'type', message: 'オブジェクトではありません'}]

validate<User>({});
//[
//  {path: 'id', code: 'type', message: 'number ではありません'}],
//  {path: 'username', code: 'type', message: 'string ではありません'}],
//]
```

バリデータは深い再帰的な型もサポートします。パスはドットで区切られます。

```typescript
import { validate } from '@deepkit/type';

interface User {
    id: number;
    username: string;
    supervisor?: User;
}

validate<User>({id: 1, username: 'Joe'}); //[]

validate<User>({id: 1, username: 'Joe', supervisor: {}});
//[
//  {path: 'supervisor.id', code: 'type', message: 'number ではありません'}],
//  {path: 'supervisor.username', code: 'type', message: 'string ではありません'}],
//]
```

TypeScript の利点を活用しましょう。例えば、`User` のような複雑な型は、何度も宣言し直すことなく複数箇所で再利用できます。`User` を `id` なしでバリデートしたい場合、TypeScript のユーティリティ型を使って素早く効率的に派生サブタイプを作成できます。まさに DRY (Don't Repeat Yourself) の精神です。

```typescript
type UserWithoutId = Omit<User, 'id'>;

validate<UserWithoutId>({username: 'Joe'}); //有効です！
```

Deepkit は、実行時にこのような形で TypeScript の型へアクセスできる唯一の主要フレームワークです。フロントエンドとバックエンドの両方で型を使いたい場合は、型を別ファイルに切り出してどこからでも import できます。これを活用して、コードを効率的かつクリーンに保ちましょう。

## 型キャストは安全ではない

TypeScript における型キャスト（型ガードとは対照的）は実行時の構造ではなく、型システム内でのみ扱われます。未知のデータに型を割り当てる安全な方法ではありません。

```typescript
const data: any = ...;

const username = data.username as string;

if (username.startsWith('@')) { //クラッシュする可能性があります
}
```

`as string` のコードは安全ではありません。Variable `data` は文字通りあらゆる値（例えば `{username: 123}` や `{}`）を取りうるため、その結果 `username` が string ではなく全く別のものであり、したがって `username.startsWith('@')` のコードはエラーになり、軽微なケースではプログラムがクラッシュし、最悪の場合はセキュリティ脆弱性が生まれます。
ここで実行時に `data` が string 型の `username` Property を持つことを保証するには、型ガードを使用する必要があります。

型ガードは、渡されたデータが実行時に保証される型について TypeScript にヒントを与える Function です。この知識を元に、TypeScript はコードの進行に応じて型を「絞り込み」ます。例えば、`any` を安全に string にしたり、他の型にしたりできます。したがって、型が不明（`any` や `unknown`）なデータがある場合、型ガードはデータ自体に基づいてより正確に絞り込むのに役立ちます。ただし、型ガードの安全性はその実装に依存します。もし誤りがあれば、根本的な前提が突然真実でないことが明らかになり、重大な結果を招く可能性があります。

<a name="type-guard"></a>

## 型ガード

上で使用した `User` 型に対する型ガードは、最も単純な形では次のようになります。なお、前述した NaN の特殊性は考慮されていないため、この型ガードは完全には正しくありません。

```typescript
function isUser(data: any): data is User {
    return 'object' === typeof data
           && 'number' === typeof data.id
           && 'string' === typeof data.username;
}

isUser({}); //false

isUser({id: 1, username: 'Joe'}); //true
```

型ガードは常に boolean を返し、通常は if 文で直接使用されます。

```typescript
const data: any = await fetch('/user/1');

if (isUser(data)) {
    data.id; //安全にアクセスでき、number です
}
```

特に複雑な型に対して、各型ガードごとに個別の Function を書き、型が変わるたびにそれを調整するのは非常に面倒で、エラーを誘発し、非効率です。そこで Deepkit は、任意の TypeScript 型に対する型ガードを自動的に提供する `is` Function を用意しています。これは NaN の問題のような特殊性も自動的に考慮します。`is` は `validate` と同じことを行いますが、エラー配列の代わりに boolean を返します。

```typescript
import { is } from '@deepkit/type';

is<string>('abc'); //true
is<string>(123); //false


const data: any = await fetch('/user/1');

if (is<User>(data)) {
    //data は今や User 型であることが保証されています
}
```

よく見られるパターンとして、バリデーション失敗時に即座に Error を返して後続のコードを実行しないようにする方法があります。これはコード全体のフローを変更せずに、さまざまな場所で使用できます。

```typescript
function addUser(data: any): void {
    if (!is<User>(data)) throw new TypeError('No user given');

    //data は今や User 型であることが保証されています
}
```

あるいは、TypeScript の型アサーションを使用する方法もあります。`assert` Function は、与えられたデータが型に正しくバリデートされない場合、自動的に Error をスローします。TypeScript の型アサーションを特徴づける特別なシグネチャにより、TypeScript は渡された Variable を自動的に絞り込みます。

```typescript
import { assert } from '@deepkit/type';

function addUser(data: any): void {
    assert<User>(data); //無効なデータなら例外をスローします

    //data は今や User 型であることが保証されています
}
```

ここでも、TypeScript が提供する利点を活用してください。型はさまざまな TypeScript の機能を使って再利用やカスタマイズが可能です。

<a name="error-reporting"></a>

## エラー報告

`is`、`assert`、`validates` は結果として boolean を返します。失敗したバリデーションルールに関する正確な情報を得るには、`validate` Function を使用します。すべてが正常にバリデートされると空配列を返します。エラーがある場合、配列には次の構造を持つ 1 件以上のエントリが含まれます。

```typescript
interface ValidationErrorItem {
    /**
     * Property へのパス。ドットで区切られた深いパスの場合があります。
     */
    path: string;
    /**
     * このエラーを識別・翻訳するために使用できる小文字のエラーコード。
     */
    code: string,
    /**
     * エラーの自由テキスト。
     */
    message: string,
}
```

この Function は、最初の型引数に任意の TypeScript 型を、最初の引数にバリデート対象のデータを受け取ります。

```typescript
import { validate } from '@deepkit/type';

validate<string>('Hello'); //[]
validate<string>(123); //[{code: 'type', message: 'string ではありません', path: ''}]

validate<number>(123); //[]
validate<number>('Hello'); //[{code: 'type', message: 'number ではありません', path: ''}]
```

interface、classes、generics などの複雑な型も使用できます。

```typescript
import { validate } from '@deepkit/type';

interface User {
    id: number;
    username: string;
}

validate<User>(undefined); //[{code: 'type', message: 'オブジェクトではありません', path: ''}]
validate<User>({}); //[{code: 'type', message: 'number ではありません', path: 'id'}]
validate<User>({id: 1}); //[{code: 'type', message: 'string ではありません', path: 'username'}]
validate<User>({id: 1, username: 'Peter'}); //[]
```

<a name="constraints"></a>

## 制約

型のチェックに加えて、任意の制約を型に追加できます。これらの追加の内容制約のバリデーションは、型自体のバリデーション後に自動的に行われます。これは `validate`、`is`、`assert` といったすべてのバリデーション Function で行われます。
例えば、string が特定の最小長または最大長を持つべきだという制約があります。これらの制約は[型アノテーション](./types.md)を通じて実際の型に追加されます。使用できるアノテーションは多種多様にあります。拡張が必要な場合は独自のアノテーションを自由に定義して使用できます。

```typescript
import { MinLength } from '@deepkit/type';

type Username = string & MinLength<3>;
```

`&` を使って、任意の数の型アノテーションを実際の型に追加できます。ここでの結果（`username`）は、すべてのバリデーション Function や他の型でも使用できます。

```typescript
import { is } from '@deepkit/type';

is<Username>('ab'); //false, 最小長が 3 のため
is<Username>('Joe'); //true

interface User {
  id: number;
  username: Username;
}

is<User>({id: 1, username: 'ab'}); //false, 最小長が 3 のため
is<User>({id: 1, username: 'Joe'}); //true
```

`validate` は制約に起因する有用なエラーメッセージを返します。

```typescript
import { validate } from '@deepkit/type';

const errors = validate<Username>('xb');
//[{ code: 'minLength', message: `最小長は 3 です` }]
```

この情報は、フォームなどに自動的に表示するのに最適で、`code` を用いて翻訳することもできます。objects や arrays に対する既存のパスにより、フォーム内のフィールドは該当するエラーを抽出して表示できます。

```typescript
validate<User>({id: 1, username: 'ab'});
//{ path: 'username', code: 'minLength', message: `最小長は 3 です` }
```

よくある有用なユースケースとして、RegExp 制約で email を定義することがあります。一度型を定義すれば、どこでも使用できます。

```typescript
export const emailRegexp = /^\S+@\S+$/;
type Email = string & Pattern<typeof emailRegexp>

is<Email>('abc'); //false
is<Email>('joe@example.com'); //true
```

制約はいくつでも追加できます。

```typescript
type ID = number & Positive & Maximum<1000>;

is<ID>(-1); //false
is<ID>(123); //true
is<ID>(1001); //true
```

### 制約の種類

#### Validate<typeof myValidator>

カスタムバリデータ Function を使ったバリデーション。詳細は次節「カスタムバリデータ」を参照してください。

```typescript
import { ValidatorError, Validate } from '@deepkit/type';

function startsWith(v: string) {
    return (value: any) => {
        const valid = 'string' === typeof value && value.startsWith(v);
        return valid ? undefined : new ValidatorError('startsWith', `「${v}」で始まりません`);
    };
}

type T = string & Validate<typeof startsWith, 'abc'>;
```

#### Pattern<typeof myRegexp>

正規表現をバリデーションパターンとして定義します。通常、E-Mail の検証やより複雑な内容の検証に使用します。

```typescript
import { Pattern } from '@deepkit/type';

const myRegExp = /[a-zA-Z]+/;
type T = string & Pattern<typeof myRegExp>
```

#### Alpha

英字（a-Z）のバリデーション。

```typescript
import { Alpha } from '@deepkit/type';

type T = string & Alpha;
```


#### Alphanumeric

英数字のバリデーション。

```typescript
import { Alphanumeric } from '@deepkit/type';

type T = string & Alphanumeric;
```


#### Ascii

ASCII 文字のバリデーション。

```typescript
import { Ascii } from '@deepkit/type';

type T = string & Ascii;
```


#### Decimal<number, number>

0.1、.3、1.1、1.00003、4.0 など、10 進数を表す文字列のバリデーション。

```typescript
import { Decimal } from '@deepkit/type';

type T = string & Decimal<1, 2>;
```


#### MultipleOf<number>

指定した数値の倍数である number のバリデーション。

```typescript
import { MultipleOf } from '@deepkit/type';

type T = number & MultipleOf<3>;
```


#### MinLength<number>, MaxLength<number>, MinMax<number, number>

arrays または strings の最小/最大長のバリデーション。

```typescript
import { MinLength, MaxLength, MinMax } from '@deepkit/type';

type T = any[] & MinLength<1>;

type T = string & MinLength<3> & MaxLength<16>;

type T = string & MinMax<3, 16>;
```

#### Includes<'any'> Excludes<'any'>

配列要素または部分文字列が含まれている／含まれていないことのバリデーション

```typescript
import { Includes, Excludes } from '@deepkit/type';

type T = any[] & Includes<'abc'>;
type T = string & Excludes<' '>;
```

#### Minimum<number>, Maximum<number>

与えられた数値以上／以下であることのバリデーション。`>=` および `<=` と同じです。

```typescript
import { Minimum, Maximum, MinMax } from '@deepkit/type';

type T = number & Minimum<10>;
type T = number & Minimum<10> & Maximum<1000>;

type T = number & MinMax<10, 1000>;
```

#### ExclusiveMinimum<number>, ExclusiveMaximum<number>

minimum/maximum と同じですが、値そのものを除外します。`>` および `<` と同じです。

```typescript
import { ExclusiveMinimum, ExclusiveMaximum } from '@deepkit/type';

type T = number & ExclusiveMinimum<10>;
type T = number & ExclusiveMinimum<10> & ExclusiveMaximum<1000>;
```


#### Positive, Negative, PositiveNoZero, NegativeNoZero

正または負であることのバリデーション。

```typescript
import { Positive, Negative } from '@deepkit/type';

type T = number & Positive;
type T = number & Negative;
```


#### BeforeNow, AfterNow

現在（new Date）と比較した日付値のバリデーション。

```typescript
import { BeforeNow, AfterNow } from '@deepkit/type';

type T = Date & BeforeNow;
type T = Date & AfterNow;
```

#### Email

`/^\S+@\S+$/` による簡易な email の正規表現バリデーション。自動的に `string` なので、`string & Email` とする必要はありません。

```typescript
import { Email } from '@deepkit/type';

type T = Email;
```

#### integer

指定された範囲の整数であることを保証します。自動的に `number` なので、`number & integer` とする必要はありません。

```typescript
import { integer, uint8, uint16, uint32, 
    int8, int16, int32 } from '@deepkit/type';

type T = integer;
type T = uint8;
type T = uint16;
type T = uint32;
type T = int8;
type T = int16;
type T = int32;
```

詳細は「Special types: integer/floats」を参照してください。

### カスタムバリデータ

組み込みのバリデータで不足する場合は、`Validate` デコレータを介してカスタムバリデーション Function を作成して使用できます。

```typescript
import { ValidatorError, Validate, Type, validates, validate }
  from '@deepkit/type';

function titleValidation(value: string, type: Type) {
    value = value.trim();
    if (value.length < 5) {
        return new ValidatorError('tooShort', '値が短すぎます');
    }
}

interface Article {
    id: number;
    title: string & Validate<typeof titleValidation>;
}

console.log(validates<Article>({id: 1})); //false
console.log(validates<Article>({id: 1, title: 'Peter'})); //true
console.log(validates<Article>({id: 1, title: ' Pe     '})); //false
console.log(validate<Article>({id: 1, title: ' Pe     '})); //[ValidationErrorItem]
```

カスタムバリデーション Function は、すべての組み込み型バリデータが呼び出された後に実行されることに注意してください。あるバリデータが失敗した場合、現在の型に対する後続のバリデータはすべてスキップされます。各型につき失敗は 1 回のみです。

#### ジェネリックバリデータ

Validator Function では type オブジェクトが利用可能で、これを使ってバリデータが適用されている型に関するより詳しい情報を取得できます。また、`validate` 型に渡す任意のバリデータオプションを定義し、バリデータを設定可能にすることもできます。これらの情報と親参照により、強力なジェネリックバリデータを作成できます。

```typescript
import { ValidatorError, Validate, Type, is, validate }
  from '@deepkit/type';

function startsWith(value: any, type: Type, chars: string) {
    const valid = 'string' === typeof value && value.startsWith(chars);
    if (!valid) {
        return new ValidatorError('startsWith', '「' + chars + '」で始まりません')
    }
}

type MyType = string & Validate<typeof startsWith, 'a'>;

is<MyType>('aah'); //true
is<MyType>('nope'); //false

const errors = validate<MyType>('nope');
//[{ path: '', code: 'startsWith', message: `「a」で始まりません` }]);
```