# 型アノテーション

型アノテーションは、メタ情報を含む通常の TypeScript の型であり、実行時に読み取って様々な関数の動作を変更できます。Deepkit は、多くのユースケースをカバーする型アノテーションをすでにいくつか提供しています。たとえば、クラスのプロパティを主キー、参照、またはインデックスとしてマークできます。データベースライブラリは実行時にこの情報を利用して、事前のコード生成なしに正しい SQL クエリを作成できます。

`MaxLength`、`Maximum`、`Positive` などのバリデータ制約も、任意の型に追加できます。また、特定の値をどのようにシリアライズまたはデシリアライズするかをシリアライザに指示することも可能です。さらに、完全に独自の型アノテーションを作成して実行時に読み取ることもでき、実行時に型システムを非常に個別的な方法で利用できます。

Deepkit には一連の型アノテーションが付属しており、すべて `@deepkit/type` から直接使用できます。これらは複数のライブラリから提供されないように設計されており、コードが Deepkit RPC や Deepkit Database のような特定のライブラリに直接結び付かないようになっています。これにより、たとえばデータベース用の型アノテーションが使われていても、フロントエンドを含めて型を容易に再利用できます。

以下は既存の型アノテーションの一覧です。`@deepkit/type` と `@deepkit/bson` のバリデータとシリアライザ、および `@deepkit/orm` の Deepkit Database は、この情報をそれぞれ異なる方法で使用します。詳しくは対応する章を参照してください。

## Integer/Float

整数と浮動小数点数は基本的に `number` として定義され、いくつかのサブバリアントがあります:

| 型      | 説明                                                                                                                                                                                                                  |
|---------|-----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------|
| integer | 任意サイズの整数。                                                                                                                                                                                                    |
| int8    | -128 から 127 までの整数。                                                                                                                                                                                            |
| uint8   | 0 から 255 までの整数。                                                                                                                                                                                               |
| int16   | -32768 から 32767 までの整数。                                                                                                                                                                                        |
| uint16  | 0 から 65535 までの整数。                                                                                                                                                                                             |
| int32   | -2147483648 から 2147483647 までの整数。                                                                                                                                                                              |
| uint32  | 0 から 4294967295 までの整数。                                                                                                                                                                                        |
| float   | number と同じですが、データベースのコンテキストでは異なる意味を持つ場合があります。                                                                                                                                  |
| float32 | -3.40282347e+38 から 3.40282347e+38 までの浮動小数点数。精度の問題により JavaScript では範囲を正しくチェックできませんが、この情報はデータベースやバイナリシリアライザにとって役立つ場合があります。                  |
| float64 | number と同じですが、データベースのコンテキストでは異なる意味を持つ場合があります。                                                                                                                                  |

```typescript
import { integer } from '@deepkit/type';

interface User {
    id: integer;
}
```

ここでユーザーの `id` は実行時には number ですが、バリデーションとシリアライズでは整数として解釈されます。
つまりこの場合、たとえばバリデーションでは浮動小数点数を使用できず、シリアライザは浮動小数点数を自動的に整数に変換します。

```typescript
import { is, integer } from '@deepkit/type';

is<integer>(12); //true
is<integer>(12.5); //false
```

サブタイプも同じ方法で使用でき、特定の範囲の数値を許可したい場合に便利です。

```typescript
import { is, int8 } from '@deepkit/type';

is<int8>(-5); //true
is<int8>(5); //true
is<int8>(-200); //false
is<int8>(2500); //false
```

```typescript
import { is, float, float32, float64 } from '@deepkit/type';
is<float>(12.5); //true
is<float32>(12.5); //true
is<float64>(12.5); //true
````

## UUID

UUID v4 は通常、データベースではバイナリとして、JSON では文字列として保存されます。

```typescript
import { is, UUID } from '@deepkit/type';

is<UUID>('f897399a-9f23-49ac-827d-c16f8e4810a0'); //true
is<UUID>('asd'); //false
```

## MongoID

このフィールドを MongoDB の ObjectId としてマークします。文字列として解決されます。MongoDB ではバイナリとして保存されます。

```typescript
import { MongoId, serialize, is } from '@deepkit/type';

