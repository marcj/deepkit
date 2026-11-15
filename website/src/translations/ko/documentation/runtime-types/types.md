# 타입 어노테이션

타입 어노테이션은 런타임에 읽을 수 있고 다양한 함수의 동작을 변경할 수 있는 메타 정보를 담고 있는 일반적인 TypeScript 타입입니다. Deepkit은 이미 많은 사용 사례를 다루는 몇 가지 타입 어노테이션을 제공합니다. 예를 들어, 클래스 property를 primary key, reference 또는 index로 표시할 수 있습니다. 데이터베이스 라이브러리는 런타임에 이 정보를 사용하여 사전 코드 생성 없이 올바른 SQL 쿼리를 생성할 수 있습니다.

`MaxLength`, `Maximum`, `Positive`와 같은 validator 제약 조건도 모든 타입에 추가할 수 있습니다. 또한 serializer에게 특정 값을 어떻게 직렬화하거나 역직렬화할지 알려줄 수도 있습니다. 게다가 완전히 커스텀한 타입 어노테이션을 만들고 런타임에 읽어서, 런타임에 타입 시스템을 매우 개별적인 방식으로 사용할 수도 있습니다.

Deepkit은 다양한 타입 어노테이션을 제공하며, 모두 `@deepkit/type`에서 직접 사용할 수 있습니다. 이들은 여러 라이브러리에서 가져오지 않도록 설계되어, Deepkit RPC나 Deepkit Database와 같은 특정 라이브러리에 코드가 직접 묶이지 않도록 합니다. 이를 통해 예를 들어 데이터베이스 타입 어노테이션이 사용되더라도 프론트엔드에서도 타입을 더 쉽게 재사용할 수 있습니다.

다음은 기존 타입 어노테이션 목록입니다. `@deepkit/type`과 `@deepkit/bson`의 validator 및 serializer, 그리고 `@deepkit/orm`의 Deepkit Database는 이 정보를 각기 다르게 사용합니다. 자세한 내용은 해당 챕터를 참조하세요.

## Integer/Float

Integer와 float는 기본적으로 `number`로 정의되며 여러 하위 변형이 있습니다:

| Type    | 설명                                                                                                                                                                                                           |
|---------|-----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------|
| integer | 임의 크기의 정수입니다.                                                                                                                                                                                         |
| int8    | -128에서 127 사이의 정수입니다.                                                                                                                                                                                      |
| uint8   | 0에서 255 사이의 정수입니다.                                                                                                                                                                                         |
| int16   | -32768에서 32767 사이의 정수입니다.                                                                                                                                                                                  |
| uint16  | 0에서 65535 사이의 정수입니다.                                                                                                                                                                                       |
| int32   | -2147483648에서 2147483647 사이의 정수입니다.                                                                                                                                                                        |
| uint32  | 0에서 4294967295 사이의 정수입니다.                                                                                                                                                                                  |
| float   | number와 동일하지만, 데이터베이스 컨텍스트에서는 다른 의미를 가질 수 있습니다.                                                                                                                                                 |
| float32 | -3.40282347e+38에서 3.40282347e+38 사이의 float입니다. JavaScript는 정밀도 문제로 인해 범위를 올바르게 검사할 수 없지만, 이 정보는 데이터베이스나 바이너리 serializer에 유용할 수 있습니다. |
| float64 | number와 동일하지만, 데이터베이스 컨텍스트에서는 다른 의미를 가질 수 있습니다.                                                                                                                                                 |

```typescript
import { integer } from '@deepkit/type';

interface User {
    id: integer;
}
```

여기서 사용자의 `id`는 런타임에는 number이지만, 유효성 검사와 직렬화에서는 integer로 해석됩니다.
즉, 예를 들어 유효성 검사에서는 float를 사용할 수 없으며, serializer는 float를 자동으로 integer로 변환합니다.

```typescript
import { is, integer } from '@deepkit/type';

is<integer>(12); //true
is<integer>(12.5); //false
```

하위 타입도 같은 방식으로 사용할 수 있으며, 특정 범위의 숫자만 허용하려는 경우에 유용합니다.

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

UUID v4는 일반적으로 데이터베이스에서는 바이너리로, JSON에서는 문자열로 저장됩니다.

```typescript
import { is, UUID } from '@deepkit/type';

is<UUID>('f897399a-9f23-49ac-827d-c16f8e4810a0'); //true
is<UUID>('asd'); //false
```

## MongoID

이 필드를 MongoDB의 ObjectId로 표시합니다. 문자열로 해석됩니다. MongoDB에는 바이너리로 저장됩니다.

```typescript
import { MongoId, serialize, is } from '@deepkit/type';

serialize<MongoId>('507f1f77bcf86cd799439011'); //507f1f77bcf86cd799439011
is<MongoId>('507f1f77bcf86cd799439011'); //true
is<MongoId>('507f1f77bcf86cd799439011'); //false

class User {
    id: MongoId = ''; //사용자가 삽입되면 Deepkit ORM에서 자동으로 설정됩니다
}
```

