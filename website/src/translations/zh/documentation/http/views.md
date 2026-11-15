# HTML 视图

Deepkit HTTP 内置了 HTML 视图渲染系统。它基于 JSX，允许你使用 TypeScript 编写视图。它不是一个拥有自己语法的模板引擎，而是由 `@deepkit/template` 包提供的功能完整的 TypeScript/JSX 渲染器。

它仅用于服务端渲染，与 React 不兼容。组件可以是异步的，并且可以访问依赖注入容器，因此它们可以自行加载数据。

## 设置

安装 `@deepkit/template` 并在 `tsconfig.json` 中启用 JSX：

```sh
npm install @deepkit/template
```

```json
{
  "compilerOptions": {
    "jsx": "react-jsx",
    "jsxImportSource": "@deepkit/template"
  }
}
```

包含 JSX 的文件需要使用 `.tsx` 扩展名。

## JSX

JSX 是 JavaScript 的语法扩展，TypeScript 开箱即用地支持它。它允许你在 TypeScript 中编写 HTML。

当路由返回一个 JSX 元素时，HTTP 模块会将其渲染为字符串，并以内容类型 `text/html; charset=utf-8` 发送。

```tsx app=app.ts
import { App } from '@deepkit/app';
import { FrameworkModule } from '@deepkit/framework';
import { http, HttpRouterRegistry } from '@deepkit/http';

export function View() {
    return <div>
        <h1>Hello World</h1>
        <p>My first JSX view</p>
    </div>;
}

class MyPage {
    @http.GET('/page')
    page() {
        return <View/>;
    }
}

const app = new App({
    controllers: [MyPage],
    imports: [new FrameworkModule()],
});
const router = app.get(HttpRouterRegistry);

router.get('/', () => <View/>);

app.run();
```

```sh
$ curl http://localhost:8080/
<div><h1>Hello World</h1><p>My first JSX view</p></div>
```

## 组件

### Function 组件

Function 组件将其属性作为第一个参数（`props`）接收，将渲染后的子元素作为第二个参数接收。如果组件接受子元素，请在 props 类型中添加 `children?: any`，以便 TypeScript 允许传入子元素。

```tsx
function Card(props: { title: string, children?: any }, children: any) {
    return <div class="card">
        <h2>{props.title}</h2>
        {children}
    </div>;
}

router.get('/', () => <Card title="Welcome">
    <p>Content of the card</p>
</Card>);
```

Function 组件可以是 `async` 的。渲染器会等待它们完成，因此你可以直接在组件中加载数据。

```tsx
async function Weather(props: { city: string }) {
    const data = await loadWeather(props.city);
    return <p>{props.city}: {data.temperature}°C</p>;
}
```

### 依赖注入

从第三个参数开始的所有 Parameter 都会从依赖注入容器中解析。这适用于在你的应用或模块中注册的所有 provider。

```tsx
class UserRepository {
    async findAll(): Promise<{ username: string }[]> {
        return [{ username: 'Peter' }];
    }
}

async function UserList(props: {}, children: any, users: UserRepository) {
    const list = await users.findAll();
    return <ul>
        {list.map(user => <li>{user.username}</li>)}
    </ul>;
}

const app = new App({
    providers: [UserRepository],
    imports: [new FrameworkModule()],
});

app.get(HttpRouterRegistry).get('/users', () => <UserList/>);
```

组件是从根注入器（root injector）解析的，而不是从 HTTP 请求作用域解析的。因此，像 `HttpRequest` 或 `HttpResponse` 这样带有 `scope: 'http'` 的 provider 无法注入到组件中。请在路由中读取所需的值，然后将其作为 props 传入。

```tsx
function Greeting(props: { name: string }) {
    return <p>Hello {props.name}</p>;
}

router.get('/hello', (name: HttpQuery<string>) => <Greeting name={name}/>);
```

### Class 组件

Class 组件是一个带有 `render` Method 的类。其构造函数将 `props` 和 `children` 作为前两个参数接收，所有后续参数都从依赖注入容器中注入。`render` 可以是 `async` 的。

```tsx
class UserList {
    constructor(
        protected props: { limit: number },
        protected children: any,
        protected users: UserRepository,
    ) {
    }

    async render() {
        const list = (await this.users.findAll()).slice(0, this.props.limit);
        return <ul>{list.map(user => <li>{user.username}</li>)}</ul>;
    }
}

router.get('/users', () => <UserList limit={10}/>);
```

## 布局

没有专门的布局系统。布局就是一个普通组件，它在页面框架内渲染其子元素。由于 doctype 无法用 JSX 编写，请使用 `html()` 来输出它。

```tsx
import { html } from '@deepkit/template';

function Layout(props: { title: string, children?: any }, children: any) {
    return <>
        {html('<!DOCTYPE html>')}
        <html lang="en">
        <head>
            <meta charset="utf-8"/>
            <title>{props.title}</title>
        </head>
        <body>
            <nav><a href="/">Home</a></nav>
            <main>{children}</main>
        </body>
        </html>
    </>;
}

router.get('/', () => <Layout title="Home">
    <h1>Welcome</h1>
</Layout>);
```

## 转义

动态值会被自动转义。在文本内容中，`&`、`<` 和 `>` 会被转换为 `&amp;`、`&lt;` 和 `&gt;`，因此像 `<script>` 这样的值会作为文本显示，而不会被执行。属性值还会额外转义 `"` 和 `'`，因此值无法跳出其所在的属性。

```tsx
router.get('/search', (q: HttpQuery<string>) => {
    // q = '<script>alert(1)</script>' 会被渲染为文本
    return <p>You searched for {q}</p>;
});
```

要输出你信任的 HTML，请用 `html()` 包裹它。切勿将用户输入传给 `html()`，因为这会禁用转义，从而导致跨站脚本攻击（XSS）。

```tsx
import { html } from '@deepkit/template';

function Article(props: { contentHtml: string }) {
    // contentHtml 必须来自可信来源，例如你自己的 Markdown 渲染器
    return <article>{html(props.contentHtml)}</article>;
}
```

转义并不能保证每个值在每个属性中都是安全的：在 `<a href={url}>` 中，像 `javascript:alert(1)` 这样的 URL 在点击时仍会被执行。在将用户提供的 URL 放入 `href` 或 `src` 之前，请先对其进行验证，例如在路由参数上使用 `string & Pattern<...>` 这样的受限类型。有关输入验证的更多信息，请参阅[安全](./security.md)。

## 优化

`@deepkit/template` 会在加载 CommonJS `.js`/`.tsx` 文件时优化其编译后的 JSX 代码，并将树中的静态部分转换为纯字符串。这仅适用于在 `@deepkit/template` 本身之后加载的文件，并且在调试模式下会被禁用。请将组件移到单独的文件中，而不要在入口文件中定义它们：

```
.
├── app.ts
└── views
    ├── layout.tsx
    ├── user-detail.tsx
    └── user-list.tsx
```

有关模板引擎的更多信息，请参阅[模板](../template.md)。
