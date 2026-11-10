# 错误

抛出的错误会自动转发给客户端，包括其消息以及已注册错误类的属性。

只有在启用 `FrameworkModule` 的 `debug` 选项时，才会发送堆栈跟踪和 `error.cause`，因为它们会暴露内部细节，例如文件路径或公共错误所包装的数据库错误。在不使用框架的情况下，请设置 `@deepkit/rpc` 的 `rpcErrorSettings.exposeStack` 和 `rpcErrorSettings.exposeCause`。cause 同样会以错误的形式到达客户端，因此 `error.cause` 在客户端上的用法与在服务器上相同。

如果错误对象的名义实例很重要（因为你使用了 instanceof），则必须使用 `@entity.name('@error:unique-name')`，以便给定的错误类在运行时中注册并被重用。

```typescript
@entity.name('@error:myError')
class MyError extends Error {}

//服务器
@rpc.controller('/main')
class Controller {
    @rpc.action()
    saveUser(user: User): void {
        throw new MyError('Can not save user');
    }
}

//客户端
//[MyError] 确保类 MyError 在运行时中是已知的
const controller = client.controller<Controller>('/main', [MyError]);

try {
    await controller.getUser(2);
} catch (e) {
    if (e instanceof MyError) {
        //糟糕，无法保存用户
    } else {
        //所有其他错误
    }
}
```

## 转换错误

由于抛出的错误会连同其所有信息（例如错误消息以及堆栈跟踪）自动转发给客户端，这可能会意外地泄露敏感信息。要改变这一点，可以在 `transformError` 方法中修改抛出的错误。

```typescript
class MyKernelSecurity extends RpcKernelSecurity {
    constructor(private logger: Logger) {
        super();
    }

    transformError(error: Error) {
        //包装到新的错误中
        this.logger.error('Error in RPC', error);
        return new Error('Something went wrong: ' + error.message);
    }
}
```

请注意，一旦错误被转换为通用的 `error`，完整的堆栈跟踪和错误的身份信息都会丢失。因此，在客户端上无法对该错误使用 `instanceof` 检查。

如果 Deepkit RPC 用于两个微服务之间，客户端和服务器都完全由开发者控制，那么通常很少需要转换错误。另一方面，如果客户端运行在未知的浏览器中，则应在 `transformError` 中谨慎考虑要披露哪些信息。如有疑问，应将每个错误转换为通用的 `Error`，以确保不会泄露任何内部细节。此时记录错误日志会是一个好主意。
