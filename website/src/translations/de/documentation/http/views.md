# HTML Views

Deepkit HTTP bringt ein integriertes System zum Rendern von HTML Views mit. Es basiert auf JSX und ermöglicht es, Views in TypeScript zu schreiben. Es handelt sich nicht um eine Template-Engine mit eigener Syntax, sondern um einen vollwertigen TypeScript/JSX-Renderer, der durch das Paket `@deepkit/template` bereitgestellt wird.

Er ist ausschließlich für serverseitiges Rendering gedacht und nicht mit React kompatibel. Komponenten können asynchron sein und haben Zugriff auf den Dependency Injection Container, sodass sie ihre eigenen Daten laden können.

## Einrichtung

Installiere `@deepkit/template` und aktiviere JSX in deiner `tsconfig.json`:

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

Dateien, die JSX enthalten, benötigen die Endung `.tsx`.

## JSX

JSX ist eine Syntaxerweiterung für JavaScript und wird von TypeScript standardmäßig unterstützt. Damit kann HTML direkt in TypeScript geschrieben werden.

Wenn eine Route ein JSX-Element zurückgibt, rendert das HTTP-Modul es zu einem String und sendet es mit dem Content-Type `text/html; charset=utf-8`.

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

## Komponenten

### Function-Komponenten

Eine Function-Komponente erhält ihre Attribute als erstes Argument (`props`) und die gerenderten Children als zweites Argument. Wenn eine Komponente Children akzeptiert, füge `children?: any` zum Props-Type hinzu, damit TypeScript deren Übergabe erlaubt.

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

Function-Komponenten können `async` sein. Der Renderer wartet auf sie, sodass Daten direkt in der Komponente geladen werden können.

```tsx
async function Weather(props: { city: string }) {
    const data = await loadWeather(props.city);
    return <p>{props.city}: {data.temperature}°C</p>;
}
```

### Dependency Injection

Alle Parameter ab dem dritten werden aus dem Dependency Injection Container aufgelöst. Das funktioniert für jeden Provider, der in deiner App oder in Modulen registriert ist.

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

Komponenten werden aus dem Root-Injector aufgelöst, nicht aus dem Scope des HTTP-Requests. Provider mit `scope: 'http'` wie `HttpRequest` oder `HttpResponse` können daher nicht in Komponenten injiziert werden. Lies die benötigten Werte stattdessen in der Route aus und übergib sie als Props.

```tsx
function Greeting(props: { name: string }) {
    return <p>Hello {props.name}</p>;
}

router.get('/hello', (name: HttpQuery<string>) => <Greeting name={name}/>);
```

### Class-Komponenten

Eine Class-Komponente ist eine Class mit einer `render`-Methode. Ihr Konstruktor erhält `props` und `children` als die ersten beiden Argumente, alle weiteren Argumente werden aus dem Dependency Injection Container injiziert. `render` kann `async` sein.

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

Es gibt kein spezielles Layout-System. Ein Layout ist eine reguläre Komponente, die ihre Children innerhalb des Seitenrahmens rendert. Verwende `html()`, um den Doctype auszugeben, da dieser nicht als JSX geschrieben werden kann.

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

Dynamische Werte werden automatisch escaped. Im Textinhalt werden `&`, `<` und `>` in `&amp;`, `&lt;` und `&gt;` umgewandelt, sodass ein Wert wie `<script>` als Text angezeigt statt ausgeführt wird. In Attributwerten werden zusätzlich `"` und `'` escaped, sodass ein Wert nicht aus seinem Attribut ausbrechen kann.

```tsx
router.get('/search', (q: HttpQuery<string>) => {
    // q = '<script>alert(1)</script>' wird als Text gerendert
    return <p>You searched for {q}</p>;
});
```

Um HTML auszugeben, dem du vertraust, umschließe es mit `html()`. Übergib niemals Benutzereingaben an `html()`, da dies das Escaping deaktiviert und Cross-Site Scripting (XSS) ermöglicht.

```tsx
import { html } from '@deepkit/template';

function Article(props: { contentHtml: string }) {
    // contentHtml muss aus einer vertrauenswürdigen Quelle stammen, z. B. deinem eigenen Markdown-Renderer
    return <article>{html(props.contentHtml)}</article>;
}
```

Escaping macht nicht jeden Wert in jedem Attribut sicher: Eine URL wie `javascript:alert(1)` in `<a href={url}>` wird beim Anklicken trotzdem ausgeführt. Validiere URLs von Benutzern, bevor du sie in `href` oder `src` einsetzt, zum Beispiel mit einem eingeschränkten Type wie `string & Pattern<...>` am Routen-Parameter. Siehe [Sicherheit](./security.md) für mehr Informationen zur Eingabevalidierung.

## Optimierung

`@deepkit/template` optimiert den kompilierten JSX-Code von CommonJS-`.js`/`.tsx`-Dateien beim Laden und wandelt statische Teile des Baums in einfache Strings um. Dies gilt nur für Dateien, die nach `@deepkit/template` selbst geladen werden, und ist im Debug-Modus deaktiviert. Lagere deine Komponenten in eigene Dateien aus, anstatt sie in der Einstiegsdatei zu definieren:

```
.
├── app.ts
└── views
    ├── layout.tsx
    ├── user-detail.tsx
    └── user-list.tsx
```

Siehe [Template](../template.md) für weitere Informationen zur Template-Engine.
