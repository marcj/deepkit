# 验证

验证是系统性地核验数据准确性和完整性的过程。这不仅包括检查数据类型是否与期望类型一致，还包括是否满足任何额外的预定义约束。

当处理来自不确定或不受信任来源的数据时，验证尤为重要。“不确定”的来源指的是其数据的类型或内容不可预测，运行时可能取任意值。典型例子包括用户输入、来自 HTTP 请求的数据（如查询参数或请求体）、CLI 参数，或程序读取的文件。此类数据天然存在风险，因为错误的类型或数值可能导致程序失败，甚至引入安全漏洞。

例如，如果变量预期存储一个数字，那么验证其确实为数值至关重要。类型不匹配可能导致意外崩溃或安全漏洞。

在设计 HTTP 路由控制器时，必须优先验证所有用户输入，无论是通过查询参数、请求体，还是其他方式。特别是在使用 TypeScript 的环境中，务必避免类型断言（type cast）。这些断言可能具有误导性，并引入根本性的安全风险。

```typescript
app.post('/user', function(request) {
    const limit = request.body.limit as number;
});
```

编码中常见的错误是依赖在运行时并不提供安全性的类型断言。例如，如果你将变量断言为 number，但用户却输入了字符串，程序就会被误导，按“该字符串是数字”来运行。这类疏忽可能导致系统崩溃或引发严重的安全威胁。为降低这些风险，开发者可以利用验证器（validator）和类型保护（type guard）。此外，序列化器（serializer）也可用于转换变量，如将 limit 转为数字。更多见“序列化”章节。

验证不是可选项；它是健壮软件设计的组成部分。宁可验证过度，也不要因验证不足而后悔。Deepkit 深知其重要性，提供了丰富的验证工具，而且其高性能设计确保对执行时间的影响最小。作为指导原则，请进行全面验证来保护你的应用，即使有时看起来有点“啰嗦”。

Deepkit 的许多组件，包括 HTTP 路由器、RPC 抽象，甚至数据库抽象，都内置了验证系统。这些机制会自动触发，通常无需手动干预。

要全面了解自动验证何时以及如何发生，请参阅特定章节（[CLI](../app.md)、[HTTP](../http.md)、[RPC](../rpc.md)、[ORM](../orm.md)）。
熟悉必要的约束与数据类型。合理定义参数可以释放 Deepkit 的自动化验证潜力，减少手工工作，确保代码更简洁、更安全。

## 用法

验证器的基本功能是按类型检查值。例如，某个值是否为字符串。这里不关心字符串的内容，仅关心其类型。TypeScript 中有许多类型：string、number、boolean、bigint、对象、类、interface、泛型、映射类型等。得益于 TypeScript 强大的类型系统，可用的类型种类非常丰富。

在 JavaScript 中，原始类型可以通过 `typeof` 运算符解析。对于更复杂的类型，如 interface、映射类型或泛型的 set/map，这就不再容易，像 `@deepkit/type` 这样的验证库就变得必不可少。Deepkit 是唯一能够直接验证所有 TypeScript 类型而无需任何变通方法的解决方案。

在 Deepkit 中，可以使用 `validate`、`is` 或 `assert` 函数进行类型验证。
`is` 是所谓的类型保护（type guard），`assert` 是类型断言（type assertion）。两者会在下一节解释。
`validate` 函数返回一个包含发现错误的数组，成功时返回空数组。该数组中的每一项描述了确切的错误代码、错误信息，以及在验证更复杂类型（如对象或数组）时的路径。

这三个函数的使用方式大致相同。将类型作为第一个类型参数指定或引用，并将数据作为第一个函数参数传入。

```typescript
import { validate, is, assert } from '@deepkit/type';

const errors = validate<string>('abc'); //[]
const errors = validate<string>(123); //[{code: 'type', message: '不是字符串'}]

if (is<string>(value)) {
    // value 现在被保证为字符串
}

function doSomething(value: any) {
    assert<string>(value); //在数据无效时抛出

    // value 现在被保证为字符串
}
```

如果你使用更复杂的类型，如类或接口，返回的数组也可能包含多条目。

