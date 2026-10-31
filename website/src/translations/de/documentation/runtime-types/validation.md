# Validierung

Validierung ist der systematische Prozess, Daten auf Genauigkeit und Integrität zu überprüfen. Dabei geht es nicht nur darum zu prüfen, ob der Datentyp dem erwarteten Typ entspricht, sondern auch, ob zusätzliche vordefinierte Constraints erfüllt sind.

Validierung wird besonders wichtig, wenn man mit Daten aus unsicheren oder nicht vertrauenswürdigen Quellen arbeitet. Eine „unsichere“ Quelle ist eine, bei der Typen oder Inhalte der Daten unvorhersehbar sind und zur Laufzeit potenziell beliebige Werte annehmen können. Typische Beispiele sind Benutzereingaben, Daten aus HTTP-Requests (wie Query-Parameter oder der Body), CLI-Argumente oder Dateien, die in ein Programm eingelesen werden. Solche Daten sind inhärent riskant, da falsche Typen oder Werte Programmfehler verursachen oder sogar Sicherheitslücken einführen können.

Wenn beispielsweise eine Variable eine Zahl speichern soll, ist es entscheidend zu validieren, dass sie tatsächlich einen numerischen Wert enthält. Ein Mismatch kann zu unerwarteten Abstürzen oder Sicherheitsverletzungen führen.

Bei der Gestaltung eines HTTP-Route-Controllers muss etwa die Validierung aller Benutzereingaben Priorität haben, sei es über Query-Parameter, den Request-Body oder andere Wege. Besonders in Umgebungen mit TypeScript ist es wichtig, Type Casts zu vermeiden. Diese Casts können irreführend sein und grundlegende Sicherheitsrisiken einführen.

```typescript
app.post('/user', function(request) {
    const limit = request.body.limit as number;
});
```

Ein häufig auftretender Fehler beim Programmieren sind Type Casts, die zur Laufzeit keine Sicherheit bieten. Wenn Sie beispielsweise eine Variable als Zahl casten, aber ein Benutzer eine Zeichenkette eingibt, wird das Programm dazu verleitet, so zu arbeiten, als wäre die Zeichenkette eine Zahl. Solche Versäumnisse können Systemabstürze verursachen oder ernsthafte Sicherheitsrisiken darstellen. Um diese Risiken zu minimieren, können Entwickler Validatoren und Type Guards nutzen. Zusätzlich können Serializer dabei helfen, Variablen zu konvertieren, etwa indem sie 'limit' in eine Zahl umwandeln. Weitere Einblicke hierzu finden Sie im Abschnitt zur Serialization.

Validierung ist nicht nur eine Option; sie ist ein integraler Bestandteil soliden Software-Designs. Es ist immer klug, auf Nummer sicher zu gehen: lieber zu viel validieren als später unzureichende Prüfungen zu bereuen. Deepkit versteht diese Bedeutung und bietet eine Fülle an Validierungswerkzeugen. Zudem sorgt das High-Performance-Design für minimale Auswirkungen auf die Ausführungszeit. Als Leitprinzip gilt: Setzen Sie umfassende Validierung ein, um Ihre Anwendung zu schützen, auch wenn es sich mitunter redundant anfühlt.

Viele Komponenten von Deepkit, einschließlich des HTTP-Routers, der RPC-Abstraktion und sogar der Datenbankabstraktion, verfügen über eingebaute Validierungssysteme. Diese Mechanismen werden automatisch ausgelöst, was oft die Notwendigkeit manueller Eingriffe eliminiert.


Für ein umfassendes Verständnis, wann und wie automatische Validierung erfolgt, verweisen wir auf die spezifischen Kapitel ([CLI](../app.md), [HTTP](../http.md), [RPC](../rpc.md), [ORM](../orm.md)). 
Machen Sie sich mit den notwendigen Constraints und Datentypen vertraut. Korrekt definierte Parameter erschließen Deepkits automatisches Validierungspotenzial, reduzieren manuelle Arbeit und sorgen für saubereren, sichereren Code.

## Verwendung

