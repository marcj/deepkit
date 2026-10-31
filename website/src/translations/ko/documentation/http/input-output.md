# 입력 & 출력

HTTP route의 입력과 출력은 서버로 전송되는 데이터와 클라이언트로 다시 전송되는 데이터를 말합니다. 여기에는 path parameters, query parameters, body, headers, 그리고 response 자체가 포함됩니다. 이 장에서는 HTTP route에서 데이터를 읽고, deserialize하고, validate하고, 쓰는 방법을 살펴봅니다.

## 입력

아래의 모든 입력 방식은 functional API와 controller API 모두에서 동일하게 동작합니다. 이들은 HTTP 요청에서 데이터를 typesafe하고 decoupled한 방식으로 읽을 수 있게 합니다. 이는 보안이 크게 향상될 뿐 아니라, 엄밀히 말해 route를 테스트하기 위해 HTTP request 객체조차 필요하지 않기 때문에 유닛 테스트도 단순화됩니다.

모든 parameters는 정의된 TypeScript Type으로 자동 변환(deserialize)되고 validate됩니다. 이는 Deepkit Runtime Types와 그 [Serialization](../runtime-types/serialization.md) 및 [Validation](../runtime-types/validation) 기능을 통해 수행됩니다.

간단히 하기 위해, 아래에는 functional API 예시만 보여줍니다.

### Path Parameters

