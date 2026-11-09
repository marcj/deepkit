# TypeScript Dependency Injection

Deepkit ist ein Dependency-Injection-Container für TypeScript, der ohne Decorators an Ihren Services auskommt. Er löst Konstruktorparameter anhand ihrer TypeScript-Typen auf, einschließlich Interfaces, sodass Ihr Code frei von containerspezifischen Annotationen und Tokens bleibt.

```typescript
import { InjectorContext } from '@deepkit/injector';

interface Mailer {
    send(to: string, text: string): void;
}

class SmtpMailer implements Mailer {
    send(to: string, text: string): void {
        console.log(`Sending "${text}" to ${to}`);
    }
}

class Signup {
    constructor(private mailer: Mailer) {}

    register(email: string): void {
        this.mailer.send(email, 'Welcome');
    }
}

const injector = InjectorContext.forProviders([Signup, SmtpMailer]);
injector.get(Signup).register('peter@example.com');
// Sending "Welcome" to peter@example.com
```

`Signup` hängt vom Interface `Mailer` ab, und der Container findet `SmtpMailer`, weil diese Klasse das Interface implementiert. Um eine andere Implementierung zu verwenden, beispielsweise in einem Test, stellen Sie sie explizit mit `provide<Mailer>({ useClass: TestMailer })` bereit. Eine Abhängigkeit, die niemand bereitstellt, führt zu einem Error mit genauer Ortsangabe: `Undefined dependency "mailer: Mailer" of Signup(?). Type has no provider.`

## Vergleich mit NestJS, InversifyJS und tsyringe

|                                | Deepkit                 | NestJS                     | InversifyJS                 | tsyringe                    |
| ------------------------------ | ----------------------- | -------------------------- | --------------------------- | --------------------------- |
| Decorator an einem Service     | Keiner                  | `@Injectable()`            | `@injectable()`             | `@injectable()`             |
| Abhängigkeit von Interfaces    | Der Interface-Typ       | Token und `@Inject()`      | Token und `@inject()`       | Token und `@inject()`       |
| Typinformationen aus           | Deepkit Type Compiler   | `emitDecoratorMetadata`    | `emitDecoratorMetadata`     | `emitDecoratorMetadata`     |

Deepkit benötigt den [Deepkit Type Compiler](./runtime-types/getting-started.md) in Ihrem Build, da es Ihre Typen zur Laufzeit ausliest. Wie schnell der Container Abhängigkeiten auflöst, ist auf der [Benchmark-Seite](/benchmarks) aufgeführt. Die Installation wird unter [Erste Schritte](./dependency-injection/getting-started.md) beschrieben.

## Was ist Dependency Injection?

Dependency Injection (DI) ist ein Entwurfsmuster, bei dem Klassen und Funktionen ihre Abhängigkeiten _erhalten_. Es folgt dem Prinzip der Inversion of Control (IoC) und hilft dabei, komplexen Code besser zu trennen, um Testbarkeit, Modularität und Übersichtlichkeit deutlich zu verbessern. Obwohl es zur Anwendung des IoC-Prinzips auch andere Entwurfsmuster gibt, etwa das Service-Locator-Pattern, hat sich DI vor allem in Unternehmenssoftware als dominierendes Muster etabliert.

Zur Veranschaulichung des IoC-Prinzips dient folgendes Beispiel:

```typescript
import { HttpClient } from 'http-library';

class UserRepository {
    async getUsers(): Promise<Users> {
        const client = new HttpClient();
        return await client.get('/users');
    }
}
```

Die Klasse UserRepository hat einen HttpClient als Abhängigkeit. Diese Abhängigkeit an sich ist nichts Besonderes, problematisch ist jedoch, dass `UserRepository` den HttpClient selbst erzeugt.
Es scheint eine gute Idee zu sein, die Erzeugung des HttpClient im UserRepository zu kapseln, doch das ist nicht der Fall. Was ist, wenn wir den HttpClient ersetzen möchten? Was ist, wenn wir UserRepository in einem Unit-Test testen möchten, ohne dass echte HTTP-Requests nach außen gehen? Woher wissen wir überhaupt, dass die Klasse einen HttpClient verwendet?

## Inversion of Control

Im Sinne der Inversion of Control (IoC) gibt es die folgende alternative Variante, die den HttpClient als explizite Abhängigkeit im Konstruktor festlegt (auch bekannt als Constructor Injection).

```typescript
class UserRepository {
    constructor(
        private http: HttpClient
    ) {}

    async getUsers(): Promise<Users> {
        return await this.http.get('/users');
    }
}
```

