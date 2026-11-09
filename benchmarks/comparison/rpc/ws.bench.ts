// Baseline: JSON messages over a plain WebSocket with ws. No framework, no validation, no types.
import WebSocket, { WebSocketServer } from 'ws';

import { UserData, createUsers, rpcSuite } from './shared.js';

export default async function () {
    const server = new WebSocketServer({ host: '127.0.0.1', port: 34575 });
    const methods: Record<string, (...args: any[]) => unknown> = {
        add: (a: number, b: number) => a + b,
        saveUser: (user: UserData) => user,
        listUsers: (count: number) => createUsers(count),
    };
    server.on('connection', socket => {
        socket.on('message', data => {
            const { id, method, args } = JSON.parse(data.toString());
            socket.send(JSON.stringify({ id, result: methods[method](...args) }));
        });
    });

    const client = new WebSocket('ws://127.0.0.1:34575');
    await new Promise(resolve => client.once('open', resolve));

    let nextId = 0;
    const pending = new Map<number, (value: any) => void>();
    client.on('message', data => {
        const { id, result } = JSON.parse(data.toString());
        pending.get(id)!(result);
        pending.delete(id);
    });
    const call = <T>(method: string, ...args: unknown[]) =>
        new Promise<T>(resolve => {
            const id = nextId++;
            pending.set(id, resolve);
            client.send(JSON.stringify({ id, method, args }));
        });

    return rpcSuite('ws', {
        add: (a, b) => call<number>('add', a, b),
        saveUser: user => call<UserData>('saveUser', user),
        listUsers: count => call<UserData[]>('listUsers', count),
        close: () => {
            client.close();
            server.close();
        },
    });
}
