// Socket.IO over WebSocket under load, calls with acknowledgement. JSON without validation.
// forceNew, because io() shares one connection per server by default.
import { Server } from 'socket.io';
import { io } from 'socket.io-client';

import { UserData, createUsers } from '../../rpc/shared.js';
import { rpcTarget } from '../rpc-load.js';

export const target = rpcTarget({
    async serve(port) {
        const server = new Server(port);
        server.on('connection', socket => {
            socket.on('add', (a: number, b: number, reply: (v: number) => void) => reply(a + b));
            socket.on('saveUser', (user: UserData, reply: (v: UserData) => void) => reply(user));
            socket.on('listUsers', (count: number, reply: (v: UserData[]) => void) => reply(createUsers(count)));
        });
        return server;
    },
    async connect(port) {
        const client = io(`http://127.0.0.1:${port}`, { transports: ['websocket'], forceNew: true });
        await new Promise<void>(resolve => client.once('connect', () => resolve()));
        return {
            add: (a, b) => client.emitWithAck('add', a, b),
            saveUser: user => client.emitWithAck('saveUser', user),
            listUsers: count => client.emitWithAck('listUsers', count),
        };
    },
});
