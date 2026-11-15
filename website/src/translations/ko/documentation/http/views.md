# HTML 뷰

Deepkit HTTP에는 내장 HTML 뷰 렌더링 시스템이 포함되어 있습니다. 이 시스템은 JSX를 기반으로 하며 TypeScript로 뷰를 작성할 수 있게 해줍니다. 자체 문법을 가진 템플릿 엔진이 아니라, `@deepkit/template` 패키지가 제공하는 완전한 TypeScript/JSX 렌더러입니다.

서버 사이드 렌더링 전용이며 React와는 호환되지 않습니다. 컴포넌트는 비동기일 수 있고 의존성 주입 컨테이너에 접근할 수 있으므로, 필요한 데이터를 직접 로드할 수 있습니다.

## 설정

`@deepkit/template`을 설치하고 `tsconfig.json`에서 JSX를 활성화합니다:

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

JSX를 포함하는 파일은 `.tsx` 확장자를 사용해야 합니다.

## JSX

JSX는 JavaScript의 문법 확장으로, TypeScript에서 기본적으로 지원됩니다. 이를 통해 TypeScript 안에서 HTML을 작성할 수 있습니다.

라우트가 JSX 요소를 반환하면, HTTP 모듈은 이를 문자열로 렌더링하여 content type `text/html; charset=utf-8`로 전송합니다.

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

## 컴포넌트

### 함수 컴포넌트

함수 컴포넌트는 속성을 첫 번째 인자(`props`)로, 렌더링된 자식 요소를 두 번째 인자로 받습니다. 컴포넌트가 자식 요소를 받는 경우, TypeScript가 이를 전달할 수 있도록 props 타입에 `children?: any`를 추가하세요.

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

함수 컴포넌트는 `async`일 수 있습니다. 렌더러가 이를 기다려 주므로 컴포넌트 안에서 직접 데이터를 로드할 수 있습니다.

```tsx
async function Weather(props: { city: string }) {
    const data = await loadWeather(props.city);
    return <p>{props.city}: {data.temperature}°C</p>;
}
```

### 의존성 주입

세 번째 파라미터부터는 모두 의존성 주입 컨테이너에서 resolve됩니다. 이는 앱이나 모듈에 등록된 모든 provider에 대해 동작합니다.

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

컴포넌트는 HTTP 요청 스코프가 아니라 루트 injector에서 resolve됩니다. 따라서 `HttpRequest`나 `HttpResponse`처럼 `scope: 'http'`를 가진 provider는 컴포넌트에 주입할 수 없습니다. 대신 라우트에서 필요한 값을 읽어 props로 전달하세요.

```tsx
function Greeting(props: { name: string }) {
    return <p>Hello {props.name}</p>;
}

router.get('/hello', (name: HttpQuery<string>) => <Greeting name={name}/>);
```

### 클래스 컴포넌트

클래스 컴포넌트는 `render` 메서드를 가진 클래스입니다. 생성자는 처음 두 인자로 `props`와 `children`을 받으며, 그 이후의 모든 인자는 의존성 주입 컨테이너에서 주입됩니다. `render`는 `async`일 수 있습니다.

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

## 레이아웃

별도의 레이아웃 시스템은 없습니다. 레이아웃은 페이지 틀 안에 자식 요소를 렌더링하는 일반 컴포넌트입니다. doctype은 JSX로 작성할 수 없으므로 `html()`을 사용해 출력합니다.

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

## 이스케이프

동적 값은 자동으로 이스케이프됩니다. 텍스트 콘텐츠에서 `&`, `<`, `>`는 `&amp;`, `&lt;`, `&gt;`로 변환되므로, `<script>` 같은 값은 실행되지 않고 텍스트로 표시됩니다. 속성 값에서는 추가로 `"`와 `'`도 이스케이프되므로, 값이 속성 밖으로 벗어날 수 없습니다.

```tsx
router.get('/search', (q: HttpQuery<string>) => {
    // q = '<script>alert(1)</script>'는 텍스트로 렌더링됩니다
    return <p>You searched for {q}</p>;
});
```

신뢰할 수 있는 HTML을 출력하려면 `html()`로 감싸세요. 이스케이프가 비활성화되어 크로스 사이트 스크립팅(XSS)이 가능해지므로, 사용자 입력을 절대 `html()`에 전달하지 마세요.

```tsx
import { html } from '@deepkit/template';

function Article(props: { contentHtml: string }) {
    // contentHtml은 신뢰할 수 있는 출처에서 와야 합니다. 예: 직접 만든 Markdown 렌더러
    return <article>{html(props.contentHtml)}</article>;
}
```

이스케이프가 모든 속성에서 모든 값을 안전하게 만들어 주지는 않습니다. `<a href={url}>`에 들어간 `javascript:alert(1)` 같은 URL은 클릭 시 여전히 실행됩니다. 사용자로부터 받은 URL은 `href`나 `src`에 넣기 전에 검증하세요. 예를 들어 라우트 파라미터에 `string & Pattern<...>` 같은 제한된 타입을 사용할 수 있습니다. 입력 검증에 대한 자세한 내용은 [보안](./security.md)을 참고하세요.

## 최적화

`@deepkit/template`은 CommonJS `.js`/`.tsx` 파일이 로드될 때 컴파일된 JSX 코드를 최적화하여, 트리의 정적인 부분을 일반 문자열로 변환합니다. 이는 `@deepkit/template` 자체보다 나중에 로드되는 파일에만 적용되며, 디버그 모드에서는 비활성화됩니다. 컴포넌트를 엔트리 파일에 정의하지 말고 별도의 파일로 옮기세요:

```
.
├── app.ts
└── views
    ├── layout.tsx
    ├── user-detail.tsx
    └── user-list.tsx
```

템플릿 엔진에 대한 자세한 내용은 [템플릿](../template.md)을 참고하세요.
