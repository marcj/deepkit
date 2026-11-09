# TypeScript RPC フレームワーク

Deepkit RPC は、TypeScript 向けの型安全な RPC フレームワークです。サーバー上に通常の Class を記述し、その Method をクライアントから呼び出すだけで、Parameter と結果は TypeScript の型に基づいて検証されます。コード生成は不要です。

```typescript
//server.ts
import { rpc, RpcKernel } from '@deepkit/rpc';
import { RpcWebSocketServer } from '@deepkit/rpc-tcp';
import { MinLength } from '@deepkit/type';

export interface User {
    username: string;
    createdAt: Date;
}

@rpc.controller('/user')
export class UserController {
    @rpc.action()
    create(username: string & MinLength<3>): User {
        return { username, createdAt: new Date() };
    }
}

const kernel = new RpcKernel();
kernel.registerController(UserController);

const server = new RpcWebSocketServer(kernel, 'localhost:8081');
server.start({ host: '127.0.0.1', port: 8081 });
```

```typescript
//client.ts
import { RpcWebSocketClient } from '@deepkit/rpc';
import type { UserController } from './server';

async function main() {
    const client = new RpcWebSocketClient('ws://127.0.0.1:8081');
    const users = client.controller<UserController>('/user');

    const user = await users.create('Peter');
    console.log(user.createdAt instanceof Date); // true

    await users.create('ab');
    // RpcError: Validation error for arguments of ...
    // username(minLength): Min length is 3 caused by value "ab"
}

main().catch(console.error);
```

クライアントはコントローラーの型のみをインポートするため、サーバーのコードがクライアントバンドルに含まれることはありません。`Date` は本物の `Date` として届き、不正な呼び出しは Method が実行される前に拒否されます。インストール方法については [はじめに](./rpc/getting-started.md) を参照してください。

## tRPC および gRPC との比較

|                    | Deepkit RPC                         | tRPC                                  | gRPC                                   |
| ------------------ | ----------------------------------- | ------------------------------------- | -------------------------------------- |
| API 定義           | TypeScript の Class と型            | プロシージャを持つ Router             | `.proto` ファイル                      |
| コード生成         | なし                                | なし                                  | 必須                                   |
| ランタイムバリデーション | 組み込み（TypeScript の型に基づく） | Zod などのスキーマライブラリを使用    | メッセージ構造のみ                     |
| ワイヤーフォーマット | バイナリ（BSON）                    | JSON                                  | バイナリ（Protocol Buffers）           |
| トランスポート     | WebSocket、TCP                      | HTTP、WebSocket                       | HTTP/2                                 |
| 言語               | TypeScript                          | TypeScript                            | 多数                                   |

Deepkit RPC はランタイムで型を読み取るため、ビルドに [Deepkit 型コンパイラ](./runtime-types/getting-started.md) が必要です。他社や素の HTTP クライアントから呼び出される API には代わりに [Deepkit HTTP](./http.md) を使用し、複数のプログラミング言語で書かれたサービス同士が通信する必要がある場合は gRPC を使用してください。

## RPC とは？

RPC は Remote Procedure Call の略で、リモートサーバー上の Function をローカルの Function であるかのように呼び出せる仕組みです。HTTP メソッドと URL でマッピングを行う HTTP のクライアント・サーバー通信とは異なり、RPC は Function 名でマッピングを行います。送信するデータは通常の Function の Argument として渡され、サーバー上での Function 呼び出しの結果がクライアントに返送されます。

RPC の利点は、ヘッダー、URL、クエリ文字列などを扱わないため、クライアント・サーバーの抽象化が軽量であることです。欠点は、RPC 経由のサーバー上の Function はブラウザから簡単には呼び出せず、多くの場合専用のクライアントが必要になることです。

RPC の重要な特徴の 1 つは、クライアントとサーバー間のデータが自動的にシリアライズおよびデシリアライズされることです。そのため、通常は型安全な RPC クライアントを実現できます。RPC フレームワークの中には、型（Parameter の型と Return Value の型）を特定の形式で提供することをユーザーに強制するものもあります。これは gRPC の Protocol Buffers のような DSL や、JavaScript のスキーマビルダーの形式をとります。RPC フレームワークが追加のデータバリデーションを提供することもありますが、すべてのフレームワークが対応しているわけではありません。

Deepkit RPC は TypeScript のコード自体から型を抽出します。[バリデーション](./runtime-types/validation.md) で説明されている追加の制約を定義すると、それらは自動的に検証されます。RPC は本質的に非同期通信に基づいているため、クライアント上のすべての Function 呼び出しは `Promise` を返し、結果は `await` で受け取ります。

## RxJS によるストリーミング

アクションは `Observable` を返すことができます。クライアントも `Observable` を受け取り、サーバーが値を発行するたびに各値が届くため、Deepkit RPC はリアルタイム通信に適しています。

```typescript
import { rpc } from '@deepkit/rpc';
import { Observable } from 'rxjs';

@rpc.controller('/numbers')
export class NumbersController {
    @rpc.action()
    countdown(from: number): Observable<number> {
        return new Observable(subscriber => {
            for (let i = from; i >= 0; i--) subscriber.next(i);
            subscriber.complete();
        });
    }
}

//クライアント側
const numbers = client.controller<NumbersController>('/numbers');
const stream = await numbers.countdown(3);
stream.subscribe(value => console.log(value)); // 3, 2, 1, 0
```

## Isomorphic TypeScript

プロジェクトがクライアント（通常はフロントエンド）とサーバー（バックエンド）の両方で TypeScript を使用している場合、これを Isomorphic TypeScript と呼びます。TypeScript の型に基づく型安全な RPC フレームワークは、クライアントとサーバーの間で型を共有できるため、このようなプロジェクトに特に有益です。

これを活用するには、両側で使用する型を専用のファイルまたはパッケージに移動する必要があります。

```typescript
//shared.ts
export class User {
    id: number = 0;
    username: string = '';
}

//server.ts
import { rpc } from '@deepkit/rpc';
import { User } from './shared';

@rpc.controller('/user')
export class UserController {
    constructor(private database: Database) {}

    @rpc.action()
    async getUser(id: number): Promise<User> {
        return await this.database.query(User).filter({ id }).findOne();
    }
}

//client.ts
import type { UserController } from './server';

const controller = client.controller<UserController>('/user');
const user = await controller.getUser(2);
```

後方互換性は、通常のローカル API と同じ方法で実装できます。新しい Parameter をオプションとしてマークするか、新しい Method を追加します。

## 次のステップ

- [はじめに](./rpc/getting-started.md)：インストールと完全な例
- [トランスポート](./rpc/transport.md)：WebSocket、TCP、および独自のトランスポート
- [エラー](./rpc/errors.md) と [セキュリティ](./rpc/security.md)
- [ベンチマーク](/benchmarks)：Deepkit の各パッケージのパフォーマンス
