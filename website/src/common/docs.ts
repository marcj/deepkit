export type DocCategory = {
    category: string | null;
    book?: boolean;
    pages: { path: string; title: string, book?: boolean }[];
}

export const texts = {
    banner1: 'Deepkit is a modular framework for TypeScript backend web applications.',
    banner2: 'Structured, scalable, and built for enterprise-grade architecture.',
    gettingStarted: 'Getting Started',
    viewOnGitHub: 'View on GitHub',
    docs: 'Docs',
    blog: 'Blog',
    benchmarks: 'Benchmarks',
    chapters: 'Chapters',
} as const;

export const docs: DocCategory[] = [
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
            { path: 'rpc/transport', title: 'Transport' },
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
];

export type LibraryCategory = {
    category: string;
    items: {
        title: string;
        path: string;
        package: string;
        description: string;
        class?: string; // 'main' for main libraries, 'twice' for libraries
    }[]
}

export const libraries: LibraryCategory[] = [
    {
        category: 'Composition',
        items: [
            {
                title: 'App',
                path: 'documentation/app',
                package: '@deepkit/app',
                description: 'Command line interface (CLI) parser, config loader, dependency injection container, event system, modules system.',
                class: 'main',
            },
            {
                title: 'Framework',
                path: 'documentation/framework',
                package: '@deepkit/framework',
                description: 'App module that provides application/HTTP/RPC server, worker, debugger, integration tests.',
            },
            {
                title: 'HTTP',
                path: 'documentation/http',
                package: '@deepkit/http',
                description: 'App module that provides HTTP server based on Node http module with validation and serialization.',
            },
            {
                title: 'Angular SSR',
                path: 'documentation/package/angular-ssr',
                package: '@deepkit/angular-ssr',
                description: 'App module to integrate Angular SSR.',
            },
        ],
    },
    {
        category: 'Infrastructure',
        items: [
            {
                title: 'RPC',
                path: 'documentation/rpc',
                package: '@deepkit/rpc',
                description: 'Remote procedure call (RPC) with binary encoding for WebSockets and TCP.',
                class: 'twice',
            },
            {
                title: 'RPC TCP',
                path: 'documentation/package/rpc-tcp',
                package: '@deepkit/rpc-tcp',
                description: 'TCP server and client for Deepkit RPC.',
            },
            {
                title: 'Broker',
                path: 'documentation/broker',
                package: '@deepkit/broker',
                description: 'Message broker with queues, pub/sub, key-value, 2 level cache, and distributed locks.',
                class: 'twice',
            },
            {
                title: 'Broker Redis',
                path: 'documentation/package/broker-redis',
                package: '@deepkit/broker-redis',
                description: 'Broker Redis adapter.',
            },
        ],
    },
    {
        category: 'Filesystem',
        items: [
            {
                title: 'Filesystem',
                path: 'documentation/filesystem',
                package: '@deepkit/filesystem',
                description: 'Unified API to work with local and remote filesystems.',
                class: 'main',
            },
            {
                title: 'Filesystem FTP',
                path: 'documentation/filesystem/ftp',
                package: '@deepkit/filesystem-ftp',
                description: 'Fileystem FTP adapter.',
            },
            {
                title: 'Filesystem SFTP',
                path: 'documentation/filesystem/sftp',
                package: '@deepkit/filesystem-sftp',
                description: 'Fileystem SFTP (SSH) adapter.',
            },
            {
                title: 'Filesystem S3',
                path: 'documentation/filesystem/aws-s3',
                package: '@deepkit/filesystem-s3',
                description: 'Fileystem S3 adapter.',
            },
            {
                title: 'Filesystem Google',
                path: 'documentation/filesystem/google-storage',
                package: '@deepkit/filesystem-google',
                description: 'Fileystem Google Storage adapter.',
            },
            {
                title: 'Filesystem Database',
                path: 'documentation/filesystem/database',
                package: '@deepkit/filesystem-database',
                description: 'Fileystem adapter for Deepkit ORM.',
            },
        ],
    },
    {
        category: 'Database',
        items: [
            {
                title: 'ORM/DBAL',
                path: 'documentation/orm',
                package: '@deepkit/orm',
                description: 'Object-relational Mapper (ORM) and data access library (DAL). MongoDB, SQLite, Postgres, MySQL.',
                class: 'main',
            },
            {
                title: 'ORM MySQL',
                path: 'documentation/package/mysql',
                package: '@deepkit/mysql',
                description: 'MySQL Adapter for Deepkit ORM.',
            },
            {
                title: 'ORM Postgres',
                path: 'documentation/package/postgres',
                package: '@deepkit/postgres',
                description: 'PostgreSQL Adapter for Deepkit ORM.',
            },
            {
                title: 'ORM SQLite',
                path: 'documentation/package/sqlite',
                package: '@deepkit/sqlite',
                description: 'SQLite Adapter for Deepkit ORM.',
            },
            {
                title: 'ORM Mongo',
                path: 'documentation/package/mongo',
                package: '@deepkit/mongodb',
                description: 'MongoDB Adapter for Deepkit ORM.',
            },
        ],
    },
    {
        category: 'Fundamentals',
        items: [
            {
                title: 'Type',
                path: 'documentation/runtime-types',
                package: '@deepkit/type',
                description: 'Runtime types with reflection, JSON serialization, validation, and type guards.',
                class: 'twice',
            },
            {
                title: 'Event',
                path: 'documentation/app/events',
                package: '@deepkit/event',
                description: 'Async and synchronous event dispatcher.',
            },
            {
                title: 'Dependency Injection',
                path: 'documentation/dependency-injection',
                package: '@deepkit/injector',
                description: 'Dependency injection (DI) container with modules, config, scopes, and nominal type alias/interface support.',
                class: 'twice',
            },
            {
                title: 'Template',
                path: 'documentation/package/template',
                package: '@deepkit/template',
                description: 'HTML template engine based on JSX.',
            },
            {
                title: 'Logger',
                path: 'documentation/app/logger',
                package: '@deepkit/logger',
                description: 'Logger with scopes, colors, and custom transporter and formatter.',
                class: 'twice',
            },
            {
                title: 'Workflow',
                path: 'documentation/package/workflow',
                package: '@deepkit/workflow',
                description: 'Workflow engine / finite state machine.',
            },
            {
                title: 'Stopwatch',
                path: 'documentation/package/stopwatch',
                package: '@deepkit/stopwatch',
                description: 'Profile and collect execution time of code.',
            },
        ],
    },
    {
        category: 'Tools',
        items: [
            {
                title: 'Devtool',
                path: 'documentation/package/devtool',
                package: '@deepkit/devtool',
                description: 'Chrome devtools for Deepkit (RPC).',
            },
            {
                title: 'Desktop UI',
                path: 'documentation/desktop-ui/getting-started',
                package: '@deepkit/desktop-ui',
                description: 'Angular Desktop UI library.',
            },
            {
                title: 'ORM Browser',
                path: 'documentation/package/orm-browser',
                package: '@deepkit/orm-browser',
                description: 'Web user interface to manage ORM data.',
            },
            {
                title: 'API console',
                path: 'documentation/package/api-console',
                package: '@deepkit/api-console',
                description: 'Web user interface to manage ORM data.',
            },
            {
                title: 'Bench',
                path: 'documentation/package/bench',
                package: '@deepkit/bench',
                description: 'Tools to run benchmarks and collect statistics.',
            },
        ],
    },
    {
        category: 'Core',
        items: [
            {
                title: 'BSON',
                path: 'documentation/package/bson',
                package: '@deepkit/bson',
                description: 'BSON encoder and decoder.',
            },
            {
                title: 'Core',
                path: 'documentation/package/core',
                package: '@deepkit/core',
                description: 'Core functions for working with JavaScript.',
            },
            {
                title: 'Topsort',
                path: 'documentation/package/topsort',
                package: '@deepkit/topsort',
                description: 'Topological sorting algorithm.',
            },
        ],
    },
    {
        category: 'Runtime',
        items: [
            {
                title: 'Vite',
                path: 'documentation/package/vite',
                package: '@deepkit/vite',
                description: 'Vite plugin to use Deepkit runtime types.',
            },
            {
                title: 'Bun',
                path: 'documentation/package/bun',
                package: '@deepkit/bun',
                description: 'Bun plugin to use Deepkit runtime types.',
            },
            {
                title: 'Type Compiler',
                path: 'documentation/package/type-compiler',
                package: '@deepkit/type-compiler',
                description: 'Type compiler as TypeScript plugin to make runtime types available.',
            },
        ],
    },
];
