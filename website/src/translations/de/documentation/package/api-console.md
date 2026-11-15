# Deepkit API Console

```bash
npm install @deepkit/api-console-module
```

Automatische Dokumentation von HTTP- und RPC-APIs, die alle Routen, Actions, Parameter, Rückgabetypen und Statuscodes in TypeScript-Typsyntax anzeigt.

Sie ist Teil des [Framework Debuggers](../framework.md), kann aber auch eigenständig verwendet werden.

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

Standardmäßig zeigt `new ApiConsoleModule` alle HTTP- und RPC-Routen an. Mithilfe der Methoden der Klasse `ApiConsoleModule` kann auch festgelegt werden, welche Routen angezeigt werden sollen.

<app-images>
<app-image src="/assets/screenshots/api-console-http-get.png"></app-image>
<app-image src="/assets/screenshots/api-console-http-post.png"></app-image>
<app-image src="/assets/screenshots/api-console-overview.png"></app-image>
<app-image src="/assets/screenshots/api-console-overview-detail.png"></app-image>
<app-image src="/assets/screenshots/api-console-overview-detail-get.png"></app-image>
</app-images>

<api-docs package="@deepkit/api-console-module"></api-docs>
