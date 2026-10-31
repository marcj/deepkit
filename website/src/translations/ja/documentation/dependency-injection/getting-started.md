# はじめに

Deepkit における Dependency Injection はランタイムタイプに基づいているため、ランタイムタイプが正しくインストールされている必要があります。 [ランタイムタイプ](../runtime-types/getting-started.md) を参照してください。

これが成功していれば、`@deepkit/injector` をインストールするか、すでに内部でこのライブラリを使用している Deepkit フレームワークを使うことができます。

```sh
	npm install @deepkit/injector
```

ライブラリがインストールされると、その API を直接使用できます。


## 使い方

Dependency Injection を使用する方法は 3 つあります。

* Injector API（低レベル）
* Module API
* App API（Deepkit フレームワーク）

Deepkit フレームワークなしで `@deepkit/injector` を使用する場合は、最初の 2 つの方法を推奨します。

### Injector API

Injector API はすでに [Dependency Injection の紹介](../dependency-injection) で説明しました。これは、単一の DI コンテナを作成する単一のクラス `InjectorContext` によって非常にシンプルに使用でき、モジュールを持たないシンプルなアプリケーションに特に適しています。

```typescript
import { InjectorContext } from '@deepkit/injector';

const injector = InjectorContext.forProviders([
    UserRepository,
    HttpClient,
]);

const repository = injector.get(UserRepository);
```

この場合の `injector` オブジェクトは Dependency Injection コンテナです。`InjectorContext.forProviders` 関数はプロバイダーの配列を受け取ります。どの値を渡せるかについては、[Dependency Injection のプロバイダー](providers.md) の章を参照してください。

### Module API

より複雑な API は `InjectorModule` クラスで、プロバイダーを複数のモジュールに分けて保持し、モジュールごとにカプセル化された複数の DI コンテナを作成できます。さらに、モジュールごとに設定クラスを使用でき、プロバイダーに渡す設定値を自動検証したうえで提供しやすくなります。モジュールは相互にインポートでき、プロバイダーをエクスポートして、階層を構築し、きれいに分離されたアーキテクチャを実現できます。

アプリケーションがより複雑で、Deepkit フレームワークを使用しない場合は、この API を使用すべきです。

```typescript
import { InjectorModule, InjectorContext } from '@deepkit/injector';

const lowLevelModule = new InjectorModule([HttpClient])
     .addExport(HttpClient);

const rootModule = new InjectorModule([UserRepository])
     .addImport(lowLevelModule);

const injector = new InjectorContext(rootModule);
```

この場合の `injector` オブジェクトは Dependency Injection コンテナです。プロバイダーは複数のモジュールに分割でき、モジュールの import を使って別の場所から再度インポートできます。これにより、アプリケーションやアーキテクチャの階層を反映した自然な階層が構築されます。
InjectorContext には常に階層の最上位のモジュール（root モジュールまたは app モジュール）を渡すべきです。InjectorContext は仲介の役割のみを持ち、`injector.get()` への呼び出しは単に root モジュールへ転送されます。ただし、第二引数としてモジュールを渡すことで、非 root モジュールからプロバイダーを取得することも可能です。

```typescript
const repository = injector.get(UserRepository);

const httpClient = injector.get(HttpClient, lowLevelModule);
```

すべての非 root モジュールはデフォルトでカプセル化されており、そのモジュール内のすべてのプロバイダーはそのモジュール自身からのみ利用可能です。プロバイダーを他のモジュールから利用可能にするには、そのプロバイダーをエクスポートする必要があります。エクスポートにより、そのプロバイダーは階層の親モジュールへと移動し、その形で利用できるようになります。

すべてのプロバイダーをデフォルトで最上位（root モジュール）へエクスポートするには、`forRoot` オプションを使用できます。これにより、すべてのプロバイダーを他のすべてのモジュールから使用できるようになります。

```typescript
const lowLevelModule = new InjectorModule([HttpClient])
     .forRoot(); // すべてのプロバイダーを root にエクスポート
```

### App API

Deepkit フレームワークを使用する場合、モジュールは `@deepkit/app` API で定義します。これは Module API を基盤としており、その機能も利用できます。さらに、強力なフックを用いて処理したり、より動的なアーキテクチャを実現するための設定ローダーを定義したりできます。

[フレームワークのモジュール](../app/modules.md) の章で詳しく説明しています。

```typescript
import { App } from '@deepkit/app';
import { FrameworkModule } from '@deepkit/framework';
import { HttpRouterRegistry, HttpBody } from '@deepkit/http';

interface User {
    username: string;
}

class Service {
    users: User[] = [];
}

const app = new App({
    providers: [Service],
    imports: [new FrameworkModule()],
});

const router = app.get(HttpRouterRegistry);

router.post('/users', (body: HttpBody<User>, service: Service) => {
    service.users.push(body);
});

router.get('/users', (service: Service): Users => {
    return service.users;
});
```