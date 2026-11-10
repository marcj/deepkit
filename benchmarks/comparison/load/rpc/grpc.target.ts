// gRPC with @grpc/grpc-js and Protocol Buffers over HTTP/2, under load. In-flight calls are multiplexed over the HTTP/2
// connection. Clients share one connection unless told otherwise, so each gets its own subchannel pool.
import * as grpc from '@grpc/grpc-js';
import * as protoLoader from '@grpc/proto-loader';
import { join } from 'path';

import { UserData, createUsers } from '../../rpc/shared.js';
import { rpcTarget } from '../rpc-load.js';

const loadProto = async () => {
    const definition = await protoLoader.load(join(import.meta.dirname, '../../rpc/service.proto'), {
        keepCase: true,
        defaults: true,
    });
    return grpc.loadPackageDefinition(definition).bench as any;
};

export const target = rpcTarget({
    async serve(port) {
        const proto = await loadProto();
        const server = new grpc.Server();
        server.addService(proto.Bench.service, {
            Add: (call: any, callback: any) => callback(null, { result: call.request.a + call.request.b }),
            SaveUser: (call: any, callback: any) => callback(null, call.request),
            ListUsers: (call: any, callback: any) => callback(null, { users: createUsers(call.request.count) }),
        });
        await new Promise<void>((resolve, reject) => {
            server.bindAsync(`127.0.0.1:${port}`, grpc.ServerCredentials.createInsecure(), error =>
                error ? reject(error) : resolve(),
            );
        });
        return server;
    },
    async connect(port) {
        const proto = await loadProto();
        const client = new proto.Bench(`127.0.0.1:${port}`, grpc.credentials.createInsecure(), {
            'grpc.use_local_subchannel_pool': 1,
        });
        const unary = <T>(method: string, request: unknown) =>
            new Promise<T>((resolve, reject) => {
                client[method](request, (error: Error | null, response: T) =>
                    error ? reject(error) : resolve(response),
                );
            });
        return {
            add: async (a, b) => (await unary<{ result: number }>('Add', { a, b })).result,
            saveUser: user => unary<UserData>('SaveUser', user),
            listUsers: async count => (await unary<{ users: UserData[] }>('ListUsers', { count })).users,
        };
    },
});
