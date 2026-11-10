// Load benchmarks: a library under real concurrent load, instead of one client doing round trips in a loop.
//
// One set of processes per library: optionally one server process (RPC, one Node.js process like most deployments of
// these libraries) and load processes with clients (a connection or a connection pool) and closed-loop callers per
// client: a caller sends its next call when its previous one returned. The workloads and levels of a library run one
// after the other on these processes, which keeps the whole run short, and every cell warms up and is then measured.
// Latencies are recorded in a histogram per load process and merged here. See README.md.
import { ChildProcess, fork } from 'child_process';
import { join } from 'path';

import { BenchSuite, formatHz } from '@deepkit/bench';

// A short window measured the start: pools still opening, code not optimized yet, a freshly reset collection.
// MongoDB inserts varied 60-90% within one second and once dropped to 10 ops/s; with 2s warmup and 3s they
// are within 5-10% and match a 20s run.
export const warmupSeconds = Number(process.env.LOAD_WARMUP ?? 2);
export const measureSeconds = Number(process.env.LOAD_SECONDS ?? 3);
/** Throughput is sampled this often during the measurement, for the deviation between the samples */
const sliceMs = 250;

/** Load processes at most, they share the machine with the server and the database. */
export const maxLoadProcesses = Number(process.env.LOAD_PROCESSES ?? 5);

const startTimeout = 120_000;
const replyTimeout = 30_000;
const stopTimeout = 5_000;

/** One call per workload key. `i` makes the calls of a caller differ from each other. */
export type LoadCalls = { [workload: string]: (i: number) => Promise<unknown> };

export interface LoadTarget {
    /** Starts the server of the library in this process. */
    serve?(config: any): Promise<unknown>;
    /** A client: a connection (RPC) or a connection pool (ORM). Fails if the library returns wrong results. */
    connect(config: any): Promise<LoadCalls>;
}

export interface LoadLevel {
    /** Part of the benchmark name */
    label: string;
    /** Load processes */
    processes: number;
    /** Clients over all load processes */
    clients: number;
    /** Callers per client, i.e. in-flight calls of a client */
    callers: number;
}

export interface LoadPlan {
    /** Name of the suite in the result file */
    suite: string;
    library: string;
    /** key -> name in the result file */
    workloads: { [key: string]: string };
    levels: LoadLevel[];
    /** Whether the target has a server process */
    server: boolean;
    /** Given to the server and the clients of each process. */
    config(): object;
    /** Once for all libraries of the suite */
    prepare?(): Promise<void>;
    /** Before every cell, e.g. to empty the insert table */
    beforeCell?(workload: string): Promise<void>;
    /** Connections the database has open, sampled in the middle of the measurement to check the pool sizes. */
    databaseConnections?(): Promise<number>;
}

// ---- latency histogram -----

const linearBuckets = 64;
const subBuckets = 32;
const histogramSize = linearBuckets + 26 * subBuckets;

/** Log-linear histogram of microseconds, about 3% resolution, merged by adding counts. */
export class LatencyHistogram {
    counts = new Array<number>(histogramSize).fill(0);
    total = 0;
    sum = 0;
    max = 0;

    static index(us: number): number {
        if (us < linearBuckets) return us;
        const exponent = 31 - Math.clz32(us);
        const shift = exponent - 5;
        return linearBuckets + (exponent - 6) * subBuckets + (us >>> shift) - subBuckets;
    }

    /** Middle of the bucket in microseconds */
    static value(index: number): number {
        if (index < linearBuckets) return index;
        const exponent = 6 + Math.floor((index - linearBuckets) / subBuckets);
        const shift = exponent - 5;
        const sub = (index - linearBuckets) % subBuckets;
        return (subBuckets + sub + 0.5) * 2 ** shift;
    }

    /** @param ms duration in milliseconds */
    record(ms: number): void {
        const us = Math.min(0x7fffffff, Math.round(ms * 1000));
        this.counts[LatencyHistogram.index(us)]++;
        this.total++;
        this.sum += ms;
        if (ms > this.max) this.max = ms;
    }

    merge(other: LatencyHistogram): void {
        for (let i = 0; i < histogramSize; i++) this.counts[i] += other.counts[i];
        this.total += other.total;
        this.sum += other.sum;
        if (other.max > this.max) this.max = other.max;
    }

