# End to End Types

Having TypeScript used in all your services like frontend, backend, microservice, CLI, database, etc. is a huge benefit. It allows you to share code between all these services, and it allows you to use the full power of TypeScript to make your code more robust and maintainable.

End to End Types means that you use TypeScript types as source of truth for your data structures, and you use the same TypeScript types for validation, serialization, database, HTTP Routes, CLI, RPC, and more.

Most TypeScript stacks get the first half right: the frontend sees the types of the backend at compile time. The second half is harder, because TypeScript removes all types when it compiles to JavaScript. Everything that has to happen at runtime, like validating a request, converting a date string into a `Date`, or creating a database table, then needs a second description of the same data. Deepkit keeps TypeScript types at runtime with its [type compiler](../runtime-types.md), so the type itself is that runtime description.

## One type, all layers

The example is a small user registration. The `User` class is written once, in a file that both the server and the frontend import.

_File: shared/user.ts_

```typescript
import { AutoIncrement, Email, entity, MaxLength, MinLength, PrimaryKey, Unique } from '@deepkit/type';

@entity.name('user')
export class User {
    id: number & PrimaryKey & AutoIncrement = 0;
    created: Date = new Date;

    constructor(
        public username: string & Unique & MinLength<3> & MaxLength<20>,
        public email: Email & Unique,
    ) {}
}

export type NewUser = Pick<User, 'username' | 'email'>;
```

`PrimaryKey`, `AutoIncrement` and `Unique` are read by the ORM, `MinLength`, `MaxLength` and `Email` by the validator, and `Date` tells the serializer how to convert `created`. `NewUser` is derived with a regular TypeScript utility type and needs no declaration of its own.

### Database

The class is the [ORM entity](../orm/entity.md). Deepkit ORM creates the table with its primary key and unique indexes from it.

_File: server/database.ts_

```typescript
import { Database } from '@deepkit/orm';
import { SQLiteDatabaseAdapter } from '@deepkit/sqlite';
import { User } from '../shared/user';

export class AppDatabase extends Database {
    constructor() {
        super(new SQLiteDatabaseAdapter('/tmp/app.sqlite'), [User]);
    }
}
```

### RPC and HTTP

The [RPC controller](../rpc.md) uses the same types as parameter and return type. Before `create` runs, the arguments are deserialized and validated against `NewUser`. The result is serialized from `User`.

_File: server/app.ts_

```typescript
import { App } from '@deepkit/app';
import { FrameworkModule } from '@deepkit/framework';
import { http, HttpBody } from '@deepkit/http';
import { rpc } from '@deepkit/rpc';
import { NewUser, User } from '../shared/user';
import { AppDatabase } from './database';

@rpc.controller('/user')
export class UserController {
    constructor(private database: AppDatabase) {}

    @rpc.action()
    async create(data: NewUser): Promise<User> {
        const user = new User(data.username, data.email);
        await this.database.persist(user);
        return user;
    }

    @rpc.action()
    async list(): Promise<User[]> {
        return await this.database.query(User).find();
    }
}

class UserHttpController {
    constructor(private database: AppDatabase) {}

    @http.POST('/api/users')
    async create(body: HttpBody<NewUser>): Promise<User> {
        const user = new User(body.username, body.email);
        await this.database.persist(user);
        return user;
    }
}

new App({
    controllers: [UserController, UserHttpController],
    providers: [AppDatabase],
    imports: [new FrameworkModule({ migrateOnStartup: true })],
}).run();
```

The [HTTP](../http.md) route shows that a public REST endpoint works with the same type: `HttpBody<NewUser>` validates the JSON body, and a request with `"username": "ab"` is answered with `400 Bad Request` before the method runs.

### Frontend

The frontend imports the controller only as a type, so no server code ends up in the bundle. A Deepkit app serves RPC over WebSocket on the port of its HTTP server.

_File: frontend/users.ts_

