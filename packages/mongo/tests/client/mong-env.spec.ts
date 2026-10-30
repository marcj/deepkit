import { afterAll, beforeAll, beforeEach, describe, expect, it, jest, test } from '@jest/globals';
import { MongoClient } from '../../src/client/client.js';
import { createMongoClientFactory, MongoEnv, MongoInstance } from './env-setup.js';
import { sleep } from '@deepkit/core';
import { MongoConnection, MongoConnectionPool, MongoStats, onMongoTopologyChange } from '../../src/client/connection.js';
import { EventDispatcher } from '@deepkit/event';
import { ConsoleLogger } from '@deepkit/logger';
import { IsMasterCommand } from '../../src/client/command/ismaster.js';
import { MongoConnectionError } from '../../src/client/error.js';
import { Host } from '../../src/client/host.js';
import { MongoClientConfig } from '../../src/client/config.js';
import { mongoBinarySerializer } from '../../src/mongo-serializer.js';

jest.setTimeout(60 * 1000);

test('nix', () => {
});

describe('basic', () => {
    it('should close the node process', async () => {
        const client = new MongoClient(`mongodb://primary`);
        await expect(client.connect()).rejects.toThrow('Connection failed');
    });

    it('MongoConnection close the node process ', async () => {
        const host = new Host('primary', 27017);
        const config = new MongoClientConfig('mongodb://primary');
        const connection = new MongoConnection(
            1, host, config, mongoBinarySerializer, (connection) => {
                console.log('onClose', connection.id);
            }, () => {
                console.log('onRelease', connection.id);
            }, (bytes) => {
                console.log('onSent', bytes);
            }, (bytes) => {
                console.log('onReceived', bytes);
            },
        );

        await expect(connection.connect()).rejects.toThrow('Connection failed');
    });

    it('MongoConnectionPool close the node process', async () => {
        const config = new MongoClientConfig('mongodb://primary');
        const stats = new MongoStats();
        const logger = new ConsoleLogger();
        const eventDispatcher = new EventDispatcher();
        const pool = new MongoConnectionPool(config, mongoBinarySerializer, stats, logger, eventDispatcher);

        await expect(pool.getConnection()).rejects.toThrow('Connection failed');
    });
});

describe('mongo-env', () => {
    const mongoEnv = new MongoEnv('basics');
    let mongo: MongoInstance;
    const createClient = createMongoClientFactory(mongoEnv);

    beforeAll(async () => {
        mongo = await mongoEnv.addMongo();
    });

    beforeEach(async () => {
        await mongoEnv.reset();
    });

    afterAll(async () => {
        createClient.closeAll();
        await mongoEnv.closeAll();
    });

    it('should execute json', async () => {
        const res = await mongoEnv.executeJson(mongo.name, `db.isMaster()`);
        expect(res.ismaster).toBe(true);
    });

    it('client connect', async () => {
        const client = createClient(mongo.getUrl());
        await client.connect();
        expect(client.pool.isConnected()).toBe(true);
        expect(client.pool.isWritable()).toBe(true);
        expect(client.pool.getConnectedConnections().length).toBe(1);
        client.close();
    });

    it('client reconnect', async () => {
        const client = createClient(mongo.getUrl());
        {
            const cmd = await client.execute(new IsMasterCommand());
            expect(client.pool.isConnected()).toBe(true);
            expect(cmd.ismaster).toBe(1);
        }

        mongo.closeConnections();
        // the client notices the close only after the socket event arrives
        for (let i = 0; i < 100 && client.pool.isConnected(); i++) await sleep(0.01);
        expect(client.pool.isConnected()).toBe(false);

        {
            const cmd = await client.execute(new IsMasterCommand());
            expect(client.pool.isConnected()).toBe(true);
            expect(cmd.ismaster).toBe(1);
        }
    });

    it('client down', async () => {
        mongo.connectionDrop = true;
        mongo.stopProxy();

        const client = createClient(mongo.getUrl());

        await expect(client.connect()).rejects.toThrow('Connection failed');
        await expect(client.connect()).rejects.toThrow('Connection failed');
        await expect(client.execute(new IsMasterCommand())).rejects.toThrow('Connection failed');
        expect(client.pool.isConnected()).toBe(false);
    });

    it('server down', async () => {
        mongo.stopProxy();

        const client = createClient(mongo.getUrl());
        await expect(client.execute(new IsMasterCommand())).rejects.toThrow('Connection failed');
    });

    it('topology change event', async () => {
        const client = createClient(`mongodb://127.0.0.1:${mongo.proxyPort}`);
        const promise = new Promise<void>((resolve) => {
            client.eventDispatcher.listen(onMongoTopologyChange, (event) => {
                resolve();
            });
        });
        await client.connect();
        await promise;
        expect(client.config.hosts[0].type).toBe('standalone');
        expect(client.config.topology).toBe('single');
    });

    it('client down - reconnect', async () => {
        const client = createClient(mongo.getUrl());
        mongo.closeConnections();
        mongo.connectionDrop = true;
        await sleep(0.1);
        expect(client.pool.isConnected()).toBe(false);

        await expect(client.execute(new IsMasterCommand())).rejects.toThrow(MongoConnectionError);

        mongo.connectionDrop = false;
        client.pool.heartbeat(true);
        await client.eventDispatcher.next(onMongoTopologyChange);
        await client.execute(new IsMasterCommand());
    });
});

