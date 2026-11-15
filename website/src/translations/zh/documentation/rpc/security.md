# 安全

默认情况下，所有 RPC 函数都可以被任何客户端调用，并且点对点通信功能处于禁用状态。为了精确控制哪个客户端被允许做什么，你可以重写 `RpcKernelSecurity` 类。

```typescript
import { RpcKernelBaseConnection, RpcKernelSecurity, Session, RpcControllerAccess } from '@deepkit/rpc';

//包含默认实现
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

`connection` 参数是可选的，如果重写的方法不需要该连接，可以省略它。

要使用它，请将 provider 传递给 `RpcKernel`：

```typescript
const kernel = new RpcKernel([{ provide: RpcKernelSecurity, useClass: MyKernelSecurity, scope: 'rpc' }]);
```

或者，对于 Deepkit 应用，在应用中通过 provider 重写 `RpcKernelSecurity` 类：

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

## 认证 / Session

默认情况下，`Session` 对象是一个匿名 session，这意味着客户端尚未进行认证。当客户端想要进行认证时，会调用 `authenticate` 方法。`authenticate` 方法接收到的 token 来自客户端，可以是任意值。

一旦客户端设置了 token，认证将在调用第一个 RPC 函数时或手动调用 `client.connect()` 时执行。

```typescript
const client = new RpcWebSocketClient('ws://127.0.0.1:8081');
client.token.set('123456789');

const controller = client.controller<Controller>('/main');
```

在这种情况下，`RpcKernelSecurity.authenticate` 会接收到 token `123456789`，并可以据此返回不同的 session。返回的 session 随后会被传递给所有其他方法，例如 `hasControllerAccess`。

```typescript
import { AuthenticationError, RpcControllerAccess, RpcKernelSecurity, Session } from '@deepkit/rpc';

class UserSession extends Session {
}

class MyKernelSecurity extends RpcKernelSecurity {
    async hasControllerAccess(session: Session, controllerAccess: RpcControllerAccess): Promise<boolean> {
        if (controllerAccess.controllerClassType === MySecureController) {
            //MySecureController 需要 UserSession
            return session instanceof UserSession;
        }
        return true;
    }

    async authenticate(token: any): Promise<Session> {
        if (token === '123456789') {
            //username 可以是 ID 或用户名
            return new UserSession('username', token);
        }
        throw new AuthenticationError('Invalid token');
    }
}
```

如果 `authenticate` 抛出 `AuthenticationError`，客户端会收到包含其消息的错误。任何其他错误都会记录在服务器上，而客户端只会收到 `Authentication failed`。

## Controller 访问

`hasControllerAccess` 方法决定客户端是否被允许执行特定的 RPC 函数。每次调用 RPC 函数时都会调用此方法。如果它返回 `false`，则拒绝访问，并在客户端抛出错误。

`RpcControllerAccess` 包含有关 RPC 函数的有用信息：

```typescript
interface RpcControllerAccess {
    controllerName: string;
    controllerClassType: ClassType;
    actionName: string;
    actionGroups: string[];
    actionData: { [name: string]: any };
}
```

可以通过装饰器 `@rpc.action()` 更改分组和附加数据：

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
