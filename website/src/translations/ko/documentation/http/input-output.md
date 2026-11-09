# 입력 및 출력

HTTP route의 입력과 출력은 서버로 전송되는 데이터와 클라이언트로 다시 전송되는 데이터를 말합니다. 여기에는 path parameter, query parameter, body, header, 그리고 response 자체가 포함됩니다. 이 장에서는 HTTP route에서 데이터를 읽고, deserialize하고, 검증하고, 쓰는 방법을 살펴봅니다.

## 입력

다음의 모든 입력 방식은 functional API와 controller API에서 동일하게 동작합니다. 이를 통해 HTTP request에서 type-safe하고 분리된 방식으로 데이터를 읽을 수 있습니다. 이는 보안을 크게 향상시킬 뿐만 아니라, 엄밀히 말해 route를 테스트하는 데 HTTP request 객체조차 필요하지 않으므로 unit test도 단순해집니다.

모든 parameter는 정의된 TypeScript type으로 자동 변환(deserialize)되고 검증됩니다. 이는 Deepkit Runtime Types와 해당 [Serialization](../runtime-types/serialization.md) 및 [Validation](../runtime-types/validation) 기능을 통해 이루어집니다.

간단히 설명하기 위해 아래의 모든 예제는 functional API로 작성되어 있습니다.

### Path Parameter

