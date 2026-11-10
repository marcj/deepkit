import { expect, jest, test } from '@jest/globals';
import { createServer } from 'net';

import { bsonBinarySerializer } from '@deepkit/bson';
import { AutoIncrement, PrimaryKey, entity } from '@deepkit/type';

import { MongoClient } from '../../src/client/client.js';
import { Command } from '../../src/client/command/command.js';
import { IsMasterCommand } from '../../src/client/command/ismaster.js';
import { MongoClientConfig } from '../../src/client/config.js';
import { MongoConnection } from '../../src/client/connection.js';
import { createDatabase } from '../utils.js';

jest.setTimeout(30000);

const url = 'mongodb://127.0.0.1:27017/test';

test('with all connections busy commands are pipelined instead of queued', async () => {
    const client = new MongoClient(url + '?maxPoolSize=1&maxPipelineDepth=8');
    await client.connect();
    const before = client.stats.connectionsCreated;

    await Promise.all(Array.from({ length: 8 }, () => client.execute(new IsMasterCommand())));

    expect(client.stats.connectionsCreated - before).toBeLessThanOrEqual(1);
    expect(client.stats.connectionsQueued).toBe(0);
    client.close();
});

test('commands over the depth wait and still complete', async () => {
    const client = new MongoClient(url + '?maxPoolSize=1&maxPipelineDepth=2');
    await client.connect();
    const results = await Promise.all(Array.from({ length: 100 }, () => client.execute(new IsMasterCommand())));
    expect(results.length).toBe(100);
    expect(client.stats.connectionsQueued).toBeGreaterThan(0);
    client.close();
});

test('depth 1 disables pipelining', async () => {
    const client = new MongoClient(url + '?maxPoolSize=1&maxPipelineDepth=1');
    await client.connect();
    await Promise.all(Array.from({ length: 10 }, () => client.execute(new IsMasterCommand())));
    expect(client.stats.connectionsQueued).toBeGreaterThan(0);
    client.close();
});

test('a connection held exclusively is not shared', async () => {
    const client = new MongoClient(url + '?maxPoolSize=1&maxPipelineDepth=8');
    await client.connect();
    const held = await client.getConnection();
    let done = false;
    const other = client.execute(new IsMasterCommand()).then(() => (done = true));
    await new Promise(resolve => setTimeout(resolve, 50));
    expect(done).toBe(false);
    held.release();
    await other;
    client.close();
});

test('binary values stay intact after the read buffer is reused', async () => {
    @entity.name('pipeline_binary')
    class Model {
        id: number & PrimaryKey & AutoIncrement = 0;

        constructor(public data: Uint8Array) {
        }
    }

    const database = await createDatabase('pipeline_binary');
    await database.persist(new Model(new Uint8Array(32).fill(7)));
    const first = await database.query(Model).findOne();
    await database.persist(new Model(new Uint8Array(32).fill(9)));
    for (let i = 0; i < 20; i++) await database.query(Model).find();
    expect(Array.from(first.data)).toEqual(new Array(32).fill(7));
    database.disconnect();
});

class Waiting extends Command<void> {
    settled?: Error | string;

    async execute() {
        await this.sendAndWait<{ ping: number }>({ ping: 1 }).then(() => (this.settled = 'resolved'), error => (this.settled = error));
    }
}

/** A connection to a server that answers nothing, so that the connection can be driven by hand. */
async function silentConnection() {
    const server = createServer(socket => socket.on('error', () => undefined));
    await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve));
    const port = (server.address() as any).port;
    const config = new MongoClientConfig(`mongodb://127.0.0.1:${port}/test`);
    const host = { id: 1, hostname: '127.0.0.1', port, stats: {}, type: 0 } as any;
    const connection: any = new MongoConnection(1, host, config, bsonBinarySerializer, () => undefined, () => undefined, () => undefined, () => undefined);
    connection.connect().catch(() => undefined);
    connection.inFlight.drain();
    connection.connectingPromise = undefined;
    connection.status = 'connected';
    return { connection, close: () => server.close() };
}

test('a response to another message fails all commands of the connection', async () => {
    const { connection, close } = await silentConnection();
    const a = new Waiting, b = new Waiting;
    const running = Promise.all([connection.execute(a), connection.execute(b)]);
    await new Promise(resolve => setTimeout(resolve, 10));

    const response = new Uint8Array(64);
    new DataView(response.buffer).setInt32(0, 64, true);
    new DataView(response.buffer).setInt32(8, 12345, true);
    connection.responseParser.feed(response);

    await running;
    expect(a.settled).toBeInstanceOf(Error);
    expect(b.settled).toBeInstanceOf(Error);
    expect(connection.socket.destroyed).toBe(true);
    close();
});

test('losing the connection rejects every command in flight', async () => {
    const { connection, close } = await silentConnection();
    const commands = [new Waiting, new Waiting, new Waiting];
    const running = Promise.all(commands.map(v => connection.execute(v)));
    await new Promise(resolve => setTimeout(resolve, 10));

    connection.socket.destroy();
    await running;
    for (const command of commands) expect(command.settled).toBeInstanceOf(Error);
    close();
});

test('sending on a closed connection fails instead of waiting forever', async () => {
    const { connection, close } = await silentConnection();
    connection.socket.destroy();
    await new Promise(resolve => setTimeout(resolve, 10));
    const command = new Waiting;
    await expect(connection.execute(command).then(() => { throw command.settled; })).rejects.toThrow();
    close();
});
