# Migrations

Migrations are a way to make database schema changes in a structured and organized manner. They are stored as TypeScript files in a directory and can be executed using the command-line tool.

Deepkit ORM migrations are enabled by default when Deepkit Framework is used. 

## Commands

- `migration:create` - Generates a new migration file based on a database diff
- `migration:pending` - Shows pending migration files
- `migration:up` - Executes pending migration files.
- `migration:down` - Executes down migration, reverting old migration files

These commands are available either in application when you import the `FrameworkModule` or via the `deepkit-sql` command-line tool from `@deepkit/sql`.

The [migration integration of FrameworkModule](../framework/database.md#migration) automatically reads your Databases (you have to define them as provider), while with `deepkit-sql` you have to specify the TypeScript file that exports the database. THe latter is useful if you use Deepkit ORM standalone without Deepkit Framework.

## Creating a migration

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

A new migration file is created in `src/migrations`. 

The newly created migration file contains now the up and down methods based on the difference between the entities defined in your TypeScript app and the configured database. 
You can now modify the up method to your needs. The down method is automatically generated based on the up method.
You commit this file to your repository so that other developers can also execute it.

## Pending Migrations

```sh
./node_modules/.bin/deepkit-sql migration:pending --path database.ts --migrationDir src/migrations
```

This shows all pending migrations. If you have a new migration file that is not executed yet, it will be listed here.

## Executing Migrations

```sh
./node_modules/.bin/deepkit-sql migration:up --path database.ts --migrationDir src/migrations
```

This executes the next pending migration. 

## Reverting Migrations

```sh
./node_modules/.bin/deepkit-sql migration:down --path database.ts --migrationDir src/migrations
```

This reverts the last executed migration.

## Fake migrations

Let's say you wanted to execute a migration (up or down), but it failed. You fixed the issue manually, but now you can't execute the migration again, because it's already executed. You can use the `--fake` option to fake the migration, so that it's marked as executed in the database without actually executing it. This way you can execute the next pending migration.

```sh
./node_modules/.bin/deepkit-sql migration:up --path database.ts --migrationDir src/migrations --fake
```
