# Event System

An event system allows application components within the same process to communicate by sending and listening to events. This aids in code modularization by facilitating message exchanges between functions that might not directly be aware of each other.

The application or library provides an opportunity to execute additional functions at specific points during its operation. These additional functions register themselves as what are termed "event listeners".

An event can take various forms:

- The application starts up or shuts down.
- A new user is created or deleted.
- An error is thrown.
- A new HTTP request is received.

The Deepkit Framework and its associated libraries offer a range of events that users can listen to and respond to. However, users also have the flexibility to create as many custom events as needed, allowing for modular expansion of the application.

## Usage

If you use a Deepkit app, the event system is already included and ready to use.

```typescript
import { App, onAppExecute } from '@deepkit/app';

const app = new App();

app.listen(onAppExecute, async (event) => {
    console.log('MyEvent triggered!');
});

app.run();
```

Events can be registered either by using the `listen()` method or a class using the `@eventDispatcher.listen` decorator:

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

## Event Token

At the core of Deepkit's event system are Event Tokens. These are unique objects that specify both the event ID and the type of event. An event token serves two primary purposes:

- It acts as a trigger for an event.
- It listens to the event it triggers.

When an event is initiated using an event token, that token's owner is effectively recognized as the source of the event. The token determines the data associated with the event and specifies if asynchronous event listeners can be utilized.

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

### Creating Custom Event Data:

Using `DataEventToken` from @deepkit/event:

```typescript
import { DataEventToken } from '@deepkit/event';

class User {
}

const MyEvent = new DataEventToken<User>('my-event');
```

Extending BaseEvent:

```typescript
class MyEvent extends BaseEvent {
    user: User = new User;
}

const MyEventToken = new EventToken<MyEvent>('my-event');
```

## Functional Listeners

Functional listeners allow users to register a simple function callback with the dispatcher directly. Here's how:

```typescript
app.listen(MyEvent, (event) => {
    console.log('MyEvent triggered!');
});
```

If you wish to introduce additional arguments like `logger: Logger`, they are automatically injected by the dependency injection system, thanks to Deepkit's runtime type reflection.

```typescript
app.listen(MyEvent, (event, logger: Logger) => {
    console.log('MyEvent triggered!');
});
```

Note that the first argument has to be the event itself. You can not avoid this argument.

If you use `@deepkit/app`, you can also use app.listen() to register a functional listener.

```typescript
import { App } from '@deepkit/app';

new App()
    .listen(MyEvent, (event) => {
        console.log('MyEvent triggered!');
    })
    .run();
```

## Class-based Listeners

Class listeners are classes adorned with decorators. They offer a structured way to listen to events.

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

For class listeners, dependency injection works through either the method arguments or the constructor.

## Dependency Injection

Deepkit's event system boasts a powerful dependency injection mechanism. When using functional listeners, additional arguments get automatically injected thanks to the runtime type reflection system. Similarly, class-based listeners support dependency injection through either the constructor or method arguments.

For example, in the case of a functional listener, if you add an argument like `logger: Logger`, the correct Logger instance gets automatically provided when the function gets called.

```typescript
import { App } from '@deepkit/app';
import { Logger } from '@deepkit/logger';

new App()
    .listen(MyEvent, (event, logger: Logger) => {
        console.log('MyEvent triggered!');
    })
    .run();
```

## Event Propagation

Every event object comes equipped with a stop() function, allowing you to control the propagation of the event. If an event is halted, no subsequent listeners (in the order they were added) will be executed. This provides granular control over the execution and handling of events, especially useful in scenarios where certain conditions may require the halting of event processing.

For instance:

```typescript
dispatcher.listen(MyEventToken, (event) => {
    if (someCondition) {
        event.stop();
    }
    // Further processing
});
```

With the Deepkit framework's event system, developers can create modular, scalable, and maintainable applications with ease. Understanding the event system provides the flexibility to tailor the application's behavior based on specific occurrences or conditions.

## Framework Events

Deepkit Framework itself has several events from the application server that you can listen for.

_Functional Listener_

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

| Name                        | Description                                                                                                                     |
|-----------------------------|---------------------------------------------------------------------------------------------------------------------------------|
| onServerBootstrap           | Called only once for application server bootstrap (for main process and workers).                                               |
| onServerBootstrapDone       | Called only once for application server bootstrap (for main process and workers) as soon as the application server has started. |
| onServerMainBootstrap       | Called only once for application server bootstrap (in the main process).                                                        |
| onServerMainBootstrapDone   | Called only once for application server bootstrap (in the main process) as soon as the application server has started.          |
| onServerWorkerBootstrap     | Called only once for application server bootstrap (in the worker process).                                                      |
| onServerWorkerBootstrapDone | Called only once for application server bootstrap (in the worker process) as soon as the application server has started.        |
| onServerShutdownEvent       | Called when application server shuts down (in master process and each worker).                                                  |
| onServerMainShutdown        | Called when application server shuts down in the main process.                                                                  |
| onServerWorkerShutdown      | Called when application server shuts down in the worker process.                                                                |
| onAppExecute                | When a command is about to be executed.                                                                                         |
| onAppExecuted               | When a command is successfully executed.                                                                                        |
| onAppError                  | When a command failed to execute                                                                                                |
| onAppShutdown               | When the application is about to shut down.                                                                                     |

## Low Level API

Below is an example of the low-level API from @deepkit/event. When using the Deepkit App, event listeners are not registered directly via the EventDispatcher, but rather through modules. But you can still use the low-level API if you want to.

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

### Installation

The event system is included in @deepkit/app. If you want to use it standalone, you can install it manually:

See [Event](../package/event.md) for installation instructions.