## Bigint

기본적으로 일반 bigint 타입은 JSON에서는 number로(BSON에서는 long으로) 직렬화됩니다. 하지만 JavaScript의 bigint는 잠재적으로 무제한 크기를 가지는 반면, JavaScript의 number와 BSON의 long은 크기가 제한되어 있으므로 저장할 수 있는 값에 제한이 있습니다. 이 제한을 우회하기 위해 `BinaryBigInt`와 `SignedBinaryBigInt` 타입을 사용할 수 있습니다.

`BinaryBigInt`는 bigint와 동일하지만, 데이터베이스에서는 (대부분의 데이터베이스에서 사용하는 8바이트 대신) 크기 제한이 없는 unsigned 바이너리로, JSON에서는 문자열로 직렬화됩니다. 음수 값은 양수로 변환됩니다(`abs(x)`).

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

Deepkit ORM은 BinaryBigInt를 바이너리 필드로 저장합니다.

`SignedBinaryBigInt`는 `BinaryBigInt`와 동일하지만 음수 값도 저장할 수 있습니다. Deepkit ORM은 `SignedBinaryBigInt`를 바이너리로 저장합니다. 이 바이너리에는 앞부분에 추가 부호 바이트가 있으며, uint로 표현됩니다: 음수는 255, 0은 0, 양수는 1입니다.

```typescript
import { SignedBinaryBigInt } from '@deepkit/type';

interface User {
    id: SignedBinaryBigInt;
}
```

## MapName

직렬화 시 property의 이름을 변경합니다.

```typescript
import { serialize, deserialize, MapName } from '@deepkit/type';

interface User {
    firstName: string & MapName<'first_name'>;
}

serialize<User>({ firstName: 'Peter' }) // {first_name: 'Peter'}
deserialize<User>({ first_name: 'Peter' }) // {firstName: 'Peter'}
```

## Group

Property들을 그룹으로 묶을 수 있습니다. 예를 들어 직렬화 시 특정 그룹을 직렬화에서 제외할 수 있습니다. 자세한 내용은 직렬화 챕터를 참조하세요.

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

각 property는 Reflection API를 통해 읽을 수 있는 추가 메타데이터를 추가할 수 있습니다. 자세한 내용은 [런타임 타입 Reflection](reflection.md)을 참조하세요.

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

각 property는 특정 대상에 대한 직렬화 과정에서 제외될 수 있습니다.

```typescript
import { serialize, deserialize, Excluded } from '@deepkit/type';

interface Auth {
    title: string;
    password: string & Excluded<'json'>
}

const item = deserialize<Auth>({ title: 'Peter', password: 'secret' });

item.password; //undefined, deserialize의 기본 serializer 이름이 `json`이기 때문입니다

item.password = 'secret';

const json = serialize<Auth>(item);
json.password; //역시 undefined, serialize의 serializer 이름이 `json`이기 때문입니다
```

## Embedded

필드를 embedded 타입으로 표시합니다.

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

//deserialize의 경우 embedded 구조를 제공해야 합니다
deserialize<User>({
    id: 12,
    address_street: 'abc',
    //...
});
```

prefix(기본값은 property 이름)를 변경할 수 있습니다.

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

//또는 완전히 제거
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

interface에 entity 정보를 어노테이션합니다. 데이터베이스 컨텍스트에서만 사용됩니다.

```typescript
import { Entity, PrimaryKey } from '@deepkit/type';

