# 迁移（Migrations）

迁移是一种以结构化、有组织的方式进行数据库 schema 变更的方法。它们以 TypeScript 文件的形式存储在一个目录中，并可以使用命令行工具执行。

使用 Deepkit Framework 时，Deepkit ORM 迁移默认处于启用状态。

## 命令

- `migration:create` - 基于数据库差异生成新的迁移文件
- `migration:pending` - 显示待执行的迁移文件
- `migration:up` - 执行待执行的迁移文件。
- `migration:down` - 执行 down 迁移，回滚旧的迁移文件

当你导入 `FrameworkModule` 时，这些命令可在应用程序中使用，也可以通过 `@deepkit/sql` 中的 `deepkit-sql` 命令行工具使用。

[FrameworkModule 的迁移集成](../framework/database.md#migration)会自动读取你的数据库（你必须将它们定义为 provider），而使用 `deepkit-sql` 时，你必须指定导出数据库的 TypeScript 文件。后者在你不使用 Deepkit Framework、单独使用 Deepkit ORM 时非常有用。

## 创建迁移

```typescript
//database.ts
import { Database } from '@deepkit/orm';
import { SQLiteDatabaseAdapter } from '@deepkit/sqlite';
import { User } from './models';

export class SQLiteDatabase extends Database {
    name = 'default';
    constructor() {
        super(new SQLiteDatabaseAdapter('/tmp/myapp.sqlite'), [User]);
    }
}

export const database = new SQLiteDatabase();
```

```sh
./node_modules/.bin/deepkit-sql migration:create --path database.ts --migrationDir src/migrations
```

`--path` 接收导出 `Database` 实例的文件（可以多次指定）。TypeScript 文件通过 `ts-node` 加载（必须已安装），以便实体能够获得其运行时类型。

一个新的迁移文件会被创建在 `src/migrations` 中。

新创建的迁移文件现在包含 up 和 down 方法，它们基于你的 TypeScript 应用中定义的实体与所配置数据库之间的差异生成。
你现在可以根据需要修改 up 方法。down 方法会基于 up 方法自动生成。
将此文件提交到你的代码仓库，以便其他开发者也可以执行它。

## 待执行的迁移

```sh
./node_modules/.bin/deepkit-sql migration:pending --path database.ts --migrationDir src/migrations
```

这会显示所有待执行的迁移。如果你有尚未执行的新迁移文件，它将在此处列出。

## 执行迁移

```sh
./node_modules/.bin/deepkit-sql migration:up --path database.ts --migrationDir src/migrations
```

这会执行下一个待执行的迁移。

## 回滚迁移

```sh
./node_modules/.bin/deepkit-sql migration:down --path database.ts --migrationDir src/migrations
```

这会回滚最后一次执行的迁移。

## 伪迁移（Fake migrations）

假设你想执行一个迁移（up 或 down），但它失败了。你手动修复了问题，但现在无法再次执行该迁移，因为它已被标记为已执行。你可以使用 `--fake` 选项来伪造该迁移，使其在数据库中被标记为已执行，而不会实际执行它。这样你就可以执行下一个待执行的迁移。

```sh
./node_modules/.bin/deepkit-sql migration:up --path database.ts --migrationDir src/migrations --fake
```
