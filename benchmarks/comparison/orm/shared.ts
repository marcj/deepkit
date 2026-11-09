// The same operations for every ORM and driver, so the results are comparable.
import Sqlite from 'better-sqlite3';
import { existsSync, unlinkSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';

import { BenchSuite } from '@deepkit/bench';

/** rows in the table that is queried */
export const rowCount = 10_000;
/** rows inserted per iteration of the insert benchmark */
export const insertCount = 1_000;

export interface Row {
    name: string;
    ready: boolean;
    priority: number;
}

export function createRows(count: number, prefix: string = 'Peter'): Row[] {
    const rows: Row[] = [];
    for (let i = 1; i <= count; i++) rows.push({ name: prefix + ' ' + i, ready: i % 2 === 0, priority: i % 10 });
    return rows;
}

export interface OrmOperations {
    /** a row by its primary key, as object of the library (entity, model, plain object) */
    findOne(id: number): Promise<{ name: string } | null | undefined>;
    /** all rows of the table */
    findAll(): Promise<unknown[]>;
    /** inserts the rows into the insert table */
    insertMany(rows: Row[]): Promise<void>;
    /** deletes all rows of the insert table */
    deleteInserted(): Promise<void>;
    close?(): Promise<void>;
}

/** A new SQLite database file in the temp folder. */
export function sqliteFile(library: string): string {
    const file = join(tmpdir(), `deepkit-bench-orm-${library}-${process.pid}.sqlite`);
    for (const suffix of ['', '-wal', '-shm', '-journal']) if (existsSync(file + suffix)) unlinkSync(file + suffix);
    // WAL is stored in the file, so every library runs in the same mode
    const database = new Sqlite(file);
    database.pragma('journal_mode = WAL');
    database.close();
    return file;
}

/**
 * The benchmarks of one library. Checks the results first, so a broken setup fails instead of
 * measuring nothing.
 */
export async function ormSuite(database: string, library: string, operations: OrmOperations): Promise<BenchSuite> {
    const all = await operations.findAll();
    if (all.length !== rowCount) throw new Error(`${library}: expected ${rowCount} rows, got ${all.length}`);
    const one = await operations.findOne(rowCount);
    if (!one || one.name !== 'Peter ' + rowCount) throw new Error(`${library}: findOne returned ${JSON.stringify(one)}`);

    const suite = new BenchSuite('comparison/orm-' + database);
    const insertRows = createRows(insertCount, 'Inserted');
    let id = 0;

    suite.add(`${library}: findOne by id`, async () => {
        await operations.findOne((id++ % rowCount) + 1);
    });
    suite.add(`${library}: find 10,000 rows`, async () => {
        await operations.findAll();
    });
    suite.add(`${library}: insert 1,000 rows`, async () => {
        await operations.insertMany(insertRows);
    }, { afterEach: operations.deleteInserted });

    if (operations.close) {
        const runAsync = suite.runAsync.bind(suite);
        suite.runAsync = async (...args) => {
            try {
                return await runAsync(...args);
            } finally {
                await operations.close!();
            }
        };
    }
    return suite;
}

export const postgresUrl = process.env.POSTGRES_URL || 'postgres://postgres@localhost:5432/deepkit_bench';

/** Drops the tables of the benchmark and creates them again, unless the library creates them itself. */
export async function resetPostgres(createTables: boolean): Promise<void> {
    const { default: pg } = await import('pg');
    const client = new pg.Client(postgresUrl);
    await client.connect();
    await client.query('DROP TABLE IF EXISTS bench_user, bench_insert');
    if (createTables) {
        for (const table of ['bench_user', 'bench_insert']) {
            await client.query(`CREATE TABLE ${table} (id SERIAL PRIMARY KEY, name TEXT NOT NULL, ready BOOLEAN NOT NULL, priority INTEGER NOT NULL)`);
        }
    }
    await client.end();
}

export const mongoUrl = process.env.MONGO_URL || 'mongodb://127.0.0.1:27017/deepkit_bench?directConnection=true';

/** Drops the collections of the benchmark. */
export async function resetMongo(): Promise<void> {
    const { MongoClient } = await import('mongodb');
    const client = new MongoClient(mongoUrl);
    await client.connect();
    for (const name of ['bench_user', 'bench_insert']) await client.db().collection(name).drop().catch(() => undefined);
    await client.close();
}

/** The rows with the primary keys 1 to count, so they can be queried by id. */
export function createRowsWithId(count: number): (Row & { _id: number })[] {
    return createRows(count).map((row, i) => ({ _id: i + 1, ...row }));
}
