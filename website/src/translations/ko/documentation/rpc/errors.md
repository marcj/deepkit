# 에러

throw된 에러는 메시지 및 등록된 에러 클래스의 프로퍼티와 함께 자동으로 클라이언트에 전달됩니다.

스택 트레이스와 `error.cause`는 `FrameworkModule`의 `debug` 옵션이 활성화된 경우에만 전송됩니다. 이들은 파일 경로나 공개 에러가 감싸고 있는 데이터베이스 에러와 같은 내부 세부 정보를 노출하기 때문입니다. 프레임워크 없이 사용하는 경우에는 `@deepkit/rpc`의 `rpcErrorSettings.exposeStack`과 `rpcErrorSettings.exposeCause`를 설정하세요. cause는 다시 에러로 도착하므로, 클라이언트에서도 서버에서와 마찬가지로 `error.cause`가 동작합니다.

에러 객체의 nominal 인스턴스가 중요한 경우(instanceof를 사용하기 때문에), 해당 에러 클래스가 런타임에 등록되고 재사용되도록 `@entity.name('@error:unique-name')`을 사용해야 합니다.

```typescript
@entity.name('@error:myError')
class MyError extends Error {}

//서버
@rpc.controller('/main')
class Controller {
    @rpc.action()
    saveUser(user: User): void {
        throw new MyError('Can not save user');
    }
}

//클라이언트
//[MyError]는 MyError 클래스가 런타임에 알려지도록 보장합니다
const controller = client.controller<Controller>('/main', [MyError]);

try {
    await controller.getUser(2);
} catch (e) {
    if (e instanceof MyError) {
        //이런, 사용자를 저장할 수 없습니다
    } else {
        //그 외의 모든 에러
    }
}
```

## 에러 변환

throw된 에러는 에러 메시지와 스택 트레이스 등 모든 정보와 함께 자동으로 클라이언트에 전달되므로, 의도치 않게 민감한 정보가 공개될 수 있습니다. 이를 변경하려면 `transformError` 메서드에서 throw된 에러를 수정할 수 있습니다.

```typescript
class MyKernelSecurity extends RpcKernelSecurity {
    constructor(private logger: Logger) {
        super();
    }

    transformError(error: Error) {
        //새 에러로 감싸기
        this.logger.error('Error in RPC', error);
        return new Error('Something went wrong: ' + error.message);
    }
}
```

에러가 일반적인 `error`로 변환되면 전체 스택 트레이스와 에러의 정체성(identity)이 사라진다는 점에 유의하세요. 따라서 클라이언트에서 해당 에러에 대해 `instanceof` 검사를 사용할 수 없습니다.

Deepkit RPC가 두 마이크로서비스 간에 사용되어 클라이언트와 서버가 모두 개발자의 완전한 통제하에 있다면, 에러를 변환할 필요는 거의 없습니다. 반면 클라이언트가 알 수 없는 사용자의 브라우저에서 실행되는 경우에는, `transformError`에서 어떤 정보를 공개할지 주의해야 합니다. 확실하지 않다면 내부 세부 정보가 유출되지 않도록 모든 에러를 일반적인 `Error`로 변환해야 합니다. 이 시점에서 에러를 로깅하는 것도 좋은 방법입니다.
