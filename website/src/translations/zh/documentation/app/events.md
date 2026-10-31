# 事件系统

事件系统允许同一进程内的应用组件通过发送和监听事件进行通信。这通过促进可能彼此并不直接知晓的函数之间的消息交换来帮助代码模块化。

应用程序或库在其运行过程中的特定时刻提供执行额外函数的机会。这些额外函数将自己注册为“事件监听器”。

事件可以有多种形式：

- 应用程序启动或关闭。
- 新用户被创建或删除。
- 抛出错误。
- 收到新的 HTTP 请求。

Deepkit Framework 及其相关库提供了一系列事件，用户可以监听并作出响应。此外，用户也可以灵活地创建任意数量的自定义事件，从而以模块化方式扩展应用。

## 用法

如果你使用 Deepkit 应用，事件系统已包含且可直接使用。

```typescript
import { App, onAppExecute } from '@deepkit/app';

const app = new App();

app.listen(onAppExecute, async (event) => {
    console.log('MyEvent triggered!');
});

app.run();
```

可以使用 `listen()` 方法注册事件，或使用带有 `@eventDispatcher.listen` 装饰器的类注册：

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

## 事件令牌

Deepkit 事件系统的核心是事件令牌（Event Token）。它们是指定事件 ID 和事件类型的唯一对象。事件令牌有两个主要用途：

- 作为事件的触发器。
- 监听它所触发的事件。

当使用事件令牌启动事件时，该令牌的所有者被有效地视为事件的来源。令牌决定与事件关联的数据，并指定是否可以使用异步事件监听器。

```typescript
import { EventToken } from '@deepkit/event';

const MyEvent = new EventToken('my-event');

app.listen(MyEvent, (event) => {
    console.log('MyEvent triggered!');
});

//trigger via app reference
await app.dispatch(MyEvent);

//or use the EventDispatcher, App's DI container injects it automatically
app.command('test', async (dispatcher: EventDispatcher) => {
    await dispatcher.dispatch(MyEvent);
});
```

### 创建自定义事件数据：

使用来自 @deepkit/event 的 `DataEventToken`：

```typescript
import { DataEventToken } from '@deepkit/event';

class User {
}

const MyEvent = new DataEventToken<User>('my-event');
```

扩展 BaseEvent：

```typescript
class MyEvent extends BaseEvent {
    user: User = new User;
}

const MyEventToken = new EventToken<MyEvent>('my-event');
```

## 函数式监听器

函数式监听器允许用户直接向调度器注册一个简单的函数回调。如下所示：

```typescript
app.listen(MyEvent, (event) => {
    console.log('MyEvent triggered!');
});
```

如果你希望引入额外的参数，比如 `logger: Logger`，它们会由于 Deepkit 的运行时类型反射而由依赖注入系统自动注入。

```typescript
app.listen(MyEvent, (event, logger: Logger) => {
    console.log('MyEvent triggered!');
});
```

请注意，第一个参数必须是事件本身。你不能省略这个参数。

如果你使用 `@deepkit/app`，也可以使用 app.listen() 来注册函数式监听器。

```typescript
import { App } from '@deepkit/app';

new App()
    .listen(MyEvent, (event) => {
        console.log('MyEvent triggered!');
    })
    .run();
```

## 基于类的监听器

类监听器是带有装饰器的类。它们为监听事件提供一种结构化的方式。

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

对于类监听器，依赖注入可通过方法参数或构造函数来实现。

## 依赖注入

Deepkit 的事件系统拥有强大的依赖注入机制。在使用函数式监听器时，额外的参数会由于运行时类型反射系统而被自动注入。同样，基于类的监听器也支持通过构造函数或方法参数进行依赖注入。

例如，在函数式监听器的情况下，如果你添加一个类似 `logger: Logger` 的参数，当函数被调用时会自动提供正确的 Logger 实例。

```typescript
import { App } from '@deepkit/app';
import { Logger } from '@deepkit/logger';

new App()
    .listen(MyEvent, (event, logger: Logger) => {
        console.log('MyEvent triggered!');
    })
    .run();
```

## 事件传播

每个事件对象都配备了一个 stop() 函数，允许你控制事件的传播。如果事件被停止，则不会执行之后注册（按添加顺序）的监听器。这为事件的执行和处理提供了精细的控制，特别适用于某些条件可能需要停止事件处理的场景。

例如：

```typescript
dispatcher.listen(MyEventToken, (event) => {
    if (someCondition) {
        event.stop();
    }
    // Further processing
});
```

借助 Deepkit 框架的事件系统，开发者可以轻松创建模块化、可扩展且可维护的应用程序。理解事件系统能够让你根据特定的发生情况或条件来灵活定制应用程序行为。

## 框架事件

Deepkit Framework 本身具有来自应用服务器的多个事件，你可以监听这些事件。

_函数式监听器_

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

| 名称                        | 描述                                                                                                                             |
|-----------------------------|----------------------------------------------------------------------------------------------------------------------------------|
| onServerBootstrap           | 仅在应用服务器引导时调用一次（主进程和工作进程）。                                                                               |
| onServerBootstrapDone       | 仅在应用服务器引导时调用一次（主进程和工作进程），一旦应用服务器已启动。                                                         |
| onServerMainBootstrap       | 仅在应用服务器引导时调用一次（在主进程）。                                                                                       |
| onServerMainBootstrapDone   | 仅在应用服务器引导时调用一次（在主进程），一旦应用服务器已启动。                                                                 |
| onServerWorkerBootstrap     | 仅在应用服务器引导时调用一次（在工作进程）。                                                                                     |
| onServerWorkerBootstrapDone | 仅在应用服务器引导时调用一次（在工作进程），一旦应用服务器已启动。                                                               |
| onServerShutdownEvent       | 当应用服务器关闭时调用（在主进程和每个工作进程）。                                                                               |
| onServerMainShutdown        | 当应用服务器在主进程关闭时调用。                                                                                                 |
| onServerWorkerShutdown      | 当应用服务器在工作进程关闭时调用。                                                                                               |
| onAppExecute                | 即将执行命令时。                                                                                                                 |
| onAppExecuted               | 当命令成功执行时。                                                                                                               |
| onAppError                  | 当命令执行失败时。                                                                                                               |
| onAppShutdown               | 当应用程序即将关闭时。                                                                                                           |

## 底层 API

下面是来自 @deepkit/event 的底层 API 示例。使用 Deepkit 应用时，事件监听器不是直接通过 EventDispatcher 注册，而是通过模块注册。但如果你愿意，仍然可以使用底层 API。

```typescript
import { EventDispatcher, EventToken } from '@deepkit/event';

//first argument can be a injector context to resolve dependencies for dependency injection
const dispatcher = new EventDispatcher();
const MyEvent = new EventToken('my-event');

dispatcher.listen(MyEvent, (event) => {
    console.log('MyEvent triggered!');
});
dispatcher.dispatch(MyEvent);

```

### 安装

事件系统已包含在 @deepkit/app 中。如果你想单独使用，可以手动安装：

有关安装说明，请参见[事件](../package/event.md)。