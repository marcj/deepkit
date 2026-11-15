# Getting Started

To use Deepkit RPC, it is necessary to have `@deepkit/type` correctly installed because it is based on Runtime Types. See [Runtime Type Installation](../runtime-types.md).

Once this is successfully done, `@deepkit/rpc` or the Deepkit Framework, which already uses the library under the hood, can be installed.

```sh
npm install @deepkit/rpc
```

Note that controller classes in `@deepkit/rpc` are based on TypeScript decorators, and this feature must be enabled with experimentalDecorators.

The `@deepkit/rpc` package must be installed on the server and client if they have their own package.json.

To communicate over TCP with the server, the `@deepkit/rpc-tcp` package must be installed on the client and server.

```sh
npm install @deepkit/rpc-tcp
```

For WebSocket communication, the package is also required on the server. The client in the browser, on the other hand, uses WebSocket from the official standard.

If the client is also to be used in an environment where WebSocket is not available (for example, NodeJS), the package ws is required in the client.

```sh
npm install ws
```

## Usage

Below is a fully functional example based on WebSockets and the low-level API of @deepkit/rpc. When using the Deepkit Framework, controllers are provided via app modules, and an RpcKernel is not instantiated manually.

_File: server.ts_

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

_File: client.ts_

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

## Server Controller

The term "Procedure" in Remote Procedure Call is also commonly referred to as an "Action". An Action is a method defined in a class and marked with the `@rpc.action` decorator. The class itself is marked as a Controller with the `@rpc.controller` decorator and given a unique name. This name is then referenced in the client to address the correct controller. Multiple controllers can be defined and registered as needed.


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

Only methods marked as `@rpc.action()` can be called by a client.

Types must be explicitly specified and cannot be inferred. This is important because the serializer needs to know exactly what the types look like in order to convert them into binary data (BSON) or JSON which is then sent over the wire.

## Client Controller

The normal flow in RPC is that the client can execute functions on the server. However, in Deepkit RPC, it is also possible for the server to execute functions on the client. To allow this, the client can also register a controller.

The client registers the controller with `client.registerController()` under a name. The server gets the `RpcKernelConnection` of the calling client injected and creates a remote controller for it with `connection.controller<T>(name)`. As on the client, every method of the remote controller returns a `Promise`.

```typescript
import { rpc, RpcKernelConnection } from '@deepkit/rpc';

//runs on the client
@rpc.controller('/client')
export class ClientController {
    @rpc.action()
    notify(message: string): void {
        console.log('Server says:', message);
    }
}

//runs on the server
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
await controller.ping(); //prints "Server says: ping received" on the client
```

The remote controller works as long as the connection is open. To call the client later, for example to push a notification, keep a reference to the `RpcKernelConnection` and remove it once the client disconnects. Back controllers need a persistent connection, so they work over WebSocket, TCP and IPC, but not over [HTTP](./http.md).

## Dependency Injection

When the Deepkit framework is used, the class is instantiated by the Dependency Injection container and thus automatically has access to all other providers in the application.

See also [Dependency Injection](dependency-injection.md#).

## Streaming RxJS

An action can return an RxJS `Observable`, `Subject` or `BehaviorSubject`, or a `ProgressTracker` from `@deepkit/core-rxjs`. The return type can also be wrapped in a `Promise`. The client receives an object of the same type, and values arrive as the server emits them.

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

The types behave differently:

- `Observable`: lazy. The server subscribes to the returned Observable each time the client subscribes, and unsubscribes when the client unsubscribes. This runs the teardown logic of the Observable on the server.
- `Subject`: the server subscribes right away and forwards all values. Values emitted before the client subscribes are lost, as with any Subject.
- `BehaviorSubject`: like `Subject`, and the client starts with the current value of the server, so `getValue()` works immediately.

When the server completes the stream or emits an error, the client's Observable or Subject completes or errors as well.

### Cleanup

Calling `unsubscribe()` or `complete()` on a Subject or BehaviorSubject on the client stops the server from forwarding values. The Subject on the server is not completed, so a shared Subject, like `chat` above, keeps working for other clients. When the connection closes, the server unsubscribes all Observables and Subjects of that client. If the client drops a stream without unsubscribing, it is released once it is garbage collected, but don't rely on that and unsubscribe explicitly.

```typescript
const messages = await controller.messages();
const subscription = messages.subscribe(message => console.log(message));

subscription.unsubscribe(); //stops this subscriber only
messages.unsubscribe(); //tells the server to stop sending values
```

### Progress

`ProgressTracker` reports the progress of a long-running operation. Each `track(message, total)` call creates a group, and setting `done` sends the update to the client (throttled to 100 ms). The tracker completes when all groups are finished. The client can call `stop()` on its tracker, which calls the `onStop` callbacks on the server.

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

progress.stop(); //cancels the import on the server
```

Streams need a persistent connection and are not supported over [HTTP](./http.md).

## Nominal Types

When the client receives data from a function call, it has first been serialized on the server and then deserialized on the client. If the function's return type includes classes, these classes will be reconstructed on the client side, but they will lose their nominal identity and associated methods. To address this issue, register the classes as nominal types with unique IDs/names. This approach should be applied to all classes used within an RPC-API.

To register a class, use the decorator `@entity.name('id')`.

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

Once this class is used as the result of a function, its identity will be preserved.

```typescript
const controller = client.controller<Controller>('/main');

const user = await controller.getUser(2);
user instanceof User; //true when @entity.name is used, and false if not
```
