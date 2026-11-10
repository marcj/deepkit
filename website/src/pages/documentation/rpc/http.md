# HTTP

Deepkit RPC can run over plain HTTP, besides [WebSocket](./websocket.md), [TCP](./tcp.md) and [IPC](./ipc.md): every action call is one HTTP request with a JSON response. The controllers stay the same, only the transport of the client changes.

This is useful when a persistent connection is not wanted or not possible:

- Server-side rendering, where every request of the page renders with its own short-lived client.
- Serverless and edge platforms that only forward HTTP requests.
- Proxies, load balancers and firewalls that don't pass WebSocket connections.
- Debugging: every call shows up in the network tab of the browser and can be repeated with `curl`.

The calls are still fully typed. Parameters and results are serialized with their TypeScript types, so `Date`, `bigint`, `Map`, `Set`, `Uint8Array`, enums, unions and classes arrive as what they are, and the server validates every parameter.

## Server

In a Deepkit app, set `httpRpcBasePath` of the `FrameworkModule`. All RPC controllers are then also available below that path, in addition to WebSocket:

```typescript
import { App } from '@deepkit/app';
import { FrameworkModule } from '@deepkit/framework';
import { rpc } from '@deepkit/rpc';
import { MinLength } from '@deepkit/type';

class User {
    created: Date = new Date();

    constructor(public id: number, public name: string & MinLength<3>) {}
}

@rpc.controller('user')
class UserController {
    @rpc.action()
    add(a: number, b: number): number {
        return a + b;
    }

    @rpc.action()
    create(user: User): User {
        return user;
    }
}

new App({
    controllers: [UserController],
    imports: [new FrameworkModule({ httpRpcBasePath: 'api/v1' })],
}).run();
```

The actions are now reachable at `/api/v1/user/add` and `/api/v1/user/create`.

## Client

Use `RpcHttpClientAdapter` as transport of a `RpcClient`. The rest of the API is the same as with WebSocket:

```typescript
import { RpcClient, RpcHttpClientAdapter } from '@deepkit/rpc';

const client = new RpcClient(new RpcHttpClientAdapter('https://example.com/api/v1'));
const user = client.controller<UserController>('user');

await user.add(2, 3); // 5
const created = await user.create(new User(1, 'Peter'));
created.created instanceof Date; // true
```

The client fetches the types of an action once, on its first call, and uses them to serialize the parameters and to deserialize the result. Like over WebSocket, a returned class is an instance of a class built from the types the server describes: it has the properties, but not the methods of your own class.

In a frontend with dependency injection, `createRpcHttpClientProvider` provides the client. Without an argument it uses the origin of the page:

```typescript
import { createRpcHttpClientProvider } from '@deepkit/rpc';

providers: [createRpcHttpClientProvider('https://example.com/api/v1')];
```

### Headers and the HTTP implementation

The second argument of `RpcHttpClientAdapter` are headers sent with every request. The third argument replaces `fetch`, for example with Angular's `HttpClient` so that server-side rendering can transfer the responses to the browser instead of requesting them again:

```typescript
import { HttpClient } from '@angular/common/http';
import { firstValueFrom } from 'rxjs';
import { RpcClient, RpcHttpClientAdapter, RpcHttpInterface, RpcHttpResponseInterface } from '@deepkit/rpc';

class AngularHttp implements RpcHttpInterface {
    constructor(private http: HttpClient) {}

    async fetch(url: string, options: { headers: { [name: string]: string }; method: string; body?: string }): Promise<RpcHttpResponseInterface> {
        const res = await firstValueFrom(
            this.http.request(options.method, url, { body: options.body, headers: options.headers, observe: 'response', responseType: 'json' }),
        );
        const headers: { [name: string]: string } = {};
        for (const key of res.headers.keys()) headers[key] = String(res.headers.get(key));
        return { status: res.status, headers, body: res.body };
    }
}

const client = new RpcClient(new RpcHttpClientAdapter('api/v1', {}, new AngularHttp(httpClient)));
```