Path parameter는 route의 URL에서 추출된 값입니다. 값의 type은 function 또는 method의 해당 parameter에 지정된 type에 따라 결정됩니다. 변환은 [Soft Type Conversion](../runtime-types/serialization#soft-type-conversion) 기능을 통해 자동으로 이루어집니다.

```typescript
router.get('/:text', (text: string) => {
    return 'Hello ' + text;
});
```

```sh
$ curl http://localhost:8080/galaxy
Hello galaxy
```

Path parameter가 string이 아닌 다른 type으로 정의되면 해당 type으로 올바르게 변환됩니다.

```typescript
router.get('/user/:id', (id: number) => {
    return `${id} ${typeof id}`;
});
```

```sh
$ curl http://localhost:8080/user/23
23 number
```

type에 추가적인 validation constraint를 적용할 수도 있습니다.

```typescript
import { Positive } from '@deepkit/type';

router.get('/user/:id', (id: number & Positive) => {
    return `${id} ${typeof id}`;
});
```

`@deepkit/type`의 모든 validation type을 적용할 수 있습니다. 자세한 내용은 [HTTP Validation](#validation)을 참조하세요.

Path parameter에는 URL 매칭 시 기본적으로 정규식 `[^]+`가 설정됩니다. 이 RegExp는 다음과 같이 사용자 정의할 수 있습니다:

```typescript
import { HttpRegExp } from '@deepkit/http';
import { Positive } from '@deepkit/type';

router.get('/user/:id', (id: HttpRegExp<number & Positive, '[0-9]+'>) => {
    return `${id} ${typeof id}`;
});
```

이는 예외적인 경우에만 필요합니다. 대개 type과 validation type의 조합만으로도 가능한 값을 올바르게 제한할 수 있기 때문입니다.

### Query Parameter

Query parameter는 URL에서 `?` 문자 뒤에 오는 값이며 `HttpQuery<T>` type으로 읽을 수 있습니다. parameter의 이름은 query parameter의 이름과 일치합니다.

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

Query parameter도 자동으로 deserialize되고 검증됩니다.

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

`@deepkit/type`의 모든 validation type을 적용할 수 있습니다. 자세한 내용은 [HTTP Validation](#validation)을 참조하세요.

경고: Parameter 값은 escape되거나 sanitize되지 않습니다. route에서 이 값을 문자열에 직접 포함하여 HTML로 반환하면 보안 취약점(XSS)이 발생합니다. 외부 입력을 절대 신뢰하지 말고 필요한 경우 데이터를 필터링/sanitize/변환하세요.

### Query Model

query parameter가 많아지면 금방 복잡해질 수 있습니다. 이를 정리하기 위해 가능한 모든 query parameter를 하나로 묶는 model(class 또는 interface)을 사용할 수 있습니다.

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

지정된 model의 property에는 `@deepkit/type`이 지원하는 모든 TypeScript type과 validation type을 사용할 수 있습니다. [Serialization](../runtime-types/serialization.md) 및 [Validation](../runtime-types/validation.md) 장을 참조하세요.

### Body

HTTP body를 허용하는 HTTP method의 경우 body model도 지정할 수 있습니다. Deepkit이 이를 JavaScript 객체로 자동 변환하려면 HTTP request의 body content type이 `application/x-www-form-urlencoded`, `multipart/form-data` 또는 `application/json` 중 하나여야 합니다.

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

### 수동 Validation 처리

body model의 validation을 직접 처리하려면 특수 type인 `HttpBodyValidation<T>`를 사용할 수 있습니다. 이를 사용하면 유효하지 않은 body 데이터도 받을 수 있고 오류 메시지에 매우 구체적으로 대응할 수 있습니다.

```typescript
import { HttpBodyValidation } from '@deepkit/http';

class HelloWorldBody {
    text!: string;
}

router.post('/', (body: HttpBodyValidation<HelloWorldBody>) => {
    if (!body.valid()) {
        // 휴스턴, 오류가 발생했습니다.
        const textError = body.getErrorMessageForPath('text');
        return 'Text is invalid, please fix it. ' + textError;
    }

    return 'Hello ' + body.text;
})
```

`valid()`가 `false`를 반환하면 지정된 model의 값이 잘못된 상태일 수 있습니다. 이는 validation이 실패했음을 의미합니다. `HttpBodyValidation`을 사용하지 않은 상태에서 잘못된 HTTP request가 수신되면 request는 즉시 중단되고 function 내의 코드는 실행되지 않습니다. 예를 들어 body에 관한 오류 메시지를 동일한 route에서 직접 처리해야 하는 경우에만 `HttpBodyValidation`을 사용하세요.

지정된 model의 property에는 `@deepkit/type`이 지원하는 모든 TypeScript type과 validation type을 사용할 수 있습니다. [Serialization](../runtime-types/serialization.md) 및 [Validation](../runtime-types/validation.md) 장을 참조하세요.

### 파일 업로드

body model에 특수한 property type을 사용하면 클라이언트가 파일을 업로드할 수 있습니다. `UploadedFile`은 개수 제한 없이 사용할 수 있습니다.

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

기본적으로 Router는 업로드된 모든 파일을 임시 폴더에 저장하고 route의 코드 실행이 끝나면 이를 삭제합니다. 따라서 `path`에 지정된 경로의 파일을 읽어 영구적인 위치(로컬 디스크, 클라우드 스토리지, 데이터베이스)에 저장해야 합니다.

## Validation

HTTP 서버에서 validation은 필수 기능입니다. 거의 항상 신뢰할 수 없는 데이터를 다루기 때문입니다. 데이터를 검증하는 지점이 많을수록 서버는 더 안정적입니다. HTTP route의 validation은 type과 validation constraint를 통해 편리하게 사용할 수 있으며, `@deepkit/type`의 고도로 최적화된 validator로 검사되므로 성능 문제도 없습니다. 따라서 이러한 validation 기능을 적극적으로 사용할 것을 강력히 권장합니다. 부족한 것보다는 한 번 더 검증하는 편이 낫습니다.

path parameter, query parameter, body parameter와 같은 모든 입력은 지정된 TypeScript type에 맞는지 자동으로 검증됩니다. `@deepkit/type`의 type을 통해 추가 constraint를 지정하면 이 또한 검사됩니다.

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

자세한 내용은 [Validation](../runtime-types/validation.md)을 참조하세요.

## 출력

route는 다양한 데이터 구조를 반환할 수 있습니다. redirect나 template과 같은 일부는 특별한 방식으로 처리되고, 단순 객체와 같은 다른 것들은 그대로 JSON으로 전송됩니다.

### JSON

기본적으로 일반 JavaScript 값은 `applicationjson; charset=utf-8` header와 함께 JSON으로 클라이언트에 반환됩니다.

```typescript
router.get('/', () => {
    // application/json으로 전송됩니다
    return { hello: 'world' }
});
```

function 또는 method에 명시적인 return type이 지정되면 데이터는 해당 type에 따라 Deepkit JSON Serializer로 JSON으로 serialize됩니다.

```typescript
interface ResultType {
    hello: string;
}

router.get('/', (): ResultType => {
    // application/json으로 전송되며 additionalProperty는 제거됩니다
    return { hello: 'world', additionalProperty: 'value' };
});
```

### HTML

HTML을 전송하는 방법은 두 가지입니다. `HtmlResponse` 객체를 사용하거나 JSX 기반 Template Engine을 사용합니다.

```typescript
import { HtmlResponse } from '@deepkit/http';

router.get('/', () => {
    // Content-Type: text/html로 전송됩니다
    return new HtmlResponse('<b>Hello World</b>');
});
```

```typescript
router.get('/', () => {
    // Content-Type: text/html로 전송됩니다
    return <b>Hello
    World < /b>;
});
```

JSX를 사용하는 template engine 방식은 사용된 변수가 자동으로 HTML escape된다는 장점이 있습니다. [Template](../template.md)도 참조하세요.

### 사용자 정의 Content Type

HTML과 JSON 외에 특정 content type으로 텍스트 또는 바이너리 데이터를 전송할 수도 있습니다. 이는 `Response` 객체를 통해 수행합니다.

```typescript
import { Response } from '@deepkit/http';

router.get('/', () => {
    return new Response('<title>Hello World</title>', 'text/xml');
});
```

### HTTP Error

다양한 HTTP error를 throw하면 HTTP request 처리를 즉시 중단하고 해당 error의 HTTP status를 출력할 수 있습니다.

```typescript
import { HttpNotFoundError } from '@deepkit/http';

router.get('/user/:id', async (id: number, database: Database) => {
    const user = await database.query(User).filter({ id }).findOneOrUndefined();
    if (!user) throw new HttpNotFoundError('User not found');
    return user;
});
```

기본적으로 모든 error는 JSON으로 클라이언트에 반환됩니다. 이 동작은 event system의 `httpWorkflow.onControllerError` event에서 사용자 정의할 수 있습니다. [HTTP Events](./events.md) 섹션을 참조하세요.

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

`HttpAccessDeniedError`는 특수한 경우입니다. 이 error가 throw되면 HTTP workflow([HTTP Events](./events.md) 참조)는 `controllerError`가 아니라 `accessDenied`로 이동합니다.

사용자 정의 HTTP error는 `createHttpError`로 생성하고 throw할 수 있습니다.

```typescript
export class HttpMyError extends createHttpError(412, 'My Error Message') {
}
```

controller action에서 throw된 error는 HTTP workflow event `onControllerError`에서 처리됩니다. 기본 구현은 error 메시지와 status code가 포함된 JSON response를 반환합니다. 이 event를 listen하여 다른 response를 반환하도록 사용자 정의할 수 있습니다.

```typescript
import { httpWorkflow } from '@deepkit/http';

new App()
    .listen(httpWorkflow.onControllerError, (event) => {
        if (event.error instanceof HttpMyError) {
            event.send(new Response('My Error Message', 'text/plain').status(500));
        } else {
            //그 외 모든 error에 대해 일반적인 error 메시지를 반환합니다
            event.send(new Response('Something went wrong. Sorry about that.', 'text/plain').status(500));
        }
    })
    .listen(httpWorkflow.onAccessDenied, (event) => {
        event.send(new Response('Access denied. Try to login first.', 'text/plain').status(403));
    });
```

### 추가 Header

HTTP response의 header를 수정하려면 `Response`, `JSONResponse`, `HTMLResponse` 객체에서 추가 method를 호출할 수 있습니다.

```typescript
import { Response } from '@deepkit/http';

router.get('/', () => {
    return new Response('Access Denied', 'text/plain')
        .header('X-Reason', 'unknown')
        .status(403);
});
```

### Redirect

301 또는 302 redirect를 response로 반환하려면 `Redirect.toRoute` 또는 `Redirect.toUrl`을 사용할 수 있습니다.

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

여기서 `Redirect.toRoute` method는 route 이름을 사용합니다. route 이름을 설정하는 방법은 [HTTP Route Names](./getting-started.md#route-names) 섹션에서 확인할 수 있습니다. 참조된 route(query 또는 path)에 parameter가 포함되어 있으면 두 번째 argument를 통해 지정할 수 있습니다:

```typescript
router.get({ path: '/user/:id', name: 'user_detail' }, (id: number) => {

});

router.post('/user', (user: HttpBody<User>) => {
    //... user를 저장하고 상세 페이지로 redirect합니다
    return Redirect.toRoute('user_detail', { id: 23 });
});
```

또는 `Redirect.toUrl`을 사용하여 URL로 redirect할 수 있습니다.

```typescript
router.post('/user', (user: HttpBody<User>) => {
    //... user를 저장하고 상세 페이지로 redirect합니다
    return Redirect.toUrl('/user/' + 23);
});
```

기본적으로 둘 다 302 redirect를 사용합니다. 이는 `statusCode` argument로 사용자 정의할 수 있습니다.

## Resolver

Router는 복잡한 parameter type을 resolve하는 방법을 지원합니다. 예를 들어 `/user/:id`와 같은 route가 있을 때, resolver를 사용하면 route 외부에서 이 `id`를 `user` 객체로 resolve할 수 있습니다. 이를 통해 HTTP 추상화와 route 코드가 더욱 분리되어 테스트와 모듈화가 한층 쉬워집니다.

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

`@http.resolveParameter` decorator는 `UserResolver`로 resolve할 class를 지정합니다. 지정된 class `User`가 function 또는 method의 parameter로 지정되면 resolver가 이를 제공합니다.

`@http.resolveParameter`를 class에 지정하면 해당 class의 모든 method에 이 resolver가 적용됩니다. decorator는 method별로 적용할 수도 있습니다:

```typescript
class MyWebsite {
    @http.GET('/user/:id').resolveParameter(User, UserResolver)
    getUser(user: User) {
        return 'Hello ' + user.username;
    }
}
```

functional API도 사용할 수 있습니다:

```typescript

router.add(
    http.GET('/user/:id').resolveParameter(User, UserResolver),
    (user: User) => {
        return 'Hello ' + user.username;
    }
);
```

`User` 객체가 반드시 parameter에 의존할 필요는 없습니다. session이나 HTTP header에 의존하여 사용자가 로그인한 경우에만 제공되도록 할 수도 있습니다. `RouteParameterResolverContext`에서는 HTTP request에 관한 많은 정보를 사용할 수 있으므로 다양한 사용 사례에 대응할 수 있습니다.

원칙적으로 복잡한 parameter type을 `http` scope의 Dependency Injection container를 통해 제공하는 것도 가능합니다. 이들 역시 route function 또는 method에서 사용할 수 있기 때문입니다. 하지만 DI container는 전체가 동기식이므로 비동기 function 호출을 사용할 수 없다는 단점이 있습니다.
