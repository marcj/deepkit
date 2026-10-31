# 型アノテーション

型アノテーションは、実行時に読み取られ、さまざまな関数の挙動を変更できるメタ情報を含む通常の TypeScript の Type です。Deepkit には、すでに多くのユースケースをカバーする型アノテーションが用意されています。例えば、Class の Property を主キー、参照、インデックスとしてマークできます。データベースライブラリは、事前のコード生成なしに、この情報を実行時に使用して正しい SQL クエリを作成できます。

`MaxLength`、`Maximum`、`Positive` といったバリデータ制約も任意の型に追加可能です。特定の値をどのようにシリアライズ/デシリアライズするかをシリアライザに指定することもできます。さらに、完全にカスタムな型アノテーションを作成し、それらを実行時に読み取ることで、型システムを非常に個別的な方法で実行時に利用することも可能です。

Deepkit には一連の型アノテーションが付属しており、すべて `@deepkit/type` から直接使用できます。これらは複数のライブラリからではなく、Deepkit RPC や Deepkit Database といった特定のライブラリにコードを直接結び付けないように設計されています。これにより、たとえデータベース型アノテーションを使用していても、フロントエンドでの型の再利用が容易になります。

以下は既存の型アノテーションの一覧です。`@deepkit/type` と `@deepkit/bson` のバリデータとシリアライザ、そして `@deepkit/orm` の Deepkit Database は、この情報をそれぞれ異なる方法で使用します。詳細は対応する章を参照してください。

## Integer/Float

整数と浮動小数点は、基底として `number` で定義され、いくつかのサブバリアントがあります:

| 型      | 説明                                                                                                                                                                                                                    |
|---------|-------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------|
| integer | 任意サイズの整数。                                                                                                                                                                                                      |
| int8    | -128 から 127 までの整数。                                                                                                                                                                                              |
| uint8   | 0 から 255 までの整数。                                                                                                                                                                                                 |
| int16   | -32768 から 32767 までの整数。                                                                                                                                                                                          |
| uint16  | 0 から 65535 までの整数。                                                                                                                                                                                               |
| int32   | -2147483648 から 2147483647 までの整数。                                                                                                                                                                                |
| uint32  | 0 から 4294967295 までの整数。                                                                                                                                                                                          |
| float   | number と同じですが、データベースの文脈では異なる意味を持つ場合があります。                                                                                                                                             |
| float32 | -3.40282347e+38 から 3.40282347e+38 の間の float。JavaScript は精度の問題により範囲を正しく検証できないことに注意してください。ただし、この情報はデータベースやバイナリシリアライザには有用です。                              |
| float64 | number と同じですが、データベースの文脈では異なる意味を持つ場合があります。                                                                                                                                             |

```typescript
import { integer } from '@deepkit/type';

interface User {
    id: integer;
}
```

ここで、ユーザーの `id` は実行時には number ですが、バリデーションやシリアライゼーションでは整数として解釈されます。
つまり、例えばバリデーションでは float は使用できず、シリアライザは自動的に float を整数に変換します。

```typescript
import { is, integer } from '@deepkit/type';

is<integer>(12); //true
is<integer>(12.5); //false
```

サブタイプも同様に使用でき、許可する数値範囲を特定したい場合に有用です。

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

このフィールドを MongoDB の ObjectId としてマークします。解決結果は文字列です。MongoDB ではバイナリとして保存されます。

```typescript
import { MongoId, serialize, is } from '@deepkit/type';

serialize<MongoId>('507f1f77bcf86cd799439011'); //507f1f77bcf86cd799439011
is<MongoId>('507f1f77bcf86cd799439011'); //true
is<MongoId>('507f1f77bcf86cd799439011'); //false

class User {
    id: MongoId = ''; //ユーザーが挿入されると Deepkit ORM によって自動的に設定されます
}
```

## Bigint

デフォルトでは通常の bigint 型は JSON では number（BSON では long）としてシリアライズされます。しかし、JavaScript の bigint は潜在的に無制限のサイズを持つのに対し、JavaScript の number や BSON の long は制限があるため、保存できる内容には制約があります。この制限を回避するために `BinaryBigInt` と `SignedBinaryBigInt` が利用可能です。

`BinaryBigInt` は bigint と同じですが、データベースでは無制限サイズの符号なしバイナリ（多くのデータベースの 8 バイトではなく）として、JSON では文字列としてシリアライズされます。負の値は正の値に変換されます（`abs(x)`）。

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

`SignedBinaryBigInt` は `BinaryBigInt` と同様ですが、負の値も保存できます。Deepkit ORM は `SignedBinaryBigInt` をバイナリとして保存します。このバイナリには先頭に符号バイトが追加され、符号なし整数（uint）として表現されます: 負は 255、ゼロは 0、正は 1。

```typescript
import { SignedBinaryBigInt } from '@deepkit/type';

interface User {
    id: SignedBinaryBigInt;
}
```

## MapName

シリアライズ時に Property 名を変更します。

```typescript
import { serialize, deserialize, MapName } from '@deepkit/type';

interface User {
    firstName: string & MapName<'first_name'>;
}

serialize<User>({ firstName: 'Peter' }) // {first_name: 'Peter'}
deserialize<User>({ first_name: 'Peter' }) // {firstName: 'Peter'}
```

## Group

Property をグループ化できます。シリアライズでは、例えば特定のグループを除外できます。詳細はシリアライゼーションの章を参照してください。

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

