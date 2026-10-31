# 이벤트 시스템

이벤트 시스템은 동일한 프로세스 내의 애플리케이션 컴포넌트들이 이벤트를 보내고 수신함으로써 서로 통신할 수 있도록 합니다. 이는 서로를 직접 알지 못할 수도 있는 함수들 간의 메시지 교환을 촉진하여 코드 모듈화를 돕습니다.

애플리케이션 또는 라이브러리는 동작 중 특정 지점에서 추가 함수를 실행할 기회를 제공합니다. 이러한 추가 함수는 스스로를 "이벤트 리스너"로 등록합니다.

이벤트는 다양한 형태를 가질 수 있습니다:

- 애플리케이션이 시작하거나 종료된다.
- 새 사용자 생성 또는 삭제가 발생한다.
- 에러가 발생한다.
- 새 HTTP 요청을 수신한다.

Deepkit Framework와 연관 라이브러리는 사용자가 수신하고 반응할 수 있는 다양한 이벤트를 제공합니다. 또한 사용자는 필요한 만큼의 사용자 정의 이벤트를 생성하여 애플리케이션을 모듈식으로 확장할 수 있습니다.

## 사용법

Deepkit 앱을 사용한다면, 이벤트 시스템은 이미 포함되어 있으며 바로 사용할 수 있습니다.

```typescript
import { App, onAppExecute } from '@deepkit/app';

const app = new App();

app.listen(onAppExecute, async (event) => {
    console.log('MyEvent triggered!');
});

app.run();
```

이벤트는 `listen()` 메서드를 사용하거나 `@eventDispatcher.listen` 데코레이터를 사용하는 클래스를 통해 등록할 수 있습니다:

```typescript
import { App, onAppExecute } from '@deepkit/app';
import { eventDispatcher } from '@deepkit/event';

class MyListener {
    @eventDispatcher.listen(onAppExecute)
    onMyEvent(event: typeof onAppExecute.event) {
        console.log('MyEvent triggered!');
    }
}

const app = new App({
    listeners: [MyListener],
});
app.run();
```

## 이벤트 토큰

Deepkit의 이벤트 시스템의 핵심에는 이벤트 토큰(Event Token)이 있습니다. 이는 이벤트 ID와 이벤트의 타입을 모두 지정하는 고유한 객체입니다. 이벤트 토큰은 두 가지 주요 목적을 수행합니다:

- 이벤트를 트리거하는 역할을 한다.
- 자신이 트리거하는 이벤트를 수신한다.

이벤트 토큰을 사용하여 이벤트가 시작되면 해당 토큰의 소유자는 사실상 이벤트의 소스(발행자)로 인식됩니다. 토큰은 이벤트와 연관된 데이터를 결정하고 비동기 이벤트 리스너를 사용할 수 있는지 여부를 지정합니다.

```typescript
import { EventToken } from '@deepkit/event';

const MyEvent = new EventToken('my-event');

app.listen(MyEvent, (event) => {
    console.log('MyEvent triggered!');
});

//앱 참조를 통해 트리거
await app.dispatch(MyEvent);

//또는 EventDispatcher 사용, App의 DI 컨테이너가 자동으로 주입해줍니다
app.command('test', async (dispatcher: EventDispatcher) => {
    await dispatcher.dispatch(MyEvent);
});
```

### 사용자 정의 이벤트 데이터 생성:

@deepkit/event의 `DataEventToken` 사용:

```typescript
import { DataEventToken } from '@deepkit/event';

class User {
}

const MyEvent = new DataEventToken<User>('my-event');
```

BaseEvent 확장:

```typescript
class MyEvent extends BaseEvent {
    user: User = new User;
}

const MyEventToken = new EventToken<MyEvent>('my-event');
```

## 함수형 리스너

함수형 리스너를 사용하면 간단한 함수 콜백을 디스패처에 직접 등록할 수 있습니다. 사용 방법은 다음과 같습니다:

```typescript
app.listen(MyEvent, (event) => {
    console.log('MyEvent triggered!');
});
```

`logger: Logger`와 같은 추가 인수를 도입하고자 한다면, Deepkit의 런타임 타입 리플렉션 덕분에 의존성 주입 시스템이 자동으로 주입합니다.

```typescript
app.listen(MyEvent, (event, logger: Logger) => {
    console.log('MyEvent triggered!');
});
```

첫 번째 인수는 반드시 이벤트 자체여야 합니다. 이 인수는 생략할 수 없습니다.

`@deepkit/app`를 사용한다면 app.listen()을 통해 함수형 리스너를 등록할 수도 있습니다.

```typescript
import { App } from '@deepkit/app';

new App()
    .listen(MyEvent, (event) => {
        console.log('MyEvent triggered!');
    })
    .run();
```

## 클래스 기반 리스너

클래스 리스너는 데코레이터로 장식된 클래스입니다. 이는 이벤트를 수신하는 구조화된 방법을 제공합니다.

```typescript
import { App } from '@deepkit/app';

class MyListener {
    @eventDispatcher.listen(UserAdded)
    onUserAdded(event: typeof UserAdded.event) {
        console.log('User added!', event.user.username);
    }
}

new App({
    listeners: [MyListener],
}).run();
```

클래스 리스너의 경우, 의존성 주입은 메서드 인수나 생성자를 통해 동작합니다.

