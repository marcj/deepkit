import { expect, jest, test } from '@jest/globals';
import { MongoClient } from '../../src/client/client.js';
import { IsMasterCommand } from '../../src/client/command/ismaster.js';
import { sleep } from '@deepkit/core';
import { ConnectionOptions } from '../../src/client/options.js';
import { cast, validatedDeserialize } from '@deepkit/type';
import { createConnection } from 'net';
import { fail } from 'assert';
import { MongoConnectionError } from '../../src/client/error.js';
import { createCommand, MongoConnectionStatus } from '../../index.js';

jest.setTimeout(60000);

test('ConnectionOptions', async () => {
    {
        const options = cast<ConnectionOptions>({});
        expect(options.readConcernLevel).toBe(undefined);
    }
    {
        const options = validatedDeserialize<ConnectionOptions>({});
        expect(options.readConcernLevel).toBe(undefined);
    }
});

test('connect invalid', async () => {
    const client = new MongoClient('mongodb://invalid/');

    await expect(client.connect()).rejects.toThrow('getaddrinfo');
    client.close();
});

test('connect invalid 2', async () => {
    const client = new MongoClient('mongodb://invalid/');

    try {
        await client.connect();
        fail('should fail');
    } catch (error) {
        expect(error).toBeInstanceOf(MongoConnectionError);
    }

    client.close();
});

test('connect valid', async () => {
    const client = new MongoClient('mongodb://localhost/');

    expect(client.config.hosts[0].hostname).toEqual('localhost');
});

test('test localhost', async () => {
    const socket = createConnection({
        host: '127.0.0.1',
        port: 27017
    });

    await new Promise(async (resolve, reject) => {
        socket.on('error', (error) => {
            reject(error);
        });
        await sleep(0.1);
        socket.end();
        resolve(undefined);
    });
});

test('custom command', async () => {
    interface Message {
        isMaster: number;
        $db: string;
    }

    const command = createCommand<Message, {ismaster: boolean}>({isMaster: 1, $db: 'deepkit'});

    const client = new MongoClient('mongodb://127.0.0.1/');
    const res = await client.execute(command);
    expect(res).toEqual({ ismaster: true, ok: 1 });
    client.close();
});

test('connect handshake', async () => {
    const client = new MongoClient('mongodb://127.0.0.1/');
    await client.connect();

    const type = client.config.hosts[0].getType();
    const rightType = type === 'primary' || type === 'standalone';
    expect(rightType).toBe(true);

    client.close();
});

test('connect isMaster command', async () => {
    const client = new MongoClient('mongodb://127.0.0.1/');
    const response = await client.execute(new IsMasterCommand);
    expect(response.ismaster).toBe(1);
    client.close();
});


// test('connect with username/password', async () => {
//     const client = new MongoClient('mongodb://marc:password@localhost');
//     expect(client.config.authUser).toBe('marc');
//     expect(client.config.authPassword).toBe('password');
//
//     const response = await client.execute(new IsMasterCommand);
//     expect(response.ismaster).toBe(true);
//
//     client.close();
// });

// test('connect atlas', async () => {
//     const client = new MongoClient('mongodb+srv://admin:xxx@cluster0.8yylk.mongodb.net/testdb?retryWrites=true&w=majority');
//     expect(client.config.authUser).toBe('admin');
//     expect(client.config.authPassword).toBe('xxx');
//     expect(client.config.options.checkServerIdentity).toBe(true);
//     expect(client.config.options.retryWrites).toBe(true);
//     expect(client.config.options.readPreference).toBe('primary');
//     expect(client.config.options.w).toBe('majority');
//     expect(client.config.isSrv).toBe(true);
//     expect(client.config.srvDomain).toBe('cluster0.8yylk.mongodb.net');
//
//     const hosts = await client.config.getHosts();
//     expect(hosts.length).toBe(3);
//     expect(hosts[0].hostname).toBe('cluster0-shard-00-00.8yylk.mongodb.net');
//     expect(hosts[1].hostname).toBe('cluster0-shard-00-01.8yylk.mongodb.net');
//     expect(hosts[2].hostname).toBe('cluster0-shard-00-02.8yylk.mongodb.net');
//     expect(client.config.options.replicaSet).toBe('atlas-c2ym07-shard-0');
//     expect(client.config.options.authSource).toBe('admin');
//
//     await client.connect();
//
//     console.log(hosts);
//
//     // const User = t.class({
//     //     _id: t.mongoId.primary,
//     //     username: t.string,
//     //     tags: t.array(t.string),
//     //     priority: t.number,
//     // });
//     //
//     // const documents: ExtractClassType<typeof User>[] = [];
//     // for (let i = 0; i < 100; i++) {
//     //     const user = new User();
//     //     user.username = 'Peter ' + i;
//     //     user.tags = ['a', 'b', 'c'];
//     //     user.priority = i;
//     //     documents.push(user);
//     // }
//     //
//     // await client.execute(new InsertCommand(User, documents));
//
//     client.close();
// });
//
//
// test('load balancing', () => {
//     const client = new MongoClient('mongodb+srv://admin:xxx@cluster0.8yylk.mongodb.net/testdb?retryWrites=true&w=majority');
//
//
// });

