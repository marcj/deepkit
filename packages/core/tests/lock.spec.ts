import { jest, expect, test, beforeAll } from '@jest/globals';
import { Mutex, ProcessLock, ProcessLocker } from '../src/process-locker.js';

jest.setTimeout(20000);

let locker: ProcessLocker;

beforeAll(async () => {
    locker = new ProcessLocker();
});


test('test lock competing', async () => {
    const started = +new Date;
    const lock1 = await locker.acquireLock('test-lock1', 2);

    const lock2 = await locker.acquireLock('test-lock1', 1);
    // timers run on a monotonic clock, measured with Date the 2s timeout can end a millisecond early
    expect(+new Date - started).toBeGreaterThanOrEqual(1990);
});

test('test lock early release', async () => {
    const started = +new Date;
    const lock1 = await locker.acquireLock('test-early-lock1', 2);
    setTimeout(async () => {
        await lock1.unlock();
    }, 500);

    const lock2 = await locker.acquireLock('test-early-lock1', 1);
    expect(+new Date - started).toBeLessThan(1000);
    expect(+new Date - started).toBeGreaterThan(498);
});

test('test lock timeout', async () => {
    const started = +new Date;
    const lock1 = await locker.acquireLock('test-early-lock2', 2);
    setTimeout(async () => {
        await lock1.unlock();
    }, 500);

    const lock2 = await locker.acquireLock('test-early-lock2', 1);
    expect(+new Date - started).toBeLessThan(1000);
    expect(+new Date - started).toBeGreaterThan(498);
});

test('test lock timeout accum', async () => {
    const start = Date.now();
    const lock1 = await locker.acquireLock('test-timeout-lock1', 1);
    // console.log('took', (Date.now() - start));

    const lock2 = await locker.acquireLock('test-timeout-lock1', 1);
    console.log('took', (Date.now() - start));
    expect((Date.now() - start) / 1000).toBeGreaterThan(0.9);

    const lock3 = await locker.acquireLock('test-timeout-lock1', 1);
    console.log('took', (Date.now() - start));
    expect((Date.now() - start) / 1000).toBeGreaterThan(1.9);
});

// test('test performance', async () => {
//     const start = performance.now();
//
//     const count = 2000;
//     for (let i = 0; i < count; i++) {
//         const lock1 = await locker.acquireLock('test-perf');
//         await lock1.unlock();
//     }
//
//     console.log(count, 'locks took', performance.now() - start, (performance.now() - start) / count);
//
//     // expect(performance.now() - start).toBeLessThan(100);
// });

test('test tryLock', async () => {
    const lock1 = await locker.acquireLock('trylock', 1);
    expect(lock1).toBeInstanceOf(ProcessLock);

    const lock2 = await locker.tryLock('trylock', 1);
    expect(lock2).toBeUndefined();
    expect(await locker.isLocked('trylock')).toBe(true);

    await new Promise((resolve) => {
        setTimeout(async () => {
            expect(await locker.isLocked('trylock')).toBe(false);
            const lock3 = await locker.tryLock('trylock', 1);
            expect(lock3).toBeInstanceOf(ProcessLock);
            expect(await locker.isLocked('trylock')).toBe(true);

            setTimeout(async () => {
                expect(await locker.isLocked('trylock')).toBe(true);
                const lock4 = await locker.tryLock('trylock', 1);
                expect(lock4).toBeUndefined();
                expect(await locker.isLocked('trylock')).toBe(true);
            }, 200);

            setTimeout(async () => {
                expect(await locker.isLocked('trylock')).toBe(false);
                const lock5 = await locker.acquireLock('trylock', 1);
                expect(lock5).toBeInstanceOf(ProcessLock);
                expect(await locker.isLocked('trylock')).toBe(true);
                await lock5.unlock();
                resolve(undefined);
            }, 1000);
        }, 1000);
    });
});

test('mutex 1', async () => {
    const mutex1 = new Mutex;

    let i = 0;

    const promises: Promise<void>[] = [];

    promises.push(mutex1.lock().then(() => {
        expect(i).toBe(0);
        i++;
        mutex1.unlock();
    }));

    promises.push(mutex1.lock().then(() => {
        expect(i).toBe(1);
        i++;
        mutex1.unlock();
    }));

    promises.push(mutex1.lock().then(() => {
        expect(i).toBe(2);
        i++;
        mutex1.unlock();
    }));

    await Promise.all(promises);
    expect(i).toBe(3);
});
