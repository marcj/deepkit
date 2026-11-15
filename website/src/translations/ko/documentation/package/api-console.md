# Deepkit API Console

```bash
npm install @deepkit/api-console-module
```

모든 라우트, 액션, 파라미터, 반환 타입, 상태 코드를 TypeScript 타입 문법으로 보여주는 HTTP 및 RPC API 자동 문서화 도구입니다.

[Framework Debugger](../framework.md)의 일부이지만 단독으로도 사용할 수 있습니다.

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

기본적으로 `new ApiConsoleModule`은 모든 HTTP 및 RPC 라우트를 표시합니다. `ApiConsoleModule` 클래스의 메서드를 사용하여 표시할 라우트를 지정할 수도 있습니다.

<app-images>
<app-image src="/assets/screenshots/api-console-http-get.png"></app-image>
<app-image src="/assets/screenshots/api-console-http-post.png"></app-image>
<app-image src="/assets/screenshots/api-console-overview.png"></app-image>
<app-image src="/assets/screenshots/api-console-overview-detail.png"></app-image>
<app-image src="/assets/screenshots/api-console-overview-detail-get.png"></app-image>
</app-images>

<api-docs package="@deepkit/api-console-module"></api-docs>
