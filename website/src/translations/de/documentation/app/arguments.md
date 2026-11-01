# Argumente & Flags

Kommandoargumente im Terminal Ihres Kommandos sind einfach reguläre Argumente der `execute`-Methode bzw. der Funktion. Sie werden automatisch auf die Kommandozeilenargumente abgebildet.
Wenn Sie einen Parameter als optional markieren, muss er nicht übergeben werden. Wenn er einen Default-Wert besitzt, muss er ebenfalls nicht übergeben werden.

Abhängig vom Typ (string, number, union, etc.) wird der übergebene Wert automatisch deserialisiert und validiert.

```typescript
import { cli } from '@deepkit/app';

//funktional
new App().command('test', (name: string) => {
    console.log('Hello', name);
});

//Klasse
@cli.controller('test')
class TestCommand {
    async execute(name: string) {
        console.log('Hello', name);
    }
}
```

Wenn Sie dieses Kommando jetzt ausführen, ohne den Parameter name anzugeben, wird ein Fehler ausgegeben:

```sh
$ ts-node app.ts test
RequiredArgsError: Missing 1 required arg:
name
```

Mit `--help` erhalten Sie weitere Informationen über die erforderlichen Argumente:

```sh
$ ts-node app.ts test --help
USAGE
  $ ts-node-script app.ts test NAME
```

Sobald der Name als Argument übergeben wird, wird das Kommando ausgeführt und der Name korrekt übergeben.

```sh
$ ts-node app.ts test "beautiful world"
Hello beautiful world
```

Jeder primitive Parametertyp wie string, number, boolean, String-Literale, Unions davon sowie Arrays davon werden automatisch als CLI-Argumente verwendet
und automatisch validiert und deserialisiert. Die Reihenfolge der Parameter bestimmt die Reihenfolge der CLI-Argumente. Sie können beliebig viele Parameter hinzufügen.

Sobald ein komplexes Objekt (Interface, Klasse, Objekt-Literal) definiert wird, wird es als Service-Abhängigkeit behandelt
und der Dependency Injection Container versucht, es aufzulösen. Siehe das Kapitel [Dependency Injection](dependency-injection.md) für weitere Informationen.

### Mehrere Werte

Ein als Array typisiertes Argument nimmt alle verbleibenden Positionsargumente auf. Jeder Wert wird deserialisiert und gegen den Elementtyp validiert.
Argumente nach dem Array behalten ihren Wert, sodass ein Kommando wie `cp <files...> <target>` wie erwartet funktioniert.

```typescript
new App().command('copy', (files: string[], target: string) => {
    console.log('copy', files, 'to', target);
});

new App().command('delete', (ids: number[]) => {
    console.log('delete', ids);
});
```

```sh
$ ts-node app.ts copy a.txt b.txt backup/
copy [ 'a.txt', 'b.txt' ] to backup/

$ ts-node app.ts delete 1 2 3
delete [ 1, 2, 3 ]

$ ts-node app.ts delete 1 two
Invalid value for argument ids: 1,two. Cannot convert two to number [type]
```

Ein erforderliches Array-Argument benötigt mindestens einen Wert. Mit einem Default-Wert, z. B. `ids: number[] = []`, ist es optional.

## Flags

Flags sind eine weitere Möglichkeit, Werte an Ihr Kommando zu übergeben. Meistens sind diese optional, müssen es aber nicht sein. Parameter, die mit dem Typ `Flag` dekoriert sind, können über `--name value` oder `--name=value` übergeben werden.

```typescript
import { Flag } from '@deepkit/app';

//funktional
new App().command('test', (id: number & Flag) => {
    console.log('id', name);
});

//Klasse
class TestCommand {
    async execute(id: number & Flag) {
        console.log('id', id);
    }
}
```

```sh
$ ts-node app.ts test --help
USAGE
  $ ts-node app.ts test

OPTIONS
  --id=id  (required)
```

In der Hilfeansicht sehen Sie unter "OPTIONS", dass ein `--id`-Flag erforderlich ist. Wenn Sie dieses Flag korrekt angeben, erhält das Kommando diesen Wert.

```sh
$ ts-node app.ts test --id 23
id 23

$ ts-node app.ts test --id=23
id 23
```

### Boolean-Flags

Flags haben den Vorteil, dass sie auch als wertloses Flag verwendet werden können, um beispielsweise ein bestimmtes Verhalten zu aktivieren. Sobald ein Parameter als optionaler Boolean markiert ist, wird dieses Verhalten aktiviert.

```typescript
import { Flag } from '@deepkit/app';

//funktional
new App().command('test', (remove: boolean & Flag = false) => {
    console.log('delete?', remove);
});

//Klasse
class TestCommand {
    async execute(remove: boolean & Flag = false) {
        console.log('delete?', remove);
    }
}
```

