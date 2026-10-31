# 数据库

Deepkit 具有自己强大的数据库抽象库，称为 Deepkit ORM。它是一款对象关系映射（ORM）库，可简化与 SQL 数据库和 MongoDB 的协作。

虽然你可以使用任意数据库库，但我们推荐 Deepkit ORM，因为它是最快的 TypeScript 数据库抽象库，与 Deepkit 框架深度集成，并拥有许多能提升工作流程与效率的特性。

本章解释如何在你的 Deepkit 应用中使用 Deepkit ORM。有关 Deepkit ORM 的完整信息，请参阅[ORM](../orm.md)章节。

## 数据库类

在应用中使用 Deepkit ORM 的 `Database` 对象的最简单方式，是注册一个从其派生的类。

```typescript
import { Database } from '@deepkit/orm';
import { SQLiteDatabaseAdapter } from '@deepkit/sqlite';
import { User } from './models';

export class SQLiteDatabase extends Database {
    constructor() {
        super(
            new SQLiteDatabaseAdapter('/tmp/myapp.sqlite'), 
            [User]
        );
    }
}
```

创建一个新类，并在其构造函数中指定适配器及其参数；同时在第二个参数中添加所有应连接到此数据库的实体模型。

现在你可以将该数据库类注册为提供者（provider）。我们还启用 `migrateOnStartup`，它会在启动时自动在你的数据库中创建所有表。这非常适合快速原型开发，但不建议用于严肃项目或生产环境。此时应使用常规的数据库迁移。

我们还启用 `debug`，这样在应用服务器启动时可以打开调试器，并在内置的 ORM 浏览器中直接管理你的数据库模型。

```typescript
import { App } from '@deepkit/app';
import { FrameworkModule } from '@deepkit/framework';
import { SQLiteDatabase } from './database.ts';

new App({
    providers: [SQLiteDatabase],
    imports: [
        new FrameworkModule({
            migrateOnStartup: true,
            debug: true,
        })
    ]
}).run();
```

现在你可以通过依赖注入在任意位置访问 `SQLiteDatabase`：

```typescript
import { SQLiteDatabase } from './database.ts';

export class Controller {
    constructor(protected database: SQLiteDatabase) {}

    @http.GET()
    async startPage(): Promise<User[]> {
        //返回所有用户
        return await this.database.query(User).find();
    }
}
```

## 配置

在许多情况下，你希望连接凭据是可配置的。比如，测试环境与生产环境使用不同的数据库。你可以通过 `Database` 类的 `config` 选项来实现。

```typescript
//database.ts
import { Database } from '@deepkit/orm';
import { PostgresDatabaseAdapter } from '@deepkit/sqlite';
import { User } from './models';

type DbConfig = Pick<AppConfig, 'databaseHost', 'databaseUser', 'databasePassword'>;

export class MainDatabase extends Database {
    constructor(config: DbConfig) {
        super(new PostgresDatabaseAdapter({
            host: config.databaseHost,
            user: config.databaseUser,
            password: config.databasePassword,
        }), [User]);
    }
}
```

```typescript
//config.ts
export class AppConfig {
    databaseHost: string = 'localhost';
    databaseUser: string = 'postgres';
    databasePassword: string = '';
}
```

```typescript
//app.ts
import { App } from '@deepkit/app';
import { FrameworkModule } from '@deepkit/framework';
import { MainDatabase } from './database.ts';
import { AppConfig } from './config.ts';

const app = new App({
    config: AppConfig,
    providers: [MainDatabase],
    imports: [
        new FrameworkModule({
            migrateOnStartup: true,
            debug: true,
        })
    ]
});
app.loadConfigFromEnv({prefix: 'APP_', namingStrategy: 'upper', envFilePath: ['local.env', 'prod.env']});
app.run();
```

现在，由于我们使用了 loadConfigFromEnv，我们可以通过环境变量来设置数据库凭据。

```sh
APP_DATABASE_HOST=localhost APP_DATABASE_USER=postgres ts-node app.ts server:start
```

或者在 `local.env` 文件中设置，并在未预先设置任何环境变量的情况下启动 `ts-node app.ts server:start`。

```sh
APP_DATABASE_HOST=localhost
APP_DATABASE_USER=postgres
```

## 多个数据库

你可以按需添加任意数量的数据库类，并为它们任意命名。请确保修改每个数据库的名称，以免在使用 Deepkit ORM 浏览器时与其他数据库冲突。

