# はじめに

Deepkit RPC は Runtime Types に基づいているため、使用するには `@deepkit/type` が正しくインストールされている必要があります。[Runtime Type のインストール](../runtime-types.md)を参照してください。

これが正常に完了したら、`@deepkit/rpc`、または内部ですでにこのライブラリを使用している Deepkit Framework をインストールできます。

```sh
npm install @deepkit/rpc
```

`@deepkit/rpc` のコントローラークラスは TypeScript のデコレーターに基づいているため、experimentalDecorators でこの機能を有効にする必要があることに注意してください。

サーバーとクライアントがそれぞれ独自の package.json を持つ場合、`@deepkit/rpc` パッケージは両方にインストールする必要があります。

TCP でサーバーと通信するには、クライアントとサーバーに `@deepkit/rpc-tcp` パッケージをインストールする必要があります。

```sh
npm install @deepkit/rpc-tcp
```

WebSocket 通信の場合も、サーバー側にこのパッケージが必要です。一方、ブラウザ上のクライアントは公式標準の WebSocket を使用します。

WebSocket が利用できない環境（例えば NodeJS）でもクライアントを使用する場合は、クライアントに ws パッケージが必要です。

```sh
npm install ws
```

## 使い方

以下は、WebSocket と @deepkit/rpc の低レベル API に基づいた、完全に動作する例です。Deepkit Framework を使用する場合、コントローラーはアプリモジュールを介して提供され、RpcKernel を手動でインスタンス化することはありません。

_ファイル: server.ts_

```typescript
import { rpc, RpcKernel } from '@deepkit/rpc';
import { RpcWebSocketServer } from '@deepkit/rpc-tcp';

@rpc.controller('/main')
export class Controller {
    @rpc.action()
    hello(title: string): string {
        return 'Hello ' + title;
    }
}

const kernel = new RpcKernel();
kernel.registerController(Controller);
const server = new RpcWebSocketServer(kernel, 'localhost:8081');
server.start({
    host: '127.0.0.1',
    port: 8081,
});
console.log('Server started at ws://127.0.0.1:8081');

```

_ファイル: client.ts_

```typescript
import { RpcWebSocketClient } from '@deepkit/rpc';
import type { Controller } from './server';

async function main() {
    const client = new RpcWebSocketClient('ws://127.0.0.1:8081');
    const controller = client.controller<Controller>('/main');

    const result = await controller.hello('World');
    console.log('result', result);

    client.disconnect();
}

main().catch(console.error);

```

## サーバーコントローラー

Remote Procedure Call における「Procedure」という用語は、一般に「Action」とも呼ばれます。Action はクラス内で定義され、`@rpc.action` デコレーターでマークされたメソッドです。クラス自体は `@rpc.controller` デコレーターで Controller としてマークされ、一意の名前が付けられます。この名前は、クライアントで正しいコントローラーを指定するために参照されます。必要に応じて複数のコントローラーを定義して登録できます。


```typescript
import { rpc } from '@deepkit/rpc';

@rpc.controller('/main')
class Controller {
    @rpc.action()
    hello(title: string): string {
        return 'Hello ' + title;
    }

    @rpc.action()
    test(): boolean {
        return true;
    }
}
```

クライアントから呼び出せるのは、`@rpc.action()` としてマークされたメソッドのみです。

型は明示的に指定する必要があり、推論させることはできません。これは、シリアライザーがデータをバイナリデータ（BSON）または JSON に変換してネットワーク経由で送信するために、型がどのような形をしているかを正確に知る必要があるため重要です。

## クライアントコントローラー

RPC の通常の流れでは、クライアントがサーバー上の関数を実行します。しかし Deepkit RPC では、サーバーがクライアント上の関数を実行することも可能です。これを可能にするために、クライアントもコントローラーを登録できます。

クライアントは `client.registerController()` を使ってコントローラーを名前付きで登録します。サーバーは呼び出し元クライアントの `RpcKernelConnection` を注入され、`connection.controller<T>(name)` でそのクライアント用のリモートコントローラーを作成します。クライアント側と同様に、リモートコントローラーのすべてのメソッドは `Promise` を返します。

```typescript
import { rpc, RpcKernelConnection } from '@deepkit/rpc';

//クライアント上で実行される
@rpc.controller('/client')
export class ClientController {
    @rpc.action()
    notify(message: string): void {
        console.log('Server says:', message);
    }
}

//サーバー上で実行される
@rpc.controller('/main')
export class Controller {
    constructor(private connection: RpcKernelConnection) {
    }

    @rpc.action()
    async ping(): Promise<string> {
        const client = this.connection.controller<ClientController>('/client');
        await client.notify('ping received');
        return 'pong';
    }
}
```

```typescript
const client = new RpcWebSocketClient('ws://127.0.0.1:8081');
client.registerController(ClientController, '/client');

const controller = client.controller<Controller>('/main');
await controller.ping(); //クライアント上に "Server says: ping received" と出力される
```

リモートコントローラーは接続が開いている間だけ動作します。後からクライアントを呼び出す場合（例えば通知をプッシュする場合）は、`RpcKernelConnection` への参照を保持しておき、クライアントが切断されたら削除してください。バックコントローラーは永続的な接続を必要とするため、WebSocket、TCP、IPC では動作しますが、[HTTP](./http.md) では動作しません。

## Dependency Injection

