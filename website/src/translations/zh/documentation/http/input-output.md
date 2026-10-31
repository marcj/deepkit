# 输入与输出

HTTP 路由的输入与输出是指发送到服务器的数据以及返回给客户端的数据。这包括路径参数、查询参数、请求体、请求头以及响应本身。在本章中，我们将介绍如何在 HTTP 路由中读取、反序列化、验证和写入数据。

## 输入

以下所有输入方式在函数式 API 和控制器 API 中的工作方式相同。它们允许以类型安全且解耦的方式从 HTTP 请求中读取数据。这不仅显著提升了安全性，也简化了单元测试，因为严格来说，测试路由时甚至不需要一个 HTTP 请求对象实际存在。

所有参数都会自动转换（反序列化）为定义的 TypeScript 类型并被验证。这通过 Deepkit 运行时类型及其 [序列化](../runtime-types/serialization.md) 和 [验证](../runtime-types/validation) 功能完成。

为简单起见，下面的示例均使用函数式 API。

### 路径参数

路径参数是从路由的 URL 中提取的值。其类型取决于函数或方法中对应参数的类型。转换会通过功能 [软类型转换](../runtime-types/serialization#soft-type-conversion) 自动完成。

```typescript
router.get('/:text', (text: string) => {
    return 'Hello ' + text;
});
```

```sh
$ curl http://localhost:8080/galaxy
Hello galaxy
```

如果路径参数被定义为非 string 类型，它也会被正确转换。

```typescript
router.get('/user/:id', (id: number) => {
    return `${id} ${typeof id}`;
});
```

```sh
$ curl http://localhost:8080/user/23
23 number
```

还可以对类型应用额外的验证约束。

```typescript
import { Positive } from '@deepkit/type';

router.get('/user/:id', (id: number & Positive) => {
    return `${id} ${typeof id}`;
});
```

可以应用来自 `@deepkit/type` 的所有验证类型。更多内容参见 [HTTP 验证](#validation)。

路径参数在 URL 匹配中默认使用 `[^]+` 作为正则表达式。可以如下自定义该正则表达式：

```typescript
import { HttpRegExp } from '@deepkit/http';
import { Positive } from '@deepkit/type';

router.get('/user/:id', (id: HttpRegExp<number & Positive, '[0-9]+'>) => {
    return `${id} ${typeof id}`;
});
```

这只在少数情况下是必要的，因为通常类型与验证类型的组合已经能正确限制可能的取值范围。

### 查询参数

查询参数是 URL 中 `?` 字符之后的值，可以通过 `HttpQuery<T>` 类型读取。参数名对应查询参数的名称。

```typescript
import { HttpQuery } from '@deepkit/http';

router.get('/', (text: HttpQuery<number>) => {
    return `Hello ${text}`;
});
```

```sh
$ curl http://localhost:8080/\?text\=galaxy
Hello galaxy
```

查询参数同样会被自动反序列化并验证。

```typescript
import { HttpQuery } from '@deepkit/http';
import { MinLength } from '@deepkit/type';

router.get('/', (text: HttpQuery<string> & MinLength<3>) => {
    return 'Hello ' + text;
}
```

```sh
$ curl http://localhost:8080/\?text\=galaxy
Hello galaxy
$ curl http://localhost:8080/\?text\=ga
error
```

可以应用来自 `@deepkit/type` 的所有验证类型。更多内容参见 [HTTP 验证](#validation)。

警告：参数值不会被转义/净化。将其直接作为字符串返回为 HTML 会造成安全漏洞（XSS）。务必不要信任外部输入，并在必要时对数据进行过滤/净化/转换。

### 查询模型

当查询参数数量较多时会很快变得混乱。为此可以使用一个模型（类或接口）来汇总所有可能的查询参数，从而恢复整洁。

```typescript
import { HttpQueries } from '@deepkit/http';

class HelloWorldQuery {
    text!: string;
    page: number = 0;
}

router.get('/', (query: HttpQueries<HelloWorldQuery>)
{
    return 'Hello ' + query.text + ' at page ' + query.page;
}
```

```sh
$ curl http://localhost:8080/\?text\=galaxy&page=1
Hello galaxy at page 1
```

指定模型中的属性可以包含 `@deepkit/type` 支持的所有 TypeScript 类型和验证类型。参见章节 [序列化](../runtime-types/serialization.md) 与 [验证](../runtime-types/validation.md)。

### 请求体

对于允许 HTTP 请求体的 HTTP 方法，也可以指定一个请求体模型。HTTP 请求的内容类型必须是 `application/x-www-form-urlencoded`、`multipart/form-data` 或 `application/json`，这样 Deepkit 才能自动将其转换为 JavaScript 对象。

```typescript
import { HttpBody } from '@deepkit/type';

class HelloWorldBody {
    text!: string;
}

router.post('/', (body: HttpBody<HelloWorldBody>) => {
    return 'Hello ' + body.text;
}
```

### 请求头

### 流

### 手动验证处理

要手动接管请求体模型的验证，可以使用特殊类型 `HttpBodyValidation<T>`。它允许接收无效的请求体数据，并且可以对错误信息做出非常具体的响应。

```typescript
import { HttpBodyValidation } from '@deepkit/type';

class HelloWorldBody {
    text!: string;
}

router.post('/', (body: HttpBodyValidation<HelloWorldBody>) => {
    if (!body.valid()) {
        // 休斯顿，我们遇到了一些错误。
        const textError = body.getErrorMessageForPath('text');
        return 'Text is invalid, please fix it. ' + textError;
    }

    return 'Hello ' + body.text;
})
```

一旦 `valid()` 返回 `false`，指定模型中的值可能处于错误状态。这意味着验证失败。如果不使用 `HttpBodyValidation` 且收到不正确的 HTTP 请求，请求将会被直接中止，函数中的代码将永远不会被执行。只有在需要在同一路由中手动处理关于请求体的错误消息时，才使用 `HttpBodyValidation`。

指定模型中的属性可以包含 `@deepkit/type` 支持的所有 TypeScript 类型和验证类型。参见章节 [序列化](../runtime-types/serialization.md) 与 [验证](../runtime-types/validation.md)。

### 文件上传

可以在请求体模型上使用特殊的属性类型来允许客户端上传文件。可以使用任意数量的 `UploadedFile`。

```typescript
import { UploadedFile, HttpBody } from '@deepkit/http';
import { readFileSync } from 'fs';

class HelloWordBody {
    file!: UploadedFile;
}

router.post('/', (body: HttpBody<HelloWordBody>) => {
    const content = readFileSync(body.file.path);

    return {
        uploadedFile: body.file
    };
})
```

```sh
$ curl http://localhost:8080/ -X POST -H "Content-Type: multipart/form-data" -F "file=@Downloads/23931.png"
{
    "uploadedFile": {
        "size":6430,
        "path":"/var/folders/pn/40jxd3dj0fg957gqv_nhz5dw0000gn/T/upload_dd0c7241133326bf6afddc233e34affa",
        "name":"23931.png",
        "type":"image/png",
        "lastModifiedDate":"2021-06-11T19:19:14.775Z"
    }
}
```

默认情况下，Router 会将所有上传的文件保存到临时文件夹，并在路由中的代码执行完毕后将其删除。因此有必要读取 `path` 中指定路径的文件，并将其保存到永久位置（本地磁盘、云存储、数据库）。

## 验证

HTTP 服务器中的验证是必备功能，因为几乎总是在与不可信数据打交道。数据被验证的地方越多，服务器就越稳定。HTTP 路由中的验证可以通过类型和验证约束方便地使用，并由 `@deepkit/type` 的高度优化的验证器进行检查，因此在这方面没有性能问题。因此强烈建议使用这些验证能力。宁可多一次，也不要少一次。

所有输入，如路径参数、查询参数和请求体参数，都会自动根据指定的 TypeScript 类型进行验证。如果通过 `@deepkit/type` 的类型指定了额外的约束，这些也会被检查。

```typescript
import { HttpQuery, HttpQueries, HttpBody } from '@deepkit/http';
import { MinLength } from '@deepkit/type';

router.get('/:text', (text: string & MinLength<3>) => {
    return 'Hello ' + text;
}

router.get('/', (text: HttpQuery<string> & MinLength<3>) => {
    return 'Hello ' + text;
}

interface MyQuery {
    text: string & MinLength<3>;
}

router.get('/', (query: HttpQueries<MyQuery>) => {
    return 'Hello ' + query.text;
});

router.post('/', (body: HttpBody<MyQuery>) => {
    return 'Hello ' + body.text;
});
```

更多信息参见 [验证](../runtime-types/validation.md)。

## 输出

路由可以返回多种数据结构。其中一些会被特殊处理，如重定向和模板，另一些如简单对象则会直接以 JSON 发送。

### JSON

默认情况下，普通的 JavaScript 值会以 `applicationjson; charset=utf-8` 头作为 JSON 返回给客户端。

```typescript
router.get('/', () => {
    // 将以 application/json 发送
    return { hello: 'world' }
});
```

如果为函数或方法指定了显式的返回类型，数据将根据该类型使用 Deepkit JSON 序列化器序列化为 JSON。

```typescript
interface ResultType {
    hello: string;
}

router.get('/', (): ResultType => {
    // 将以 application/json 发送，且 additionalProperty 会被丢弃
    return { hello: 'world', additionalProperty: 'value' };
});
```

### HTML

发送 HTML 有两种方式。可以使用 `HtmlResponse` 对象，或者使用带 JSX 的模板引擎。

```typescript
import { HtmlResponse } from '@deepkit/http';

router.get('/', () => {
    // 将以 Content-Type: text/html 发送
    return new HtmlResponse('<b>Hello World</b>');
});
```

```typescript
router.get('/', () => {
    // 将以 Content-Type: text/html 发送
    return <b>Hello
    World < /b>;
});
```

带 JSX 的模板引擎变体的优势在于，使用的变量会被自动进行 HTML 转义。另见 [模板](../template.md)。

### 自定义内容类型

除了 HTML 和 JSON，还可以以特定的内容类型发送文本或二进制数据。这通过 `Response` 对象完成。

```typescript
import { Response } from '@deepkit/http';

router.get('/', () => {
    return new Response('<title>Hello World</title>', 'text/xml');
});
```

### HTTP 错误

通过抛出各种 HTTP 错误，可以立即中断 HTTP 请求的处理，并输出对应错误的 HTTP 状态码。

```typescript
import { HttpNotFoundError } from '@deepkit/http';

router.get('/user/:id', async (id: number, database: Database) => {
    const user = await database.query(User).filter({ id }).findOneOrUndefined();
    if (!user) throw new HttpNotFoundError('User not found');
    return user;
});
```

默认情况下，所有错误都会以 JSON 返回给客户端。该行为可以在事件系统中的事件 `httpWorkflow.onControllerError` 进行自定义。参见 [HTTP 事件](./events.md) 章节。

| 错误类                     | 状态 |
|---------------------------|------|
| HttpBadRequestError       | 400  |
| HttpUnauthorizedError     | 401  |
| HttpAccessDeniedError     | 403  |
| HttpNotFoundError         | 404  |
| HttpMethodNotAllowedError | 405  |
| HttpNotAcceptableError    | 406  |
| HttpTimeoutError          | 408  |
| HttpConflictError         | 409  |
| HttpGoneError             | 410  |
| HttpTooManyRequestsError  | 429  |
| HttpInternalServerError   | 500  |
| HttpNotImplementedError   | 501  |

`HttpAccessDeniedError` 是一个特例。一旦它被抛出，HTTP 工作流（见 [HTTP 事件](./events.md)）不会跳转到 `controllerError`，而是跳转到 `accessDenied`。

可以通过 `createHttpError` 创建并抛出自定义 HTTP 错误。

```typescript
export class HttpMyError extends createHttpError(412, 'My Error Message') {
}
```

控制器动作中抛出的错误由 HTTP 工作流事件 `onControllerError` 处理。默认实现是返回包含错误消息和状态码的 JSON 响应。可以通过监听该事件并返回不同的响应来自定义此行为。

```typescript
import { httpWorkflow } from '@deepkit/http';

new App()
    .listen(httpWorkflow.onControllerError, (event) => {
        if (event.error instanceof HttpMyError) {
            event.send(new Response('My Error Message', 'text/plain').status(500));
        } else {
            // 对于所有其他错误，返回通用的错误消息
            event.send(new Response('Something went wrong. Sorry about that.', 'text/plain').status(500));
        }
    })
    .listen(httpWorkflow.onAccessDenied, (event) => {
        event.send(new Response('Access denied. Try to login first.', 'text/plain').status(403));
    });
```

### 附加响应头

要修改 HTTP 响应的头部，可以在 `Response`、`JSONResponse` 和 `HTMLResponse` 对象上调用附加方法。

```typescript
import { Response } from '@deepkit/http';

router.get('/', () => {
    return new Response('Access Denied', 'text/plain')
        .header('X-Reason', 'unknown')
        .status(403);
});
```

### 重定向

要返回 301 或 302 重定向作为响应，可以使用 `Redirect.toRoute` 或 `Redirect.toUrl`。

```typescript
import { Redirect } from '@deepkit/http';

router.get({ path: '/', name: 'homepage' }, () => {
    return <b>Hello
    World < /b>;
});

router.get({ path: '/registration/complete' }, () => {
    return Redirect.toRoute('homepage');
});
```

`Redirect.toRoute` 方法会使用路由名称。如何设置路由名称可见 [HTTP 路由名称](./getting-started.md#route-names) 一节。如果被引用的路由（查询或路径）包含参数，可以通过第二个参数指定：

```typescript
router.get({ path: '/user/:id', name: 'user_detail' }, (id: number) => {

});

router.post('/user', (user: HttpBody<User>) => {
    //... 保存用户并重定向到其详情页
    return Redirect.toRoute('user_detail', { id: 23 });
});
```

或者，可以使用 `Redirect.toUrl` 重定向到某个 URL。

```typescript
router.post('/user', (user: HttpBody<User>) => {
    //... 保存用户并重定向到其详情页
    return Redirect.toUrl('/user/' + 23);
});
```

默认情况下，两者都使用 302 重定向。可以通过 `statusCode` 参数进行自定义。

## 解析器

Router 支持一种解析复杂参数类型的方式。例如，对于像 `/user/:id` 这样的路由，可以使用解析器在路由之外将该 `id` 解析为一个 `user` 对象。这进一步解耦了 HTTP 抽象与路由代码，并进一步简化了测试和模块化。

```typescript
import { App } from '@deepkit/app';
import { FrameworkModule } from '@deepkit/framework';
import { http, RouteParameterResolverContext, RouteParameterResolver } from '@deepkit/http';

class UserResolver implements RouteParameterResolver {
    constructor(protected database: Database) {
    }

    async resolve(context: RouteParameterResolverContext) {
        if (!context.parameters.id) throw new Error('No :id given');
        return await this.database.getUser(parseInt(context.parameters.id, 10));
    }
}

@http.resolveParameter(User, UserResolver)
class MyWebsite {
    @http.GET('/user/:id')
    getUser(user: User) {
        return 'Hello ' + user.username;
    }
}

new App({
    controllers: [MyWebsite],
    providers: [UserDatabase, UserResolver],
    imports: [new FrameworkModule]
})
    .run();
```

`@http.resolveParameter` 中的装饰器指定了要使用 `UserResolver` 解析哪个类。一旦在函数或方法中将指定的类 `User` 作为参数，解析器就会被用来提供该对象。

如果在类上指定了 `@http.resolveParameter`，则该类的所有方法都会获得该解析器。装饰器也可以按方法应用：

```typescript
class MyWebsite {
    @http.GET('/user/:id').resolveParameter(User, UserResolver)
    getUser(user: User) {
        return 'Hello ' + user.username;
    }
}
```

同样，也可以使用函数式 API：

```typescript

router.add(
    http.GET('/user/:id').resolveParameter(User, UserResolver),
    (user: User) => {
        return 'Hello ' + user.username;
    }
);
```

`User` 对象不一定必须依赖于某个参数。它也可以依赖于会话或某个 HTTP 头部，并且只在用户已登录时才提供。在 `RouteParameterResolverContext` 中可以获取到大量关于 HTTP 请求的信息，从而可以覆盖许多用例。

原则上，也可以通过来自 `http` 作用域的依赖注入容器提供复杂的参数类型，因为它们也可用于路由函数或方法中。然而，这样做的缺点是不能使用异步函数调用，因为 DI 容器整体是同步的。