各 Property は、リフレクション API 経由で読み取れる追加のメタデータを追加できます。詳細は[ランタイム型のリフレクション](reflection.md)を参照してください。

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

各 Property は、特定のターゲットに対するシリアライズ処理から除外できます。

```typescript
import { serialize, deserialize, Excluded } from '@deepkit/type';

interface Auth {
    title: string;
    password: string & Excluded<'json'>
}

const item = deserialize<Auth>({ title: 'Peter', password: 'secret' });

item.password; //undefined。deserialize のデフォルトのシリアライザは `json` であるため

item.password = 'secret';

const json = serialize<Auth>(item);
json.password; //再び undefined。serialize のシリアライザは `json` のため
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

//deserialize では埋め込み構造を提供する必要があります
deserialize<User>({
    id: 12,
    address_street: 'abc',
    //...
});
```

プレフィックス（デフォルトでは Property 名）を変更することも可能です。

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

Interface にエンティティ情報を注釈します。データベースの文脈でのみ使用されます。

```typescript
import { Entity, PrimaryKey } from '@deepkit/type';

interface User extends Entity<{ name: 'user', collection: 'users'> {
    id: number & PrimaryKey;
    username: string;
}
```

## PrimaryKey

フィールドを主キーとしてマークします。データベースの文脈でのみ使用されます。

```typescript
import { PrimaryKey } from '@deepkit/type';

interface User {
    id: number & PrimaryKey;
}
```

## AutoIncrement

フィールドをオートインクリメントとしてマークします。データベースの文脈でのみ使用されます。
通常は `PrimaryKey` と併用します。

```typescript
import { AutoIncrement } from '@deepkit/type';

interface User {
    id: number & PrimaryKey & AutoIncrement;
}
```

## Reference

フィールドを参照（外部キー）としてマークします。データベースの文脈でのみ使用されます。

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

この例では `User.group` は所有側の参照で、SQL における外部キーとしても知られています。つまり、`User` テーブルには `group` カラムがあり、`Group` テーブルを参照しています。`Group` テーブルはこの参照のターゲットテーブルです。

## BackReference

フィールドを逆参照としてマークします。データベースの文脈でのみ使用されます。

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

この例では `Group.users` は逆参照です。これは、`User` テーブルに `group` カラムがあり、それが `Group` テーブルを参照していることを意味します。
`Group` は仮想の Property `users` を持ち、結合を伴うデータベースクエリが実行されると、`Group` の id と同じ `group` id を持つすべてのユーザーで自動的に埋められます。Property `users` はデータベースには保存されません。

## Index

フィールドをインデックスとしてマークします。データベースの文脈でのみ使用されます。

```typescript
import { Index } from '@deepkit/type';

interface User {
    id: number & PrimaryKey;
    username: string & Index;
}
```

## Unique

フィールドをユニークとしてマークします。データベースの文脈でのみ使用されます。

```typescript
import { Unique } from '@deepkit/type';

interface User {
    id: number & PrimaryKey;
    username: string & Unique;
}
```

## DatabaseField

`DatabaseField` を使うと、実際のデータベースのカラム型やデフォルト値など、データベース固有のオプションを定義できます。

```typescript
import { DatabaseField } from '@deepkit/type';

interface User {
    id: number & PrimaryKey;
    username: string & DatabaseField<{ type: 'varchar(255)' }>;
}
```

## Validation

TODO

[バリデーション制約の型](validation.md#validation-constraint-types)を参照してください。

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

TypeScript では型 `Query` は `{ field: any }` ですが、実行時には `{ field: string }` です。

これは、ランタイム型を受け取り、さまざまな場面で再利用するような高いカスタマイズ性を持つシステムを構築する場合に有用です。

## ResetAnnotation

Property のすべてのアノテーションをリセットします。高度なケースでのみ使用されます。

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

慣例として、型アノテーションは単一の省略可能な Property `__meta` を持つオブジェクトリテラルとして定義され、その型はタプルです。このタプルの最初の要素が一意の名前で、以降の要素は任意のオプションです。これにより、型アノテーションに追加のオプションを装備できます。

```typescript
type AnnotationOption<T extends { title: string }> = { __meta?: ['myAnnotation', T] };
```

型アノテーションは交差型演算子 `&` と共に使用します。1 つの型に任意の数の型アノテーションを使用できます。

```typescript
type Username = string & MyAnnotation;
type Title = string & MyAnnotation & AnnotationOption<{ title: 'Hello' }>;
```

型アノテーションは、`typeOf<T>()` と `typeAnnotation` の型オブジェクトを介して読み取れます:

```typescript
import { typeOf, typeAnnotation } from '@deepkit/type';

const type = typeOf<Username>();
const annotation = typeAnnotation.getForName(type, 'myAnnotation'); //[]
```

`annotation` の結果は、型アノテーション `myAnnotation` が使用されていればオプションを持つ配列、使用されていなければ `undefined` です。`AnnotationOption` に見られるように、型アノテーションに追加オプションがある場合、渡された値はその配列の中に見つかります。
すでに提供されている `MapName`、`Group`、`Data` などの型アノテーションには、それぞれ専用のアノテーションオブジェクトがあります:

```typescript
import { typeOf, Group, groupAnnotation } from '@deepkit/type';

type Username = string & Group<'a'> & Group<'b'>;

const type = typeOf<Username>();
groupAnnotation.getAnnotations(type); //['a', 'b']
```

詳しくは[ランタイム型のリフレクション](./reflection.md)を参照してください。