serialize<MongoId>('507f1f77bcf86cd799439011'); //507f1f77bcf86cd799439011
is<MongoId>('507f1f77bcf86cd799439011'); //true
is<MongoId>('507f1f77bcf86cd799439011'); //false

class User {
    id: MongoId = ''; //ユーザーが挿入されると Deepkit ORM で自動的に設定されます
}
```

## Bigint

デフォルトでは、通常の bigint 型は JSON では number として(BSON では long として)シリアライズされます。しかし、JavaScript の bigint は潜在的に無制限のサイズを持つのに対し、JavaScript の number や BSON の long には制限があるため、保存できる値には制約があります。この制約を回避するために、`BinaryBigInt` 型と `SignedBinaryBigInt` 型が用意されています。

`BinaryBigInt` は bigint と同じですが、データベースでは無制限サイズの符号なしバイナリ(ほとんどのデータベースにおける 8 バイトではなく)に、JSON では文字列にシリアライズされます。負の値は正の値に変換されます(`abs(x)`)。

```typescript
import { BinaryBigInt } from '@deepkit/type';

interface User {
    id: BinaryBigInt;
}

const user: User = { id: 24n };

serialize<User>({ id: 24n }); //{id: '24'}

serialize<BinaryBigInt>(24); //'24'
serialize<BinaryBigInt>(-24); //'0'
```

Deepkit ORM は BinaryBigInt をバイナリフィールドとして保存します。

`SignedBinaryBigInt` は `BinaryBigInt` と同じですが、負の値も保存できます。Deepkit ORM は `SignedBinaryBigInt` をバイナリとして保存します。このバイナリには先頭に符号バイトが追加され、uint として表現されます: 負の場合は 255、ゼロの場合は 0、正の場合は 1 です。

```typescript
import { SignedBinaryBigInt } from '@deepkit/type';

interface User {
    id: SignedBinaryBigInt;
}
```

## MapName

シリアライズ時にプロパティの名前を変更します。

```typescript
import { serialize, deserialize, MapName } from '@deepkit/type';

interface User {
    firstName: string & MapName<'first_name'>;
}

serialize<User>({ firstName: 'Peter' }) // {first_name: 'Peter'}
deserialize<User>({ first_name: 'Peter' }) // {firstName: 'Peter'}
```

## Group

プロパティをグループ化できます。シリアライズでは、たとえば特定のグループをシリアライズから除外できます。詳しくはシリアライズの章を参照してください。

```typescript
import { serialize } from '@deepkit/type';

interface Model {
    username: string;
    password: string & Group<'secret'>
}

serialize<Model>(
    { username: 'Peter', password: 'nope' },
    { groupsExclude: ['secret'] }
); //{username: 'Peter'}
```

## Data

各プロパティには、Reflection API を介して読み取れる追加のメタデータを付与できます。詳しくは [ランタイム型リフレクション](reflection.md) を参照してください。

```typescript
import { ReflectionClass } from '@deepkit/type';

interface Model {
    username: string;
    title: string & Data<'key', 'value'>
}

const reflection = ReflectionClass.from<Model>();
reflection.getProperty('title').getData()['key']; //value;
```

## Excluded

各プロパティは、特定のターゲットに対するシリアライズ処理から除外できます。

```typescript
import { serialize, deserialize, Excluded } from '@deepkit/type';

interface Auth {
    title: string;
    password: string & Excluded<'json'>
}

const item = deserialize<Auth>({ title: 'Peter', password: 'secret' });

item.password; //undefined。deserialize のデフォルトのシリアライザは `json` という名前のため

item.password = 'secret';

const json = serialize<Auth>(item);
json.password; //再び undefined。serialize のシリアライザは `json` という名前のため
```

## Embedded

フィールドを埋め込み型としてマークします。

```typescript
import { PrimaryKey, Embedded, serialize, deserialize } from '@deepkit/type';

interface Address {
    street: string;
    postalCode: string;
    city: string;
    country: string;
}

interface User {
    id: number & PrimaryKey;
    address: Embedded<Address>;
}

