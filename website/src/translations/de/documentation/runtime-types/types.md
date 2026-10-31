# Typannotationen

Typannotationen sind normale TypeScript-Types, die Metainformationen enthalten, die zur Laufzeit ausgelesen werden können und das Verhalten verschiedener Functions zur Laufzeit ändern. Deepkit stellt bereits einige Typannotationen bereit, die viele Anwendungsfälle abdecken. Zum Beispiel kann eine Klassen-Property als Primary Key, Reference oder Index markiert werden. Die Datenbankbibliothek kann diese Informationen zur Laufzeit nutzen, um ohne vorherige Code-Generierung die richtigen SQL-Abfragen zu erstellen.

Validator-Constraints wie `MaxLength`, `Maximum` oder `Positive` können ebenfalls zu jedem Type hinzugefügt werden. Es ist außerdem möglich, dem Serializer mitzuteilen, wie ein bestimmter Wert serialisiert oder deserialisiert werden soll. Darüber hinaus ist es möglich, vollständig eigene Typannotationen zu erstellen und diese zur Laufzeit auszulesen, um das Type-System zur Laufzeit sehr individuell zu nutzen.

Deepkit bringt einen ganzen Satz an Typannotationen mit, die alle direkt aus `@deepkit/type` genutzt werden können. Sie sind so konzipiert, dass sie nicht aus mehreren Libraries stammen, um Code nicht direkt an eine bestimmte Library wie Deepkit RPC oder Deepkit Database zu binden. Dadurch lassen sich Types leichter wiederverwenden, sogar im Frontend, auch wenn zum Beispiel Datenbank-Typannotationen verwendet werden.

Im Folgenden befindet sich eine Liste vorhandener Typannotationen. Der Validator und Serializer von `@deepkit/type` und `@deepkit/bson` sowie die Deepkit Database von `@deepkit/orm` nutzen diese Informationen jeweils unterschiedlich. Siehe die entsprechenden Kapitel, um mehr darüber zu erfahren.

## Integer/Float

Integer und Floats sind als Basis als `number` definiert und haben mehrere Untervarianten:

| Typ     | Beschreibung                                                                                                                                                                                                           |
|---------|-------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------|
| integer | Ein Integer beliebiger Größe.                                                                                                                                                                                          |
| int8    | Ein Integer zwischen -128 und 127.                                                                                                                                                                                     |
| uint8   | Ein Integer zwischen 0 und 255.                                                                                                                                                                                        |
| int16   | Ein Integer zwischen -32768 und 32767.                                                                                                                                                                                 |
| uint16  | Ein Integer zwischen 0 und 65535.                                                                                                                                                                                      |
| int32   | Ein Integer zwischen -2147483648 und 2147483647.                                                                                                                                                                       |
| uint32  | Ein Integer zwischen 0 und 4294967295.                                                                                                                                                                                 |
| float   | Entspricht number, kann im Datenbankkontext jedoch eine andere Bedeutung haben.                                                                                                                                        |
| float32 | Ein Float zwischen -3.40282347e+38 und 3.40282347e+38. Beachte, dass JavaScript den Bereich aufgrund von Präzisionsproblemen nicht korrekt prüfen kann; die Information kann jedoch für die Datenbank oder binäre Serializer nützlich sein. |
| float64 | Entspricht number, kann im Datenbankkontext jedoch eine andere Bedeutung haben.                                                                                                                                        |

```typescript
import { integer } from '@deepkit/type';

interface User {
    id: integer;
}
```

Hier ist die `id` des Users zur Laufzeit eine number, wird aber in Validierung und Serialisierung als Integer interpretiert.
Das bedeutet, dass beispielsweise in der Validierung keine Floats erlaubt sind und der Serializer Floats automatisch in Integer umwandelt.

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

UUID v4 wird in der Datenbank üblicherweise als Binary und in JSON als string gespeichert.

```typescript
import { is, UUID } from '@deepkit/type';

is<UUID>('f897399a-9f23-49ac-827d-c16f8e4810a0'); //true
is<UUID>('asd'); //false
```

## MongoID

Markiert dieses Feld als ObjectId für MongoDB. Wird als string aufgelöst. Wird in MongoDB als Binary gespeichert.

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

Standardmäßig serialisiert der normale bigint Type als number in JSON (und als long in BSON). Dies hat jedoch Einschränkungen hinsichtlich dessen, was gespeichert werden kann, da bigint in JavaScript eine unbegrenzte potenzielle Größe hat, während numbers in JavaScript und long in BSON begrenzt sind. Um diese Einschränkung zu umgehen, stehen die Types `BinaryBigInt` und `SignedBinaryBigInt` zur Verfügung.

`BinaryBigInt` ist dasselbe wie bigint, serialisiert in Datenbanken jedoch als unsigniertes Binary mit unbegrenzter Größe (anstatt 8 Bytes in den meisten Datenbanken) und in JSON als string. Negative Werte werden in positive umgewandelt (`abs(x)`).

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

Deepkit ORM speichert BinaryBigInt als Binärfeld.

`SignedBinaryBigInt` ist dasselbe wie `BinaryBigInt`, kann jedoch auch negative Werte speichern. Deepkit ORM speichert `SignedBinaryBigInt` als Binary. Das Binary hat ein zusätzliches führendes Vorzeichen-Byte und wird als uint dargestellt: 255 für negativ, 0 für null oder 1 für positiv.

```typescript
import { SignedBinaryBigInt } from '@deepkit/type';

interface User {
    id: SignedBinaryBigInt;
}
```

## MapName

Um den Namen einer Property in der Serialisierung zu ändern.