test('connection pool 1', async () => {
    const client = new MongoClient('mongodb://127.0.0.1?maxPoolSize=1');

    //spawn 10 promises, each requesting a connection and releasing it a few ms later
    const promises: Promise<any>[] = [];

    async function test() {
        const c = await client.pool.getConnection();
        await sleep(0.1 * Math.random());
        c.release();
    }

    for (let i = 0; i < 10; i++) {
        promises.push(test());
    }

    await Promise.all(promises);

    expect(client.stats.connectionsCreated).toBe(1);
    expect(client.stats.connectionsReused).toBe(10);
    expect(client.stats.connectionsQueued).toBe(10);

    client.close();
});

test('connection pool stress test', async () => {
    const client = new MongoClient('mongodb://127.0.0.1?maxPoolSize=2');

    //spawn many promises, each requesting a connection and releasing it a few ms later
    const promises: Promise<any>[] = [];

    async function test() {
        const c = await client.pool.getConnection();
        await sleep(0.001 * Math.random());
        c.release();
    }

    const batch = 500;
    for (let i = 0; i < 5000; i++) {
        promises.push(test());
        if (i % batch === 0) {
            await Promise.all(promises);
            promises.length = 0;
            console.log('batch', i);
        }
    }

    await Promise.all(promises);
    client.close();

    expect(client.stats.connectionsCreated).toBe(2);
    expect(client.stats.connectionsReused).toBe(4999);
});

test('connection pool 10', async () => {
    const client = new MongoClient('mongodb://127.0.0.1?maxPoolSize=10');

    {
        const c1 = await client.pool.getConnection();
        const c2 = await client.pool.getConnection();

        expect(c1.status).toBe(MongoConnectionStatus.connected);
        expect(c2.status).toBe(MongoConnectionStatus.connected);

        expect(c1 === c2).toBe(false);

        c1.release();
        c2.release();

        // the most recently used one, so that rarely needed connections stay idle long enough to be closed
        const c3 = await client.pool.getConnection();
        expect(c3 === c2).toBe(true);
        c3.release();
    }

    {
        const host = client.config.hosts[0];
        expect(host.connections.length).toBe(2);
        expect(host.freeConnections).toBe(2);
        expect(host.freeConnections).toBe(2);

        const c1 = await client.pool.getConnection();
        expect(host.connections.length).toBe(2);
        expect(host.freeConnections).toBe(1);

        const c2 = await client.pool.getConnection();
        expect(host.freeConnections).toBe(0);
        expect(host.connections.length).toBe(2);

        const c3 = await client.pool.getConnection();
        expect(host.connections.length).toBe(3);
        const c4 = await client.pool.getConnection();
        expect(host.connections.length).toBe(4);
        const c5 = await client.pool.getConnection();
        expect(host.connections.length).toBe(5);
        const c6 = await client.pool.getConnection();
        expect(host.connections.length).toBe(6);
        const c7 = await client.pool.getConnection();
        expect(host.connections.length).toBe(7);
        const c8 = await client.pool.getConnection();
        expect(host.connections.length).toBe(8);
        const c9 = await client.pool.getConnection();
        expect(host.connections.length).toBe(9);
        const c10 = await client.pool.getConnection();
        // this blocks
        let c11: any;
        client.pool.getConnection().then((c) => {
            c11 = c;
            expect(c11).toBe(c1);
        });
        let c12: any;
        client.pool.getConnection().then((c) => {
            c12 = c;
            expect(c12).toBe(c2);
        });
        await sleep(0.01);
        expect(c11).toBe(undefined);
        expect(c12).toBe(undefined);

        c1.release();
        await sleep(0.01);
        expect(c11).toBe(c1);

        c2.release();
        await sleep(0.01);
        expect(c12).toBe(c2);
    }

    client.close();
});
