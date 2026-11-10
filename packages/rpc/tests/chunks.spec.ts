import { expect, test } from '@jest/globals';
import { skip } from 'rxjs/operators';

import { asyncOperation } from '@deepkit/core';

import { DirectClient } from '../src/client/client-direct.js';
import { rpc } from '../src/decorators.js';
import { ClientProgress } from '../src/progress.js';
import { RpcKernel } from '../src/server/kernel.js';

test('chunks', async () => {
    @rpc.controller('test')
    class TestController {
        @rpc.action()
        uploadBig(file: Uint8Array): number {
            return file.length;
        }

        @rpc.action()
        downloadBig(size: number): Uint8Array {
            return Buffer.alloc(size);
        }
    }

    const kernel = new RpcKernel();
    kernel.registerController(TestController, 'test');

    const client = new DirectClient(kernel);
    const controller = client.controller<TestController>('test');

    {
        //small payloads trigger progress as well
        const progress = ClientProgress.track();
        expect(progress.download.progress).toBe(0);
        const file = await controller.downloadBig(100);
        expect(progress.download.progress).toBe(1);
        expect(progress.download.total).toBe(113);
        expect(file.length).toBe(100);
    }

    {
        const progress = ClientProgress.track();

        const stats: number[] = [];
        progress.download.pipe(skip(1)).subscribe(p => {
            expect(progress.download.total).toBeGreaterThan(0);
            expect(progress.download.current).toBeLessThanOrEqual(progress.download.total);
            expect(progress.download.progress).toBeLessThanOrEqual(1);
            stats.push(progress.download.current);
        });
        const file = await controller.downloadBig(650_000);
        expect(file.length).toBe(650_000);
        expect(progress.download.done).toBe(true);
        expect(progress.download.total).toBe(650013);
        expect(stats).toEqual([100_000, 200_000, 300_000, 400_000, 500_000, 600_000, 650_013]);
        expect(progress.download.progress).toBe(1);
    }

    {
        //small payloads trigger progress as well
        const uploadFile = Buffer.alloc(100);
        const progress = ClientProgress.track();
        const size = await controller.uploadBig(uploadFile);
        expect(progress.upload.total).toBe(115);
        expect(progress.upload.progress).toBe(1);
    }

    {
        const uploadFile = Buffer.alloc(550_000);
        const progress = ClientProgress.track();
        const stats: number[] = [];
        progress.upload.pipe(skip(1)).subscribe(p => {
            expect(progress.upload.total).toBeGreaterThan(0);
            expect(progress.upload.current).toBeLessThanOrEqual(progress.upload.total);
            expect(progress.upload.progress).toBeLessThanOrEqual(1);
            stats.push(progress.upload.current);
        });
        const size = await controller.uploadBig(uploadFile);
        expect(size).toBe(550_000);
        expect(stats).toEqual([100_000, 200_000, 300_000, 400_000, 500_000, 550_015]);
        expect(progress.upload.done).toBe(true);
        expect(progress.upload.progress).toBe(1);
    }
});

test('abort', async () => {
    @rpc.controller('test')
    class TestController {
        @rpc.action()
        uploadBig(file: Uint8Array): number {
            console.log('asd');
            return file.length;
        }

        @rpc.action()
        downloadBig(size: number): Uint8Array {
            return Buffer.alloc(size);
        }
    }

    const kernel = new RpcKernel();
    kernel.registerController(TestController, 'test');

    const client = new DirectClient(kernel);
    const controller = client.controller<TestController>('test');

    // Upload chunks:
    // Client sends chunks
    // Server sends a chunk ack
    // Server can send a chunk abort to abort the upload
    // Client can send a chunk abort to abort the upload
    {
        const uploadFile = Buffer.alloc(550_000);
        const progress = ClientProgress.track();
        const promise = controller.uploadBig(uploadFile);
        progress.upload.subscribe(value => {
            if (value.progress > 0.5) progress.abort();
        });

        await expect(promise).rejects.toThrow('Aborted');
        expect(progress.upload.progress).toBeGreaterThan(0.5);
        expect(progress.upload.progress).toBeLessThan(1.0);
        expect(progress.upload.done).toBe(true);
    }

    // Download chunks:
    // Server sends chunks
    // Client sends a chunk ack
    // Client can send a chunk abort to abort the download
    // Server can send a chunk abort to abort the download
    {
        const progress = ClientProgress.track();
        const promise = controller.downloadBig(550_000);
        progress.download.subscribe(value => {
            if (value.progress > 0.5) progress.abort();
        });

        await expect(promise).rejects.toThrow('Aborted');
        expect(progress.download.progress).toBeGreaterThan(0.5);
        expect(progress.download.progress).toBeLessThan(1.0);
        expect(progress.download.done).toBe(true);
    }
});

test('back controller', async () => {
    @rpc.controller('test')
    class TestController {
        @rpc.action()
        uploadBig(file: Uint8Array): number {
            return file.length;
        }

        @rpc.action()
        downloadBig(size: number): Uint8Array {
            return Buffer.alloc(size);
        }
    }

    const kernel = new RpcKernel();

    const res = await asyncOperation<Uint8Array>(async resolve => {
        kernel.onConnection(connection => {
            queueMicrotask(async () => {
                const ctrl = connection.controller<TestController>('test');
                const res = await ctrl.downloadBig(105_000);
                resolve(res);
            });
        });

        const client = new DirectClient(kernel);
        client.registerController(TestController, 'test');
        await client.connect();
    });
    expect(res.byteLength).toBe(105_000);
});
