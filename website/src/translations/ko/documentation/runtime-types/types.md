# 타입 애너테이션

Type annotation은 런타임에서 읽혀 다양한 Function의 동작을 변경할 수 있는 메타 정보를 포함하는 일반적인 TypeScript Type입니다. Deepkit은 이미 많은 사용 사례를 커버하는 여러 type annotation을 제공합니다. 예를 들어, class property를 primary key, reference, 또는 index로 표시할 수 있습니다. 데이터베이스 라이브러리는 이 정보를 런타임에 사용하여 사전 code 생성 없이 올바른 SQL 쿼리를 만들 수 있습니다.

`MaxLength`, `Maximum`, `Positive`와 같은 Validator 제약을 어떤 type에도 추가할 수 있습니다. 특정 값을 serializer가 어떻게 serialize/deserialzie 할지 알려주는 것도 가능합니다. 또한 완전히 커스텀한 type annotation을 만들고 이를 런타임에 읽어, 런타임에서 type system을 매우 개별적으로 사용할 수도 있습니다.

Deepkit은 `@deepkit/type`에서 바로 사용할 수 있는 다양한 type annotation을 제공합니다. 이들은 여러 라이브러리에서 오지 않도록 설계되어, Deepkit RPC나 Deepkit Database 같은 특정 라이브러리에 code를 직접 묶지 않게 합니다. 이는 예를 들어 데이터베이스 type annotation을 사용하더라도, frontend에서도 Type의 재사용을 더 쉽게 해줍니다.

다음은 기존 type annotation의 목록입니다. `@deepkit/type`와 `@deepkit/bson`의 validator와 serializer, 그리고 `@deepkit/orm`의 Deepkit Database는 이 정보를 서로 다르게 사용합니다. 더 알아보려면 해당 장을 참고하세요.

## Integer/Float

정수와 실수는 기본적으로 `number`로 정의되며 여러 하위 변형이 있습니다:

| Type    | 설명                                                                                                                                                                                                                  |
|---------|-----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------|
| integer | 임의 크기의 정수.                                                                                                                                                                                                     |
| int8    | -128에서 127 사이의 정수.                                                                                                                                                                                             |
| uint8   | 0에서 255 사이의 정수.                                                                                                                                                                                                |
| int16   | -32768에서 32767 사이의 정수.                                                                                                                                                                                         |
| uint16  | 0에서 65535 사이의 정수.                                                                                                                                                                                              |
| int32   | -2147483648에서 2147483647 사이의 정수.                                                                                                                                                                               |
| uint32  | 0에서 4294967295 사이의 정수.                                                                                                                                                                                         |
| float   | number와 같지만 데이터베이스 문맥에서 다른 의미를 가질 수 있음.                                                                                                                                                       |
| float32 | -3.40282347e+38에서 3.40282347e+38 사이의 float. JavaScript는 정밀도 문제로 범위를 정확히 검사할 수 없지만, 이 정보는 데이터베이스나 바이너리 serializer에 유용할 수 있음.                                              |
| float64 | number와 같지만 데이터베이스 문맥에서 다른 의미를 가질 수 있음.                                                                                                                                                       |

```typescript
import { integer } from '@deepkit/type';

interface User {
    id: integer;
}
```

여기서 사용자의 `id`는 런타임에서는 number이지만, validation과 serialization에서는 integer로 해석됩니다.
이는 예를 들어 validation에서는 float를 사용할 수 없고, serializer가 자동으로 float를 integer로 변환한다는 것을 의미합니다.

```typescript
import { is, integer } from '@deepkit/type';

is<integer>(12); //true
is<integer>(12.5); //false
```

하위 타입들도 동일하게 사용할 수 있으며, 특정 숫자 범위만 허용해야 할 때 유용합니다.

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

UUID v4는 일반적으로 데이터베이스에서는 binary로, JSON에서는 string으로 저장됩니다.

```typescript
import { is, UUID } from '@deepkit/type';

is<UUID>('f897399a-9f23-49ac-827d-c16f8e4810a0'); //true
is<UUID>('asd'); //false
```

## MongoID

이 필드를 MongoDB의 ObjectId로 표시합니다. string으로 해석되며, MongoDB에는 binary로 저장됩니다.

```typescript
import { MongoId, serialize, is } from '@deepkit/type';

serialize<MongoId>('507f1f77bcf86cd799439011'); //507f1f77bcf86cd799439011
is<MongoId>('507f1f77bcf86cd799439011'); //true
is<MongoId>('507f1f77bcf86cd799439011'); //false

class User {
    id: MongoId = ''; //사용자가 삽입되면 Deepkit ORM에서 자동으로 설정됨
}
```