## 管理数据

现在你已经完成所有设置，可以使用 Deepkit ORM 浏览器来管理你的数据库数据。要打开 Deepkit ORM 浏览器并管理内容，请将上述所有步骤写入 `app.ts` 文件并启动服务器。

```sh
$ ts-node app.ts server:start
2021-06-11T15:08:54.330Z [LOG] Start HTTP server, using 1 workers.
2021-06-11T15:08:54.333Z [LOG] Migrate database default
2021-06-11T15:08:54.336Z [LOG] RPC DebugController deepkit/debug/controller
2021-06-11T15:08:54.337Z [LOG] RPC OrmBrowserController orm-browser/controller
2021-06-11T15:08:54.337Z [LOG] HTTP OrmBrowserController
2021-06-11T15:08:54.337Z [LOG]     GET /_orm-browser/query httpQuery
2021-06-11T15:08:54.337Z [LOG] HTTP StaticController
2021-06-11T15:08:54.337Z [LOG]     GET /_debug/:any serviceApp
2021-06-11T15:08:54.337Z [LOG] HTTP listening at http://localhost:8080/
```

现在你可以打开 http://localhost:8080/_debug/database/default。

![调试器数据库](/assets/documentation/framework/debugger-database.png)

你可以看到 ER（实体关系）图。目前只有一个实体可用。如果你添加了更多带关系的实体，你将一目了然地看到所有信息。

如果你在左侧侧栏点击 `User`，即可管理其内容。点击 `+` 图标并修改新记录的标题。更改所需的值（例如用户名）后，点击 `Confirm`。这会将所有更改提交到数据库并使之生效。自增 ID 会自动分配。

![调试器数据库用户](/assets/documentation/framework/debugger-database-user.png)

## 进一步了解

要进一步了解 `SQLiteDatabase` 的工作方式，请阅读[数据库](../orm.md)一章及其子章节，例如查询数据、通过会话操作数据、定义关系等。
请注意，那些章节针对的是独立库 `@deepkit/orm`，并不包含本章上文所述的 Deepkit 框架部分的文档。在独立库中，你需要手动实例化数据库类，例如通过 `new SQLiteDatabase()`。然而，在你的 Deepkit 应用中，这由依赖注入容器自动完成。

## 迁移

Deepkit 框架提供了强大的迁移系统，允许你创建、执行和回滚迁移。该迁移系统基于 Deepkit ORM 库，因此与框架完美集成。

`FrameworkModule` 提供了多个用于管理迁移的命令。

- `migration:create` - 基于数据库差异生成新的迁移文件
- `migration:pending` - 显示待执行的迁移文件
- `migration:up` - 执行待执行的迁移文件
- `migration:down` - 执行向下迁移，回滚旧的迁移文件

```sh
ts-node app.ts migration:create --migrationDir src/migrations
```

一个新的迁移文件会创建在 `migrations` 目录中。该目录是 FrameworkModule 中配置的默认目录。要更改它，可以通过环境变量（如[配置](../app/configuration.md)一章所述）修改配置，或在构造 `FrameworkModule` 时传入 `migrationDir` 选项。

```typescript
new FrameworkModule({
    migrationDir: 'src/migrations',
})
```

新创建的迁移文件现在包含 up 和 down 方法，它们基于你的 TypeScript 应用中定义的实体与已配置数据库之间的差异生成。
你可以根据需要修改 up 方法。down 方法会基于 up 方法自动生成。
将该文件提交到你的代码仓库，以便其他开发者也能执行它。

### 待执行的迁移

```sh
ts-node app.ts migration:pending --migrationDir src/migrations
```

这会显示所有待执行的迁移。如果你有尚未执行的新迁移文件，它会列在这里。

### 执行迁移

```sh
ts-node app.ts migration:up --migrationDir src/migrations
```

这将执行下一个待执行的迁移。

### 回滚迁移

```sh
ts-node app.ts migration:down --migrationDir src/migrations
```

这将回滚上一次执行的迁移。

### 伪迁移

假设你尝试执行一次迁移（向上或向下），但失败了。你手动修复了问题，但现在无法再次执行该迁移，因为它已被标记为已执行。此时可以使用 `--fake` 选项来伪装执行：在不实际执行的情况下，将该迁移在数据库中标记为已执行。这样你就可以继续执行下一个待执行的迁移。

```sh
ts-node app.ts migration:up --migrationDir src/migrations --fake
```