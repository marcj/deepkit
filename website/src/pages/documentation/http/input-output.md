# Input & Output

The input and output of an HTTP route is the data that is sent to the server and the data that is sent back to the client. This includes the path parameters, query parameters, body, headers, and the response itself. In this chapter, we will look at how to read, deserialize, validate, and write data in an HTTP route.

## Input

All the following input variations function in the same way for both the functional and the controller API. They allow data to be read from an HTTP request in a typesafe and decoupled manner. This not only leads to significantly increased security, but also simplifies unit testing, since strictly speaking, not even an HTTP request object needs to exist to test the route.

All parameters are automatically converted (deserialized) to the defined TypeScript type and validated. This is done via Deepkit Runtime Types and its [Serialization](../runtime-types/serialization.md) and [Validation](../runtime-types/validation) features.

For simplicity, all examples with the functional API are shown below.

### Path Parameters

Path parameters are values extracted from the URL of the route. The type of the value depends on the type at the associated parameter of the function or method. The conversion is done automatically with the feature [Soft Type Conversion](../runtime-types/serialization#soft-type-conversion).

```typescript
router.get('/:text', (text: string) => {
    return 'Hello ' + text;
});
```

```sh
$ curl http://localhost:8080/galaxy
Hello galaxy
```

If a Path parameter is defined as a type other than string, it will be converted correctly.

```typescript
router.get('/user/:id', (id: number) => {
    return `${id} ${typeof id}`;
});
```

```sh
$ curl http://localhost:8080/user/23
23 number
```

Additional validation constraints can also be applied to the types.

```typescript
import { Positive } from '@deepkit/type';

router.get('/user/:id', (id: number & Positive) => {
    return `${id} ${typeof id}`;
});
```

All validation types from `@deepkit/type` can be applied. For more on this, see [HTTP Validation](#validation).

The Path parameters have `[^]+` set as a regular expression by default in the URL matching. The RegExp for this can be customized as follows:

```typescript
import { HttpRegExp } from '@deepkit/http';
import { Positive } from '@deepkit/type';

router.get('/user/:id', (id: HttpRegExp<number & Positive, '[0-9]+'>) => {
    return `${id} ${typeof id}`;
});
```

This is only necessary in exceptional cases, because often the types in combination with validation types themselves already correctly restrict possible values.

### Query Parameters

Query parameters are values from the URL after the `?` character and can be read with the `HttpQuery<T>` type. The name of the parameter corresponds to the name of the query parameter.

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

Query parameters are also automatically deserialized and validated.

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

All validation types from `@deepkit/type` can be applied. For more on this, see [HTTP Validation](#validation).

Warning: Parameter values are not escaped/sanitized. Their direct return in a string in a route as HTML opens a security hole (XSS). Make sure that external input is never trusted and filtere/sanitize/convert data where necessary.

### Query Model

With a large number of query parameters, it can quickly become confusing. To bring order back in here, a model (class or interface) can be used, which summarizes all possible query parameters.

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

The properties in the specified model can contain all TypeScript types and validation types that `@deepkit/type` supports. See the chapter [Serialization](../runtime-types/serialization.md) and [Validation](../runtime-types/validation.md).

### Body

For HTTP methods that allow an HTTP body, a body model can also be specified. The body content type of the HTTP request must be either `application/x-www-form-urlencoded`, `multipart/form-data` or `application/json` so that Deepkit can automatically convert this to JavaScript objects.

```typescript
import { HttpBody } from '@deepkit/type';

class HelloWorldBody {
    text!: string;
}

router.post('/', (body: HttpBody<HelloWorldBody>) => {
    return 'Hello ' + body.text;
}
```

### Header

### Stream

### Manual Validation Handling

To manually take over the validation of the body model, a special type `HttpBodyValidation<T>` can be used. It allows to receive also invalid body data and to react very specifically to error messages.

```typescript
import { HttpBodyValidation } from '@deepkit/type';

class HelloWorldBody {
    text!: string;
}

router.post('/', (body: HttpBodyValidation<HelloWorldBody>) => {
    if (!body.valid()) {
        // Houston, we got some errors.
        const textError = body.getErrorMessageForPath('text');
        return 'Text is invalid, please fix it. ' + textError;
    }

    return 'Hello ' + body.text;
})
```

As soon as `valid()` returns `false`, the values in the specified model may be in a faulty state. This means that the validation has failed. If `HttpBodyValidation` is not used and an incorrect HTTP request is received, the request would be directly aborted and the code in the function would never be executed. Use `HttpBodyValidation` only if, for example, error messages regarding the body should be manually processed in the same route.

The properties in the specified model can contain all TypeScript types and validation types that `@deepkit/type` supports. See the chapter [Serialization](../runtime-types/serialization.md) and [Validation](../runtime-types/validation.md).

### File Upload

A special property type on the body model can be used to allow the client to upload files. Any number of `UploadedFile` can be used.

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

By default, Router saves all uploaded files to a temp folder and removes them once the code in the route has been executed. It is therefore necessary to read the file in the specified path in `path` and save it to a permanent location (local disk, cloud storage, database).

## Validation

Validation in an HTTP server is a mandatory functionality, because almost always work with data that is not trustworthy. The more places data is validated, the more stable the server is. Validation in HTTP routes can be conveniently used via types and validation constraints and is checked with a highly optimized validator from `@deepkit/type`, so there are no performance problems in this regard. It is therefore highly recommended to use these validation capabilities as well. Better one time too much, than one time too little.

All inputs such as path parameters, query parameters, and body parameters are automatically validated for the specified TypeScript type. If additional constraints are specified via types of `@deepkit/type`, these are also checked.

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

See [Validation](../runtime-types/validation.md) for more information on this.

## Output

A route can return various data structures. Some of them are handled in a special way, such as redirects and templates, and others, such as simple objects, are simply sent as JSON.

### JSON

By default, normal JavaScript values are returned to the client as JSON with the header `applicationjson; charset=utf-8`.

```typescript
router.get('/', () => {
    // will be sent as application/json
    return { hello: 'world' }
});
```

If an explicit return type is specified for the function or method, the data is serialized to JSON with the Deepkit JSON Serializer according to this type.

```typescript
interface ResultType {
    hello: string;
}

router.get('/', (): ResultType => {
    // will be sent as application/json and additionalProperty is dropped
    return { hello: 'world', additionalProperty: 'value' };
});
```

### HTML

To send HTML there are two possibilities. Either the object `HtmlResponse` or Template Engine with JSX is used.

```typescript
import { HtmlResponse } from '@deepkit/http';

router.get('/', () => {
    // will be sent as Content-Type: text/html
    return new HtmlResponse('<b>Hello World</b>');
});
```

```typescript
router.get('/', () => {
    // will be sent as Content-Type: text/html
    return <b>Hello
    World < /b>;
});
```

The template engine variant with JSX has the advantage that used variables are automatically HTML-escaped. See also [Template](../template.md).

### Custom Content Type

Besides HTML and JSON it is also possible to send text or binary data with a specific content type. This is done via the object `Response`.

```typescript
import { Response } from '@deepkit/http';

router.get('/', () => {
    return new Response('<title>Hello World</title>', 'text/xml');
});
```

### HTTP Errors

By throwing various HTTP errors, it is possible to immediately interrupt the processing of an HTTP request and output the corresponding HTTP status of the error.

```typescript
import { HttpNotFoundError } from '@deepkit/http';

router.get('/user/:id', async (id: number, database: Database) => {
    const user = await database.query(User).filter({ id }).findOneOrUndefined();
    if (!user) throw new HttpNotFoundError('User not found');
    return user;
});
```

By default, all errors are returned to the client as JSON. This behavior can be customized in the event system under the event `httpWorkflow.onControllerError`. See the section [HTTP Events](./events.md).

| Error class               | Status |
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

The error `HttpAccessDeniedError` is a special case. As soon as it is thrown, the HTTP workflow (see [HTTP Events](./events.md)) does not jump to `controllerError` but to `accessDenied`.

Custom HTTP errors can be created and thrown with `createHttpError`.

```typescript
export class HttpMyError extends createHttpError(412, 'My Error Message') {
}
```

Thrown errors in a controller action are handled by the HTTP workflow event `onControllerError`. The default implementation is to return a JSON response with the error messag and status code. This can be customized by listening to this event and returning a different response.

```typescript
import { httpWorkflow } from '@deepkit/http';

new App()
    .listen(httpWorkflow.onControllerError, (event) => {
        if (event.error instanceof HttpMyError) {
            event.send(new Response('My Error Message', 'text/plain').status(500));
        } else {
            //for all other errors, return a generic error message
            event.send(new Response('Something went wrong. Sorry about that.', 'text/plain').status(500));
        }
    })
    .listen(httpWorkflow.onAccessDenied, (event) => {
        event.send(new Response('Access denied. Try to login first.', 'text/plain').status(403));
    });
```

### Additional headers

To modify the header of an HTTP response, additional methods can be called on the `Response`, `JSONResponse`, and `HTMLResponse` objects.

```typescript
import { Response } from '@deepkit/http';

router.get('/', () => {
    return new Response('Access Denied', 'text/plain')
        .header('X-Reason', 'unknown')
        .status(403);
});
```

### Redirect

To return a 301 or 302 redirect as a response, `Redirect.toRoute` or `Redirect.toUrl` can be used.

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

The `Redirect.toRoute` method uses the route name here. How to set a route name can be seen in the section [HTTP Route Names](./getting-started.md#route-names). If this referenced route (query or path) contains parameters, they can be specified via the second argument:

```typescript
router.get({ path: '/user/:id', name: 'user_detail' }, (id: number) => {

});

router.post('/user', (user: HttpBody<User>) => {
    //... store user and redirect to its detail page
    return Redirect.toRoute('user_detail', { id: 23 });
});
```

Alternatively, you can redirect to a URL with `Redirect.toUrl`.

```typescript
router.post('/user', (user: HttpBody<User>) => {
    //... store user and redirect to its detail page
    return Redirect.toUrl('/user/' + 23);
});
```

By default, both use a 302 forwarding. This can be customized via the `statusCode` argument.

## Resolver

Router supports a way to resolve complex parameter types. For example, given a route such as `/user/:id`, this `id` can be resolved to a `user` object outside the route using a resolver. This further decouples HTTP abstraction and route code, further simplifying testing and modularity.

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

The decorator in `@http.resolveParameter` specifies which class is to be resolved with the `UserResolver`. As soon as the specified class `User` is specified as a parameter in the function or method, the resolver is used to provide it.

If `@http.resolveParameter` is specified at the class, all methods of this class get this resolver. The decorator can also be applied per method:

```typescript
class MyWebsite {
    @http.GET('/user/:id').resolveParameter(User, UserResolver)
    getUser(user: User) {
        return 'Hello ' + user.username;
    }
}
```

Also, the functional API can be used:

```typescript

router.add(
    http.GET('/user/:id').resolveParameter(User, UserResolver),
    (user: User) => {
        return 'Hello ' + user.username;
    }
);
```

The `User` object does not necessarily have to depend on a parameter. It could just as well depend on a session or an HTTP header, and only be provided when the user is logged in. In `RouteParameterResolverContext` a lot of information about the HTTP request is available, so that many use cases can be mapped.

In principle, it is also possible to have complex parameter types provided via the Dependency Injection container from the `http` scope, since these are also available in the route function or method. However, this has the disadvantage that no asynchronous function calls can be used, since the DI container is synchronous throughout.
