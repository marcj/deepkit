# TypeScript CLI Framework

Deepkit App is a TypeScript CLI framework where the function signature is the command definition. Arguments, flags, defaults and validation come from your TypeScript types, so there is nothing to declare twice.

```typescript title=app.ts
import { App, Flag } from '@deepkit/app';
import { Logger } from '@deepkit/logger';
import { Maximum } from '@deepkit/type';

class Greeter {
    constructor(private logger: Logger) {}

    greet(name: string) {
        this.logger.log(`Hello ${name}`);
    }
}

function greet(
    name: string,
    times: number & Maximum<5> & Flag = 1,
    greeter: Greeter,
) {
    for (let i = 0; i < times; i++) greeter.greet(name);
}

new App({ providers: [Greeter] })
    .command('greet', greet)
    .run();
```

`name` becomes a required argument, `times` becomes the `--times` flag with a default of 1, and `greeter` is provided by the dependency injection container.

```sh
$ ts-node app.ts greet Peter --times 2
Hello Peter
Hello Peter

$ ts-node app.ts greet Peter --times 9
Invalid value for option --times: 9.
Number needs to be smaller than or equal to 5

$ ts-node app.ts greet Peter --times abc
Invalid value for option --times: abc.
Cannot convert abc to number [type]

$ ts-node app.ts greet --help
Usage: ts-node app.ts greet [OPTIONS] [name]

Arguments:
  name	[required]
Options:
  --times number [default=1]
```

## Comparison with Commander, Yargs and oclif

|                        | Deepkit App                      | Commander                 | Yargs                        | oclif                     |
| ---------------------- | -------------------------------- | ------------------------- | ---------------------------- | ------------------------- |
| Options defined by     | TypeScript types of the command  | `.option()` calls         | Builder calls                | Static `flags` on a class |
| Validation             | From the type, e.g. `Maximum<5>` | Your own parser functions | `choices`, `coerce`, `check` | Flag options and parsers  |
| Dependency injection   | Built in                         | None                      | None                         | None                      |
| Configuration, modules | Built in                         | None                      | Config files only            | Plugins                   |

Deepkit needs the [Deepkit type compiler](./runtime-types/getting-started.md) in your build, because it reads your types at runtime. For a small script without a build step, a library like Commander is the simpler choice.

## What Deepkit App includes

Deepkit App is the most fundamental building block of a Deepkit application, and usually where you start if you are not using the libraries standalone. It is a regular TypeScript file that you execute with a runtime like Node.js, and it provides:

- CLI commands
- Module system
- Service container
- Dependency injection
- Event system
- Logger
- Configuration loader (env, dotenv, json)

A command has full access to the DI container and can thus access all providers and configuration options. There is no Deepkit specific global CLI tool: the HTTP/RPC server, migrations and your own commands all start from the same file.

[Deepkit Framework](./framework.md) with `@deepkit/framework` extends this further with an application server for HTTP/RPC, a debugger/profiler, and much more.

## Installation Easy

The easiest way to get started is to use NPM init to create a new Deepkit project.

```shell
npm init @deepkit/app@latest my-deepkit-app
```

This will create a new folder `my-deepkit-app` with all the dependencies and a basic `app.ts` file.

```sh
cd my-deepkit-app
npm run app
```

This will run the `app.ts` file with `ts-node` and show you the available commands. You can start from here and add your own commands, controllers, and so on.

## Installation Manually

Deepkit App is based on [Deepkit Runtime Types](./runtime-types.md), so let's install all dependencies:

```bash
mkdir my-project && cd my-project

npm install typescript ts-node 
npm install @deepkit/app @deepkit/type @deepkit/type-compiler
```

Next, we make sure Deepkit's type compiler is installed into the installed TypeScript package at `node_modules/typescript` by running the following command:

```sh
./node_modules/.bin/deepkit-type-install
```

Make sure that all peer dependencies are installed. By default, NPM 7+ installs them automatically.

To compile your application, we need the TypeScript compiler and recommend `ts-node` to easily run the app.

An alternative to using `ts-node` is to compile the source code with the TypeScript compiler and execute the JavaScript source code directly. This has the advantage of dramatically
increasing execution speed for short commands. However, it also creates additional workflow overhead by either manually running the compiler or setting up a watcher. For this
reason, `ts-node` is used in all examples in this documentation.

## First application

Since the Deepkit framework does not use configuration files or a special folder structure, you can structure your project however you want. The only two files you need to get
started are the TypeScript app.ts file and the TypeScript configuration tsconfig.json.

Our goal is to have the following files in our project folder:

```
.
├── app.ts
├── node_modules
├── package-lock.json
└── tsconfig.json
```

We set up a basic tsconfig file and enable Deepkit's type compiler by setting `reflection` to `true`.
This is required to use the dependency injection container and other features.

```json title=tsconfig.json
{
  "compilerOptions": {
    "outDir": "./dist",
    "experimentalDecorators": true,
    "strict": true,
    "esModuleInterop": true,
    "target": "es2020",
    "module": "CommonJS",
    "moduleResolution": "node"
  },
  "reflection": true,
  "files": [
    "app.ts"
  ]
}
```

```typescript title=app.ts
import { App } from '@deepkit/app';
import { Logger } from '@deepkit/logger';

const app = new App();

app.command('test', (logger: Logger) => {
    logger.log('Hello World!');
});

app.run();
```

In this code, you can see that we have defined a test command and created a new app that we run directly using `run()`. By running this script, we start the app.

and then run it directly.

```sh
$ ./node_modules/.bin/ts-node app.ts
VERSION
  Node

USAGE
  $ ts-node app.ts [COMMAND]

COMMANDS
  test
```

Now, to execute our test command, we run the following command.

```sh
$ ./node_modules/.bin/ts-node app.ts test
Hello World
```

In Deepkit everything is now done via this `app.ts`. You can rename the file as you like or create more. Custom CLI commands, HTTP/RPC server, migration commands, and so on are all
started from this entry point.

## Arguments & Flags

Deepkit App automatically converts function parameters into CLI arguments and flags. The order of the parameters dictates the order of the CLI arguments

Parameters can be any TypeScript type and are automatically validated and deserialized.

See the chapter [Arguments & Flags](./app/arguments.md) for more information.

## Dependency Injection

Deepkit App sets up a service container and for each imported module its own Dependency Injection container that inherits from its parents.
It brings out of the box following providers you can automatically inject into your services, controllers, and event listeners:

- `Logger` for logging
- `EventDispatcher` for event handling
- `CliControllerRegistry` for registered CLI commands
- `MiddlewareRegistry` for registered middleware
- `InjectorContext` for the current injector context

As soon as you import Deepkit Framework you get additional providers. See [Deepkit Framework](./framework.md) for more details.

## Exit code

The exit code is 0 by default, which means that the command was executed successfully. To change the exit code, a number other than 0 should be returned in the execute method or command callback.

```typescript
import { cli } from '@deepkit/app';

@cli.controller('test')
export class TestCommand {
    async execute() {
        console.error('Error :(');
        return 12;
    }
}
```
