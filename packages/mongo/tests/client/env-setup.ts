import { uuid } from '@deepkit/type';
import { ChildProcess, spawn, spawnSync } from 'child_process';
import { existsSync, mkdirSync } from 'fs';
import { asyncOperation, sleep } from '@deepkit/core';
import { createConnection, Server, Socket } from 'net';
import { connect, createServer } from 'node:net';
import { rmSync } from 'node:fs';
import { MongoClient } from '../../src/client/client.js';
import { ConsoleLogger, LoggerLevel } from '@deepkit/logger';
import { EventDispatcher } from '@deepkit/event';
import { onMongoNewHost } from '../../src/client/connection.js';

export function createMongoClientFactory(mongoEnv: MongoEnv) {
    const clients: MongoClient[] = [];
    const fn = (url: string) => {
        const logger = new ConsoleLogger();
        logger.level = LoggerLevel.debug;

        const eventDispatcher = new EventDispatcher();
        eventDispatcher.listen(onMongoNewHost, (event) => {
            const [name] = event.data.host.id.split(':');
            const instance = mongoEnv.getInstanceByName(name);
            if (!instance) return;
            event.data.host.hostname = '127.0.0.1';
            event.data.host.port = instance.proxyPort;
        });

        const client = new MongoClient(url, eventDispatcher, logger);
        clients.push(client);
        return client;
    };
    fn.closeAll = () => {
        for (const client of clients) {
            client.close();
        }
    };

    return fn;
}


export class MongoInstance {
    proxy?: Server;

    constructor(
        public name: string,
        public port: number,
        public process: ChildProcess,
    ) {
    }

    async startProxy() {
        if (this.proxy?.listening) this.proxy.close();

        const proxy = this.proxy = createServer(async (clientSocket) => {
            await sleep(this.connectionDelay);
            if (this.connectionDrop) {
                clientSocket.destroy();
                return;
            }

            this.connections.push(clientSocket);
            const mongoSocket = connect(this.port, 'localhost');

            if (this.connectionDropAfterBytes) {
                let totalBytes = 0;
                clientSocket.on('data', (data) => {
                    totalBytes += data.length;
                    if (totalBytes >= this.connectionDropAfterBytes) {
                        clientSocket.destroy();
                    }
                });
            }
            clientSocket.pipe(mongoSocket);
            mongoSocket.pipe(clientSocket);

            clientSocket.on('close', () => {
                mongoSocket.end();
                this.connections.splice(this.connections.indexOf(clientSocket), 1);
            });

            mongoSocket.on('close', () => {
                clientSocket.end();
            });
        });

        await new Promise<void>((resolve) => {
            proxy.listen(this.proxyPort, () => {
                this.proxyPort ||= (proxy.address() as { port: number }).port;
                resolve();
            });
        });
    }

    async reset() {
        this.closeConnections();
        this.connectionDelay = 0;
        this.connectionDrop = false;
        this.connectionDropAfterBytes = 0;
        if (!this.proxy) {
            await this.startProxy();
        }
    }

    stopProxy() {
        this.closeConnections();
        this.proxy?.close();
        this.proxy = undefined;
    }

    proxyPort: number = 0;
    connections: Socket[] = [];

    connectionDelay: number = 0;
    connectionDrop = false;

    connectionDropAfterBytes: number = 0;

    closeConnections() {
        for (const connection of this.connections) {
            connection.destroy();
        }
        this.connections = [];
    }

    public getUrl(): string {
        return `mongodb://127.0.0.1:${this.proxyPort}`;
    }
}

const portRangeStart = Number(process.env.MONGO_PORT_RANGE_START || 27000);
const mongoImage = process.env.MONGO_IMAGE || 'mongo:5';

export class MongoEnv {
    protected reservedPorts: number[] = [];
    protected instances = new Map<string, MongoInstance>();
    protected tempFolder = `/tmp/mongo-env/` + uuid();

    constructor(
        protected name: string = 'default',
        protected startPort: number = portRangeStart,
    ) {
        mkdirSync(this.tempFolder, { recursive: true });
    }

    async reset() {
        for (const instance of this.instances.values()) {
            await instance.reset();
        }
    }

    async closeAll() {
        for (const p of this.instances.values()) {
            p.stopProxy();
            spawnSync('docker', ['rm', '-v', '-f', `mongo-env-${p.name}`], {});
            if (!p.process.killed) {
                p.process.kill();
            }
        }

        this.instances.clear();

        if (existsSync(this.tempFolder)) {
            rmSync(this.tempFolder, { recursive: true });
        }
        await sleep(0);
    }

    protected getInstance(name: string): MongoInstance {
        const instance = this.instances.get(name);
        if (!instance) throw new Error(`No mongo instance with name ${name} found`);
        return instance;
    }

    public async addReplicaSet(host: string, member: string, priority: number, votes: number): Promise<any> {
        const instance = this.getInstance(member);
        const line = { host: instance.name, priority: priority, votes: votes };
        await this.execute(host, `rs.add(${JSON.stringify(line)})`);
    }

