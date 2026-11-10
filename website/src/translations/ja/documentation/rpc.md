# TypeScript RPC フレームワーク

Deepkit RPC は、TypeScript 向けの型安全な RPC フレームワークです。サーバー上で通常のクラスを書き、そのメソッドをクライアントから呼び出します。パラメーターと結果は TypeScript の型に基づいてバリデーションされ、コード生成は不要です。

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

クライアントはコントローラーの型のみをインポートするため、サーバーのコードがクライアントのバンドルに含まれることはありません。`Date` は本物の `Date` として届き、不正な呼び出しはメソッドが実行される前に拒否されます。インストール方法については [はじめに](./rpc/getting-started.md) を参照してください。

## tRPC および gRPC との比較

|                    | Deepkit RPC                         | tRPC                                  | gRPC                                   |
| ------------------ | ----------------------------------- | ------------------------------------- | -------------------------------------- |
| API 定義           | TypeScript のクラスと型             | プロシージャを持つルーター            | `.proto` ファイル                      |
| コード生成         | 不要                                | 不要                                  | 必要                                   |
| ランタイムバリデーション | 組み込み（TypeScript の型から） | Zod などのスキーマライブラリを使用    | メッセージ構造のみ                     |
| ワイヤーフォーマット | バイナリ (BSON)                   | JSON                                  | バイナリ (Protocol Buffers)            |
| トランスポート     | WebSocket、TCP、HTTP、IPC           | HTTP、WebSocket                       | HTTP/2                                 |
| 言語               | TypeScript                          | TypeScript                            | 多数                                   |

Deepkit RPC は実行時に型を読み取るため、ビルドに [Deepkit 型コンパイラー](./runtime-types/getting-started.md) が必要です。他社や素の HTTP クライアントから呼び出される API には代わりに [Deepkit HTTP](./http.md) を使用し、複数のプログラミング言語で書かれたサービス同士が通信する必要がある場合は gRPC を使用してください。

## RPC とは？

RPC は Remote Procedure Call（リモートプロシージャコール）の略で、リモートサーバー上の関数をローカル関数のように呼び出せるようにするものです。HTTP メソッドと URL でマッピングを行う HTTP のクライアント・サーバー通信とは異なり、RPC は関数名でマッピングを行います。送信するデータは通常の関数の引数として渡され、サーバー上での関数呼び出しの結果がクライアントに返されます。

RPC の利点は、ヘッダー、URL、クエリ文字列などを扱わないため、クライアント・サーバー間の抽象化が軽量であることです。欠点は、RPC 経由のサーバー上の関数はブラウザから簡単に呼び出すことができず、多くの場合専用のクライアントが必要になることです。

RPC の重要な特徴の一つは、クライアントとサーバー間のデータが自動的にシリアライズおよびデシリアライズされることです。そのため、通常は型安全な RPC クライアントを実現できます。一部の RPC フレームワークでは、ユーザーに特定の形式で型（パラメーターの型と戻り値の型）を提供することを強制します。これは gRPC における Protocol Buffers のような DSL や、JavaScript のスキーマビルダーの形をとることがあります。追加のデータバリデーションを RPC フレームワークが提供することもありますが、すべてのフレームワークがサポートしているわけではありません。

Deepkit RPC は TypeScript のコード自体から型を抽出します。[バリデーション](./runtime-types/validation.md) で追加の制約を定義すると、それらは自動的にバリデーションされます。RPC は基本的に非同期通信に基づいているため、クライアント上のすべての関数呼び出しは `Promise` を返し、結果は `await` で受け取ります。

## RxJS によるストリーミング

アクションは `Observable` を返すことができます。クライアントも `Observable` を受け取り、サーバーが値を発行するたびにその値が届くため、Deepkit RPC はリアルタイム通信に適しています。

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

プロジェクトがクライアント（通常はフロントエンド）とサーバー（バックエンド）の両方で TypeScript を使用している場合、それは Isomorphic TypeScript と呼ばれます。TypeScript の型に基づく型安全な RPC フレームワークは、クライアントとサーバー間で型を共有できるため、このようなプロジェクトにとって特に有益です。

これを活用するには、両側で使用される型を独自のファイルまたはパッケージに移動する必要があります。

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

後方互換性は、通常のローカル API と同じ方法で実装できます。つまり、新しいパラメーターをオプションとしてマークするか、新しいメソッドを追加します。

## 次のステップ

- [はじめに](./rpc/getting-started.md): インストールと完全な例
- [WebSocket](./rpc/websocket.md)、[TCP](./rpc/tcp.md)、[HTTP](./rpc/http.md): トランスポート
- [IPC](./rpc/ipc.md): 共有メモリ、メッセージポート、パイプを介したワーカースレッド、Web Worker、子プロセス
- [エラー](./rpc/errors.md) と [セキュリティ](./rpc/security.md)
- [ベンチマーク](/benchmarks): Deepkit の各パッケージのパフォーマンス
