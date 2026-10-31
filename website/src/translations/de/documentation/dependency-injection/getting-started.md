# Erste Schritte

Da Dependency Injection in Deepkit auf Runtime Types basiert, müssen Runtime Types bereits korrekt installiert sein. Siehe [Runtime Type](../runtime-types/getting-started.md).

Wenn dies erfolgreich erledigt ist, kann `@deepkit/injector` installiert werden oder das Deepkit Framework, das die Library bereits unter der Haube verwendet.

```sh
	npm install @deepkit/injector
```

Sobald die Library installiert ist, kann deren API direkt verwendet werden.


## Verwendung

Um Dependency Injection zu verwenden, gibt es drei Möglichkeiten.

* Injector-API (Low Level)
* Module-API
* App-API (Deepkit Framework)

Soll `@deepkit/injector` ohne das Deepkit Framework verwendet werden, werden die ersten beiden Varianten empfohlen.

### Injector-API

Die Injector-API wurde bereits in der [Einführung zu Dependency Injection](../dependency-injection) vorgestellt. Sie zeichnet sich durch eine sehr einfache Nutzung mittels einer einzigen Class `InjectorContext` aus, die einen einzelnen DI-Container erstellt und sich besonders für einfachere Anwendungen ohne Module eignet.

```typescript
import { InjectorContext } from '@deepkit/injector';

const injector = InjectorContext.forProviders([
    UserRepository,
    HttpClient,
]);

const repository = injector.get(UserRepository);
```

Das Objekt `injector` ist in diesem Fall der Dependency-Injection-Container. Die Function `InjectorContext.forProviders` nimmt ein Array von Providern entgegen. Siehe den Abschnitt [Dependency Injection Providers](providers.md), um zu erfahren, welche Werte übergeben werden können.

### Module-API

Eine komplexere API ist die Class `InjectorModule`, mit der Provider in verschiedenen Modulen abgelegt werden können, um pro Module mehrere gekapselte DI-Container zu erstellen. Außerdem ermöglicht dies die Verwendung von Configuration Classes pro Module, wodurch es leichter wird, Konfigurationswerte bereitzustellen, die für die Provider automatisch validiert werden. Module können sich gegenseitig importieren und Provider exportieren, um eine Hierarchie und eine sauber getrennte Architektur aufzubauen.

Diese API sollte verwendet werden, wenn die Anwendung komplexer ist und das Deepkit Framework nicht verwendet wird.

```typescript
import { InjectorModule, InjectorContext } from '@deepkit/injector';

const lowLevelModule = new InjectorModule([HttpClient])
     .addExport(HttpClient);

const rootModule = new InjectorModule([UserRepository])
     .addImport(lowLevelModule);

const injector = new InjectorContext(rootModule);
```

Das Objekt `injector` ist in diesem Fall der Dependency-Injection-Container. Provider können in verschiedene Module aufgeteilt und dann über Modul-Imports an verschiedenen Stellen wieder importiert werden. Dadurch entsteht eine natürliche Hierarchie, die die Hierarchie der Anwendung bzw. Architektur widerspiegelt.
Dem InjectorContext sollte immer das oberste Module in der Hierarchie übergeben werden, auch Root-Module oder App-Module genannt. Der InjectorContext hat dann nur eine vermittelnde Rolle: Aufrufe von `injector.get()` werden schlicht an das Root-Module weitergereicht. Es ist jedoch auch möglich, Provider aus Nicht-Root-Modulen zu erhalten, indem das Module als zweites Argument übergeben wird.

```typescript
const repository = injector.get(UserRepository);

const httpClient = injector.get(HttpClient, lowLevelModule);
```

Alle Nicht-Root-Module sind standardmäßig gekapselt, sodass alle Provider in diesem Module nur für sich selbst verfügbar sind. Soll ein Provider anderen Modulen zur Verfügung stehen, muss dieser Provider exportiert werden. Durch das Exportieren wandert der Provider in das Eltern-Module der Hierarchie und kann so verwendet werden.

Um standardmäßig alle Provider an die oberste Ebene, das Root-Module, zu exportieren, kann die Option `forRoot` verwendet werden. Dadurch können alle Provider von allen anderen Modulen genutzt werden.

```typescript
const lowLevelModule = new InjectorModule([HttpClient])
     .forRoot(); // exportiert alle Provider ins Root-Module
```

### App-API

Sobald das Deepkit Framework verwendet wird, werden Module mit der `@deepkit/app`-API definiert. Diese basiert auf der Module-API, sodass deren Möglichkeiten ebenfalls verfügbar sind. Zusätzlich ist es möglich, mit leistungsfähigen Hooks zu arbeiten und Configuration Loader zu definieren, um noch dynamischere Architekturen abzubilden.

Das Kapitel [Framework-Module](../app/modules.md) beschreibt dies ausführlicher.

```typescript
import { App } from '@deepkit/app';
import { FrameworkModule } from '@deepkit/framework';
import { HttpRouterRegistry, HttpBody } from '@deepkit/http';

interface User {
    username: string;
}

class Service {
    users: User[] = [];
}

const app = new App({
    providers: [Service],
    imports: [new FrameworkModule()],
});

const router = app.get(HttpRouterRegistry);

router.post('/users', (body: HttpBody<User>, service: Service) => {
    service.users.push(body);
});

router.get('/users', (service: Service): Users => {
    return service.users;
});
```