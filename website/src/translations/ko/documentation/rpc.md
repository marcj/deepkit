# TypeScript RPC 프레임워크

Deepkit RPC는 TypeScript를 위한 type-safe RPC 프레임워크입니다. 서버에 일반 class를 작성하고 클라이언트에서 해당 method를 호출하면, 코드 생성 없이 TypeScript type을 기반으로 parameter와 결과가 검증됩니다.

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

클라이언트는 controller의 type만 import하므로 서버 코드가 클라이언트 번들에 포함되지 않습니다. `Date`는 실제 `Date`로 전달되며, 유효하지 않은 호출은 method가 실행되기 전에 거부됩니다. 설치 방법은 [시작하기](./rpc/getting-started.md)를 참고하세요.

## tRPC 및 gRPC와의 비교

|                    | Deepkit RPC                         | tRPC                                  | gRPC                                   |
| ------------------ | ----------------------------------- | ------------------------------------- | -------------------------------------- |
| API 정의           | TypeScript class 및 type            | procedure로 구성된 router             | `.proto` 파일                          |
| 코드 생성          | 없음                                | 없음                                  | 필수                                   |
| 런타임 검증        | TypeScript type 기반으로 내장       | Zod와 같은 스키마 라이브러리 사용     | 메시지 구조만 검증                     |
| 전송 형식          | 바이너리 (BSON)                     | JSON                                  | 바이너리 (Protocol Buffers)            |
| Transport          | WebSocket, TCP                      | HTTP, WebSocket                       | HTTP/2                                 |
| 언어               | TypeScript                          | TypeScript                            | 다양함                                 |

Deepkit RPC는 런타임에 type을 읽기 때문에 빌드에 [Deepkit type 컴파일러](./runtime-types/getting-started.md)가 필요합니다. 다른 회사나 일반 HTTP 클라이언트가 호출하는 API에는 [Deepkit HTTP](./http.md)를 대신 사용하고, 여러 프로그래밍 언어로 작성된 서비스끼리 통신해야 할 때는 gRPC를 사용하세요.

## RPC란 무엇인가요?

RPC는 Remote Procedure Call의 약자로, 원격 서버의 함수를 마치 로컬 함수처럼 호출할 수 있게 해 줍니다. 매핑에 HTTP method와 URL을 사용하는 HTTP 클라이언트-서버 통신과 달리, RPC는 매핑에 함수 이름을 사용합니다. 전송할 데이터는 일반 함수 argument로 전달되며, 서버에서 실행된 함수 호출의 결과는 클라이언트로 다시 전송됩니다.

RPC의 장점은 헤더, URL, 쿼리 문자열 등을 다루지 않으므로 클라이언트-서버 추상화가 가볍다는 것입니다. 단점은 RPC를 통해 제공되는 서버의 함수를 브라우저에서 쉽게 호출할 수 없고, 대개 전용 클라이언트가 필요하다는 것입니다.

RPC의 핵심 기능 중 하나는 클라이언트와 서버 간의 데이터가 자동으로 직렬화 및 역직렬화된다는 점입니다. 이 덕분에 일반적으로 type-safe RPC 클라이언트를 구현할 수 있습니다. 일부 RPC 프레임워크는 사용자에게 특정 형식으로 type(parameter type과 return type)을 제공하도록 요구합니다. 이는 gRPC의 Protocol Buffers와 같은 DSL이나 JavaScript 스키마 빌더의 형태일 수 있습니다. RPC 프레임워크가 추가적인 데이터 검증을 제공하기도 하지만, 모든 프레임워크가 이를 지원하는 것은 아닙니다.

Deepkit RPC는 TypeScript 코드 자체에서 type을 추출합니다. [검증](./runtime-types/validation.md)에 설명된 추가 제약 조건을 정의하면 자동으로 검증됩니다. RPC는 근본적으로 비동기 통신을 기반으로 하므로 클라이언트의 모든 함수 호출은 `Promise`를 반환하며, 결과는 `await`로 받습니다.

## RxJS를 사용한 스트리밍

action은 `Observable`을 반환할 수 있습니다. 클라이언트도 `Observable`을 받으며, 서버가 값을 내보낼 때마다 각 값이 도착하므로 Deepkit RPC는 실시간 통신에 적합합니다.

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

//클라이언트에서
const numbers = client.controller<NumbersController>('/numbers');
const stream = await numbers.countdown(3);
stream.subscribe(value => console.log(value)); // 3, 2, 1, 0
```

## Isomorphic TypeScript

프로젝트에서 클라이언트(일반적으로 프론트엔드)와 서버(백엔드) 모두에 TypeScript를 사용하는 경우 이를 Isomorphic TypeScript라고 합니다. 이러한 프로젝트에서는 클라이언트와 서버 간에 type을 공유할 수 있으므로 TypeScript의 type을 기반으로 하는 type-safe RPC 프레임워크가 특히 유용합니다.

이를 활용하려면 양쪽에서 사용하는 type을 별도의 파일이나 패키지로 옮겨야 합니다.

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

하위 호환성은 일반적인 로컬 API와 동일한 방식으로 구현할 수 있습니다. 새 parameter를 optional로 표시하거나 새 method를 추가하면 됩니다.

## 다음 단계

- [시작하기](./rpc/getting-started.md): 설치 및 전체 예제
- [Transport](./rpc/transport.md): WebSocket, TCP 및 사용자 정의 transport
- [오류](./rpc/errors.md) 및 [보안](./rpc/security.md)
- [벤치마크](/benchmarks): Deepkit 패키지의 성능