## Bigint

기본적으로 일반 bigint type은 JSON에서는 number로 (BSON에서는 long으로) serialize됩니다. 그러나 JavaScript의 bigint는 잠재적으로 크기가 무제한인 반면, JavaScript의 number와 BSON의 long은 제한이 있으므로 저장 가능한 범위에 제약이 생깁니다. 이 제한을 우회하기 위해 `BinaryBigInt`와 `SignedBinaryBigInt` type을 사용할 수 있습니다.

`BinaryBigInt`는 bigint와 같지만, 데이터베이스에서는 무제한 크기의 unsigned binary(대부분의 데이터베이스의 8바이트 대신)로, JSON에서는 string으로 serialize됩니다. 음수 값은 양수로 변환됩니다(`abs(x)`).

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

Deepkit ORM은 BinaryBigInt를 binary field로 저장합니다.

`SignedBinaryBigInt`는 `BinaryBigInt`와 같지만 음수 값도 저장할 수 있습니다. Deepkit ORM은 `SignedBinaryBigInt`를 binary로 저장합니다. 이 binary에는 추가적인 선행 부호 byte가 있으며 uint로 표현됩니다: 음수는 255, 0은 0, 양수는 1.

```typescript
import { SignedBinaryBigInt } from '@deepkit/type';

interface User {
    id: SignedBinaryBigInt;
}
```

## MapName

serialization에서 property의 이름을 변경합니다.

```typescript
import { serialize, deserialize, MapName } from '@deepkit/type';

interface User {
    firstName: string & MapName<'first_name'>;
}

serialize<User>({ firstName: 'Peter' }) // {first_name: 'Peter'}
deserialize<User>({ first_name: 'Peter' }) // {firstName: 'Peter'}
```

## Group

Property를 그룹으로 묶을 수 있습니다. 예를 들어 serialization 시 특정 그룹을 제외할 수 있습니다. 자세한 내용은 Serialization 장을 참고하세요.

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

각 property는 Reflection API를 통해 읽을 수 있는 추가 meta-data를 가질 수 있습니다. 자세한 내용은 [런타임 타입 리플렉션](reflection.md)을 참고하세요.

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

각 property는 특정 target에 대해 serialization 과정에서 제외될 수 있습니다.

```typescript
import { serialize, deserialize, Excluded } from '@deepkit/type';

interface Auth {
    title: string;
    password: string & Excluded<'json'>
}

const item = deserialize<Auth>({ title: 'Peter', password: 'secret' });

item.password; //deserialize의 기본 serializer는 `json`이므로 undefined

item.password = 'secret';

const json = serialize<Auth>(item);
json.password; //serialize의 serializer가 `json`이므로 다시 undefined
```

## Embedded

필드를 embedded type으로 표시합니다.

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

//deserialize를 위해서는 embedded 구조를 제공해야 합니다
deserialize<User>({
    id: 12,
    address_street: 'abc',
    //...
});
```

prefix(기본값은 property 이름)를 변경하는 것도 가능합니다.

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

//혹은 완전히 제거할 수도 있습니다
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

interface에 entity 정보를 annotate합니다. 데이터베이스 문맥에서만 사용됩니다.

```typescript
import { Entity, PrimaryKey } from '@deepkit/type';

