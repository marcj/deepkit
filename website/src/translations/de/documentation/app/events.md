# Event-System

Ein Event-System ermöglicht es Application-Komponenten innerhalb desselben Prozesses, durch Senden und Lauschen von Events zu kommunizieren. Dies unterstützt die Modularisierung des Codes, indem der Nachrichtenaustausch zwischen Functions erleichtert wird, die nicht unbedingt direkt voneinander wissen.

Die Application oder Library bietet die Möglichkeit, an bestimmten Stellen während ihres Ablaufs zusätzliche Functions auszuführen. Diese zusätzlichen Functions registrieren sich als sogenannte "Event Listener".

Ein Event kann verschiedene Formen annehmen:

- Die Application startet oder fährt herunter.
- Ein neuer User wird erstellt oder gelöscht.
- Ein Error wird geworfen.
- Eine neue HTTP-Request wird empfangen.

Das Deepkit Framework und seine zugehörigen Libraries bieten eine Reihe von Events, auf die Nutzer lauschen und reagieren können. Nutzer haben jedoch auch die Flexibilität, beliebig viele benutzerdefinierte Events zu erstellen, um die Application modular zu erweitern.

## Verwendung

Wenn du eine Deepkit App verwendest, ist das Event-System bereits enthalten und einsatzbereit.

```typescript
import { App, onAppExecute } from '@deepkit/app';

const app = new App();

app.listen(onAppExecute, async (event) => {
    console.log('MyEvent triggered!');
});

app.run();
```

Events können entweder über die `listen()`-Methode oder über eine Class mit dem `@eventDispatcher.listen` Decorator registriert werden:

```typescript
import { App, onAppExecute } from '@deepkit/app';
import { eventDispatcher } from '@deepkit/event';

class MyListener {
    @eventDispatcher.listen(onAppExecute)
    onMyEvent(event: typeof onAppExecute.event) {
        console.log('MyEvent triggered!');
    }
}

const app = new App({
    listeners: [MyListener],
});
app.run();
```

## Event Token

Im Kern von Deepkits Event-System stehen Event Tokens. Dabei handelt es sich um einzigartige Objekte, die sowohl die Event-ID als auch den Typ des Events spezifizieren. Ein Event Token erfüllt zwei Hauptzwecke:

- Es fungiert als Auslöser für ein Event.
- Es dient zum Lauschen auf das Event, das es auslöst.

Wenn ein Event über ein Event Token initiiert wird, gilt der Eigentümer dieses Tokens effektiv als Quelle des Events. Das Token bestimmt die mit dem Event verknüpften Daten und legt fest, ob asynchrone Event Listener verwendet werden können.

```typescript
import { EventToken } from '@deepkit/event';

const MyEvent = new EventToken('my-event');

app.listen(MyEvent, (event) => {
    console.log('MyEvent triggered!');
});

// Auslösen über App-Referenz
await app.dispatch(MyEvent);

// Oder den EventDispatcher verwenden; der DI-Container der App injiziert ihn automatisch
app.command('test', async (dispatcher: EventDispatcher) => {
    await dispatcher.dispatch(MyEvent);
});
```

### Benutzerdefinierte Event-Daten erstellen:

Mit `DataEventToken` aus @deepkit/event:

```typescript
import { DataEventToken } from '@deepkit/event';

class User {
}

const MyEvent = new DataEventToken<User>('my-event');
```

BaseEvent erweitern:

```typescript
class MyEvent extends BaseEvent {
    user: User = new User;
}

const MyEventToken = new EventToken<MyEvent>('my-event');
```

## Funktionale Listener

Funktionale Listener ermöglichen es, einen einfachen Function-Callback direkt beim Dispatcher zu registrieren. So geht's:

```typescript
app.listen(MyEvent, (event) => {
    console.log('MyEvent triggered!');
});
```

Wenn du zusätzliche Arguments wie `logger: Logger` einführen möchtest, werden sie dank der Dependency Injection und Deepkits Runtime Type Reflection automatisch injiziert.

```typescript
app.listen(MyEvent, (event, logger: Logger) => {
    console.log('MyEvent triggered!');
});
```

Beachte, dass das erste Argument das Event selbst sein muss. Dieses Argument kann nicht weggelassen werden.

Wenn du `@deepkit/app` verwendest, kannst du auch app.listen() verwenden, um einen funktionalen Listener zu registrieren.

```typescript
import { App } from '@deepkit/app';

new App()
    .listen(MyEvent, (event) => {
        console.log('MyEvent triggered!');
    })
    .run();
```

## Klassenbasierte Listener

Class Listener sind Classes mit Decorators. Sie bieten eine strukturierte Möglichkeit, auf Events zu lauschen.

```typescript
import { App } from '@deepkit/app';

class MyListener {
    @eventDispatcher.listen(UserAdded)
    onUserAdded(event: typeof UserAdded.event) {
        console.log('User added!', event.user.username);
    }
}

new App({
    listeners: [MyListener],
}).run();
```

Für Class Listener funktioniert Dependency Injection entweder über die Method Arguments oder den Constructor.

## Dependency Injection

