# Debugging

Deepkit ORM provides several tools to see what happens in the database layer: debug logging of all executed SQL statements, error events, query explain (MongoDB), and the profiler of the Framework Debugger.

## Logging SQL Queries

The SQL adapters (`@deepkit/postgres`, `@deepkit/mysql`, `@deepkit/sqlite`) log every executed SQL statement together with its parameters on the `debug` level of the database logger. Each adapter uses its own logger scope:

| Adapter    | Logger scope           |
|------------|------------------------|
| PostgreSQL | `deepkit:orm:postgres` |
| MySQL      | `deepkit:orm:mysql`    |
| SQLite     | `deepkit:orm:sqlite`   |
| Memory     | `deepkit:orm:memory`   |

Without a configured logger, a standalone `Database` logs nothing. Set a logger with `database.setLogger()` and enable the `debug` level for the adapter scope:

```typescript
import { ConsoleLogger, LoggerLevel } from '@deepkit/logger';
import { Database } from '@deepkit/orm';
import { SQLiteDatabaseAdapter } from '@deepkit/sqlite';

const database = new Database(new SQLiteDatabaseAdapter(':memory:'), [User]);

const logger = new ConsoleLogger();
logger.setScopeLevel('deepkit:orm:sqlite', LoggerLevel.debug);
database.setLogger(logger);

await database.query(User).filter({ username: 'peter' }).has();
```

```
2026-11-15T23:12:52.347Z [DEBUG] (deepkit:orm:sqlite) SELECT COUNT(*) as count FROM "user" WHERE "user"."username" = ? [ 'peter' ]
```

`setScopeLevel` enables debug output only for the database scope. To see debug output of all scopes, set `logger.level = LoggerLevel.debug` instead.

### In a Deepkit Application

When a database class is registered as a provider in an application with `FrameworkModule`, the application `Logger` is set on the database automatically. Enable the scope via a [setup call](../app/dependency-injection.md) on the `Logger`:

```typescript
import { App } from '@deepkit/app';
import { FrameworkModule } from '@deepkit/framework';
import { Logger, LoggerLevel } from '@deepkit/logger';

const app = new App({
    providers: [AppDatabase],
    imports: [new FrameworkModule()],
});

app.setup((module) => {
    module.configureProvider<Logger>(logger => {
        logger.setScopeLevel('deepkit:orm:postgres', LoggerLevel.debug);
    });
});

app.run();
```

See [Logger](../app/logger.md) for more information about log levels, transports, and formatters.

### MongoDB

The MongoDB adapter does not log the executed commands. It logs connection-related information (topology detection, new hosts, heartbeats) in the `mongo` scope on the `debug` level. Heartbeat problems are logged with higher levels.

## Errors

Failed statements are logged on the `debug` level together with the SQL and its parameters. Errors are converted to ORM errors such as `UniqueConstraintFailure` from `@deepkit/orm`.

To react to every database error in one place, listen to the `onDatabaseError` event. The event contains the error and, if available, the entity schema and the query that caused it.

```typescript
import { onDatabaseError } from '@deepkit/orm';

database.listen(onDatabaseError, (event) => {
    console.log('Database error', event.error, event.classSchema?.getClassName());
});
```

For failed inserts and updates of a session commit, the event is a `DatabaseErrorInsertEvent` (with `inserts`) or `DatabaseErrorUpdateEvent` (with `changeSets`). See [Events](events.md) for more information about ORM events.

## Query Explain

Queries have an `explain(op)` method that returns the query plan of the database for an operation (`'find'`, `'findOne'`, `'count'`, `'delete'`, `'patch'`), and `logExplain()` which logs the plan of the next operation to the database logger.

```typescript
const plan = await database.query(User).filter({ username: 'peter' }).explain('find');

// logs the plan and executes the query
const users = await database.query(User).filter({ username: 'peter' }).logExplain().find();
```

Currently, only the MongoDB adapter implements explain. Other adapters throw an error.

## Profiler

All database operations are recorded in the `Stopwatch` of `@deepkit/stopwatch` when `database.stopwatch` is set. Each query operation (`Find:User`, `Count:User`, ...) is a frame of the `database` category. SQL adapters additionally record each executed statement as a `Query` frame (category `databaseQuery`) including the SQL and its parameters, as well as frames for SQL building and connection acquisition.

In a Deepkit application with `FrameworkModule`, the stopwatch is assigned to all registered databases automatically. It is enabled with the `debug` or `profile` option:

```typescript
new App({
    providers: [AppDatabase],
    imports: [new FrameworkModule({ debug: true })],
}).run();
```

With `debug: true`, open the Framework Debugger at `http://localhost:8080/_debug/profiler` to see the recorded frames of each HTTP request, RPC action, or CLI command, including the time spent in the database and the executed SQL. `profile: true` records the frames without enabling the debugger.

The debugger also contains the [ORM Browser](orm-browser.md) to inspect and edit the data of all registered databases.
