# 스코프

기본적으로 DI container의 모든 provider는 singleton이며 따라서 한 번만 인스턴스화됩니다. 이는 UserRepository 예시에서 전체 런타임 동안 항상 하나의 UserRepository instance만 존재함을 의미합니다. 사용자가 "new" 키워드로 수동으로 생성하지 않는 한 어떤 시점에서도 두 번째 instance가 생성되지 않습니다.

하지만 provider가 짧은 시간 동안만 또는 특정 이벤트 동안만 인스턴스화되어야 하는 다양한 사용 사례가 있습니다. 그러한 이벤트는 예를 들어 HTTP request나 RPC call일 수 있습니다. 이는 각 이벤트마다 새 instance가 생성되고, 더 이상 사용되지 않으면 자동으로 제거됨(garbage collector에 의해)을 의미합니다.

HTTP request는 scope의 대표적인 예입니다. 예를 들어 session, user 객체 또는 기타 request 관련 provider를 이 scope에 등록할 수 있습니다. scope를 생성하려면 임의의 scope 이름을 선택한 다음 provider에 이를 지정하면 됩니다.

```typescript
import { InjectorContext } from '@deepkit/injector';

class UserSession {}

const injector = InjectorContext.forProviders([
    {provide: UserSession, scope: 'http'}
]);
```

한 번 scope가 지정되면 이 provider는 DI container에서 직접 획득할 수 없으므로 다음 호출은 실패합니다:

```typescript
const session = injector.get(UserSession); //예외 발생
```

대신 scoped DI container를 생성해야 합니다. 이는 매번 HTTP request가 들어올 때 발생합니다:

```typescript
const httpScope = injector.createChildScope('http');
```

이 scope에 등록된 provider뿐 아니라 scope를 정의하지 않은 모든 provider도 이제 이 scoped DI container에서 요청할 수 있습니다.

```typescript
const session = httpScope.get(UserSession); //동작함
```

모든 provider는 기본적으로 singleton이므로, `get(UserSession)`을 각 scoped container에서 호출할 때마다 항상 동일한 instance가 반환됩니다. 여러 scoped container를 생성하면 여러 개의 UserSession이 생성됩니다.

scoped DI container는 외부에서 값을 동적으로 설정할 수 있습니다. 예를 들어 HTTP scope에서는 HttpRequest와 HttpResponse 객체를 쉽게 설정할 수 있습니다.

```typescript
const injector = InjectorContext.forProviders([
    {provide: HttpResponse, scope: 'http'},
    {provide: HttpRequest, scope: 'http'},
]);

httpServer.on('request', (req, res) => {
    const httpScope = injector.createChildScope('http');
    httpScope.set(HttpRequest, req);
    httpScope.set(HttpResponse, res);
});
```

Deepkit framework를 사용하는 애플리케이션에는 기본적으로 `http`, `rpc`, 그리고 `cli` scope가 있습니다. 각각 [CLI](../app.md), [HTTP](../http.md), 또는 [RPC](../rpc.md) 장을 참고하세요.