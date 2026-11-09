# TypeScript 后端框架

Deepkit Framework 是一个 TypeScript 后端框架，在这里，同一个类型既是校验器，也是 JSON 格式、数据库 schema 和 API 文档。它将 HTTP 和 RPC 服务器、ORM、依赖注入、CLI 和配置集成在一个应用中。

```typescript
//app.ts
import { App } from '@deepkit/app';
import { FrameworkModule } from '@deepkit/framework';
import { http, HttpBody } from '@deepkit/http';
import { Logger } from '@deepkit/logger';
import { Email, MinLength } from '@deepkit/type';

interface CreateUser {
    username: string & MinLength<3>;
    email: string & Email;
}

class UserService {
    constructor(private logger: Logger) {}

    create(input: CreateUser) {
        this.logger.log(`New user ${input.username}`);
        return { id: 1, ...input };
    }
}

class UserController {
    constructor(private users: UserService) {}

    @http.POST('/users')
    create(body: HttpBody<CreateUser>) {
        return this.users.create(body);
    }
}

new App({
    controllers: [UserController],
    providers: [UserService],
    imports: [new FrameworkModule()],
}).run();
```

```sh
$ ts-node app.ts server:start

$ curl -X POST localhost:8080/users -H 'content-type: application/json' \
    -d '{"username":"Peter","email":"peter@example.com"}'
{"id":1,"username":"Peter","email":"peter@example.com"}

$ curl -X POST localhost:8080/users -H 'content-type: application/json' \
    -d '{"username":"ab","email":"nope"}'
HTTP/1.1 400 Bad Request
{
  "message": "Validation error: ...",
  "errors": [
    {
      "path": "username",
      "code": "minLength",
      "message": "Min length is 3",
      "value": "ab"
    },
    ...
  ]
}
```

在方法运行之前，请求体会根据 `CreateUser` interface 进行校验，而 `UserService` 则根据其类型自动注入。使用 `npm init @deepkit/app@latest my-app` 即可创建新项目。

## 与 NestJS 和 Express 的比较

|                      | Deepkit Framework              | NestJS                                 | Express 或 Fastify        |
| -------------------- | ------------------------------ | -------------------------------------- | ------------------------- |
| 请求校验             | 基于 TypeScript 类型           | 使用装饰器标注的类和校验 pipe          | 需自行添加                |
| 依赖注入             | 内置，无需装饰器               | 内置，需使用 `@Injectable()`           | 需自行添加                |
| ORM                  | 内置                           | 需自行添加                             | 需自行添加                |
| RPC                  | 内置                           | 通过 transport 添加                    | 需自行添加                |
| 构建步骤             | Deepkit 类型编译器             | TypeScript 编译器                      | 可选                      |

Deepkit 需要在构建流程中使用其[类型编译器](./runtime-types/getting-started.md)，因为它会在运行时读取你的类型。Express 和 NestJS 的生态系统要大得多，这一点可能比内置功能更重要。性能数据请参阅[基准测试页面](/benchmarks)。

## 框架包含的内容

Deepkit Framework 基于 `@deepkit/app` 中的 [Deepkit App](./app.md)，并在 `@deepkit/framework` 中提供了 `FrameworkModule` 模块，你可以在应用中导入该模块。

`App` 抽象提供：

- CLI 命令
- 配置加载（环境变量、dotfile、自定义）
- 模块系统
- 强大的服务容器
- 用于 controller、provider、listener 等的注册表和 hook

`FrameworkModule` 模块提供以下附加功能：

- 应用服务器
    - HTTP 服务器
    - RPC 服务器
    - 多进程负载均衡
    - SSL
- 调试 CLI 命令
- 数据库迁移配置/命令
- 通过 `{debug: true}` 选项启用的调试/Profiler GUI
- 交互式 API 文档（类似 Swagger）
- DatabaseRegistry、ProcessLocking、Broker、Sessions 的 provider
- 集成测试 API

无论是否使用 `FrameworkModule`，你都可以编写应用。

## 安装

Deepkit Framework 基于 [Deepkit App](./app.md)。请确保你已按照其安装说明完成安装。
完成后，你就可以安装 Deepkit Framework，并在 `App` 中导入 `FrameworkModule`。

