# Query

Eine Query ist ein Objekt, das beschreibt, wie Daten aus der Datenbank abgerufen oder geändert werden. Sie verfügt über mehrere Methoden zur Beschreibung der Query sowie über abschließende Methoden, die sie ausführen. Der Datenbankadapter kann die Query-API auf vielfältige Weise erweitern, um datenbankspezifische Features zu unterstützen.

Eine Query kann mit `Database.query(T)` oder `Session.query(T)` erstellt werden. Wir empfehlen Sessions, da sie die Performance verbessern.

```typescript
@entity.name('user')
class User {
    id: number & PrimaryKey & AutoIncrement = 0;
    created: Date = new Date;
    birthdate?: Date;
    visits: number = 0;

    constructor(public username: string) {
    }
}

const database = new Database(...);

//[ { username: 'User1' }, { username: 'User2' }, { username: 'User2' } ]
const users = await database.query(User).select('username').find();
```

## Filter

Ein Filter kann angewendet werden, um die Ergebnismenge einzuschränken.

```typescript
//einfache Filter
const users = await database.query(User).filter({name: 'User1'}).find();

//mehrere Filter, alle mit AND verknüpft
const users = await database.query(User).filter({name: 'User1', id: 2}).find();

//Bereichsfilter: $gt, $lt, $gte, $lte (größer als, kleiner als, ...)
//entspricht WHERE created < NOW()
const users = await database.query(User).filter({created: {$lt: new Date}}).find();
//entspricht WHERE id > 500
const users = await database.query(User).filter({id: {$gt: 500}}).find();
//entspricht WHERE id >= 500
const users = await database.query(User).filter({id: {$gte: 500}}).find();

//Mengenfilter: $in, $nin (in, nicht in)
//entspricht WHERE id IN (1, 2, 3)
const users = await database.query(User).filter({id: {$in: [1, 2, 3]}}).find();

//Regex-Filter
const users = await database.query(User).filter({username: {$regex: /User[0-9]+/}}).find();

//Gruppierung: $and, $nor, $or
//entspricht WHERE (username = 'User1') OR (username = 'User2')
const users = await database.query(User).filter({
    $or: [{username: 'User1'}, {username: 'User2'}]
}).find();


//verschachtelte Gruppierung
//entspricht WHERE username = 'User1' OR (username = 'User2' and id > 0)
const users = await database.query(User).filter({
    $or: [{username: 'User1'}, {username: 'User2', id: {$gt: 0}}]
}).find();


//verschachtelte Gruppierung
//entspricht WHERE username = 'User1' AND (created < NOW() OR id > 0)
const users = await database.query(User).filter({
    $and: [{username: 'User1'}, {$or: [{created: {$lt: new Date}, id: {$gt: 0}}]}]
}).find();
```

### Gleich

### Größer / Kleiner

### RegExp

### Gruppierung AND/OR

### In

## Select

Um die aus der Datenbank abzurufenden Felder einzugrenzen, kann `select('field1')` verwendet werden.

```typescript
const user = await database.query(User).select('username').findOne();
const user = await database.query(User).select('id', 'username').findOne();
```

Wichtig ist, dass die Ergebnisse keine Instanzen der Entity mehr sind, sondern nur noch Objektliterale, sobald die Felder mit `select` eingegrenzt werden.

```
const user = await database.query(User).select('username').findOne();
user instanceof User; //false
```

## Sortierung

Mit `orderBy(field, order)` kann die Reihenfolge der Einträge geändert werden.
`orderBy` kann mehrfach ausgeführt werden, um die Sortierung immer weiter zu verfeinern.

```typescript
const users = await session.query(User).orderBy('created', 'desc').find();
const users = await session.query(User).orderBy('created', 'asc').find();
```

## Paginierung

Mit den Methoden `itemsPerPage()` und `page()` können die Ergebnisse paginiert werden. Die Seitenzählung beginnt bei 1.

```typescript
const users = await session.query(User).itemsPerPage(50).page(1).find();
```

Mit den alternativen Methoden `limit` und `skip` kann manuell paginiert werden.

```typescript
const users = await session.query(User).limit(5).skip(10).find();
```

