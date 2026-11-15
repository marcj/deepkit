# Sicherheit

Standardmäßig können alle RPC-Funktionen von jedem Client aufgerufen werden, und die Peer-to-Peer-Kommunikation ist deaktiviert. Um genau zu steuern, welcher Client was tun darf, können Sie die Class `RpcKernelSecurity` überschreiben.

```typescript
import { RpcKernelBaseConnection, RpcKernelSecurity, Session, RpcControllerAccess } from '@deepkit/rpc';

//enthält die Standardimplementierungen
class MyKernelSecurity extends RpcKernelSecurity {
    async hasControllerAccess(session: Session, controllerAccess: RpcControllerAccess, connection: RpcKernelBaseConnection): Promise<boolean> {
        return true;
    }

    async isAllowedToRegisterAsPeer(session: Session, peerId: string): Promise<boolean> {
        return false;
    }

    async isAllowedToSendToPeer(session: Session, peerId: string): Promise<boolean> {
        return false;
    }

    async authenticate(token: any, connection: RpcKernelBaseConnection): Promise<Session> {
        throw new Error('Authentication not implemented');
    }

    transformError(err: Error) {
        return err;
    }
}
```

Der Parameter `connection` ist optional. Eine Überschreibung kann ihn weglassen, wenn sie die Connection nicht benötigt.

Um dies zu verwenden, übergeben Sie den Provider an den `RpcKernel`:

```typescript
const kernel = new RpcKernel([{ provide: RpcKernelSecurity, useClass: MyKernelSecurity, scope: 'rpc' }]);
```

Oder, im Fall einer Deepkit-App, überschreiben Sie die Class `RpcKernelSecurity` mit einem Provider in der App:

```typescript
import { App } from '@deepkit/app';
import { RpcKernelSecurity } from '@deepkit/rpc';
import { FrameworkModule } from '@deepkit/framework';

new App({
    controllers: [MyRpcController],
    providers: [
        { provide: RpcKernelSecurity, useClass: MyKernelSecurity, scope: 'rpc' },
    ],
    imports: [new FrameworkModule],
}).run();
```

## Authentifizierung / Session

Standardmäßig ist das `Session`-Objekt eine anonyme Session, was bedeutet, dass sich der Client nicht authentifiziert hat. Wenn sich der Client authentifizieren möchte, wird die Method `authenticate` aufgerufen. Das Token, das die Method `authenticate` erhält, stammt vom Client und kann einen beliebigen Wert haben.

Sobald der Client ein Token setzt, wird die Authentifizierung ausgeführt, wenn die erste RPC-Funktion aufgerufen wird oder wenn `client.connect()` manuell aufgerufen wird.

```typescript
const client = new RpcWebSocketClient('ws://127.0.0.1:8081');
client.token.set('123456789');

const controller = client.controller<Controller>('/main');
```

In diesem Fall erhält `RpcKernelSecurity.authenticate` das Token `123456789` und kann entsprechend eine andere Session zurückgeben. Die zurückgegebene Session wird dann an alle anderen Methods wie `hasControllerAccess` übergeben.

```typescript
import { AuthenticationError, RpcControllerAccess, RpcKernelSecurity, Session } from '@deepkit/rpc';

class UserSession extends Session {
}

class MyKernelSecurity extends RpcKernelSecurity {
    async hasControllerAccess(session: Session, controllerAccess: RpcControllerAccess): Promise<boolean> {
        if (controllerAccess.controllerClassType === MySecureController) {
            //MySecureController benötigt UserSession
            return session instanceof UserSession;
        }
        return true;
    }

    async authenticate(token: any): Promise<Session> {
        if (token === '123456789') {
            //username kann eine ID oder ein Benutzername sein
            return new UserSession('username', token);
        }
        throw new AuthenticationError('Invalid token');
    }
}
```

Wenn `authenticate` einen `AuthenticationError` wirft, erhält der Client einen Error mit dessen Nachricht. Jeder andere Error wird auf dem Server geloggt, und der Client erhält nur `Authentication failed`.

## Controller-Zugriff

Die Method `hasControllerAccess` bestimmt, ob ein Client eine bestimmte RPC-Funktion ausführen darf. Diese Method wird bei jedem Aufruf einer RPC-Funktion aufgerufen. Gibt sie `false` zurück, wird der Zugriff verweigert und auf dem Client ein Error geworfen.

`RpcControllerAccess` enthält wertvolle Informationen über die RPC-Funktion:

```typescript
interface RpcControllerAccess {
    controllerName: string;
    controllerClassType: ClassType;
    actionName: string;
    actionGroups: string[];
    actionData: { [name: string]: any };
}
```

Gruppen und zusätzliche Daten können über den Decorator `@rpc.action()` geändert werden:

```typescript
import { rpc, RpcControllerAccess, RpcKernelSecurity, Session } from '@deepkit/rpc';

class UserSession extends Session {
    constructor(username: string, token: any, public role: string) {
        super(username, token);
    }
}

@rpc.controller('/main')
class Controller {
    @rpc.action().group('secret').data('role', 'admin')
    saveUser(user: User): void {
    }
}

class MyKernelSecurity extends RpcKernelSecurity {
    async hasControllerAccess(session: Session, controllerAccess: RpcControllerAccess): Promise<boolean> {
        if (controllerAccess.actionGroups.includes('secret')) {
            return session instanceof UserSession && session.role === controllerAccess.actionData.role;
        }
        return true;
    }
}
```