```typescript
import { validate } from '@deepkit/type';

interface User {
    id: number;
    username: string;
}

validate<User>({id: 1, username: 'Joe'}); //[]

validate<User>(undefined); //[{code: 'type', message: '不是对象'}]

validate<User>({});
//[
//  {path: 'id', code: 'type', message: '不是数字'}],
//  {path: 'username', code: 'type', message: '不是字符串'}],
//]
```

验证器也支持深度递归类型。路径将用点号分隔。

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
//  {path: 'supervisor.id', code: 'type', message: '不是数字'}],
//  {path: 'supervisor.username', code: 'type', message: '不是字符串'}],
//]
```

充分利用 TypeScript 带来的优势。例如，更复杂的类型如 `User` 可以在多个地方复用，而无需一次次重复声明。比如如果需要在不包含 `id` 的情况下验证 `User`，可以使用 TypeScript 的工具类型快速高效地创建派生子类型。这非常符合 DRY（不要重复自己）的精神。

```typescript
type UserWithoutId = Omit<User, 'id'>;

validate<UserWithoutId>({username: 'Joe'}); //有效！
```

Deepkit 是唯一能够在运行时以这种方式访问 TypeScript 类型的主流框架。如果想在前端和后端中共享类型，可以将类型提取到单独文件，从而在任意位置导入。利用这一点有助于保持代码高效且整洁。

## 类型断言不安全

TypeScript 中的类型断言（与类型保护相对）并非运行时构造，它只在类型系统中生效。用它给未知数据指定类型并不安全。

```typescript
const data: any = ...;

const username = data.username as string;

if (username.startsWith('@')) { //可能会崩溃
}
```

`as string` 这段代码并不安全。变量 `data` 可能是任何值，例如 `{username: 123}`，甚至 `{}`，导致 `username` 并不是字符串，而是完全不同的东西，因此 `username.startsWith('@')` 会报错，在基础情况下导致程序崩溃，在最糟糕的情况下造成安全漏洞。
要在运行时保证 `data` 拥有类型为字符串的 `username` 属性，必须使用类型保护。

类型保护是向 TypeScript 提示传入数据在运行时被保证为何种类型的函数。借助这些信息，TypeScript 会在代码执行过程中“收窄”类型。例如，可以将 `any` 安全地缩窄为字符串或其他类型。因此，如果存在类型未知的数据（`any` 或 `unknown`），类型保护可以基于数据本身更精确地缩窄它。然而，类型保护的安全性取决于其实现。如果实现有误，后果可能非常严重，因为基本假设会突然变得不成立。

<a name="type-guard"></a>

## 类型保护（Type-Guard）

对上文使用的 `User` 类型，其最简单形式的类型保护如下。注意，上文提到的关于 NaN 的特殊情况未在此体现，因此这个类型保护并不完全正确。

```typescript
function isUser(data: any): data is User {
    return 'object' === typeof data
           && 'number' === typeof data.id
           && 'string' === typeof data.username;
}

isUser({}); //false

isUser({id: 1, username: 'Joe'}); //true
```

类型保护总是返回布尔值，通常直接用于 if 判断。

```typescript
const data: any = await fetch('/user/1');

if (isUser(data)) {
    data.id; //可以安全访问，且为数字
}
```

为每个类型手写一个类型保护函数，尤其是针对更复杂的类型，并在类型变化时反复修改，既繁琐又易出错且低效。因此，Deepkit 提供了 `is` 函数，它能为任意 TypeScript 类型自动提供类型保护。同时也会自动考虑诸如 NaN 问题等特殊情况。`is` 的功能与 `validate` 相同，但它返回布尔值而不是错误数组。

```typescript
import { is } from '@deepkit/type';

is<string>('abc'); //true
is<string>(123); //false


const data: any = await fetch('/user/1');

if (is<User>(data)) {
    //data 现在被保证为 User 类型
}
```

一种常见的模式是在验证失败时直接返回错误，以阻止后续代码执行。这可在多处使用，而无需改变整体代码流程。

```typescript
function addUser(data: any): void {
    if (!is<User>(data)) throw new TypeError('No user given');

    //data 现在被保证为 User 类型
}
```

或者，可以使用 TypeScript 的类型断言。`assert` 函数会在给定数据未能正确通过类型验证时自动抛出错误。该函数的特殊签名（区别于普通函数）帮助 TypeScript 自动收窄传入变量。

```typescript
import { assert } from '@deepkit/type';

