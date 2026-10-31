import { afterEach, expect, jest, test } from '@jest/globals';

import { MongoClient } from '../../src/client/client.js';

afterEach(() => {
    jest.useRealTimers();
});

async function flush() {
    for (let i = 0; i < 10; i++) await Promise.resolve();
}

test('heartbeat keeps running when its timer fires a millisecond early', async () => {
    const start = 1_000_000;
    jest.useFakeTimers({ now: start });
    const client = new MongoClient('mongodb://127.0.0.1:1?heartbeatFrequencyMS=1000');
    // no hosts, so no sockets: only the scheduling of the heartbeats is tested
    client.config.getHosts = async () => [];

    client.pool.heartbeat(true);
    await flush();
    expect(client.stats.heartbeats).toBe(1);

    // setTimeout fires by the monotonic clock, Date.now() can be a millisecond behind
    jest.setSystemTime(start - 1);
    jest.advanceTimersByTime(1000);
    await flush();
    expect(Date.now() - start).toBeLessThan(1000);
    expect(client.stats.heartbeats).toBe(2);

    jest.advanceTimersByTime(1000);
    await flush();
    expect(client.stats.heartbeats).toBe(3);

    client.close();
    jest.advanceTimersByTime(5000);
    await flush();
    expect(client.stats.heartbeats).toBe(3);
});
