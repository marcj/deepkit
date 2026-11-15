# 入门

由于 Deepkit HTTP 基于 Runtime Types，因此必须先正确安装 Runtime Types。请参阅 [Runtime Type 安装](../runtime-types/getting-started.md)。

完成此步骤后，即可安装 `@deepkit/app`，或者安装已在底层使用该库的 Deepkit 框架。

```sh
npm install @deepkit/http
```

请注意，`@deepkit/http` 的 controller API 基于 TypeScript 注解，因此一旦使用 controller API，就必须相应地通过 `experimentalDecorators` 启用此功能。
如果不使用类，则无需启用此功能。

_文件：tsconfig.json_

```json
{
  "compilerOptions": {
    "module": "CommonJS",
    "target": "es6",
    "moduleResolution": "node",
    "experimentalDecorators": true
  },
  "reflection": true
}
```

安装该库后，即可直接使用其 API。

## 函数式 API

函数式 API 基于函数，可以通过路由注册表进行注册，而路由注册表可以通过应用的 DI 容器获取。

```typescript
import { App } from '@deepkit/app';
import { FrameworkModule } from '@deepkit/framework';
import { HttpRouterRegistry } from '@deepkit/http';

const app = new App({
    imports: [new FrameworkModule]
});

const router = app.get(HttpRouterRegistry);

router.get('/', () => {
    return "Hello World!";
});

app.run();
```

使用模块后，函数式路由也可以由模块动态提供。

```typescript
import { App, createModuleClass } from '@deepkit/app';
import { FrameworkModule } from '@deepkit/framework';
import { HttpRouterRegistry } from '@deepkit/http';

class MyModule extends createModuleClass({}) {
  override process() {
    this.configureProvider<HttpRouterRegistry>(router => {
      router.get('/', () => {
        return "Hello World!";
      });
    });
  }
}

const app = new App({
  imports: [new FrameworkModule, new MyModule]
});
```

请参阅 [框架模块](../app/modules)，了解有关 App 模块的更多信息。

## Controller API

Controller API 基于类，可以通过 App-API 的 `controllers` 选项进行注册。

```typescript
import { App } from '@deepkit/app';
import { FrameworkModule } from '@deepkit/framework';
import { http } from '@deepkit/http';

class MyPage {
    @http.GET('/')
    helloWorld() {
        return "Hello World!";
    }
}

new App({
    controllers: [MyPage],
    imports: [new FrameworkModule]
}).run();
```

使用模块后，controller 也可以由模块提供。

```typescript
import { App, createModuleClass } from '@deepkit/app';
import { FrameworkModule } from '@deepkit/framework';
import { http } from '@deepkit/http';

class MyPage {
  @http.GET('/')
  helloWorld() {
    return "Hello World!";
  }
}

class MyModule extends createModuleClass({}) {
  override process() {
    this.addController(MyPage);
  }
}

const app = new App({
  imports: [new FrameworkModule, new MyModule]
});
```

若要动态提供 controller（例如根据配置选项），可以使用 `process` 钩子。

```typescript
class MyModuleConfiguration {
    debug: boolean = false;
}

class MyModule extends createModuleClass({
    config: MyModuleConfiguration
}) {
    override process() {
        if (this.config.debug) {
            class DebugController {
                @http.GET('/debug/')
                root() {
                    return 'Hello Debugger';
                }
            }
            this.addController(DebugController);
        }
    }
}
```

请参阅 [框架模块](../app/modules)，了解有关 App 模块的更多信息。

## HTTP 服务器

如果使用 Deepkit Framework，则已内置 HTTP 服务器。不过，HTTP 库也可以在不使用 Deepkit 框架的情况下配合自己的 HTTP 服务器使用，例如在 Express 中、通过 `Bun.serve`、`Deno.serve`、Cloudflare Workers 或 AWS Lambda。

