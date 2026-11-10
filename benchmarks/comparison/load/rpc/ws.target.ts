// Baseline under load: JSON messages over plain WebSockets with ws. No framework, no validation, no types.
import WebSocket, { WebSocketServer } from 'ws';

import { UserData, createUsers } from '../../rpc/shared.js';
import { rpcTarget } from '../rpc-load.js';

const methods: Record<string, (...args: any[]) => unknown> = {
    add: (a: number, b: number) => a + b,
    saveUser: (user: UserData) => user,
    listUsers: (count: number) => createUsers(count),
};

export const target = rpcTarget({
    async serve(port) {
        const server = new WebSocketServer({ host: '127.0.0.1', port });
        server.on('connection', socket => {
            socket.on('message', data => {
                const { id, method, args } = JSON.parse(data.toString());
                socket.send(JSON.stringify({ id, result: methods[method](...args) }));
            });
        });
        return server;
    },
    async connect(port) {
        const client = new WebSocket(`ws://127.0.0.1:${port}`);
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
        return {
            add: (a, b) => call<number>('add', a, b),
            saveUser: user => call<UserData>('saveUser', user),
            listUsers: count => call<UserData[]>('listUsers', count),
        };
    },
});
