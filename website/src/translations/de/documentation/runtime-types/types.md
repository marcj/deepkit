# Type Annotations

Type Annotations sind normale TypeScript-Typen, die Meta-Informationen enthalten, die zur Laufzeit ausgelesen werden können und das Verhalten verschiedener Funktionen verändern. Deepkit stellt bereits einige Type Annotations bereit, die viele Anwendungsfälle abdecken. Beispielsweise kann eine Class-Property als Primary Key, Referenz oder Index markiert werden. Die Datenbank-Library kann diese Informationen zur Laufzeit nutzen, um ohne vorherige Codegenerierung die korrekten SQL-Abfragen zu erstellen.

Validator-Constraints wie `MaxLength`, `Maximum` oder `Positive` können ebenfalls zu jedem Type hinzugefügt werden. Es ist außerdem möglich, dem Serializer mitzuteilen, wie ein bestimmter Wert serialisiert oder deserialisiert werden soll. Darüber hinaus ist es möglich, vollständig eigene Type Annotations zu erstellen und diese zur Laufzeit auszulesen, um das Typsystem zur Laufzeit auf sehr individuelle Weise zu nutzen.

Deepkit bringt eine ganze Reihe von Type Annotations mit, die alle direkt aus `@deepkit/type` verwendet werden können. Sie sind bewusst so gestaltet, dass sie nicht aus mehreren Libraries stammen, um Code nicht direkt an eine bestimmte Library wie Deepkit RPC oder Deepkit Database zu binden. Dies ermöglicht eine einfachere Wiederverwendung von Types, sogar im Frontend, obwohl beispielsweise Datenbank-Type-Annotations verwendet werden.

Im Folgenden findet sich eine Liste der vorhandenen Type Annotations. Der Validator und Serializer von `@deepkit/type` und `@deepkit/bson` sowie Deepkit Database von `@deepkit/orm` nutzen diese Informationen auf unterschiedliche Weise. Siehe die entsprechenden Kapitel, um mehr darüber zu erfahren.

## Integer/Float

Integer und Floats sind als Basis als `number` definiert und haben mehrere Untervarianten:

| Type    | Beschreibung                                                                                                                                                                                                          |
|---------|-----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------|
| integer | Ein Integer beliebiger Größe.                                                                                                                                                                                         |
| int8    | Ein Integer zwischen -128 und 127.                                                                                                                                                                                    |
| uint8   | Ein Integer zwischen 0 und 255.                                                                                                                                                                                       |
| int16   | Ein Integer zwischen -32768 und 32767.                                                                                                                                                                                |
| uint16  | Ein Integer zwischen 0 und 65535.                                                                                                                                                                                     |
| int32   | Ein Integer zwischen -2147483648 und 2147483647.                                                                                                                                                                      |
| uint32  | Ein Integer zwischen 0 und 4294967295.                                                                                                                                                                                |
| float   | Wie number, kann aber im Datenbankkontext eine andere Bedeutung haben.                                                                                                                                                |
| float32 | Ein Float zwischen -3.40282347e+38 und 3.40282347e+38. Beachte, dass JavaScript den Bereich aufgrund von Präzisionsproblemen nicht korrekt prüfen kann, die Information aber für die Datenbank oder binäre Serializer nützlich sein kann. |
| float64 | Wie number, kann aber im Datenbankkontext eine andere Bedeutung haben.                                                                                                                                                |

```typescript
import { integer } from '@deepkit/type';

interface User {
    id: integer;
}
```

Hier ist die `id` des Users zur Laufzeit eine Zahl, wird aber bei der Validierung und Serialisierung als Integer interpretiert.
Das bedeutet, dass hier beispielsweise bei der Validierung keine Floats verwendet werden dürfen und der Serializer Floats automatisch in Integer umwandelt.

```typescript
import { is, integer } from '@deepkit/type';

is<integer>(12); //true
is<integer>(12.5); //false
```

Die Subtypes können auf die gleiche Weise verwendet werden und sind nützlich, wenn ein bestimmter Zahlenbereich erlaubt werden soll.

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

UUID v4 wird in der Datenbank üblicherweise als Binary und in JSON als String gespeichert.

```typescript
import { is, UUID } from '@deepkit/type';

is<UUID>('f897399a-9f23-49ac-827d-c16f8e4810a0'); //true
is<UUID>('asd'); //false
```

## MongoID

Markiert dieses Feld als ObjectId für MongoDB. Wird als String aufgelöst. Wird in MongoDB als Binary gespeichert.

```typescript
import { MongoId, serialize, is } from '@deepkit/type';

serialize<MongoId>('507f1f77bcf86cd799439011'); //507f1f77bcf86cd799439011
is<MongoId>('507f1f77bcf86cd799439011'); //true
is<MongoId>('507f1f77bcf86cd799439011'); //false

class User {
    id: MongoId = ''; //wird in Deepkit ORM automatisch gesetzt, sobald der User eingefügt wurde
}
```

