// The server in a Web Worker: the first message selects the channel.
import { RpcKernel, createMessagePortChannel, createSharedMemoryChannel, serveRpcChannel } from '@deepkit/rpc';

import { TestController } from './controller.js';

const kernel = new RpcKernel();
kernel.registerController(TestController);

self.addEventListener(
    'message',
    (event: MessageEvent) => {
        if (event.data.memory) {
            serveRpcChannel(kernel, createSharedMemoryChannel(event.data.memory, 'server'));
        } else {
            serveRpcChannel(kernel, createMessagePortChannel(self));
        }
    },
    { once: true },
);
