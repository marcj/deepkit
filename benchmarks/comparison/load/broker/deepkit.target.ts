import { BrokerDeepkitAdapter, BrokerKernel } from '@deepkit/broker';
import { RpcTcpClientAdapter, RpcTcpServer } from '@deepkit/rpc-tcp';
import { typeOf } from '@deepkit/type';

import { UserData } from '../../rpc/shared.js';
import { brokerTarget } from '../broker-load.js';

const type = typeOf<UserData>();
const options: any = { ttl: 0 };

export const target = brokerTarget({
    async serve(port) {
        const server = new RpcTcpServer(new BrokerKernel(), `127.0.0.1:${port}`);
        server.start();
        return server;
    },
    async connect(port) {
        const address = `127.0.0.1:${port}`;
        const adapter = new BrokerDeepkitAdapter({ servers: [{ url: address, transport: new RpcTcpClientAdapter(address) }] });
        return {
            get: key => adapter.get(key, type),
            set: (key, value) => adapter.set(key, value, options, type),
            increment: key => adapter.increment(key, 1),
            publish: (channel, value) => adapter.publish(channel, value, type),
            subscribe: (channel, callback) => adapter.subscribe(channel, callback, type),
        };
    },
});
