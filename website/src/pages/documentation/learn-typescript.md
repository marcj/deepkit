# Learn TypeScript

## What is TypeScript?

TypeScript is a typed superset of JavaScript that compiles to plain JavaScript.

## Why TypeScript?

Every valid JavaScript program is also a valid TypeScript program. TypeScript adds a type system on top: you describe the shape of your data with interfaces, classes, unions and generics, and the compiler checks that your code uses it correctly. Many bugs, like a misspelled property, a missing `null` check or a wrong function argument, are reported in the editor instead of in production.

Types also serve as documentation that cannot go out of date, and they make editor features like autocompletion, go-to-definition and safe renames work across the whole codebase. This matters more the larger a project and its team grow.

```typescript
interface User {
    username: string;
    birthDate?: Date;
}

function greet(user: User): string {
    return 'Hello ' + user.username;
}

greet({ username: 'Peter' }); // ok
greet({ name: 'Peter' }); // compile error: 'name' does not exist in type 'User'
```

## How to use TypeScript?

TypeScript is installed as an npm package and configured with a `tsconfig.json` file in the project root.

```sh
npm install --save-dev typescript
npx tsc --init
```

The TypeScript compiler `tsc` checks your code and writes JavaScript files, which then run in Node.js or the browser. During development, tools like `ts-node` run TypeScript files directly, and bundlers like webpack, Vite or the Angular CLI compile TypeScript as part of their build.

```sh
npx tsc          # type check and compile to JavaScript
npx ts-node app.ts   # run a TypeScript file directly
```

## TypeScript in Deepkit

Normally TypeScript removes all types when it compiles to JavaScript, so they are gone at runtime. Deepkit adds a [type compiler](./runtime-types.md) that keeps the type information in the generated JavaScript. This is what lets Deepkit validate, serialize, inject dependencies and map database entities using plain TypeScript types, without decorators or schema libraries for each property.

Install the runtime type packages:

```sh
npm install --save @deepkit/type
npm install --save-dev @deepkit/type-compiler typescript ts-node
```

Then enable runtime types with `"reflection": true` in your `tsconfig.json`. `experimentalDecorators` is needed for the decorators of Deepkit libraries like HTTP, RPC and the ORM.

_File: tsconfig.json_

```json
{
  "compilerOptions": {
    "module": "CommonJS",
    "target": "es6",
    "moduleResolution": "node",
    "experimentalDecorators": true
  },
  "reflection": true
}
```

Now a type can be used at runtime:

```typescript
import { cast, MinLength } from '@deepkit/type';

interface User {
    username: string & MinLength<3>;
    birthDate?: Date;
}

const user = cast<User>({ username: 'Peter', birthDate: '2010-10-10T00:00:00Z' });
user.birthDate instanceof Date; // true
```

The type compiler installs itself into the local `typescript` package, so `tsc`, `ts-node`, Angular and other tools pick it up automatically. See [Runtime Types: Getting started](./runtime-types/getting-started.md) for details, webpack setup and the manual `deepkit-type-install` command, and [End to End Types](./articles/end-to-end-types.md) for how one type is used from the database to the frontend.

## Resources

- [TypeScript Handbook](https://www.typescriptlang.org/docs/handbook/intro.html)
- [TypeScript Deep Dive](https://basarat.gitbook.io/typescript/)
- [TypeScript Playground](https://www.typescriptlang.org/play)