Nun ist nicht mehr UserRepository für die Erzeugung des HttpClient verantwortlich, sondern der Benutzer von UserRepository. Das ist Inversion of Control (IoC). Die Kontrolle wurde umgekehrt bzw. invertiert. Konkret wendet dieser Code Dependency Injection an, denn Abhängigkeiten werden empfangen (injiziert) und nicht mehr selbst erzeugt oder angefordert. Dependency Injection ist nur eine Variante von IoC.

## Service Locator

Neben DI ist auch der Service Locator (SL) eine Möglichkeit, das IoC-Prinzip anzuwenden. Er gilt gemeinhin als Gegenstück zu Dependency Injection, da er Abhängigkeiten anfordert, statt sie zu empfangen. Würde der HttpClient im obigen Code wie folgt angefordert, spräche man von einem Service-Locator-Pattern.

```typescript
class UserRepository {
    async getUsers(): Promise<Users> {
        const client = locator.getHttpClient();
        return await client.get('/users');
    }
}
```

Die Funktion `locator.getHttpClient` kann einen beliebigen Namen haben. Alternativen wären Funktionsaufrufe wie `useContext(HttpClient)`, `getHttpClient()`, `await import("client"),` oder Container-Abfragen wie `container.get(HttpClient)` oder `container.http`. Der Import eines globalen Objekts ist eine etwas andere Variante eines Service Locators, bei der das Modulsystem selbst als Locator dient:

```typescript
import { httpClient } from 'clients'

class UserRepository {
    async getUsers(): Promise<Users> {
        return await httpClient.get('/users');
    }
}
```

All diesen Varianten ist gemeinsam, dass sie die Abhängigkeit HttpClient explizit anfordern und der Code weiß, dass es einen Service-Container gibt. Das koppelt Ihren Code eng an das Framework und ist etwas, das Sie vermeiden sollten, um den Code sauber zu halten.

Die Service-Anforderung kann nicht nur als Standardwert von Properties erfolgen, sondern auch irgendwo mitten im Code. Da „mitten im Code“ bedeutet, dass sie nicht Teil eines Typ-Interfaces ist, bleibt die Verwendung des HttpClient verborgen. Je nachdem, auf welche Weise der HttpClient angefordert wird, kann es mitunter sehr schwierig oder völlig unmöglich sein, ihn durch eine andere Implementierung zu ersetzen. Gerade bei Unit-Tests und im Hinblick auf die Übersichtlichkeit können hier Schwierigkeiten entstehen, sodass der Service Locator mittlerweile in bestimmten Situationen als Anti-Pattern eingestuft wird.

## Dependency Injection

Bei Dependency Injection wird nichts angefordert, sondern die Abhängigkeit wird vom Benutzer explizit bereitgestellt bzw. vom Code empfangen. Der Konsument hat keinen Zugriff auf einen Service-Container und weiß nicht, wie `HttpClient` erzeugt oder abgerufen wird. Im Kern ermöglicht dies, Ihren Code vom IoC-Framework zu entkoppeln und dadurch sauberer zu gestalten.

Der Code deklariert lediglich, dass er einen `HttpClient` als Typ benötigt. Ein wesentliches Unterscheidungsmerkmal und ein Vorteil von Dependency Injection gegenüber dem Service Locator ist, dass Code mit Dependency Injection auch ganz ohne Service-Container und System zur Service-Identifikation einwandfrei funktioniert (Sie müssen Ihrem Service keinen Namen geben). Es handelt sich lediglich um eine Typdeklaration, die auch außerhalb des IoC-Framework-Kontexts funktioniert.

Wie im vorherigen Beispiel zu sehen ist, wurde dort bereits das Dependency-Injection-Pattern angewendet. Konkret ist dort Constructor Injection zu sehen, da die Abhängigkeit im Konstruktor deklariert wird. UserRepository muss nun also wie folgt instanziiert werden.

```typescript
const users = new UserRepository(new HttpClient());
```

Der Code, der UserRepository verwenden möchte, muss auch alle dessen Abhängigkeiten bereitstellen (injizieren). Ob der HttpClient jedes Mal neu erzeugt oder jedes Mal derselbe verwendet werden soll, entscheidet nun der Benutzer der Klasse und nicht mehr die Klasse selbst. Er wird (aus Sicht der Klasse) nicht mehr wie beim Service Locator angefordert oder wie im Ausgangsbeispiel vollständig selbst erzeugt. Diese Umkehrung des Ablaufs hat verschiedene Vorteile:

