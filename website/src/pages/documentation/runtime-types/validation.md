# Validation

Validation is the systematic process of verifying data for accuracy and integrity. This not only involves checking if the data type aligns with the expected type, but also whether any additional predefined constraints are satisfied.

Validation becomes paramount when dealing with data from uncertain or untrusted sources. An "uncertain" source is one where the types or contents of the data are unpredictable, potentially taking any value during runtime. Typical examples include user inputs, data from HTTP requests (like query parameters or the body), CLI arguments, or files that are read into a program. Such data is inherently risky as incorrect types or values can cause program failures, or even introduce security vulnerabilities.

For instance, if a variable is expected to store a number, validating to ensure that it actually contains a numeric value is crucial. A mismatch could lead to unexpected crashes or security breaches.

When designing an HTTP route controller for example, one must prioritize the validation of all user inputs, be it through query parameters, the request body, or other means. Particularly in environments utilizing TypeScript, it's vital to steer clear of type casts. These casts can be misleading and introduce fundamental security risks.

```typescript
app.post('/user', function(request) {
    const limit = request.body.limit as number;
});
```

A frequently encountered error in coding involves type casts that don't offer runtime security. For instance, if you type cast a variable as a number but a user inputs a string, the program is misled to operate as if the string is a number. Such oversights can cause system crashes or pose serious security threats. To mitigate these risks, developers can leverage validators and type guards. Additionally, serializers can play a role in converting variables, like converting 'limit' to a number. Further insights on this topic can be found in the section on Serialization.

Validation isn't just an option; it's an integral component of robust software design. It's always prudent to err on the side of caution: better to validate excessively than regret insufficient checks later. Deepkit understands this importance, offering a plethora of validation tools. What's more, its high-performance design ensures minimal impact on execution times. As a guiding principle, employ comprehensive validation to safeguard your application, even if it feels redundant at times.

Many of Deepkit's components, including the HTTP router, the RPC abstraction, and even the database abstraction, come with embedded validation systems. These mechanisms are automatically triggered, often eliminating the need for manual intervention.


For a comprehensive understanding of when and how automatic validation occurs, refer to specific chapters ([CLI](../app.md), [HTTP](../http.md), [RPC](../rpc.md), [ORM](../orm.md)). 
Familiarize yourself with the necessary constraints and data types. Properly defined parameters can unlock Deepkit's automated validation potential, reducing manual labor and ensuring cleaner, more secure code.

## Usage

The basic function of the validator is to check a value for its type. For example, whether a value is a string. This is not about what the string contains, but only about its type. There are many types in Typescript: string, number, boolean, bigint, objects, classes, interface, generics, mapped types, and many more. Due to Typescript’s powerful type system, a large variety of different types are available.

In JavaScript itself, primitive types can be parsed with the `typeof` operator. For more complex types like interfaces, mapped types, or generic set/map this is not so easy anymore and a validator library like `@deepkit/type` becomes necessary. Deepkit is the only solution that allows to validate all TypesScript types directly without any workarounds.



In Deepkit, type validation can be done using either the `validate`, `is`, or `assert` function.
The function `is` is a so-called type guard and `assert` is a type assertion. Both will be explained in the next section.
The function `validate` returns an array of found errors and on success an empty array. Each entry in this array describes the exact error code and the error message as well as the path when more complex types like objects or arrays are validated.

All three functions are used in roughly the same way. The type is specified or referenced as the first type argument and the data is passed as the first function argument.

```typescript
import { validate, is, assert } from '@deepkit/type';

const errors = validate<string>('abc'); //[]
const errors = validate<string>(123); //[{code: 'type', message: 'Not a string'}]

if (is<string>(value)) {
    // value is guaranteed to be a string
}

function doSomething(value: any) {
    assert<string>(value); //throws on invalid data

    // value is guaranteed to be a string
}
```

If you work with more complex types like classes or interfaces, the array can also contain several entries.

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

The validator also supports deep recursive types. Paths are then separated with a dot.

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

