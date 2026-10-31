# Type Annotations

Type annotations are normal TypeScript types that contain meta-information that can be read and change the behavior of various functions at runtime. Deepkit already provides some type annotations that cover many use cases. For example, a class property can be marked as primary key, reference, or index. The database library can use this information at runtime to create the correct SQL queries without prior code generation.

Validator constraints such as `MaxLength`, `Maximum`, or `Positive` can also be added to any type. It is also possible to tell the serializer how to serialize or deserialize a particular value. In addition, it is possible to create completely custom type annotations and read them at runtime, in order to use the type system at runtime in a very individual way.

Deepkit comes with a whole set of type annotations, all of which can be used directly from `@deepkit/type`. They are designed not to come from multiple libraries, so as not to tie code directly to a particular library such as Deepkit RPC or Deepkit Database. This allows easier reuse of types, even in the frontend, although database type annotations are used for example.

Following is a list of existing type annotations. The validator and serializer of `@deepkit/type` and `@deepkit/bson` and Deepkit Database of `@deepkit/orm` used this information differently. See the corresponding chapters to learn more about this.

## Integer/Float

Integer and floats are defined as a base as `number` and has several sub-variants:

| Type    | Description                                                                                                                                                                                                           |
|---------|-----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------|
| integer | An integer of arbitrary size.                                                                                                                                                                                         |
| int8    | An integer between -128 and 127.                                                                                                                                                                                      |
| uint8   | An integer between 0 and 255.                                                                                                                                                                                         |
| int16   | An integer between -32768 and 32767.                                                                                                                                                                                  |
| uint16  | An integer between 0 and 65535.                                                                                                                                                                                       |
| int32   | An integer between -2147483648 and 2147483647.                                                                                                                                                                        |
| uint32  | An integer between 0 and 4294967295.                                                                                                                                                                                  |
| float   | Same as number, but might have different meaning in database context.                                                                                                                                                 |
| float32 | A float between -3.40282347e+38 and 3.40282347e+38. Note that JavaScript is not able to check correctly the range due to precision issues, but the information might be handy for the database or binary serializers. |
| float64 | Same as number, but might have different meaning in database context.                                                                                                                                                 |

```typescript
import { integer } from '@deepkit/type';

interface User {
    id: integer;
}
```

Here the `id` of the user is a number at runtime, but is interpreted as an integer in the validation and serialization.
This means that here, for example, no floats may be used in validation and the serializer automatically converts floats into integers.

```typescript
import { is, integer } from '@deepkit/type';

is<integer>(12); //true
is<integer>(12.5); //false
```

The subtypes can be used in the same way and are useful if a specific range of numbers is to be allowed.

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

UUID v4 is usually stored as a binary in the database and as a string in JSON.

```typescript
import { is, UUID } from '@deepkit/type';

is<UUID>('f897399a-9f23-49ac-827d-c16f8e4810a0'); //true
is<UUID>('asd'); //false
```

## MongoID

Marks this field as ObjectId for MongoDB. Resolves as a string. Is stored in the MongoDB as binary.

```typescript
import { MongoId, serialize, is } from '@deepkit/type';

serialize<MongoId>('507f1f77bcf86cd799439011'); //507f1f77bcf86cd799439011
is<MongoId>('507f1f77bcf86cd799439011'); //true
is<MongoId>('507f1f77bcf86cd799439011'); //false

class User {
    id: MongoId = ''; //will automatically set in Deepkit ORM once user is inserted
}
```

## Bigint

Per default the normal bigint type serializes as number in JSON (and long in BSON). This has however limitation in what is possible to save since bigint in JavaScript has an unlimited potential size, where numbers in JavaScript and long in BSON are limited. To bypass this limitation the types `BinaryBigInt` and `SignedBinaryBigInt` are available.

`BinaryBigInt` is the same as bigint but serializes to unsigned binary with unlimited size (instead of 8 bytes in most databases) in databases and string in JSON. Negative values will be converted to positive (`abs(x)`).

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

Deepkit ORM stores BinaryBigInt as a binary field.

`SignedBinaryBigInt` is the same as `BinaryBigInt` but is able to store negative values as well. Deepkit ORM stores `SignedBinaryBigInt` as binary. The binary has an additional leading sign byte and is represented as an uint: 255 for negative, 0 for zero, or 1 for positive.

```typescript
import { SignedBinaryBigInt } from '@deepkit/type';

interface User {
    id: SignedBinaryBigInt;
}
```

## MapName

To change the name of a property in the serialization.

```typescript
import { serialize, deserialize, MapName } from '@deepkit/type';

interface User {
    firstName: string & MapName<'first_name'>;
}

serialize<User>({ firstName: 'Peter' }) // {first_name: 'Peter'}
deserialize<User>({ first_name: 'Peter' }) // {firstName: 'Peter'}
```

## Group

Properties can be grouped together. For serialization you can for example exclude a group from serialization. See the chapter Serialization for more information.

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

Each property can add additional meta-data that can be read via the Reflection API. See [Runtime Types Reflection](reflection.md) for more information.

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

Each property can be excluded from the serialization process for a specific target.

