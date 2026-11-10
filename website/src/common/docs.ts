declare const labelBrand: unique symbol;

/**
 * A text of `docs` or `libraries` that `npm run translate` collects and translates.
 * The translate pipe accepts only these and the values of `texts` (see TranslatableText), so a text
 * that would never be translated fails to compile instead of staying English in every language.
 */
export type Label = string & { readonly [labelBrand]: true };

type DocCategorySource = {
    category: string | null;
    book?: boolean;
    pages: { path: string; title: string, book?: boolean }[];
}

export type DocCategory = {
    category: Label | null;
    book?: boolean;
    pages: { path: string; title: Label, book?: boolean }[];
}

export const texts = {
    banner1: 'Deepkit is a modular framework for TypeScript backend web applications.',
    banner2: 'Structured, scalable, and built for enterprise-grade architecture.',
    gettingStarted: 'Getting Started',
    buildWithTitle: 'What you can build with Deepkit',
    buildBackend: 'TypeScript backend framework',
    buildRpc: 'TypeScript RPC framework',
    buildCli: 'TypeScript CLI framework',
    buildDi: 'TypeScript dependency injection',
    buildOrm: 'TypeScript ORM',
    viewOnGitHub: 'View on GitHub',
    docs: 'Docs',
    blog: 'Blog',
    benchmarks: 'Benchmarks',
    chapters: 'Chapters',

    // start page
    startTitle: 'Deepkit: the high-performance TypeScript framework with runtime types',
    startDescription:
        'Deepkit is a high-performance TypeScript framework with runtime types: one TypeScript type for validation, serialization, database, HTTP, RPC and dependency injection. No schemas, no decorators for DI, no code generation.',
    heroTitle: 'High-Performance TypeScript, Driven by Your Types',
    heroText:
        'Deepkit compiles your TypeScript types into specialized code for validation, serialization, the database and RPC, so checking every boundary of your application costs next to nothing. One type covers HTTP, RPC, database, configuration and CLI, and when code gets a type subtly wrong, whether you or an agent wrote it, it fails with an exact error at the boundary instead of passing bad data through.',
    pillarOneTypeTitle: 'One type, the whole stack',
    pillarOneTypeText:
        'The type is the validator, the JSON format, the database schema and the API documentation. No Zod schema, class-validator DTO or Prisma model to keep in sync.',
    pillarStrictTitle: 'Strict at every boundary',
    pillarStrictText:
        'Every HTTP request, RPC call, database row, config value and CLI argument is checked against its type at runtime, with the exact path of what is wrong.',
    pillarJitTitle: 'JIT-compiled',
    pillarJitText:
        'Validators, serializers and database mappers are compiled into plain JavaScript functions for your types. Strict checking without paying for it.',
    pillarPlainTitle: 'Just TypeScript',
    pillarPlainText:
        'No schema DSL, no decorators for dependency injection, no code generation. The TypeScript you already write, and the language models write best.',
    agentsTitle: 'The safety net for agent-written TypeScript',
    agentsText:
        'Runtime types put Deepkit in a unique position for code written by agents. Every boundary of an application validates and serializes against the TypeScript types at runtime, so generated code is checked in the places where mistakes are expensive.',
    agentsBoundaryTitle: 'Mistakes fail loudly, where they happen',
    agentsBoundaryText:
        'A wrong field name or a string where a number belongs is rejected at the boundary with its exact path, not stored in the database and discovered weeks later.',
    agentsPlainTitle: 'Nothing new to get wrong',
    agentsPlainText:
        'There is no second schema language next to your types for a model to get subtly out of sync. If the TypeScript is right, validation, database and API are right.',
    agentsStackTitle: 'One stack, one set of conventions',
    agentsStackText:
        'HTTP, RPC, ORM, DI, configuration and CLI come from one framework instead of five libraries glued together, so generated code stays consistent across the whole application.',
    llmHint: 'Are you an LLM? Skip the pixels, we wrote markdown just for you:',
    oneTypeTitle: 'One type for the whole backend',
    oneTypeText:
        'The class User below is the validation rule, the JSON format, the database table and the API documentation at the same time. The HTTP body is validated and converted before your code runs, invalid input is answered with a 400 and the exact errors.',
    performanceTitle: 'Fast because it knows your types',
    performanceText:
        'Deepkit compiles validators, serializers and database mappers for your types at runtime into plain JavaScript functions. Time per operation, lower is better, measured against the most used libraries.',
    allBenchmarks: 'All benchmarks',
    chartValidation: 'Validation with error messages',
    chartMongoFindOne: 'MongoDB: find one document by id',
    chartPostgresFindOne: 'PostgreSQL: find one row by id',
    chartPostgresInsert: 'PostgreSQL: insert 1,000 rows',
    runtimeTypesTitle: 'Runtime types: validation and serialization without schemas',
    runtimeTypesText:
        'The type compiler makes the types of your TypeScript code available at runtime, including interfaces, generics, unions and mapped types like Omit. Validate, type guard, cast and serialize with the types you already have, instead of a Zod schema or class-validator decorators next to them.',
    httpTitle: 'HTTP router with typed parameters',
    httpText:
        'Route parameters, query strings and bodies are converted and validated from their TypeScript types, return values are serialized with theirs. Functional routes or controller classes, both with dependency injection.',
    diTitle: 'Dependency injection without decorators',
    diText:
        'Constructor parameters are resolved by their type, interfaces included. No @Injectable(), no injection tokens, no reflect-metadata. Modules, scopes and configuration are part of the same container, which is compiled to plain JavaScript.',
    ormTitle: 'TypeScript ORM for PostgreSQL, MySQL, SQLite and MongoDB',
    ormText:
        'Entities are classes or interfaces with type annotations. Tables, indexes and migrations follow from the types. Unit of work, identity map, relations and a type-safe query API that returns real class instances.',
    rpcTitle: 'Type-safe RPC between server and client',
    rpcText:
        'Call methods of server controllers like local functions, over WebSockets or TCP. Arguments and results are validated and serialized with their types, including classes, dates and RxJS Observables for streams.',
    appTitle: 'Command line, configuration and modules',
    appText:
        'Commands take their arguments and flags from the function signature. Configuration is a class, loaded from environment variables and validated at startup; services receive exactly the part of it they need.',
    learnMore: 'Learn more',
    librariesTitle: 'Libraries',
    librariesText: 'Every part of Deepkit is its own package. Use the whole framework or only the libraries you need.',
    startNowTitle: 'Get started',
    startNowText: 'Create a new Deepkit app with HTTP, database and CLI in one command.',
} as const;