Die grundlegende Funktion des Validators besteht darin, einen Wert auf seinen Typ zu prüfen, zum Beispiel, ob ein Wert eine string ist. Es geht nicht darum, was der string enthält, sondern nur um seinen Typ. In TypeScript gibt es viele Typen: string, number, boolean, bigint, objects, classes, interface, generics, mapped types und viele mehr. Aufgrund des leistungsstarken Typsystems von TypeScript steht eine große Vielfalt verschiedener Typen zur Verfügung.

In JavaScript selbst können primitive Typen mit dem Operator `typeof` geprüft werden. Für komplexere Typen wie interfaces, mapped types oder generic set/map ist das nicht mehr so einfach und eine Validator-Bibliothek wie `@deepkit/type` wird notwendig. Deepkit ist die einzige Lösung, die es ermöglicht, alle TypeScript-Typen direkt und ohne Workarounds zu validieren.



In Deepkit kann die Typvalidierung entweder mit der Funktion `validate`, `is` oder `assert` erfolgen.
Die Funktion `is` ist ein sogenannter Type Guard und `assert` ist eine Type Assertion. Beide werden im nächsten Abschnitt erläutert.
Die Funktion `validate` gibt ein Array gefundener Fehler zurück und bei Erfolg ein leeres Array. Jeder Eintrag in diesem Array beschreibt den genauen Fehlercode und die Fehlermeldung sowie den Pfad, wenn komplexere Typen wie Objekte oder Arrays validiert werden.

Alle drei Funktionen werden in etwa auf die gleiche Weise verwendet. Der Typ wird als erster Typargument angegeben oder referenziert und die Daten als erstes Funktionsargument übergeben.

```typescript
import { validate, is, assert } from '@deepkit/type';

const errors = validate<string>('abc'); //[]
const errors = validate<string>(123); //[{code: 'type', message: 'Not a string'}]

if (is<string>(value)) {
    // value ist garantiert eine string
}

function doSomething(value: any) {
    assert<string>(value); //wirft bei ungültigen Daten

    // value ist garantiert eine string
}
```

Wenn Sie mit komplexeren Typen wie classes oder interfaces arbeiten, kann das Array auch mehrere Einträge enthalten.

```typescript
import { validate } from '@deepkit/type';

interface User {
    id: number;
    username: string;
}

validate<User>({id: 1, username: 'Joe'}); //[]

validate<User>(undefined); //[{code: 'type', message: 'Not a object'}]

validate<User>({});
//[
//  {path: 'id', code: 'type', message: 'Not a number'}],
//  {path: 'username', code: 'type', message: 'Not a string'}],
//]
```

Der Validator unterstützt auch tief rekursive Typen. Pfade werden dann mit einem Punkt getrennt.

```typescript
import { validate } from '@deepkit/type';

interface User {
    id: number;
    username: string;
    supervisor?: User;
}

validate<User>({id: 1, username: 'Joe'}); //[]

validate<User>({id: 1, username: 'Joe', supervisor: {}});
//[
//  {path: 'supervisor.id', code: 'type', message: 'Not a number'}],
//  {path: 'supervisor.username', code: 'type', message: 'Not a string'}],
//]
```

