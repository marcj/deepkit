# 输入与输出

HTTP 路由的输入和输出是指发送到服务器的数据以及返回给客户端的数据，包括路径参数、查询参数、body、header 以及响应本身。在本章中，我们将介绍如何在 HTTP 路由中读取、反序列化、验证和写入数据。

## 输入

以下所有输入方式在函数式 API 和控制器 API 中的工作方式都相同。它们能够以类型安全且解耦的方式从 HTTP 请求中读取数据。这不仅能显著提高安全性，还能简化单元测试，因为严格来说，测试路由时甚至不需要存在 HTTP 请求对象。

所有参数都会自动转换（反序列化）为所定义的 TypeScript 类型并进行验证。这是通过 Deepkit Runtime Types 及其 [序列化](../runtime-types/serialization.md) 和 [验证](../runtime-types/validation) 功能实现的。

为简单起见，下面的所有示例均使用函数式 API。

### 路径参数

路径参数是从路由 URL 中提取的值。值的类型取决于函数或方法中对应参数的类型。转换通过 [软类型转换](../runtime-types/serialization#soft-type-conversion) 功能自动完成。

```typescript
router.get('/:text', (text: string) => {
    return 'Hello ' + text;
});
```

```sh
$ curl http://localhost:8080/galaxy
Hello galaxy
```

如果路径参数被定义为 string 以外的类型，它也会被正确转换。

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

`@deepkit/type` 中的所有验证类型都可以使用。更多相关内容，请参阅 [HTTP 验证](#validation)。

在 URL 匹配中，路径参数默认使用正则表达式 `[^]+`。可以按如下方式自定义该 RegExp：

```typescript
import { HttpRegExp } from '@deepkit/http';
import { Positive } from '@deepkit/type';

router.get('/user/:id', (id: HttpRegExp<number & Positive, '[0-9]+'>) => {
    return `${id} ${typeof id}`;
});
```

这仅在特殊情况下才需要，因为通常类型与验证类型的组合本身就已经能够正确限制可能的取值。

### 查询参数

查询参数是 URL 中 `?` 字符之后的值，可以通过 `HttpQuery<T>` 类型读取。参数的名称与查询参数的名称相对应。

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

查询参数同样会自动进行反序列化和验证。

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

`@deepkit/type` 中的所有验证类型都可以使用。更多相关内容，请参阅 [HTTP 验证](#validation)。

警告：参数值不会被转义或清理。在路由中将其直接放入字符串并作为 HTML 返回会造成安全漏洞（XSS）。请确保绝不信任外部输入，并在必要时对数据进行过滤、清理或转换。

### 查询模型

当查询参数数量较多时，代码很快就会变得混乱。为了让代码重新变得清晰，可以使用一个模型（类或接口）来汇总所有可能的查询参数。

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

指定模型中的属性可以使用 `@deepkit/type` 支持的所有 TypeScript 类型和验证类型。请参阅 [序列化](../runtime-types/serialization.md) 和 [验证](../runtime-types/validation.md) 章节。

### Body

对于允许 HTTP body 的 HTTP 方法，还可以指定 body 模型。HTTP 请求的 body 内容类型必须是 `application/x-www-form-urlencoded`、`multipart/form-data` 或 `application/json`，这样 Deepkit 才能自动将其转换为 JavaScript 对象。

```typescript
import { HttpBody } from '@deepkit/http';

class HelloWorldBody {
    text!: string;
}

router.post('/', (body: HttpBody<HelloWorldBody>) => {
    return 'Hello ' + body.text;
}
```

### Header

### Stream

### 手动处理验证

要手动接管 body 模型的验证，可以使用特殊类型 `HttpBodyValidation<T>`。它允许接收无效的 body 数据，并针对错误消息做出非常具体的响应。

```typescript
import { HttpBodyValidation } from '@deepkit/http';

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

一旦 `valid()` 返回 `false`，指定模型中的值就可能处于错误状态，这表示验证失败。如果未使用 `HttpBodyValidation` 且收到了不正确的 HTTP 请求，该请求将被直接中止，函数中的代码也永远不会执行。仅在确有需要时才使用 `HttpBodyValidation`，例如需要在同一路由中手动处理有关 body 的错误消息时。

指定模型中的属性可以使用 `@deepkit/type` 支持的所有 TypeScript 类型和验证类型。请参阅 [序列化](../runtime-types/serialization.md) 和 [验证](../runtime-types/validation.md) 章节。

### 文件上传

可以在 body 模型上使用一种特殊的属性类型，以允许客户端上传文件。可以使用任意数量的 `UploadedFile`。

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

默认情况下，Router 会将所有上传的文件保存到临时文件夹，并在路由中的代码执行完毕后将其删除。因此，需要读取 `path` 中指定路径的文件，并将其保存到永久位置（本地磁盘、云存储、数据库）。

## 验证

验证是 HTTP 服务器中必不可少的功能，因为服务器几乎总是在处理不可信的数据。数据验证的位置越多，服务器就越稳定。HTTP 路由中的验证可以通过类型和验证约束方便地使用，并由 `@deepkit/type` 中高度优化的验证器进行检查，因此在这方面不存在性能问题。强烈建议充分使用这些验证功能。宁可多验证一次，也不要少验证一次。

路径参数、查询参数和 body 参数等所有输入都会根据指定的 TypeScript 类型自动进行验证。如果通过 `@deepkit/type` 的类型指定了额外的约束，这些约束也会被检查。

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

更多相关信息，请参阅 [验证](../runtime-types/validation.md)。

## 输出

路由可以返回各种数据结构。其中一些会以特殊方式处理，例如重定向和模板，而其他的，例如简单对象，则直接以 JSON 形式发送。

### JSON

默认情况下，普通的 JavaScript 值会以 JSON 形式返回给客户端，并带有 header `applicationjson; charset=utf-8`。

```typescript
router.get('/', () => {
    // 将以 application/json 发送
    return { hello: 'world' }
});
```

如果为函数或方法指定了显式的返回类型，数据将由 Deepkit JSON Serializer 根据该类型序列化为 JSON。

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

发送 HTML 有两种方式：使用 `HtmlResponse` 对象，或使用基于 JSX 的模板引擎。

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

使用 JSX 模板引擎的优点是，其中使用的变量会自动进行 HTML 转义。另请参阅 [模板](../template.md)。

### 自定义内容类型

除了 HTML 和 JSON，还可以发送具有特定内容类型的文本或二进制数据。这通过 `Response` 对象实现。

```typescript
import { Response } from '@deepkit/http';

router.get('/', () => {
    return new Response('<title>Hello World</title>', 'text/xml');
});
```

### HTTP 错误

通过抛出各种 HTTP 错误，可以立即中断 HTTP 请求的处理，并输出该错误对应的 HTTP 状态。

```typescript
import { HttpNotFoundError } from '@deepkit/http';

router.get('/user/:id', async (id: number, database: Database) => {
    const user = await database.query(User).filter({ id }).findOneOrUndefined();
    if (!user) throw new HttpNotFoundError('User not found');
    return user;
});
```

默认情况下，所有错误都以 JSON 形式返回给客户端。可以在事件系统中通过 `httpWorkflow.onControllerError` 事件自定义此行为。请参阅 [HTTP 事件](./events.md) 一节。

| Error 类                  | 状态   |
|---------------------------|--------|
| HttpBadRequestError       | 400    |
| HttpUnauthorizedError     | 401    |
| HttpAccessDeniedError     | 403    |
| HttpNotFoundError         | 404    |
| HttpMethodNotAllowedError | 405    |
| HttpNotAcceptableError    | 406    |
| HttpTimeoutError          | 408    |
| HttpConflictError         | 409    |
| HttpGoneError             | 410    |
| HttpTooManyRequestsError  | 429    |
| HttpInternalServerError   | 500    |
| HttpNotImplementedError   | 501    |

`HttpAccessDeniedError` 错误是一个特例。一旦抛出该错误，HTTP 工作流（参见 [HTTP 事件](./events.md)）不会跳转到 `controllerError`，而是跳转到 `accessDenied`。

可以使用 `createHttpError` 创建并抛出自定义 HTTP 错误。

```typescript
export class HttpMyError extends createHttpError(412, 'My Error Message') {
}
```

控制器 action 中抛出的错误由 HTTP 工作流事件 `onControllerError` 处理。默认实现是返回包含错误消息和状态码的 JSON 响应。可以通过监听此事件并返回不同的响应来自定义该行为。

```typescript
import { httpWorkflow } from '@deepkit/http';

new App()
    .listen(httpWorkflow.onControllerError, (event) => {
        if (event.error instanceof HttpMyError) {
            event.send(new Response('My Error Message', 'text/plain').status(500));
        } else {
            //对于所有其他错误，返回通用错误消息
            event.send(new Response('Something went wrong. Sorry about that.', 'text/plain').status(500));
        }
    })
    .listen(httpWorkflow.onAccessDenied, (event) => {
        event.send(new Response('Access denied. Try to login first.', 'text/plain').status(403));
    });
```

### 附加 header

要修改 HTTP 响应的 header，可以在 `Response`、`JSONResponse` 和 `HTMLResponse` 对象上调用其他方法。

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

这里的 `Redirect.toRoute` 方法使用路由名称。有关如何设置路由名称，请参阅 [HTTP 路由名称](./getting-started.md#route-names) 一节。如果所引用的路由（查询或路径）包含参数，可以通过第二个参数指定：

```typescript
router.get({ path: '/user/:id', name: 'user_detail' }, (id: number) => {

});

router.post('/user', (user: HttpBody<User>) => {
    //... 存储用户并重定向到其详情页
    return Redirect.toRoute('user_detail', { id: 23 });
});
```

或者，也可以使用 `Redirect.toUrl` 重定向到某个 URL。

```typescript
router.post('/user', (user: HttpBody<User>) => {
    //... 存储用户并重定向到其详情页
    return Redirect.toUrl('/user/' + 23);
});
```

默认情况下，两者都使用 302 跳转。可以通过 `statusCode` 参数对此进行自定义。

## 解析器

Router 提供了一种解析复杂参数类型的方式。例如，对于 `/user/:id` 这样的路由，可以使用解析器（resolver）在路由之外将此 `id` 解析为 `user` 对象。这进一步解耦了 HTTP 抽象和路由代码，从而进一步简化了测试并提高了模块化程度。

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

`@http.resolveParameter` 装饰器指定了要由 `UserResolver` 解析的类。一旦在函数或方法中将指定的类 `User` 声明为参数，就会使用该解析器来提供它。

如果在类上指定 `@http.resolveParameter`，则该类的所有方法都会使用此解析器。该装饰器也可以按方法应用：

```typescript
class MyWebsite {
    @http.GET('/user/:id').resolveParameter(User, UserResolver)
    getUser(user: User) {
        return 'Hello ' + user.username;
    }
}
```

也可以使用函数式 API：

```typescript

router.add(
    http.GET('/user/:id').resolveParameter(User, UserResolver),
    (user: User) => {
        return 'Hello ' + user.username;
    }
);
```

`User` 对象不一定要依赖于某个参数。它同样可以依赖于 session 或 HTTP header，并且仅在用户登录时才提供。`RouteParameterResolverContext` 中提供了大量有关 HTTP 请求的信息，因此可以覆盖许多用例。

原则上，也可以通过 `http` 作用域的依赖注入容器来提供复杂参数类型，因为这些类型同样可以在路由函数或方法中使用。但这样做的缺点是无法使用异步函数调用，因为 DI 容器自始至终都是同步的。
