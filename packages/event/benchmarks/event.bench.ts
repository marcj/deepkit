/**
 * Deepkit Framework
 * Copyright (C) 2021 Deepkit UG, Marc J. Schmidt
 *
 * This program is free software: you can redistribute it and/or modify
 * it under the terms of the MIT License.
 *
 * You should have received a copy of the MIT License along with this program.
 */
import { BenchSuite } from '@deepkit/bench';
import { BaseEvent, DataEvent, EventDispatcher, EventToken, EventTokenSync } from '@deepkit/event';

/**
 * Event system benchmark - tests Deepkit's EventDispatcher performance
 *
 * This benchmark tests:
 * - Event emission with sync listeners
 * - Event emission with async listeners
 * - Multiple listeners on same event
 * - Pre-compiled dispatcher performance
 * - DataEvent with payload
 */

// Define event tokens for benchmarking
const onSimpleEvent = new EventToken('benchmark.simple');
const onSyncEvent = new EventTokenSync('benchmark.sync');
const onDataEvent = new EventToken<DataEvent<{ value: number }>>('benchmark.data');
const onMultiListenerEvent = new EventToken('benchmark.multi');

export default async function () {
    const suite = new BenchSuite('event/dispatcher');

    // Test 1: Sync event with single listener
    {
        const dispatcher = new EventDispatcher();
        let counter = 0;
        dispatcher.listen(onSyncEvent, () => {
            counter++;
        });

        suite.add('sync event - single listener', () => {
            dispatcher.dispatch(onSyncEvent);
        });
    }

    // Test 2: Sync event with no listeners (noop case)
    {
        const dispatcher = new EventDispatcher();

        suite.add('sync event - no listeners', () => {
            dispatcher.dispatch(onSyncEvent);
        });
    }

    // Test 3: Async event with single listener
    {
        const dispatcher = new EventDispatcher();
        let counter = 0;
        dispatcher.listen(onSimpleEvent, () => {
            counter++;
        });

        suite.add('async event - single sync listener', async () => {
            await dispatcher.dispatch(onSimpleEvent);
        });
    }

    // Test 4: Async event with async listener
    {
        const dispatcher = new EventDispatcher();
        let counter = 0;
        dispatcher.listen(onSimpleEvent, async () => {
            counter++;
        });

        suite.add('async event - single async listener', async () => {
            await dispatcher.dispatch(onSimpleEvent);
        });
    }

    // Test 5: Multiple listeners (10 listeners)
    {
        const dispatcher = new EventDispatcher();
        let counter = 0;
        for (let i = 0; i < 10; i++) {
            dispatcher.listen(onMultiListenerEvent, () => {
                counter++;
            });
        }

        suite.add('async event - 10 listeners', async () => {
            await dispatcher.dispatch(onMultiListenerEvent);
        });
    }

    // Test 6: DataEvent with payload
    {
        const dispatcher = new EventDispatcher();
        let sum = 0;
        dispatcher.listen(onDataEvent, event => {
            sum += event.data.value;
        });

        suite.add('data event - with payload', async () => {
            await dispatcher.dispatch(onDataEvent, { value: 42 });
        });
    }

    // Test 7: Pre-compiled dispatcher (getDispatcher pattern)
    {
        const dispatcher = new EventDispatcher();
        let counter = 0;
        dispatcher.listen(onSyncEvent, () => {
            counter++;
        });
        const dispatch = dispatcher.getDispatcher(onSyncEvent);

        suite.add('sync event - pre-compiled dispatcher', () => {
            dispatch();
        });
    }

    // Test 8: Event with stopImmediatePropagation
    {
        const dispatcher = new EventDispatcher();
        let counter = 0;
        dispatcher.listen(onSyncEvent, event => {
            counter++;
            event.stopImmediatePropagation();
        });
        dispatcher.listen(onSyncEvent, () => {
            counter++; // Should never be called
        });

        suite.add('sync event - with propagation stop', () => {
            dispatcher.dispatch(onSyncEvent, new BaseEvent());
        });
    }

    // Test 9: Creating new dispatcher and adding listener (setup cost)
    {
        suite.add('dispatcher creation + listener add', () => {
            const dispatcher = new EventDispatcher();
            dispatcher.listen(onSimpleEvent, () => {});
        });
    }

    return suite;
}
