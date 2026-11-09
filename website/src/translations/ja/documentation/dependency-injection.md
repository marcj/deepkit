# TypeScript の Dependency Injection

Deepkit は TypeScript 向けの Dependency Injection コンテナで、サービスにデコレーターを付けなくても動作します。コンストラクターのパラメーターを interface も含めた TypeScript の型から解決するため、コードにコンテナ固有のアノテーションやトークンを持ち込まずに済みます。

```typescript
import { InjectorContext } from '@deepkit/injector';

interface Mailer {
    send(to: string, text: string): void;
}

class SmtpMailer implements Mailer {
    send(to: string, text: string): void {
        console.log(`Sending "${text}" to ${to}`);
    }
}

class Signup {
    constructor(private mailer: Mailer) {}

    register(email: string): void {
        this.mailer.send(email, 'Welcome');
    }
}

const injector = InjectorContext.forProviders([Signup, SmtpMailer]);
injector.get(Signup).register('peter@example.com');
// Sending "Welcome" to peter@example.com
```

`Signup` は `Mailer` interface に依存しており、`SmtpMailer` がその interface を実装しているため、コンテナは `SmtpMailer` を見つけることができます。テストなどで別の実装を使うには、`provide<Mailer>({ useClass: TestMailer })` のように明示的に提供します。どこからも提供されていない依存関係は、その正確な場所を示すエラーになります: `Undefined dependency "mailer: Mailer" of Signup(?). Type has no provider.`

## NestJS、InversifyJS、tsyringe との比較

|                         | Deepkit                 | NestJS                     | InversifyJS                 | tsyringe                    |
| ----------------------- | ----------------------- | -------------------------- | --------------------------- | --------------------------- |
| サービスへのデコレーター | なし                    | `@Injectable()`            | `@injectable()`             | `@injectable()`             |
| interface への依存      | interface の型          | トークンと `@Inject()`     | トークンと `@inject()`      | トークンと `@inject()`      |
| 型情報の取得元          | Deepkit 型コンパイラー  | `emitDecoratorMetadata`    | `emitDecoratorMetadata`     | `emitDecoratorMetadata`     |

Deepkit は実行時に型を読み取るため、ビルドに [Deepkit 型コンパイラー](./runtime-types/getting-started.md)を組み込む必要があります。コンテナが依存関係を解決する速度については、[ベンチマークページ](/benchmarks)に掲載しています。インストール方法は[はじめに](./dependency-injection/getting-started.md)を参照してください。

## Dependency Injection とは？

Dependency Injection (DI) は、class や function が依存関係を _受け取る_ デザインパターンです。Inversion of Control (IoC) の原則に従っており、複雑なコードをより適切に分離することで、テスト容易性、モジュール性、見通しを大幅に向上させます。IoC の原則を適用するデザインパターンには service locator パターンなどもありますが、特にエンタープライズソフトウェアでは DI が主流のパターンとして定着しています。

IoC の原則を説明するために、次の例を見てみましょう。

```typescript
import { HttpClient } from 'http-library';

class UserRepository {
    async getUsers(): Promise<Users> {
        const client = new HttpClient();
        return await client.get('/users');
    }
}
```

UserRepository class は HttpClient に依存しています。この依存自体は特筆すべきものではありませんが、`UserRepository` が HttpClient を自ら生成している点が問題です。
HttpClient の生成を UserRepository の中にカプセル化するのは良い考えに見えますが、実際にはそうではありません。HttpClient を置き換えたい場合はどうすればよいでしょうか？実際の HTTP リクエストを送信せずに UserRepository をユニットテストしたい場合はどうでしょうか？そもそも、この class が HttpClient を使っていることをどうやって知ればよいのでしょうか？

## Inversion of Control

Inversion of Control (IoC) の考え方に基づくと、HttpClient をコンストラクターの明示的な依存関係とする次のような別の形になります (コンストラクターインジェクションとも呼ばれます)。

```typescript
class UserRepository {
    constructor(
        private http: HttpClient
    ) {}

    async getUsers(): Promise<Users> {
        return await this.http.get('/users');
    }
}
```

これで HttpClient の生成に責任を持つのは UserRepository ではなく、UserRepository の利用者になりました。これが Inversion of Control (IoC) です。制御が逆転 (反転) しています。具体的には、依存関係を生成したり要求したりするのではなく受け取る (注入される) ため、このコードは Dependency Injection を適用しています。Dependency Injection は IoC の一形態にすぎません。

## Service Locator

DI のほかに、Service Locator (SL) も IoC の原則を適用する方法の 1 つです。依存関係を受け取るのではなく要求するため、一般に Dependency Injection と対になるものと見なされています。上記のコードで HttpClient を次のように要求する場合、Service Locator パターンと呼ばれます。

```typescript
class UserRepository {
    async getUsers(): Promise<Users> {
        const client = locator.getHttpClient();
        return await client.get('/users');
    }
}
```

