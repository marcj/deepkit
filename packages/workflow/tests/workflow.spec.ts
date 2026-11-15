import { expect, test } from '@jest/globals';
import { createWorkflow, WorkflowEvent } from '../src/workflow.js';
import { eventDispatcher, EventDispatcher, EventToken } from '@deepkit/event';
import { InjectorContext, InjectorModule } from '@deepkit/injector';
import { Stopwatch } from '@deepkit/stopwatch';

class EndEvent extends WorkflowEvent {
    test: string = 'hi';
}

const workflow1 = createWorkflow('myFlow', {
    start: WorkflowEvent,
    doIt: WorkflowEvent,
    failed: WorkflowEvent,
    success: WorkflowEvent,
    end: EndEvent,
}, {
    start: 'doIt',
    doIt: ['failed', 'success'],
    success: 'end',
    failed: 'end'
});

test('workflow', async () => {
    expect(workflow1.onDoIt).toBeInstanceOf(EventToken);

    const w = workflow1.create('start', new EventDispatcher(), new Stopwatch());
    expect(w.state.get()).toBe('start');
    expect(w.isDone()).toBe(false);

    expect(w.can('doIt')).toBe(true);
    expect(w.can('failed')).toBe(false);
    expect(w.can('success')).toBe(false);
    expect(w.can('end')).toBe(false);

    await expect(w.apply('success')).rejects.toThrow('Can not apply state change from start->success');

    await w.apply('doIt');
    expect(w.state.get()).toBe('doIt');
    expect(w.isDone()).toBe(false);

    expect(w.can('doIt')).toBe(false);
    expect(w.can('failed')).toBe(true);
    expect(w.can('success')).toBe(true);
    expect(w.can('end')).toBe(false);
    expect(w.isDone()).toBe(false);

    await w.apply('success');
    await expect(w.apply('end')).rejects.toThrow('State end got the wrong event. Expected EndEvent, got WorkflowEvent');
    await w.apply('end', new EndEvent());

    expect(w.isDone()).toBe(true);
    expect(w.state.get()).toBe('end');
});

test('workflow events', async () => {
    const dispatcher = new EventDispatcher(InjectorContext.forProviders([]));
    const w = workflow1.create('start', dispatcher, new Stopwatch());

    let called = false;
    dispatcher.listen(workflow1.onDoIt, async () => {
        called = true;
    });

    await w.apply('doIt');

    expect(called).toBe(true);
    expect(w.state.get()).toBe('doIt');
});

test('workflow events listener', async () => {
    let called = false;

    class Listener {
        @eventDispatcher.listen(workflow1.onDoIt)
        onDoIt() {
            called = true;
        }
    }

    const module = new InjectorModule([Listener]);
    const dispatcher = new EventDispatcher(new InjectorContext(module));
    const w = workflow1.create('start', dispatcher, new Stopwatch());

    dispatcher.registerListener(Listener, module);

    await w.apply('doIt');

    expect(called).toBe(true);
    expect(w.state.get()).toBe('doIt');
});

test('workflow events apply next', async () => {
    const dispatcher = new EventDispatcher(InjectorContext.forProviders([]));
    const w = workflow1.create('start', dispatcher, new Stopwatch());

    let endCalled = false;
    dispatcher.listen(workflow1.onDoIt, async (event) => {
        event.next('success');
    });

    dispatcher.listen(workflow1.onSuccess, async (event) => {
        event.next('end', new EndEvent());
    });

    dispatcher.listen(workflow1.onEnd, async (event) => {
        expect(event.test).toBe('hi');
        endCalled = true;
    });

    await w.apply('doIt');

    expect(w.state.get()).toBe('end');
    expect(endCalled).toBe(true);
});

test('workflow events apply next invalid', async () => {
    const dispatcher = new EventDispatcher(InjectorContext.forProviders([]));
    const w = workflow1.create('start', dispatcher, new Stopwatch());

    dispatcher.listen(workflow1.onDoIt, async (event) => {
        event.next('end');
    });

    await expect(w.apply('doIt')).rejects.toThrow('Can not apply state change from doIt->end');
});

test('workflow events apply injector', async () => {
    class MyService {
        data: string = 'myData';
    }

    class Listener {
        constructor(private myService: MyService) {
        }

        @eventDispatcher.listen(workflow1.onDoIt)
        onDoIt() {
            expect(this.myService).toBeInstanceOf(MyService);
            this.myService.data = 'changedData';
        }
    }

    const module = new InjectorModule([MyService, Listener]);
    const context = new InjectorContext(module);
    const dispatcher = new EventDispatcher(context);
    const w = workflow1.create('start', dispatcher, new Stopwatch());

    dispatcher.registerListener(Listener, module);
    await w.apply('doIt');

    expect(context.get(MyService).data).toBe('changedData');
});

test('sync listeners run without a promise, async listeners continue the remaining listeners and states', async () => {
    const dispatcher = new EventDispatcher(InjectorContext.forProviders([]));
    const calls: string[] = [];
    dispatcher.listen(workflow1.onDoIt, () => {
        calls.push('doIt sync 1');
    }, 1);
    dispatcher.listen(workflow1.onDoIt, async (event) => {
        await new Promise(resolve => setTimeout(resolve, 1));
        calls.push('doIt async 2');
        event.next('success');
    }, 2);
    dispatcher.listen(workflow1.onDoIt, () => {
        calls.push('doIt sync 3');
    }, 3);
    dispatcher.listen(workflow1.onSuccess, (event) => {
        calls.push('success');
        event.next('end', new EndEvent());
    });
    dispatcher.listen(workflow1.onEnd, () => {
        calls.push('end');
    });

    const w = workflow1.create('start', dispatcher, new Stopwatch());
    const result = w.applyMaybeSync('doIt');
    expect(result).toBeInstanceOf(Promise);
    expect(calls).toEqual(['doIt sync 1']);
    await result;
    expect(calls).toEqual(['doIt sync 1', 'doIt async 2', 'doIt sync 3', 'success', 'end']);
    expect(w.state.get()).toBe('end');

    const syncDispatcher = new EventDispatcher(InjectorContext.forProviders([]));
    syncDispatcher.listen(workflow1.onDoIt, (event) => event.next('failed'));
    const w2 = workflow1.create('start', syncDispatcher, new Stopwatch());
    expect(w2.applyMaybeSync('doIt')).toBe(undefined);
    expect(w2.state.get()).toBe('failed');

    // apply() keeps returning a promise, also for errors of synchronous listeners
    const throwing = new EventDispatcher(InjectorContext.forProviders([]));
    throwing.listen(workflow1.onDoIt, () => {
        throw new Error('listener failed');
    });
    const w3 = workflow1.create('start', throwing, new Stopwatch());
    const applied = w3.apply('doIt');
    expect(applied).toBeInstanceOf(Promise);
    await expect(applied).rejects.toThrow('listener failed');
});

test('stopImmediatePropagation skips the remaining listeners after an async listener', async () => {
    const dispatcher = new EventDispatcher(InjectorContext.forProviders([]));
    const calls: string[] = [];
    dispatcher.listen(workflow1.onDoIt, async (event) => {
        await Promise.resolve();
        calls.push('first');
        event.stopImmediatePropagation();
    }, 1);
    dispatcher.listen(workflow1.onDoIt, () => {
        calls.push('second');
    }, 2);
    const w = workflow1.create('start', dispatcher, new Stopwatch());
    await w.apply('doIt');
    expect(calls).toEqual(['first']);
    expect(w.state.get()).toBe('doIt');
});
