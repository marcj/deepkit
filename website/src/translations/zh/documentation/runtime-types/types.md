# 类型注解

类型注解是普通的 TypeScript 类型，它们包含可在运行时读取的元信息，并可改变各类函数的行为。Deepkit 已经提供了一些类型注解，覆盖了许多使用场景。例如，可以将类属性标记为主键、引用或索引。数据库库可以在运行时使用这些信息来创建正确的 SQL 查询，而无需事先进行代码生成。

验证器约束（如 `MaxLength`、`Maximum` 或 `Positive`）也可以添加到任意类型上。还可以告诉序列化器如何序列化或反序列化特定值。此外，还可以创建完全自定义的类型注解并在运行时读取它们，以便在运行时以非常个性化的方式使用类型系统。

Deepkit 自带一整套类型注解，全部都可以直接从 `@deepkit/type` 使用。它们的设计目标是不来自多个库，从而避免将代码直接绑定到某个特定库，如 Deepkit RPC 或 Deepkit Database。这样即使使用了例如数据库类型注解，也更易于在前端复用类型。

下面是现有类型注解的列表。`@deepkit/type` 和 `@deepkit/bson` 的验证器和序列化器以及 `@deepkit/orm` 的 Deepkit Database 会以不同方式使用这些信息。参见相应章节以了解更多内容。

## 整数/浮点数

整数和浮点数以 `number` 作为基础定义，并有多个子变体：

| 类型    | 描述                                                                                                                                                                                                                  |
|---------|-----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------|
| integer | 任意大小的整数。                                                                                                                                                                                                       |
| int8    | 介于 -128 和 127 之间的整数。                                                                                                                                                                                          |
| uint8   | 介于 0 和 255 之间的整数。                                                                                                                                                                                             |
| int16   | 介于 -32768 和 32767 之间的整数。                                                                                                                                                                                      |
| uint16  | 介于 0 和 65535 之间的整数。                                                                                                                                                                                           |
| int32   | 介于 -2147483648 和 2147483647 之间的整数。                                                                                                                                                                            |
| uint32  | 介于 0 和 4294967295 之间的整数。                                                                                                                                                                                      |
| float   | 与 number 相同，但在数据库上下文中可能具有不同含义。                                                                                                                                                                   |
| float32 | 介于 -3.40282347e+38 和 3.40282347e+38 的浮点数。请注意，由于精度问题，JavaScript 无法正确检查该范围，但这些信息对数据库或二进制序列化器可能很有用。                                                                     |
| float64 | 与 number 相同，但在数据库上下文中可能具有不同含义。                                                                                                                                                                   |

```typescript
import { integer } from '@deepkit/type';

interface User {
    id: integer;
}
```

这里用户的 `id` 在运行时是一个 number，但在验证和序列化中会被解释为整数。
这意味着，例如，在验证中不允许使用浮点数，并且序列化器会自动将浮点数转换为整数。

```typescript
import { is, integer } from '@deepkit/type';

is<integer>(12); //true
is<integer>(12.5); //false
```

子类型可以以相同方式使用，当只允许特定范围的数字时非常有用。

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

UUID v4 通常在数据库中以二进制存储，在 JSON 中以字符串存储。

```typescript
import { is, UUID } from '@deepkit/type';

is<UUID>('f897399a-9f23-49ac-827d-c16f8e4810a0'); //true
is<UUID>('asd'); //false
```

## MongoID

将该字段标记为 MongoDB 的 ObjectId。在类型上解析为字符串。在 MongoDB 中以二进制存储。

```typescript
import { MongoId, serialize, is } from '@deepkit/type';

serialize<MongoId>('507f1f77bcf86cd799439011'); //507f1f77bcf86cd799439011
is<MongoId>('507f1f77bcf86cd799439011'); //true
is<MongoId>('507f1f77bcf86cd799439011'); //false

class User {
    id: MongoId = ''; //在用户插入后将由 Deepkit ORM 自动设置
}
```

## Bigint

默认情况下，普通的 bigint 类型在 JSON 中序列化为 number（在 BSON 中为 long）。然而这在可保存的范围上有局限性，因为 JavaScript 中的 bigint 理论上大小无限，而 JavaScript 的 number 和 BSON 的 long 是有限的。为绕过此限制，提供了 `BinaryBigInt` 和 `SignedBinaryBigInt` 类型。

`BinaryBigInt` 与 bigint 相同，但在数据库中序列化为无符号二进制（大小不受限，而非大多数数据库中的 8 字节），并在 JSON 中序列化为字符串。负值将被转换为正数（`abs(x)`）。

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

Deepkit ORM 将 BinaryBigInt 作为二进制字段存储。

`SignedBinaryBigInt` 与 `BinaryBigInt` 相同，但也能存储负数。Deepkit ORM 将 `SignedBinaryBigInt` 作为二进制存储。该二进制有一个额外的前导符号字节，并以无符号整数表示：255 表示负数，0 表示零，1 表示正数。

```typescript
import { SignedBinaryBigInt } from '@deepkit/type';

interface User {
    id: SignedBinaryBigInt;
}
```

## MapName

用于在序列化时更改属性的名称。

```typescript
import { serialize, deserialize, MapName } from '@deepkit/type';

interface User {
    firstName: string & MapName<'first_name'>;
}

serialize<User>({ firstName: 'Peter' }) // {first_name: 'Peter'}
deserialize<User>({ first_name: 'Peter' }) // {firstName: 'Peter'}
```

## Group

可以将属性分组。在序列化时，例如可以排除某个分组。更多信息参见“序列化”章节。

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

每个属性都可以添加可通过反射 API 读取的额外元数据。更多信息参见[运行时类型反射](reflection.md)。

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

