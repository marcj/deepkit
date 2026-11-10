// RPC under load: a server per library in its own process, and many connections with several in-flight calls each,
// the same workloads as benchmarks/comparison/rpc. See harness.ts.
import { UserData, createUser, listCount } from '../rpc/shared.js';
import { LoadLevel, LoadPlan, LoadTarget, maxLoadProcesses } from './harness.js';

export interface RpcLoadLibrary {
    /** Starts a server of the library listening on 127.0.0.1:port */
    serve(port: number): Promise<unknown>;
    /** A new connection to the server */
    connect(port: number): Promise<RpcLoadOperations>;
}

export interface RpcLoadOperations {
    add(a: number, b: number): Promise<number>;
    saveUser(user: UserData): Promise<UserData>;
    listUsers(count: number): Promise<UserData[]>;
}

const port = Number(process.env.LOAD_RPC_PORT ?? 34580);

/** Connections, each with the same number of in-flight calls. */
const inFlightPerConnection = 8;
const connectionLevels = [8, 64];

export const rpcLevels: LoadLevel[] = connectionLevels.map(connections => ({
    label: `${connections} connections x ${inFlightPerConnection} in flight`,
    processes: Math.min(connections, maxLoadProcesses),
    clients: connections,
    callers: inFlightPerConnection,
}));

const users = Array.from({ length: 64 }, (_, i) => createUser(i + 1));

export function rpcTarget(library: RpcLoadLibrary): LoadTarget {
    return {
        serve: () => library.serve(port),
        async connect() {
            const operations = await library.connect(port);
            if ((await operations.add(2, 3)) !== 5) throw new Error('add returned a wrong result');
            const saved = await operations.saveUser(users[0]);
            if (saved.email !== users[0].email || saved.roles.length !== 2)
                throw new Error(`saveUser returned ${JSON.stringify(saved)}`);
            const list = await operations.listUsers(listCount);
            if (list.length !== listCount || list[99].id !== 100)
                throw new Error(`listUsers returned ${list.length} items`);
            return {
                add: i => operations.add(i, 3),
                saveUser: i => operations.saveUser(users[i & 63]),
                listUsers: () => operations.listUsers(listCount),
            };
        },
    };
}

export function rpcPlan(library: string): LoadPlan {
    return {
        suite: 'comparison/rpc-load',
        library,
        workloads: { add: 'add two numbers', saveUser: 'send and receive an object', listUsers: 'receive 100 objects' },
        levels: rpcLevels,
        server: true,
        config: () => ({}),
    };
}
