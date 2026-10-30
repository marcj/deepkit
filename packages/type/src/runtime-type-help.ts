/*
 * Deepkit Framework
 * Copyright (c) Deepkit UG, Marc J. Schmidt
 *
 * This program is free software: you can redistribute it and/or modify
 * it under the terms of the MIT License.
 *
 * You should have received a copy of the MIT License along with this program.
 */

/**
 * Appended to errors caused by missing runtime type information.
 * @internal
 */
export const runtimeTypeHelp = `

Runtime types are generated at build time by @deepkit/type-compiler. Make sure that:
  - "reflection": true is set in your tsconfig.json.
  - Your build tool runs the type compiler: execute \`npx deepkit-type-install\` (again after each TypeScript update)
    or register the transformer in your bundler/loader. Tools that strip types without TypeScript (esbuild, swc, tsx, ...)
    generate no runtime types.
  - Generic wrapper functions declare a \`type?: ReceiveType<T>\` parameter and pass it on to the Deepkit function.
  - Circular imports don't make the type undefined at the time it is used.
See https://deepkit.io/documentation/runtime-types/getting-started`;
