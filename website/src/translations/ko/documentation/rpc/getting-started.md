# 시작하기

Deepkit RPC는 Runtime Types를 기반으로 하므로, 사용하려면 `@deepkit/type`이 올바르게 설치되어 있어야 합니다. [Runtime Type 설치](../runtime-types.md)를 참고하세요.

설치가 완료되면 `@deepkit/rpc` 또는 내부적으로 이 라이브러리를 이미 사용하는 Deepkit Framework를 설치할 수 있습니다.

```sh
npm install @deepkit/rpc
```

`@deepkit/rpc`의 controller class는 TypeScript decorator를 기반으로 하므로, experimentalDecorators로 이 기능을 활성화해야 합니다.

서버와 클라이언트가 각각 별도의 package.json을 가지고 있다면, 양쪽 모두에 `@deepkit/rpc` 패키지를 설치해야 합니다.

TCP를 통해 서버와 통신하려면 클라이언트와 서버에 `@deepkit/rpc-tcp` 패키지를 설치해야 합니다.

```sh
npm install @deepkit/rpc-tcp
```

WebSocket 통신의 경우에도 서버에는 이 패키지가 필요합니다. 반면 브라우저의 클라이언트는 공식 표준의 WebSocket을 사용합니다.

WebSocket을 사용할 수 없는 환경(예: NodeJS)에서도 클라이언트를 사용하려면, 클라이언트에 ws 패키지가 필요합니다.

```sh
npm install ws
```

## 사용법

아래는 WebSocket과 @deepkit/rpc의 low-level API를 기반으로 한, 완전히 동작하는 예제입니다. Deepkit Framework를 사용하는 경우 controller는 app module을 통해 제공되며, RpcKernel을 수동으로 인스턴스화하지 않습니다.

_파일: server.ts_

```typescript
import { rpc, RpcKernel } from '@deepkit/rpc';
import { RpcWebSocketServer } from '@deepkit/rpc-tcp';

@rpc.controller('/main')
export class Controller {
    @rpc.action()
    hello(title: string): string {
        return 'Hello ' + title;
    }
}

const kernel = new RpcKernel();
kernel.registerController(Controller);
const server = new RpcWebSocketServer(kernel, 'localhost:8081');
server.start({
    host: '127.0.0.1',
    port: 8081,
});
console.log('Server started at ws://127.0.0.1:8081');

```

_파일: client.ts_

```typescript
import { RpcWebSocketClient } from '@deepkit/rpc';
import type { Controller } from './server';

async function main() {
    const client = new RpcWebSocketClient('ws://127.0.0.1:8081');
    const controller = client.controller<Controller>('/main');

    const result = await controller.hello('World');
    console.log('result', result);

    client.disconnect();
}

main().catch(console.error);

```

## 서버 Controller

Remote Procedure Call의 "Procedure"라는 용어는 흔히 "Action"이라고도 불립니다. Action은 class에 정의되고 `@rpc.action` decorator로 표시된 method입니다. class 자체는 `@rpc.controller` decorator로 Controller로 표시되며 고유한 이름이 부여됩니다. 이 이름은 클라이언트에서 올바른 controller를 지정하는 데 참조됩니다. 필요에 따라 여러 controller를 정의하고 등록할 수 있습니다.


```typescript
import { rpc } from '@deepkit/rpc';

@rpc.controller('/main')
class Controller {
    @rpc.action()
    hello(title: string): string {
        return 'Hello ' + title;
    }

    @rpc.action()
    test(): boolean {
        return true;
    }
}
```

`@rpc.action()`으로 표시된 method만 클라이언트에서 호출할 수 있습니다.

Type은 명시적으로 지정해야 하며 추론될 수 없습니다. serializer가 데이터를 바이너리 데이터(BSON) 또는 JSON으로 변환하여 네트워크로 전송하려면 type이 정확히 어떤 형태인지 알아야 하기 때문에 이는 중요합니다.

## 클라이언트 Controller

