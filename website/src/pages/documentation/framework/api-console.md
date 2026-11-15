# Deepkit API Console

Deepkit API Console is a module you can import into your application to provide an interactive
web-based API explorer for your HTTP and RPC routes.

It reads the runtime types of your controllers and shows:

- all [HTTP routes](../http.md) with their HTTP method, path, parameters, body, response types, and status codes,
- all [RPC actions](../rpc.md) with their parameters and return types,
- the used types in TypeScript type syntax.

HTTP routes can be executed directly in the browser via the "Open console" button.

## Installation

```bash
npm install @deepkit/api-console-module
```

```typescript
import { App } from '@deepkit/app';
import { FrameworkModule } from '@deepkit/framework';
import { ApiConsoleModule } from '@deepkit/api-console-module';

new App({
    controllers: [UserController],
    imports: [
        new FrameworkModule(),
        new ApiConsoleModule({
            path: '/api',
            markdown: `
        # My API
        
        This is my API documentation.
        
        Have fun!
        `
        }),
    ]
}).run();
```

After starting the server with `server:start`, the API Console is available at `http://localhost:8080/api`.

## Configuration

| Option         | Default  | Description                                                                                                                         |
|----------------|----------|-------------------------------------------------------------------------------------------------------------------------------------|
| `path`         | `'/api'` | URL path under which the API Console is served.                                                                                     |
| `markdown`     |          | Markdown content shown on the overview page.                                                                                        |
| `markdownFile` |          | Path to a markdown file shown on the overview page. Takes precedence over `markdown`.                                               |
| `listen`       | `true`   | If `false`, the web interface is not served and only the RPC controller that delivers the API data is registered.                   |

## Filter HTTP Routes

By default, all HTTP routes are shown (except the static files of the API Console itself). Use `filter()` to limit which HTTP routes appear. The callback receives an `HttpRouteFilter` from `@deepkit/http`.

```typescript
import { ApiConsoleModule } from '@deepkit/api-console-module';

new App({
    controllers: [UserController, AdminController],
    imports: [
        new FrameworkModule(),
        new ApiConsoleModule({ path: '/api' }).filter(filter => {
            filter.excludeControllers(AdminController);
        }),
    ]
}).run();
```

Besides `excludeControllers`, `HttpRouteFilter` provides `forControllers`, `forRoutes` and `excludeRoutes` (matching by `path`, `pathRegExp`, `httpMethod`, `category`, or `group`), `forRouteNames`, `excludeRouteNames`, `forModules`, `excludeModules`, `forModuleClasses`, and `excludeModuleClasses`.

The filter applies to HTTP routes only. RPC actions are always listed.

## Framework Debugger

When `FrameworkModule` is configured with `debug: true`, it registers the API Console data controller internally (with `listen: false`) for the Framework Debugger. Import `ApiConsoleModule` yourself when you want to serve the API documentation under its own URL.
