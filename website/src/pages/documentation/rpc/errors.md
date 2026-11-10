# Errors

Thrown errors are automatically forwarded to the client with their message, and the properties of registered error classes.

The stack trace and `error.cause` are only sent when the `debug` option of the `FrameworkModule` is enabled, since they show internal details like file paths or the database error a public error wraps. Without the framework, set `rpcErrorSettings.exposeStack` and `rpcErrorSettings.exposeCause` of `@deepkit/rpc`. A cause arrives as error again, so `error.cause` works on the client like on the server.

If nominal instances for the error object is import (because you use instanceof), it is required to use `@entity.name('@error:unique-name')` so that the given error class is registered in the runtime and reused.

```typescript
@entity.name('@error:myError')
class MyError extends Error {}

//server
@rpc.controller('/main')
class Controller {
    @rpc.action()
    saveUser(user: User): void {
        throw new MyError('Can not save user');
    }
}

//client
//[MyError] makes sure the class MyError is known in runtime
const controller = client.controller<Controller>('/main', [MyError]);

try {
    await controller.getUser(2);
} catch (e) {
    if (e instanceof MyError) {
        //ops, could not save user
    } else {
        //all other errors
    }
}
```

## Transform Error

Since thrown errors are automatically forwarded to the client with all its information like the error message and also the stacktrace, this could unwantedly publish sensitive information. To change this, in the method `transformError` the thrown error can be modified.

```typescript
class MyKernelSecurity extends RpcKernelSecurity {
    constructor(private logger: Logger) {
        super();
    }

    transformError(error: Error) {
        //wrap in new error
        this.logger.error('Error in RPC', error);
        return new Error('Something went wrong: ' + error.message);
    }
}
```

Note that once the error is converted to a generic `error`, the complete stack trace and the identity of the error are lost. Accordingly, no `instanceof` checks can be used on the error in the client.

If Deepkit RPC is used between two microservices, and thus the client and server are under complete control of the developer, then transforming the error is rarely necessary. If, on the other hand, the client is running in a browser with an unknown, then care should be taken in `transformError` as to what information is to be disclosed. If in doubt, each error should be transformed with a generic `Error` to ensure that no internal details are leaked. Logging the error would then be a good idea at this point.
