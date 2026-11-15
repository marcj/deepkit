# Security

By default, all RPC functions can be called from any client, and the peer-to-peer communication feature is disabled. To precisely control which client is allowed to do what, you can override the `RpcKernelSecurity` class.

```typescript
import { RpcKernelBaseConnection, RpcKernelSecurity, Session, RpcControllerAccess } from '@deepkit/rpc';

//contains the default implementations
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

The `connection` parameter is optional, an override can leave it out if it doesn't need the connection.

To use this, pass the provider to the `RpcKernel`:

```typescript
const kernel = new RpcKernel([{ provide: RpcKernelSecurity, useClass: MyKernelSecurity, scope: 'rpc' }]);
```

Or, in the case of a Deepkit app, override the `RpcKernelSecurity` class with a provider in the app:

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

## Authentication / Session

By default, the `Session` object is an anonymous session, meaning the client has not authenticated. When the client wants to authenticate, the `authenticate` method is called. The token received by the `authenticate` method comes from the client and can have any value.

Once the client sets a token, the authentication is executed when the first RPC function is called or when `client.connect()` is manually invoked.

```typescript
const client = new RpcWebSocketClient('ws://127.0.0.1:8081');
client.token.set('123456789');

const controller = client.controller<Controller>('/main');
```

In this case, `RpcKernelSecurity.authenticate` receives the token `123456789` and can return a different session accordingly. The returned session is then passed to all other methods like `hasControllerAccess`.

```typescript
import { AuthenticationError, RpcControllerAccess, RpcKernelSecurity, Session } from '@deepkit/rpc';

class UserSession extends Session {
}

class MyKernelSecurity extends RpcKernelSecurity {
    async hasControllerAccess(session: Session, controllerAccess: RpcControllerAccess): Promise<boolean> {
        if (controllerAccess.controllerClassType === MySecureController) {
            //MySecureController requires UserSession
            return session instanceof UserSession;
        }
        return true;
    }

    async authenticate(token: any): Promise<Session> {
        if (token === '123456789') {
            //username can be an ID or a username
            return new UserSession('username', token);
        }
        throw new AuthenticationError('Invalid token');
    }
}
```

If `authenticate` throws an `AuthenticationError`, the client receives an error with its message. Any other error is logged on the server, and the client only receives `Authentication failed`.

## Controller Access

The `hasControllerAccess` method determines whether a client is allowed to execute a specific RPC function. This method is called for every RPC function invocation. If it returns `false`, access is denied, and an error is thrown on the client.

The `RpcControllerAccess` contains valuable information about the RPC function:

```typescript
interface RpcControllerAccess {
    controllerName: string;
    controllerClassType: ClassType;
    actionName: string;
    actionGroups: string[];
    actionData: { [name: string]: any };
}
```

Groups and additional data can be changed via the decorator `@rpc.action()`:

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