* Der Code ist leichter zu verstehen, da alle Abhängigkeiten explizit sichtbar sind.
* Der Code ist leichter zu testen, da alle Abhängigkeiten eindeutig sind und bei Bedarf einfach geändert werden können.
* Der Code ist modularer, da Abhängigkeiten einfach ausgetauscht werden können.
* Es fördert das Prinzip der Separation of Concerns, da UserRepository nicht mehr selbst für die Erzeugung sehr komplexer Abhängigkeiten verantwortlich ist.

Doch auch ein offensichtlicher Nachteil ist direkt zu erkennen: Muss ich wirklich alle Abhängigkeiten wie den HttpClient selbst erzeugen oder verwalten? Ja und nein. Ja, es gibt viele Fälle, in denen es völlig legitim ist, die Abhängigkeiten selbst zu verwalten. Das Kennzeichen einer guten API ist, dass Abhängigkeiten nicht ausufern und dass sie selbst dann noch angenehm zu verwenden sind. Bei vielen Anwendungen oder komplexen Bibliotheken kann dies durchaus der Fall sein. Um dem Benutzer eine sehr komplexe Low-Level-API mit vielen Abhängigkeiten vereinfacht zur Verfügung zu stellen, eignet sich das Facade-Pattern hervorragend.

## Dependency Injection Container

Bei komplexeren Anwendungen ist es jedoch nicht notwendig, alle Abhängigkeiten selbst zu verwalten, denn genau dafür gibt es einen sogenannten Dependency-Injection-Container. Dieser erzeugt nicht nur alle Objekte automatisch, sondern „injiziert“ auch die Abhängigkeiten automatisch, sodass ein manueller „new“-Aufruf nicht mehr notwendig ist. Es gibt verschiedene Arten der Injection, etwa Constructor Injection, Method Injection oder Property Injection. So lassen sich auch komplizierte Architekturen mit vielen Abhängigkeiten leicht verwalten.

Einen Dependency-Injection-Container (auch DI-Container oder IoC-Container genannt) bringt Deepkit in `@deepkit/injector` mit oder bereits fertig integriert über App-Module im Deepkit Framework. Der obige Code würde mit einer Low-Level-API aus dem Package `@deepkit/injector` so aussehen.

```typescript
import { InjectorContext } from '@deepkit/injector';

const injector = InjectorContext.forProviders(
    [UserRepository, HttpClient]
);

const userRepo = injector.get(UserRepository);

const users = await userRepo.getUsers();
```

Das Objekt `injector` ist in diesem Fall der Dependency-Injection-Container. Statt „new UserRepository“ zu verwenden, gibt der Container mittels `get(UserRepository)` eine Instanz von UserRepository zurück. Um den Container statisch zu initialisieren, wird der Funktion `InjectorContext.forProviders` eine Liste von Providern übergeben (in diesem Fall einfach die Klassen).
Da es bei DI ausschließlich um das Bereitstellen von Abhängigkeiten geht, werden dem Container die Abhängigkeiten bereitgestellt, daher der Fachbegriff „Provider“.

Es gibt mehrere Arten von Providern: ClassProvider, ValueProvider, ExistingProvider, FactoryProvider. Zusammen ermöglichen sie es, sehr flexible Architekturen mit einem DI-Container abzubilden.

Alle Abhängigkeiten zwischen Providern werden automatisch aufgelöst, und sobald ein `injector.get()`-Aufruf erfolgt, werden die Objekte und Abhängigkeiten erzeugt, gecacht und korrekt entweder als Konstruktorargument übergeben (bekannt als Constructor Injection), als Property gesetzt (bekannt als Property Injection) oder an einen Methodenaufruf übergeben (bekannt als Method Injection).

Um den HttpClient nun gegen einen anderen auszutauschen, kann für HttpClient ein anderer Provider (hier der ValueProvider) definiert werden:

```typescript
const injector = InjectorContext.forProviders([
    UserRepository,
    {provide: HttpClient, useValue: new AnotherHttpClient()},
]);
```

Sobald UserRepository über `injector.get(UserRepository)` angefordert wird, erhält es das Objekt AnotherHttpClient. Alternativ lässt sich hier sehr gut ein ClassProvider verwenden, sodass auch alle Abhängigkeiten von AnotherHttpClient vom DI-Container verwaltet werden.

```typescript
const injector = InjectorContext.forProviders([
    UserRepository,
    {provide: HttpClient, useClass: AnotherHttpClient},
]);
```