```typescript
import { serialize, deserialize, Excluded } from '@deepkit/type';

interface Auth {
    title: string;
    password: string & Excluded<'json'>
}

const item = deserialize<Auth>({ title: 'Peter', password: 'secret' });

item.password; //undefined, since deserialize's default serializer is called `json`

item.password = 'secret';

const json = serialize<Auth>(item);
json.password; //again undefined, since serialize's serializer is called `json`
```

## Embedded

Marks the field as an embedded type.

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

//for deserialize you have to provide the embedded structure
deserialize<User>({
    id: 12,
    address_street: 'abc',
    //...
});
```

It's possible to change the prefix (which is per default the property name).

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

//or remove it entirely
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

To annotate interfaces with entity information. Only used in the database context.

```typescript
import { Entity, PrimaryKey } from '@deepkit/type';

interface User extends Entity<{ name: 'user', collection: 'users'> {
    id: number & PrimaryKey;
    username: string;
}
```

## PrimaryKey

Marks the field as primary key. Only used in the database context.

```typescript
import { PrimaryKey } from '@deepkit/type';

interface User {
    id: number & PrimaryKey;
}
```

## AutoIncrement

Marks the field as auto increment. Only used in the database context.
Usually together with `PrimaryKey`.

```typescript
import { AutoIncrement } from '@deepkit/type';

interface User {
    id: number & PrimaryKey & AutoIncrement;
}
```

## Reference

Marks the field as reference (foreign key). Only used in the database context.

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

In this example `User.group` is an owning reference also known as foreign key in SQL. This means that the `User` table has a column `group` that references the `Group` table. The `Group` table is the target table of the reference.

## BackReference

Marks the field as back reference. Only used in the database context.

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

In this example `Group.users` is a back reference. This means that the `User` table has a column `group` that references the `Group` table.
The `Group` has a virtual property `users` that is automatically populated with all users that have the same `group` id as the `Group` id once a database query
with joins is executed. The property `users` is not stored in the database.

## Index

Marks the field as index. Only used in the database context.

```typescript
import { Index } from '@deepkit/type';

interface User {
    id: number & PrimaryKey;
    username: string & Index;
}
```

## Unique

Marks the field as unique. Only used in the database context.

```typescript
import { Unique } from '@deepkit/type';

interface User {
    id: number & PrimaryKey;
    username: string & Unique;
}
```

## DatabaseField

With `DatabaseField` you can define the database specific options like the real database column type, and the default value, etc.

```typescript
import { DatabaseField } from '@deepkit/type';

interface User {
    id: number & PrimaryKey;
    username: string & DatabaseField<{ type: 'varchar(255)' }>;
}
```

## Validation

TODO

See [Validation Constraint Types](validation.md#validation-constraint-types).

## InlineRuntimeType

To inline a runtime type. Only used in advanced cases.

```typescript
import { InlineRuntimeType, ReflectionKind, Type } from '@deepkit/type';

const type: Type = { kind: ReflectionKind.string };

type Query = {
    field: InlineRuntimeType<typeof type>;
}

const resolved = typeOf<Query>(); // { field: string }
```

In TypeScript the type `Query` is `{ field: any }`, but in runtime it's `{ field: string }`.

This is useful if you build a highly customizable system where you accept runtime types, and you reuse them in various other cases.

## ResetAnnotation

To reset all annotations of a property. Only used in advanced cases.

```typescript
import { ResetAnnotation } from '@deepkit/type';

interface User {
    id: number & PrimaryKey;
}

interface UserCreationPayload {
    id: User['id'] & ResetAnnotation<'primaryKey'>;
}
```

### Custom Type Annotations

You can define your own type annotations.

```typescript
type MyAnnotation = { __meta?: ['myAnnotation'] };
```

By convention, a type annotation is defined to be an object literal with a single optional property `__meta` that has a tuple as its type. The first entry in this tuple is its unique name and all subsequent tuple entries are arbitrary options. This allows a type annotation to be equipped with additional options.

```typescript
type AnnotationOption<T extends { title: string }> = { __meta?: ['myAnnotation', T] };
```

The type annotation is used with the intersection operator `&`. Any number of type annotations can be used on one type.

```typescript
type Username = string & MyAnnotation;
type Title = string & MyAnnotation & AnnotationOption<{ title: 'Hello' }>;
```

The type annotations can be read out via the type objects of `typeOf<T>()` and `typeAnnotation`:

```typescript
import { typeOf, typeAnnotation } from '@deepkit/type';

const type = typeOf<Username>();
const annotation = typeAnnotation.getForName(type, 'myAnnotation'); //[]
```

The result in `annotation` is either an array with options if the type annotation `myAnnotation` was used or `undefined` if not. If the type annotation has additional options as seen in `AnnotationOption`, the passed values can be found in the array.
Already supplied type annotations like `MapName`, `Group`, `Data`, etc have their own annotation object:

```typescript
import { typeOf, Group, groupAnnotation } from '@deepkit/type';

type Username = string & Group<'a'> & Group<'b'>;

const type = typeOf<Username>();
groupAnnotation.getAnnotations(type); //['a', 'b']
```

See [Runtime Types Reflection](./reflection.md) to learn more.
