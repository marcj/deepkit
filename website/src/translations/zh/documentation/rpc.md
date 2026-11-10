# TypeScript RPC 框架

Deepkit RPC 是一个面向 TypeScript 的类型安全 RPC 框架。你只需在服务器上编写一个普通的 Class,就可以从客户端调用它的 Method,参数和结果会根据你的 TypeScript 类型进行验证,而且无需代码生成。

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

客户端只导入 controller 的类型,因此不会有任何服务器代码进入客户端 bundle。`Date` 到达客户端时是真正的 `Date`,而无效调用会在 Method 运行之前被拒绝。有关安装,请参阅[入门指南](./rpc/getting-started.md)。

## 与 tRPC 和 gRPC 的比较

|                    | Deepkit RPC                         | tRPC                                  | gRPC                                   |
| ------------------ | ----------------------------------- | ------------------------------------- | -------------------------------------- |
| API 定义           | TypeScript Class 和类型             | 带 procedure 的 Router                | `.proto` 文件                          |
| 代码生成           | 无                                  | 无                                    | 必需                                   |
| 运行时验证         | 内置,基于 TypeScript 类型           | 借助 Zod 等 schema 库                 | 仅消息结构                             |
| 传输格式           | 二进制(BSON)                      | JSON                                  | 二进制(Protocol Buffers)             |
| 传输层             | WebSocket、TCP                      | HTTP、WebSocket                       | HTTP/2                                 |
| 语言               | TypeScript                          | TypeScript                            | 多种语言                               |

Deepkit RPC 需要在构建中使用 [Deepkit 类型编译器](./runtime-types/getting-started.md),因为它会在运行时读取你的类型。如果 API 需要供其他公司或普通 HTTP 客户端调用,请改用 [Deepkit HTTP](./http.md);如果多种编程语言编写的服务之间需要相互通信,请使用 gRPC。

## 什么是 RPC?

RPC 是 Remote Procedure Call(远程过程调用)的缩写,它允许像调用本地 Function 一样调用远程服务器上的 Function。HTTP 客户端-服务器通信使用 HTTP Method 和 URL 进行映射,而 RPC 则使用 Function 名称进行映射。要发送的数据作为普通的 Function Argument 传递,服务器上 Function 调用的结果会发送回客户端。

RPC 的优点在于客户端-服务器抽象非常轻量,因为它不涉及 header、URL、查询字符串等内容。缺点是服务器上通过 RPC 提供的 Function 无法轻松地由浏览器调用,通常需要特定的客户端。

RPC 的一个关键特性是客户端和服务器之间的数据会自动进行序列化和反序列化。因此,通常可以实现类型安全的 RPC 客户端。一些 RPC 框架要求用户以特定格式提供类型(Parameter 类型和 Return Value 类型)。这种格式可以是 DSL(例如 gRPC 使用的 Protocol Buffers),也可以是 JavaScript schema 构建器。RPC 框架还可以提供额外的数据验证,但并非所有框架都支持。

Deepkit RPC 直接从 TypeScript 代码本身提取类型。一旦在[验证](./runtime-types/validation.md)中定义了额外的限制,它们就会被自动验证。由于 RPC 本质上基于异步通信,客户端上的所有 Function 调用都会返回 `Promise`,并通过 `await` 接收结果。

## 使用 RxJS 进行流式传输

Action 可以返回 `Observable`。客户端同样会收到一个 `Observable`,服务器每发出一个值,客户端就会收到该值,这使得 Deepkit RPC 非常适合实时通信。

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

当一个项目在客户端(通常是前端)和服务器(后端)都使用 TypeScript 时,就称为同构 TypeScript(Isomorphic TypeScript)。基于 TypeScript 类型的类型安全 RPC 框架对这类项目尤其有益,因为类型可以在客户端和服务器之间共享。

要利用这一点,应将两端都使用的类型移到单独的文件或包中。

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

向后兼容的实现方式与普通本地 API 相同:要么将新 Parameter 标记为可选,要么添加新的 Method。

## 后续步骤

- [入门指南](./rpc/getting-started.md):安装和完整示例
- [传输](./rpc/websocket.md):WebSocket、TCP 以及自定义传输
- [错误](./rpc/errors.md)和[安全](./rpc/security.md)
- [性能基准](/benchmarks):Deepkit 各个包的性能
