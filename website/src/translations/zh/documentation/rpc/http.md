# HTTP

除了 [WebSocket](./websocket.md)、[TCP](./tcp.md) 和 [IPC](./ipc.md) 之外，Deepkit RPC 还可以通过普通 HTTP 运行：每次 action 调用都是一个返回 JSON 响应的 HTTP 请求。Controller 保持不变，只需更改客户端的传输方式。

当不需要或无法使用持久连接时，这非常有用：

- 服务端渲染（Server-side rendering），页面的每个请求都使用自己的短生命周期客户端进行渲染。
- 只转发 HTTP 请求的 Serverless 和边缘（edge）平台。
- 不转发 WebSocket 连接的代理、负载均衡器和防火墙。
- 调试：每次调用都会显示在浏览器的网络（network）面板中，并且可以使用 `curl` 重复执行。

调用仍然是完全类型化的。参数和结果会根据其 TypeScript 类型进行序列化，因此 `Date`、`bigint`、`Map`、`Set`、`Uint8Array`、枚举、联合类型和类都会以其原本的形式到达，并且服务器会验证每个参数。

## 服务器

在 Deepkit 应用中，设置 `FrameworkModule` 的 `httpRpcBasePath`。这样，除了 WebSocket 之外，所有 RPC controller 也都可以在该路径下访问：

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

现在可以通过 `/api/v1/user/add` 和 `/api/v1/user/create` 访问这些 action。

## 客户端

使用 `RpcHttpClientAdapter` 作为 `RpcClient` 的传输层。其余 API 与 WebSocket 相同：

```typescript
import { RpcClient, RpcHttpClientAdapter } from '@deepkit/rpc';

const client = new RpcClient(new RpcHttpClientAdapter('https://example.com/api/v1'));
const user = client.controller<UserController>('user');

await user.add(2, 3); // 5
const created = await user.create(new User(1, 'Peter'));
created.created instanceof Date; // true
```

客户端会在 action 首次调用时获取一次其类型，并使用这些类型来序列化参数和反序列化结果。与通过 WebSocket 时一样，返回的类是根据服务器所描述的类型构建出的类的实例：它拥有相应的属性，但没有你自己类中的方法。

在使用依赖注入的前端中，`createRpcHttpClientProvider` 用于提供客户端。不传参数时，它会使用页面的 origin：

```typescript
import { createRpcHttpClientProvider } from '@deepkit/rpc';

providers: [createRpcHttpClientProvider('https://example.com/api/v1')];
```

### Header 与 HTTP 实现

`RpcHttpClientAdapter` 的第二个参数是随每个请求发送的 header。第三个参数用于替换 `fetch`，例如替换为 Angular 的 `HttpClient`，这样服务端渲染就可以将响应传递给浏览器，而无需再次请求：

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

使用 Angular 的 transfer cache 时，请包含用于标记错误的 header `RpcHttpHeaderNames`，以便错误响应在浏览器中仍然是一个错误：

```typescript
import { RpcHttpHeaderNames } from '@deepkit/rpc';

provideClientHydration(withHttpTransferCacheOptions({ includeHeaders: RpcHttpHeaderNames, includePostRequests: true }));
```

## 认证

在客户端上设置的 token 会作为 `Authorization` header 随每个请求一起发送：

```typescript
client.token.set('my-session-token');
```

服务器使用 `RpcKernelSecurity.authenticate` 对每个请求进行认证（失败时返回 `Authentication failed`，具体原因会记录在服务器日志中），并且与其他任何连接一样，由 `hasControllerAccess` 决定访问权限。token 在传递之前会去掉开头的 `Bearer `。在 action 中可以通过 `SessionState` 获取 session，并且可以注入 `rpc` 作用域的所有 provider：

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

由于它是一个 header，token 必须是字符串。没有 token 的客户端是匿名的。

## 请求

该协议足够简单，无需 Deepkit 客户端即可调用：

| 请求                                          | 作用                                                                           |
| --------------------------------------------- | ------------------------------------------------------------------------------ |
| `GET /api/v1/user/add?arg=2&arg=3`            | 调用 `add(2, 3)`。当所有参数都是原始值时，客户端会使用此方式。                 |
| `POST /api/v1/user/create` 携带 `[{...}]`     | 以该 JSON 数组作为参数调用 `create(...)`。                                     |
| `GET /api/v1/user/create.type`                | 参数和结果的类型，客户端会加载一次。                                           |

```bash
curl 'https://example.com/api/v1/user/add?arg=2&arg=3'
# 5

curl -X POST -H 'Content-Type: application/json' \
  -d '[{"id": 1, "name": "Peter"}]' https://example.com/api/v1/user/create
# {"created":"2026-01-02T03:04:05.000Z","id":1,"name":"Peter"}
```

查询参数会被转换为参数的类型，因此对于 `number` 类型的参数，`?arg=2` 就是数字 `2`。响应是序列化为 JSON 的结果，例如 `Date` 为 ISO 字符串，`bigint` 为字符串。

错误（包括验证失败）会以 `X-Rpc-Error` header 返回，错误内容作为响应体。客户端会再次抛出该错误，如果其类已注册，则以该类抛出（参见 [错误](./errors)）：

```json
{
    "classType": "@error:validation",
    "properties": {
        "name": "ValidationError",
        "errors": [{ "path": "user.name", "code": "minLength", "message": "Min length is 3", "value": "ab" }]
    }
}
```

## 限制

每次调用都是一个独立的请求，响应只是一个值。所有需要连接的功能都只能通过 WebSocket 或 TCP 使用：

- 返回 `Observable`、`Subject`、`BehaviorSubject`、`ProgressTracker` 或 `Collection` 的 action。通过 HTTP 调用时，它们会失败并抛出说明此情况的错误。
- 上传和下载的进度，以及 back controller（服务器调用客户端）。
- 点对点（peer-to-peer）消息和实体补丁（entity patches）。

每次调用还需要一个完整的 HTTP 请求，这比通过已建立的 WebSocket 或 TCP 连接进行调用要慢。对于大量连续调用或实时数据，请使用 WebSocket。

通过 HTTP 时，`bigint` 没有大小限制。通过 WebSocket 和 TCP 时，普通的 `bigint` 是 64 位整数；对于更大的值，请使用 `BinaryBigInt`。