const user: User
{
    id: 12,
        address
:
    {
        street: 'abc', postalCode
    :
        '1234', city
    :
        'Hamburg', country
    :
        'Germany'
    }
}
;

serialize<User>(user);
{
    id: 12,
        address_street
:
    'abc',
        address_postalCode
:
    '1234',
        address_city
:
    'Hamburg',
        address_country
:
    'Germany'
}

//deserialize では埋め込み構造を指定する必要があります
deserialize<User>({
    id: 12,
    address_street: 'abc',
    //...
});
```

プレフィックス(デフォルトではプロパティ名)を変更できます。

```typescript
interface User {
    id: number & PrimaryKey;
    address: Embedded<Address, { prefix: 'addr_' }>;
}

serialize<User>(user);
{
    id: 12,
        addr_street
:
    'abc',
        addr_postalCode
:
    '1234',
}

//または完全に削除する
interface User {
    id: number & PrimaryKey;
    address: Embedded<Address, { prefix: '' }>;
}

serialize<User>(user);
{
    id: 12,
        street
:
    'abc',
        postalCode
:
    '1234',
}
```

## Entity

interface にエンティティ情報をアノテートします。データベースのコンテキストでのみ使用されます。

```typescript
import { Entity, PrimaryKey } from '@deepkit/type';