```sh
$ ts-node app.ts test
delete? false

$ ts-node app.ts test --remove
delete? true
```

### Mehrfache Flags

Um mehrere Werte an dasselbe Flag zu übergeben, kann ein Flag als Array markiert werden.

```typescript
import { Flag } from '@deepkit/app';

//funktional
new App().command('test', (id: number[] & Flag = []) => {
    console.log('ids', id);
});

//Klasse
class TestCommand {
    async execute(id: number[] & Flag = []) {
        console.log('ids', id);
    }
}
```

```sh
$ ts-node app.ts test
ids: []

$ ts-node app.ts test --id 12
ids: [12]

$ ts-node app.ts test --id 12 --id 23
ids: [12, 23]
```

### Einzelzeichen-Flags

Damit ein Flag auch als einzelnes Zeichen übergeben werden kann, kann `Flag<{char: 'x'}>` verwendet werden.

```typescript
import { Flag } from '@deepkit/app';

//funktional
new App().command('test', (output: string & Flag<{char: 'o'}>) => {
    console.log('output: ', output);
});

//Klasse
class TestCommand {
    async execute(output: string & Flag<{char: 'o'}>) {
        console.log('output: ', output);
    }
}
```

```sh
$ ts-node app.ts test --help
USAGE
  $ ts-node app.ts test

OPTIONS
  -o, --output=output  (required)


$ ts-node app.ts test --output test.txt
output: test.txt

$ ts-node app.ts test -o test.txt
output: test.txt
```

## Optional / Default

Die Signatur der Methode/Funktion legt fest, welche Argumente oder Flags optional sind. Wenn der Parameter im Typsystem optional ist, muss der Benutzer ihn nicht angeben.

```typescript

//funktional
new App().command('test', (name?: string) => {
    console.log('Hello', name || 'nobody');
});

//Klasse
class TestCommand {
    async execute(name?: string) {
        console.log('Hello', name || 'nobody');
    }
}
```

```sh
$ ts-node app.ts test
Hello nobody
```

Dasselbe gilt für Parameter mit einem Default-Wert:

```typescript
//funktional
new App().command('test', (name: string = 'body') => {
    console.log('Hello', name);
});

//Klasse
class TestCommand {
    async execute(name: string = 'body') {
        console.log('Hello', name);
    }
}
```

```sh
$ ts-node app.ts test
Hello nobody
```

Dies gilt in gleicher Weise auch für Flags.


## Serialisierung / Validierung

Alle Argumente und Flags werden automatisch anhand ihrer Typen deserialisiert, validiert und können mit zusätzlichen Einschränkungen versehen werden.

So ist bei Argumenten, die als number definiert sind, im Controller immer garantiert, dass es sich um echte Zahlen handelt, obwohl das Kommandozeilen-Interface auf Text und somit auf Strings basiert.

```typescript
//funktional
new App().command('test', (id: number) => {
    console.log('id', id, typeof id);
});

//Klasse
class TestCommand {
    async execute(id: number) {
        console.log('id', id, typeof id);
    }
}
```

```sh
$ ts-node app.ts test 123
id 123 number
```

Zusätzliche Einschränkungen können mit den Typannotationen aus `@deepkit/type` definiert werden.

```typescript
import { Positive } from '@deepkit/type';
//funktional
new App().command('test', (id: number & Positive) => {
    console.log('id', id, typeof id);
});

//Klasse
class TestCommand {
    async execute(id: number & Positive) {
        console.log('id', id, typeof id);
    }
}
```

Der Typ `Postive` bei `id` gibt an, dass nur positive Zahlen erlaubt sind. Übergibt der Benutzer nun eine negative Zahl, wird der Code gar nicht erst ausgeführt und eine Fehlermeldung angezeigt.

```sh
$ ts-node app.ts test -123
Validation error in id: Number needs to be positive [positive]
```

Diese zusätzliche Validierung, die sehr einfach umzusetzen ist, macht das Kommando deutlich robuster gegenüber fehlerhaften Eingaben. Siehe das Kapitel [Validierung](../runtime-types/validation.md) für weitere Informationen.

## Beschreibung

Um ein Flag oder Argument zu beschreiben, verwenden Sie den Kommentar-Decorator `@description`.

```typescript
import { Positive } from '@deepkit/type';

class TestCommand {
    async execute(
        /** @description The users identifier */
        id: number & Positive,
        /** @description Delete the user? */
        remove: boolean = false
    ) {
        console.log('id', id, typeof id);
    }
}
```

In der Hilfeansicht erscheint diese Beschreibung nach dem Flag bzw. Argument:

```sh
$ ts-node app.ts test --help
USAGE
  $ ts-node app.ts test ID

ARGUMENTS
  ID  The users identifier

OPTIONS
  --remove  Delete the user?
```
