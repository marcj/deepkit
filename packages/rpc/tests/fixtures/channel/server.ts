// An RPC server in a worker thread or child process, for channel.spec.ts. The first argument selects the channel.
import { Socket } from 'node:net';
import { parentPort, threadId, workerData } from 'node:worker_threads';
import { Observable } from 'rxjs';

import {
    RpcKernel,
    createMessagePortChannel,
    createProcessChannel,
    createSharedMemoryChannel,
    createStreamChannel,
    rpc,
    serveRpcChannel,
} from '@deepkit/rpc';

class User {
    created: Date = new Date('2026-01-02T03:04:05Z');

    constructor(
        public id: number,
        public name: string,
    ) {}
}

@rpc.controller('test')
class TestController {
    @rpc.action()
    add(a: number, b: number): number {
        return a + b;
    }

    @rpc.action()
    user(user: User): User {
        return new User(user.id + 1, user.name.toUpperCase());
    }

    @rpc.action()
    bytes(size: number): Uint8Array {
        const data = new Uint8Array(size);
        for (let i = 0; i < size; i++) data[i] = i % 251;
        return data;
    }

    @rpc.action()
    sum(data: Uint8Array): number {
        let sum = 0;
        for (let i = 0; i < data.length; i++) sum += data[i];
        return sum;
    }

    @rpc.action()
    count(to: number): Observable<number> {
        return new Observable(subscriber => {
            for (let i = 1; i <= to; i++) subscriber.next(i);
            subscriber.complete();
        });
    }

    @rpc.action()
    pid(): number {
        return process.pid;
    }

    @rpc.action()
    thread(): number {
        return threadId;
    }

    /** blocks the thread for the given milliseconds */
    @rpc.action()
    busy(milliseconds: number): number {
        const end = Date.now() + milliseconds;
        while (Date.now() < end);
        return threadId;
    }
}

const kernel = new RpcKernel();
kernel.registerController(TestController);

const mode = process.argv[2] || 'worker';
if (workerData?.memory) {
    const channel = createSharedMemoryChannel(workerData.memory, 'server');
    serveRpcChannel(kernel, channel);
    parentPort!.on('message', message => {
        if (message === 'close') channel.close();
    });
} else if (mode === 'worker') {
    serveRpcChannel(kernel, createMessagePortChannel(parentPort!));
} else if (mode === 'process') {
    serveRpcChannel(kernel, createProcessChannel(process));
    // other messages share the channel
    process.on('message', message => {
        if (message === 'ping') process.send!('pong');
    });
} else if (mode === 'pipe') {
    const socket = new Socket({ fd: 3, readable: true, writable: true });
    serveRpcChannel(kernel, createStreamChannel(socket));
    socket.on('close', () => process.exit(0));
}