describe('replica set, primary secondary', () => {
    const mongoEnv = new MongoEnv;

    let primary: MongoInstance;
    let secondary1: MongoInstance;
    const createClient = createMongoClientFactory(mongoEnv);

    beforeAll(async () => {
        [primary, secondary1] = await Promise.all([
            mongoEnv.addMongo('primary', 'rs1'),
            mongoEnv.addMongo('secondary1', 'rs1'),
        ]);

        const init = await mongoEnv.execute('primary', `rs.initiate(${JSON.stringify({
            _id: 'rs1',
            members: [
                { _id: 0, host: primary.name },
            ],
        })})`);
        // console.log('rs.initiate', init);
        await mongoEnv.waitUntilBeingPrimary('primary');

        await mongoEnv.addReplicaSet('primary', 'secondary1', 1, 1);
        await mongoEnv.waitUntilBeingSecondary('secondary1');
    });

    beforeEach(async () => {
        await mongoEnv.reset();
    });

    afterAll(async () => {
        createClient.closeAll();
        await mongoEnv.closeAll();
        await sleep(1);
    });

    it('mongo env, replSet', async () => {
        {
            const res = await mongoEnv.executeJson('primary', `db.isMaster()`);
            console.log('primary', res);
            expect(res.ismaster).toBe(true);
            expect(res.setName).toBe('rs1');
        }

        {
            const res = await mongoEnv.executeJson('secondary1', `db.isMaster()`);
            console.log('secondary1', res);
            expect(res.ismaster).toBe(false);
            expect(res.secondary).toBe(true);
            expect(res.setName).toBe('rs1');
        }
    });

    it('topology change event', async () => {
        // console.log(await mongoEnv.executeJson(primary.name, `db.isMaster()`));
        // console.log(await mongoEnv.executeJson(secondary1.name, `db.isMaster()`));

        const client = createClient(`mongodb://primary`);

        const promise = new Promise<void>((resolve) => {
            client.eventDispatcher.listen(onMongoTopologyChange, (event) => {
                resolve();
            });
        });

        await client.connect();
        await promise;
        console.log(client.config.shortSummary());
        expect(client.config.hosts[0].type).toBe('primary');
        //todo secondary might be passive sometimes
        expect(client.config.hosts[1].type).toBe('secondary');
        expect(client.config.topology).toBe('replicaSetWithPrimary');
        client.close();
    });

    test('readonly replica set - recovered to primary', async () => {
        primary.stopProxy();

        const client = createClient(`mongodb://primary,secondary1?heartbeatFrequency=100`);
        await client.connect();
        expect(client.stats.heartbeats).toBe(1);
        expect(client.stats.heartbeatsFailed).toBe(0);
        expect(client.stats.topologyChanges).toBe(1);

        expect(client.config.topology).toBe('replicaSetNoPrimary');

        expect(client.config.hosts[0].stats.heartbeats).toBe(1);
        expect(client.config.hosts[0].stats.heartbeatsFailed).toBe(1);
        expect(client.config.hosts[0].stats.connectionsCreated).toBe(1);
        expect(client.config.hosts[0].stats.connectionsError).toBe(1);
        expect(client.config.hosts[0].isWritable()).toBe(false);
        expect(client.config.hosts[0].isReadable()).toBe(false);

        expect(client.config.hosts[1].stats.heartbeats).toBe(1);
        expect(client.config.hosts[1].stats.heartbeatsFailed).toBe(0);
        expect(client.config.hosts[1].stats.connectionsCreated).toBe(1);
        expect(client.config.hosts[1].stats.connectionsError).toBe(0);
        expect(client.config.hosts[1].isWritable()).toBe(false);
        expect(client.config.hosts[1].isReadable()).toBe(true);

        await expect(client.getConnection({
            readPreference: 'primary',
        })).rejects.toThrow('Connection failed: no primary available');

        await primary.startProxy();
        await client.eventDispatcher.next(onMongoTopologyChange);
        expect(client.config.hosts[0].stats.heartbeats).toBe(2);
        expect(client.config.hosts[0].stats.heartbeatsFailed).toBe(1);
        expect(client.config.hosts[1].stats.heartbeats).toBe(2);
        expect(client.config.hosts[1].stats.heartbeatsFailed).toBe(0);

        expect(client.stats.heartbeats).toBe(2);
        expect(client.stats.heartbeatsFailed).toBe(0);
        expect(client.stats.topologyChanges).toBe(2);
        expect(client.stats.bytesReceived).toBeGreaterThan(10);
        expect(client.stats.bytesSent).toBeGreaterThan(10);
        expect(client.config.topology).toBe('replicaSetWithPrimary');

        expect(client.config.hosts[0].stats.bytesReceived).toBeGreaterThan(10);
        expect(client.config.hosts[0].stats.bytesSent).toBeGreaterThan(10);
        expect(client.config.hosts[1].stats.bytesReceived).toBeGreaterThan(10);
        expect(client.config.hosts[1].stats.bytesSent).toBeGreaterThan(10);

        const connection = await client.getConnection({ readPreference: 'primary' });
        expect(connection.host.type).toBe('primary');
        connection.release();

        client.close();
    });

    it('invalid host specified', async () => {
        const client = createClient(`mongodb://primary,secondary56`);
        const topologyChange = client.eventDispatcher.next(onMongoTopologyChange);
        await client.connect();
        await topologyChange;
        expect(client.config.hosts[0].type).toBe('primary');
        expect(client.config.hosts[0].dead).toBe(false);
        expect(client.config.hosts[0].isWritable()).toBe(true);
        expect(client.config.hosts[0].isReadable()).toBe(true);
        expect(client.config.hosts[0].isUsable()).toBe(true);

        expect(client.config.hosts[1].type).toBe('unknown');
        expect(client.config.hosts[1].dead).toBe(true);
        expect(client.config.hosts[1].isWritable()).toBe(false);
        expect(client.config.hosts[1].isReadable()).toBe(false);
        expect(client.config.hosts[1].isUsable()).toBe(false);

        expect(client.config.hosts[2].type).toBe('secondary');
        expect(client.config.hosts[2].dead).toBe(false);
        expect(client.config.hosts[2].isWritable()).toBe(false);
        expect(client.config.hosts[2].isReadable()).toBe(true);
        expect(client.config.hosts[2].isUsable()).toBe(true);

        expect(client.config.topology).toBe('replicaSetWithPrimary');
        client.close();
        await sleep(0);
        expect(client.config.hosts[0].connections.length).toBe(0);
        expect(client.config.hosts[1].connections.length).toBe(0);
        expect(client.config.hosts[2].connections.length).toBe(0);
    });
});

describe('primary - 2 secondaries', () => {

    // await mongoEnv.addReplicaSet('primary', 'secondary2', 1, 1);
    // await mongoEnv.waitUntilBeingSecondary('secondary2');
    //
});