Path parameters는 route의 URL에서 추출된 값입니다. 값의 타입은 Function 또는 Method의 해당 Parameter의 타입에 따라 결정됩니다. 변환은 [Soft Type Conversion](../runtime-types/serialization#soft-type-conversion) 기능으로 자동으로 수행됩니다.

```typescript
router.get('/:text', (text: string) => {
    return 'Hello ' + text;
});
```

```sh
$ curl http://localhost:8080/galaxy
Hello galaxy
```

Path parameter가 string 이외의 Type으로 정의되면 올바르게 변환됩니다.

```typescript
router.get('/user/:id', (id: number) => {
    return `${id} ${typeof id}`;
});
```

```sh
$ curl http://localhost:8080/user/23
23 number
```

추가적인 validation constraints도 타입에 적용할 수 있습니다.

```typescript
import { Positive } from '@deepkit/type';

router.get('/user/:id', (id: number & Positive) => {
    return `${id} ${typeof id}`;
});
```

`@deepkit/type`의 모든 validation types를 적용할 수 있습니다. 이에 대한 자세한 내용은 [HTTP Validation](#validation)을 참고하세요.

Path parameters는 URL 매칭 시 기본적으로 정규식 `[^]+`가 설정됩니다. 이 RegExp는 다음과 같이 사용자 정의할 수 있습니다:

```typescript
import { HttpRegExp } from '@deepkit/http';
import { Positive } from '@deepkit/type';

router.get('/user/:id', (id: HttpRegExp<number & Positive, '[0-9]+'>) => {
    return `${id} ${typeof id}`;
});
```

이는 예외적인 경우에만 필요합니다. 대부분 Type과 validation types의 조합만으로도 가능한 값을 이미 올바르게 제한하기 때문입니다.

### Query Parameters

Query parameters는 URL에서 `?` 문자 이후의 값이며 `HttpQuery<T>` 타입으로 읽을 수 있습니다. Parameter의 이름은 query parameter의 이름과 동일합니다.

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

Query parameters도 자동으로 deserialize되고 validate됩니다.

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

`@deepkit/type`의 모든 validation types를 적용할 수 있습니다. 이에 대한 자세한 내용은 [HTTP Validation](#validation)을 참고하세요.

경고: Parameter 값은 escape/sanitize되지 않습니다. 이를 HTML로 route에서 문자열에 직접 반환하면 보안 취약점(XSS)이 발생합니다. 외부 입력은 절대 신뢰하지 말고 필요한 곳에서 filter/sanitize/convert 하세요.

### Query Model

Query parameters가 많아지면 쉽게 혼란스러워질 수 있습니다. 이를 정리하기 위해 모든 가능한 query parameters를 요약하는 model(Class 또는 Interface)을 사용할 수 있습니다.

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

지정된 model의 Properties는 `@deepkit/type`가 지원하는 모든 TypeScript Types 및 validation types를 포함할 수 있습니다. [Serialization](../runtime-types/serialization.md) 및 [Validation](../runtime-types/validation.md) 챕터를 참고하세요.

### Body

HTTP body를 허용하는 HTTP Method의 경우, body model도 지정할 수 있습니다. HTTP 요청의 body content type은 Deepkit이 이를 JavaScript 객체로 자동 변환할 수 있도록 `application/x-www-form-urlencoded`, `multipart/form-data` 또는 `application/json`이어야 합니다.

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

### Validation 수동 처리

Body model의 validation을 수동으로 처리하려면 특수 타입 `HttpBodyValidation<T>`를 사용할 수 있습니다. 이를 통해 유효하지 않은 body 데이터도 수신하고 에러 메시지에 매우 구체적으로 대응할 수 있습니다.

```typescript
import { HttpBodyValidation } from '@deepkit/type';

class HelloWorldBody {
    text!: string;
}

router.post('/', (body: HttpBodyValidation<HelloWorldBody>) => {
    if (!body.valid()) {
        // 휴스턴, 문제가 생겼습니다.
        const textError = body.getErrorMessageForPath('text');
        return 'Text is invalid, please fix it. ' + textError;
    }

    return 'Hello ' + body.text;
})
```

`valid()`가 `false`를 반환하는 즉시 지정된 model의 값들은 오류 상태일 수 있습니다. 이는 validation이 실패했음을 의미합니다. `HttpBodyValidation`이 사용되지 않고 잘못된 HTTP 요청이 수신되면, 요청은 즉시 중단되고 Function 내부의 코드는 실행되지 않습니다. 예를 들어 body에 대한 에러 메시지를 동일한 route에서 수동으로 처리해야 하는 경우에만 `HttpBodyValidation`을 사용하세요.

지정된 model의 Properties는 `@deepkit/type`가 지원하는 모든 TypeScript Types 및 validation types를 포함할 수 있습니다. [Serialization](../runtime-types/serialization.md) 및 [Validation](../runtime-types/validation.md) 챕터를 참고하세요.

### 파일 업로드

클라이언트가 파일을 업로드할 수 있도록 body model에 특수 Property Type을 사용할 수 있습니다. `UploadedFile`은 원하는 만큼 사용할 수 있습니다.

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

기본적으로 Router는 업로드된 모든 파일을 temp 폴더에 저장하고 route의 코드가 실행된 후 제거합니다. 따라서 `path`에 지정된 경로에서 파일을 읽어 영구 위치(로컬 디스크, 클라우드 스토리지, 데이터베이스)에 저장해야 합니다.

## Validation

HTTP 서버에서 Validation은 필수 기능입니다. 거의 항상 신뢰할 수 없는 데이터와 작업하기 때문입니다. 데이터가 여러 곳에서 validate될수록 서버는 더 안정적입니다. HTTP routes에서 Validation은 types와 validation constraints를 통해 편리하게 사용할 수 있으며, `@deepkit/type`의 고도로 최적화된 validator로 검증되므로 성능 문제는 없습니다. 따라서 이러한 validation 기능을 적극 사용하는 것이 매우 권장됩니다. 과유불급보다는 차라리 한 번 더 Validate하는 편이 낫습니다.

path parameters, query parameters, body parameters 등 모든 입력은 지정된 TypeScript Type에 대해 자동으로 validate됩니다. 추가 constraints가 `@deepkit/type`의 types를 통해 지정되면, 이들도 함께 검사됩니다.

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

자세한 내용은 [Validation](../runtime-types/validation.md)을 참고하세요.

## 출력

route는 다양한 데이터 구조를 반환할 수 있습니다. 리다이렉트와 템플릿과 같이 특별하게 처리되는 것도 있고, 단순 객체처럼 JSON으로 그대로 전송되는 것도 있습니다.

### JSON

기본적으로 일반 JavaScript 값은 `applicationjson; charset=utf-8` 헤더와 함께 JSON으로 클라이언트에 반환됩니다.

```typescript
router.get('/', () => {
    // application/json으로 전송됩니다
    return { hello: 'world' }
});
```

Function 또는 Method에 명시적인 return type을 지정하면, 데이터는 해당 Type에 따라 Deepkit JSON Serializer로 JSON에 serialize됩니다.

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

HTML을 보내는 방법은 두 가지가 있습니다. `HtmlResponse` 객체를 사용하거나 JSX가 있는 Template Engine을 사용하는 것입니다.

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

JSX가 있는 템플릿 엔진 방식은 사용된 변수가 자동으로 HTML escape된다는 장점이 있습니다. [Template](../template.md)도 참고하세요.

### 사용자 지정 Content Type

HTML과 JSON 외에도 특정 content type으로 텍스트 또는 바이너리 데이터를 보낼 수 있습니다. 이는 `Response` 객체를 통해 수행됩니다.

```typescript
import { Response } from '@deepkit/http';

router.get('/', () => {
    return new Response('<title>Hello World</title>', 'text/xml');
});
```

### HTTP Errors

여러 HTTP errors를 throw하여 HTTP 요청의 처리를 즉시 중단하고 해당 error의 HTTP status를 출력할 수 있습니다.

```typescript
import { HttpNotFoundError } from '@deepkit/http';

router.get('/user/:id', async (id: number, database: Database) => {
    const user = await database.query(User).filter({ id }).findOneOrUndefined();
    if (!user) throw new HttpNotFoundError('User not found');
    return user;
});
```

기본적으로 모든 errors는 JSON으로 클라이언트에 반환됩니다. 이 동작은 이벤트 시스템의 `httpWorkflow.onControllerError` 이벤트에서 사용자 정의할 수 있습니다. [HTTP Events](./events.md) 섹션을 참고하세요.

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

`HttpAccessDeniedError`는 특별한 경우입니다. 이 에러가 throw되면 HTTP workflow(참고: [HTTP Events](./events.md))는 `controllerError`로 가지 않고 `accessDenied`로 점프합니다.

`createHttpError`로 사용자 정의 HTTP errors를 만들고 throw할 수 있습니다.

```typescript
export class HttpMyError extends createHttpError(412, 'My Error Message') {
}
```

controller action에서 throw된 errors는 HTTP workflow 이벤트 `onControllerError`에 의해 처리됩니다. 기본 구현은 에러 메시지와 상태 코드로 JSON response를 반환하는 것입니다. 이 이벤트를 구독해 다른 response를 반환하도록 사용자 정의할 수 있습니다.

```typescript
import { httpWorkflow } from '@deepkit/http';

new App()
    .listen(httpWorkflow.onControllerError, (event) => {
        if (event.error instanceof HttpMyError) {
            event.send(new Response('My Error Message', 'text/plain').status(500));
        } else {
            // 다른 모든 에러에 대해서는 일반적인 에러 메시지를 반환합니다
            event.send(new Response('Something went wrong. Sorry about that.', 'text/plain').status(500));
        }
    })
    .listen(httpWorkflow.onAccessDenied, (event) => {
        event.send(new Response('Access denied. Try to login first.', 'text/plain').status(403));
    });
```

### 추가 헤더

HTTP response의 header를 수정하려면 `Response`, `JSONResponse`, `HTMLResponse` 객체에서 추가 Method를 호출할 수 있습니다.

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

`Redirect.toRoute` Method는 여기서 route name을 사용합니다. route name을 설정하는 방법은 [HTTP Route Names](./getting-started.md#route-names) 섹션을 참고하세요. 이 참조된 route(query 또는 path)에 parameters가 포함되어 있으면 두 번째 인자를 통해 지정할 수 있습니다:

```typescript
router.get({ path: '/user/:id', name: 'user_detail' }, (id: number) => {

});

router.post('/user', (user: HttpBody<User>) => {
    //... user를 저장하고 상세 페이지로 redirect
    return Redirect.toRoute('user_detail', { id: 23 });
});
```

또는 `Redirect.toUrl`로 URL로 redirect할 수 있습니다.

```typescript
router.post('/user', (user: HttpBody<User>) => {
    //... user를 저장하고 상세 페이지로 redirect
    return Redirect.toUrl('/user/' + 23);
});
```

기본적으로 둘 다 302 forwarding을 사용합니다. 이는 `statusCode` Argument로 사용자 정의할 수 있습니다.

## Resolver

Router는 복잡한 parameter types를 resolve하는 방법을 지원합니다. 예를 들어 `/user/:id`와 같은 route가 주어졌을 때, 이 `id`를 resolver를 사용해 route 외부에서 `user` 객체로 resolve할 수 있습니다. 이는 HTTP 추상화와 route 코드를 더욱 분리하여 테스트와 모듈화를 더 단순화합니다.

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

`@http.resolveParameter`의 데코레이터는 어떤 Class가 `UserResolver`로 resolve되어야 하는지 지정합니다. 지정된 Class `User`가 Function 또는 Method의 Parameter로 지정되는 즉시, resolver가 이를 제공하는 데 사용됩니다.

`@http.resolveParameter`가 Class에 지정되면 이 Class의 모든 Method가 해당 resolver를 갖습니다. 데코레이터는 Method별로도 적용할 수 있습니다:

```typescript
class MyWebsite {
    @http.GET('/user/:id').resolveParameter(User, UserResolver)
    getUser(user: User) {
        return 'Hello ' + user.username;
    }
}
```

또한 functional API도 사용할 수 있습니다:

```typescript

router.add(
    http.GET('/user/:id').resolveParameter(User, UserResolver),
    (user: User) => {
        return 'Hello ' + user.username;
    }
);
```

`User` 객체는 반드시 parameter에 의존할 필요는 없습니다. session이나 HTTP header에 의존할 수도 있으며, 사용자가 로그인했을 때만 제공되도록 할 수도 있습니다. `RouteParameterResolverContext`에는 HTTP 요청에 대한 많은 정보가 제공되어 다양한 사용 사례를 매핑할 수 있습니다.

원칙적으로는 `http` scope의 Dependency Injection 컨테이너를 통해 복잡한 parameter types를 제공하도록 하는 것도 가능합니다. 이는 route Function 또는 Method에서도 사용할 수 있습니다. 그러나 DI 컨테이너는 전체적으로 동기식이므로 비동기 Function 호출을 사용할 수 없다는 단점이 있습니다.