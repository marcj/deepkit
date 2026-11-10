// All load benchmarks in one run, see harness.ts. The libraries are only loaded by their own processes.
// The target files are named *.target.ts: a file named pg.ts would shadow the package pg for its own import.
import { join } from 'path';

// for `--target`, which installs the packages this file imports: their libraries are loaded by the load processes
import type {} from '@deepkit/broker';
import type {} from '@deepkit/mongo';
import type {} from '@deepkit/postgres';
import type {} from '@deepkit/rpc-tcp';
import type {} from '@deepkit/sqlite';

import { brokerPlan } from './broker-load.js';
import { LoadPlan, LoadSuite, runLoadBenchmarks } from './harness.js';
import { mongoPlan, postgresPlan, sqlitePlan } from './orm-load.js';
import { rpcPlan } from './rpc-load.js';

const libraries: [plan: (library: string) => LoadPlan, file: string, library: string][] = [
    [rpcPlan, 'rpc/deepkit-tcp.target.ts', 'Deepkit (TCP)'],
    [rpcPlan, 'rpc/deepkit-ws.target.ts', 'Deepkit (WebSocket)'],
    [rpcPlan, 'rpc/grpc.target.ts', 'gRPC'],
    [rpcPlan, 'rpc/trpc.target.ts', 'tRPC'],
    [rpcPlan, 'rpc/socket-io.target.ts', 'Socket.IO'],
    [rpcPlan, 'rpc/ws.target.ts', 'ws'],
    [brokerPlan, 'broker/deepkit.target.ts', 'Deepkit Broker'],
    [brokerPlan, 'broker/redis-ioredis.target.ts', 'Redis (ioredis)'],
    [brokerPlan, 'broker/redis-node.target.ts', 'Redis (node-redis)'],
    [brokerPlan, 'broker/valkey-ioredis.target.ts', 'Valkey (ioredis)'],
    [library => brokerPlan(library, true), 'broker/nats.target.ts', 'NATS'],
    [postgresPlan, 'orm/postgres/deepkit.target.ts', 'Deepkit'],
    [postgresPlan, 'orm/postgres/pg.target.ts', 'pg'],
    [postgresPlan, 'orm/postgres/postgres-js.target.ts', 'postgres.js'],
    [postgresPlan, 'orm/postgres/drizzle.target.ts', 'Drizzle'],
    [postgresPlan, 'orm/postgres/prisma.target.ts', 'Prisma'],
    [postgresPlan, 'orm/postgres/typeorm.target.ts', 'TypeORM'],
    [postgresPlan, 'orm/postgres/mikro-orm.target.ts', 'MikroORM'],
    [postgresPlan, 'orm/postgres/sequelize.target.ts', 'Sequelize'],
    [mongoPlan, 'orm/mongo/deepkit.target.ts', 'Deepkit'],
    [mongoPlan, 'orm/mongo/mongodb.target.ts', 'mongodb'],
    [mongoPlan, 'orm/mongo/mongoose.target.ts', 'Mongoose'],
    [mongoPlan, 'orm/mongo/mikro-orm.target.ts', 'MikroORM'],
    [sqlitePlan, 'orm/sqlite/deepkit.target.ts', 'Deepkit'],
    [sqlitePlan, 'orm/sqlite/better-sqlite3.target.ts', 'better-sqlite3'],
    [sqlitePlan, 'orm/sqlite/drizzle.target.ts', 'Drizzle'],
    [sqlitePlan, 'orm/sqlite/prisma.target.ts', 'Prisma'],
    [sqlitePlan, 'orm/sqlite/typeorm.target.ts', 'TypeORM'],
    [sqlitePlan, 'orm/sqlite/mikro-orm.target.ts', 'MikroORM'],
    [sqlitePlan, 'orm/sqlite/sequelize.target.ts', 'Sequelize'],
];

export async function run(): Promise<void> {
    // e.g. LOAD_LIBRARY=rpc/grpc or LOAD_LIBRARY=postgres to run a part of them
    const filter = process.env.LOAD_LIBRARY;
    const selected: LoadSuite[] = libraries
        .filter(([, file]) => !filter || file.includes(filter))
        .map(([plan, file, library]) => ({ file: join(import.meta.dirname, file), plan: plan(library) }));
    await runLoadBenchmarks(selected);
}
