# 검증

검증은 데이터의 정확성과 무결성을 체계적으로 확인하는 프로세스입니다. 이는 데이터 타입이 기대된 타입과 일치하는지뿐만 아니라, 추가로 정의된 제약 조건들이 충족되는지까지 확인하는 작업을 포함합니다.

검증은 불확실하거나 신뢰할 수 없는 소스로부터 오는 데이터를 다룰 때 특히 중요합니다. "불확실한(uncertain)" 소스란 데이터의 타입이나 내용이 예측 불가능하여 런타임에 어떤 값이든 될 수 있는 경우를 의미합니다. 대표적인 예로 사용자 입력, HTTP 요청의 데이터(예: query parameters 또는 body), CLI arguments, 프로그램에서 읽어 들이는 파일 등이 있습니다. 이러한 데이터는 잘못된 타입이나 값으로 인해 프로그램 장애가 발생하거나 보안 취약점을 유발할 수 있으므로 본질적으로 위험합니다.

예를 들어, 어떤 변수가 숫자를 저장해야 한다면 실제로 숫자 값을 담고 있는지 검증하는 것이 중요합니다. 불일치가 생기면 예기치 않은 충돌이나 보안 침해로 이어질 수 있습니다.

예컨대 HTTP 라우트 컨트롤러를 설계할 때, query parameters, request body 등 모든 사용자 입력을 우선적으로 검증해야 합니다. 특히 TypeScript를 사용하는 환경에서는 type cast를 피하는 것이 중요합니다. 이러한 cast는 오해를 불러일으키고 근본적인 보안 위험을 도입할 수 있습니다.

```typescript
app.post('/user', function(request) {
    const limit = request.body.limit as number;
});
```

코드에서 자주 마주치는 실수 중 하나는 런타임 보안을 제공하지 않는 type cast입니다. 예컨대 변수를 number로 type cast했지만 사용자가 string을 입력하면, 프로그램은 해당 string을 숫자인 것처럼 동작하도록 잘못 인도됩니다. 이러한 간과는 시스템 충돌을 야기하거나 심각한 보안 위협이 될 수 있습니다. 이러한 위험을 완화하기 위해 개발자는 validators와 type guard를 활용할 수 있습니다. 추가로, serializer는 'limit' 같은 변수를 number로 변환하는 역할을 수행할 수 있습니다. 자세한 내용은 Serialization 섹션에서 확인할 수 있습니다.

검증은 선택 사항이 아니라 견고한 소프트웨어 설계의 핵심 구성 요소입니다. 과유불급이더라도 보수적으로 접근하는 것이 언제나 현명합니다. Deepkit은 이 중요성을 이해하고 다양한 검증 도구를 제공합니다. 더불어 고성능 설계로 실행 시간에 미치는 영향이 최소화됩니다. 기본 원칙으로, 때로는 중복처럼 느껴지더라도 애플리케이션을 보호하기 위해 포괄적인 검증을 적용하십시오.

HTTP router, RPC abstraction, 데이터베이스 abstraction을 포함한 많은 Deepkit 구성 요소는 내장된 검증 시스템을 제공합니다. 이러한 메커니즘은 자동으로 트리거되어, 수동 개입이 필요 없는 경우가 많습니다.


자동 검증이 언제 어떻게 발생하는지에 대한 포괄적인 이해를 위해 다음 챕터들을 참고하세요([CLI](../app.md), [HTTP](../http.md), [RPC](../rpc.md), [ORM](../orm.md)).
필요한 제약 조건과 데이터 타입을 숙지하십시오. 올바르게 정의된 Parameter는 Deepkit의 자동 검증 기능을 활성화하여 수작업을 줄이고 더 깔끔하고 안전한 코드를 보장합니다.

## 사용법

validator의 기본 기능은 값의 타입을 확인하는 것입니다. 예를 들어 어떤 값이 string인지 여부입니다. 이는 string의 내용이 무엇인지는 중요하지 않고 오직 타입만을 다룹니다. TypeScript에는 string, number, boolean, bigint, objects, classes, interface, generics, mapped types 등 다양한 타입이 존재합니다. TypeScript의 강력한 type system 덕분에 매우 다양한 타입이 가능합니다.

