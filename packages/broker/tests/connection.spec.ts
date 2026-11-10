import { expect, test } from '@jest/globals';

import { sleep } from '@deepkit/core';
import { RpcDirectClientAdapter } from '@deepkit/rpc';
import { typeOf } from '@deepkit/type';

import { BrokerDeepkitAdapter } from '../src/adapters/deepkit-adapter.js';
import { BrokerKernel, BrokerState } from '../src/kernel.js';
import { QueueMessageProcessing } from '../src/model.js';

function setup() {
    const kernel = new BrokerKernel();
    const state = (kernel as any).state as BrokerState;
    const adapter = () => new BrokerDeepkitAdapter({ servers: [{ url: '', transport: new RpcDirectClientAdapter(kernel) }] });
    return { state, adapter };
}

const timeOptions = { ttl: 60_000, timeout: 1000 };
const stringType = typeOf<string>();

test('a published message reaches every subscribed connection once', async () => {
    const { adapter } = setup();
    const [a, b, publisher] = [adapter(), adapter(), adapter()];
    const received: string[] = [];
    const releaseA = await a.subscribe('channel', v => received.push('a:' + v), stringType);
    await b.subscribe('channel', v => received.push('b:' + v), stringType);

    await publisher.publish('channel', 'one', stringType);
    await sleep(0.01);
    expect(received.sort()).toEqual(['a:one', 'b:one']);

    await releaseA();
    await publisher.publish('channel', 'two', stringType);
    await sleep(0.01);
    expect(received.sort()).toEqual(['a:one', 'b:one', 'b:two']);

    await Promise.all([a.disconnect(), b.disconnect(), publisher.disconnect()]);
});

test('a lock is released by its token and when its connection is gone', async () => {
    const { adapter } = setup();
    const [a, b] = [adapter(), adapter()];

    const release = await a.lock('id', timeOptions);
    expect(await b.isLocked('id')).toBe(true);
    expect(await b.tryLock('id', timeOptions)).toBe(undefined);
    await release!();
    expect(await b.isLocked('id')).toBe(false);

    await a.lock('id', timeOptions);
    expect(await b.isLocked('id')).toBe(true);
    await a.disconnect();
    await sleep(0.01);
    expect(await b.isLocked('id')).toBe(false);
    await b.disconnect();
});

test('a subscriber that is gone does not get messages anymore', async () => {
    const { state, adapter } = setup();
    const [a, publisher] = [adapter(), adapter()];
    await a.subscribe('channel', () => undefined, stringType);
    expect(state.subscriptions.get('channel')!.length).toBe(1);

    await a.disconnect();
    await sleep(0.01);
    expect(state.subscriptions.get('channel')!.length).toBe(0);
    await publisher.publish('channel', 'x', stringType);
    await publisher.disconnect();
});

test('a queue consumer gets a message, answers it and is removed when it is gone', async () => {
    const { state, adapter } = setup();
    const [consumer, producer] = [adapter(), adapter()];
    const jobType = typeOf<{ name: string }>();
    const received: string[] = [];
    await consumer.consume(
        'queue',
        async message => {
            received.push(message.data.name);
            message.state = 'done';
        },
        { maxParallel: 1 },
        jobType,
    );

    await producer.produce('queue', { name: 'job' }, jobType, { process: QueueMessageProcessing.atLeastOnce } as any);
    await sleep(0.01);
    expect(received).toEqual(['job']);
    expect(state.queues.get('queue')!.consumers[0].handling.size).toBe(0);

    await consumer.disconnect();
    await sleep(0.01);
    expect(state.queues.get('queue')!.consumers.length).toBe(0);
    await producer.disconnect();
});

test('cache invalidation reaches a client that read from the cache', async () => {
    const { adapter } = setup();
    const [a, b] = [adapter(), adapter()];
    const invalidated: string[] = [];
    a.onInvalidateCache(key => invalidated.push(key));

    await b.setCache('key', 'value', { ttl: 1000 } as any, stringType);
    expect((await a.getCache('key', stringType))!.value).toBe('value');
    await b.invalidateCache('key');
    await sleep(0.01);
    expect(invalidated).toEqual(['key']);
    expect(await a.getCache('key', stringType)).toBe(undefined);

    await Promise.all([a.disconnect(), b.disconnect()]);
});

test('binary values stored by the broker are not views on a reused read buffer', async () => {
    const { state, adapter } = setup();
    const a = adapter();
    await a.set('k', 'first', { ttl: 0 } as any, stringType);
    const stored = state.getKey('k')!;
    const bytes = [...stored];
    await a.set('other', 'second', { ttl: 0 } as any, stringType);
    expect(await a.get('k', stringType)).toBe('first');
    expect([...stored]).toEqual(bytes);
    await a.disconnect();
});

test('a large published message reaches every subscriber', async () => {
    const { adapter } = setup();
    const [a, b, publisher] = [adapter(), adapter(), adapter()];
    const received: number[] = [];
    await a.subscribe('channel', v => received.push(v.length), stringType);
    await b.subscribe('channel', v => received.push(v.length), stringType);
    await publisher.publish('channel', 'x'.repeat(2_000_000), stringType);
    for (let i = 0; i < 200 && received.length < 2; i++) await sleep(0.01);
    expect(received).toEqual([2_000_000, 2_000_000]);
    await Promise.all([a.disconnect(), b.disconnect(), publisher.disconnect()]);
});
