# Scopes

Standardmäßig sind alle Provider des DI-Containers Singletons und werden daher nur einmal instanziiert. Das bedeutet, dass es im Beispiel von UserRepository während der gesamten Laufzeit stets nur eine einzige Instanz von UserRepository gibt. Zu keinem Zeitpunkt wird eine zweite Instanz erzeugt, es sei denn, der Benutzer tut dies manuell mit dem "new"-Schlüsselwort.

Es gibt jedoch verschiedene Anwendungsfälle, in denen ein Provider nur für kurze Zeit oder nur während eines bestimmten Ereignisses instanziiert werden soll. Ein solches Ereignis könnte z. B. eine HTTP-Request oder ein RPC-Call sein. Das würde bedeuten, dass für jedes Ereignis eine neue Instanz erstellt wird und diese, sobald sie nicht mehr verwendet wird, automatisch entfernt wird (durch den Garbage Collector).

Eine HTTP-Request ist ein klassisches Beispiel für einen Scope. Beispielsweise können Provider wie eine Session, ein User-Objekt oder andere request-bezogene Provider diesem Scope zugeordnet werden. Um einen Scope zu erstellen, wählen Sie einfach einen beliebigen Scope-Namen und geben Sie ihn anschließend bei den Providern an.

```typescript
import { InjectorContext } from '@deepkit/injector';

class UserSession {}

const injector = InjectorContext.forProviders([
    {provide: UserSession, scope: 'http'}
]);
```

Sobald ein Scope angegeben ist, kann dieser Provider nicht mehr direkt aus dem DI-Container bezogen werden; der folgende Aufruf schlägt daher fehl:

```typescript
const session = injector.get(UserSession); //wirft
```

Stattdessen muss ein DI-Container für diesen Scope erstellt werden. Das würde jedes Mal passieren, wenn eine HTTP-Request eingeht:

```typescript
const httpScope = injector.createChildScope('http');
```

Provider, die ebenfalls in diesem Scope registriert sind, können nun über diesen DI-Container mit Scope angefordert werden, ebenso wie alle Provider, die keinen Scope definiert haben.

```typescript
const session = httpScope.get(UserSession); //funktioniert
```

Da alle Provider standardmäßig Singletons sind, liefert jeder Aufruf von `get(UserSession)` innerhalb eines Scoped-Containers stets dieselbe Instanz zurück. Wenn Sie mehrere Scoped-Container erstellen, werden mehrere UserSessions erzeugt.

Scoped DI-Container haben die Möglichkeit, Werte von außen dynamisch zu setzen. So lassen sich in einem HTTP-Scope beispielsweise einfach die Objekte HttpRequest und HttpResponse setzen.

```typescript
const injector = InjectorContext.forProviders([
    {provide: HttpResponse, scope: 'http'},
    {provide: HttpRequest, scope: 'http'},
]);

httpServer.on('request', (req, res) => {
    const httpScope = injector.createChildScope('http');
    httpScope.set(HttpRequest, req);
    httpScope.set(HttpResponse, res);
});
```

Anwendungen, die das Deepkit-Framework verwenden, haben standardmäßig einen `http`-, einen `rpc`- und einen `cli`-Scope. Siehe dazu die Kapitel [CLI](../app.md), [HTTP](../http.md) und [RPC](../rpc.md).