JavaScript 자체에서는 원시 타입을 `typeof` 연산자로 판별할 수 있습니다. 그러나 interface, mapped types, generic set/map 같은 더 복잡한 타입의 경우 더 이상 쉽지 않으며 `@deepkit/type` 같은 validator 라이브러리가 필요해집니다. Deepkit은 모든 TypeScript 타입을 우회 없이 직접 검증할 수 있는 유일한 솔루션입니다.



Deepkit에서는 `validate`, `is`, `assert` Function을 사용해 타입 검증을 할 수 있습니다.
`is` Function은 이른바 type guard이고 `assert`는 type assertion입니다. 둘은 다음 섹션에서 설명합니다.
`validate` Function은 발견된 오류들의 배열을 반환하며, 성공 시에는 빈 배열을 반환합니다. 이 배열의 각 항목은 정확한 error code와 error message, 그리고 객체나 배열 같은 더 복잡한 타입이 검증될 때의 path를 설명합니다.

세 Function 모두 대체로 같은 방식으로 사용됩니다. 첫 번째 type argument로 타입을 지정하거나 참조하고, 첫 번째 Function argument로 데이터를 전달합니다.

```typescript
import { validate, is, assert } from '@deepkit/type';

const errors = validate<string>('abc'); //[]
const errors = validate<string>(123); //[{code: 'type', message: 'Not a string'}]

if (is<string>(value)) {
    // value는 이제 string임이 보장됩니다
}

function doSomething(value: any) {
    assert<string>(value); //유효하지 않은 데이터일 경우 예외를 던짐

    // value는 이제 string임이 보장됩니다
}
```

Class나 Interface 같은 더 복잡한 Type으로 작업한다면, 배열에는 여러 항목이 포함될 수 있습니다.

```typescript
import { validate } from '@deepkit/type';

interface User {
    id: number;
    username: string;
}

validate<User>({id: 1, username: 'Joe'}); //[]

validate<User>(undefined); //[{code: 'type', message: 'Not a object'}]

validate<User>({});
//[
//  {path: 'id', code: 'type', message: 'Not a number'}],
//  {path: 'username', code: 'type', message: 'Not a string'}],
//]
```

validator는 깊은 재귀 타입도 지원합니다. 이때 path는 점(dot)으로 구분됩니다.

```typescript
import { validate } from '@deepkit/type';

interface User {
    id: number;
    username: string;
    supervisor?: User;
}

validate<User>({id: 1, username: 'Joe'}); //[]

validate<User>({id: 1, username: 'Joe', supervisor: {}});
//[
//  {path: 'supervisor.id', code: 'type', message: 'Not a number'}],
//  {path: 'supervisor.username', code: 'type', message: 'Not a string'}],
//]
```