/** Everything the translate pipe accepts: the values of `texts` and the labels of `docs` and `libraries`. */
export type TranslatableText = (typeof texts)[keyof typeof texts] | Label;

export const docs = [
    {
        category: null,
        pages: [
            { path: '', title: 'Overview' },
            { path: 'introduction', title: 'Introduction' },
            // { path: 'api-reference', book: false, title: 'API Reference' },
        ],
    },
    {
        category: 'App',
        pages: [
            { path: 'app', title: 'Getting started' },
            { path: 'app/arguments', title: 'Arguments & Flags' },
            { path: 'app/dependency-injection', title: 'Dependency Injection' },
            { path: 'app/modules', title: 'Modules' },
            { path: 'app/services', title: 'Services' },
            { path: 'app/events', title: 'Events' },
            { path: 'app/logger', title: 'Logger' },
            { path: 'app/configuration', title: 'Configuration' },
        ],
    },
    {
        category: 'Framework',
        pages: [
            { path: 'framework', title: 'Getting started' },
            { path: 'framework/database', title: 'Database' },
            { path: 'framework/testing', title: 'Testing' },
            { path: 'framework/deployment', title: 'Deployment' },
            { path: 'framework/public', title: 'Public Assets' },
        ],
    },
    {
        category: 'Runtime Types',
        pages: [
            { path: 'runtime-types', title: 'Introduction' },
            { path: 'runtime-types/getting-started', title: 'Getting started' },
            { path: 'runtime-types/types', title: 'Type Annotations' },
            { path: 'runtime-types/reflection', title: 'Reflection' },
            { path: 'runtime-types/serialization', title: 'Serialization' },
            { path: 'runtime-types/validation', title: 'Validation' },
            { path: 'runtime-types/extend', title: 'Extend' },
            { path: 'runtime-types/custom-serializer', title: 'Custom serializer' },
            { path: 'runtime-types/external-types', title: 'External Types' },
            { path: 'runtime-types/bytecode', title: 'Bytecode' },
        ],
    },
    {
        category: 'Dependency Injection',
        pages: [
            { path: 'dependency-injection', title: 'Introduction' },
            { path: 'dependency-injection/getting-started', title: 'Getting started' },
            { path: 'dependency-injection/providers', title: 'Providers' },
            { path: 'dependency-injection/injection', title: 'Injection' },
            { path: 'dependency-injection/configuration', title: 'Configuration' },
            { path: 'dependency-injection/scopes', title: 'Scopes' },
        ],
    },
    {
        category: 'Filesystem',
        pages: [
            { path: 'filesystem', title: 'Getting started' },
            { path: 'filesystem/app', title: 'App' },
            { path: 'filesystem/local', title: 'Local' },
            { path: 'filesystem/memory', title: 'Memory' },
            { path: 'filesystem/database', title: 'Database' },
            { path: 'filesystem/aws-s3', title: 'AWS S3' },
            { path: 'filesystem/ftp', title: 'FTP' },
            { path: 'filesystem/sftp', title: 'sFTP (SSH)' },
            { path: 'filesystem/google-storage', title: 'Google Storage' },
        ],
    },
    {
        category: 'Broker',
        pages: [
            { path: 'broker', title: 'Getting started' },
            { path: 'broker/cache', title: 'Cache' },
            { path: 'broker/message-bus', title: 'Message Bus' },
            { path: 'broker/message-queue', title: 'Message Queue' },
            { path: 'broker/atomic-locks', title: 'Atomic Locks' },
            { path: 'broker/key-value', title: 'Key Value' },
        ],
    },
    {
        category: 'HTTP',
        pages: [
            { path: 'http', title: 'Introduction' },
            { path: 'http/getting-started', title: 'Getting started' },
            { path: 'http/input-output', title: 'Input & Output' },
            { path: 'http/views', title: 'Views' },
            { path: 'http/dependency-injection', title: 'Dependency Injection' },
            { path: 'http/events', title: 'Events' },
            { path: 'http/middleware', title: 'Middleware' },
            { path: 'http/security', title: 'Security' },
        ],
    },
    {
        category: 'RPC',
        pages: [
            { path: 'rpc', title: 'Introduction' },
            { path: 'rpc/getting-started', title: 'Getting started' },
            { path: 'rpc/dependency-injection', title: 'Dependency Injection' },
            { path: 'rpc/security', title: 'Security' },
            { path: 'rpc/errors', title: 'Errors' },
            { path: 'rpc/tcp', title: 'TCP' },
            { path: 'rpc/websocket', title: 'WebSocket' },
            { path: 'rpc/http', title: 'HTTP' },
            { path: 'rpc/ipc', title: 'IPC' },
        ],
    },
    {
        category: 'Database ORM',
        pages: [
            { path: 'orm', title: 'Introduction' },
            { path: 'orm/getting-started', title: 'Getting started' },
            { path: 'orm/entity', title: 'Entity' },
            { path: 'orm/session', title: 'Session' },
            { path: 'orm/query', title: 'Query' },
            { path: 'orm/transactions', title: 'Transaction' },
            { path: 'orm/inheritance', title: 'Inheritance' },
            { path: 'orm/relations', title: 'Relations' },
            { path: 'orm/events', title: 'Events' },
            { path: 'orm/migrations', title: 'Migrations' },
            { path: 'orm/orm-browser', title: 'ORM Browser' },
            { path: 'orm/raw-access', title: 'Raw Access' },
            { path: 'orm/seeding', title: 'Seeding' },
            { path: 'orm/composite-primary-key', title: 'Composite primary key' },
            { path: 'orm/plugin-soft-delete', title: 'Soft-Delete' },
        ],
    },
    {
        category: 'Desktop UI',
        book: false,
        pages: [
            { path: 'desktop-ui/getting-started', title: 'Getting started' },
            { path: 'desktop-ui/app', title: 'App' },
            { path: 'desktop-ui/styles', title: 'Styles' },
            { path: 'desktop-ui/adaptive-container', title: 'Adaptive Container' },
            { path: 'desktop-ui/button', title: 'Button' },
            { path: 'desktop-ui/button-group', title: 'Button group' },
            { path: 'desktop-ui/dialog', title: 'Dialog' },
            { path: 'desktop-ui/drag', title: 'Drag' },
            { path: 'desktop-ui/dropdown', title: 'Dropdown' },
            { path: 'desktop-ui/icons', title: 'Icons' },
            { path: 'desktop-ui/input', title: 'Input' },
            { path: 'desktop-ui/menu', title: 'Menu' },
            { path: 'desktop-ui/slider', title: 'Slider' },
            { path: 'desktop-ui/radio', title: 'Radio' },
            { path: 'desktop-ui/select', title: 'Select' },
            { path: 'desktop-ui/checkbox', title: 'Checkbox' },
            { path: 'desktop-ui/list', title: 'List' },
            { path: 'desktop-ui/table', title: 'Table' },
            { path: 'desktop-ui/tabs', title: 'Tabs' },
            { path: 'desktop-ui/window', title: 'Window' },
            { path: 'desktop-ui/window-toolbar', title: 'Window Toolbar' },
        ],
    },
    {
        category: 'API',
        book: false,
        pages: [
            { path: 'package/angular-ssr', title: 'angular-ssr' },
            { path: 'package/api-console', title: 'api-console' },
            { path: 'package/app', title: 'app' },
            { path: 'package/bench', title: 'bench' },
            { path: 'package/broker', title: 'broker' },
            { path: 'package/broker-redis', title: 'broker-redis' },
            { path: 'package/bson', title: 'bson' },
            { path: 'package/bun', title: 'bun' },
            { path: 'package/core', title: 'core' },
            { path: 'package/core-rxjs', title: 'core-rxjs' },
            { path: 'package/devtool', title: 'devtool' },
            { path: 'package/event', title: 'event' },
            { path: 'package/filesystem', title: 'filesystem' },
            { path: 'package/filesystem-aws-s3', title: 'filesystem-aws-s3' },
            { path: 'package/filesystem-database', title: 'filesystem-database' },
            { path: 'package/filesystem-ftp', title: 'filesystem-ftp' },
            { path: 'package/filesystem-google', title: 'filesystem-google' },
            { path: 'package/filesystem-sftp', title: 'filesystem-sftp' },
            { path: 'package/framework', title: 'framework' },
            { path: 'package/http', title: 'http' },
            { path: 'package/injector', title: 'injector' },
            { path: 'package/logger', title: 'logger' },
            { path: 'package/mongo', title: 'mongo' },
            { path: 'package/mysql', title: 'mysql' },
            { path: 'package/orm', title: 'orm' },
            { path: 'package/orm-browser', title: 'orm-browser' },
            { path: 'package/postgres', title: 'postgres' },
            { path: 'package/rpc', title: 'rpc' },
            { path: 'package/rpc-tcp', title: 'rpc-tcp' },
            { path: 'package/run', title: 'run' },
            { path: 'package/sql', title: 'sql' },
            { path: 'package/sqlite', title: 'sqlite' },
            { path: 'package/stopwatch', title: 'stopwatch' },
            { path: 'package/template', title: 'template' },
            { path: 'package/topsort', title: 'topsort' },
            { path: 'package/type', title: 'type' },
            { path: 'package/type-compiler', title: 'type-compiler' },
            { path: 'package/vite', title: 'vite' },
            { path: 'package/workflow', title: 'workflow' },
        ],
    },
] satisfies DocCategorySource[] as DocCategory[];

