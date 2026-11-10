# エラー

スローされたエラーは、そのメッセージおよび登録済みのエラークラスのプロパティとともに、自動的にクライアントへ転送されます。

スタックトレースと `error.cause` は、`FrameworkModule` の `debug` オプションが有効な場合にのみ送信されます。これらには、ファイルパスや公開エラーがラップしているデータベースエラーなど、内部の詳細が含まれるためです。フレームワークを使用しない場合は、`@deepkit/rpc` の `rpcErrorSettings.exposeStack` と `rpcErrorSettings.exposeCause` を設定してください。cause も再びエラーとして届くため、`error.cause` はサーバー上と同様にクライアント上でも機能します。

エラーオブジェクトの名目上のインスタンスが重要な場合（instanceof を使用するため）、指定したエラークラスがランタイムに登録され再利用されるように、`@entity.name('@error:unique-name')` を使用する必要があります。

```typescript
@entity.name('@error:myError')
class MyError extends Error {}

//サーバー
@rpc.controller('/main')
class Controller {
    @rpc.action()
    saveUser(user: User): void {
        throw new MyError('Can not save user');
    }
}

//クライアント
//[MyError] により、クラス MyError がランタイムで認識されるようになります
const controller = client.controller<Controller>('/main', [MyError]);

try {
    await controller.getUser(2);
} catch (e) {
    if (e instanceof MyError) {
        //おっと、ユーザーを保存できませんでした
    } else {
        //その他すべてのエラー
    }
}
```

## エラーの変換

スローされたエラーは、エラーメッセージやスタックトレースなどのすべての情報とともに自動的にクライアントへ転送されるため、意図せず機密情報が公開される可能性があります。これを変更するには、メソッド `transformError` 内でスローされたエラーを変更できます。

```typescript
class MyKernelSecurity extends RpcKernelSecurity {
    constructor(private logger: Logger) {
        super();
    }

    transformError(error: Error) {
        //新しいエラーでラップする
        this.logger.error('Error in RPC', error);
        return new Error('Something went wrong: ' + error.message);
    }
}
```

エラーが汎用的な `error` に変換されると、完全なスタックトレースとエラーの識別情報が失われることに注意してください。したがって、クライアント側ではそのエラーに対して `instanceof` チェックを使用できなくなります。

Deepkit RPC が2つのマイクロサービス間で使用され、クライアントとサーバーが完全に開発者の管理下にある場合、エラーの変換が必要になることはほとんどありません。一方、クライアントが不特定のユーザーのブラウザで実行されている場合は、`transformError` でどの情報を開示するかに注意を払う必要があります。判断に迷う場合は、内部の詳細が漏洩しないように、各エラーを汎用的な `Error` に変換すべきです。その際、この時点でエラーをログに記録しておくとよいでしょう。