Nutzen Sie die Vorteile, die TypeScript bietet. Komplexere Typen wie ein `User` können beispielsweise an mehreren Stellen wiederverwendet werden, ohne sie immer wieder deklarieren zu müssen. Wenn ein `User` ohne seine `id` validiert werden soll, können TypeScript-Utilities verwendet werden, um schnell und effizient abgeleitete Subtypen zu erstellen. Ganz im Sinne von DRY (Don't Repeat Yourself).

```typescript
type UserWithoutId = Omit<User, 'id'>;

validate<UserWithoutId>({username: 'Joe'}); //gültig!
```

Deepkit ist das einzige große Framework, das die Fähigkeit hat, zur Laufzeit auf TypeScripts Typen in dieser Weise zuzugreifen. Wenn Sie Typen im Frontend und Backend verwenden möchten, können Typen in eine separate Datei ausgelagert und überall importiert werden. Nutzen Sie diese Möglichkeit zu Ihrem Vorteil, um den Code effizient und sauber zu halten.

## Type Casts sind unsicher

Ein Type Cast (im Gegensatz zum Type Guard) ist in TypeScript kein Konstrukt zur Laufzeit, sondern wird nur im Typsystem selbst verarbeitet. Es ist kein sicherer Weg, einem unbekannten Datum einen Typ zuzuweisen.

```typescript
const data: any = ...;

const username = data.username as string;

if (username.startsWith('@')) { //könnte abstürzen
}
```

Der Code `as string` ist nicht sicher. Die Variable `data` könnte buchstäblich jeden Wert haben, zum Beispiel `{username: 123}` oder sogar `{}`, mit der Folge, dass `username` kein string ist, sondern etwas völlig anderes. Der Code `username.startsWith('@')` führt dann zu einem Error, sodass im harmloseren Fall das Programm abstürzt und im schlimmsten Fall eine Sicherheitslücke entsteht.
Um zur Laufzeit zu garantieren, dass `data` hier eine Property `username` mit dem Typ string hat, müssen Type Guards verwendet werden.

Type Guards sind Funktionen, die TypeScript einen Hinweis darauf geben, welchen Typ die übergebenen Daten zur Laufzeit garantiert haben. Mit diesem Wissen „verengt“ TypeScript den Typ im weiteren Codeverlauf. Aus `any` kann so auf sichere Weise eine string oder ein anderer Typ werden. Wenn es also Daten gibt, deren Typ nicht bekannt ist (`any` oder `unknown`), hilft ein Type Guard, ihn anhand der Daten selbst genauer einzugrenzen. Allerdings ist der Type Guard nur so sicher wie seine Implementierung. Wenn dabei ein Fehler passiert, kann das schwerwiegende Folgen haben, weil grundlegende Annahmen plötzlich als falsch herausstellen.

<a name="type-guard"></a>

## Type-Guard

Ein Type Guard für den oben verwendeten Typ `User` könnte in der einfachsten Form wie folgt aussehen. Beachten Sie, dass die oben erläuterten Besonderheiten mit NaN hier nicht enthalten sind und dieser Type Guard daher nicht ganz korrekt ist.

```typescript
function isUser(data: any): data is User {
    return 'object' === typeof data
           && 'number' === typeof data.id
           && 'string' === typeof data.username;
}

isUser({}); //false

isUser({id: 1, username: 'Joe'}); //true
```

Ein Type Guard gibt immer ein boolean zurück und wird üblicherweise direkt in einer If-Operation verwendet.

```typescript
const data: any = await fetch('/user/1');

if (isUser(data)) {
    data.id; //kann sicher zugegriffen werden und ist eine number
}
```

Für jeden Type Guard eine eigene Funktion zu schreiben, insbesondere für komplexere Typen, und diese dann jedes Mal anzupassen, wenn sich ein Typ ändert, ist extrem mühsam, fehleranfällig und ineffizient. Daher stellt Deepkit die Funktion `is` bereit, die automatisch einen Type Guard für jeden TypeScript-Typ liefert. Diese berücksichtigt dann auch automatisch Besonderheiten wie das oben erwähnte Problem mit NaN. Die Funktion `is` macht das Gleiche wie `validate`, gibt aber statt eines Arrays von Fehlern einfach ein boolean zurück.

```typescript
import { is } from '@deepkit/type';

is<string>('abc'); //true
is<string>(123); //false


const data: any = await fetch('/user/1');

if (is<User>(data)) {
    //data ist jetzt garantiert vom Typ User
}
```

Ein häufig verwendetes Muster ist, bei fehlerhafter Validierung direkt einen Error zurückzugeben, sodass nachfolgender Code nicht ausgeführt wird. Dies kann an verschiedenen Stellen verwendet werden, ohne den gesamten Codefluss zu ändern.

```typescript
function addUser(data: any): void {
    if (!is<User>(data)) throw new TypeError('No user given');

    //data ist jetzt garantiert vom Typ User
}
```

Alternativ kann eine TypeScript Type Assertion verwendet werden. Die Funktion `assert` wirft automatisch einen Error, wenn die übergebenen Daten nicht korrekt zu einem Typ validieren. Die spezielle Signatur der Funktion, die TypeScript Type Assertions auszeichnet, hilft TypeScript, die übergebene Variable automatisch zu verengen.

```typescript
import { assert } from '@deepkit/type';

function addUser(data: any): void {
    assert<User>(data); //wirft bei ungültigen Daten

    //data ist jetzt garantiert vom Typ User
}
```

Auch hier gilt: Nutzen Sie die Vorteile, die TypeScript bietet. Typen können mithilfe verschiedener TypeScript-Funktionen wiederverwendet oder angepasst werden.

<a name="error-reporting"></a>

## Fehlermeldungen

Die Funktionen `is`, `assert` und `validates` liefern ein boolean als Ergebnis. Um genaue Informationen über fehlgeschlagene Validierungsregeln zu erhalten, kann die Funktion `validate` verwendet werden. Sie gibt ein leeres Array zurück, wenn alles erfolgreich validiert wurde. Im Fehlerfall enthält das Array einen oder mehrere Einträge mit folgender Struktur:

```typescript
interface ValidationErrorItem {
    /**
     * Der Pfad zur Property. Kann ein tiefer Pfad sein, getrennt durch Punkt.
     */
    path: string;
    /**
     * Ein kleingeschriebener Fehlercode, der zur Identifikation und Übersetzung genutzt werden kann.
     */
    code: string,
    /**
     * Freitext der Fehlermeldung.
     */
    message: string,
}
```

Die Funktion erhält als erstes Typargument jeden beliebigen TypeScript-Typ und als erstes Argument die zu validierenden Daten.

```typescript
import { validate } from '@deepkit/type';

validate<string>('Hello'); //[]
validate<string>(123); //[{code: 'type', message: 'Not a string', path: ''}]

validate<number>(123); //[]
validate<number>('Hello'); //[{code: 'type', message: 'Not a number', path: ''}]
```

Komplexe Typen wie interfaces, classes oder generics können ebenfalls verwendet werden.

```typescript
import { validate } from '@deepkit/type';

interface User {
    id: number;
    username: string;
}

validate<User>(undefined); //[{code: 'type', message: 'Not an object', path: ''}]
validate<User>({}); //[{code: 'type', message: 'Not a number', path: 'id'}]
validate<User>({id: 1}); //[{code: 'type', message: 'Not a string', path: 'username'}]
validate<User>({id: 1, username: 'Peter'}); //[]
```

<a name="constraints"></a>

## Constraints

Zusätzlich zur Typprüfung können einem Typ weitere beliebige Constraints hinzugefügt werden. Die Validierung dieser zusätzlichen inhaltlichen Constraints erfolgt automatisch, nachdem die Typen selbst validiert wurden. Dies geschieht in allen Validierungsfunktionen wie `validate`, `is` und `assert`.
Eine Constraint kann zum Beispiel sein, dass ein string eine bestimmte minimale oder maximale Länge haben muss. Diese Constraints werden über [Type Annotations](./types.md) zu den eigentlichen Typen hinzugefügt. Es gibt eine ganze Reihe von Annotations, die verwendet werden können. Eigene Annotations können bei erweitertem Bedarf beliebig definiert und genutzt werden.

```typescript
import { MinLength } from '@deepkit/type';

type Username = string & MinLength<3>;
```

Mit `&` können beliebig viele Type Annotations zum eigentlichen Typ hinzugefügt werden. Das Ergebnis, hier `username`, kann dann in allen Validierungsfunktionen, aber auch in anderen Typen verwendet werden.

```typescript
import { is } from '@deepkit/type';

is<Username>('ab'); //false, weil die Mindestlänge 3 ist
is<Username>('Joe'); //true

interface User {
  id: number;
  username: Username;
}

is<User>({id: 1, username: 'ab'}); //false, weil die Mindestlänge 3 ist
is<User>({id: 1, username: 'Joe'}); //true
```

Die Funktion `validate` liefert hilfreiche Fehlermeldungen, die von den Constraints kommen.

```typescript
import { validate } from '@deepkit/type';

const errors = validate<Username>('xb');
//[{ code: 'minLength', message: `Min length is 3` }]
```

Diese Informationen können zum Beispiel hervorragend auch automatisch in einem Formular dargestellt und mittels `code` übersetzt werden. Durch den vorhandenen Pfad für Objekte und Arrays können Felder in einem Formular die passende Fehlermeldung herausfiltern und anzeigen.

```typescript
validate<User>({id: 1, username: 'ab'});
//{ path: 'username', code: 'minLength', message: `Min length is 3` }
```

Ein häufig nützlicher Anwendungsfall ist auch, eine E-Mail mit einem RegExp-Constraint zu definieren. Sobald der Typ definiert ist, kann er überall verwendet werden.

```typescript
export const emailRegexp = /^\S+@\S+$/;
type Email = string & Pattern<typeof emailRegexp>

is<Email>('abc'); //false
is<Email>('joe@example.com'); //true
```

Es können beliebig viele Constraints hinzugefügt werden.

```typescript
type ID = number & Positive & Maximum<1000>;

is<ID>(-1); //false
is<ID>(123); //true
is<ID>(1001); //true
```

### Constraint-Typen

#### Validate<typeof myValidator>

Validierung mit einer benutzerdefinierten Validator-Funktion. Weitere Informationen siehe nächster Abschnitt Custom Validator.

```typescript
import { ValidatorError, Validate } from '@deepkit/type';

function startsWith(v: string) {
    return (value: any) => {
        const valid = 'string' === typeof value && value.startsWith(v);
        return valid ? undefined : new ValidatorError('startsWith', `Does not start with ${v}`);
    };
}

type T = string & Validate<typeof startsWith, 'abc'>;
```

#### Pattern<typeof myRegexp>

Definiert einen regulären Ausdruck als Validierungs-Pattern. Wird normalerweise für E-Mail-Validierung oder komplexere Inhaltsvalidierungen verwendet.

```typescript
import { Pattern } from '@deepkit/type';

const myRegExp = /[a-zA-Z]+/;
type T = string & Pattern<typeof myRegExp>
```

#### Alpha

Validierung für Alpha-Zeichen (a–Z).

```typescript
import { Alpha } from '@deepkit/type';

type T = string & Alpha;
```


#### Alphanumeric

Validierung für alphanumerische Zeichen.

```typescript
import { Alphanumeric } from '@deepkit/type';

type T = string & Alphanumeric;
```


#### Ascii

Validierung für ASCII-Zeichen.

```typescript
import { Ascii } from '@deepkit/type';

type T = string & Ascii;
```


#### Decimal<number, number>

Validierung für strings, die eine Dezimalzahl repräsentieren, wie 0.1, .3, 1.1, 1.00003, 4.0, etc.

```typescript
import { Decimal } from '@deepkit/type';

type T = string & Decimal<1, 2>;
```


#### MultipleOf<number>

Validierung von Zahlen, die ein Vielfaches der angegebenen Zahl sind.

```typescript
import { MultipleOf } from '@deepkit/type';

type T = number & MultipleOf<3>;
```


#### MinLength<number>, MaxLength<number>, MinMax<number, number>

Validierung für minimale/maximale Länge bei Arrays oder strings.

```typescript
import { MinLength, MaxLength, MinMax } from '@deepkit/type';

type T = any[] & MinLength<1>;

type T = string & MinLength<3> & MaxLength<16>;

type T = string & MinMax<3, 16>;
```

#### Includes<'any'> Excludes<'any'>

Validierung dafür, dass ein Array-Item oder Substring enthalten/ausgeschlossen ist

```typescript
import { Includes, Excludes } from '@deepkit/type';

type T = any[] & Includes<'abc'>;
type T = string & Excludes<' '>;
```

#### Minimum<number>, Maximum<number>

Validierung für einen Wert, der mindestens oder höchstens eine angegebene Zahl ist. Entspricht `>=` und `<=`.

```typescript
import { Minimum, Maximum, MinMax } from '@deepkit/type';

type T = number & Minimum<10>;
type T = number & Minimum<10> & Maximum<1000>;

type T = number & MinMax<10, 1000>;
```

#### ExclusiveMinimum<number>, ExclusiveMaximum<number>

Wie Minimum/Maximum, schließt aber den Wert selbst aus. Entspricht `>` und `<`.

```typescript
import { ExclusiveMinimum, ExclusiveMaximum } from '@deepkit/type';

type T = number & ExclusiveMinimum<10>;
type T = number & ExclusiveMinimum<10> & ExclusiveMaximum<1000>;
```


#### Positive, Negative, PositiveNoZero, NegativeNoZero

Validierung dafür, dass ein Wert positiv oder negativ ist.

```typescript
import { Positive, Negative } from '@deepkit/type';

type T = number & Positive;
type T = number & Negative;
```


#### BeforeNow, AfterNow

Validierung für einen Datumswert im Vergleich zu jetzt (new Date).

```typescript
import { BeforeNow, AfterNow } from '@deepkit/type';

type T = Date & BeforeNow;
type T = Date & AfterNow;
```

#### Email

Einfache RegExp-Validierung von E-Mails via `/^\S+@\S+$/`. Ist automatisch ein `string`, daher kein `string & Email` nötig.

```typescript
import { Email } from '@deepkit/type';

type T = Email;
```

#### integer

Stellt sicher, dass die number eine Ganzzahl im korrekten Bereich ist. Ist automatisch eine `number`, daher kein `number & integer` nötig.

```typescript
import { integer, uint8, uint16, uint32, 
    int8, int16, int32 } from '@deepkit/type';

type T = integer;
type T = uint8;
type T = uint16;
type T = uint32;
type T = int8;
type T = int16;
type T = int32;
```

Siehe Special types: integer/floats für weitere Informationen

### Custom Validator

Wenn die integrierten Validatoren nicht ausreichen, können benutzerdefinierte Validierungsfunktionen erstellt und über den `Validate`-Decorator verwendet werden.

```typescript
import { ValidatorError, Validate, Type, validates, validate }
  from '@deepkit/type';

function titleValidation(value: string, type: Type) {
    value = value.trim();
    if (value.length < 5) {
        return new ValidatorError('tooShort', 'Value is too short');
    }
}

interface Article {
    id: number;
    title: string & Validate<typeof titleValidation>;
}

console.log(validates<Article>({id: 1})); //false
console.log(validates<Article>({id: 1, title: 'Peter'})); //true
console.log(validates<Article>({id: 1, title: ' Pe     '})); //false
console.log(validate<Article>({id: 1, title: ' Pe     '})); //[ValidationErrorItem]
```

Beachten Sie, dass Ihre benutzerdefinierte Validierungsfunktion ausgeführt wird, nachdem alle integrierten Typ-Validatoren aufgerufen wurden. Wenn ein Validator fehlschlägt, werden alle nachfolgenden Validatoren für den aktuellen Typ übersprungen. Pro Typ ist nur ein Fehler möglich.

#### Generischer Validator

In der Validator-Funktion steht das Typobjekt zur Verfügung, mit dem weitere Informationen über den Typ abgerufen werden können, der den Validator verwendet. Es besteht auch die Möglichkeit, eine beliebige Validator-Option zu definieren, die dem Validate-Typ übergeben werden muss und den Validator konfigurierbar macht. Mit diesen Informationen und ihren Parent-Referenzen können leistungsfähige generische Validatoren erstellt werden.

```typescript
import { ValidatorError, Validate, Type, is, validate }
  from '@deepkit/type';

function startsWith(value: any, type: Type, chars: string) {
    const valid = 'string' === typeof value && value.startsWith(chars);
    if (!valid) {
        return new ValidatorError('startsWith', 'Does not start with ' + chars)
    }
}

type MyType = string & Validate<typeof startsWith, 'a'>;

is<MyType>('aah'); //true
is<MyType>('nope'); //false

const errors = validate<MyType>('nope');
//[{ path: '', code: 'startsWith', message: `Does not start with a` }]);
```