```typescript
import { createServer } from 'http';
import { HttpKernel, HttpRequest, HttpResponse } from '@deepkit/http';

const app = new App({
    controllers: [MyPage],
    imports: [new HttpModule]
});

const httpKernel = app.get(HttpKernel);

createServer(
    { IncomingMessage: HttpRequest, ServerResponse: HttpResponse as any },
    (req, res) => httpKernel.handleRequestMaybeSync(req, res),
).listen(8080, () => {
    console.log('listen at 8080');
});
```

请参阅 [服务器与运行时](./runtimes.md)，了解运行 HTTP kernel 的所有方式。

## HTTP 客户端

Deepkit HTTP 不需要特殊的客户端。任何 HTTP 客户端都可以使用，例如在浏览器、Node.js、Bun 和 Deno 中均可用的 `fetch` API。

JSON 响应只包含 JSON 类型，因此 `Date` 会以字符串形式到达，并且无法保证数据的结构。如果在服务器和客户端之间共享类型，`@deepkit/type` 会使用与服务器相同的类型来转换和验证响应。

```typescript
import { cast } from '@deepkit/type';

interface User {
    id: number;
    username: string;
    created: Date;
}

const response = await fetch('http://localhost:8080/user/1');
if (!response.ok) throw new Error(`Request failed with status ${response.status}`);

// 将 "created" 从 ISO 字符串转换为 Date 并验证结果。
// 如果数据与 User 不匹配，则抛出 ValidationError。
const user = cast<User>(await response.json());
```

根据需求，可以使用以下几个函数：

| 函数                   | 描述                                                                                                         |
|------------------------|--------------------------------------------------------------------------------------------------------------|
| `cast<T>(data)`        | 转换数据（例如将 ISO 字符串转换为 `Date`，将 `'2'` 转换为 `2`）并进行验证。无效时抛出 `ValidationError`。 |
| `deserialize<T>(data)` | 转换数据但不进行验证。仅用于可信来源。                                                                       |
| `is<T>(data)`          | 类型守卫。如果数据已匹配该类型则返回 `true`，不进行转换。                                                    |
| `assert<T>(data)`      | 与 `is` 类似，但会抛出 `ValidationError` 而不是返回 `false`。                                               |
| `validate<T>(data)`    | 返回 `ValidationErrorItem` 数组，如果数据有效则为空数组。                                                   |

同样的类型也可用于在发送请求体之前对其进行检查，例如在表单中提前显示错误。服务器无论如何都会验证请求体（请参阅 [输入与输出](./input-output.md)）。

```typescript
import { MinLength, validate } from '@deepkit/type';

interface CreateUser {
    username: string & MinLength<3>;
}

const body: CreateUser = { username: 'Pe' };
const errors = validate<CreateUser>(body);
if (errors.length) {
    // [{ path: 'username', code: 'minLength', message: 'Min length is 3', ... }]
} else {
    await fetch('http://localhost:8080/user', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
    });
}
```

如果服务器因输入无效而拒绝请求，它会以状态码 400 和 JSON 响应体 `{ message: string, errors: { path, code, message }[] }` 进行响应。

请参阅 [序列化](../runtime-types/serialization.md) 和 [验证](../runtime-types/validation.md) 了解全部详情。

## 路由名称

可以为路由指定一个唯一名称，以便在转发时引用。根据所用 API 的不同，定义名称的方式也有所不同。

```typescript
//函数式 API
router.get({
    path: '/user/:id',
    name: 'userDetail'
}, (id: number) => {
    return {userId: id};
});

//controller API
class UserController {
    @http.GET('/user/:id').name('userDetail')
    userDetail(id: number) {
        return {userId: id};
    }
}
```

对于所有具有名称的路由，都可以通过 `Router.resolveUrl()` 获取其 URL。

```typescript
import { HttpRouter } from '@deepkit/http';
const router = app.get(HttpRouter);
router.resolveUrl('userDetail', {id: 2}); //=> '/user/2'
```

## 安全

## 会话
