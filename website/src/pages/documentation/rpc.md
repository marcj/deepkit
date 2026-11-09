# TypeScript RPC Framework

Deepkit RPC is a type-safe RPC framework for TypeScript. You write a normal class on the server and call its methods from the client, with parameters and results validated from your TypeScript types and no code generation.

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

The client imports only the type of the controller, so no server code ends up in the client bundle. The `Date` arrives as a real `Date`, and the invalid call is rejected before the method runs. See [Getting Started](./rpc/getting-started.md) for the installation.

## Comparison with tRPC and gRPC

|                    | Deepkit RPC                         | tRPC                                  | gRPC                                   |
| ------------------ | ----------------------------------- | ------------------------------------- | -------------------------------------- |
| API definition     | TypeScript class and types          | Router with procedures                | `.proto` files                         |
| Code generation    | None                                | None                                  | Required                               |
| Runtime validation | Built in, from the TypeScript types | With a schema library such as Zod     | Message structure only                 |
| Wire format        | Binary (BSON)                       | JSON                                  | Binary (Protocol Buffers)              |
| Transport          | WebSocket, TCP                      | HTTP, WebSocket                       | HTTP/2                                 |
| Languages          | TypeScript                          | TypeScript                            | Many                                   |

Deepkit RPC needs the [Deepkit type compiler](./runtime-types/getting-started.md) in your build, because it reads your types at runtime. For an API that other companies or plain HTTP clients call, use [Deepkit HTTP](./http.md) instead, and use gRPC when services in several programming languages have to talk to each other.

## What is RPC?

RPC, which stands for Remote Procedure Call, allows functions on a remote server to be called as if they were local functions. Unlike HTTP client-server communication, which uses HTTP methods and a URL for mapping, RPC uses the function name for mapping. The data to be sent is passed as normal function arguments, and the result of the function call on the server is sent back to the client.

The advantage of RPC is that the client-server abstraction is lightweight because it does not work with headers, URLs, query strings, or similar. The disadvantage is that functions on a server via RPC cannot be easily called by a browser and often require a specific client.

One key feature of RPC is that the data between the client and server is automatically serialized and deserialized. Therefore, typesafe RPC clients are usually possible. Some RPC frameworks force users to provide types (parameter types and return types) in a specific format. This can be in the form of a DSL such as Protocol Buffers for gRPC or a JavaScript schema builder. Additional data validation can also be provided by the RPC framework but is not supported by all.

Deepkit RPC extracts types from the TypeScript code itself. Once additional restrictions are defined in [Validation](./runtime-types/validation.md), they are automatically validated. Because RPC is fundamentally based on asynchronous communication, all function calls on the client return a `Promise`, and the result is received with `await`.

## Streaming with RxJS

An action can return an `Observable`. The client receives one too, and each value arrives as the server emits it, which makes Deepkit RPC suitable for real-time communication.

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

//on the client
const numbers = client.controller<NumbersController>('/numbers');
const stream = await numbers.countdown(3);
stream.subscribe(value => console.log(value)); // 3, 2, 1, 0
```

## Isomorphic TypeScript

When a project uses TypeScript on both the client (usually frontend) and server (backend), it is called Isomorphic TypeScript. A typesafe RPC framework based on TypeScript's types is particularly beneficial for such a project because types can be shared between the client and server.

To take advantage of this, types that are used on both sides should be moved to their own file or package.

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

Backward compatibility can be implemented in the same way as with a normal local API: either new parameters are marked as optional or a new method is added.

## Next steps

- [Getting Started](./rpc/getting-started.md): installation and a complete example
- [Transport](./rpc/transport.md): WebSocket, TCP and your own transport
- [Errors](./rpc/errors.md) and [Security](./rpc/security.md)
- [Benchmarks](/benchmarks): performance of Deepkit's packages