function addUser(data: any): void {
    assert<User>(data); //数据无效时抛出

    //data 现在被保证为 User 类型
}
```

在这里，同样要发挥 TypeScript 的优势。可以通过各种 TypeScript 功能复用或定制类型。

<a name="error-reporting"></a>

## 错误报告

`is`、`assert` 和 `validates` 函数的结果是布尔值。若要获取验证失败规则的详细信息，可使用 `validate` 函数。若全部验证成功，它返回空数组；出错时，数组包含一条或多条结构如下的条目：

```typescript
interface ValidationErrorItem {
    /**
     * 指向属性的路径。对于深层路径，用点号分隔。
     */
    path: string;
    /**
     * 小写的错误代码，可用于标识该错误并进行翻译。
     */
    code: string,
    /**
     * 错误的自由文本描述。
     */
    message: string,
}
```

该函数将任意 TypeScript 类型作为第一个类型参数，待验证的数据作为第一个实参。

```typescript
import { validate } from '@deepkit/type';

validate<string>('Hello'); //[]
validate<string>(123); //[{code: 'type', message: '不是字符串', path: ''}]

validate<number>(123); //[]
validate<number>('Hello'); //[{code: 'type', message: '不是数字', path: ''}]
```

也可用于复杂类型，如 interface、class 或泛型。

```typescript
import { validate } from '@deepkit/type';

interface User {
    id: number;
    username: string;
}

validate<User>(undefined); //[{code: 'type', message: '不是对象', path: ''}]
validate<User>({}); //[{code: 'type', message: '不是数字', path: 'id'}]
validate<User>({id: 1}); //[{code: 'type', message: '不是字符串', path: 'username'}]
validate<User>({id: 1, username: 'Peter'}); //[]
```

<a name="constraints"></a>

## 约束

除了类型检查，还可以为类型添加其他任意约束。这些附加的内容约束会在类型本身验证通过后自动进行。这适用于所有验证函数，如 `validate`、`is` 和 `assert`。
一个约束例如可以是字符串必须有一定的最小/最大长度。这些约束通过[类型注解](./types.md)添加到实际类型上。可用的注解种类很多。如有更复杂需求，也可以按需定义并使用自定义注解。

```typescript
import { MinLength } from '@deepkit/type';

type Username = string & MinLength<3>;
```

使用 `&` 可以将任意数量的类型注解添加到实际类型上。结果类型（此处为 `username`）随后可用于所有验证函数以及其他类型中。

```typescript
import { is } from '@deepkit/type';

is<Username>('ab'); //false，因为最小长度为 3
is<Username>('Joe'); //true

interface User {
  id: number;
  username: Username;
}

is<User>({id: 1, username: 'ab'}); //false，因为最小长度为 3
is<User>({id: 1, username: 'Joe'}); //true
```

`validate` 函数会给出来自约束的有用错误信息。

```typescript
import { validate } from '@deepkit/type';

const errors = validate<Username>('xb');
//[{ code: 'minLength', message: `最小长度为 3` }]
```

这些信息可以很方便地在表单中自动呈现，并可通过 `code` 进行翻译。借助对象和数组的路径信息，表单中的字段可以筛选并显示相应错误。

```typescript
validate<User>({id: 1, username: 'ab'});
//{ path: 'username', code: 'minLength', message: `最小长度为 3` }
```

一个常见且有用的用例是使用正则表达式约束来定义 Email。一旦定义了该类型，就可以在任何地方复用。

```typescript
export const emailRegexp = /^\S+@\S+$/;
type Email = string & Pattern<typeof emailRegexp>

is<Email>('abc'); //false
is<Email>('joe@example.com'); //true
```

可以添加任意数量的约束。

```typescript
type ID = number & Positive & Maximum<1000>;