[#database-join]
## Join

Standardmäßig werden Referenzen der Entity weder in Queries einbezogen noch geladen. Um einen Join in die Query aufzunehmen, ohne die Referenz zu laden, verwende `join()` (Left Join) oder `innerJoin()`. Um einen Join in die Query aufzunehmen und die Referenz zu laden, verwende `joinWith()` oder `innerJoinWith()`.

Alle folgenden Beispiele gehen von diesen Modellschemata aus:

```typescript
@entity.name('group')
class Group {
    id: number & PrimaryKey & AutoIncrement = 0;
    created: Date = new Date;

    constructor(public username: string) {
    }
}

@entity.name('user')
class User {
    id: number & PrimaryKey & AutoIncrement = 0;
    created: Date = new Date;

    group?: Group & Reference;

    constructor(public username: string) {
    }
}
```

```typescript
//nur Benutzer auswählen, denen eine Gruppe zugewiesen ist (INNER JOIN)
const users = await session.query(User).innerJoin('group').find();
for (const user of users) {
    user.group; //Error, da die Referenz nicht geladen wurde
}
```

```typescript
//nur Benutzer auswählen, denen eine Gruppe zugewiesen ist (INNER JOIN), und die Relation laden
const users = await session.query(User).innerJoinWith('group').find();
for (const user of users) {
    user.group.name; //funktioniert
}
```

Um Join-Queries zu ändern, verwende dieselben Methoden, jedoch mit dem Präfix `use`: `useJoin`, `useInnerJoin`, `useJoinWith` oder `useInnerJoinWith`. Um die Änderung der Join-Query zu beenden, verwende `end()`, womit du zur übergeordneten Query zurückkehrst.

```typescript
//nur Benutzer auswählen, denen eine Gruppe mit dem Namen 'admins' zugewiesen ist (INNER JOIN)
const users = await session.query(User)
    .useInnerJoinWith('group')
        .filter({name: 'admins'})
        .end()  // kehrt zur übergeordneten Query zurück
    .find();

for (const user of users) {
    user.group.name; //immer admin
}
```

## Aggregation

Mit Aggregationsmethoden lassen sich Datensätze zählen und Felder aggregieren.

Die folgenden Beispiele gehen von diesem Modellschema aus:

```typescript
@entity.name('file')
class File {
    id: number & PrimaryKey & AutoIncrement = 0;
    created: Date = new Date;

    downloads: number = 0;

    category: string = 'none';

    constructor(public path: string & Index) {
    }
}
```

`groupBy` ermöglicht es, das Ergebnis nach dem angegebenen Feld zu gruppieren.

```typescript
await database.persist(
    cast<File>({path: 'file1', category: 'images'}),
    cast<File>({path: 'file2', category: 'images'}),
    cast<File>({path: 'file3', category: 'pdfs'})
);

//[ { category: 'images' }, { category: 'pdfs' } ]
await session.query(File).groupBy('category').find();
```

Es gibt mehrere Aggregationsmethoden: `withSum`, `withAverage`, `withCount`, `withMin`, `withMax`, `withGroupConcat`. Jede erfordert einen Feldnamen als erstes Argument und akzeptiert ein optionales zweites Argument, um den Alias zu ändern.

```typescript
// zuerst aktualisieren wir einige der Datensätze:
await database.query(File).filter({path: 'images/file1'}).patchOne({$inc: {downloads: 15}});
await database.query(File).filter({path: 'images/file2'}).patchOne({$inc: {downloads: 5}});

//[{ category: 'images', downloads: 20 },{ category: 'pdfs', downloads: 0 }]
await session.query(File).groupBy('category').withSum('downloads').find();

//[{ category: 'images', downloads: 10 },{ category: 'pdfs', downloads: 0 }]
await session.query(File).groupBy('category').withAverage('downloads').find();

//[ { category: 'images', amount: 2 }, { category: 'pdfs', amount: 1 } ]
await session.query(File).groupBy('category').withCount('id', 'amount').find();
```

## Returning

Mit `returning` können bei Änderungen über `patch` und `delete` zusätzliche Felder angefordert werden.

Achtung: Nicht alle Datenbankadapter geben Felder atomar zurück. Verwende Transaktionen, um die Datenkonsistenz sicherzustellen.

```typescript
await database.query(User).patchMany({visits: 0});

//{ modified: 1, returning: { visits: [ 5 ] }, primaryKeys: [ 1 ] }
const result = await database.query(User)
    .filter({username: 'User1'})
    .returning('username', 'visits')
    .patchOne({$inc: {visits: 5}});
```

## Find

Gibt ein Array von Einträgen zurück, die dem angegebenen Filter entsprechen.

```typescript
const users: User[] = await database.query(User).filter({username: 'Peter'}).find();
```

## FindOne

Gibt einen Eintrag zurück, der dem angegebenen Filter entspricht.
Wird kein Eintrag gefunden, wird ein `ItemNotFound`-Error geworfen.

```typescript
const users: User = await database.query(User).filter({username: 'Peter'}).findOne();
```

## FindOneOrUndefined

Gibt einen Eintrag zurück, der dem angegebenen Filter entspricht.
Wird kein Eintrag gefunden, wird undefined zurückgegeben.

```typescript
const query = database.query(User).filter({username: 'Peter'});
const users: User|undefined = await query.findOneOrUndefined();
```

## FindField

Gibt eine Liste der Werte eines Feldes zurück, die dem angegebenen Filter entsprechen.

```typescript
const usernames: string[] = await database.query(User).findField('username');
```

## FindOneField

Gibt eine Liste der Werte eines Feldes zurück, die dem angegebenen Filter entsprechen.
Wird kein Eintrag gefunden, wird ein `ItemNotFound`-Error geworfen.

```typescript
const username: string = await database.query(User).filter({id: 3}).findOneField('username');
```

## Patch

Patch ist eine Änderungs-Query, die die in der Query beschriebenen Datensätze patcht. Die Methoden
`patchOne` und `patchMany` schließen die Query ab und führen den Patch aus.

`patchMany` ändert alle Datensätze in der Datenbank, die dem angegebenen Filter entsprechen. Ist kein Filter gesetzt, wird die gesamte Tabelle geändert. Verwende `patchOne`, um jeweils nur einen Eintrag zu ändern.

```typescript
await database.query(User).filter({username: 'Peter'}).patch({username: 'Peter2'});

await database.query(User).filter({username: 'User1'}).patchOne({birthdate: new Date});
await database.query(User).filter({username: 'User1'}).patchOne({$inc: {visits: 1}});

await database.query(User).patchMany({visits: 0});
```

## Delete

`deleteMany` löscht alle Einträge in der Datenbank, die dem angegebenen Filter entsprechen.
Ist kein Filter gesetzt, wird die gesamte Tabelle gelöscht. Verwende `deleteOne`, um jeweils nur einen Eintrag zu löschen.

```typescript
const result = await database.query(User)
    .filter({visits: 0})
    .deleteMany();

const result = await database.query(User).filter({id: 4}).deleteOne();
```

Das Ergebnis enthält in `modified` die Anzahl der gelöschten Einträge. Die Primärschlüssel der gelöschten Einträge sind nur mit `returnPrimaryKeys()` verfügbar, da ihr Auslesen den Löschvorgang verlangsamt. Wird `primaryKeys` ohne diese Methode gelesen, wird ein `PrimaryKeysNotReturnedError` geworfen, auch innerhalb von Event-Listenern.

```typescript
const result = await database.query(User)
    .filter({logins: 0})
    .returnPrimaryKeys()
    .deleteMany();
result.primaryKeys; //[{id: 4}, {id: 7}]
```

## Has

Gibt zurück, ob mindestens ein Eintrag in der Datenbank existiert.

```typescript
const userExists: boolean = await database.query(User).filter({username: 'Peter'}).has();
```

## Count

Gibt die Anzahl der Einträge zurück.

```typescript
const userCount: number = await database.query(User).count();
```

## Lift

Das Liften einer Query bedeutet, ihr neue Funktionalität hinzuzufügen. Dies wird üblicherweise entweder von Plugins oder in komplexen Architekturen verwendet, um größere Query-Klassen in mehrere praktische, wiederverwendbare Klassen aufzuteilen.

```typescript
import { FilterQuery, Query } from '@deepkit/orm';

class UserQuery<T extends {birthdate?: Date}> extends Query<T>  {
    hasBirthday() {
        const start = new Date();
        start.setHours(0,0,0,0);
        const end = new Date();
        end.setHours(23,59,59,999);

        return this.filter({$and: [{birthdate: {$gte: start}}, {birthdate: {$lte: end}}]} as FilterQuery<T>);
    }
}

await session.query(User).lift(UserQuery).hasBirthday().find();
```