    /** @returns milliseconds */
    percentile(fraction: number): number {
        if (!this.total) return 0;
        const target = Math.ceil(this.total * fraction);
        let seen = 0;
        for (let i = 0; i < histogramSize; i++) {
            seen += this.counts[i];
            if (seen >= target) return LatencyHistogram.value(i) / 1000;
        }
        return this.max;
    }

    get mean(): number {
        return this.total ? this.sum / this.total : 0;
    }

    static from(data: { counts: number[]; total: number; sum: number; max: number }): LatencyHistogram {
        const histogram = new LatencyHistogram();
        Object.assign(histogram, data);
        return histogram;
    }
}

// ---- messages between this process and load-process.ts -----

export interface ProcessStats {
    /** of one core, includes GC and other threads of the process */
    cpuPercent: number;
    gcMs: number;
    /** time in GC of the measured time */
    gcPercent: number;
    rssMb: number;
}

export interface LoadReport {
    ops: number;
    seconds: number;
    errors: number;
    firstError?: string;
    histogram: { counts: number[]; total: number; sum: number; max: number };
    /** calls per second of each slice of the measurement */
    slices: number[];
    stats: ProcessStats;
}

class Child {
    protected process: ChildProcess;
    protected waiters: { type: string; resolve: (v: any) => void; reject: (e: Error) => void }[] = [];
    protected exit = false;

    constructor(role: string, target: string, config: object) {
        this.process = fork(join(import.meta.dirname, 'load-process.ts'), [target, role, JSON.stringify(config)], {
            execArgv: process.execArgv,
            env: { ...process.env, NODE_NO_WARNINGS: '1' },
            stdio: ['ignore', 'inherit', 'inherit', 'ipc'],
        });
        this.process.on('message', (message: any) => {
            if (message.type === 'failed') {
                this.fail(new Error(message.error));
                return;
            }
            const index = this.waiters.findIndex(v => v.type === message.type);
            if (index === -1) return;
            this.waiters.splice(index, 1)[0].resolve(message);
        });
        this.process.on('exit', code => {
            this.exit = true;
            this.fail(new Error(`${role} process exited with code ${code}`));
        });
    }

    protected fail(error: Error): void {
        for (const waiter of this.waiters.splice(0)) waiter.reject(error);
    }

    send(message: object): void {
        if (!this.exit) this.process.send!(message);
    }

    wait<T = any>(type: string, timeout: number): Promise<T> {
        return new Promise<T>((resolve, reject) => {
            if (this.exit) return reject(new Error(`${type}: process already exited`));
            const timer = setTimeout(() => reject(new Error(`no ${type} within ${timeout} ms`)), timeout);
            this.waiters.push({
                type,
                resolve: v => {
                    clearTimeout(timer);
                    resolve(v);
                },
                reject: e => {
                    clearTimeout(timer);
                    reject(e);
                },
            });
        });
    }

    async kill(): Promise<void> {
        if (this.exit) return;
        await new Promise<void>(resolve => {
            this.process.once('exit', () => resolve());
            this.process.kill('SIGKILL');
        });
    }
}

const sleep = (ms: number) => new Promise<void>(resolve => setTimeout(resolve, ms));

export function distribute(total: number, buckets: number): number[] {
    return Array.from({ length: buckets }, (_, i) => Math.floor(total / buckets) + (i < total % buckets ? 1 : 0));
}

export interface CellResult {
    hz: number;
    rme: number;
    mean: number;
    iterations: number;
    load: { [name: string]: unknown };
}

async function runCell(
    plan: LoadPlan,
    workload: string,
    level: LoadLevel,
    server: Child | undefined,
    loads: Child[],
    sampleConnections: boolean,
): Promise<CellResult> {
    if (plan.beforeCell) await plan.beforeCell(workload);
    const clients = distribute(level.clients, level.processes);
    loads.forEach((load, i) => load.send({ type: 'start', workload, clients: clients[i], callers: level.callers }));
    await sleep(warmupSeconds * 1000);

    const measured = server ? [server, ...loads] : loads;
    for (const child of measured) child.send({ type: 'measure' });
    const slices = Math.max(1, Math.round((measureSeconds * 1000) / sliceMs));
    let databaseConnections: number | undefined;
    for (let i = 1; i <= slices; i++) {
        await sleep(sliceMs);
        if (sampleConnections && i === Math.ceil(slices / 2))
            databaseConnections = await plan.databaseConnections?.().catch(() => undefined);
        if (i < slices) for (const load of loads) load.send({ type: 'mark' });
    }

    const reported = Promise.all([
        Promise.all(loads.map(v => v.wait<LoadReport & { type: string }>('report', replyTimeout))),
        server ? server.wait<ProcessStats & { type: string }>('report', replyTimeout) : undefined,
    ]);
    for (const child of measured) child.send({ type: 'report' });
    const [reports, serverStats] = await reported;

    const stopped = Promise.all(loads.map(v => v.wait('stopped', stopTimeout + replyTimeout)));
    for (const load of loads) load.send({ type: 'stop' });
    await stopped;
    return summarize(reports, serverStats, level, databaseConnections);
}