Das Event-System von Deepkit verfügt über einen leistungsfähigen Dependency-Injection-Mechanismus. Bei funktionalen Listenern werden zusätzliche Arguments dank des Runtime Type Reflection-Systems automatisch injiziert. Ebenso unterstützen klassenbasierte Listener Dependency Injection entweder über den Constructor oder über Method Arguments.

Beispielsweise wird bei einem funktionalen Listener die passende Logger-Instanz automatisch bereitgestellt, wenn du ein Argument wie `logger: Logger` hinzufügst und die Function aufgerufen wird.

```typescript
import { App } from '@deepkit/app';
import { Logger } from '@deepkit/logger';

new App()
    .listen(MyEvent, (event, logger: Logger) => {
        console.log('MyEvent triggered!');
    })
    .run();
```

## Event Propagation

Jedes Event-Objekt verfügt über eine stop()-Function, mit der du die Propagation des Events steuern kannst. Wenn ein Event angehalten wird, werden keine nachfolgenden Listener (in der Reihenfolge, in der sie hinzugefügt wurden) mehr ausgeführt. Dies ermöglicht eine fein granulare Kontrolle über die Ausführung und Verarbeitung von Events, insbesondere in Szenarien, in denen bestimmte Bedingungen das Anhalten der Event-Verarbeitung erfordern.

Zum Beispiel:

```typescript
dispatcher.listen(MyEventToken, (event) => {
    if (someCondition) {
        event.stop();
    }
    // Weitere Verarbeitung
});
```

Mit dem Event-System des Deepkit Frameworks können Developer modular, skalierbar und wartbar entwickeln. Das Verständnis des Event-Systems bietet die Flexibilität, das Verhalten der Application an bestimmte Events oder Bedingungen anzupassen.

## Framework-Events

Das Deepkit Framework selbst stellt mehrere Events des Application Servers bereit, auf die du lauschen kannst.

_Funktionaler Listener_

```typescript
import { onServerMainBootstrap } from '@deepkit/framework';
import { onAppExecute } from '@deepkit/app';

new App({
    imports: [new FrameworkModule]
})
    .listen(onAppExecute, (event) => {
        console.log('Command about to execute');
    })
    .listen(onServerMainBootstrap, (event) => {
        console.log('Server started');
    })
    .run();
```

| Name                        | Beschreibung                                                                                                                     |
|-----------------------------|----------------------------------------------------------------------------------------------------------------------------------|
| onServerBootstrap           | Wird nur einmal beim Bootstrap des Application Servers aufgerufen (für Main Process und Worker).                                 |
| onServerBootstrapDone       | Wird nur einmal beim Bootstrap des Application Servers aufgerufen (für Main Process und Worker), sobald der Application Server gestartet wurde. |
| onServerMainBootstrap       | Wird nur einmal beim Bootstrap des Application Servers aufgerufen (im Main Process).                                             |
| onServerMainBootstrapDone   | Wird nur einmal beim Bootstrap des Application Servers aufgerufen (im Main Process), sobald der Application Server gestartet wurde. |
| onServerWorkerBootstrap     | Wird nur einmal beim Bootstrap des Application Servers aufgerufen (im Worker Process).                                           |
| onServerWorkerBootstrapDone | Wird nur einmal beim Bootstrap des Application Servers aufgerufen (im Worker Process), sobald der Application Server gestartet wurde. |
| onServerShutdownEvent       | Wird aufgerufen, wenn der Application Server herunterfährt (im Master Process und in jedem Worker).                              |
| onServerMainShutdown        | Wird aufgerufen, wenn der Application Server im Main Process herunterfährt.                                                      |
| onServerWorkerShutdown      | Wird aufgerufen, wenn der Application Server im Worker Process herunterfährt.                                                    |
| onAppExecute                | Wenn ein Command gleich ausgeführt wird.                                                                                         |
| onAppExecuted               | Wenn ein Command erfolgreich ausgeführt wurde.                                                                                   |
| onAppError                  | Wenn ein Command nicht ausgeführt werden konnte.                                                                                 |
| onAppShutdown               | Wenn die Application kurz vor dem Herunterfahren steht.                                                                          |

## Low-Level-API

Unten ein Beispiel der Low-Level-API aus @deepkit/event. Wenn du die Deepkit App verwendest, werden Event Listener nicht direkt über den EventDispatcher registriert, sondern über Modules. Du kannst die Low-Level-API aber dennoch verwenden, wenn du möchtest.

```typescript
import { EventDispatcher, EventToken } from '@deepkit/event';

// Das erste Argument kann ein Injector-Kontext sein, um Dependencies für Dependency Injection aufzulösen
const dispatcher = new EventDispatcher();
const MyEvent = new EventToken('my-event');

dispatcher.listen(MyEvent, (event) => {
    console.log('MyEvent triggered!');
});
dispatcher.dispatch(MyEvent);

```

### Installation

Das Event-System ist in @deepkit/app enthalten. Wenn du es standalone verwenden möchtest, kannst du es manuell installieren:

Siehe [Event](../package/event.md) für Installationsanweisungen.