```typescript
import { serialize, deserialize, MapName } from '@deepkit/type';

interface User {
    firstName: string & MapName<'first_name'>;
}

serialize<User>({ firstName: 'Peter' }) // {first_name: 'Peter'}
deserialize<User>({ first_name: 'Peter' }) // {firstName: 'Peter'}
```

## Group

Properties können gruppiert werden. Bei der Serialisierung kann man zum Beispiel eine Group von der Serialisierung ausschließen. Siehe das Kapitel Serialisierung für weitere Informationen.

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

Jede Property kann zusätzliche Metadaten hinzufügen, die über die Reflection API ausgelesen werden können. Siehe [Laufzeit-Typen-Reflexion](reflection.md) für weitere Informationen.

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

Markiert das Feld als Embedded Type.

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

//für deserialize muss die eingebettete Struktur bereitgestellt werden
deserialize<User>({
    id: 12,
    address_street: 'abc',
    //...
});
```

Es ist möglich, das Präfix zu ändern (standardmäßig ist es der Property-Name).

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

//oder vollständig entfernen
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

Markiert das Feld als Auto-Increment. Wird nur im Datenbankkontext verwendet.
Üblicherweise zusammen mit `PrimaryKey`.

```typescript
import { AutoIncrement } from '@deepkit/type';

interface User {
    id: number & PrimaryKey & AutoIncrement;
}
```

## Reference

Markiert das Feld als Reference (Foreign Key). Wird nur im Datenbankkontext verwendet.

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

In diesem Beispiel ist `User.group` eine besitzende Reference, auch bekannt als Foreign Key in SQL. Das bedeutet, dass die `User`-Tabelle eine Spalte `group` hat, die auf die `Group`-Tabelle verweist. Die `Group`-Tabelle ist die Ziel-Tabelle der Reference.

## BackReference

Markiert das Feld als Back Reference. Wird nur im Datenbankkontext verwendet.

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

In diesem Beispiel ist `Group.users` eine Back Reference. Das bedeutet, dass die `User`-Tabelle eine Spalte `group` hat, die auf die `Group`-Tabelle verweist.
Die `Group` hat eine virtuelle Property `users`, die automatisch mit allen Benutzern befüllt wird, die dieselbe `group`-ID wie die `Group`-ID haben, sobald eine Datenbankabfrage
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

Markiert das Feld als Unique. Wird nur im Datenbankkontext verwendet.

```typescript
import { Unique } from '@deepkit/type';

interface User {
    id: number & PrimaryKey;
    username: string & Unique;
}
```

## DatabaseField

Mit `DatabaseField` können datenbankspezifische Optionen wie der konkrete Datenbank-Spaltentyp und der Default-Wert usw. definiert werden.

```typescript
import { DatabaseField } from '@deepkit/type';

interface User {
    id: number & PrimaryKey;
    username: string & DatabaseField<{ type: 'varchar(255)' }>;
}
```

## Validation

TODO

Siehe [Validierungs-Constraint-Typen](validation.md#validation-constraint-types).

## InlineRuntimeType

Um einen Runtime Type inline einzubetten. Wird nur in fortgeschrittenen Fällen verwendet.

```typescript
import { InlineRuntimeType, ReflectionKind, Type } from '@deepkit/type';

const type: Type = { kind: ReflectionKind.string };

type Query = {
    field: InlineRuntimeType<typeof type>;
}

const resolved = typeOf<Query>(); // { field: string }
```

In TypeScript ist der Type `Query` `{ field: any }`, zur Laufzeit jedoch `{ field: string }`.

Dies ist nützlich, wenn du ein hochgradig anpassbares System baust, in dem du Runtime Types akzeptierst und sie in verschiedenen anderen Fällen wiederverwendest.

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

### Custom Type Annotations

Du kannst eigene Typannotationen definieren.

```typescript
type MyAnnotation = { __meta?: ['myAnnotation'] };
```

Konventionsgemäß wird eine Typannotation als Objektliteral mit einer einzelnen optionalen Property `__meta` definiert, die ein Tupel als Type hat. Der erste Eintrag in diesem Tupel ist sein eindeutiger Name und alle nachfolgenden Tupel-Einträge sind beliebige Optionen. Dadurch kann eine Typannotation mit zusätzlichen Optionen ausgestattet werden.

```typescript
type AnnotationOption<T extends { title: string }> = { __meta?: ['myAnnotation', T] };
```

Die Typannotation wird mit dem Schnittmengen-Operator `&` verwendet. Es können beliebig viele Typannotationen auf einem Type genutzt werden.

```typescript
type Username = string & MyAnnotation;
type Title = string & MyAnnotation & AnnotationOption<{ title: 'Hello' }>;
```

Die Typannotationen können über die Type-Objekte von `typeOf<T>()` und `typeAnnotation` ausgelesen werden:

```typescript
import { typeOf, typeAnnotation } from '@deepkit/type';

const type = typeOf<Username>();
const annotation = typeAnnotation.getForName(type, 'myAnnotation'); //[]
```

Das Ergebnis in `annotation` ist entweder ein Array mit Optionen, falls die Typannotation `myAnnotation` verwendet wurde, oder `undefined`, falls nicht. Wenn die Typannotation zusätzliche Optionen hat, wie in `AnnotationOption` zu sehen, finden sich die übergebenen Werte im Array.
Bereits mitgelieferte Typannotationen wie `MapName`, `Group`, `Data` usw. haben ihr eigenes Annotation-Objekt:

```typescript
import { typeOf, Group, groupAnnotation } from '@deepkit/type';

type Username = string & Group<'a'> & Group<'b'>;

const type = typeOf<Username>();
groupAnnotation.getAnnotations(type); //['a', 'b']
```

Siehe [Laufzeit-Typen-Reflexion](./reflection.md), um mehr zu erfahren.