`locator.getHttpClient` という function の名前は何でもかまいません。ほかにも `useContext(HttpClient)`、`getHttpClient()`、`await import("client")` のような function 呼び出しや、`container.get(HttpClient)`、`container.http` のようなコンテナへの問い合わせが考えられます。グローバルなオブジェクトの import は、モジュールシステム自体をロケーターとして使う、Service Locator のやや異なる形です。

```typescript
import { httpClient } from 'clients'

class UserRepository {
    async getUsers(): Promise<Users> {
        return await httpClient.get('/users');
    }
}
```

これらすべてに共通するのは、HttpClient という依存関係を明示的に要求しており、サービスコンテナの存在をコードが認識している点です。これはコードをフレームワークに密結合させるため、コードをクリーンに保つうえで避けるべきものです。

サービスの要求は、Property のデフォルト値としてだけでなく、コードの途中のどこでも行えます。コードの途中ということは型のインターフェースの一部にならないため、HttpClient の使用が隠蔽されてしまいます。HttpClient の要求方法によっては、別の実装への置き換えが非常に難しくなったり、まったく不可能になったりすることがあります。特にユニットテストの分野やコードの見通しの点で問題が生じやすいため、現在では Service Locator は状況によってアンチパターンに分類されています。

## Dependency Injection

Dependency Injection では何も要求せず、利用者が明示的に提供したものをコードが受け取ります。利用する側はサービスコンテナにアクセスできず、`HttpClient` がどのように生成または取得されるかも知りません。その本質は、コードを IoC フレームワークから切り離し、よりクリーンにできることにあります。

コードは `HttpClient` が必要であることを型として宣言するだけです。Service Locator と比べた Dependency Injection の重要な違いであり利点でもあるのは、Dependency Injection を使ったコードが、サービスコンテナやサービスの識別システムがなくても問題なく動作することです (サービスに名前を付ける必要はありません)。単なる型宣言なので、IoC フレームワークの外でも機能します。

先ほどの例からわかるように、そこではすでに Dependency Injection パターンが適用されています。具体的には、依存関係をコンストラクターで宣言しているのでコンストラクターインジェクションです。したがって、UserRepository は次のようにインスタンス化する必要があります。

```typescript
const users = new UserRepository(new HttpClient());
```

UserRepository を使いたいコードは、そのすべての依存関係も提供 (注入) しなければなりません。HttpClient を毎回生成するか、同じものを毎回使うかは、class 自身ではなく class の利用者が決めるようになりました。(class の視点では) Service Locator のように要求することも、最初の例のように完全に自分で生成することもなくなりました。このフローの反転には、さまざまな利点があります。

* すべての依存関係が明示的に見えるため、コードが理解しやすくなります。
* すべての依存関係が一意であり、必要に応じて簡単に変更できるため、コードをテストしやすくなります。
* 依存関係を簡単に交換できるため、コードのモジュール性が高まります。
* UserRepository が非常に複雑な依存関係を自ら生成する責任を負わなくなるため、関心の分離 (Separation of Concern) の原則を促進します。

しかし、明らかな欠点もすぐに見えてきます。HttpClient のような依存関係は、本当にすべて自分で生成または管理しなければならないのでしょうか？答えはイエスでもありノーでもあります。依存関係を自分で管理することがまったく妥当なケースは数多くあります。優れた API の特徴は、依存関係が手に負えないほど増えず、それでいて使い心地が良いことです。多くのアプリケーションや複雑なライブラリでは、これで十分な場合もあるでしょう。依存関係の多い非常に複雑な低レベル API を利用者に簡素化して提供するには、facade パターンが非常に適しています。

## Dependency Injection コンテナ

しかし、より複雑なアプリケーションでは、すべての依存関係を自分で管理する必要はありません。それこそが、いわゆる Dependency Injection コンテナの役割だからです。コンテナはすべてのオブジェクトを自動的に生成するだけでなく、依存関係も自動的に「注入」するため、手動で「new」を呼び出す必要がなくなります。注入にはコンストラクターインジェクション、Method インジェクション、Property インジェクションなど、さまざまな種類があります。これにより、依存関係の多い複雑なアーキテクチャでも簡単に管理できます。

Deepkit は Dependency Injection コンテナ (DI コンテナまたは IoC コンテナとも呼ばれます) を `@deepkit/injector` で提供しており、Deepkit Framework では App モジュールを通じてすでに統合されています。上記のコードは、`@deepkit/injector` パッケージの低レベル API を使うと次のようになります。

```typescript
import { InjectorContext } from '@deepkit/injector';

const injector = InjectorContext.forProviders(
    [UserRepository, HttpClient]
);

const userRepo = injector.get(UserRepository);

const users = await userRepo.getUsers();
```

この場合、`injector` オブジェクトが Dependency Injection コンテナです。「new UserRepository」を使う代わりに、コンテナが `get(UserRepository)` によって UserRepository のインスタンスを返します。コンテナを静的に初期化するには、provider のリスト (この場合は単に class) を `InjectorContext.forProviders` function に渡します。
DI は依存関係を提供することがすべてであり、コンテナには依存関係が提供されるため、「provider」という専門用語が使われています。

