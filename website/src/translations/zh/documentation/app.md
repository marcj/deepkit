# Deepkit App

Deepkit App 抽象是 Deepkit 应用程序最基础的构建模块。如果你不是单独使用这些库，通常就会从这里开始构建你的应用程序。
它是一个普通的 TypeScript 文件，你可以使用 Node.js 等运行时来执行它。它是你的应用程序的入口点，并提供了定义 CLI 命令、服务、配置、事件等的方式。

命令行界面（CLI）程序是通过终端以文本输入和文本输出的形式进行交互的程序。以这种方式与应用程序交互的优点在于，只需在本地或通过 SSH 连接存在一个终端即可。

它提供：

- CLI 命令
- 模块系统
- 服务容器
- 依赖注入
- 事件系统
- Logger
- 配置加载器（env、dotenv、json）

Deepkit 中的命令可以完全访问 DI 容器，因此可以访问所有 provider 和配置选项。CLI 命令的参数和选项通过 TypeScript 类型的参数声明来控制，并会自动进行序列化和验证。

[Deepkit Framework](./framework.md) 通过 `@deepkit/framework` 进一步扩展了这些功能，提供了用于 HTTP/RPC 的应用服务器、调试器/性能分析器等等。

示例：

```typescript
import { App, Flag } from '@deepkit/app';
import { Database } from './database';

const app = new App({
    providers: [Database]
});

async function testCommand(
    name: string, // CLI 参数
    age: number & Flag, // CLI flag
    database: Database, // 依赖注入
) {
    console.log(`Hello ${name}!`);
    const users = await database.query<User>().find();
}

app.command('test', testCommand);

void app.run();
```

```sh
ts-node app.ts test John --age 42
```

## 简易安装

最简单的入门方式是使用 NPM init 创建一个新的 Deepkit 项目。

```shell
npm init @deepkit/app@latest my-deepkit-app
````

这将创建一个新文件夹 `my-deepkit-app`，其中包含所有依赖项和一个基础的 `app.ts` 文件。

```sh
cd my-deepkit-app
npm run app
````

这会使用 `ts-node` 运行 `app.ts` 文件，并显示可用的命令。你可以从这里开始，添加你自己的命令、控制器等。

## 手动安装

Deepkit App 基于 [Deepkit Runtime Types](./runtime-types.md)，因此让我们安装所有依赖项：

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

要编译你的应用程序，我们需要 TypeScript 编译器，并推荐使用 `ts-node` 来轻松运行应用。

除了使用 `ts-node`，另一种方式是使用 TypeScript 编译器编译源代码，然后直接执行 JavaScript 源代码。这样做的优点是可以显著提高短命令的执行速度。但是，这也会带来额外的工作流开销，因为需要手动运行编译器或设置一个 watcher。因此，本文档中的所有示例都使用 `ts-node`。

## 第一个应用程序

由于 Deepkit 框架不使用配置文件或特殊的文件夹结构，你可以按照自己的意愿组织项目。入门所需的仅有两个文件是 TypeScript 文件 app.ts 和 TypeScript 配置文件 tsconfig.json。

我们的目标是在项目文件夹中包含以下文件：

```
.
├── app.ts
├── node_modules
├── package-lock.json
└── tsconfig.json
```

我们设置一个基础的 tsconfig 文件，并通过将 `reflection` 设置为 `true` 来启用 Deepkit 的类型编译器。
这是使用依赖注入容器和其他功能所必需的。

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

在这段代码中，你可以看到我们定义了一个 test 命令，并创建了一个新的应用，然后直接使用 `run()` 运行它。通过运行此脚本，我们启动了该应用。

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

现在，要执行我们的 test 命令，运行以下命令。

```sh
$ ./node_modules/.bin/ts-node app.ts test
Hello World
```

在 Deepkit 中，现在一切都通过这个 `app.ts` 完成。你可以随意重命名该文件或创建更多文件。自定义 CLI 命令、HTTP/RPC 服务器、迁移命令等都从这个入口点启动。

## 参数与 Flag

Deepkit App 会自动将函数参数转换为 CLI 参数和 flag。参数的顺序决定了 CLI 参数的顺序。

参数可以是任何 TypeScript 类型，并且会自动进行验证和反序列化。

更多信息请参阅 [参数与 Flag](./app/arguments.md) 章节。

## 依赖注入

Deepkit App 会设置一个服务容器，并为每个导入的模块设置其自己的依赖注入容器，该容器继承自其父级容器。
它开箱即用地提供了以下 provider，你可以将它们自动注入到你的服务、控制器和事件监听器中：

- `Logger` 用于日志记录
- `EventDispatcher` 用于事件处理
- `CliControllerRegistry` 用于已注册的 CLI 命令
- `MiddlewareRegistry` 用于已注册的中间件
- `InjectorContext` 用于当前的注入器上下文

一旦你导入 Deepkit Framework，就会获得额外的 provider。更多详情请参阅 [Deepkit Framework](./framework.md)。

## 退出码

退出码默认为 0，表示命令已成功执行。要更改退出码，应在 execute 方法或命令回调中返回一个非 0 的数字。

```typescript

@cli.controller('test')
export class TestCommand {
    async execute() {
        console.error('Error :(');
        return 12;
    }
}
```