## Bigint

Standardmäßig wird der normale bigint-Type in JSON als number (und in BSON als long) serialisiert. Dies hat jedoch Einschränkungen hinsichtlich dessen, was gespeichert werden kann, da bigint in JavaScript eine potenziell unbegrenzte Größe hat, während numbers in JavaScript und long in BSON begrenzt sind. Um diese Einschränkung zu umgehen, stehen die Types `BinaryBigInt` und `SignedBinaryBigInt` zur Verfügung.

`BinaryBigInt` ist dasselbe wie bigint, wird jedoch in Datenbanken als vorzeichenloses Binary mit unbegrenzter Größe (statt 8 Bytes in den meisten Datenbanken) und in JSON als String serialisiert. Negative Werte werden in positive umgewandelt (`abs(x)`).

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

Deepkit ORM speichert BinaryBigInt als Binary-Feld.

`SignedBinaryBigInt` ist dasselbe wie `BinaryBigInt`, kann aber auch negative Werte speichern. Deepkit ORM speichert `SignedBinaryBigInt` als Binary. Das Binary hat ein zusätzliches führendes Vorzeichen-Byte und wird als uint dargestellt: 255 für negativ, 0 für null oder 1 für positiv.

```typescript
import { SignedBinaryBigInt } from '@deepkit/type';

interface User {
    id: SignedBinaryBigInt;
}
```

## MapName

Um den Namen einer Property bei der Serialisierung zu ändern.

```typescript
import { serialize, deserialize, MapName } from '@deepkit/type';

interface User {
    firstName: string & MapName<'first_name'>;
}

serialize<User>({ firstName: 'Peter' }) // {first_name: 'Peter'}
deserialize<User>({ first_name: 'Peter' }) // {firstName: 'Peter'}
```

## Group

Properties können gruppiert werden. Bei der Serialisierung kann man beispielsweise eine Gruppe von der Serialisierung ausschließen. Siehe das Kapitel Serialisierung für weitere Informationen.

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

Jede Property kann zusätzliche Meta-Daten hinzufügen, die über die Reflection-API ausgelesen werden können. Siehe [Runtime Types Reflection](reflection.md) für weitere Informationen.

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

Jede Property kann für ein bestimmtes Ziel vom Serialisierungsprozess ausgeschlossen werden.

```typescript
import { serialize, deserialize, Excluded } from '@deepkit/type';

interface Auth {
    title: string;
    password: string & Excluded<'json'>
}

const item = deserialize<Auth>({ title: 'Peter', password: 'secret' });

item.password; //undefined, da der Standard-Serializer von deserialize `json` heißt

item.password = 'secret';

const json = serialize<Auth>(item);
json.password; //wieder undefined, da der Serializer von serialize `json` heißt
```

## Embedded

Markiert das Feld als eingebetteten Type.

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

//für deserialize muss die eingebettete Struktur angegeben werden
deserialize<User>({
    id: 12,
    address_street: 'abc',
    //...
});
```

Es ist möglich, das Präfix zu ändern (welches standardmäßig der Property-Name ist).

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

//oder es vollständig entfernen
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

Um Interfaces mit Entity-Informationen zu annotieren. Wird nur im Datenbankkontext verwendet.

```typescript
import { Entity, PrimaryKey } from '@deepkit/type';

