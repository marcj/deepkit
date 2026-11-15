# Getting Started

Since Deepkit HTTP is based on Runtime Types, it is necessary to have Runtime Types already installed correctly. See [Runtime Type Installation](../runtime-types/getting-started.md).

If this is done successfully, `@deepkit/app` can be installed or the Deepkit framework which already uses the library under the hood.

```sh
npm install @deepkit/http
```

Note that `@deepkit/http` for the controller API is based on TypeScript annotations and this feature must be enabled accordingly with `experimentalDecorators` once the controller API is used.
If you don't use classes, you don't need to enable this feature.

_File: tsconfig.json_

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

Once the library is installed, the API of it can be used directly.

## Functional API

The functional API is based on functions and can be registered via the router registry, which can be obtained via the DI container of the app.

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

Once modules are used, functional routes can also be provided dynamically by modules.

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

See [Framework Modules](../app/modules), to learn more about App Modules.

## Controller API

The controller API is based on classes and can be registered via the App-API under the option `controllers`.

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

Once modules are used, controllers can also be provided by modules.

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

To provide controllers dynamically (depending on the configuration option, for example), the `process` hook can be used.

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

See [Framework Modules](../app/modules), to learn more about App Modules.

## HTTP Server

If Deepkit Framework is used, an HTTP server is already built in. However, the HTTP library can also be used with its own HTTP server without using the Deepkit framework, inside Express, with `Bun.serve`, `Deno.serve`, Cloudflare Workers or AWS Lambda.

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

See [Server & Runtimes](./runtimes.md) for all ways to run the HTTP kernel.

## HTTP Client

Deepkit HTTP does not need a special client. Any HTTP client works, for example the `fetch` API that is available in browsers, Node.js, Bun, and Deno.

A JSON response contains only JSON types, so a `Date` arrives as a string and nothing guarantees the shape of the data. If you share the types between server and client, `@deepkit/type` converts and validates the response with the same type the server uses.

```typescript
import { cast } from '@deepkit/type';

interface User {
    id: number;
    username: string;
    created: Date;
}

const response = await fetch('http://localhost:8080/user/1');
if (!response.ok) throw new Error(`Request failed with status ${response.status}`);

// converts "created" from an ISO string to a Date and validates the result.
// Throws a ValidationError if the data does not match User.
const user = cast<User>(await response.json());
```

Depending on what you need, there are a few functions:

| Function               | Description                                                                                                  |
|------------------------|--------------------------------------------------------------------------------------------------------------|
| `cast<T>(data)`        | Converts the data (e.g. ISO string to `Date`, `'2'` to `2`) and validates it. Throws `ValidationError` if invalid. |
| `deserialize<T>(data)` | Converts the data without validating it. Use it only for trusted sources.                                    |
| `is<T>(data)`          | Type guard. Returns `true` if the data already matches the type, without converting it.                      |
| `assert<T>(data)`      | Like `is`, but throws a `ValidationError` instead of returning `false`.                                      |
| `validate<T>(data)`    | Returns an array of `ValidationErrorItem`, empty if the data is valid.                                       |

The same types can be used to check a request body before it is sent, for example to show errors in a form early. The server validates the body anyway (see [Input & Output](./input-output.md)).

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

If the server rejects a request because of invalid input, it responds with status 400 and a JSON body `{ message: string, errors: { path, code, message }[] }`.

See [Serialization](../runtime-types/serialization.md) and [Validation](../runtime-types/validation.md) for all details.

## Route Names

Routes can be given a unique name that can be referenced when forwarding. Depending on the API, the way a name is defined differs.

```typescript
//functional API
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

From all routes with a name the URL can be requested by `Router.resolveUrl()`.

```typescript
import { HttpRouter } from '@deepkit/http';
const router = app.get(HttpRouter);
router.resolveUrl('userDetail', {id: 2}); //=> '/user/2'
```

## Security

## Sessions