function round(value: number, digits: number = 2): number {
    const factor = 10 ** digits;
    return Math.round(value * factor) / factor;
}

function summarize(
    reports: LoadReport[],
    serverStats: ProcessStats | undefined,
    level: LoadLevel,
    databaseConnections: number | undefined,
): CellResult {
    const histogram = new LatencyHistogram();
    for (const report of reports) histogram.merge(LatencyHistogram.from(report.histogram));
    const ops = reports.reduce((sum, v) => sum + v.ops, 0);
    const hz = reports.reduce((sum, v) => sum + v.ops / v.seconds, 0);
    const errors = reports.reduce((sum, v) => sum + v.errors, 0);
    const firstError = reports.find(v => v.firstError)?.firstError;

    const sliceCount = Math.min(...reports.map(v => v.slices.length));
    const slices = Array.from({ length: sliceCount }, (_, i) => reports.reduce((sum, v) => sum + v.slices[i], 0));
    const mean = slices.reduce((a, b) => a + b, 0) / slices.length || 1;
    const variance = slices.reduce((a, b) => a + (b - mean) ** 2, 0) / slices.length;

    const statsOf = (stats: ProcessStats[]) => ({
        cpuPercent: round(Math.max(...stats.map(v => v.cpuPercent)), 1),
        gcMs: round(
            stats.reduce((sum, v) => sum + v.gcMs, 0),
            1,
        ),
        gcPercent: round(stats.reduce((sum, v) => sum + v.gcPercent, 0) / stats.length, 2),
        rssMb: round(Math.max(...stats.map(v => v.rssMb)), 1),
    });

    return {
        hz,
        rme: mean > 0 ? (Math.sqrt(variance) / mean) * 100 : 0,
        // the mean latency in ms, not 1/hz: the calls run concurrently
        mean: histogram.mean,
        iterations: ops,
        load: {
            processes: level.processes,
            clients: level.clients,
            callers: level.callers,
            inFlight: level.clients * level.callers,
            seconds: measureSeconds,
            warmupSeconds,
            p50: round(histogram.percentile(0.5), 3),
            p90: round(histogram.percentile(0.9), 3),
            p99: round(histogram.percentile(0.99), 3),
            p999: round(histogram.percentile(0.999), 3),
            max: round(histogram.max, 3),
            errors,
            firstError,
            server: serverStats ? statsOf([serverStats]) : undefined,
            loadProcesses: statsOf(reports.map(v => v.stats)),
            databaseConnections,
        },
    };
}

function format(result: CellResult): string {
    const load = result.load as any;
    const server = load.server;
    const client = load.loadProcesses;
    const parts = [
        `${formatHz(result.hz).padStart(9)} ops/s`,
        `p50 ${load.p50.toFixed(2).padStart(8)} ms`,
        `p99 ${load.p99.toFixed(2).padStart(9)} ms`,
        server
            ? `server cpu ${server.cpuPercent.toFixed(0).padStart(3)}% gc ${server.gcPercent.toFixed(1)}%`
            : `app gc ${client.gcPercent.toFixed(1)}%`,
        `load cpu ${client.cpuPercent.toFixed(0).padStart(3)}%`,
    ];
    if (load.errors) parts.push(`${load.errors} errors: ${load.firstError}`);
    return parts.join('  ');
}

export interface LoadSuite {
    /** The file with the `target` of the library */
    file: string;
    plan: LoadPlan;
}

export interface LibraryTime {
    suite: string;
    library: string;
    startup: number;
    total: number;
}

function failedCell(message: string, level: LoadLevel): CellResult {
    return {
        hz: 0,
        rme: 0,
        mean: 0,
        iterations: 0,
        load: { error: message, processes: level.processes, clients: level.clients, callers: level.callers },
    };
}