## 의존성 주입

Deepkit의 이벤트 시스템은 강력한 의존성 주입 메커니즘을 제공합니다. 함수형 리스너를 사용할 때는 런타임 타입 리플렉션 시스템 덕분에 추가 인수가 자동으로 주입됩니다. 마찬가지로 클래스 기반 리스너도 생성자나 메서드 인수를 통해 의존성 주입을 지원합니다.

예를 들어, 함수형 리스너의 경우 `logger: Logger`와 같은 인수를 추가하면 함수가 호출될 때 적절한 Logger 인스턴스가 자동으로 제공됩니다.

```typescript
import { App } from '@deepkit/app';
import { Logger } from '@deepkit/logger';

new App()
    .listen(MyEvent, (event, logger: Logger) => {
        console.log('MyEvent triggered!');
    })
    .run();
```

## 이벤트 전파

모든 이벤트 객체에는 stop() 함수가 함께 제공되어 이벤트의 전파를 제어할 수 있습니다. 이벤트가 중단되면(추가된 순서상) 이후의 리스너는 실행되지 않습니다. 이는 특정 조건에서 이벤트 처리를 중단해야 하는 상황에 특히 유용하며, 이벤트의 실행과 처리에 대한 세밀한 제어를 제공합니다.

예:

```typescript
dispatcher.listen(MyEventToken, (event) => {
    if (someCondition) {
        event.stop();
    }
    // 추가 처리
});
```

Deepkit 프레임워크의 이벤트 시스템을 통해 개발자는 모듈식이고 확장 가능하며 유지 보수가 쉬운 애플리케이션을 손쉽게 만들 수 있습니다. 이벤트 시스템을 이해하면 특정 발생이나 조건에 따라 애플리케이션의 동작을 유연하게 조정할 수 있습니다.

## 프레임워크 이벤트

Deepkit Framework 자체에는 수신할 수 있는 애플리케이션 서버의 여러 이벤트가 있습니다.

_함수형 리스너_

```typescript
import { onServerMainBootstrap } from '@deepkit/framework';
import { onAppExecute } from '@deepkit/app';

new App({
    imports: [new FrameworkModule]
})
    .listen(onAppExecute, (event) => {
        console.log('Command about to execute');
    })
    .listen(onServerMainBootstrap, (event) => {
        console.log('Server started');
    })
    .run();
```

| 이름                        | 설명                                                                                                 |
|-----------------------------|------------------------------------------------------------------------------------------------------|
| onServerBootstrap           | 애플리케이션 서버 부트스트랩 시 한 번만 호출됨(메인 프로세스 및 워커 모두).                         |
| onServerBootstrapDone       | 애플리케이션 서버가 시작되는 즉시, 애플리케이션 서버 부트스트랩에 대해 한 번만 호출됨(메인/워커).   |
| onServerMainBootstrap       | 애플리케이션 서버 부트스트랩 시 한 번만 호출됨(메인 프로세스).                                       |
| onServerMainBootstrapDone   | 애플리케이션 서버가 시작되는 즉시, 애플리케이션 서버 부트스트랩에 대해 한 번만 호출됨(메인 프로세스).|
| onServerWorkerBootstrap     | 애플리케이션 서버 부트스트랩 시 한 번만 호출됨(워커 프로세스).                                       |
| onServerWorkerBootstrapDone | 애플리케이션 서버가 시작되는 즉시, 애플리케이션 서버 부트스트랩에 대해 한 번만 호출됨(워커 프로세스).|
| onServerShutdownEvent       | 애플리케이션 서버가 종료될 때 호출됨(마스터 프로세스 및 각 워커).                                    |
| onServerMainShutdown        | 메인 프로세스에서 애플리케이션 서버가 종료될 때 호출됨.                                             |
| onServerWorkerShutdown      | 워커 프로세스에서 애플리케이션 서버가 종료될 때 호출됨.                                             |
| onAppExecute                | 명령이 실행되기 직전.                                                                                |
| onAppExecuted               | 명령이 성공적으로 실행되었을 때.                                                                     |
| onAppError                  | 명령 실행에 실패했을 때                                                                              |
| onAppShutdown               | 애플리케이션이 종료되기 직전.                                                                        |

## 저수준 API

아래는 @deepkit/event에서 제공하는 저수준 API의 예시입니다. Deepkit App을 사용할 때는 이벤트 리스너가 EventDispatcher를 통해 직접 등록되지 않고 모듈을 통해 등록됩니다. 하지만 원한다면 저수준 API를 그대로 사용할 수도 있습니다.

```typescript
import { EventDispatcher, EventToken } from '@deepkit/event';

//첫 번째 인수는 의존성 주입을 위한 의존성 해결을 수행하기 위한 인젝터 컨텍스트일 수 있습니다
const dispatcher = new EventDispatcher();
const MyEvent = new EventToken('my-event');

dispatcher.listen(MyEvent, (event) => {
    console.log('MyEvent triggered!');
});
dispatcher.dispatch(MyEvent);

```

### 설치

이벤트 시스템은 @deepkit/app에 포함되어 있습니다. 단독으로 사용하려면 수동으로 설치할 수 있습니다:

설치 방법은 [이벤트](../package/event.md)를 참고하세요.