interface User extends Entity<{ name: 'user', collection: 'users'> {
    id: number & PrimaryKey;
    username: string;
}
```

## PrimaryKey

フィールドを主キーとしてマークします。データベースのコンテキストでのみ使用されます。

```typescript
import { PrimaryKey } from '@deepkit/type';

interface User {
    id: number & PrimaryKey;
}
```

## AutoIncrement

フィールドを自動インクリメントとしてマークします。データベースのコンテキストでのみ使用されます。
通常は `PrimaryKey` と一緒に使用します。

```typescript
import { AutoIncrement } from '@deepkit/type';

interface User {
    id: number & PrimaryKey & AutoIncrement;
}
```

## Reference

フィールドを参照(外部キー)としてマークします。データベースのコンテキストでのみ使用されます。

```typescript
import { Reference } from '@deepkit/type';

interface User {
    id: number & PrimaryKey;
    group: number & Reference<Group>;
}

interface Group {
    id: number & PrimaryKey;
}
```

この例では、`User.group` は所有側の参照であり、SQL では外部キーとしても知られています。つまり、`User` テーブルには `Group` テーブルを参照する `group` カラムがあります。`Group` テーブルは参照のターゲットテーブルです。

## BackReference

フィールドを逆参照としてマークします。データベースのコンテキストでのみ使用されます。

```typescript

interface User {
    id: number & PrimaryKey;
    group: number & Reference<Group>;
}

interface Group {
    id: number & PrimaryKey;
    users: User[] & BackReference;
}
```

この例では、`Group.users` は逆参照です。つまり、`User` テーブルには `Group` テーブルを参照する `group` カラムがあります。
`Group` には仮想プロパティ `users` があり、join を伴うデータベースクエリが実行されると、`Group` の id と同じ `group` id を持つすべてのユーザーが自動的に設定されます。
プロパティ `users` はデータベースには保存されません。

## Index

フィールドをインデックスとしてマークします。データベースのコンテキストでのみ使用されます。

```typescript
import { Index } from '@deepkit/type';

interface User {
    id: number & PrimaryKey;
    username: string & Index;
}
```

## Unique

フィールドをユニークとしてマークします。データベースのコンテキストでのみ使用されます。

```typescript
import { Unique } from '@deepkit/type';

interface User {
    id: number & PrimaryKey;
    username: string & Unique;
}
```

## DatabaseField

`DatabaseField` を使用すると、実際のデータベースのカラム型やデフォルト値など、データベース固有のオプションを定義できます。

```typescript
import { DatabaseField } from '@deepkit/type';

interface User {
    id: number & PrimaryKey;
    username: string & DatabaseField<{ type: 'varchar(255)' }>;
}
```

## Validation

バリデーション制約も型アノテーションです。これらは intersection を介して型に追加され、`validate`、`is`、`assert` によってチェックされるほか、`validatedDeserialize`、HTTP ルーター、RPC、CLI 引数によって自動的にチェックされます。

```typescript
import { assert, Email, integer, is, MaxLength, MinLength, Positive, validate } from '@deepkit/type';

interface User {
    username: string & MinLength<3> & MaxLength<20>;
    email: string & Email;
    age: integer & Positive;
}

validate<User>({ username: 'Peter', email: 'peter@example.com', age: 32 }); //[]

validate<User>({ username: 'Pe', email: 'invalid', age: -1 });
//[
//  {path: 'username', code: 'minLength', message: 'Min length is 3'},
//  {path: 'email', code: 'pattern', message: 'Pattern ^\S+@\S+$ does not match'},
//  {path: 'age', code: 'positive', message: 'Number needs to be positive'},
//]

is<User>({ username: 'Pe', email: 'peter@example.com', age: 32 }); //false

assert<User>(data); //無効なデータの場合は ValidationError をスローします
```

利用可能なすべての制約型(`Pattern`、`Alpha`、`Minimum`、`Maximum`、`MultipleOf`、`BeforeNow`、カスタムの `Validate` 関数など)は、バリデーションの章で説明されています。

[バリデーション制約型](validation.md#validation-constraint-types) を参照してください。

## InlineRuntimeType

ランタイム型をインライン化します。高度なケースでのみ使用されます。

```typescript
import { InlineRuntimeType, ReflectionKind, Type } from '@deepkit/type';

const type: Type = { kind: ReflectionKind.string };

type Query = {
    field: InlineRuntimeType<typeof type>;
}

const resolved = typeOf<Query>(); // { field: string }
```

TypeScript では型 `Query` は `{ field: any }` ですが、実行時には `{ field: string }` になります。

これは、ランタイム型を受け取り、それをさまざまな他のケースで再利用するような、高度にカスタマイズ可能なシステムを構築する場合に便利です。

## ResetAnnotation

プロパティのすべてのアノテーションをリセットします。高度なケースでのみ使用されます。

```typescript
import { ResetAnnotation } from '@deepkit/type';

interface User {
    id: number & PrimaryKey;
}

interface UserCreationPayload {
    id: User['id'] & ResetAnnotation<'primaryKey'>;
}
```

### カスタム型アノテーション

独自の型アノテーションを定義できます。

```typescript
type MyAnnotation = { __meta?: ['myAnnotation'] };
```

慣例により、型アノテーションは、タプルを型として持つ単一のオプショナルなプロパティ `__meta` を持つオブジェクトリテラルとして定義されます。このタプルの最初の要素は一意の名前で、それ以降のタプル要素はすべて任意のオプションです。これにより、型アノテーションに追加のオプションを持たせることができます。

```typescript
type AnnotationOption<T extends { title: string }> = { __meta?: ['myAnnotation', T] };
```

型アノテーションは intersection 演算子 `&` とともに使用します。1 つの型に任意の数の型アノテーションを使用できます。

```typescript
type Username = string & MyAnnotation;
type Title = string & MyAnnotation & AnnotationOption<{ title: 'Hello' }>;
```

型アノテーションは、`typeOf<T>()` の型オブジェクトと `typeAnnotation` を介して読み取ることができます:

```typescript
import { typeOf, typeAnnotation } from '@deepkit/type';

const type = typeOf<Username>();
const annotation = typeAnnotation.getForName(type, 'myAnnotation'); //[]
```

`annotation` の結果は、型アノテーション `myAnnotation` が使用された場合はオプションを含む配列、使用されていない場合は `undefined` になります。`AnnotationOption` に見られるように型アノテーションに追加のオプションがある場合、渡された値はその配列内にあります。
`MapName`、`Group`、`Data` などの既に提供されている型アノテーションには、それぞれ独自のアノテーションオブジェクトがあります:

```typescript
import { typeOf, Group, groupAnnotation } from '@deepkit/type';

type Username = string & Group<'a'> & Group<'b'>;

const type = typeOf<Username>();
groupAnnotation.getAnnotations(type); //['a', 'b']
```

詳しくは [ランタイム型リフレクション](./reflection.md) を参照してください。