Alle Arten von Providern werden im Abschnitt [Dependency Injection Provider](./dependency-injection/providers.md) aufgeführt und erklärt.

An dieser Stelle sei erwähnt, dass der DI-Container von Deepkit nur mit den Runtime Types von Deepkit funktioniert. Das bedeutet, dass jeglicher Code, der Klassen, Typen, Interfaces und Funktionen enthält, vom Deepkit Type Compiler kompiliert werden muss, damit die Typinformationen zur Laufzeit verfügbar sind. Siehe das Kapitel [Runtime Types](./runtime-types.md).

## Dependency Inversion

Das vorherige Beispiel von UserRepository zeigt, dass UserRepository von einer HTTP-Bibliothek auf niedrigerer Ebene abhängt. Zudem wird statt einer Abstraktion (Interface) eine konkrete Implementierung (Klasse) als Abhängigkeit deklariert. Auf den ersten Blick mag dies den objektorientierten Paradigmen entsprechen, kann aber insbesondere in komplexen und großen Architekturen zu Problemen führen.

Eine alternative Variante wäre, die Abhängigkeit HttpClient in eine Abstraktion (Interface) umzuwandeln und somit keinen Code aus einer HTTP-Bibliothek in UserRepository zu importieren.

```typescript
interface HttpClientInterface {
   get(path: string): Promise<any>;
}

class UserRepository {
    constructor(
        private http: HttpClientInterface
    ) {}

    async getUsers(): Promise<Users> {
        return await this.http.get('/users');
    }
}
```

Dies wird als Dependency Inversion Principle bezeichnet. UserRepository hängt nicht mehr direkt von einer HTTP-Bibliothek ab, sondern stützt sich stattdessen auf eine Abstraktion (Interface). Damit erfüllt es zwei grundlegende Ziele dieses Prinzips:

* High-Level-Module sollten nichts aus Low-Level-Modulen importieren.
* Implementierungen sollten auf Abstraktionen (Interfaces) basieren.

Das Zusammenführen der beiden Implementierungen (UserRepository mit einer HTTP-Bibliothek) kann nun über den DI-Container erfolgen.

```typescript
import { InjectorContext } from '@deepkit/injector';
import { HttpClient } from './http-client';
import { UserRepository } from './user-repository';

const injector = InjectorContext.forProviders([
    UserRepository,
    HttpClient,
]);
```

Da der DI-Container von Deepkit abstrakte Abhängigkeiten (Interfaces) wie hier HttpClientInterface auflösen kann, erhält UserRepository automatisch die Implementierung von HttpClient, sofern HttpClient dies mit `class HttpClient implements HttpClientInterface` deklariert.

Implementiert HttpClient das Interface nicht, wirft der DI-Container einen Error (`Undefined dependency "http: HttpClientInterface" of UserRepository(?). Type has no provider.`). Hier ist der Benutzer, der beide Implementierungen zusammenführen möchte, in der Pflicht, eine Lösung zu finden. Beispielsweise könnte hier eine Adapter-Klasse registriert werden, die HttpClientInterface implementiert und die Methodenaufrufe korrekt an HttpClient weiterleitet.

Alternativ kann das HttpClientInterface direkt mit einer konkreten Implementierung bereitgestellt werden.

```typescript
import { InjectorContext, provide } from '@deepkit/injector';
import { HttpClient } from './http-client';
import { UserRepository, HttpClientInterface } from './user-repository';

const injector = InjectorContext.forProviders([
    UserRepository,
    provide<HttpClientInterface>({useClass: HttpClient}),
]);
```

Dabei ist zu beachten, dass das Dependency Inversion Principle zwar in der Theorie seine Vorteile hat, in der Praxis jedoch auch erhebliche Nachteile mit sich bringt. Es führt nicht nur zu mehr Code (da mehr Interfaces geschrieben werden müssen), sondern auch zu mehr Komplexität (da jede Implementierung nun für jede Abhängigkeit ein Interface hat). Dieser Preis lohnt sich erst, wenn die Anwendung eine gewisse Größe erreicht und diese Flexibilität benötigt wird. Wie jedes Entwurfsmuster und jedes Prinzip hat auch dieses ein Kosten-Nutzen-Verhältnis, das vor der Anwendung durchdacht werden sollte.

Entwurfsmuster sollten nicht blind und pauschal selbst für den einfachsten Code eingesetzt werden. Sind jedoch die Voraussetzungen wie eine komplexe Architektur, große Anwendungen oder ein wachsendes Team gegeben, entfalten Dependency Inversion und andere Entwurfsmuster erst ihre wahre Stärke.
