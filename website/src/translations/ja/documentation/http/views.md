# HTML ビュー

Deepkit HTTP には、組み込みの HTML ビューレンダリングシステムが付属しています。これは JSX をベースにしており、ビューを TypeScript で記述できます。独自の構文を持つテンプレートエンジンではなく、パッケージ `@deepkit/template` によって提供される本格的な TypeScript/JSX レンダラーです。

これはサーバーサイドレンダリング専用であり、React とは互換性がありません。コンポーネントは非同期にでき、依存性注入コンテナにアクセスできるため、自身のデータを読み込むことができます。

## セットアップ

`@deepkit/template` をインストールし、`tsconfig.json` で JSX を有効にします:

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

JSX を含むファイルには `.tsx` 拡張子が必要です。

## JSX

JSX は JavaScript の構文拡張であり、TypeScript で標準でサポートされています。これにより、TypeScript の中で HTML を記述できます。

ルートが JSX 要素を返すと、HTTP モジュールはそれを文字列にレンダリングし、コンテンツタイプ `text/html; charset=utf-8` で送信します。

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

## コンポーネント

### Function コンポーネント

Function コンポーネントは、第 1 引数として属性（`props`）を、第 2 引数としてレンダリングされた子要素を受け取ります。コンポーネントが子要素を受け付ける場合は、TypeScript が子要素の受け渡しを許可するように、props の型に `children?: any` を追加してください。

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

Function コンポーネントは `async` にできます。レンダラーはそれらの完了を待つため、コンポーネント内で直接データを読み込むことができます。

```tsx
async function Weather(props: { city: string }) {
    const data = await loadWeather(props.city);
    return <p>{props.city}: {data.temperature}°C</p>;
}
```

### 依存性注入

第 3 引数以降のすべての Parameter は、依存性注入コンテナから解決されます。これは、アプリまたはモジュールに登録されたすべてのプロバイダーで機能します。

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

コンポーネントは HTTP リクエストスコープからではなく、ルートインジェクターから解決されます。そのため、`HttpRequest` や `HttpResponse` のような `scope: 'http'` を持つプロバイダーはコンポーネントに注入できません。代わりに、必要な値をルート内で読み取り、props として渡してください。

```tsx
function Greeting(props: { name: string }) {
    return <p>Hello {props.name}</p>;
}

router.get('/hello', (name: HttpQuery<string>) => <Greeting name={name}/>);
```

### Class コンポーネント

Class コンポーネントは、`render` Method を持つ Class です。そのコンストラクターは最初の 2 つの引数として `props` と `children` を受け取り、それ以降のすべての引数は依存性注入コンテナから注入されます。`render` は `async` にできます。

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

## レイアウト

特別なレイアウトシステムはありません。レイアウトは、ページの枠組みの中に子要素をレンダリングする通常のコンポーネントです。doctype は JSX として記述できないため、`html()` を使用して出力します。

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

## エスケープ

動的な値は自動的にエスケープされます。テキストコンテンツでは `&`、`<`、`>` がそれぞれ `&amp;`、`&lt;`、`&gt;` に変換されるため、`<script>` のような値は実行されずにテキストとして表示されます。属性値ではさらに `"` と `'` もエスケープされるため、値がその属性から抜け出すことはできません。

```tsx
router.get('/search', (q: HttpQuery<string>) => {
    // q = '<script>alert(1)</script>' はテキストとしてレンダリングされます
    return <p>You searched for {q}</p>;
});
```

信頼できる HTML を出力するには、`html()` でラップします。`html()` にユーザー入力を渡してはいけません。エスケープが無効になり、クロスサイトスクリプティング（XSS）が可能になってしまうためです。

```tsx
import { html } from '@deepkit/template';

function Article(props: { contentHtml: string }) {
    // contentHtml は信頼できるソースから取得する必要があります（例: 独自の Markdown レンダラー）
    return <article>{html(props.contentHtml)}</article>;
}
```

エスケープによって、あらゆる属性においてすべての値が安全になるわけではありません。`<a href={url}>` 内の `javascript:alert(1)` のような URL は、クリックされると依然として実行されます。ユーザーからの URL は、`href` や `src` に入れる前に検証してください。たとえば、ルートの Parameter に `string & Pattern<...>` のような制限された Type を使用します。入力検証の詳細については、[セキュリティ](./security.md) を参照してください。

## 最適化

`@deepkit/template` は、CommonJS の `.js`/`.tsx` ファイルが読み込まれる際に、コンパイルされた JSX コードを最適化し、ツリーの静的な部分をプレーンな文字列に変換します。これは `@deepkit/template` 自体より後に読み込まれるファイルにのみ適用され、デバッグモードでは無効になります。コンポーネントはエントリーファイル内で定義するのではなく、それぞれ専用のファイルに移動してください:

```
.
├── app.ts
└── views
    ├── layout.tsx
    ├── user-detail.tsx
    └── user-list.tsx
```

テンプレートエンジンの詳細については、[テンプレート](../template.md) を参照してください。
