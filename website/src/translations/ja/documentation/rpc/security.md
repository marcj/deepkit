# セキュリティ

デフォルトでは、すべての RPC 関数はどのクライアントからでも呼び出すことができ、ピアツーピア通信機能は無効になっています。どのクライアントに何を許可するかを正確に制御するには、`RpcKernelSecurity` クラスをオーバーライドします。

```typescript
import { RpcKernelBaseConnection, RpcKernelSecurity, Session, RpcControllerAccess } from '@deepkit/rpc';

//デフォルトの実装を含む
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

`connection` パラメータは省略可能で、connection を必要としない場合、オーバーライドではこれを省略できます。

これを使用するには、プロバイダーを `RpcKernel` に渡します。

```typescript
const kernel = new RpcKernel([{ provide: RpcKernelSecurity, useClass: MyKernelSecurity, scope: 'rpc' }]);
```

または、Deepkit アプリの場合は、アプリ内のプロバイダーで `RpcKernelSecurity` クラスをオーバーライドします。

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

## 認証 / セッション

デフォルトでは、`Session` オブジェクトは匿名セッションであり、クライアントが認証されていないことを意味します。クライアントが認証を行おうとすると、`authenticate` メソッドが呼び出されます。`authenticate` メソッドが受け取るトークンはクライアントから送られたもので、任意の値を取ることができます。

クライアントがトークンを設定すると、最初の RPC 関数が呼び出されたとき、または `client.connect()` が手動で呼び出されたときに認証が実行されます。

```typescript
const client = new RpcWebSocketClient('ws://127.0.0.1:8081');
client.token.set('123456789');

const controller = client.controller<Controller>('/main');
```

この場合、`RpcKernelSecurity.authenticate` はトークン `123456789` を受け取り、それに応じて別のセッションを返すことができます。返されたセッションは、`hasControllerAccess` などの他のすべてのメソッドに渡されます。

```typescript
import { AuthenticationError, RpcControllerAccess, RpcKernelSecurity, Session } from '@deepkit/rpc';

class UserSession extends Session {
}

class MyKernelSecurity extends RpcKernelSecurity {
    async hasControllerAccess(session: Session, controllerAccess: RpcControllerAccess): Promise<boolean> {
        if (controllerAccess.controllerClassType === MySecureController) {
            //MySecureController には UserSession が必要
            return session instanceof UserSession;
        }
        return true;
    }

    async authenticate(token: any): Promise<Session> {
        if (token === '123456789') {
            //username は ID またはユーザー名にできる
            return new UserSession('username', token);
        }
        throw new AuthenticationError('Invalid token');
    }
}
```

`authenticate` が `AuthenticationError` をスローした場合、クライアントはそのメッセージを含むエラーを受け取ります。それ以外のエラーはサーバー側でログに記録され、クライアントは `Authentication failed` のみを受け取ります。

## コントローラーへのアクセス

`hasControllerAccess` メソッドは、クライアントが特定の RPC 関数を実行することを許可されているかどうかを判定します。このメソッドは RPC 関数が呼び出されるたびに呼び出されます。`false` を返した場合、アクセスは拒否され、クライアント側でエラーがスローされます。

`RpcControllerAccess` には、RPC 関数に関する有用な情報が含まれています。

```typescript
interface RpcControllerAccess {
    controllerName: string;
    controllerClassType: ClassType;
    actionName: string;
    actionGroups: string[];
    actionData: { [name: string]: any };
}
```

グループと追加データは、デコレーター `@rpc.action()` を使って変更できます。

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