When the transfer cache of Angular is used, include the header that marks errors, `RpcHttpHeaderNames`, so that an error response is still an error in the browser:

```typescript
import { RpcHttpHeaderNames } from '@deepkit/rpc';

provideClientHydration(withHttpTransferCacheOptions({ includeHeaders: RpcHttpHeaderNames, includePostRequests: true }));
```

## Authentication

A token set on the client is sent as `Authorization` header with every request:

```typescript
client.token.set('my-session-token');
```

The server authenticates each request with `RpcKernelSecurity.authenticate` (a failure is answered with `Authentication failed`, the reason is logged on the server), and `hasControllerAccess` decides about the access like for any other connection. A leading `Bearer ` is removed before the token is passed on. The session is available in the action through `SessionState`, and all providers of the `rpc` scope can be injected:

```typescript
import { RpcKernelSecurity, Session, SessionState, rpc } from '@deepkit/rpc';

class AppSecurity extends RpcKernelSecurity {
    async authenticate(token: any): Promise<Session> {
        const user = await findUserByToken(token);
        if (!user) throw new Error('Invalid token');
        return new Session(user.name, token);
    }
}

@rpc.controller('user')
class UserController {
    constructor(private session: SessionState) {}

    @rpc.action()
    whoami(): string {
        return this.session.getSession().username;
    }
}

new App({
    controllers: [UserController],
    providers: [{ provide: RpcKernelSecurity, useClass: AppSecurity, scope: 'rpc' }],
    imports: [new FrameworkModule({ httpRpcBasePath: 'api/v1' })],
});
```

Since it is a header, the token has to be a string. A client without a token is anonymous.

## The requests

The protocol is plain enough to call it without a Deepkit client:

| Request                                       | What it does                                                                   |
| --------------------------------------------- | ------------------------------------------------------------------------------ |
| `GET /api/v1/user/add?arg=2&arg=3`            | Calls `add(2, 3)`. Used by the client when all parameters are primitive values. |
| `POST /api/v1/user/create` with `[{...}]`     | Calls `create(...)` with the JSON array as parameters.                         |
| `GET /api/v1/user/create.type`                | The types of the parameters and the result, which the client loads once.       |

```bash
curl 'https://example.com/api/v1/user/add?arg=2&arg=3'
# 5

curl -X POST -H 'Content-Type: application/json' \
  -d '[{"id": 1, "name": "Peter"}]' https://example.com/api/v1/user/create
# {"created":"2026-01-02T03:04:05.000Z","id":1,"name":"Peter"}
```

Query parameters are converted to the types of the parameters, so `?arg=2` is the number `2` for a `number` parameter. The response is the result serialized as JSON, a `Date` is an ISO string and a `bigint` a string, for example.

An error, including a failed validation, is answered with the header `X-Rpc-Error` and the error as body. The client throws it again, with its class when it is registered (see [Errors](./errors)):

```json
{
    "classType": "@error:validation",
    "properties": {
        "name": "ValidationError",
        "errors": [{ "path": "user.name", "code": "minLength", "message": "Min length is 3", "value": "ab" }]
    }
}
```

## Limitations

Every call is a request of its own, and a response is one value. Everything that needs a connection is only available over WebSocket or TCP:

- Actions that return an `Observable`, `Subject`, `BehaviorSubject`, `ProgressTracker` or `Collection`. Over HTTP they fail with an error that says so.
- Progress of uploads and downloads, and back controllers (the server calling the client).
- Peer-to-peer messages and entity patches.

Each call also costs a full HTTP request, which is slower than a call over an existing WebSocket or TCP connection. For many calls in a row, or for live data, use WebSocket.

A `bigint` has no size limit over HTTP. Over WebSocket and TCP a plain `bigint` is a 64 bit integer; use `BinaryBigInt` for larger values.