```sh
npm install @deepkit/framework
```

```typescript
import { App } from '@deepkit/app';
import { FrameworkModule } from '@deepkit/framework';
import { Logger } from '@deepkit/logger';

const app = new App({
    imports: [new FrameworkModule({ debug: true })]
});

app.command('test', (logger: Logger) => {
    logger.log('Hello World!');
});

app.run();
```

由于应用现在导入了 `FrameworkModule`，可以看到多了一些按主题分组的命令。

其中之一是 `server:start`，它用于启动 HTTP 服务器。要使用它，我们至少需要注册一个 HTTP 路由。

```typescript
import { App } from '@deepkit/app';
import { FrameworkModule } from '@deepkit/framework';
import { HttpRouterRegistry } from '@deepkit/http';
import { Logger } from '@deepkit/logger';

const app = new App({
    imports: [new FrameworkModule({ debug: true })]
});

app.command('test', (logger: Logger) => {
    logger.log('Hello World!');
});


const router = app.get(HttpRouterRegistry);

router.get('/', () => {
    return 'Hello World';
})

app.run();
```

再次执行 `server:start` 命令时，你会看到 HTTP 服务器已经启动，并且路由 `/` 已可访问。

```sh
$ ts-node app.ts server:start
```

```sh
$ curl http://localhost:8080/
Hello World
```

要处理请求，请阅读 [HTTP](http.md) 或 [RPC](rpc.md) 章节。在 [App](app.md) 章节中，你可以进一步了解 CLI 命令。

## App

`App` 类是应用的主入口。它负责加载所有模块和配置，并启动应用。
它还负责加载并执行所有 CLI 命令。FrameworkModule 等模块会提供额外的命令、注册事件监听器，并提供 HTTP/RPC controller、服务 provider 等。

这个 `app` 对象还可用于在不运行 CLI controller 的情况下访问依赖注入容器。

```typescript
const app = new App({
    imports: [new FrameworkModule]
});

//获取对所有已注册服务的访问
const eventDispatcher = app.get(EventDispatcher);
```

你之所以能获取 `EventDispatcher`，是因为 `FrameworkModule` 将它注册为服务 provider，此外还注册了许多其他服务（Logger、ApplicationServer 以及[更多](https://github.com/deepkit/deepkit-framework/blob/master/packages/framework/src/module.ts)）。

你也可以注册自己的服务。

```typescript

class MyService {
    constructor(private logger: Logger) {
    }

    helloWorld() {
        this.logger.log('Hello World');
    }
}

const app = new App({
    providers: [MyService],
    imports: [new FrameworkModule]
});

const service = app.get(MyService);

service.helloWorld();
```

### 调试器

应用及所有模块的配置值都可以在调试器中查看。在 `FrameworkModule` 中启用 debug 选项，然后打开 `http://localhost:8080/_debug/configuration`。

```typescript
import { App } from '@deepkit/app';
import { FrameworkModule } from '@deepkit/framework';

new App({
    imports: [
        new FrameworkModule({
            debug: true,
        })
    ]
}).run();
```

![调试器配置](/assets/documentation/framework/debugger-configuration.png)

你也可以使用 `ts-node app.ts debug:config` 显示所有可用的配置选项，以及它们的当前值、默认值、描述和数据类型。

## 事件

Deepkit Framework 提供了多种事件 token，可以在其上注册事件监听器。

请参阅[事件](./app/events.md)章节，进一步了解事件的工作原理。

### 分发事件

事件通过 `EventDispatcher` 类发送。在 Deepkit 应用中，可以通过依赖注入获取它。

```typescript
import { cli, Command } from '@deepkit/app';
import { BaseEvent, EventDispatcher, EventToken } from '@deepkit/event';

class UserEvent extends BaseEvent {
    constructor(public user: { username: string }) {
        super();
    }
}

const UserAdded = new EventToken<UserEvent>('user.added');

@cli.controller('test')
export class TestCommand implements Command {
    constructor(protected eventDispatcher: EventDispatcher) {
    }

    async execute() {
        const event = new UserEvent({ username: 'Peter' });
        await this.eventDispatcher.dispatch(UserAdded, event);
    }
}
```
