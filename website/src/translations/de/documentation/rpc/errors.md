# Errors

Geworfene Errors werden automatisch mit ihrer Nachricht und den Properties registrierter Error-Klassen an den Client weitergeleitet.

Der Stack-Trace und `error.cause` werden nur gesendet, wenn die `debug`-Option des `FrameworkModule` aktiviert ist, da sie interne Details wie Dateipfade oder den Datenbank-Error, den ein öffentlicher Error umschließt, offenlegen. Ohne das Framework setzt man `rpcErrorSettings.exposeStack` und `rpcErrorSettings.exposeCause` von `@deepkit/rpc`. Eine Cause kommt ebenfalls als Error an, sodass `error.cause` auf dem Client genauso funktioniert wie auf dem Server.

Wenn nominale Instanzen für das Error-Objekt wichtig sind (weil man instanceof verwendet), muss `@entity.name('@error:unique-name')` verwendet werden, damit die angegebene Error-Klasse zur Laufzeit registriert und wiederverwendet wird.

```typescript
@entity.name('@error:myError')
class MyError extends Error {}

//server
@rpc.controller('/main')
class Controller {
    @rpc.action()
    saveUser(user: User): void {
        throw new MyError('Can not save user');
    }
}

//client
//[MyError] stellt sicher, dass die Klasse MyError zur Laufzeit bekannt ist
const controller = client.controller<Controller>('/main', [MyError]);

try {
    await controller.getUser(2);
} catch (e) {
    if (e instanceof MyError) {
        //ups, Benutzer konnte nicht gespeichert werden
    } else {
        //alle anderen Errors
    }
}
```

## Error transformieren

Da geworfene Errors automatisch mit all ihren Informationen wie der Fehlermeldung und auch dem Stack-Trace an den Client weitergeleitet werden, könnten dadurch ungewollt sensible Informationen veröffentlicht werden. Um dies zu ändern, kann der geworfene Error in der Methode `transformError` modifiziert werden.

```typescript
class MyKernelSecurity extends RpcKernelSecurity {
    constructor(private logger: Logger) {
        super();
    }

    transformError(error: Error) {
        //in neuen Error einpacken
        this.logger.error('Error in RPC', error);
        return new Error('Something went wrong: ' + error.message);
    }
}
```

Beachte, dass sobald der Error in einen generischen `error` umgewandelt wird, der vollständige Stack-Trace und die Identität des Errors verloren gehen. Dementsprechend können im Client keine `instanceof`-Prüfungen auf den Error angewendet werden.

Wenn Deepkit RPC zwischen zwei Microservices verwendet wird und somit Client und Server vollständig unter der Kontrolle des Entwicklers stehen, ist das Transformieren des Errors selten notwendig. Läuft der Client hingegen in einem Browser bei einem unbekannten Nutzer, sollte in `transformError` sorgfältig darauf geachtet werden, welche Informationen preisgegeben werden. Im Zweifelsfall sollte jeder Error durch einen generischen `Error` ersetzt werden, um sicherzustellen, dass keine internen Details nach außen gelangen. Das Loggen des Errors wäre an dieser Stelle dann eine gute Idee.