provider には ClassProvider、ValueProvider、ExistingProvider、FactoryProvider といういくつかの種類があります。これらを組み合わせることで、非常に柔軟なアーキテクチャを DI コンテナで表現できます。

provider 間のすべての依存関係は自動的に解決され、`injector.get()` が呼び出されるとすぐに、オブジェクトと依存関係が生成およびキャッシュされ、コンストラクターの Argument として渡される (コンストラクターインジェクション)、Property として設定される (Property インジェクション)、または Method 呼び出しに渡される (Method インジェクション) かのいずれかの方法で正しく受け渡されます。

HttpClient を別のものに交換するには、HttpClient に対して別の provider (ここでは ValueProvider) を定義します。

```typescript
const injector = InjectorContext.forProviders([
    UserRepository,
    {provide: HttpClient, useValue: new AnotherHttpClient()},
]);
```

`injector.get(UserRepository)` で UserRepository を要求すると、AnotherHttpClient オブジェクトが渡されます。代わりに ClassProvider を使うこともでき、その場合は AnotherHttpClient のすべての依存関係も DI コンテナによって管理されます。

```typescript
const injector = InjectorContext.forProviders([
    UserRepository,
    {provide: HttpClient, useClass: AnotherHttpClient},
]);
```

すべての種類の provider については、[Dependency Injection Providers](./dependency-injection/providers.md) のセクションで一覧にして説明しています。

ここで補足しておくと、Deepkit の DI コンテナは Deepkit のランタイム型でのみ動作します。つまり、class、type、interface、function を含むすべてのコードは、実行時に型情報を利用できるよう Deepkit Type Compiler でコンパイルする必要があります。[ランタイム型](./runtime-types.md)の章を参照してください。

## Dependency Inversion

先ほどの UserRepository の例では、UserRepository がより低レベルの HTTP ライブラリに依存しています。さらに、抽象 (interface) ではなく具体的な実装 (class) が依存関係として宣言されています。一見するとオブジェクト指向のパラダイムに沿っているように思えますが、特に複雑で大規模なアーキテクチャでは問題につながる可能性があります。

別の方法として、HttpClient への依存を抽象 (interface) に変換し、HTTP ライブラリのコードを UserRepository に import しないようにすることが考えられます。

```typescript
interface HttpClientInterface {
   get(path: string): Promise<any>;
}

class UserRepository {
    constructor(
        private http: HttpClientInterface
    ) {}

    async getUsers(): Promise<Users> {
        return await this.http.get('/users');
    }
}
```

これを依存性逆転の原則 (Dependency Inversion Principle) と呼びます。UserRepository は HTTP ライブラリに直接依存しなくなり、代わりに抽象 (interface) に基づくようになります。これにより、この原則の 2 つの基本的な目標を満たします。

* 高レベルのモジュールは、低レベルのモジュールから何も import すべきではありません。
* 実装は抽象 (interface) に基づくべきです。

2 つの実装 (UserRepository と HTTP ライブラリ) の結合は、DI コンテナを介して行えるようになりました。

```typescript
import { InjectorContext } from '@deepkit/injector';
import { HttpClient } from './http-client';
import { UserRepository } from './user-repository';

const injector = InjectorContext.forProviders([
    UserRepository,
    HttpClient,
]);
```

Deepkit の DI コンテナは、この HttpClientInterface のような抽象的な依存関係 (interface) を解決できるため、HttpClient が `class HttpClient implements HttpClientInterface` と宣言していれば、UserRepository には自動的に HttpClient の実装が渡されます。

HttpClient がこの interface を実装していない場合、DI コンテナはエラー (`Undefined dependency "http: HttpClientInterface" of UserRepository(?). Type has no provider.`) をスローします。この場合、2 つの実装を結合しようとする利用者が解決策を用意しなければなりません。たとえば、HttpClientInterface を実装し、Method 呼び出しを HttpClient に正しく転送するアダプター class を登録する方法があります。

別の方法として、HttpClientInterface に具体的な実装を直接提供することもできます。

```typescript
import { InjectorContext, provide } from '@deepkit/injector';
import { HttpClient } from './http-client';
import { UserRepository, HttpClientInterface } from './user-repository';

const injector = InjectorContext.forProviders([
    UserRepository,
    provide<HttpClientInterface>({useClass: HttpClient}),
]);
```

ここで注意すべき点として、依存性逆転の原則には理論上の利点がある一方で、実際には大きな欠点もあります。より多くの interface を書く必要があるためコード量が増えるだけでなく、各実装が依存関係ごとに interface を持つことになるため複雑さも増します。この代償に見合うのは、アプリケーションが一定の規模に達し、この柔軟性が必要になった場合だけです。あらゆるデザインパターンや原則と同様に、この原則にもコストと効用のバランスがあり、適用する前によく検討する必要があります。

デザインパターンは、ごく単純なコードにまで盲目的かつ一律に適用すべきではありません。しかし、複雑なアーキテクチャ、大規模なアプリケーション、拡大するチームといった前提条件がそろって初めて、依存性逆転やその他のデザインパターンは真の力を発揮します。