Deepkit Framework を使用する場合、クラスは Dependency Injection コンテナによってインスタンス化されるため、アプリケーション内の他のすべてのプロバイダーに自動的にアクセスできます。

[Dependency Injection](dependency-injection.md#) も参照してください。

## RxJS のストリーミング

Action は RxJS の `Observable`、`Subject`、`BehaviorSubject`、または `@deepkit/core-rxjs` の `ProgressTracker` を返すことができます。戻り値の型は `Promise` でラップすることもできます。クライアントは同じ型のオブジェクトを受け取り、サーバーが値を発行するたびにその値が届きます。

```typescript
import { rpc } from '@deepkit/rpc';
import { BehaviorSubject, Observable, Subject } from 'rxjs';

@rpc.controller('/main')
export class Controller {
    chat = new Subject<string>();
    status = new BehaviorSubject<string>('idle');

    @rpc.action()
    countdown(from: number): Observable<number> {
        return new Observable(subscriber => {
            for (let i = from; i >= 0; i--) subscriber.next(i);
            subscriber.complete();
        });
    }

    @rpc.action()
    messages(): Subject<string> {
        return this.chat;
    }

    @rpc.action()
    currentStatus(): BehaviorSubject<string> {
        return this.status;
    }
}
```

```typescript
const controller = client.controller<Controller>('/main');

const countdown = await controller.countdown(3);
countdown.subscribe(value => console.log(value)); //3, 2, 1, 0

const messages = await controller.messages();
messages.subscribe(message => console.log(message));

const status = await controller.currentStatus();
status.getValue(); //'idle'
```

それぞれの型は異なる動作をします:

- `Observable`: 遅延評価です。クライアントが購読するたびにサーバーは返された Observable を購読し、クライアントが購読を解除するとサーバーも購読を解除します。これにより、サーバー上で Observable のティアダウン処理が実行されます。
- `Subject`: サーバーは即座に購読し、すべての値を転送します。通常の Subject と同様に、クライアントが購読する前に発行された値は失われます。
- `BehaviorSubject`: `Subject` と同様ですが、クライアントはサーバーの現在の値から開始するため、`getValue()` がすぐに使えます。

サーバーがストリームを完了するかエラーを発行すると、クライアントの Observable または Subject も同様に完了またはエラーになります。

### クリーンアップ

クライアント上の Subject または BehaviorSubject で `unsubscribe()` または `complete()` を呼び出すと、サーバーは値の転送を停止します。サーバー上の Subject は完了しないため、上記の `chat` のような共有 Subject は他のクライアントに対して引き続き動作します。接続が閉じられると、サーバーはそのクライアントのすべての Observable と Subject の購読を解除します。クライアントが購読を解除せずにストリームを破棄した場合、ガベージコレクションされた時点で解放されますが、これに頼らず明示的に購読を解除してください。

```typescript
const messages = await controller.messages();
const subscription = messages.subscribe(message => console.log(message));

subscription.unsubscribe(); //このサブスクライバーのみを停止する
messages.unsubscribe(); //サーバーに値の送信を停止するよう伝える
```

### 進捗

`ProgressTracker` は長時間実行される処理の進捗を報告します。`track(message, total)` を呼び出すたびにグループが作成され、`done` を設定するとクライアントに更新が送信されます（100 ms にスロットリングされます）。すべてのグループが完了するとトラッカーも完了します。クライアントは自身のトラッカーで `stop()` を呼び出すことができ、これによりサーバー上の `onStop` コールバックが呼び出されます。

```typescript
import { rpc } from '@deepkit/rpc';
import { ProgressTracker } from '@deepkit/core-rxjs';

@rpc.controller('/import')
export class ImportController {
    @rpc.action()
    import(): ProgressTracker {
        const tracker = new ProgressTracker();
        const rows = tracker.track('Importing rows', 100);

        const timer = setInterval(() => {
            rows.done++;
            if (rows.finished) clearInterval(timer);
        }, 50);
        rows.onStop(() => clearInterval(timer));

        return tracker;
    }
}
```

```typescript
const progress = await client.controller<ImportController>('/import').import();
progress.subscribe(() => console.log(progress.done, '/', progress.total));

progress.stop(); //サーバー上のインポートをキャンセルする
```

ストリームは永続的な接続を必要とするため、[HTTP](./http.md) ではサポートされていません。

## Nominal Types

クライアントが関数呼び出しからデータを受け取る際、そのデータはまずサーバー上でシリアライズされ、その後クライアント上でデシリアライズされます。関数の戻り値の型にクラスが含まれている場合、それらのクラスはクライアント側で再構築されますが、名前的な同一性（nominal identity）と関連するメソッドは失われます。この問題に対処するには、クラスを一意の ID/名前を持つ nominal type として登録してください。この方法は、RPC-API 内で使用されるすべてのクラスに適用する必要があります。

クラスを登録するには、デコレーター `@entity.name('id')` を使用します。

```typescript
import { entity } from '@deepkit/type';

@entity.name('user')
class User {
    id!: number;
    firstName!: string;
    lastName!: string;
    get fullName() {
        return this.firstName + ' ' + this.lastName;
    }
}
```

このクラスが関数の結果として使用されると、その同一性は保持されます。

```typescript
const controller = client.controller<Controller>('/main');

const user = await controller.getUser(2);
user instanceof User; //@entity.name を使用した場合は true、使用しない場合は false
```
