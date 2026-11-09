// Socket.IO over WebSocket, calls with acknowledgement. JSON without validation.
import { Server } from 'socket.io';
import { io } from 'socket.io-client';

import { UserData, createUsers, rpcSuite } from './shared.js';

export default async function () {
    const server = new Server(34574);
    server.on('connection', socket => {
        socket.on('add', (a: number, b: number, reply: (v: number) => void) => reply(a + b));
        socket.on('saveUser', (user: UserData, reply: (v: UserData) => void) => reply(user));
        socket.on('listUsers', (count: number, reply: (v: UserData[]) => void) => reply(createUsers(count)));
    });

    const client = io('http://127.0.0.1:34574', { transports: ['websocket'] });
    await new Promise<void>(resolve => client.once('connect', () => resolve()));

    return rpcSuite('Socket.IO', {
        add: (a, b) => client.emitWithAck('add', a, b),
        saveUser: user => client.emitWithAck('saveUser', user),
        listUsers: count => client.emitWithAck('listUsers', count),
        close: () => {
            client.close();
            void server.close();
        },
    });
}
