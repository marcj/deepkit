# 入门

要使用 Deepkit RPC，必须正确安装 `@deepkit/type`，因为它基于 Runtime Types。请参阅 [Runtime Type 安装](../runtime-types.md)。

完成此步骤后，即可安装 `@deepkit/rpc`，或安装在底层已经使用了该库的 Deepkit Framework。

```sh
npm install @deepkit/rpc
```

请注意，`@deepkit/rpc` 中的控制器类基于 TypeScript decorators，必须通过 experimentalDecorators 启用此功能。

如果服务器和客户端各自拥有自己的 package.json，则必须在两者上都安装 `@deepkit/rpc` 包。

要通过 TCP 与服务器通信，必须在客户端和服务器上安装 `@deepkit/rpc-tcp` 包。

```sh
npm install @deepkit/rpc-tcp
```

对于 WebSocket 通信，服务器上同样需要该包。而浏览器中的客户端则使用官方标准中的 WebSocket。

如果客户端还需要在没有 WebSocket 的环境中使用（例如 NodeJS），则客户端需要安装 ws 包。

```sh
npm install ws
```

## 用法

下面是一个基于 WebSockets 和 @deepkit/rpc 底层 API 的完整可运行示例。使用 Deepkit Framework 时，控制器通过 app modules 提供，且无需手动实例化 RpcKernel。

_文件：server.ts_

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

_文件：client.ts_

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

## 服务器控制器

Remote Procedure Call 中的 "Procedure" 一词通常也被称为 "Action"。Action 是在类中定义并使用 `@rpc.action` 装饰器标记的方法。类本身使用 `@rpc.controller` 装饰器标记为 Controller，并被赋予一个唯一名称。客户端随后通过该名称来定位正确的控制器。可以根据需要定义并注册多个控制器。


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

只有标记为 `@rpc.action()` 的方法才能被客户端调用。

类型必须显式指定，不能依赖推断。这一点很重要，因为序列化器需要确切知道类型的结构，才能将其转换为二进制数据（BSON）或 JSON，然后通过网络发送。

## 客户端控制器

RPC 中的常规流程是客户端可以在服务器上执行函数。然而，在 Deepkit RPC 中，服务器也可以在客户端上执行函数。为此，客户端也可以注册控制器。

客户端通过 `client.registerController()` 以某个名称注册控制器。服务器会注入发起调用的客户端的 `RpcKernelConnection`，并通过 `connection.controller<T>(name)` 为其创建一个远程控制器。与客户端一样，远程控制器的每个方法都返回一个 `Promise`。

```typescript
import { rpc, RpcKernelConnection } from '@deepkit/rpc';

//在客户端上运行
@rpc.controller('/client')
export class ClientController {
    @rpc.action()
    notify(message: string): void {
        console.log('Server says:', message);
    }
}

//在服务器上运行
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
await controller.ping(); //在客户端上打印 "Server says: ping received"
```

只要连接保持打开，远程控制器就能正常工作。如果需要稍后调用客户端（例如推送通知），请保留对 `RpcKernelConnection` 的引用，并在客户端断开连接后将其移除。反向控制器需要持久连接，因此它们可以通过 WebSocket、TCP 和 IPC 工作，但不能通过 [HTTP](./http.md) 工作。

## 依赖注入

使用 Deepkit 框架时，类由依赖注入容器实例化，因此可以自动访问应用程序中的所有其他 provider。

另请参阅 [依赖注入](dependency-injection.md#)。

## RxJS 流

Action 可以返回 RxJS 的 `Observable`、`Subject` 或 `BehaviorSubject`，或者来自 `@deepkit/core-rxjs` 的 `ProgressTracker`。返回类型也可以包装在 `Promise` 中。客户端会收到相同类型的对象，并在服务器发出值时接收这些值。

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

这些类型的行为各不相同：

- `Observable`：惰性。每当客户端订阅时，服务器都会订阅返回的 Observable，并在客户端取消订阅时取消订阅。这会在服务器上执行 Observable 的 teardown 逻辑。
- `Subject`：服务器立即订阅并转发所有值。与任何 Subject 一样，在客户端订阅之前发出的值会丢失。
- `BehaviorSubject`：与 `Subject` 类似，并且客户端以服务器的当前值作为初始值，因此 `getValue()` 可以立即使用。

当服务器完成流或发出错误时，客户端的 Observable 或 Subject 也会相应地完成或报错。

### 清理

在客户端对 Subject 或 BehaviorSubject 调用 `unsubscribe()` 或 `complete()` 会使服务器停止转发值。服务器上的 Subject 不会被完成，因此共享的 Subject（如上面的 `chat`）仍可继续为其他客户端工作。当连接关闭时，服务器会取消该客户端的所有 Observable 和 Subject 的订阅。如果客户端丢弃了流而没有取消订阅，它会在被垃圾回收后释放，但不要依赖这一点，请显式取消订阅。

```typescript
const messages = await controller.messages();
const subscription = messages.subscribe(message => console.log(message));

subscription.unsubscribe(); //仅停止此订阅者
messages.unsubscribe(); //通知服务器停止发送值
```

### 进度

`ProgressTracker` 用于报告长时间运行操作的进度。每次调用 `track(message, total)` 都会创建一个分组，设置 `done` 会将更新发送给客户端（节流为 100 ms）。当所有分组完成后，tracker 即完成。客户端可以对其 tracker 调用 `stop()`，这会触发服务器上的 `onStop` 回调。

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

progress.stop(); //取消服务器上的导入
```

流需要持久连接，不支持通过 [HTTP](./http.md) 使用。

## 名义类型

当客户端从函数调用接收数据时，这些数据首先在服务器上被序列化，然后在客户端上被反序列化。如果函数的返回类型包含类，这些类会在客户端被重建，但会丢失其名义身份及相关方法。要解决此问题，请使用唯一的 ID/名称将这些类注册为名义类型。此方法应适用于 RPC-API 中使用的所有类。

要注册一个类，请使用装饰器 `@entity.name('id')`。

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

一旦该类被用作函数的结果，其身份将被保留。

```typescript
const controller = client.controller<Controller>('/main');

const user = await controller.getUser(2);
user instanceof User; //使用 @entity.name 时为 true，否则为 false
```
