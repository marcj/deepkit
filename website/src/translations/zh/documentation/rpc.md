# TypeScript RPC 框架

Deepkit RPC 是一个面向 TypeScript 的类型安全 RPC 框架。你在服务端编写一个普通的 Class，然后在客户端调用它的方法，参数和结果会根据你的 TypeScript 类型自动验证，且无需代码生成。

```typescript
//server.ts
import { rpc, RpcKernel } from '@deepkit/rpc';
import { RpcWebSocketServer } from '@deepkit/rpc-tcp';
import { MinLength } from '@deepkit/type';

export interface User {
    username: string;
    createdAt: Date;
}

@rpc.controller('/user')
export class UserController {
    @rpc.action()
    create(username: string & MinLength<3>): User {
        return { username, createdAt: new Date() };
    }
}

const kernel = new RpcKernel();
kernel.registerController(UserController);

const server = new RpcWebSocketServer(kernel, 'localhost:8081');
server.start({ host: '127.0.0.1', port: 8081 });
```

```typescript
//client.ts
import { RpcWebSocketClient } from '@deepkit/rpc';
import type { UserController } from './server';

async function main() {
    const client = new RpcWebSocketClient('ws://127.0.0.1:8081');
    const users = client.controller<UserController>('/user');

    const user = await users.create('Peter');
    console.log(user.createdAt instanceof Date); // true

    await users.create('ab');
    // RpcError: Validation error for arguments of ...
    // username(minLength): Min length is 3 caused by value "ab"
}

main().catch(console.error);
```

客户端只导入 controller 的类型，因此不会有任何服务端代码进入客户端 bundle。`Date` 会以真正的 `Date` 对象到达，而无效的调用会在方法执行之前就被拒绝。安装方法请参见[入门](./rpc/getting-started.md)。

## 与 tRPC 和 gRPC 的比较

|                    | Deepkit RPC                         | tRPC                                  | gRPC                                   |
| ------------------ | ----------------------------------- | ------------------------------------- | -------------------------------------- |
| API 定义           | TypeScript Class 和类型             | 带有 procedures 的 Router             | `.proto` 文件                          |
| 代码生成           | 无                                  | 无                                    | 必需                                   |
| 运行时验证         | 内置，基于 TypeScript 类型          | 需借助 Zod 等 schema 库               | 仅消息结构                             |
| 传输格式           | 二进制（BSON）                      | JSON                                  | 二进制（Protocol Buffers）             |
| 传输方式           | WebSocket、TCP、HTTP、IPC           | HTTP、WebSocket                       | HTTP/2                                 |
| 语言               | TypeScript                          | TypeScript                            | 多种                                   |

Deepkit RPC 需要在构建中使用 [Deepkit 类型编译器](./runtime-types/getting-started.md)，因为它要在运行时读取你的类型。如果 API 需要被其他公司或普通 HTTP 客户端调用，请改用 [Deepkit HTTP](./http.md)；当多种编程语言编写的服务之间需要相互通信时，请使用 gRPC。

## 什么是 RPC？

RPC 是 Remote Procedure Call（远程过程调用）的缩写，它允许像调用本地函数一样调用远程服务器上的函数。与使用 HTTP 方法和 URL 进行映射的 HTTP 客户端-服务端通信不同，RPC 使用函数名进行映射。要发送的数据作为普通函数参数传递，服务端函数调用的结果会被发送回客户端。

RPC 的优点在于客户端-服务端的抽象很轻量，因为它不涉及 header、URL、query string 等内容。缺点是通过 RPC 暴露的服务端函数不易被浏览器直接调用，通常需要专门的客户端。

RPC 的一个关键特性是客户端与服务端之间的数据会被自动序列化和反序列化。因此，通常可以实现类型安全的 RPC 客户端。一些 RPC 框架强制用户以特定格式提供类型（参数类型和返回类型），例如 gRPC 所用的 Protocol Buffers 这类 DSL，或者 JavaScript schema 构建器。RPC 框架也可以提供额外的数据验证，但并非所有框架都支持。

Deepkit RPC 直接从 TypeScript 代码本身提取类型。一旦在[验证](./runtime-types/validation.md)中定义了额外的约束，它们就会被自动验证。由于 RPC 本质上基于异步通信，客户端上的所有函数调用都会返回一个 `Promise`，并通过 `await` 获取结果。

## 使用 RxJS 进行流式传输

一个 action 可以返回 `Observable`。客户端也会收到一个 `Observable`，服务端每发出一个值，客户端就会收到该值，这使得 Deepkit RPC 非常适合实时通信。

```typescript
import { rpc } from '@deepkit/rpc';
import { Observable } from 'rxjs';

@rpc.controller('/numbers')
export class NumbersController {
    @rpc.action()
    countdown(from: number): Observable<number> {
        return new Observable(subscriber => {
            for (let i = from; i >= 0; i--) subscriber.next(i);
            subscriber.complete();
        });
    }
}

//在客户端
const numbers = client.controller<NumbersController>('/numbers');
const stream = await numbers.countdown(3);
stream.subscribe(value => console.log(value)); // 3, 2, 1, 0
```

## 同构 TypeScript

当一个项目在客户端（通常是前端）和服务端（后端）都使用 TypeScript 时，就称为同构 TypeScript（Isomorphic TypeScript）。基于 TypeScript 类型的类型安全 RPC 框架对这类项目尤其有益，因为类型可以在客户端和服务端之间共享。

为了充分利用这一点，应将两端共用的类型移到单独的文件或包中。

```typescript
//shared.ts
export class User {
    id: number = 0;
    username: string = '';
}

//server.ts
import { rpc } from '@deepkit/rpc';
import { User } from './shared';

@rpc.controller('/user')
export class UserController {
    constructor(private database: Database) {}

    @rpc.action()
    async getUser(id: number): Promise<User> {
        return await this.database.query(User).filter({ id }).findOne();
    }
}

//client.ts
import type { UserController } from './server';

const controller = client.controller<UserController>('/user');
const user = await controller.getUser(2);
```

向后兼容可以像普通本地 API 一样实现：要么将新参数标记为可选，要么添加新的方法。

## 后续步骤

- [入门](./rpc/getting-started.md)：安装和完整示例
- [WebSocket](./rpc/websocket.md)、[TCP](./rpc/tcp.md) 和 [HTTP](./rpc/http.md)：各种传输方式
- [IPC](./rpc/ipc.md)：基于共享内存、message port 和管道的 worker threads、Web Workers 与子进程通信
- [错误](./rpc/errors.md) 和 [安全](./rpc/security.md)
- [基准测试](/benchmarks)：Deepkit 各个包的性能
