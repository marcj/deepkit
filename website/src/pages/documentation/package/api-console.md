# Deepkit API Console

```bash
npm install @deepkit/api-console-module
```

Auto documentation of HTTP and RPC API showing all routes, actions, parameters, return types, status codes, in TypeScript type syntax.

It is part of [Framework Debugger](../framework.md) but can also be used standalone.

```typescript
import { ApiConsoleModule } from '@deepkit/api-console-module';

new App({
    imports: [
        new ApiConsoleModule({
            path: '/api',
            markdown: `
        # My API
        
        This is my API documentation.
        
        Have fun!
        `
        }),
    ]
})
```

Per default `new ApiConsoleModule` shows all HTTP and RPC routes. You can also specify which routes should be shown using the methods on the `ApiConsoleModule` class.

<app-images>
<app-image src="/assets/screenshots/api-console-http-get.png"></app-image>
<app-image src="/assets/screenshots/api-console-http-post.png"></app-image>
<app-image src="/assets/screenshots/api-console-overview.png"></app-image>
<app-image src="/assets/screenshots/api-console-overview-detail.png"></app-image>
<app-image src="/assets/screenshots/api-console-overview-detail-get.png"></app-image>
</app-images>

<api-docs package="@deepkit/api-console-module"></api-docs>