/**
 * Runs all cells of a library on one set of processes. A failing cell or library is reported with hz 0 and its error, so
 * it can't be silently missing from the results while the other libraries still run.
 */
async function runLibrary({ file, plan }: LoadSuite, results: { [name: string]: CellResult }): Promise<LibraryTime> {
    const started = performance.now();
    console.log(`\n━━━ ${plan.suite}: ${plan.library} ━━━\n`);
    const onlyLevel = process.env.LOAD_LEVEL;
    const levels =
        onlyLevel === undefined
            ? plan.levels
            : plan.levels.filter((_, i) => i === (Number(onlyLevel) + plan.levels.length) % plan.levels.length);
    const processes = Math.max(...levels.map(v => v.processes));
    const nameOf = (workloadName: string, level: LoadLevel) => `${plan.library}: ${workloadName}, ${level.label}`;

    const config = plan.config();
    let server: Child | undefined;
    const loads: Child[] = [];
    let startup = 0;

    const report = (name: string, result: CellResult) => {
        results[name] = result;
        if (result.load.error) console.error(`  ✗ ${name}: ${result.load.error}`);
    };

    try {
        if (plan.server) server = new Child('server', file, config);
        for (let processIndex = 0; processIndex < processes; processIndex++)
            loads.push(new Child('load', file, { config, processIndex }));
        // started in parallel, the clients only connect when the server is ready
        await Promise.all([server, ...loads].filter(v => v !== undefined).map(v => v!.wait('ready', startTimeout)));
        startup = performance.now() - started;

        for (const level of levels) {
            const active = loads.slice(0, level.processes);
            try {
                const clients = distribute(level.clients, level.processes);
                await Promise.all(
                    active.map((load, i) => {
                        const connected = load.wait('connected', startTimeout);
                        load.send({ type: 'connect', clients: clients[i] });
                        return connected;
                    }),
                );
            } catch (error) {
                for (const name of Object.values(plan.workloads))
                    report(
                        nameOf(name, level),
                        failedCell(error instanceof Error ? error.message : String(error), level),
                    );
                continue;
            }

            const workloads = Object.entries(plan.workloads);
            for (const [index, [workload, workloadName]] of workloads.entries()) {
                const name = nameOf(workloadName, level);
                try {
                    const result = await runCell(plan, workload, level, server, active, index === workloads.length - 1);
                    console.log(`  ${name.padEnd(68)} ${format(result)}`);
                    if (result.iterations === 0)
                        result.load.error = (result.load.firstError as string) || 'no call finished';
                    report(name, result);
                } catch (error) {
                    report(name, failedCell(error instanceof Error ? error.message : String(error), level));
                }
            }
        }
    } catch (error) {
        // the processes did not start
        const message = error instanceof Error ? error.message : String(error);
        for (const level of levels)
            for (const name of Object.values(plan.workloads)) report(nameOf(name, level), failedCell(message, level));
    } finally {
        await Promise.all([server, ...loads].filter(v => v !== undefined).map(v => v!.kill()));
    }
    const time = {
        suite: plan.suite,
        library: plan.library,
        startup: startup / 1000,
        total: (performance.now() - started) / 1000,
    };
    console.log(
        `  ${plan.library}: ${time.total.toFixed(1)} s, ${time.startup.toFixed(1)} s of that to start the processes`,
    );
    return time;
}

/** Runs the libraries one after the other and hands the results to the benchmark runner, grouped by suite. */
export async function runLoadBenchmarks(libraries: LoadSuite[]): Promise<void> {
    const suites = new Map<string, { [name: string]: CellResult }>();
    const prepared = new Set<string>();
    const times: LibraryTime[] = [];
    const started = performance.now();
    for (const library of libraries) {
        if (!suites.has(library.plan.suite)) suites.set(library.plan.suite, {});
        if (!prepared.has(library.plan.suite)) {
            prepared.add(library.plan.suite);
            await library.plan.prepare?.();
        }
        times.push(await runLibrary(library, suites.get(library.plan.suite)!));
    }

    console.log(`\nTime per library:`);
    for (const time of times)
        console.log(
            `  ${(time.suite + ': ' + time.library).padEnd(50)} ${time.total.toFixed(1).padStart(6)} s (start ${time.startup.toFixed(1)} s)`,
        );
    console.log(`  total ${((performance.now() - started) / 1000).toFixed(1)} s`);

    for (const [suite, results] of suites) BenchSuite.onComplete?.(suite, results as any);
}