interface User extends Entity<{ name: 'user', collection: 'users'> {
    id: number & PrimaryKey;
    username: string;
}
```

## PrimaryKey

필드를 primary key로 표시합니다. 데이터베이스 문맥에서만 사용됩니다.

```typescript
import { PrimaryKey } from '@deepkit/type';

interface User {
    id: number & PrimaryKey;
}
```

## AutoIncrement

필드를 auto increment로 표시합니다. 데이터베이스 문맥에서만 사용됩니다.
보통 `PrimaryKey`와 함께 사용됩니다.

```typescript
import { AutoIncrement } from '@deepkit/type';

interface User {
    id: number & PrimaryKey & AutoIncrement;
}
```

## Reference

필드를 reference(foreign key)로 표시합니다. 데이터베이스 문맥에서만 사용됩니다.

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

이 예시에서 `User.group`은 SQL에서 foreign key로도 알려진 owning reference입니다. 이는 `User` 테이블에 `group` 컬럼이 있고, 해당 컬럼이 `Group` 테이블을 참조한다는 뜻입니다. `Group` 테이블은 이 reference의 대상 테이블입니다.

## BackReference

필드를 back reference로 표시합니다. 데이터베이스 문맥에서만 사용됩니다.

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

이 예시에서 `Group.users`는 back reference입니다. 이는 `User` 테이블에 `group` 컬럼이 있고, 해당 컬럼이 `Group` 테이블을 참조한다는 뜻입니다.
`Group`에는 가상 property `users`가 있으며, 조인이 수행되는 데이터베이스 쿼리가 실행되면 `Group` id와 동일한 `group` id를 가진 모든 사용자로 자동 채워집니다.
`users` property는 데이터베이스에 저장되지 않습니다.

## Index

필드를 index로 표시합니다. 데이터베이스 문맥에서만 사용됩니다.

```typescript
import { Index } from '@deepkit/type';

interface User {
    id: number & PrimaryKey;
    username: string & Index;
}
```

## Unique

필드를 unique로 표시합니다. 데이터베이스 문맥에서만 사용됩니다.

```typescript
import { Unique } from '@deepkit/type';

interface User {
    id: number & PrimaryKey;
    username: string & Unique;
}
```

## DatabaseField

`DatabaseField`를 사용하면 실제 데이터베이스 컬럼 type, 기본값 등 데이터베이스 특정 옵션을 정의할 수 있습니다.

```typescript
import { DatabaseField } from '@deepkit/type';

interface User {
    id: number & PrimaryKey;
    username: string & DatabaseField<{ type: 'varchar(255)' }>;
}
```

## Validation

TODO

[검증 제약 타입](validation.md#validation-constraint-types)을 참고하세요.

## InlineRuntimeType

런타임 type을 inline합니다. 고급 케이스에서만 사용됩니다.

```typescript
import { InlineRuntimeType, ReflectionKind, Type } from '@deepkit/type';

const type: Type = { kind: ReflectionKind.string };

type Query = {
    field: InlineRuntimeType<typeof type>;
}

const resolved = typeOf<Query>(); // { field: string }
```

TypeScript에서 type `Query`는 `{ field: any }`이지만, 런타임에서는 `{ field: string }`입니다.

이것은 런타임 type을 받아들이는 고도로 커스터마이즈 가능한 시스템을 구축할 때 유용하며, 이를 다양한 다른 경우에 재사용할 수 있습니다.

## ResetAnnotation

property의 모든 annotation을 초기화합니다. 고급 케이스에서만 사용됩니다.

```typescript
import { ResetAnnotation } from '@deepkit/type';

interface User {
    id: number & PrimaryKey;
}

interface UserCreationPayload {
    id: User['id'] & ResetAnnotation<'primaryKey'>;
}
```

### 커스텀 Type Annotation

사용자 정의 type annotation을 정의할 수 있습니다.

```typescript
type MyAnnotation = { __meta?: ['myAnnotation'] };
```

관례상, type annotation은 단일 선택적 property `__meta`를 가진 object literal로 정의되며, 이 property는 tuple을 type으로 갖습니다. 이 tuple의 첫 번째 항목은 고유한 이름이고, 그 이후 항목은 임의의 옵션입니다. 이를 통해 type annotation에 추가 옵션을 부여할 수 있습니다.

```typescript
type AnnotationOption<T extends { title: string }> = { __meta?: ['myAnnotation', T] };
```

type annotation은 교집합 연산자 `&`로 사용됩니다. 하나의 type에 임의 개수의 type annotation을 사용할 수 있습니다.

```typescript
type Username = string & MyAnnotation;
type Title = string & MyAnnotation & AnnotationOption<{ title: 'Hello' }>;
```

type annotation은 `typeOf<T>()`와 `typeAnnotation`의 type object를 통해 읽을 수 있습니다:

```typescript
import { typeOf, typeAnnotation } from '@deepkit/type';

const type = typeOf<Username>();
const annotation = typeAnnotation.getForName(type, 'myAnnotation'); //[]
```

`annotation`의 결과는 type annotation `myAnnotation`이 사용되었다면 옵션이 담긴 배열이며, 사용되지 않았다면 `undefined`입니다. `AnnotationOption`에서 보았듯, type annotation에 추가 옵션이 있다면 전달된 값은 배열에서 찾을 수 있습니다.
`MapName`, `Group`, `Data` 등 이미 제공되는 type annotation은 각각의 annotation object를 가지고 있습니다:

```typescript
import { typeOf, Group, groupAnnotation } from '@deepkit/type';

type Username = string & Group<'a'> & Group<'b'>;

const type = typeOf<Username>();
groupAnnotation.getAnnotations(type); //['a', 'b']
```

자세한 내용은 [런타임 타입 리플렉션](./reflection.md)을 참고하세요.