interface User extends Entity<{ name: 'user', collection: 'users'> {
    id: number & PrimaryKey;
    username: string;
}
```

## PrimaryKey

필드를 primary key로 표시합니다. 데이터베이스 컨텍스트에서만 사용됩니다.

```typescript
import { PrimaryKey } from '@deepkit/type';

interface User {
    id: number & PrimaryKey;
}
```

## AutoIncrement

필드를 auto increment로 표시합니다. 데이터베이스 컨텍스트에서만 사용됩니다.
보통 `PrimaryKey`와 함께 사용됩니다.

```typescript
import { AutoIncrement } from '@deepkit/type';

interface User {
    id: number & PrimaryKey & AutoIncrement;
}
```

## Reference

필드를 reference(foreign key)로 표시합니다. 데이터베이스 컨텍스트에서만 사용됩니다.

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

이 예제에서 `User.group`은 SQL에서 foreign key로도 알려진 owning reference입니다. 즉, `User` 테이블에는 `Group` 테이블을 참조하는 `group` 컬럼이 있습니다. `Group` 테이블은 reference의 대상 테이블입니다.

## BackReference

필드를 back reference로 표시합니다. 데이터베이스 컨텍스트에서만 사용됩니다.

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

이 예제에서 `Group.users`는 back reference입니다. 즉, `User` 테이블에는 `Group` 테이블을 참조하는 `group` 컬럼이 있습니다.
`Group`에는 가상 property `users`가 있으며, join이 포함된 데이터베이스 쿼리가 실행되면 `Group` id와 동일한 `group` id를 가진 모든 사용자로
자동으로 채워집니다. `users` property는 데이터베이스에 저장되지 않습니다.

## Index

필드를 index로 표시합니다. 데이터베이스 컨텍스트에서만 사용됩니다.

```typescript
import { Index } from '@deepkit/type';

interface User {
    id: number & PrimaryKey;
    username: string & Index;
}
```

## Unique

필드를 unique로 표시합니다. 데이터베이스 컨텍스트에서만 사용됩니다.

```typescript
import { Unique } from '@deepkit/type';

interface User {
    id: number & PrimaryKey;
    username: string & Unique;
}
```

## DatabaseField

`DatabaseField`를 사용하면 실제 데이터베이스 컬럼 타입, 기본값 등 데이터베이스별 옵션을 정의할 수 있습니다.

```typescript
import { DatabaseField } from '@deepkit/type';

interface User {
    id: number & PrimaryKey;
    username: string & DatabaseField<{ type: 'varchar(255)' }>;
}
```

## Validation

유효성 검사 제약 조건도 타입 어노테이션입니다. 이들은 intersection을 통해 타입에 추가되며, `validate`, `is`, `assert`에 의해 검사되고, `validatedDeserialize`, HTTP 라우터, RPC, CLI 인자에서는 자동으로 검사됩니다.

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

assert<User>(data); //유효하지 않은 데이터에 대해 ValidationError를 throw합니다
```

사용 가능한 모든 제약 조건 타입(`Pattern`, `Alpha`, `Minimum`, `Maximum`, `MultipleOf`, `BeforeNow`, 커스텀 `Validate` 함수 등)은 유효성 검사 챕터에 설명되어 있습니다.

[유효성 검사 제약 조건 타입](validation.md#validation-constraint-types)을 참조하세요.

## InlineRuntimeType

런타임 타입을 인라인합니다. 고급 사례에서만 사용됩니다.

```typescript
import { InlineRuntimeType, ReflectionKind, Type } from '@deepkit/type';

const type: Type = { kind: ReflectionKind.string };

type Query = {
    field: InlineRuntimeType<typeof type>;
}

const resolved = typeOf<Query>(); // { field: string }
```

TypeScript에서 `Query` 타입은 `{ field: any }`이지만, 런타임에서는 `{ field: string }`입니다.

이는 런타임 타입을 받아 다양한 다른 경우에 재사용하는, 고도로 커스터마이징 가능한 시스템을 구축할 때 유용합니다.

## ResetAnnotation

property의 모든 어노테이션을 리셋합니다. 고급 사례에서만 사용됩니다.

```typescript
import { ResetAnnotation } from '@deepkit/type';

interface User {
    id: number & PrimaryKey;
}

interface UserCreationPayload {
    id: User['id'] & ResetAnnotation<'primaryKey'>;
}
```

### 커스텀 타입 어노테이션

자신만의 타입 어노테이션을 정의할 수 있습니다.

```typescript
type MyAnnotation = { __meta?: ['myAnnotation'] };
```

관례상, 타입 어노테이션은 tuple을 타입으로 가지는 단일 optional property `__meta`를 가진 객체 리터럴로 정의됩니다. 이 tuple의 첫 번째 항목은 고유한 이름이며, 이후의 모든 tuple 항목은 임의의 옵션입니다. 이를 통해 타입 어노테이션에 추가 옵션을 부여할 수 있습니다.

```typescript
type AnnotationOption<T extends { title: string }> = { __meta?: ['myAnnotation', T] };
```

타입 어노테이션은 intersection 연산자 `&`와 함께 사용됩니다. 하나의 타입에 원하는 수만큼 타입 어노테이션을 사용할 수 있습니다.

```typescript
type Username = string & MyAnnotation;
type Title = string & MyAnnotation & AnnotationOption<{ title: 'Hello' }>;
```

타입 어노테이션은 `typeOf<T>()`의 타입 객체와 `typeAnnotation`을 통해 읽어낼 수 있습니다:

```typescript
import { typeOf, typeAnnotation } from '@deepkit/type';

const type = typeOf<Username>();
const annotation = typeAnnotation.getForName(type, 'myAnnotation'); //[]
```

`annotation`의 결과는 타입 어노테이션 `myAnnotation`이 사용된 경우 옵션이 담긴 배열이고, 사용되지 않은 경우 `undefined`입니다. `AnnotationOption`에서 볼 수 있듯이 타입 어노테이션에 추가 옵션이 있는 경우, 전달된 값은 배열에서 찾을 수 있습니다.
`MapName`, `Group`, `Data` 등 이미 제공되는 타입 어노테이션은 자체 어노테이션 객체를 가지고 있습니다:

```typescript
import { typeOf, Group, groupAnnotation } from '@deepkit/type';

type Username = string & Group<'a'> & Group<'b'>;

const type = typeOf<Username>();
groupAnnotation.getAnnotations(type); //['a', 'b']
```

자세한 내용은 [런타임 타입 Reflection](./reflection.md)을 참조하세요.
