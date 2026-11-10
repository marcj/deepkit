// Core NATS: publish and subscribe only. Key-value in NATS needs JetStream, which persists and is another kind of system.
import { connect } from '@nats-io/transport-node';

import { UserData } from '../../rpc/shared.js';
import { brokerTarget, startServerBinary } from '../broker-load.js';

export const target = brokerTarget({
    serve: port => startServerBinary(process.env.NATS_SERVER ?? 'nats-server', ['-a', '127.0.0.1', '-p', String(port)], port),
    async connect(port) {
        const client = await connect({ servers: `127.0.0.1:${port}` });
        return {
            publish: (channel, value) => client.publish(channel, JSON.stringify(value)),
            subscribe: (channel, callback) => {
                client.subscribe(channel, { callback: (_error, message) => callback(message.json<UserData>()) });
                return client.flush();
            },
        };
    },
});