```typescript
import { RpcWebSocketClient } from '@deepkit/rpc';
import { validate } from '@deepkit/type';
import type { UserController } from '../server/app';
import { NewUser, User } from '../shared/user';

const client = new RpcWebSocketClient('ws://localhost:8080');
const users = client.controller<UserController>('/user');

export async function register(form: NewUser): Promise<User | undefined> {
    // same constraints as on the server, e.g. to show errors in the form
    const errors = validate<NewUser>(form);
    if (errors.length) {
        console.log(errors); // [{path: 'username', code: 'minLength', ...}]
        return;
    }

    const user = await users.create(form);
    user instanceof User; // true, thanks to @entity.name
    user.created instanceof Date; // true
    return user;
}
```

`users.create` is fully typed: a wrong argument is a compile error, and the result has the type `User`. At runtime the server validates the arguments again, because data from a client can never be trusted. Using `validate<NewUser>` in the browser requires that the frontend build runs the Deepkit type compiler as well, see [Runtime Types](../runtime-types/getting-started.md).

If `User` gets a new field, for example `displayName: string & MaxLength<50> = ''`, this one change updates the database schema (through a [migration](../orm/migrations.md)), the validation of the RPC and HTTP endpoints, the serialization, and the types and validation in the frontend.

## Compared with tRPC

[tRPC](https://trpc.io) is a popular way to get type safety between a TypeScript server and client, and it does that well: the client infers the input and output types of every procedure directly from the server router, without code generation. Its focus is the API layer, though. Runtime validation and the database are described with other tools, typically [Zod](https://zod.dev) for the input and [Prisma](https://www.prisma.io) or [Drizzle](https://orm.drizzle.team) for the database.

The same registration in a typical tRPC and Prisma setup looks like this:

```prisma
// schema.prisma
model User {
  id       Int      @id @default(autoincrement())
  created  DateTime @default(now())
  username String   @unique
  email    String   @unique
}
```

```typescript
// server.ts
import { initTRPC } from '@trpc/server';
import { z } from 'zod';
import { PrismaClient } from '@prisma/client';

const t = initTRPC.create();
const prisma = new PrismaClient();

const newUser = z.object({
    username: z.string().min(3).max(20),
    email: z.string().email(),
});

export const appRouter = t.router({
    createUser: t.procedure
        .input(newUser)
        .mutation(({ input }) => prisma.user.create({ data: input })),
});

export type AppRouter = typeof appRouter;
```

The client is typed from `AppRouter`, so the compile-time side is end to end. The user, however, is described twice: once in the Prisma schema (a language of its own, from which TypeScript types are generated) and once as a Zod schema. The rule "username has 3 to 20 characters" lives only in the Zod schema, "username is unique" only in the Prisma schema, and keeping both in sync is up to the developer. Libraries like `drizzle-zod` or Prisma generators can derive one schema from the other, which reduces the duplication but adds another tool. tRPC also sends JSON by default, so a `Date` arrives as a string unless a data transformer such as superjson is configured.

```
tRPC + Zod + Prisma

  schema.prisma ──generate──► Prisma types ──► database
                                   ┆
                        kept in sync by hand
                          or by a generator
                                   ┆
  Zod schema ──z.infer──► input type ──► runtime validation (server)
                              │
                              └─ typeof appRouter ──► client types (compile time only)


Deepkit

                       ┌──► database schema, migrations     (ORM)
                       ├──► validation of RPC/HTTP input    (server)
  TypeScript type ─────┼──► serialization (BSON, JSON)      (server + client)
  (User, NewUser)      ├──► client types                    (compile time)
                       └──► validation in the browser       (client)
```

|                                | Deepkit                                | tRPC                                      |
| ------------------------------ | -------------------------------------- | ----------------------------------------- |
| Client types from the server   | Yes, `client.controller<Controller>()` | Yes, inferred from the router type        |
| Runtime input validation       | From the TypeScript type               | From a schema library such as Zod         |
| Database schema                | From the same TypeScript type          | Separate tool, such as Prisma or Drizzle  |
| `Date`, `Map`, class instances | Restored on the client                 | With a data transformer such as superjson |
| Build requirement              | Deepkit type compiler                  | None beyond TypeScript                    |

The trade-off is the build step: Deepkit needs its type compiler in every build that uses types at runtime, while tRPC, Zod and Prisma work with a plain TypeScript setup and have large ecosystems. In exchange, Deepkit lets one TypeScript type be the single source of truth from the database to the browser, without a second schema language.