RPC의 일반적인 흐름은 클라이언트가 서버의 함수를 실행하는 것입니다. 그러나 Deepkit RPC에서는 서버가 클라이언트의 함수를 실행하는 것도 가능합니다. 이를 위해 클라이언트도 controller를 등록할 수 있습니다.

클라이언트는 `client.registerController()`로 특정 이름 아래에 controller를 등록합니다. 서버는 호출한 클라이언트의 `RpcKernelConnection`을 주입받고, `connection.controller<T>(name)`으로 해당 클라이언트에 대한 remote controller를 생성합니다. 클라이언트에서와 마찬가지로 remote controller의 모든 method는 `Promise`를 반환합니다.

```typescript
import { rpc, RpcKernelConnection } from '@deepkit/rpc';

//클라이언트에서 실행됨
@rpc.controller('/client')
export class ClientController {
    @rpc.action()
    notify(message: string): void {
        console.log('Server says:', message);
    }
}

//서버에서 실행됨
@rpc.controller('/main')
export class Controller {
    constructor(private connection: RpcKernelConnection) {
    }

    @rpc.action()
    async ping(): Promise<string> {
        const client = this.connection.controller<ClientController>('/client');
        await client.notify('ping received');
        return 'pong';
    }
}
```

```typescript
const client = new RpcWebSocketClient('ws://127.0.0.1:8081');
client.registerController(ClientController, '/client');

const controller = client.controller<Controller>('/main');
await controller.ping(); //클라이언트에서 "Server says: ping received"를 출력함
```

remote controller는 연결이 열려 있는 동안 동작합니다. 나중에 클라이언트를 호출하려면(예: 알림을 push하기 위해) `RpcKernelConnection`에 대한 참조를 보관하고, 클라이언트 연결이 끊어지면 이를 제거하세요. Back controller는 지속적인 연결이 필요하므로 WebSocket, TCP, IPC에서는 동작하지만 [HTTP](./http.md)에서는 동작하지 않습니다.

## Dependency Injection

Deepkit framework를 사용하는 경우, class는 Dependency Injection container에 의해 인스턴스화되므로 애플리케이션의 다른 모든 provider에 자동으로 접근할 수 있습니다.

