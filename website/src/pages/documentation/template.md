# Template

The template engine allows to write typesafe, fast and secure HTML templates. It is based on JSX and is ready to use as soon as you use the `.tsx` file extension and adjust the `tsconfig.json` accordingly.

The important thing is: it is not compatible with React. As soon as React is to be used, `@deepkit/template` is incompatible. Deepkit's template engine is only intended for SSR (server-side rendering).

## Installation

In your tsconfig you have to adjust following settings: `jsx` and `jsxImportSource`

```json
{
  "compilerOptions": {
    "experimentalDecorators": true,
    "emitDecoratorMetadata": true,
    "target": "es2020",
    "moduleResolution": "node",

    "jsx": "react-jsx",
    "jsxImportSource": "@deepkit/template"
  }
}
```

Now you can use JSX directly in your controller.

```typescript
import { App } from '@deepkit/app';
import { FrameworkModule } from '@deepkit/framework';
import { http } from '@deepkit/http';

@http.controller('my-base-url/')
class MyPage {
    @http.GET('hello-world')
    helloWorld() {
        return <div style="color: red">Hello World</div>;
    }
}

new App({
    controllers: [MyPage],
    imports: [
        new FrameworkModule({
            debug: true,
        })
    ]
}).run();
```

When you return such a JSX in your route method, the HTTP content type is automatically set to `texthtml; charset=utf-8`.

## Components

You can structure your templates the way you are used to in React. Either modularize your layout into multiple function or class components.

### Function Components

The easiest way is to use a function that returns JSX.

```typescript
async function Website(props: {title: string, children?: any}) {
    return <html>
        <head>
            <title>{props.title}</title>
        </head>
        <body>
            {props.children}
        </body>
    </html>;
}

class MyPage {
    @http.GET('hello-world')
    helloWorld() {
        return <Website title="Hello world">
            <h1>Great page</h1>
        </Website>;
    }
}
```

```sh
$ curl http://localhost:8080/hello-world
<html><head><title>Hello world</title></head><body><h1>Great page</h1></body></html>
```

Function components can be asynchronous (unlike in React). This is an important difference from other template engines you may be familiar with, like React.

All functions have access to the dependency injection container and can reference any dependencies starting with the third parameter.

```typescript
class Database {
    users: any[] = [{ username: 'Peter' }];
}

function UserList(props: {}, children: any, database: Database) {
    return <div>{database.users.length}</div>;
}

class MyPage {
    @http.GET('list')
    list() {
        return <UserList/>
    }
}

new App({
    controllers: [MyPage],
    providers: [Database],
    imports: [new FrameworkModule()]
}).run();
```


### Class Components

An alternative way to write a component is a class component. They are handled and instantiated in the Dependency Injection container and thus have access to all services registered in the container. This makes it possible to directly access a data source such as a database in your components, for example.

```typescript
class UserList {
    constructor(
        protected props: {},
        protected children: any,
        protected database: SQLiteDatabase) {
    }

    async render() {
        const users = await this.database.query(User).find();

        return <div class="users">
            {users.map((user) => <UserDetail user={user}/>)}
        </div>;
    }
}

class MyPage {
    @http.GET('')
    listUsers() {
        return <UserList/>;
    }
}
```

For class components the first constructor arguments are reserved. `props` can be defined arbitrarily, `children` is always "any", and then optional dependencies follow, which you can choose arbitrarily. Since class components are instantiated in the Dependency Injection container, you have access to all your services.

## Dynamic HTML

The template engine has automatically cleaned up all the variables used, so you can safely use user input directly in the template. To render dynamic HTML, you can use the html function.

```typescript
import { html } from '@deepkit/template';
function helloWorld() {
    const yes = "<b>yes!</b>";
    return <div style="color: red">Hello World. {html(yes)}</div>;
}
```

## Optimization

The template engine tries to optimize the generated JSX code so that it is much easier for NodeJSV8 to generate the HTML string. For this to work correctly, you should move all your components from the main app.tsx file to separate files. A structure might look like this:

```
.
├── app.ts
└── views
    ├── user-detail.tsx
    ├── user-list.tsx
    └── website.tsx
```
