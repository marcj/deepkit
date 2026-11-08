import { expect, test } from '@jest/globals';
import { BehaviorSubject, Subject, firstValueFrom } from 'rxjs';

import { sleep } from '@deepkit/core';

import { DirectClient } from '../src/client/client-direct.js';
import { rpc } from '../src/decorators.js';
import { RpcKernel } from '../src/server/kernel.js';

//https://github.com/marcj/deepkit/issues/728
function setup() {
    const prices = new Subject<number>();

    class PriceController {
        @rpc.action()
        updates(): Subject<number> {
            return prices;
        }
    }

    const kernel = new RpcKernel();
    kernel.registerController(PriceController, 'prices');
    const controller = new DirectClient(kernel).controller<PriceController>('prices');
    return { prices, controller };
}

test('control: unsubscribing the client Subject removes the server observer', async () => {
    const { prices, controller } = setup();
    const updates = await controller.updates();
    expect(prices.observed).toBe(true);

    updates.unsubscribe();
    await sleep(0.05);
    expect(prices.observed).toBe(false);
});

test('unsubscribing the last subscriber removes the server observer', async () => {
    const { prices, controller } = setup();
    const updates = await controller.updates();
    const subscription = updates.subscribe();
    expect(prices.observed).toBe(true);

    subscription.unsubscribe();
    await sleep(0.05);
    expect(prices.observed).toBe(false);
});

//Not part of the report: what auto-teardown would have to preserve.
test('control: subscribing again after the last unsubscribe still receives values', async () => {
    const { prices, controller } = setup();
    const updates = await controller.updates();
    updates.subscribe().unsubscribe();
    await sleep(0.05);

    const received: number[] = [];
    updates.subscribe(v => received.push(v));
    await sleep(0.05);
    prices.next(7);
    await sleep(0.05);
    expect(received).toEqual([7]);
});

test('the server observer stays while another subscriber is left', async () => {
    const { prices, controller } = setup();
    const updates = await controller.updates();
    const first = updates.subscribe();
    const received: number[] = [];
    updates.subscribe(v => received.push(v));

    first.unsubscribe();
    await sleep(0.05);
    expect(prices.observed).toBe(true);
    prices.next(1);
    await sleep(0.05);
    expect(received).toEqual([1]);
});

test('a new subscriber attaches the server observer again', async () => {
    const { prices, controller } = setup();
    const updates = await controller.updates();
    updates.subscribe().unsubscribe();
    await sleep(0.05);
    expect(prices.observed).toBe(false);

    const subscription = updates.subscribe();
    await sleep(0.05);
    expect(prices.observed).toBe(true);
    expect(prices.observers.length).toBe(1);

    subscription.unsubscribe();
    await sleep(0.05);
    expect(prices.observed).toBe(false);
});

test('a source completed during a pause completes the next subscriber', async () => {
    const { prices, controller } = setup();
    const updates = await controller.updates();
    updates.subscribe().unsubscribe();
    await sleep(0.05);

    prices.complete();
    let completed = false;
    updates.subscribe({ complete: () => (completed = true) });
    await sleep(0.05);
    expect(completed).toBe(true);
});

test('first() can be used repeatedly', async () => {
    const { prices, controller } = setup();
    const updates = await controller.updates();

    for (const value of [1, 2]) {
        const next = firstValueFrom(updates);
        await sleep(0.05);
        expect(prices.observed).toBe(true);
        prices.next(value);
        expect(await next).toBe(value);
        await sleep(0.05);
        expect(prices.observed).toBe(false);
    }
});

test('control: completing the client Subject after a pause does not fail', async () => {
    const { prices, controller } = setup();
    const updates = await controller.updates();
    updates.subscribe().unsubscribe();
    await sleep(0.05);
    updates.complete();
    await sleep(0.05);
    expect(prices.observed).toBe(false);
});

test('control: a BehaviorSubject keeps its server observer, because its value stays live', async () => {
    const price = new BehaviorSubject<number>(1);

    class PriceController {
        @rpc.action()
        current(): BehaviorSubject<number> {
            return price;
        }
    }

    const kernel = new RpcKernel();
    kernel.registerController(PriceController, 'prices');
    const controller = new DirectClient(kernel).controller<PriceController>('prices');

    const current = await controller.current();
    current.subscribe().unsubscribe();
    await sleep(0.05);
    expect(price.observed).toBe(true);
    price.next(2);
    await sleep(0.05);
    expect(current.value).toBe(2);
    current.unsubscribe();
});

test('unsubscribing and subscribing after the connection closed does not throw', async () => {
    const prices = new Subject<number>();

    class PriceController {
        @rpc.action()
        updates(): Subject<number> {
            return prices;
        }
    }

    const kernel = new RpcKernel();
    kernel.registerController(PriceController, 'prices');
    const client = new DirectClient(kernel);
    const controller = client.controller<PriceController>('prices');

    const updates = await controller.updates();
    const subscription = updates.subscribe({ error: () => undefined });
    await client.disconnect();
    await sleep(0.05);

    expect(() => subscription.unsubscribe()).not.toThrow();
    expect(() => updates.subscribe({ error: () => undefined }).unsubscribe()).not.toThrow();
    expect(prices.observed).toBe(false);
});

test('a dropped Subject is collected after its last unsubscribe', async () => {
    const prices = new Subject<number>();

    class PriceController {
        @rpc.action()
        updates(): Subject<number> {
            return prices;
        }
    }

    const kernel = new RpcKernel();
    kernel.registerController(PriceController, 'prices');
    const controller = new DirectClient(kernel).controller<PriceController>('prices');

    //in its own function, so the frame of this test doesn't hold the last Subject
    async function subscribeOnce() {
        const updates = await controller.updates();
        updates.subscribe().unsubscribe();
    }

    for (let i = 0; i < 100; i++) await subscribeOnce();

    await sleep(0.1);
    (gc as any)();
    await sleep(0.1);
    (gc as any)();
    await sleep(0.1);

    expect(kernel.stats.total.subjects).toBe(100);
    expect(kernel.stats.active.subjects).toBe(0);
});
