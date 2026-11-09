// The same calls for every RPC library, so the results are comparable. Client and server run in one
// process and talk over a local socket, so the time includes both sides of a call.
import { BenchSuite } from '@deepkit/bench';

export interface UserData {
    id: number;
    name: string;
    email: string;
    active: boolean;
    roles: string[];
}

/** objects returned by the list benchmark */
export const listCount = 100;

export function createUser(id: number): UserData {
    return { id, name: 'Peter ' + id, email: `peter${id}@example.com`, active: id % 2 === 0, roles: ['admin', 'user'] };
}

export function createUsers(count: number): UserData[] {
    const users: UserData[] = [];
    for (let i = 1; i <= count; i++) users.push(createUser(i));
    return users;
}

export interface RpcOperations {
    add(a: number, b: number): Promise<number>;
    /** sends a user and returns it */
    saveUser(user: UserData): Promise<UserData>;
    listUsers(count: number): Promise<UserData[]>;
    close(): Promise<void> | void;
}

/** Checks the results first, so a broken setup fails instead of measuring nothing. */
export async function rpcSuite(library: string, operations: RpcOperations): Promise<BenchSuite> {
    const user = createUser(1);
    if ((await operations.add(2, 3)) !== 5) throw new Error(`${library}: add returned a wrong result`);
    const saved = await operations.saveUser(user);
    if (saved.email !== user.email || saved.roles.length !== 2) throw new Error(`${library}: saveUser returned ${JSON.stringify(saved)}`);
    const list = await operations.listUsers(listCount);
    if (list.length !== listCount || list[99].id !== 100) throw new Error(`${library}: listUsers returned ${list.length} items`);

    const suite = new BenchSuite('comparison/rpc');
    suite.add(`${library}: add two numbers`, async () => {
        await operations.add(2, 3);
    });
    suite.add(`${library}: send and receive an object`, async () => {
        await operations.saveUser(user);
    });
    suite.add(`${library}: receive 100 objects`, async () => {
        await operations.listUsers(listCount);
    });

    const runAsync = suite.runAsync.bind(suite);
    suite.runAsync = async (...args) => {
        try {
            return await runAsync(...args);
        } finally {
            await operations.close();
        }
    };
    return suite;
}
