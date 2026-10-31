# Documentation

Deepkit is an open-source TypeScript framework for backend applications freely available under the MIT license, designed to help you build scalable and maintainable backend applications. It's designed to work in the browser and Node.js, but can run in any proper JavaScript environment.

Here you find chapters for the different components of Deepkit and API references for all our packages.

If you need help, please feel free to join our [Discord server](https://discord.com/invite/PtfVf7B8UU) or open an issue 
on [GitHub](https://github.com/deepkit/deepkit-framework).

## Chapters


- [App](/documentation/app.md) - Write your first application with Deepkit based on the command line interface.
- [Framework](/documentation/framework.md) - Add application (HTTP/RPC) server, API docs, debugger, integration tests, and more to your application.
- [Runtime Types](/documentation/runtime-types.md) - Learn about TypeScript runtime types, and to validate and transform data.
- [Dependency Injection](/documentation/dependency-injection.md) - Dependency injection container, inversion of control, and dependency inversion.
- [Filesystem](/documentation/filesystem.md) - Filesystem abstraction to work with local and remote files systems in unified way.
- [Broker](/documentation/broker.md) - Message broker abstraction to work with distributed L2 cache, pub/sub, queues, central atomic locks, or key-value store.
- [HTTP](/documentation/http.md) - HTTP server abstraction to build type-safe endpoints.
- [RPC](/documentation/rpc.md) - Remote procedure call abstraction to connect frontend with backend, or to connect multiple backend services.
- [ORM](/documentation/orm.md) - ORM and DBAL to store and query data in a type-safe way.
- [Desktop-UI](/documentation/desktop-ui/getting-started) - Build GUI applications with Deepkit's Angular-based UI framework.

## API Reference

Following is a complete list of all Deepkit packages with links to their API documentation.

### Composition

- [@deepkit/app](/documentation/package/app.md)
- [@deepkit/framework](/documentation/package/framework.md)
- [@deepkit/http](/documentation/package/http.md)
- [@deepkit/angular-ssr](/documentation/package/angular-ssr.md)

### Infrastructure

- [@deepkit/rpc](/documentation/package/rpc.md)
- [@deepkit/rpc-tcp](/documentation/package/rpc-tcp.md)
- [@deepkit/broker](/documentation/package/broker.md)
- [@deepkit/broker-redis](/documentation/package/broker-redis.md)

### Filesystem

- [@deepkit/filesystem](/documentation/package/filesystem.md)
- [@deepkit/filesystem-ftp](/documentation/package/filesystem-ftp.md)
- [@deepkit/filesystem-sftp](/documentation/package/filesystem-sftp.md)
- [@deepkit/filesystem-s3](/documentation/package/filesystem-aws-s3.md)
- [@deepkit/filesystem-google](/documentation/package/filesystem-google.md)
- [@deepkit/filesystem-database](/documentation/package/filesystem-database.md)

### Database

- [@deepkit/orm](/documentation/package/orm.md)
- [@deepkit/mysql](/documentation/package/mysql.md)
- [@deepkit/postgres](/documentation/package/postgres.md)
- [@deepkit/sqlite](/documentation/package/sqlite.md)
- [@deepkit/mongodb](/documentation/package/mongo.md)

### Fundamentals

- [@deepkit/type](/documentation/package/type.md)
- [@deepkit/event](/documentation/package/event.md)
- [@deepkit/injector](/documentation/package/injector.md)
- [@deepkit/template](/documentation/package/template.md)
- [@deepkit/logger](/documentation/package/logger.md)
- [@deepkit/workflow](/documentation/package/workflow.md)
- [@deepkit/stopwatch](/documentation/package/stopwatch.md)

### Tools

- [@deepkit/api-console](/documentation/package/api-console.md)
- [@deepkit/devtool](/documentation/package/devtool.md)
- [@deepkit/desktop-ui](/documentation/desktop-ui/getting-started.md)
- [@deepkit/orm-browser](/documentation/package/orm-browser.md)
- [@deepkit/bench](/documentation/package/bench.md)
- [@deepkit/run](/documentation/package/run.md)

### Core

- [@deepkit/bson](/documentation/package/bson.md)
- [@deepkit/core](/documentation/package/core.md)
- [@deepkit/topsort](/documentation/package/topsort.md)

### Runtime

- [@deepkit/vite](/documentation/package/vite.md)
- [@deepkit/bun](/documentation/package/bun.md)
- [@deepkit/type-compiler](/documentation/package/type-compiler.md)
