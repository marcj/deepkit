# Arguments & Flags

Command arguments in the terminal of your command are just regular arguments of the `execute` method or the function. They are automatically mapped to the command line arguments.
If you mark a parameter optional, it is not required to be passed. If you have a default value, it is also not required to be passed.

Depending on the type (string, number, union, etc) the passed value is automatically deserialized and validated.

```typescript
import { cli } from '@deepkit/app';

//functional
new App().command('test', (name: string) => {
    console.log('Hello', name);
});

//class
@cli.controller('test')
class TestCommand {
    async execute(name: string) {
        console.log('Hello', name);
    }
}
```

If you execute this command now without specifying the name parameter, an error will be issued:

```sh
$ ts-node app.ts test
RequiredArgsError: Missing 1 required arg:
name
```

By using `--help` you will get more information about the required arguments:

```sh
$ ts-node app.ts test --help
USAGE
  $ ts-node-script app.ts test NAME
```

Once the name is passed as an argument, the command is executed and the name is passed correctly.

```sh
$ ts-node app.ts test "beautiful world"
Hello beautiful world
```

Every primitive parameter type like string, number, boolean, string literals, union of them, as well as arrays of them, are automatically used as CLI arguments
and are automatically validated and deserialized. The order of the parameters dictates the order of the CLI arguments. You can add as many parameters as you want.

As soon as a complex object (interface, class, object literal) is defined, it is treated as a service dependency
and the Dependency Injection Container tries to resolve it. See the chapter [Dependency Injection](dependency-injection.md) for more information.

### Multiple Values

An argument typed as array takes all remaining positional arguments. Each value is deserialized and validated against the element type.
Arguments after the array keep their value, so a command like `cp <files...> <target>` works as expected.

```typescript
new App().command('copy', (files: string[], target: string) => {
    console.log('copy', files, 'to', target);
});

new App().command('delete', (ids: number[]) => {
    console.log('delete', ids);
});
```

```sh
$ ts-node app.ts copy a.txt b.txt backup/
copy [ 'a.txt', 'b.txt' ] to backup/

$ ts-node app.ts delete 1 2 3
delete [ 1, 2, 3 ]

$ ts-node app.ts delete 1 two
Invalid value for argument ids: 1,two. Cannot convert two to number [type]
```

A required array argument needs at least one value. With a default value, e.g. `ids: number[] = []`, it is optional.

## Flags

Flags are another way to pass values to your command. Mostly these are optional, but they don't have to be. Parameters decorated with the `Flag` type can be passed via `--name value` or `--name=value`.

```typescript
import { Flag } from '@deepkit/app';

//functional
new App().command('test', (id: number & Flag) => {
    console.log('id', name);
});

//class
class TestCommand {
    async execute(id: number & Flag) {
        console.log('id', id);
    }
}
```

```sh
$ ts-node app.ts test --help
USAGE
  $ ts-node app.ts test

OPTIONS
  --id=id  (required)
```

In the help view you can see in the "OPTIONS" that a `--id` flag is necessary. If you enter this flag correctly, the command will receive this value.

```sh
$ ts-node app.ts test --id 23
id 23

$ ts-node app.ts test --id=23
id 23
```

### Boolean Flags

Flags have the advantage that they can also be used as a valueless flag, for example to activate a certain behavior. As soon as a parameter is marked as an optional Boolean, this behavior is activated.

```typescript
import { Flag } from '@deepkit/app';

//functional
new App().command('test', (remove: boolean & Flag = false) => {
    console.log('delete?', remove);
});

//class
class TestCommand {
    async execute(remove: boolean & Flag = false) {
        console.log('delete?', remove);
    }
}
```

```sh
$ ts-node app.ts test
delete? false

$ ts-node app.ts test --remove
delete? true
```

### Multiple Flags

To pass multiple values to the same flag, a flag can be marked as an array.

```typescript
import { Flag } from '@deepkit/app';

//functional
new App().command('test', (id: number[] & Flag = []) => {
    console.log('ids', id);
});

//class
class TestCommand {
    async execute(id: number[] & Flag = []) {
        console.log('ids', id);
    }
}
```

```sh
$ ts-node app.ts test
ids: []

$ ts-node app.ts test --id 12
ids: [12]

$ ts-node app.ts test --id 12 --id 23
ids: [12, 23]
```

### Single Character Flags

To allow a flag to be passed as a single character as well, `Flag<{char: 'x'}>` can be used.

```typescript
import { Flag } from '@deepkit/app';

//functional
new App().command('test', (output: string & Flag<{char: 'o'}>) => {
    console.log('output: ', output);
});

//class
class TestCommand {
    async execute(output: string & Flag<{char: 'o'}>) {
        console.log('output: ', output);
    }
}
```

```sh
$ ts-node app.ts test --help
USAGE
  $ ts-node app.ts test

OPTIONS
  -o, --output=output  (required)


$ ts-node app.ts test --output test.txt
output: test.txt

$ ts-node app.ts test -o test.txt
output: test.txt
```

## Optional / Default

The signature of the method/function defines which arguments or flags are optional. If the parameter is optional in the type system, the user does not have to provide it.

```typescript

//functional
new App().command('test', (name?: string) => {
    console.log('Hello', name || 'nobody');
});

//class
class TestCommand {
    async execute(name?: string) {
        console.log('Hello', name || 'nobody');
    }
}
```

```sh
$ ts-node app.ts test
Hello nobody
```

The same for parameters with a default value:

```typescript
//functional
new App().command('test', (name: string = 'body') => {
    console.log('Hello', name);
});

//class
class TestCommand {
    async execute(name: string = 'body') {
        console.log('Hello', name);
    }
}
```

```sh
$ ts-node app.ts test
Hello nobody
```

This also applies to flags in the same way.


## Serialization / Validation

All arguments and flags are automatically deserialized based on its types, validated and can be provided with additional constraints.

Thus, arguments defined as numbers are always guaranteed to be real numbers in the controller, even though the command-line interface is based on text and thus strings. 

```typescript
//functional
new App().command('test', (id: number) => {
    console.log('id', id, typeof id);
});

//class
class TestCommand {
    async execute(id: number) {
        console.log('id', id, typeof id);
    }
}
```

```sh
$ ts-node app.ts test 123
id 123 number
```

Additional constraints can be defined with the type annotations from `@deepkit/type`.

```typescript
import { Positive } from '@deepkit/type';
//functional
new App().command('test', (id: number & Positive) => {
    console.log('id', id, typeof id);
});

//class
class TestCommand {
    async execute(id: number & Positive) {
        console.log('id', id, typeof id);
    }
}
```

The type `Postive` in `id` indicates that only positive numbers are allowed. If the user now passes a negative number, the code will not be executed at all and an error message will be presented.

```sh
$ ts-node app.ts test -123
Validation error in id: Number needs to be positive [positive]
```

This additional validation, which is very easy to do, makes the command much more robust against wrong entries. See the chapter [Validation](../runtime-types/validation.md) for more information.

## Description

To describe a flag or argument, use `@description` comment decorator.

```typescript
import { Positive } from '@deepkit/type';

class TestCommand {
    async execute(
        /** @description The users identifier */
        id: number & Positive,
        /** @description Delete the user? */
        remove: boolean = false
    ) {
        console.log('id', id, typeof id);
    }
}
```

In the help view, this description appears after the flag or argument:

```sh
$ ts-node app.ts test --help
USAGE
  $ ts-node app.ts test ID

ARGUMENTS
  ID  The users identifier

OPTIONS
  --remove  Delete the user?
```
