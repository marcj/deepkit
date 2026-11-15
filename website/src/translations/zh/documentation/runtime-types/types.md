# 类型注解

类型注解是普通的 TypeScript 类型，其中包含可在运行时读取的元信息，并可改变各种函数的行为。Deepkit 已经提供了一些覆盖许多用例的类型注解。例如，类的属性可以被标记为主键、引用或索引。数据库库可以在运行时使用这些信息来创建正确的 SQL 查询，而无需预先进行代码生成。

诸如 `MaxLength`、`Maximum` 或 `Positive` 之类的验证器约束也可以添加到任何类型上。还可以告诉序列化器如何序列化或反序列化某个特定的值。此外，还可以创建完全自定义的类型注解并在运行时读取它们，从而以非常个性化的方式在运行时使用类型系统。

Deepkit 自带一整套类型注解，所有这些都可以直接从 `@deepkit/type` 中使用。它们被设计为不来自多个库，以免将代码直接绑定到某个特定的库，例如 Deepkit RPC 或 Deepkit Database。这使得类型更容易复用，甚至可以在前端复用，即使其中使用了例如数据库相关的类型注解。

以下是现有类型注解的列表。`@deepkit/type` 和 `@deepkit/bson` 的验证器和序列化器，以及 `@deepkit/orm` 的 Deepkit Database 会以不同的方式使用这些信息。请参阅相应章节以了解更多信息。

## Integer/Float

整数和浮点数以 `number` 为基础定义，并有多个子变体：

| 类型    | 描述                                                                                                                                                                                                           |
|---------|-----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------|
| integer | 任意大小的整数。                                                                                                                                                                                         |
| int8    | 介于 -128 和 127 之间的整数。                                                                                                                                                                                      |
| uint8   | 介于 0 和 255 之间的整数。                                                                                                                                                                                         |
| int16   | 介于 -32768 和 32767 之间的整数。                                                                                                                                                                                  |
| uint16  | 介于 0 和 65535 之间的整数。                                                                                                                                                                                       |
| int32   | 介于 -2147483648 和 2147483647 之间的整数。                                                                                                                                                                        |
| uint32  | 介于 0 和 4294967295 之间的整数。                                                                                                                                                                                  |
| float   | 与 number 相同，但在数据库上下文中可能具有不同的含义。                                                                                                                                                 |
| float32 | 介于 -3.40282347e+38 和 3.40282347e+38 之间的浮点数。请注意，由于精度问题，JavaScript 无法正确检查该范围，但这些信息对于数据库或二进制序列化器可能很有用。 |
| float64 | 与 number 相同，但在数据库上下文中可能具有不同的含义。                                                                                                                                                 |

```typescript
import { integer } from '@deepkit/type';

interface User {
    id: integer;
}
```

这里用户的 `id` 在运行时是一个 number，但在验证和序列化中被解释为整数。
这意味着，例如在验证中不允许使用浮点数，并且序列化器会自动将浮点数转换为整数。

```typescript
import { is, integer } from '@deepkit/type';

is<integer>(12); //true
is<integer>(12.5); //false
```

子类型可以以相同的方式使用，当需要允许特定范围的数字时非常有用。

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

UUID v4 通常在数据库中以二进制形式存储，在 JSON 中以字符串形式存储。

```typescript
import { is, UUID } from '@deepkit/type';

is<UUID>('f897399a-9f23-49ac-827d-c16f8e4810a0'); //true
is<UUID>('asd'); //false
```

## MongoID

将此字段标记为 MongoDB 的 ObjectId。解析为字符串。在 MongoDB 中以二进制形式存储。

```typescript
import { MongoId, serialize, is } from '@deepkit/type';

serialize<MongoId>('507f1f77bcf86cd799439011'); //507f1f77bcf86cd799439011
is<MongoId>('507f1f77bcf86cd799439011'); //true
is<MongoId>('507f1f77bcf86cd799439011'); //false

class User {
    id: MongoId = ''; //一旦用户被插入，将在 Deepkit ORM 中自动设置
}
```

## Bigint

默认情况下，普通的 bigint 类型在 JSON 中序列化为 number（在 BSON 中序列化为 long）。然而，这在可保存的内容上存在限制，因为 JavaScript 中的 bigint 具有无限的潜在大小，而 JavaScript 中的 number 和 BSON 中的 long 是有限的。为了绕过此限制，可以使用 `BinaryBigInt` 和 `SignedBinaryBigInt` 类型。

`BinaryBigInt` 与 bigint 相同，但在数据库中序列化为无大小限制的无符号二进制（而不是大多数数据库中的 8 字节），在 JSON 中序列化为字符串。负值将被转换为正值（`abs(x)`）。

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

Deepkit ORM 将 BinaryBigInt 存储为二进制字段。

`SignedBinaryBigInt` 与 `BinaryBigInt` 相同，但也能够存储负值。Deepkit ORM 将 `SignedBinaryBigInt` 存储为二进制。该二进制有一个额外的前导符号字节，并表示为 uint：255 表示负数，0 表示零，1 表示正数。

```typescript
import { SignedBinaryBigInt } from '@deepkit/type';

interface User {
    id: SignedBinaryBigInt;
}
```

## MapName

用于在序列化中更改属性的名称。

```typescript
import { serialize, deserialize, MapName } from '@deepkit/type';

interface User {
    firstName: string & MapName<'first_name'>;
}

serialize<User>({ firstName: 'Peter' }) // {first_name: 'Peter'}
deserialize<User>({ first_name: 'Peter' }) // {firstName: 'Peter'}
```

## Group

属性可以被分组在一起。例如，在序列化时可以将某个组排除在序列化之外。有关更多信息，请参阅序列化章节。

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