[Dependency Injection](dependency-injection.md#)도 참고하세요.

## RxJS 스트리밍

Action은 RxJS의 `Observable`, `Subject`, `BehaviorSubject` 또는 `@deepkit/core-rxjs`의 `ProgressTracker`를 반환할 수 있습니다. 반환 type은 `Promise`로 감쌀 수도 있습니다. 클라이언트는 동일한 type의 객체를 받으며, 값은 서버가 emit하는 대로 도착합니다.

```typescript
import { rpc } from '@deepkit/rpc';
import { BehaviorSubject, Observable, Subject } from 'rxjs';

@rpc.controller('/main')
export class Controller {
    chat = new Subject<string>();
    status = new BehaviorSubject<string>('idle');

    @rpc.action()
    countdown(from: number): Observable<number> {
        return new Observable(subscriber => {
            for (let i = from; i >= 0; i--) subscriber.next(i);
            subscriber.complete();
        });
    }

    @rpc.action()
    messages(): Subject<string> {
        return this.chat;
    }

    @rpc.action()
    currentStatus(): BehaviorSubject<string> {
        return this.status;
    }
}
```

```typescript
const controller = client.controller<Controller>('/main');

const countdown = await controller.countdown(3);
countdown.subscribe(value => console.log(value)); //3, 2, 1, 0

const messages = await controller.messages();
messages.subscribe(message => console.log(message));

const status = await controller.currentStatus();
status.getValue(); //'idle'
```

각 type은 다르게 동작합니다:

- `Observable`: lazy합니다. 서버는 클라이언트가 subscribe할 때마다 반환된 Observable을 subscribe하고, 클라이언트가 unsubscribe하면 unsubscribe합니다. 이때 서버에서 Observable의 teardown 로직이 실행됩니다.
- `Subject`: 서버가 즉시 subscribe하여 모든 값을 전달합니다. 일반적인 Subject와 마찬가지로, 클라이언트가 subscribe하기 전에 emit된 값은 유실됩니다.
- `BehaviorSubject`: `Subject`와 같으며, 클라이언트는 서버의 현재 값으로 시작하므로 `getValue()`가 즉시 동작합니다.

서버가 스트림을 complete하거나 error를 emit하면, 클라이언트의 Observable 또는 Subject도 complete되거나 error가 발생합니다.

### 정리(Cleanup)

클라이언트에서 Subject 또는 BehaviorSubject에 대해 `unsubscribe()` 또는 `complete()`를 호출하면 서버는 값 전달을 중단합니다. 서버의 Subject는 complete되지 않으므로, 위의 `chat`처럼 공유된 Subject는 다른 클라이언트에 대해 계속 동작합니다. 연결이 종료되면 서버는 해당 클라이언트의 모든 Observable과 Subject를 unsubscribe합니다. 클라이언트가 unsubscribe하지 않고 스트림을 버리면 garbage collection 시점에 해제되지만, 이에 의존하지 말고 명시적으로 unsubscribe하세요.

```typescript
const messages = await controller.messages();
const subscription = messages.subscribe(message => console.log(message));

subscription.unsubscribe(); //이 subscriber만 중단함
messages.unsubscribe(); //서버에 값 전송을 중단하도록 알림
```

### 진행 상황(Progress)

`ProgressTracker`는 오래 실행되는 작업의 진행 상황을 보고합니다. 각 `track(message, total)` 호출은 그룹을 생성하며, `done`을 설정하면 업데이트가 클라이언트로 전송됩니다(100 ms 단위로 throttle됨). 모든 그룹이 끝나면 tracker가 complete됩니다. 클라이언트는 자신의 tracker에서 `stop()`을 호출할 수 있으며, 이는 서버의 `onStop` callback을 호출합니다.

```typescript
import { rpc } from '@deepkit/rpc';
import { ProgressTracker } from '@deepkit/core-rxjs';

@rpc.controller('/import')
export class ImportController {
    @rpc.action()
    import(): ProgressTracker {
        const tracker = new ProgressTracker();
        const rows = tracker.track('Importing rows', 100);

        const timer = setInterval(() => {
            rows.done++;
            if (rows.finished) clearInterval(timer);
        }, 50);
        rows.onStop(() => clearInterval(timer));

        return tracker;
    }
}
```

```typescript
const progress = await client.controller<ImportController>('/import').import();
progress.subscribe(() => console.log(progress.done, '/', progress.total));

progress.stop(); //서버에서 import를 취소함
```

스트림은 지속적인 연결이 필요하므로 [HTTP](./http.md)에서는 지원되지 않습니다.

## Nominal Types

클라이언트가 함수 호출로부터 데이터를 받을 때, 그 데이터는 먼저 서버에서 serialize된 후 클라이언트에서 deserialize됩니다. 함수의 반환 type에 class가 포함되어 있으면 이 class들은 클라이언트 측에서 재구성되지만, nominal identity와 관련 method를 잃게 됩니다. 이 문제를 해결하려면 class를 고유한 ID/이름을 가진 nominal type으로 등록하세요. 이 방식은 RPC-API 내에서 사용되는 모든 class에 적용해야 합니다.

class를 등록하려면 `@entity.name('id')` decorator를 사용하세요.

```typescript
import { entity } from '@deepkit/type';

@entity.name('user')
class User {
    id!: number;
    firstName!: string;
    lastName!: string;
    get fullName() {
        return this.firstName + ' ' + this.lastName;
    }
}
```

이 class가 함수의 결과로 사용되면 그 identity가 유지됩니다.

```typescript
const controller = client.controller<Controller>('/main');

const user = await controller.getUser(2);
user instanceof User; //@entity.name을 사용하면 true, 그렇지 않으면 false
```
