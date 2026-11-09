// gRPC with @grpc/grpc-js and Protocol Buffers over HTTP/2. Checks the message structure, not the values.
import * as grpc from '@grpc/grpc-js';
import * as protoLoader from '@grpc/proto-loader';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';

import { UserData, createUsers, rpcSuite } from './shared.js';

export default async function () {
    const file = join(dirname(fileURLToPath(import.meta.url)), 'service.proto');
    const definition = await protoLoader.load(file, { keepCase: true, defaults: true });
    const proto = grpc.loadPackageDefinition(definition).bench as any;

    const server = new grpc.Server();
    server.addService(proto.Bench.service, {
        Add: (call: any, callback: any) => callback(null, { result: call.request.a + call.request.b }),
        SaveUser: (call: any, callback: any) => callback(null, call.request),
        ListUsers: (call: any, callback: any) => callback(null, { users: createUsers(call.request.count) }),
    });
    await new Promise<void>((resolve, reject) => {
        server.bindAsync('127.0.0.1:34572', grpc.ServerCredentials.createInsecure(), error => (error ? reject(error) : resolve()));
    });

    const client = new proto.Bench('127.0.0.1:34572', grpc.credentials.createInsecure());
    const unary = <T>(method: string, request: unknown) =>
        new Promise<T>((resolve, reject) => {
            client[method](request, (error: Error | null, response: T) => (error ? reject(error) : resolve(response)));
        });

    return rpcSuite('gRPC', {
        add: async (a, b) => (await unary<{ result: number }>('Add', { a, b })).result,
        saveUser: user => unary<UserData>('SaveUser', user),
        listUsers: async count => (await unary<{ users: UserData[] }>('ListUsers', { count })).users,
        close: () => {
            client.close();
            server.forceShutdown();
        },
    });
}