可将某个属性在特定目标的序列化过程中排除。

```typescript
import { serialize, deserialize, Excluded } from '@deepkit/type';

interface Auth {
    title: string;
    password: string & Excluded<'json'>
}

const item = deserialize<Auth>({ title: 'Peter', password: 'secret' });

item.password; //undefined，因为 deserialize 的默认序列化器名为 `json`

item.password = 'secret';

const json = serialize<Auth>(item);
json.password; //依然为 undefined，因为 serialize 的序列化器也叫 `json`
```

## Embedded

将字段标记为嵌入类型。

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

//对于反序列化，你需要提供嵌入后的结构
deserialize<User>({
    id: 12,
    address_street: 'abc',
    //...
});
```

可以更改前缀（默认是属性名）。

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

//或者完全移除前缀
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

为接口添加实体信息。仅用于数据库上下文。

```typescript
import { Entity, PrimaryKey } from '@deepkit/type';

interface User extends Entity<{ name: 'user', collection: 'users'> {
    id: number & PrimaryKey;
    username: string;
}
```

## PrimaryKey

将字段标记为主键。仅用于数据库上下文。

```typescript
import { PrimaryKey } from '@deepkit/type';

interface User {
    id: number & PrimaryKey;
}
```

## AutoIncrement

将字段标记为自增。仅用于数据库上下文。
通常与 `PrimaryKey` 一起使用。

```typescript
import { AutoIncrement } from '@deepkit/type';

interface User {
    id: number & PrimaryKey & AutoIncrement;
}
```

## Reference

将字段标记为引用（外键）。仅用于数据库上下文。

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

在此示例中，`User.group` 是一个拥有方引用，也就是 SQL 中的外键。这意味着 `User` 表有一列 `group` 引用 `Group` 表。`Group` 表是该引用的目标表。

## BackReference

将字段标记为反向引用。仅用于数据库上下文。

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

在此示例中，`Group.users` 是一个反向引用。这意味着 `User` 表有一列 `group` 引用 `Group` 表。
一旦执行带有联接的数据库查询，`Group` 会有一个虚拟属性 `users`，它会自动填充所有 `group` id 与该 `Group` 的 id 相同的用户。属性 `users` 本身不会存储在数据库中。

## Index

将字段标记为索引。仅用于数据库上下文。

```typescript
import { Index } from '@deepkit/type';

interface User {
    id: number & PrimaryKey;
    username: string & Index;
}
```

## Unique

将字段标记为唯一。仅用于数据库上下文。

```typescript
import { Unique } from '@deepkit/type';

interface User {
    id: number & PrimaryKey;
    username: string & Unique;
}
```

## DatabaseField

使用 `DatabaseField` 可以定义数据库特定的选项，如真实的数据库列类型、默认值等。

```typescript
import { DatabaseField } from '@deepkit/type';

interface User {
    id: number & PrimaryKey;
    username: string & DatabaseField<{ type: 'varchar(255)' }>;
}
```

## 验证

待办

参见[验证约束类型](validation.md#validation-constraint-types)。

## InlineRuntimeType

用于内联一个运行时类型。仅用于高级场景。

```typescript
import { InlineRuntimeType, ReflectionKind, Type } from '@deepkit/type';

const type: Type = { kind: ReflectionKind.string };

type Query = {
    field: InlineRuntimeType<typeof type>;
}

const resolved = typeOf<Query>(); // { field: string }
```

在 TypeScript 中，类型 `Query` 是 `{ field: any }`，但在运行时是 `{ field: string }`。

当你构建一个高度可定制的系统、接收运行时类型并在各种其他场景中复用它们时，这会很有用。

## ResetAnnotation

重置某个属性的所有注解。仅用于高级场景。

```typescript
import { ResetAnnotation } from '@deepkit/type';

interface User {
    id: number & PrimaryKey;
}

interface UserCreationPayload {
    id: User['id'] & ResetAnnotation<'primaryKey'>;
}
```

### 自定义类型注解

你可以定义自己的类型注解。

```typescript
type MyAnnotation = { __meta?: ['myAnnotation'] };
```

按照约定，类型注解被定义为仅包含一个可选属性 `__meta` 的对象字面量，该属性的类型是元组。该元组的第一个条目是其唯一名称，后续条目则是任意选项。这样可以为类型注解附加更多可选配置。

```typescript
type AnnotationOption<T extends { title: string }> = { __meta?: ['myAnnotation', T] };
```

类型注解通过交叉类型运算符 `&` 使用。可以在一个类型上使用任意数量的类型注解。

```typescript
type Username = string & MyAnnotation;
type Title = string & MyAnnotation & AnnotationOption<{ title: 'Hello' }>;
```

可以通过 `typeOf<T>()` 和 `typeAnnotation` 的类型对象读取类型注解：

```typescript
import { typeOf, typeAnnotation } from '@deepkit/type';

const type = typeOf<Username>();
const annotation = typeAnnotation.getForName(type, 'myAnnotation'); //[]
```

`annotation` 的结果要么是一个包含选项的数组（如果使用了类型注解 `myAnnotation`），要么是 `undefined`（如果未使用）。如果类型注解具有如 `AnnotationOption` 所示的额外选项，则传入的值可以在数组中找到。
已有的类型注解如 `MapName`、`Group`、`Data` 等有各自的注解对象：

```typescript
import { typeOf, Group, groupAnnotation } from '@deepkit/type';

type Username = string & Group<'a'> & Group<'b'>;

const type = typeOf<Username>();
groupAnnotation.getAnnotations(type); //['a', 'b']
```

参见[运行时类型反射](./reflection.md)以了解更多。