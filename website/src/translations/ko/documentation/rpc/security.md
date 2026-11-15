# 보안

기본적으로 모든 RPC 함수는 어떤 클라이언트에서든 호출할 수 있으며, peer-to-peer 통신 기능은 비활성화되어 있습니다. 어떤 클라이언트가 무엇을 할 수 있는지 정밀하게 제어하려면 `RpcKernelSecurity` 클래스를 오버라이드할 수 있습니다.

```typescript
import { RpcKernelBaseConnection, RpcKernelSecurity, Session, RpcControllerAccess } from '@deepkit/rpc';

//기본 구현을 포함합니다
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

`connection` parameter는 선택 사항이며, connection이 필요하지 않은 경우 오버라이드에서 생략할 수 있습니다.

이를 사용하려면 provider를 `RpcKernel`에 전달합니다:

```typescript
const kernel = new RpcKernel([{ provide: RpcKernelSecurity, useClass: MyKernelSecurity, scope: 'rpc' }]);
```

또는 Deepkit 앱의 경우, 앱에서 provider를 사용하여 `RpcKernelSecurity` 클래스를 오버라이드합니다:

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

## 인증 / 세션

기본적으로 `Session` 객체는 익명 세션이며, 이는 클라이언트가 인증되지 않았음을 의미합니다. 클라이언트가 인증하려고 하면 `authenticate` 메서드가 호출됩니다. `authenticate` 메서드가 받는 토큰은 클라이언트로부터 오며 어떤 값이든 가질 수 있습니다.

클라이언트가 토큰을 설정하면, 첫 번째 RPC 함수가 호출되거나 `client.connect()`가 수동으로 호출될 때 인증이 실행됩니다.

```typescript
const client = new RpcWebSocketClient('ws://127.0.0.1:8081');
client.token.set('123456789');

const controller = client.controller<Controller>('/main');
```

이 경우 `RpcKernelSecurity.authenticate`는 토큰 `123456789`를 받으며, 이에 따라 다른 세션을 반환할 수 있습니다. 반환된 세션은 이후 `hasControllerAccess`와 같은 다른 모든 메서드에 전달됩니다.

```typescript
import { AuthenticationError, RpcControllerAccess, RpcKernelSecurity, Session } from '@deepkit/rpc';

class UserSession extends Session {
}

class MyKernelSecurity extends RpcKernelSecurity {
    async hasControllerAccess(session: Session, controllerAccess: RpcControllerAccess): Promise<boolean> {
        if (controllerAccess.controllerClassType === MySecureController) {
            //MySecureController는 UserSession을 필요로 합니다
            return session instanceof UserSession;
        }
        return true;
    }

    async authenticate(token: any): Promise<Session> {
        if (token === '123456789') {
            //username은 ID 또는 사용자 이름일 수 있습니다
            return new UserSession('username', token);
        }
        throw new AuthenticationError('Invalid token');
    }
}
```

`authenticate`가 `AuthenticationError`를 throw하면 클라이언트는 해당 메시지가 담긴 에러를 받습니다. 그 외의 에러는 서버에 로그로 기록되며, 클라이언트는 `Authentication failed`만 받습니다.

## 컨트롤러 접근

`hasControllerAccess` 메서드는 클라이언트가 특정 RPC 함수를 실행할 수 있는지 여부를 결정합니다. 이 메서드는 모든 RPC 함수 호출마다 호출됩니다. `false`를 반환하면 접근이 거부되고 클라이언트에서 에러가 발생합니다.

`RpcControllerAccess`에는 RPC 함수에 대한 유용한 정보가 포함되어 있습니다:

```typescript
interface RpcControllerAccess {
    controllerName: string;
    controllerClassType: ClassType;
    actionName: string;
    actionGroups: string[];
    actionData: { [name: string]: any };
}
```

그룹과 추가 데이터는 `@rpc.action()` 데코레이터를 통해 변경할 수 있습니다:

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
