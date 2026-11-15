# Deepkit API Console

```bash
npm install @deepkit/api-console-module
```

HTTP API および RPC API の自動ドキュメントで、すべてのルート、アクション、パラメーター、戻り値の型、ステータスコードを TypeScript の型構文で表示します。

これは [Framework Debugger](../framework.md) の一部ですが、単体で使用することもできます。

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

デフォルトでは、`new ApiConsoleModule` はすべての HTTP ルートと RPC ルートを表示します。`ApiConsoleModule` クラスのメソッドを使用して、表示するルートを指定することもできます。

<app-images>
<app-image src="/assets/screenshots/api-console-http-get.png"></app-image>
<app-image src="/assets/screenshots/api-console-http-post.png"></app-image>
<app-image src="/assets/screenshots/api-console-overview.png"></app-image>
<app-image src="/assets/screenshots/api-console-overview-detail.png"></app-image>
<app-image src="/assets/screenshots/api-console-overview-detail-get.png"></app-image>
</app-images>

<api-docs package="@deepkit/api-console-module"></api-docs>