    public async waitUntilBeingPrimary(name: string): Promise<any> {
        await this.wait(name, 'db.isMaster()', (res: any) => res.ismaster, 'never became primary');
    }

    public async waitUntilBeingSecondary(name: string): Promise<any> {
        await this.wait(name, 'db.isMaster()', (res: any) => res.secondary, 'never became secondary');
    }

    protected async wait(name: string, cmd: string, checker: (res: any) => boolean, errorMessage: string) {
        for (let i = 0; i < 300; i++) {
            const res = await this.executeJson(name, cmd);
            if (checker(res)) return;
            await sleep(0.3);
        }
        console.log(await this.execute('primary', 'rs.status()'));
        console.log(await this.execute(name, 'rs.status()'));
        throw new Error(`${name}: ${errorMessage}`);
    }

    public async executeJson(name: string, cmd: string): Promise<any> {
        const res = await this.execute(name, cmd);
        try {
            return JSON.parse(res);
        } catch (error) {
            console.log('Could not parse JSON: ' + res);
        }
    }

    protected isPortReserved(port: number): boolean {
        return this.reservedPorts.includes(port);
    }

    protected releasePort(port: number) {
        const index = this.reservedPorts.indexOf(port);
        if (index !== -1) {
            this.reservedPorts.splice(index, 1);
        }
    }

    protected getFreePort(): number {
        for (let i = this.startPort; i < this.startPort + 1000; i++) {
            if (!this.isPortReserved(i)) {
                this.reservedPorts.push(i);
                return i;
            }
        }
        throw new Error('Could not find free port');
    }

    stop(name: string) {
        const args: string[] = [
            'stop',
            `mongo-env-${name}`,
        ];

        console.log(name, 'execute: docker ' + args.join(' '));
        spawnSync('docker', args, {
            stdio: 'inherit',
        });
    }

    protected async ensureNetwork() {
        const args: string[] = [
            'network',
            'create',
            '--attachable',
            'mongo-env',
        ];

        spawnSync('docker', args, {
            encoding: 'utf8',
        });
    }

    public getInstanceByName(name: string): MongoInstance | undefined {
        return this.instances.get(name);
    }

    public async execute(name: string, cmd: string) {
        const instance = this.getInstance(name);

        const args: string[] = [
            'run',
            '--rm',
            '--network', 'mongo-env',
            mongoImage,
            'mongosh',
            '--eval', cmd,
            '--quiet',
            '--json', 'canonical',
            '--host', instance.name,
        ];

        // console.log(name, 'execute: docker ' + args.join(' '));
        const res = spawnSync('docker', args, {
            encoding: 'utf8',
        });
        if (res.status !== 0) {
            console.error('command stderr:', res.stderr);
            throw new Error(`Could not execute on ${name} command "${cmd}": ${res.stderr} ${res.stdout}`);
        }
        return res.stdout;
    }

    public async ensureDestroyed(name: string) {
        spawnSync('docker', ['rm', '-f', `mongo-env-${name}`], {});
    }

    public async addMongo(name: string = '', replSet?: string): Promise<MongoInstance> {
        const port = this.getFreePort();
        if (!name) name = 'mongo' + port;

        await this.ensureNetwork();

        await this.ensureDestroyed(name);

        const containerName = `mongo-env-${name}`;

        const args: string[] = [
            'run',
            '--rm',
            '--init',
            '--hostname', name,
            '--name', containerName,
            '--network', 'mongo-env',
            '-p', `${port}:27017`,
            '--add-host=host.docker.internal:host-gateway',
            mongoImage,
            '--bind_ip_all',
        ];

        if (replSet) args.push('--replSet', replSet);

        // console.log(name, 'execute: docker ' + args.join(' '));
        const p = spawn('docker', args, {
            // stdio: 'ignore',
            stdio: 'pipe',
        });
        p.stderr.pipe(process.stderr);

        const instance = new MongoInstance(
            name,
            port,
            p,
        );
        const stdoutBuffer: string[] = [];

        const listening = asyncOperation<void>((resolve, reject) => {
            let done = false;
            p.on('exit', (code) => {
                if (code !== 0) {
                    if (!done) {
                        console.log(containerName, stdoutBuffer.join(''));
                        reject(new Error(`Mongo exited with code ${code}`));
                    }
                }
                instance.proxy?.close();
                this.releasePort(port);
                this.instances.delete(name);
            });

            p.stdout.on('data', (data) => {
                stdoutBuffer.push(data.toString());
                if (data.toString().includes('Listening on')) {
                    done = true;
                    resolve();
                }
            });
        });

        await listening;

        await instance.startProxy();

        this.instances.set(name, instance);

        //wait for up
        for (let i = 0; i < 100; i++) {
            const connected = await new Promise<boolean>((resolve) => {
                const connection = createConnection(instance.port);
                connection.on('error', () => {
                    connection.destroy();
                    resolve(false);
                });
                connection.on('connect', () => {
                    connection.destroy();
                    resolve(true);
                });
            });
            if (connected) {
                return instance;
            }

            await sleep(0.1);
        }
        p.kill();
        this.instances.delete(name);
        throw new Error(`Could not boot ${name} at ${instance.port}`);
    }
}