每个属性都可以添加额外的元数据，这些元数据可以通过 Reflection API 读取。有关更多信息，请参阅[运行时类型反射](reflection.md)。

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

每个属性都可以针对特定目标被排除在序列化过程之外。

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
json.password; //同样是 undefined，因为 serialize 的序列化器名为 `json`
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

//对于 deserialize，你必须提供嵌入结构
deserialize<User>({
    id: 12,
    address_street: 'abc',
    //...
});
```

可以更改前缀（默认情况下为属性名）。

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

//或者完全移除它
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

用于为 interface 添加实体信息注解。仅在数据库上下文中使用。

```typescript
import { Entity, PrimaryKey } from '@deepkit/type';

interface User extends Entity<{ name: 'user', collection: 'users'> {
    id: number & PrimaryKey;
    username: string;
}
```

## PrimaryKey

将字段标记为主键。仅在数据库上下文中使用。

```typescript
import { PrimaryKey } from '@deepkit/type';

interface User {
    id: number & PrimaryKey;
}
```

## AutoIncrement

将字段标记为自增。仅在数据库上下文中使用。
通常与 `PrimaryKey` 一起使用。

```typescript
import { AutoIncrement } from '@deepkit/type';

interface User {
    id: number & PrimaryKey & AutoIncrement;
}
```

## Reference

将字段标记为引用（外键）。仅在数据库上下文中使用。

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

在此示例中，`User.group` 是一个拥有方引用，在 SQL 中也称为外键。这意味着 `User` 表有一个引用 `Group` 表的 `group` 列。`Group` 表是该引用的目标表。

## BackReference

将字段标记为反向引用。仅在数据库上下文中使用。

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

在此示例中，`Group.users` 是一个反向引用。这意味着 `User` 表有一个引用 `Group` 表的 `group` 列。
`Group` 有一个虚拟属性 `users`，一旦执行了带有 join 的数据库查询，该属性就会自动填充所有 `group` id 与该 `Group` id 相同的用户。属性 `users` 不会存储在数据库中。

## Index

将字段标记为索引。仅在数据库上下文中使用。

```typescript
import { Index } from '@deepkit/type';

interface User {
    id: number & PrimaryKey;
    username: string & Index;
}
```

## Unique

将字段标记为唯一。仅在数据库上下文中使用。

```typescript
import { Unique } from '@deepkit/type';

interface User {
    id: number & PrimaryKey;
    username: string & Unique;
}
```

## DatabaseField

使用 `DatabaseField`，你可以定义数据库特定的选项，例如实际的数据库列类型、默认值等。

```typescript
import { DatabaseField } from '@deepkit/type';

interface User {
    id: number & PrimaryKey;
    username: string & DatabaseField<{ type: 'varchar(255)' }>;
}
```

## Validation

验证约束同样是类型注解。它们通过交叉类型添加到类型上，并由 `validate`、`is` 和 `assert` 进行检查，同时也会被 `validatedDeserialize`、HTTP 路由器、RPC 以及 CLI 参数自动检查。

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

assert<User>(data); //数据无效时抛出 ValidationError
```

所有可用的约束类型（`Pattern`、`Alpha`、`Minimum`、`Maximum`、`MultipleOf`、`BeforeNow`、自定义 `Validate` 函数……）都在验证章节中进行了描述。

请参阅[验证约束类型](validation.md#validation-constraint-types)。

## InlineRuntimeType

用于内联一个运行时类型。仅在高级场景中使用。

```typescript
import { InlineRuntimeType, ReflectionKind, Type } from '@deepkit/type';

const type: Type = { kind: ReflectionKind.string };

type Query = {
    field: InlineRuntimeType<typeof type>;
}

const resolved = typeOf<Query>(); // { field: string }
```

在 TypeScript 中，类型 `Query` 是 `{ field: any }`，但在运行时它是 `{ field: string }`。

如果你构建一个高度可定制的系统，接受运行时类型并在其他各种场景中复用它们，这会非常有用。

## ResetAnnotation

用于重置属性的所有注解。仅在高级场景中使用。

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

按照惯例，类型注解被定义为一个对象字面量，它只有一个可选属性 `__meta`，其类型为一个元组。该元组中的第一项是其唯一名称，后续所有元组项都是任意选项。这使得类型注解可以配备额外的选项。

```typescript
type AnnotationOption<T extends { title: string }> = { __meta?: ['myAnnotation', T] };
```

类型注解通过交叉运算符 `&` 使用。一个类型上可以使用任意数量的类型注解。

```typescript
type Username = string & MyAnnotation;
type Title = string & MyAnnotation & AnnotationOption<{ title: 'Hello' }>;
```

可以通过 `typeOf<T>()` 的类型对象和 `typeAnnotation` 读取类型注解：

```typescript
import { typeOf, typeAnnotation } from '@deepkit/type';

const type = typeOf<Username>();
const annotation = typeAnnotation.getForName(type, 'myAnnotation'); //[]
```

如果使用了类型注解 `myAnnotation`，则 `annotation` 中的结果是一个包含选项的数组，否则为 `undefined`。如果类型注解像 `AnnotationOption` 中那样具有额外的选项，则可以在数组中找到传入的值。
已提供的类型注解（如 `MapName`、`Group`、`Data` 等）拥有各自的注解对象：

```typescript
import { typeOf, Group, groupAnnotation } from '@deepkit/type';

type Username = string & Group<'a'> & Group<'b'>;

const type = typeOf<Username>();
groupAnnotation.getAnnotations(type); //['a', 'b']
```

请参阅[运行时类型反射](./reflection.md)以了解更多信息。
