// ORMs and drivers under load: concurrent users in closed loops on a connection pool of the same size for every library,
// on the same tables and rows for every library. See harness.ts.
import Sqlite from 'better-sqlite3';

import {
    Row,
    createRows,
    createRowsWithId,
    mongoUrl,
    postgresUrl,
    resetMongo,
    resetPostgres,
    rowCount,
    sqliteFile,
} from '../orm/shared.js';
import { LoadLevel, LoadPlan, LoadTarget } from './harness.js';

/** Connections per application process, the same for every library. Most libraries default to 10, or 5 to 100. */
export const poolSize = Number(process.env.LOAD_POOL ?? 10);
export const pageSize = 100;

export interface OrmLoadOperations {
    /** a row by its primary key, as object of the library (entity, model, plain object) */
    findOne(id: number): Promise<{ name: string } | null | undefined>;
    /** the next pageSize rows with an id greater than afterId, ordered by id */
    findPage(afterId: number): Promise<{ name: string }[]>;
    /** inserts one row in the insert table and returns its generated primary key */
    insertOne(row: Row): Promise<unknown>;
}

export interface OrmLoadConfig {
    poolSize: number;
    /** SQLite only */
    file?: string;
}

/** One application process with a pool, and four of them, the usual way to scale out a Node.js application. */
export const ormLevels: LoadLevel[] = [
    { label: `16 users, pool ${poolSize}`, processes: 1, clients: 1, callers: 16 },
    { label: `128 users, 4 processes x pool ${poolSize}`, processes: 4, clients: 4, callers: 32 },
];

// SQLite has one writer and runs in the process of the application, so more processes or a pool don't help.
export const sqliteLevels: LoadLevel[] = [{ label: '16 users', processes: 1, clients: 1, callers: 16 }];

export const ormWorkloads = { findOne: 'findOne by id', findPage: 'find 100 rows', insertOne: 'insert one row' };

/** Wraps a library so its results are checked before anything is measured. */
export function ormTarget(connect: (config: OrmLoadConfig) => Promise<OrmLoadOperations>): LoadTarget {
    return {
        async connect(config: OrmLoadConfig) {
            const operations = await connect(config);
            const one = await operations.findOne(rowCount);
            if (!one || one.name !== 'Peter ' + rowCount) throw new Error(`findOne returned ${JSON.stringify(one)}`);
            const page = await operations.findPage(50);
            if (page.length !== pageSize || page[0].name !== 'Peter 51')
                throw new Error(`findPage returned ${page.length} rows, first ${JSON.stringify(page[0])}`);
            if ((await operations.insertOne({ name: 'check', ready: true, priority: 1 })) === undefined)
                throw new Error('insertOne returned no primary key');
            return {
                findOne: i => operations.findOne((i % rowCount) + 1),
                findPage: i => operations.findPage((i * 97) % (rowCount - pageSize)),
                insertOne: i => operations.insertOne({ name: 'Inserted ' + i, ready: i % 2 === 0, priority: i % 10 }),
            };
        },
    };
}

async function postgres<T>(fn: (client: any) => Promise<T>): Promise<T> {
    const { default: pg } = await import('pg');
    const client = new pg.Client(postgresUrl);
    await client.connect();
    try {
        return await fn(client);
    } finally {
        await client.end();
    }
}

function basePlan(suite: string, library: string, levels: LoadLevel[], config: object): LoadPlan {
    return { suite, library, workloads: ormWorkloads, levels, server: false, config: () => config };
}

export function postgresPlan(library: string): LoadPlan {
    return {
        ...basePlan('comparison/orm-postgres-load', library, ormLevels, { poolSize }),
        async prepare() {
            await resetPostgres(true);
            await postgres(async client => {
                const rows = createRows(rowCount);
                await client.query(
                    'INSERT INTO bench_user (name, ready, priority) SELECT * FROM unnest($1::text[], $2::bool[], $3::int[])',
                    [rows.map(v => v.name), rows.map(v => v.ready), rows.map(v => v.priority)],
                );
                await client.query('ANALYZE bench_user');
            });
        },
        async beforeCell(workload) {
            if (workload !== 'insertOne') return;
            await postgres(async client => {
                await client.query('TRUNCATE bench_insert RESTART IDENTITY');
                // so a checkpoint caused by the inserts of the previous library doesn't run during this one
                await client.query('CHECKPOINT');
            });
        },
        databaseConnections: () =>
            postgres(async client => {
                const result = await client.query(
                    'SELECT count(*)::int AS count FROM pg_stat_activity WHERE datname = current_database() AND pid <> pg_backend_pid()',
                );
                return result.rows[0].count;
            }),
    };
}

async function withMongo(fn: (db: any) => Promise<unknown>): Promise<void> {
    const { MongoClient } = await import('mongodb');
    const client = new MongoClient(mongoUrl);
    await client.connect();
    try {
        await fn(client.db());
    } finally {
        await client.close();
    }
}

export function mongoPlan(library: string): LoadPlan {
    return {
        ...basePlan('comparison/orm-mongo-load', library, ormLevels, { poolSize }),
        async prepare() {
            await resetMongo();
            await withMongo(db => db.collection('bench_user').insertMany(createRowsWithId(rowCount)));
        },
        async beforeCell(workload) {
            if (workload === 'insertOne')
                await withMongo(db =>
                    db
                        .collection('bench_insert')
                        .drop()
                        .catch(() => undefined),
                );
        },
        databaseConnections: async () => {
            let count = 0;
            await withMongo(async db => {
                count = (await db.admin().serverStatus()).connections.current;
            });
            return count;
        },
    };
}

const sqliteSchema = `
    CREATE TABLE bench_user (id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL, ready BOOLEAN NOT NULL, priority INTEGER NOT NULL);
    CREATE TABLE bench_insert (id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL, ready BOOLEAN NOT NULL, priority INTEGER NOT NULL);
`;

let sqlitePath: string | undefined;

export function sqlitePlan(library: string): LoadPlan {
    sqlitePath ??= sqliteFile('load');
    const file = sqlitePath;
    return {
        ...basePlan('comparison/orm-sqlite-load', library, sqliteLevels, { poolSize, file }),
        async prepare() {
            const database = new Sqlite(file);
            database.exec(sqliteSchema);
            const insert = database.prepare('INSERT INTO bench_user (name, ready, priority) VALUES (?, ?, ?)');
            database.transaction(() => {
                for (const row of createRows(rowCount)) insert.run(row.name, row.ready ? 1 : 0, row.priority);
            })();
            database.close();
        },
        async beforeCell(workload) {
            if (workload !== 'insertOne') return;
            const database = new Sqlite(file);
            database.exec('DELETE FROM bench_insert');
            database.pragma('wal_checkpoint(TRUNCATE)');
            database.close();
        },
    };
}