TypeScript가 제공하는 이점을 적극 활용하세요. 예를 들어 `User` 같은 더 복잡한 Type은 여러 곳에서 재사용할 수 있으며, 매번 다시 선언할 필요가 없습니다. 예컨대 `id`를 제외한 `User`를 검증하려면 TypeScript 유틸리티를 사용해 빠르고 효율적으로 파생 subtype을 만들 수 있습니다. 이는 DRY(Don't Repeat Yourself) 정신에 부합합니다.

```typescript
type UserWithoutId = Omit<User, 'id'>;

validate<UserWithoutId>({username: 'Joe'}); //유효함!
```

Deepkit은 런타임에 이와 같은 방식으로 TypeScript의 Type에 접근할 수 있는 유일한 주요 프레임워크입니다. 프론트엔드와 백엔드에서 Type을 공용으로 사용하고 싶다면, Type을 별도 파일로 분리하여 어디서든 import할 수 있습니다. 이 옵션을 활용해 코드를 효율적이고 깔끔하게 유지하십시오.

## Type Cast는 안전하지 않음

TypeScript에서 type cast는(type guard와 달리) 런타임의 구조물이 아니라 type system 내부에서만 처리됩니다. 이는 알 수 없는 데이터에 타입을 부여하는 안전한 방법이 아닙니다.

```typescript
const data: any = ...;

const username = data.username as string;

if (username.startsWith('@')) { //충돌(crash)할 수 있음
}
```

`as string` 코드는 안전하지 않습니다. 변수 `data`는 실제로 어떤 값이든 될 수 있으며, 예를 들어 `{username: 123}` 또는 `{}`일 수도 있습니다. 그 결과 `username`은 string이 아니라 완전히 다른 것이 되어 `username.startsWith('@')` 코드가 Error를 유발하고, 최선의 경우 프로그램이 충돌하며, 최악의 경우 보안 취약점이 생길 수 있습니다.
런타임에 `data`가 string 타입의 `username` Property를 가진다는 것을 보장하려면, 반드시 type guard를 사용해야 합니다.

type guard는 TypeScript에 전달된 데이터가 런타임에 어떤 타입임이 보장되는지에 대한 힌트를 주는 Function입니다. 이 지식을 바탕으로 TypeScript는 코드 진행에 따라 타입을 "좁혀(narrow)" 줍니다. 예를 들어, `any`를 안전하게 string이나 다른 타입으로 만들 수 있습니다. 즉, 타입을 알 수 없는(`any` 또는 `unknown`) 데이터가 있다면, type guard가 데이터 자체를 기반으로 보다 정확하게 타입을 좁히는 데 도움이 됩니다. 그러나 type guard의 안전성은 구현의 정확성에 달려 있습니다. 실수가 있다면 근본적인 가정이 틀렸음이 드러나 심각한 문제로 이어질 수 있습니다.

<a name="type-guard"></a>

## Type-Guard

위에서 사용한 `User` Type에 대한 type guard는 가장 단순하게 다음과 같이 생겼을 수 있습니다. 위에서 설명한 NaN 관련 특수 사항은 여기 포함되어 있지 않으므로 이 type guard는 완전히 정확하지 않다는 점에 유의하세요.

```typescript
function isUser(data: any): data is User {
    return 'object' === typeof data
           && 'number' === typeof data.id
           && 'string' === typeof data.username;
}

isUser({}); //false

isUser({id: 1, username: 'Joe'}); //true
```

type guard는 항상 Boolean을 반환하며 보통 If 문에서 바로 사용됩니다.

```typescript
const data: any = await fetch('/user/1');

if (isUser(data)) {
    data.id; //안전하게 접근할 수 있으며 number입니다
}
```

특히 더 복잡한 Type에 대해 각 type guard마다 별도의 Function을 작성하고, 타입이 바뀔 때마다 이를 수정하는 것은 매우 번거롭고 오류가 발생하기 쉽고 비효율적입니다. 따라서 Deepkit은 모든 TypeScript Type에 대해 자동으로 Type-Guard를 제공하는 `is` Function을 제공합니다. 이는 위에서 언급한 NaN 문제 같은 특수 사항도 자동으로 고려합니다. `is` Function은 `validate`와 동일한 일을 하지만, 오류 배열 대신 단순히 boolean을 반환합니다.

```typescript
import { is } from '@deepkit/type';

is<string>('abc'); //true
is<string>(123); //false


const data: any = await fetch('/user/1');

if (is<User>(data)) {
    //data는 이제 User 타입임이 보장됩니다
}
```

자주 쓰이는 패턴으로, 검증 실패 시 즉시 Error를 반환하여 이후 코드가 실행되지 않게 하는 방법이 있습니다. 이는 코드 전체 흐름을 바꾸지 않고 다양한 곳에서 사용할 수 있습니다.

```typescript
function addUser(data: any): void {
    if (!is<User>(data)) throw new TypeError('No user given');

    //data는 이제 User 타입임이 보장됩니다
}
```

대안으로 TypeScript type assertion을 사용할 수 있습니다. `assert` Function은 주어진 데이터가 타입에 올바르게 검증되지 않으면 자동으로 Error를 던집니다. TypeScript type assertion을 구분하는 이 Function의 특별한 시그니처 덕분에 TypeScript는 전달된 변수를 자동으로 좁혀줍니다.

```typescript
import { assert } from '@deepkit/type';

function addUser(data: any): void {
    assert<User>(data); //유효하지 않은 데이터라면 예외를 던짐

    //data는 이제 User 타입임이 보장됩니다
}
```

여기서도 TypeScript가 제공하는 이점을 활용하세요. Type은 다양한 TypeScript 기능을 사용해 재사용하거나 커스터마이즈할 수 있습니다.

<a name="error-reporting"></a>

## 오류 보고

`is`, `assert`, `validates` Function은 결과로 boolean을 반환합니다. 실패한 검증 규칙에 대한 정확한 정보를 얻으려면 `validate` Function을 사용할 수 있습니다. 모든 검증이 성공하면 빈 배열을 반환합니다. 오류가 있을 경우 다음 구조의 하나 이상의 항목이 배열에 포함됩니다:

```typescript
interface ValidationErrorItem {
    /**
     * 해당 Property까지의 경로. 점으로 구분된 깊은 경로일 수 있습니다.
     */
    path: string;
    /**
     * 이 오류를 식별하고 번역하는 데 사용할 수 있는 소문자 error code.
     */
    code: string,
    /**
     * 오류에 대한 자유 형식의 텍스트.
     */
    message: string,
}
```

이 Function은 첫 번째 type argument로 임의의 TypeScript Type을 받고, 첫 번째 argument로 검증할 데이터를 받습니다.

```typescript
import { validate } from '@deepkit/type';

validate<string>('Hello'); //[]
validate<string>(123); //[{code: 'type', message: 'Not a string', path: ''}]

validate<number>(123); //[]
validate<number>('Hello'); //[{code: 'type', message: 'Not a number', path: ''}]
```

interface, class, generics 같은 복잡한 Type도 사용할 수 있습니다.

```typescript
import { validate } from '@deepkit/type';

interface User {
    id: number;
    username: string;
}

validate<User>(undefined); //[{code: 'type', message: 'Not an object', path: ''}]
validate<User>({}); //[{code: 'type', message: 'Not a number', path: 'id'}]
validate<User>({id: 1}); //[{code: 'type', message: 'Not a string', path: 'username'}]
validate<User>({id: 1, username: 'Peter'}); //[]
```

<a name="constraints"></a>

## 제약 조건

타입을 확인하는 것 외에도, 임의의 추가 제약 조건을 타입에 추가할 수 있습니다. 이러한 추가 내용 제약의 검증은 타입 자체가 검증된 이후 자동으로 수행됩니다. 이는 `validate`, `is`, `assert` 같은 모든 검증 Function에서 이루어집니다.
예를 들어 문자열의 최소 또는 최대 길이를 요구하는 것을 제약으로 둘 수 있습니다. 이러한 제약은 [타입 애너테이션](./types.md)을 통해 실제 타입에 추가됩니다. 사용할 수 있는 애너테이션은 매우 다양합니다. 확장된 요구 사항이 있는 경우 자체 애너테이션을 정의하여 마음껏 사용할 수 있습니다.

```typescript
import { MinLength } from '@deepkit/type';

type Username = string & MinLength<3>;
```

`&`를 사용해 원하는 만큼의 타입 애너테이션을 실제 타입에 추가할 수 있습니다. 이렇게 만들어진 결과(여기서는 `username`)는 모든 검증 Function에서, 그리고 다른 타입에서도 사용할 수 있습니다.

```typescript
import { is } from '@deepkit/type';

is<Username>('ab'); //false, 최소 길이는 3
is<Username>('Joe'); //true

interface User {
  id: number;
  username: Username;
}

is<User>({id: 1, username: 'ab'}); //false, 최소 길이는 3
is<User>({id: 1, username: 'Joe'}); //true
```

`validate` Function은 제약으로부터 유용한 error message를 제공합니다.

```typescript
import { validate } from '@deepkit/type';

const errors = validate<Username>('xb');
//[{ code: 'minLength', message: `Min length is 3` }]
```

이 정보는 예를 들어 폼에서 자동으로 훌륭하게 표시될 수 있으며, `code`를 통해 번역될 수 있습니다. 객체와 배열에 대한 기존 path를 통해, 폼의 각 필드는 해당 오류를 골라내어 표시할 수 있습니다.

```typescript
validate<User>({id: 1, username: 'ab'});
//{ path: 'username', code: 'minLength', message: `Min length is 3` }
```

자주 유용한 사용 사례로 RegExp 제약을 사용해 email을 정의하는 것이 있습니다. 한 번 타입을 정의하면 어디서든 사용할 수 있습니다.

```typescript
export const emailRegexp = /^\S+@\S+$/;
type Email = string & Pattern<typeof emailRegexp>

is<Email>('abc'); //false
is<Email>('joe@example.com'); //true
```

원하는 만큼의 제약을 추가할 수 있습니다.

```typescript
type ID = number & Positive & Maximum<1000>;

is<ID>(-1); //false
is<ID>(123); //true
is<ID>(1001); //true
```

### 제약 타입

#### Validate<typeof myValidator>

사용자 정의 validator Function을 사용한 검증. 자세한 내용은 다음 섹션 Custom Validator를 참고하세요.

```typescript
import { ValidatorError, Validate } from '@deepkit/type';

function startsWith(v: string) {
    return (value: any) => {
        const valid = 'string' === typeof value && value.startsWith(v);
        return valid ? undefined : new ValidatorError('startsWith', `Does not start with ${v}`);
    };
}

type T = string & Validate<typeof startsWith, 'abc'>;
```

#### Pattern<typeof myRegexp>

정규식을 검증 패턴으로 정의합니다. 보통 E-Mail 검증이나 더 복잡한 내용 검증에 사용됩니다.

```typescript
import { Pattern } from '@deepkit/type';

const myRegExp = /[a-zA-Z]+/;
type T = string & Pattern<typeof myRegExp>
```

#### Alpha

알파 문자(a-Z)에 대한 검증.

```typescript
import { Alpha } from '@deepkit/type';

type T = string & Alpha;
```


#### Alphanumeric

알파와 숫자 문자의 조합에 대한 검증.

```typescript
import { Alphanumeric } from '@deepkit/type';

type T = string & Alphanumeric;
```


#### Ascii

ASCII 문자에 대한 검증.

```typescript
import { Ascii } from '@deepkit/type';

type T = string & Ascii;
```


#### Decimal<number, number>

문자열이 0.1, .3, 1.1, 1.00003, 4.0 등과 같은 십진수를 나타내는지에 대한 검증.

```typescript
import { Decimal } from '@deepkit/type';

type T = string & Decimal<1, 2>;
```


#### MultipleOf<number>

주어진 수의 배수인 number에 대한 검증.

```typescript
import { MultipleOf } from '@deepkit/type';

type T = number & MultipleOf<3>;
```


#### MinLength<number>, MaxLength<number>, MinMax<number, number>

배열 또는 문자열의 최소/최대 길이에 대한 검증.

```typescript
import { MinLength, MaxLength, MinMax } from '@deepkit/type';

type T = any[] & MinLength<1>;

type T = string & MinLength<3> & MaxLength<16>;

type T = string & MinMax<3, 16>;
```

#### Includes<'any'> Excludes<'any'>

배열 항목 또는 부분 문자열의 포함/제외에 대한 검증

```typescript
import { Includes, Excludes } from '@deepkit/type';

type T = any[] & Includes<'abc'>;
type T = string & Excludes<' '>;
```

#### Minimum<number>, Maximum<number>

값이 주어진 수의 최소/최대인지에 대한 검증. `>=` 및 `<=`와 동일합니다.

```typescript
import { Minimum, Maximum, MinMax } from '@deepkit/type';

type T = number & Minimum<10>;
type T = number & Minimum<10> & Maximum<1000>;

type T = number & MinMax<10, 1000>;
```

#### ExclusiveMinimum<number>, ExclusiveMaximum<number>

minimum/maximum과 동일하지만 값 자체는 제외합니다. `>` 및 `<`와 동일합니다.

```typescript
import { ExclusiveMinimum, ExclusiveMaximum } from '@deepkit/type';

type T = number & ExclusiveMinimum<10>;
type T = number & ExclusiveMinimum<10> & ExclusiveMaximum<1000>;
```


#### Positive, Negative, PositiveNoZero, NegativeNoZero

값이 양수/음수인지에 대한 검증.

```typescript
import { Positive, Negative } from '@deepkit/type';

type T = number & Positive;
type T = number & Negative;
```


#### BeforeNow, AfterNow

현재(new Date)와 비교한 날짜 값에 대한 검증.

```typescript
import { BeforeNow, AfterNow } from '@deepkit/type';

type T = Date & BeforeNow;
type T = Date & AfterNow;
```

#### Email

`/^\S+@\S+$/`를 통한 간단한 email 정규식 검증. 자동으로 `string`이므로 `string & Email`을 할 필요가 없습니다.

```typescript
import { Email } from '@deepkit/type';

type T = Email;
```

#### integer

number가 올바른 범위의 정수인지 보장합니다. 자동으로 `number`이므로 `number & integer`를 할 필요가 없습니다.

```typescript
import { integer, uint8, uint16, uint32, 
    int8, int16, int32 } from '@deepkit/type';

type T = integer;
type T = uint8;
type T = uint16;
type T = uint32;
type T = int8;
type T = int16;
type T = int32;
```

자세한 내용은 Special types: integer/floats를 참고하세요.

### Custom validator

내장 validator로 충분하지 않은 경우, `Validate` 데코레이터를 통해 사용자 정의 검증 Function을 만들고 사용할 수 있습니다.

```typescript
import { ValidatorError, Validate, Type, validates, validate }
  from '@deepkit/type';

function titleValidation(value: string, type: Type) {
    value = value.trim();
    if (value.length < 5) {
        return new ValidatorError('tooShort', 'Value is too short');
    }
}

interface Article {
    id: number;
    title: string & Validate<typeof titleValidation>;
}

console.log(validates<Article>({id: 1})); //false
console.log(validates<Article>({id: 1, title: 'Peter'})); //true
console.log(validates<Article>({id: 1, title: ' Pe     '})); //false
console.log(validate<Article>({id: 1, title: ' Pe     '})); //[ValidationErrorItem]
```

사용자 정의 검증 Function은 모든 내장 타입 validator가 호출된 다음에 실행된다는 점에 유의하세요. 하나의 validator가 실패하면, 현재 타입의 이후 validator는 모두 건너뜁니다. 타입당 하나의 실패만 발생합니다.

#### Generic Validator

Validator Function에서는 type object를 사용할 수 있어, validator가 사용하는 타입에 대한 더 많은 정보를 얻을 수 있습니다. 또한 validate 타입에 전달해야 하며 validator를 구성 가능하게 만드는 임의의 validator 옵션을 정의할 수도 있습니다. 이 정보와 상위 참조를 통해 강력한 generic validator를 만들 수 있습니다.

```typescript
import { ValidatorError, Validate, Type, is, validate }
  from '@deepkit/type';

function startsWith(value: any, type: Type, chars: string) {
    const valid = 'string' === typeof value && value.startsWith(chars);
    if (!valid) {
        return new ValidatorError('startsWith', 'Does not start with ' + chars)
    }
}

type MyType = string & Validate<typeof startsWith, 'a'>;

is<MyType>('aah'); //true
is<MyType>('nope'); //false

const errors = validate<MyType>('nope');
//[{ path: '', code: 'startsWith', message: `Does not start with a` }]);
```