/** The page titles of the API reference are package names, they are not translated. */
export function translatesPageTitles(category: DocCategory): boolean {
    return category.category !== 'API';
}

type LibraryCategorySource = {
    category: string;
    /** what the libraries of the category have in common and why that helps */
    description: string;
    items: {
        title: string;
        path: string;
        package: string;
        description: string;
        class?: string; // 'main' for main libraries, 'twice' for libraries
    }[]
}

export type LibraryCategory = {
    category: Label;
    description: Label;
    items: {
        title: Label;
        path: string;
        package: string;
        description: Label;
        class?: string;
    }[]
}

export const libraries = [
    {
        category: 'Composition',
        description:
            'Start with App for a CLI tool or a service and add the Framework for a complete server. Every library plugs in as a module with its own configuration and services, so a project grows from a single file to a modular application without changing its foundation.',
        items: [
            {
                title: 'App',
                path: 'documentation/app',
                package: '@deepkit/app',
                description: 'The foundation of an application: CLI commands, typed configuration from environment variables, dependency injection, events and modules.',
                class: 'main',
            },
            {
                title: 'Framework',
                path: 'documentation/framework',
                package: '@deepkit/framework',
                description: 'The complete server: HTTP and RPC in one process, workers, debugger and profiler, and a testing facade for integration tests.',
            },
            {
                title: 'HTTP',
                path: 'documentation/http',
                package: '@deepkit/http',
                description: 'Routes as functions or controllers. Parameters, query strings and bodies are validated and converted from their types, responses serialized.',
            },
            {
                title: 'Angular SSR',
                path: 'documentation/package/angular-ssr',
                package: '@deepkit/angular-ssr',
                description: 'Serve and server-side render your Angular app from your Deepkit application.',
            },
        ],
    },
    {
        category: 'Infrastructure',
        description:
            'Communication between your services and with your clients. Messages are binary encoded and validated with their types on both ends. The broker gives all instances of your app shared queues, caches and locks: in memory during development, on a broker server or Redis in production, without changing your code.',
        items: [
            {
                title: 'RPC',
                path: 'documentation/rpc',
                package: '@deepkit/rpc',
                description: 'Call server methods from the browser or other services like local functions: typed, validated and binary encoded, with streams via RxJS.',
                class: 'twice',
            },
            {
                title: 'RPC TCP',
                path: 'documentation/package/rpc-tcp',
                package: '@deepkit/rpc-tcp',
                description: 'TCP transport for RPC between backend services.',
            },
            {
                title: 'Broker',
                path: 'documentation/broker',
                package: '@deepkit/broker',
                description: 'Shared state for all instances of your app: message bus, queues, key-value store, cache and distributed locks, all typed.',
                class: 'twice',
            },
            {
                title: 'Broker Redis',
                path: 'documentation/package/broker-redis',
                package: '@deepkit/broker-redis',
                description: 'Runs the broker on Redis when you already operate one. Same API, only the adapter changes.',
            },
        ],
    },
    {
        category: 'Filesystem',
        description:
            'One API for files, wherever they are stored. Develop on the local disk, test in memory and run on S3 or Google Cloud Storage in production by switching only the adapter in your configuration. The code that reads and writes files stays the same.',
        items: [
            {
                title: 'Filesystem',
                path: 'documentation/filesystem',
                package: '@deepkit/filesystem',
                description: 'The common API to read, write, list and move files, with adapters for the local disk and memory included.',
                class: 'main',
            },
            {
                title: 'Filesystem FTP',
                path: 'documentation/filesystem/ftp',
                package: '@deepkit/filesystem-ftp',
                description: 'Files on FTP servers, behind the same API.',
            },
            {
                title: 'Filesystem SFTP',
                path: 'documentation/filesystem/sftp',
                package: '@deepkit/filesystem-sftp',
                description: 'Files on any server reachable via SSH, behind the same API.',
            },
            {
                title: 'Filesystem S3',
                path: 'documentation/filesystem/aws-s3',
                package: '@deepkit/filesystem-s3',
                description: 'Amazon S3 and S3-compatible storage like MinIO, behind the same API.',
            },
            {
                title: 'Filesystem Google',
                path: 'documentation/filesystem/google-storage',
                package: '@deepkit/filesystem-google',
                description: 'Google Cloud Storage, behind the same API.',
            },
            {
                title: 'Filesystem Database',
                path: 'documentation/filesystem/database',
                package: '@deepkit/filesystem-database',
                description: 'Files stored in your database via Deepkit ORM, no extra storage service needed.',
            },
        ],
    },
    {
        category: 'Database',
        description:
            'Your entities are TypeScript classes or interfaces. The same model and the same queries work with PostgreSQL, MySQL, SQLite and MongoDB, so you can test on SQLite, deploy on PostgreSQL, or change the database later without rewriting your data layer.',
        items: [
            {
                title: 'ORM/DBAL',
                path: 'documentation/orm',
                package: '@deepkit/orm',
                description: 'Data mapper ORM with unit of work, identity map, relations, migrations and a type-safe query API.',
                class: 'main',
            },
            {
                title: 'ORM MySQL',
                path: 'documentation/package/mysql',
                package: '@deepkit/mysql',
                description: 'Adapter for MySQL and MariaDB.',
            },
            {
                title: 'ORM Postgres',
                path: 'documentation/package/postgres',
                package: '@deepkit/postgres',
                description: 'Adapter for PostgreSQL.',
            },
            {
                title: 'ORM SQLite',
                path: 'documentation/package/sqlite',
                package: '@deepkit/sqlite',
                description: 'Adapter for SQLite, for development, tests and embedded apps.',
            },
            {
                title: 'ORM Mongo',
                path: 'documentation/package/mongo',
                package: '@deepkit/mongo',
                description: 'Adapter for MongoDB with its own driver and BSON compiled from your types, faster than the official driver.',
            },
        ],
    },
    {
        category: 'Fundamentals',
        description:
            'The building blocks Deepkit is made of. Each one works on its own in any TypeScript project, a backend, a frontend or a library, and they fit together when you use more of them.',
        items: [
            {
                title: 'Type',
                path: 'documentation/runtime-types',
                package: '@deepkit/type',
                description: 'TypeScript types at runtime: validation, serialization, type guards and reflection, without schemas.',
                class: 'twice',
            },
            {
                title: 'Event',
                path: 'documentation/app/events',
                package: '@deepkit/event',
                description: 'Typed events, synchronous and asynchronous, with listeners from the dependency injection container.',
            },
            {
                title: 'Dependency Injection',
                path: 'documentation/dependency-injection',
                package: '@deepkit/injector',
                description: 'Dependency injection by type, interfaces included, without decorators. Modules, scopes and configuration.',
                class: 'twice',
            },
            {
                title: 'Template',
                path: 'documentation/package/template',
                package: '@deepkit/template',
                description: 'JSX templates on the server with access to the dependency injection container.',
            },
            {
                title: 'Logger',
                path: 'documentation/app/logger',
                package: '@deepkit/logger',
                description: 'Logging with scopes, colors, and your own transports and formatters.',
                class: 'twice',
            },
            {
                title: 'Workflow',
                path: 'documentation/package/workflow',
                package: '@deepkit/workflow',
                description: 'State machines for processes like orders or payments: only allowed transitions happen, and each step can trigger events.',
            },
            {
                title: 'Stopwatch',
                path: 'documentation/package/stopwatch',
                package: '@deepkit/stopwatch',
                description: 'Measures where the time of a request goes, shown in the profiler of the debugger.',
            },
        ],
    },
    {
        category: 'Tools',
        description:
            'Tools that build on the types you already wrote: API documentation, database browser and debugger come from your code, not from separate definitions you have to keep up to date.',
        items: [
            {
                title: 'Devtool',
                path: 'documentation/package/devtool',
                package: '@deepkit/devtool',
                description: 'Chrome devtools extension to inspect the RPC traffic of your app.',
            },
            {
                title: 'Desktop UI',
                path: 'documentation/desktop-ui/getting-started',
                package: '@deepkit/desktop-ui',
                description: 'Angular component library for desktop-like applications.',
            },
            {
                title: 'ORM Browser',
                path: 'documentation/package/orm-browser',
                package: '@deepkit/orm-browser',
                description: 'Browse and edit the data of your entities, and see the schema and migrations, in the browser.',
            },
            {
                title: 'API console',
                path: 'documentation/package/api-console',
                package: '@deepkit/api-console',
                description: 'Interactive documentation of your HTTP and RPC API in the browser, generated from your types.',
            },
            {
                title: 'Bench',
                path: 'documentation/package/bench',
                package: '@deepkit/bench',
                description: 'Benchmark suites with statistics, the tool behind Deepkit\'s own benchmarks.',
            },
        ],
    },
    {
        category: 'Core',
        description:
            'Low-level libraries the others are built on, useful on their own when you need exactly that piece.',
        items: [
            {
                title: 'BSON',
                path: 'documentation/package/bson',
                package: '@deepkit/bson',
                description: 'BSON encoder and decoder compiled from your types, faster than the official bson package.',
            },
            {
                title: 'Core',
                path: 'documentation/package/core',
                package: '@deepkit/core',
                description: 'JavaScript utilities used by all packages, including the context for compiled functions.',
            },
            {
                title: 'Topsort',
                path: 'documentation/package/topsort',
                package: '@deepkit/topsort',
                description: 'Topological sorting, e.g. for dependencies between modules or entities.',
            },
        ],
    },
    {
        category: 'Runtime',
        description:
            'Runtime types need the type compiler in your build. It works with the TypeScript compiler, Vite and Bun, so you keep the toolchain you already use.',
        items: [
            {
                title: 'Vite',
                path: 'documentation/package/vite',
                package: '@deepkit/vite',
                description: 'Vite plugin for runtime types in frontend and backend builds.',
            },
            {
                title: 'Bun',
                path: 'documentation/package/bun',
                package: '@deepkit/bun',
                description: 'Bun plugin for runtime types.',
            },
            {
                title: 'Type Compiler',
                path: 'documentation/package/type-compiler',
                package: '@deepkit/type-compiler',
                description: 'TypeScript transformer that makes your types available at runtime.',
            },
        ],
    },
] satisfies LibraryCategorySource[] as LibraryCategory[];