interface User extends Entity<{ name: 'user', collection: 'users'> {
    id: number & PrimaryKey;
    username: string;
}
```

## PrimaryKey

Markiert das Feld als Primary Key. Wird nur im Datenbankkontext verwendet.

```typescript
import { PrimaryKey } from '@deepkit/type';

interface User {
    id: number & PrimaryKey;
}
```

## AutoIncrement

Markiert das Feld als Auto Increment. Wird nur im Datenbankkontext verwendet.
Üblicherweise zusammen mit `PrimaryKey`.

```typescript
import { AutoIncrement } from '@deepkit/type';

interface User {
    id: number & PrimaryKey & AutoIncrement;
}
```

## Reference

Markiert das Feld als Referenz (Foreign Key). Wird nur im Datenbankkontext verwendet.

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

In diesem Beispiel ist `User.group` eine besitzende Referenz, in SQL auch als Foreign Key bekannt. Das bedeutet, dass die Tabelle `User` eine Spalte `group` hat, die auf die Tabelle `Group` verweist. Die Tabelle `Group` ist die Zieltabelle der Referenz.

## BackReference

Markiert das Feld als Rückreferenz. Wird nur im Datenbankkontext verwendet.

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

In diesem Beispiel ist `Group.users` eine Rückreferenz. Das bedeutet, dass die Tabelle `User` eine Spalte `group` hat, die auf die Tabelle `Group` verweist.
`Group` hat eine virtuelle Property `users`, die automatisch mit allen Usern befüllt wird, die dieselbe `group`-ID wie die `Group`-ID haben, sobald eine Datenbankabfrage
mit Joins ausgeführt wird. Die Property `users` wird nicht in der Datenbank gespeichert.

## Index

Markiert das Feld als Index. Wird nur im Datenbankkontext verwendet.

```typescript
import { Index } from '@deepkit/type';

interface User {
    id: number & PrimaryKey;
    username: string & Index;
}
```

## Unique

Markiert das Feld als eindeutig. Wird nur im Datenbankkontext verwendet.

```typescript
import { Unique } from '@deepkit/type';

interface User {
    id: number & PrimaryKey;
    username: string & Unique;
}
```

## DatabaseField

Mit `DatabaseField` können datenbankspezifische Optionen wie der tatsächliche Spaltentyp in der Datenbank, der Standardwert usw. definiert werden.

```typescript
import { DatabaseField } from '@deepkit/type';

interface User {
    id: number & PrimaryKey;
    username: string & DatabaseField<{ type: 'varchar(255)' }>;
}
```

## Validation

Validierungs-Constraints sind ebenfalls Type Annotations. Sie werden einem Type über eine Intersection hinzugefügt und von `validate`, `is` und `assert` geprüft sowie automatisch von `validatedDeserialize`, dem HTTP-Router, RPC und CLI-Argumenten.

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

assert<User>(data); //wirft bei ungültigen Daten einen ValidationError
```

Alle verfügbaren Constraint-Types (`Pattern`, `Alpha`, `Minimum`, `Maximum`, `MultipleOf`, `BeforeNow`, eigene `Validate`-Functions, ...) werden im Kapitel zur Validierung beschrieben.

Siehe [Validierungs-Constraint-Types](validation.md#validation-constraint-types).

## InlineRuntimeType

Um einen Runtime-Type inline einzubetten. Wird nur in fortgeschrittenen Fällen verwendet.

```typescript
import { InlineRuntimeType, ReflectionKind, Type } from '@deepkit/type';

const type: Type = { kind: ReflectionKind.string };

type Query = {
    field: InlineRuntimeType<typeof type>;
}

const resolved = typeOf<Query>(); // { field: string }
```

In TypeScript ist der Type `Query` gleich `{ field: any }`, zur Laufzeit jedoch `{ field: string }`.

Dies ist nützlich, wenn man ein hochgradig anpassbares System baut, in dem Runtime-Types entgegengenommen und in verschiedenen anderen Fällen wiederverwendet werden.

## ResetAnnotation

Um alle Annotations einer Property zurückzusetzen. Wird nur in fortgeschrittenen Fällen verwendet.

```typescript
import { ResetAnnotation } from '@deepkit/type';

interface User {
    id: number & PrimaryKey;
}

interface UserCreationPayload {
    id: User['id'] & ResetAnnotation<'primaryKey'>;
}
```

### Eigene Type Annotations

Man kann eigene Type Annotations definieren.

```typescript
type MyAnnotation = { __meta?: ['myAnnotation'] };
```

Per Konvention wird eine Type Annotation als Objektliteral mit einer einzigen optionalen Property `__meta` definiert, deren Type ein Tupel ist. Der erste Eintrag in diesem Tupel ist ihr eindeutiger Name, und alle weiteren Tupel-Einträge sind beliebige Optionen. Dadurch kann eine Type Annotation mit zusätzlichen Optionen ausgestattet werden.

```typescript
type AnnotationOption<T extends { title: string }> = { __meta?: ['myAnnotation', T] };
```

Die Type Annotation wird mit dem Intersection-Operator `&` verwendet. Auf einem Type können beliebig viele Type Annotations verwendet werden.

```typescript
type Username = string & MyAnnotation;
type Title = string & MyAnnotation & AnnotationOption<{ title: 'Hello' }>;
```

Die Type Annotations können über die Type-Objekte von `typeOf<T>()` und `typeAnnotation` ausgelesen werden:

```typescript
import { typeOf, typeAnnotation } from '@deepkit/type';

const type = typeOf<Username>();
const annotation = typeAnnotation.getForName(type, 'myAnnotation'); //[]
```

Das Ergebnis in `annotation` ist entweder ein Array mit Optionen, falls die Type Annotation `myAnnotation` verwendet wurde, oder `undefined`, falls nicht. Hat die Type Annotation zusätzliche Optionen, wie in `AnnotationOption` zu sehen, finden sich die übergebenen Werte im Array.
Bereits mitgelieferte Type Annotations wie `MapName`, `Group`, `Data` usw. haben ihr eigenes Annotation-Objekt:

```typescript
import { typeOf, Group, groupAnnotation } from '@deepkit/type';

type Username = string & Group<'a'> & Group<'b'>;

const type = typeOf<Username>();
groupAnnotation.getAnnotations(type); //['a', 'b']
```

Siehe [Runtime Types Reflection](./reflection.md), um mehr zu erfahren.
