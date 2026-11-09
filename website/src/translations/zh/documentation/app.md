# TypeScript CLI 框架

Deepkit App 是一个 TypeScript CLI 框架，函数签名本身就是命令定义。参数（arguments）、标志（flags）、默认值和校验都来自你的 TypeScript 类型，因此无需重复声明。

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

`name` 会成为必需的 argument，`times` 会成为默认值为 1 的 `--times` flag，而 `greeter` 则由依赖注入容器提供。

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

## 与 Commander、Yargs 和 oclif 的比较

|                  | Deepkit App                  | Commander         | Yargs                        | oclif                 |
| ---------------- | ---------------------------- | ----------------- | ---------------------------- | --------------------- |
| 选项定义方式     | 命令的 TypeScript 类型       | `.option()` 调用  | Builder 调用                 | 类上的静态 `flags`    |
| 校验             | 来自类型，例如 `Maximum<5>`  | 自行编写解析函数  | `choices`、`coerce`、`check` | Flag 选项和解析器     |
| 依赖注入         | 内置                         | 无                | 无                           | 无                    |
| 配置、模块       | 内置                         | 无                | 仅配置文件                   | 插件                  |

Deepkit 需要在构建流程中使用 [Deepkit 类型编译器](./runtime-types/getting-started.md)，因为它要在运行时读取你的类型。对于没有构建步骤的小型脚本，Commander 这样的库是更简单的选择。

## Deepkit App 包含的内容

Deepkit App 是 Deepkit 应用最基础的构建模块，如果你不是单独使用各个库，通常都会从它开始。它是一个普通的 TypeScript 文件，可以用 Node.js 等运行时执行，并提供以下功能：

- CLI 命令
- 模块系统
- 服务容器
- 依赖注入
- 事件系统
- Logger
- 配置加载器（env、dotenv、json）

命令可以完全访问 DI 容器，因此能够访问所有 provider 和配置选项。Deepkit 没有专用的全局 CLI 工具：HTTP/RPC 服务器、迁移以及你自己的命令都从同一个文件启动。

[Deepkit Framework](./framework.md)（`@deepkit/framework`）在此基础上进一步扩展，提供用于 HTTP/RPC 的应用服务器、调试器/性能分析器等更多功能。

## 快速安装

最简单的入门方式是使用 NPM init 创建一个新的 Deepkit 项目。

```shell
npm init @deepkit/app@latest my-deepkit-app
```

这会创建一个新文件夹 `my-deepkit-app`，其中包含所有依赖项和一个基础的 `app.ts` 文件。

```sh
cd my-deepkit-app
npm run app
```

这会使用 `ts-node` 运行 `app.ts` 文件，并显示可用的命令。你可以从这里开始，添加自己的命令、控制器等。

## 手动安装

Deepkit App 基于 [Deepkit Runtime Types](./runtime-types.md)，因此我们先安装所有依赖项：

```bash
mkdir my-project && cd my-project

npm install typescript ts-node 
npm install @deepkit/app @deepkit/type @deepkit/type-compiler
```

接下来，运行以下命令，确保 Deepkit 的类型编译器已安装到位于 `node_modules/typescript` 的 TypeScript 包中：

```sh
./node_modules/.bin/deepkit-type-install
```

请确保所有 peer dependencies 都已安装。默认情况下，NPM 7+ 会自动安装它们。

要编译应用，我们需要 TypeScript 编译器，并推荐使用 `ts-node` 来方便地运行应用。

除了使用 `ts-node`，也可以用 TypeScript 编译器编译源代码，然后直接执行生成的 JavaScript 代码。这样做的优点是能大幅提升短命令的执行速度，但也会带来额外的工作流负担，因为你需要手动运行编译器或配置 watcher。因此，本文档的所有示例都使用 `ts-node`。

## 第一个应用

由于 Deepkit 框架不使用配置文件或特殊的文件夹结构，你可以按自己的意愿组织项目。入门只需要两个文件：TypeScript 文件 app.ts 和 TypeScript 配置文件 tsconfig.json。

我们的目标是在项目文件夹中包含以下文件：

```
.
├── app.ts
├── node_modules
├── package-lock.json
└── tsconfig.json
```

我们创建一个基础的 tsconfig 文件，并通过将 `reflection` 设置为 `true` 来启用 Deepkit 的类型编译器。
这是使用依赖注入容器和其他功能的必要条件。

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

在这段代码中，我们定义了一个 test 命令，并创建了一个新应用，然后直接通过 `run()` 运行它。运行此脚本即可启动应用。

然后直接运行它。

```sh
$ ./node_modules/.bin/ts-node app.ts
VERSION
  Node

USAGE
  $ ts-node app.ts [COMMAND]

COMMANDS
  test
```

现在，要执行我们的 test 命令，请运行以下命令。

```sh
$ ./node_modules/.bin/ts-node app.ts test
Hello World
```

在 Deepkit 中，现在一切都通过这个 `app.ts` 完成。你可以随意重命名该文件，也可以创建更多文件。自定义 CLI 命令、HTTP/RPC 服务器、迁移命令等都从这个入口点启动。

## Arguments 和 Flags

Deepkit App 会自动将函数参数转换为 CLI arguments 和 flags。参数的顺序决定了 CLI arguments 的顺序。

参数可以是任意 TypeScript 类型，并会自动进行校验和反序列化。

更多信息请参阅 [Arguments 和 Flags](./app/arguments.md) 一章。

## 依赖注入

Deepkit App 会设置一个服务容器，并为每个导入的模块创建各自的依赖注入容器，这些容器继承自其父容器。
它开箱即用地提供以下 provider，你可以将它们自动注入到服务、控制器和事件监听器中：

- `Logger` 用于日志记录
- `EventDispatcher` 用于事件处理
- `CliControllerRegistry` 用于管理已注册的 CLI 命令
- `MiddlewareRegistry` 用于管理已注册的中间件
- `InjectorContext` 用于访问当前的注入器上下文

导入 Deepkit Framework 后，你还会获得更多 provider。详情请参阅 [Deepkit Framework](./framework.md)。

## 退出码

退出码默认为 0，表示命令已成功执行。要更改退出码，应在 execute 方法或命令回调中返回一个非 0 的数字。

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
