# HTML Views

Deepkit HTTP comes with a built-in HTML view rendering system. It's based on JSX and allows you to write your views in TypeScript. It's not a template engine with its own syntax, but a full-fledged TypeScript/JSX renderer provided by the package `@deepkit/template`.

It's meant for server-side rendering only and is not compatible with React. Components can be asynchronous and have access to the dependency injection container, so they can load their own data.

## Setup

Install `@deepkit/template` and enable JSX in your `tsconfig.json`:

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

Files that contain JSX need the `.tsx` extension.

## JSX

JSX is a syntax extension to JavaScript and comes with TypeScript support out of the box. It allows you to write HTML in TypeScript.

When a route returns a JSX element, the HTTP module renders it to a string and sends it with the content type `text/html; charset=utf-8`.

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

## Components

### Function Components

A function component receives its attributes as the first argument (`props`) and the rendered children as the second argument. If a component accepts children, add `children?: any` to the props type so that TypeScript allows passing them.

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

Function components can be `async`. The renderer waits for them, so you can load data directly in the component.

```tsx
async function Weather(props: { city: string }) {
    const data = await loadWeather(props.city);
    return <p>{props.city}: {data.temperature}°C</p>;
}
```

### Dependency Injection

All parameters starting with the third one are resolved from the dependency injection container. This works for every provider registered in your app or modules.

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

Components are resolved from the root injector, not from the HTTP request scope. Providers with `scope: 'http'` like `HttpRequest` or `HttpResponse` can therefore not be injected into components. Read the values you need in the route and pass them as props instead.

```tsx
function Greeting(props: { name: string }) {
    return <p>Hello {props.name}</p>;
}

router.get('/hello', (name: HttpQuery<string>) => <Greeting name={name}/>);
```

### Class Components

A class component is a class with a `render` method. Its constructor receives `props` and `children` as the first two arguments, all further arguments are injected from the dependency injection container. `render` can be `async`.

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

## Layouts

There is no special layout system. A layout is a regular component that renders its children inside the page frame. Use `html()` to output the doctype, since it can't be written as JSX.

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

## Escaping

Dynamic values are escaped automatically. In text content `&`, `<` and `>` are converted to `&amp;`, `&lt;` and `&gt;`, so a value like `<script>` is shown as text instead of being executed. Attribute values additionally escape `"` and `'`, so a value cannot break out of its attribute.

```tsx
router.get('/search', (q: HttpQuery<string>) => {
    // q = '<script>alert(1)</script>' is rendered as text
    return <p>You searched for {q}</p>;
});
```

To output HTML that you trust, wrap it with `html()`. Never pass user input to `html()`, since this disables the escaping and allows Cross-Site Scripting (XSS).

```tsx
import { html } from '@deepkit/template';

function Article(props: { contentHtml: string }) {
    // contentHtml must come from a trusted source, e.g. your own Markdown renderer
    return <article>{html(props.contentHtml)}</article>;
}
```

Escaping does not make every value safe in every attribute: a URL like `javascript:alert(1)` in `<a href={url}>` is still executed when clicked. Validate URLs from users before putting them into `href` or `src`, for example with a restricted type like `string & Pattern<...>` on the route parameter. See [Security](./security.md) for more about input validation.

## Optimization

`@deepkit/template` optimizes the compiled JSX code of CommonJS `.js`/`.tsx` files when they are loaded and turns static parts of the tree into plain strings. This only applies to files that are loaded after `@deepkit/template` itself, and is disabled in debug mode. Move your components into their own files instead of defining them in the entry file:

```
.
├── app.ts
└── views
    ├── layout.tsx
    ├── user-detail.tsx
    └── user-list.tsx
```

See [Template](../template.md) for more information about the template engine.