Take advantage of the benefits that TypeScript offers you. For example, more complex types like a `User` can be reused in multiple places without having to declare it again and again. For example, if a `User` is to be validated without its `id`, TypeScript utitilies can be used to quickly and efficiently create derived subtypes. Very much in the spirit of DRY (Don't Repeat Yourself).

```typescript
type UserWithoutId = Omit<User, 'id'>;

validate<UserWithoutId>({username: 'Joe'}); //valid!
```

Deepkit is the only major framework that has the ability to access TypeScripts types in this way at runtime. If you want to use types in frontend and backend, types can be swapped out to a separate file and thus imported anywhere. Use this option to your advantage to keep the code efficient and clean.

## Type Casts are Unsafe

A type cast (contrary to type guard) in TypeScript is not a construct at runtime, but is only handled in the type system itself. It is not a safe way to assign a type to unknown data.

```typescript
const data: any = ...;

const username = data.username as string;

if (username.startsWith('@')) { //might crash
}
```

The `as string` code is not safe. The variable `data` could have literally any value, for example `{username: 123}`, or even `{}`, and would have the consequence that `username` is not a string, but something completely different and therefore the code `username.startsWith('@')` will lead to an error, so that in a base case the program crashes and in the worst case a security vulnerability is created.
To guarantee at runtime that `data` here has a property `username` with the type string, type-guards must be used.

Type guards are functions that give TypeScript a hint about what type the passed data is guaranteed to have at runtime. Armed with this knowledge, TypeScript then "narrows" the type as the code progresses. For example, `any` can be made into a string, or any other type in a safe way. So if there is data of which the type is not known (`any` or `unknown`), a type guard helps to narrow it down more precisely based on the data itself. However, the type guard is only as safe as its implementation. If you make a mistake, this can have severe consequences, because fundamental assumptions suddenly turn out to be untrue.

<a name="type-guard"></a>

## Type-Guard

A type guard on the above used type `User` could look in the simplest form as follows. Note that the above explained special features with NaN are not part here and thus this type guard is not quite correct.

```typescript
function isUser(data: any): data is User {
    return 'object' === typeof data
           && 'number' === typeof data.id
           && 'string' === typeof data.username;
}

isUser({}); //false

isUser({id: 1, username: 'Joe'}); //true
```

A type guard always returns a Boolean and is usually used directly in an If operation.

```typescript
const data: any = await fetch('/user/1');

if (isUser(data)) {
    data.id; //can be safely accessed and is a number
}
```

Writing a separate function for each type guard, especially for more complex types, and then adapting it every time a type changes is extremely tedious, error-prone, and not efficient. Therefore, Deepkit provides the function `is`, which automatically provides a Type-Guard for any TypeScript type. This then also automatically takes into account special features such as the above-mentioned problem with NaN. The function `is` does the same as `validate`, but instead of an array of errors it simply returns a boolean.

```typescript
import { is } from '@deepkit/type';

is<string>('abc'); //true
is<string>(123); //false


const data: any = await fetch('/user/1');

if (is<User>(data)) {
    //data is guaranteed to be of type User now
}
```

A pattern that can be found more often is to return an error directly in case of incorrect validation, so that subsequent code is not executed. This can be used in various places without changing the complete flow of the code.

```typescript
function addUser(data: any): void {
    if (!is<User>(data)) throw new TypeError('No user given');

    //data is guaranteed to be of type User now
}
```

Alternatively, a TypeScript type assertion can be used. The `assert` function automatically throws an error if the given data does not validate correctly to a type. The special signature of the function, which distinguishes TypeScript type assertions, helps TypeScript to automatically narrow the passed variable.

```typescript
import { assert } from '@deepkit/type';

function addUser(data: any): void {
    assert<User>(data); //throws on invalidate data

    //data is guaranteed to be of type User now
}
```

Here, too, take advantage of the benefits that TypeScript offers you. Types can be reused or customized using various TypeScript functions.

<a name="error-reporting"></a>

## Error Reporting

The functions `is`, `assert` and `validates` return a boolean as result. To get exact information about failed validation rules, the `validate` function can be used. It returns an empty array if everything was validated successfully. In case of errors the array will contain one or more entries with the following structure:

```typescript
interface ValidationErrorItem {
    /**
     * The path to the property. Might be a deep path separated by dot.
     */
    path: string;
    /**
     * A lower cased error code that can be used to identify this error and translate.
     */
    code: string,
    /**
     * Free text of the error.
     */
    message: string,
}
```

The function receives as first type argument any TypeScript type and as first argument the data to validate.

```typescript
import { validate } from '@deepkit/type';

validate<string>('Hello'); //[]
validate<string>(123); //[{code: 'type', message: 'Not a string', path: ''}]

validate<number>(123); //[]
validate<number>('Hello'); //[{code: 'type', message: 'Not a number', path: ''}]
```

Complex types such as interfaces, classes, or generics can also be used.

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

## Constraints

In addition to checking the types, other arbitrary constraints can be added to a type. The validation of these additional content constraints is done automatically after the types themselves have been validated. This is done in all validation functions like `validate`, `is`, and `assert`.
A restriction can be, for example, that a string must have a certain minimum or maximum length. These restrictions are added to the actual types via [Type Annotations](./types.md). There is a whole variety of annotations that can be used. Own annotations can be defined and used at will in case of extended needs.

```typescript
import { MinLength } from '@deepkit/type';

type Username = string & MinLength<3>;
```

With `&` any number of type annotations can be added to the actual type. The result, here `username`, can then be used in all validation functions but also in other types.

```typescript
import { is } from '@deepkit/type';

is<Username>('ab'); //false, because minimum length is 3
is<Username>('Joe'); //true

interface User {
  id: number;
  username: Username;
}

is<User>({id: 1, username: 'ab'}); //false, because minimum length is 3
is<User>({id: 1, username: 'Joe'}); //true
```

The function `validate` gives useful error messages coming from the constraints.

```typescript
import { validate } from '@deepkit/type';

const errors = validate<Username>('xb');
//[{ code: 'minLength', message: `Min length is 3` }]
```

This information can be represented for example wonderfully also at a form automatically and be translated by means of the `code`. Through the existing path for objects and arrays, fields in a form can filter out and display the appropriate error.

```typescript
validate<User>({id: 1, username: 'ab'});
//{ path: 'username', code: 'minLength', message: `Min length is 3` }
```

An often useful use case is also to define an email with a RegExp constraint. Once the type is defined, it can be used anywhere.

```typescript
export const emailRegexp = /^\S+@\S+$/;
type Email = string & Pattern<typeof emailRegexp>

is<Email>('abc'); //false
is<Email>('joe@example.com'); //true
```

Any number of constraints can be added.

```typescript
type ID = number & Positive & Maximum<1000>;

is<ID>(-1); //false
is<ID>(123); //true
is<ID>(1001); //true
```

### Constraint Types

#### Validate<typeof myValidator>

Validation using a custom validator function. See next section Custom Validator for more information.

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

Defines a regular expression as validation pattern. Usually used for E-Mail validation or more complex content validation.

```typescript
import { Pattern } from '@deepkit/type';

const myRegExp = /[a-zA-Z]+/;
type T = string & Pattern<typeof myRegExp>
```

#### Alpha

Validation for alpha characters (a-Z).

```typescript
import { Alpha } from '@deepkit/type';

type T = string & Alpha;
```


#### Alphanumeric

Validation for alpha and numeric characters.

```typescript
import { Alphanumeric } from '@deepkit/type';

type T = string & Alphanumeric;
```


#### Ascii

Validation for ASCII characters.

```typescript
import { Ascii } from '@deepkit/type';

type T = string & Ascii;
```


#### Decimal<number, number>

Validation for string represents a decimal number, such as 0.1, .3, 1.1, 1.00003, 4.0, etc.

```typescript
import { Decimal } from '@deepkit/type';

type T = string & Decimal<1, 2>;
```


#### MultipleOf<number>

Validation of numbers that are a multiple of given number.

```typescript
import { MultipleOf } from '@deepkit/type';

type T = number & MultipleOf<3>;
```


#### MinLength<number>, MaxLength<number>, MinMax<number, number>

Validation for min/max length for arrays or strings.

```typescript
import { MinLength, MaxLength, MinMax } from '@deepkit/type';

type T = any[] & MinLength<1>;

type T = string & MinLength<3> & MaxLength<16>;

type T = string & MinMax<3, 16>;
```

#### Includes<'any'> Excludes<'any'>

Validation for an array item or sub string being included/excluded

```typescript
import { Includes, Excludes } from '@deepkit/type';

type T = any[] & Includes<'abc'>;
type T = string & Excludes<' '>;
```

#### Minimum<number>, Maximum<number>

Validation for a value being minimum or maximum given number. Same as `>=` and `<=`.

```typescript
import { Minimum, Maximum, MinMax } from '@deepkit/type';

type T = number & Minimum<10>;
type T = number & Minimum<10> & Maximum<1000>;

type T = number & MinMax<10, 1000>;
```

#### ExclusiveMinimum<number>, ExclusiveMaximum<number>

Same as minimum/maximum but excludes the value itself. Same as `>` and `<`.

```typescript
import { ExclusiveMinimum, ExclusiveMaximum } from '@deepkit/type';

type T = number & ExclusiveMinimum<10>;
type T = number & ExclusiveMinimum<10> & ExclusiveMaximum<1000>;
```


#### Positive, Negative, PositiveNoZero, NegativeNoZero

Validation for a value being positive or negative.

```typescript
import { Positive, Negative } from '@deepkit/type';

type T = number & Positive;
type T = number & Negative;
```


#### BeforeNow, AfterNow

Validation for a date value compared to now (new Date)..

```typescript
import { BeforeNow, AfterNow } from '@deepkit/type';

type T = Date & BeforeNow;
type T = Date & AfterNow;
```

#### Email

Simple regexp validation of emails via `/^\S+@\S+$/`. Is automatically a `string`, so no need to do `string & Email`.

```typescript
import { Email } from '@deepkit/type';

type T = Email;
```

#### integer

Ensures that the number is an integer in the correct range. Is automatically a `number`, so no need to do `number & integer`.

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

See Special types: integer/floats for more information

### Custom validator

If the built-in validators are not sufficient, custom validation functions can be created and used via the `Validate` decorator.

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

Note that your custom validation function is executed after all built-in type validators have been called. If a validator fails, all subsequent validators for the current type are skipped. Only one failure is possible per type.

#### Generic Validator

In the Validator function the type object is available which can be used to get more information about the type using the validator. There is also a possibility to define an arbitrary validator option that must be passed to the validate type and makes the validator configurable. With this information and its parent references, powerful generic validators can be created.

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