is<ID>(-1); //false
is<ID>(123); //true
is<ID>(1001); //true
```

### 约束类型

#### Validate<typeof myValidator>

使用自定义验证函数进行验证。更多信息见下一节“自定义验证器”。

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

定义一个正则表达式作为验证模式。通常用于 Email 验证或更复杂的内容验证。

```typescript
import { Pattern } from '@deepkit/type';

const myRegExp = /[a-zA-Z]+/;
type T = string & Pattern<typeof myRegExp>
```

#### Alpha

仅包含字母字符（a-Z）的验证。

```typescript
import { Alpha } from '@deepkit/type';

type T = string & Alpha;
```

#### Alphanumeric

字母与数字字符的验证。

```typescript
import { Alphanumeric } from '@deepkit/type';

type T = string & Alphanumeric;
```

#### Ascii

ASCII 字符的验证。

```typescript
import { Ascii } from '@deepkit/type';

type T = string & Ascii;
```

#### Decimal<number, number>

验证字符串表示一个十进制数，如 0.1、.3、1.1、1.00003、4.0 等。

```typescript
import { Decimal } from '@deepkit/type';

type T = string & Decimal<1, 2>;
```

#### MultipleOf<number>

验证数字是给定数字的倍数。

```typescript
import { MultipleOf } from '@deepkit/type';

type T = number & MultipleOf<3>;
```

#### MinLength<number>, MaxLength<number>, MinMax<number, number>

为数组或字符串验证最小/最大长度。

```typescript
import { MinLength, MaxLength, MinMax } from '@deepkit/type';

type T = any[] & MinLength<1>;

type T = string & MinLength<3> & MaxLength<16>;

type T = string & MinMax<3, 16>;
```

#### Includes<'any'> Excludes<'any'>

验证数组项或子字符串被包含/排除。

```typescript
import { Includes, Excludes } from '@deepkit/type';

type T = any[] & Includes<'abc'>;
type T = string & Excludes<' '>;
```

#### Minimum<number>, Maximum<number>

验证数值不小于/不大于给定数字。对应 `>=` 和 `<=`。

```typescript
import { Minimum, Maximum, MinMax } from '@deepkit/type';

type T = number & Minimum<10>;
type T = number & Minimum<10> & Maximum<1000>;

type T = number & MinMax<10, 1000>;
```

#### ExclusiveMinimum<number>, ExclusiveMaximum<number>

与 Minimum/Maximum 类似，但不包含边界值本身。对应 `>` 和 `<`。

```typescript
import { ExclusiveMinimum, ExclusiveMaximum } from '@deepkit/type';

type T = number & ExclusiveMinimum<10>;
type T = number & ExclusiveMinimum<10> & ExclusiveMaximum<1000>;
```

#### Positive, Negative, PositiveNoZero, NegativeNoZero

验证数值为正或为负。

```typescript
import { Positive, Negative } from '@deepkit/type';

type T = number & Positive;
type T = number & Negative;
```

#### BeforeNow, AfterNow

将日期值与当前时间（new Date）比较的验证。

```typescript
import { BeforeNow, AfterNow } from '@deepkit/type';

type T = Date & BeforeNow;
type T = Date & AfterNow;
```

#### Email

通过 `/^\S+@\S+$/` 进行简单的邮箱正则验证。它自动为 `string`，因此无需写成 `string & Email`。

```typescript
import { Email } from '@deepkit/type';

type T = Email;
```

#### integer

确保数字是在正确范围内的整数。它自动为 `number`，因此无需写成 `number & integer`。

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

更多信息见“特殊类型：整数/浮点数”。

### 自定义验证器

如果内置验证器不够用，可以通过 `Validate` 装饰器创建并使用自定义验证函数。

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

请注意，你的自定义验证函数会在所有内置类型验证器调用之后执行。如果某个验证器失败，当前类型的后续验证器都会被跳过。每个类型最多只会产生一次失败。

#### 泛型验证器

在验证器函数中，可使用类型对象来获取使用该验证器的类型的更多信息。还可以定义任意验证器选项，作为参数传给验证类型，使验证器可配置。借助这些信息及其父级引用，可以创建功能强大的通用验证器。

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