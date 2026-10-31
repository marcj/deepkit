# 文档

Deepkit 是一个面向后端应用的开源 TypeScript 框架，在 MIT 许可下免费提供，旨在帮助你构建可扩展且易维护的后端应用。它被设计用于在浏览器和 Node.js 中工作，但也可以在任何合适的 JavaScript 环境中运行。

在这里你可以找到 Deepkit 各个组件的章节以及我们所有包的 API 参考。

如果你需要帮助，欢迎加入我们的[Discord 服务器](https://discord.com/invite/PtfVf7B8UU)或在 [GitHub](https://github.com/deepkit/deepkit-framework) 上提交 issue。

## 章节


- [应用](/documentation/app.md) - 基于命令行界面，使用 Deepkit 编写你的第一个应用。
- [框架](/documentation/framework.md) - 为你的应用添加应用（HTTP/RPC）服务器、API 文档、调试器、集成测试等。
- [运行时类型](/documentation/runtime-types.md) - 了解 TypeScript 运行时类型，以及如何验证与转换数据。
- [依赖注入](/documentation/dependency-injection.md) - 依赖注入容器、控制反转与依赖倒置。
- [文件系统](/documentation/filesystem.md) - 文件系统抽象，以统一方式处理本地与远程文件系统。
- [消息代理](/documentation/broker.md) - 消息代理抽象，用于处理分布式二级缓存、发布/订阅、队列、集中式原子锁或键值存储。
- [HTTP](/documentation/http.md) - HTTP 服务器抽象，用于构建类型安全的端点。
- [RPC](/documentation/rpc.md) - 远程过程调用抽象，用于连接前端与后端，或连接多个后端服务。
- [ORM](/documentation/orm.md) - ORM 与 DBAL，以类型安全的方式存储和查询数据。
- [桌面 UI](/documentation/desktop-ui/getting-started) - 使用 Deepkit 基于 Angular 的 UI 框架构建 GUI 应用。

## API 参考

以下是所有 Deepkit 包的完整列表及其 API 文档链接。

### 组成

- [@deepkit/app](/documentation/package/app.md)
- [@deepkit/framework](/documentation/package/framework.md)
- [@deepkit/http](/documentation/package/http.md)
- [@deepkit/angular-ssr](/documentation/package/angular-ssr.md)

### 基础设施

- [@deepkit/rpc](/documentation/package/rpc.md)
- [@deepkit/rpc-tcp](/documentation/package/rpc-tcp.md)
- [@deepkit/broker](/documentation/package/broker.md)
- [@deepkit/broker-redis](/documentation/package/broker-redis.md)

### 文件系统

- [@deepkit/filesystem](/documentation/package/filesystem.md)
- [@deepkit/filesystem-ftp](/documentation/package/filesystem-ftp.md)
- [@deepkit/filesystem-sftp](/documentation/package/filesystem-sftp.md)
- [@deepkit/filesystem-s3](/documentation/package/filesystem-aws-s3.md)
- [@deepkit/filesystem-google](/documentation/package/filesystem-google.md)
- [@deepkit/filesystem-database](/documentation/package/filesystem-database.md)

### 数据库

- [@deepkit/orm](/documentation/package/orm.md)
- [@deepkit/mysql](/documentation/package/mysql.md)
- [@deepkit/postgres](/documentation/package/postgres.md)
- [@deepkit/sqlite](/documentation/package/sqlite.md)
- [@deepkit/mongodb](/documentation/package/mongo.md)

### 基础

- [@deepkit/type](/documentation/package/type.md)
- [@deepkit/event](/documentation/package/event.md)
- [@deepkit/injector](/documentation/package/injector.md)
- [@deepkit/template](/documentation/package/template.md)
- [@deepkit/logger](/documentation/package/logger.md)
- [@deepkit/workflow](/documentation/package/workflow.md)
- [@deepkit/stopwatch](/documentation/package/stopwatch.md)

### 工具

- [@deepkit/api-console](/documentation/package/api-console.md)
- [@deepkit/devtool](/documentation/package/devtool.md)
- [@deepkit/desktop-ui](/documentation/desktop-ui/getting-started.md)
- [@deepkit/orm-browser](/documentation/package/orm-browser.md)
- [@deepkit/bench](/documentation/package/bench.md)
- [@deepkit/run](/documentation/package/run.md)

### 核心

- [@deepkit/bson](/documentation/package/bson.md)
- [@deepkit/core](/documentation/package/core.md)
- [@deepkit/topsort](/documentation/package/topsort.md)

### 运行时

- [@deepkit/vite](/documentation/package/vite.md)
- [@deepkit/bun](/documentation/package/bun.md)
- [@deepkit/type-compiler](/documentation/package/type-compiler.md)