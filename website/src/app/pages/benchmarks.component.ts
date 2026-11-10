import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import { FooterComponent } from '@app/app/components/footer.component.js';
import { HeaderComponent } from '@app/app/components/header.component.js';
import { HighlightCodeComponent } from '@app/app/components/highlight-code.component.js';
import { AppDescription, AppTitle } from '@app/app/components/title.js';
import benchmarkData from '@app/app/benchmarks/benchmark-data.json';

interface BenchmarkRun {
    label: string;
    commit?: string;
    date: string;
    release: boolean;
    /** commits that can change the numbers since this one, for commits of master */
    behind?: number;
    /** installed versions of the compared libraries in this run */
    libraries?: { [name: string]: string };
}

interface Benchmark {
    name: string;
    /** operations per second, per run */
    hz: (number | null)[];
    /** relative margin of error in percent, per run */
    rme: (number | null)[];
}

interface Suite {
    name: string;
    file: string;
    benchmarks: Benchmark[];
}

/** A value per run, without and with the type compiler */
interface BuildSeries {
    plain: (number | null)[];
    reflected: (number | null)[];
}

/** Emitted size and build time of a pinned codebase */
interface Build {
    name: string;
    files: number;
    lines: number;
    bytes: BuildSeries;
    gzip: BuildSeries;
    /** ms of type check and emit */
    time: BuildSeries;
    /** largest deviation of the build time from its median in percent */
    rme: BuildSeries;
}

interface BenchmarkData {
    machine?: { hostname: string; cpu: string; cores: number; platform: string; node: string };
    runs: BenchmarkRun[];
    suites: Suite[];
    builds?: Build[];
}

const data = benchmarkData as BenchmarkData;

export function formatOps(hz: number): string {
    if (hz >= 1e6) return (hz / 1e6).toFixed(hz >= 1e8 ? 0 : 1) + 'M';
    if (hz >= 1e3) return (hz / 1e3).toFixed(hz >= 1e5 ? 0 : 1) + 'K';
    return hz.toFixed(hz >= 100 ? 0 : 1);
}

export function formatBytes(bytes: number): string {
    if (bytes >= 1e6) return (bytes / 1e6).toFixed(2) + ' MB';
    if (bytes >= 1e3) return (bytes / 1e3).toFixed(1) + ' KB';
    return bytes + ' B';
}

export function formatMilliseconds(ms: number): string {
    return ms >= 1000 ? (ms / 1000).toFixed(2) + ' s' : ms.toFixed(0) + ' ms';
}

/** Overhead of the type compiler in percent, undefined if not measured in this run. */
function overhead(series: BuildSeries, run: number): number | undefined {
    const plain = series.plain[run], reflected = series.reflected[run];
    return plain && reflected ? (reflected / plain - 1) * 100 : undefined;
}

const formatPercent = (value: number) => '+' + value.toFixed(1) + '%';

/** How a trend of a value where lower is better, like a size, is shown. */
export interface TrendMetric {
    format(value: number): string;
    change(value: number, base: number): string;
}

const overheadMetric: TrendMetric = {
    format: formatPercent,
    change: (value, base) => `${value >= base ? '+' : ''}${(value - base).toFixed(1)} points`,
};

const buildTimeMetric: TrendMetric = {
    format: formatMilliseconds,
    change: (value, base) => `${value >= base ? '+' : ''}${((value / base - 1) * 100).toFixed(1)}%`,
};

export function formatTime(hz: number): string {
    const ns = 1e9 / hz;
    if (ns < 1000) return ns.toFixed(ns < 10 ? 1 : 0) + ' ns';
    const us = ns / 1000;
    if (us < 1000) return us.toFixed(us < 10 ? 1 : 0) + ' µs';
    const ms = us / 1000;
    return ms.toFixed(ms < 10 ? 1 : 0) + ' ms';
}

/** Small changes in percent, from 10% on as factor. */
export function formatChange(percent: number): string {
    if (Math.abs(percent) < 10) return `${percent >= 0 ? '+' : ''}${percent.toFixed(1)}%`;
    const factor = 1 + percent / 100;
    return factor >= 1 ? `${factor.toFixed(1)}× faster` : `${(1 / factor).toFixed(1)}× slower`;
}

/** Change in percent of b to a, undefined if one is missing; noise if within twice the margin of error, like `npm run bench -- --compare`. */
export function change(benchmark: Benchmark, a: number, b: number): { percent: number; noise: boolean } | undefined {
    const before = benchmark.hz[a], after = benchmark.hz[b];
    if (!before || !after) return;
    const percent = (after / before - 1) * 100;
    const rme = Math.max(benchmark.rme[a] || 0, benchmark.rme[b] || 0);
    return { percent, noise: Math.abs(percent) <= rme * 2 };
}

/** npm package of a library as it is labelled in the charts, for its version in the result files */
const libraryPackages: { [label: string]: string } = {
    'typia': 'typia',
    'typia (AOT)': 'typia',
    'typia json.stringify': 'typia',
    'Zod': 'zod',
    'Valibot': 'valibot',
    'TypeBox': '@sinclair/typebox',
    'ArkType': 'arktype',
    'class-validator': 'class-validator',
    'class-transformer': 'class-transformer',
    'bson serialize': 'bson',
    'bson deserialize': 'bson',
    'Prisma': 'prisma',
    'Drizzle': 'drizzle-orm',
    'TypeORM': 'typeorm',
    'MikroORM': '@mikro-orm/core',
    'gRPC': '@grpc/grpc-js',
    'Redis (ioredis)': 'ioredis',
    'Redis (node-redis)': 'redis',
    'Valkey (ioredis)': 'ioredis',
    'NATS': '@nats-io/transport-node',
    'tRPC': '@trpc/server',
    'Socket.IO': 'socket.io',
    'ws (no framework)': 'ws',
    'Sequelize': 'sequelize',
    'Mongoose': 'mongoose',
    'mongodb': 'mongodb',
    'mongodb (driver)': 'mongodb',
    'pg': 'pg',
    'pg (driver)': 'pg',
    'postgres.js': 'postgres',
    'postgres.js (driver)': 'postgres',
    'better-sqlite3': 'better-sqlite3',
    'better-sqlite3 (driver)': 'better-sqlite3',
};

/** Version of the library with the given chart label in a run, undefined for Deepkit and unknown labels. */
function libraryVersion(label: string, runIndex: number): string | undefined {
    const name = libraryPackages[label];
    return name ? data.runs[runIndex]?.libraries?.[name] : undefined;
}

/** The given benchmarks of a suite in the latest measured run (master), labelled for a chart. */
export function latestChartEntries(suiteName: string, benchmarks: Record<string, string>): ChartEntry[] {
    let index = data.runs.length - 1;
    while (index > 0 && data.runs[index].release) index--;
    const suite = data.suites.find(v => v.name === suiteName);
    const entries: ChartEntry[] = [];
    for (const [name, label] of Object.entries(benchmarks)) {
        const hz = suite?.benchmarks.find(v => v.name === name)?.hz[index];
        if (hz) entries.push({ label, hz, highlight: label.startsWith('Deepkit'), version: libraryVersion(label, index) });
    }
    return entries;
}

export interface ChartEntry {
    label: string;
    hz: number;
    highlight: boolean;
    /** a raw database driver, the lower bound and no competitor */
    baseline?: boolean;
    /** version of a compared library */
    version?: string;
}

@Component({
    selector: 'benchmark-chart',
    changeDetection: ChangeDetectionStrategy.OnPush,
    host: { '[class.compact]': 'compact()' },
    template: `
        <h3>{{ title() }}</h3>
        @if (description()) {
            <p class="description">{{ description() }}</p>
        }
        <div class="chart">
            @for (entry of entries(); track entry.label) {
                <div class="row" [class.highlight]="entry.highlight" [class.baseline]="entry.baseline">
                    <div class="label" [attr.title]="entry.version ? entry.label + ' ' + entry.version : entry.label">
                        {{ entry.label }}
                        @if (entry.version) {
                            <span class="version">{{ entry.version }}</span>
                        }
                    </div>
                    <div class="value" [attr.title]="entry.ops + ' ops/s, ' + entry.time">
                        @if (throughput()) {
                            {{ entry.ops }} ops/s
                        } @else if (compact()) {
                            {{ entry.time }}
                        } @else {
                            {{ entry.ops }} ops/s
                        }
                    </div>
                    <div class="track"><div class="bar" [style.width.%]="entry.width"></div></div>
                </div>
            }
        </div>
    `,
    styles: `
        :host {
            display: block;
        }
        h3 {
            font-size: 15px;
            font-weight: 700;
            color: white;
            margin: 0 0 2px;
        }
        .description {
            margin: 0 0 14px;
            color: #80878f;
            font-size: 13px;
            line-height: 1.5;
        }
        .chart {
            display: flex;
            flex-direction: column;
            gap: 9px;
        }
        /* name and value in one line, the bar below them over the whole width */
        .row {
            display: grid;
            grid-template-columns: minmax(0, 1fr) auto;
            grid-template-areas:
                'label value'
                'track track';
            column-gap: 8px;
            row-gap: 3px;
            align-items: baseline;
            font-size: 13px;
            line-height: 1.35;
        }
        .label {
            grid-area: label;
            white-space: nowrap;
            overflow: hidden;
            text-overflow: ellipsis;
            color: #9aa1a9;
        }
        .track {
            grid-area: track;
        }
        .bar {
            height: 5px;
            min-width: 3px;
            border-radius: 3px;
            background: #2c323b;
        }
        .highlight .bar {
            background: linear-gradient(90deg, #8f3314, #b8471f);
        }
        .highlight .label {
            color: white;
            font-weight: 600;
        }
        .version {
            font-size: 11px;
            color: #6b727a;
            font-style: normal;
        }
        .baseline .bar {
            background: repeating-linear-gradient(135deg, #2c323b 0 6px, #232830 6px 12px);
        }
        .baseline .label {
            font-style: italic;
        }
        .value {
            grid-area: value;
            white-space: nowrap;
            font-size: 12px;
            color: #cfd3d8;
            font-variant-numeric: tabular-nums;
        }
    `,
})
export class BenchmarkChartComponent {
    title = input.required<string>();
    description = input<string>('');
    data = input.required<ChartEntry[]>();
    /** narrow: only the time per operation */
    compact = input(false);
    /** Total operations per second of many clients. The time of one operation doesn't follow from it. */
    throughput = input(false);

    entries = computed(() => {
        const entries = this.data().slice().sort((a, b) => b.hz - a.hz);
        const max = entries.length ? entries[0].hz : 1;
        return entries.map(v => ({ ...v, width: (v.hz / max) * 100, ops: formatOps(v.hz), time: formatTime(v.hz) }));
    });
}


interface TrendPoint {
    label: string;
    date: string;
    hz: number;
    release: boolean;
}

/** Operations per second over the measured releases and commits, releases as white circles. */
@Component({
    selector: 'benchmark-trend',
    changeDetection: ChangeDetectionStrategy.OnPush,
    template: `
        <div class="head">
            <div class="label">{{ label() }}</div>
            @if (chart(); as c) {
                <div class="latest">
                    {{ c.latest }}
                    @if (c.change) {
                        <span [class.faster]="!noise() && c.faster" [class.slower]="!noise() && !c.faster" [class.unchanged]="noise()">{{ c.change }}</span>
                    }
                </div>
            }
        </div>
        @if (chart(); as c) {
            <svg viewBox="0 0 300 50" preserveAspectRatio="none">
                <polyline [attr.points]="c.points" />
                @for (point of c.dots; track point.x) {
                    <circle [attr.cx]="point.x" [attr.cy]="point.y" [attr.r]="point.release ? 4 : 2.5" [class.release]="point.release">
                        <title>{{ point.title }}</title>
                    </circle>
                }
            </svg>
            <div class="axis">
                <span>{{ c.first }}</span>
                <span>{{ c.last }}</span>
            </div>
        }
    `,
    styles: `
        :host {
            display: block;
            background: rgba(255, 255, 255, 0.025);
            border: 1px solid rgba(255, 255, 255, 0.05);
            border-radius: 10px;
            padding: 14px 16px 10px;
        }
        .head {
            display: flex;
            justify-content: space-between;
            gap: 10px;
            font-size: 13px;
            margin-bottom: 8px;
        }
        .label {
            color: white;
            font-weight: 600;
        }
        .latest {
            color: #cfd3d8;
            white-space: nowrap;
            span {
                margin-left: 6px;
            }
        }
        .faster {
            color: #5cb85c;
        }
        .slower {
            color: #e0645c;
        }
        .unchanged {
            color: var(--color-grey);
        }
        svg {
            width: 100%;
            height: 50px;
            overflow: visible;
            margin: 4px 0;
        }
        polyline {
            fill: none;
            stroke: var(--color-orange);
            stroke-width: 2;
            vector-effect: non-scaling-stroke;
        }
        circle {
            fill: var(--color-orange);
        }
        circle.release {
            fill: #0b0d10;
            stroke: white;
            stroke-width: 2;
            vector-effect: non-scaling-stroke;
        }
        .axis {
            display: flex;
            justify-content: space-between;
            font-size: 11px;
            color: var(--color-grey);
            margin-top: 4px;
        }
    `,
})
export class BenchmarkTrendComponent {
    label = input.required<string>();
    points = input.required<TrendPoint[]>();
    /** operations per second of the last release, the change is relative to it */
    release = input<{ label: string; hz: number }>();
    /** whether the change to the release is within the measurement error */
    noise = input(false);
    /** the points are values where lower is better (e.g. a size) instead of operations per second */
    metric = input<TrendMetric>();

    chart = computed(() => {
        const points = this.points();
        if (!points.length) return;
        const release = this.release();
        const metric = this.metric();
        // time per operation: the line goes down when it gets faster
        const cost = (hz: number) => (metric ? hz : 1 / hz);
        const maxTime = Math.max(...points.map(v => cost(v.hz))) * 1.1;
        const y = (hz: number) => 50 - (cost(hz) / maxTime) * 50;
        const x = (i: number) => (points.length === 1 ? 150 : (i / (points.length - 1)) * 300);
        const dots = points.map((v, i) => ({
            x: x(i),
            y: y(v.hz),
            release: v.release,
            title: `${v.release ? 'Release ' : ''}${v.label} (${v.date.slice(0, 10)}): ${metric ? metric.format(v.hz) : `${formatOps(v.hz)} ops/s, ${formatTime(v.hz)}`}`,
        }));
        const last = points[points.length - 1];
        const base = release?.hz || points[0].hz;
        const factor = last.hz / base;
        return {
            points: dots.map(v => `${v.x},${v.y}`).join(' '),
            dots,
            latest: metric ? metric.format(last.hz) : formatTime(last.hz),
            faster: metric ? last.hz <= base : factor >= 1,
            change: metric ? (points.length > 1 || release ? metric.change(last.hz, base) : undefined) : points.length > 1 || release ? formatChange((factor - 1) * 100) : '',
            first: points[0].label,
            last: last.label,
        };
    });
}

/** A chart of benchmarks of one suite in the latest run. */
interface ChartDefinition {
    title: string;
    description: string;
    suite: string;
    /** benchmark name -> label */
    benchmarks: { [name: string]: string };
}

const charts: ChartDefinition[] = [
    {
        title: 'Validation of valid data',
        description: 'Checks a user object with nested profile and an array of roles. The result is true or false.',
        suite: 'comparison/validation',
        benchmarks: {
            'typia is (valid)': 'typia (AOT)',
            'deepkit guard (valid)': 'Deepkit guard()',
            'deepkit is (valid)': 'Deepkit is()',
            'typebox Check (valid)': 'TypeBox',
            'arktype (valid)': 'ArkType',
            'zod safeParse (valid)': 'Zod',
            'valibot safeParse (valid)': 'Valibot',
            'class-validator (valid)': 'class-validator',
        },
    },
    {
        title: 'Validation errors',
        description: 'The same object with an invalid nested field. The result contains the errors with their path.',
        suite: 'comparison/validation',
        benchmarks: {
            'deepkit validate (invalid)': 'Deepkit validate()',
            'typia validate (invalid)': 'typia (AOT)',
            'zod safeParse (invalid)': 'Zod',
            'valibot safeParse (invalid)': 'Valibot',
            'typebox Errors (invalid)': 'TypeBox',
            'arktype (invalid)': 'ArkType',
            'class-validator (invalid)': 'class-validator',
        },
    },
    {
        title: 'Deserialization',
        description: 'JSON-compatible data to a typed object: dates, nested objects, arrays.',
        suite: 'comparison/serialization',
        benchmarks: {
            'deepkit deserialize': 'Deepkit deserialize()',
            'deepkit cast (with validation)': 'Deepkit cast() with validation',
            'class-transformer plainToInstance': 'class-transformer',
        },
    },
    {
        title: 'Serialization to JSON',
        description: 'A typed object to a JSON string.',
        suite: 'comparison/serialization',
        benchmarks: {
            'JSON.stringify': 'JSON.stringify (no types)',
            'deepkit getSerializeFunction + JSON.stringify': 'Deepkit + JSON.stringify',
            'typia json.stringify': 'typia json.stringify',
        },
    },
    {
        title: 'BSON',
        description: 'Encoding and decoding of the same object to BSON, compared with the official bson package of the MongoDB driver.',
        suite: 'comparison/bson',
        benchmarks: {
            'deepkit serialize': 'Deepkit serialize',
            'bson serialize': 'bson serialize',
            'deepkit deserialize': 'Deepkit deserialize',
            'bson deserialize': 'bson deserialize',
        },
    },
];


/** The ORM comparisons, see benchmarks/comparison/orm. */
const databaseSuites: { suite: string; title: string; drivers: string[] }[] = [
    { suite: 'comparison/orm-postgres', title: 'PostgreSQL', drivers: ['pg', 'postgres.js'] },
    { suite: 'comparison/orm-sqlite', title: 'SQLite', drivers: ['better-sqlite3'] },
    { suite: 'comparison/orm-mongo', title: 'MongoDB', drivers: ['mongodb'] },
];

const databaseOperations: { name: string; title: string; description: string }[] = [
    { name: 'findOne by id', title: 'findOne by id', description: 'A row by its primary key.' },
    { name: 'find 10,000 rows', title: 'Load 10,000 rows', description: 'All rows of the table as objects.' },
    { name: 'insert 1,000 rows', title: 'Insert 1,000 rows', description: 'All rows in one call, nothing returned.' },
    { name: 'insert 1,000 entities', title: 'Insert 1,000 entities', description: 'Through the ORM, generated primary keys are returned.' },
];

/** The RPC comparison, see benchmarks/comparison/rpc. */
const rpcBaselines = ['ws'];

const rpcOperations: { name: string; title: string; description: string }[] = [
    { name: 'add two numbers', title: 'Small call', description: 'Two numbers as arguments, one number as result.' },
    { name: 'send and receive an object', title: 'Object call', description: 'A user object as argument and as result.' },
    { name: 'receive 100 objects', title: 'List of 100 objects', description: 'One number as argument, 100 user objects as result.' },
];

/** The broker comparison, see benchmarks/comparison/load/broker-load.ts. */
const brokerLevel = '64 connections x 8 in flight';

const brokerOperations: { name: string; title: string; description: string }[] = [
    { name: 'read an object', title: 'Read an object', description: 'A user object by its key.' },
    { name: 'write an object', title: 'Write an object', description: 'A user object under a key.' },
    { name: 'increment a counter', title: 'Increment', description: 'A counter under a key.' },
    { name: 'publish and receive', title: 'Publish and receive', description: 'A user object, until the subscriber received it.' },
];

/** Benchmarks of whole operations, shown over time. */
const trends: { title: string; items: { suite: string; name: string; label: string }[] }[] = [
    {
        title: 'Database',
        items: [
            { suite: 'comparison/orm-postgres', name: 'Deepkit: findOne by id', label: 'PostgreSQL findOne' },
            { suite: 'comparison/orm-postgres', name: 'Deepkit: find 10,000 rows', label: 'PostgreSQL 10,000 rows' },
            { suite: 'comparison/orm-postgres', name: 'Deepkit: insert 1,000 rows', label: 'PostgreSQL insert 1,000' },
            { suite: 'comparison/orm-sqlite', name: 'Deepkit: findOne by id', label: 'SQLite findOne' },
            { suite: 'comparison/orm-sqlite', name: 'Deepkit: find 10,000 rows', label: 'SQLite 10,000 rows' },
            { suite: 'comparison/orm-sqlite', name: 'Deepkit: insert 1,000 rows', label: 'SQLite insert 1,000' },
            { suite: 'comparison/orm-mongo', name: 'Deepkit: findOne by id', label: 'MongoDB findOne' },
            { suite: 'comparison/orm-mongo', name: 'Deepkit: find 10,000 rows', label: 'MongoDB 10,000 documents' },
            { suite: 'comparison/orm-mongo', name: 'Deepkit: insert 1,000 rows', label: 'MongoDB insert 1,000' },
        ],
    },
    {
        title: 'HTTP requests',
        items: [
            { suite: 'http/kernel', name: 'GET with route parameter', label: 'GET with route parameter' },
            { suite: 'http/kernel', name: 'GET list of 10 with query parameter', label: 'GET list of 10' },
            { suite: 'http/kernel', name: 'POST with validated JSON body', label: 'POST with validated body' },
        ],
    },
    {
        title: 'RPC',
        items: [
            { suite: 'rpc/actions', name: 'user: getUser (entity return)', label: 'Action returning an entity' },
            { suite: 'rpc/actions', name: 'product: createProduct (complex args, entity return)', label: 'Action with object arguments' },
            { suite: 'rpc/actions', name: 'user: listUsers (complex result with array)', label: 'Action returning a list' },
        ],
    },
    {
        title: 'Dependency injection and app',
        items: [
            { suite: 'injector/di', name: 'get provider with dependencies', label: 'Service with dependencies' },
            { suite: 'injector/di', name: 'scoped: new scope each call', label: 'Scoped service, new scope' },
            { suite: 'app/module', name: 'App.get() - resolve service', label: 'App.get()' },
        ],
    },
    {
        title: 'Validation and serialization',
        items: [
            { suite: 'comparison/validation', name: 'deepkit is (valid)', label: 'is<User>()' },
            { suite: 'comparison/validation', name: 'deepkit validate (invalid)', label: 'validate<User>() with errors' },
            { suite: 'comparison/serialization', name: 'deepkit deserialize', label: 'deserialize<User>()' },
            { suite: 'comparison/serialization', name: 'deepkit serialize', label: 'serialize<User>()' },
            { suite: 'bson/serialization', name: 'deserialize nested object', label: 'BSON deserialize' },
            { suite: 'bson/serialization', name: 'serialize nested object', label: 'BSON serialize' },
        ],
    },
];

/** Benchmarks shown in "Releases and master", by area. */
const highlights: { title: string; items: { suite: string; name: string; label: string }[] }[] = [
    {
        title: 'Validation and serialization',
        items: [
            { suite: 'comparison/validation', name: 'deepkit is (valid)', label: 'is<User>()' },
            { suite: 'comparison/validation', name: 'deepkit validate (invalid)', label: 'validate<User>() with errors' },
            { suite: 'comparison/serialization', name: 'deepkit serialize', label: 'serialize<User>()' },
            { suite: 'comparison/serialization', name: 'deepkit deserialize', label: 'deserialize<User>()' },
            { suite: 'comparison/serialization', name: 'deepkit cast (with validation)', label: 'cast<User>()' },
            { suite: 'type/serialization', name: 'deepkit array[100] deserialize', label: 'deserialize<T[]>(), 100 items' },
        ],
    },
    {
        title: 'Runtime types',
        items: [
            { suite: 'type/reflection', name: 'typeOf<Order>', label: 'typeOf<Order>()' },
            { suite: 'type/reflection', name: 'resolveReceiveType<User>', label: 'resolveReceiveType<User>()' },
            { suite: 'type/reflection', name: 'ReflectionClass.from (cached)', label: 'ReflectionClass.from(), cached' },
        ],
    },
    {
        title: 'Change detection',
        items: [
            { suite: 'type/change-detection', name: 'detect changes (with changes, medium)', label: 'Detect changes, medium entity' },
            { suite: 'type/change-detection', name: 'createSnapshot (medium entity)', label: 'Create snapshot, medium entity' },
        ],
    },
    {
        title: 'BSON',
        items: [
            { suite: 'bson/serialization', name: 'serialize small object', label: 'Serialize small object' },
            { suite: 'bson/serialization', name: 'deserialize small object', label: 'Deserialize small object' },
        ],
    },
    {
        title: 'RPC',
        items: [
            { suite: 'rpc/messages', name: 'serialize (no body)', label: 'RPC message without body' },
            { suite: 'rpc/messages', name: 'serialize small body', label: 'RPC message with body' },
            { suite: 'rpc/messages', name: 'round-trip small', label: 'RPC message round trip' },
            { suite: 'rpc/actions', name: 'simple: add (2 number args, number return)', label: 'RPC action call' },
        ],
    },
    {
        title: 'HTTP',
        items: [
            { suite: 'http/kernel', name: 'GET with route parameter', label: 'GET with route parameter' },
            { suite: 'http/kernel', name: 'POST with validated JSON body', label: 'POST with validated JSON body' },
            { suite: 'http/router', name: 'resolve request - with query', label: 'Route with query string' },
            { suite: 'http/router', name: 'deserialize - user array (10)', label: 'HTTP body with 10 users' },
            { suite: 'http/router', name: 'serialize - api response', label: 'Serialize API response' },
        ],
    },
    {
        title: 'Dependency injection, app and events',
        items: [
            { suite: 'injector/di', name: 'get simple provider', label: 'injector.get()' },
            { suite: 'injector/di', name: 'get provider with dependencies', label: 'injector.get() with dependencies' },
            { suite: 'injector/di', name: 'scoped: new scope each call', label: 'Scoped service, new scope' },
            { suite: 'app/module', name: 'App creation - 5 module imports', label: 'App with 5 module imports' },
            { suite: 'event/dispatcher', name: 'sync event - single listener', label: 'Event with one listener' },
        ],
    },
    {
        title: 'ORM and database',
        items: [
            { suite: 'orm/sqlite', name: 'query findOne', label: 'SQLite findOne' },
            { suite: 'orm/sqlite', name: 'deserialize 100 entities', label: 'Hydrate 100 entities' },
            { suite: 'mongo', name: 'insert 100 in one session', label: 'MongoDB insert of 100 entities' },
            { suite: 'mongo', name: 'deleteMany 1,000 rows', label: 'MongoDB deleteMany of 1,000 documents' },
        ],
    },
];

const suiteTitles: { [name: string]: string } = {
    'type/validation': 'Validation',
    'type/serialization': 'Serialization',
    'type/reflection': 'Runtime types',
    'type/union': 'Unions',
    'type/change-detection': 'Change detection',
    'bson/serialization': 'BSON',
    'injector/di': 'Dependency injection',
    'injector/scaling': 'Dependency injection: scaling',
    'app/module': 'App modules',
    'event/dispatcher': 'Events',
    'http/router': 'HTTP router and serialization',
    'http/kernel': 'HTTP requests',
    'rpc/actions': 'RPC actions',
    'rpc/messages': 'RPC messages',
    'orm/sqlite': 'ORM with SQLite',
    mongo: 'ORM with MongoDB',
    'logger/core': 'Logger',
};

@Component({
    changeDetection: ChangeDetectionStrategy.OnPush,
    imports: [AppTitle, AppDescription, HeaderComponent, FooterComponent, HighlightCodeComponent, BenchmarkChartComponent, BenchmarkTrendComponent],
    template: `
        <app-title value="Benchmarks"></app-title>
        <app-description
            value="Performance of Deepkit validation, serialization, BSON, ORM, HTTP, RPC and dependency injection, compared with typia, Zod, Valibot, ArkType, TypeBox, class-validator and the previous release."
        ></app-description>
        <dw-header />
        <div class="bench-page">
            <section class="bm-card bm-hero">
                <h1>Benchmarks</h1>
                <p>
                    Every package of Deepkit has benchmarks. The comparisons with other libraries use the same data and
                    run in the same process, on a dedicated machine.
                </p>
                <p>
                    What is measured here:
                    <a href="/en/documentation/orm">TypeScript ORM</a>,
                    <a href="/en/documentation/rpc">TypeScript RPC framework</a>,
                    <a href="/en/documentation/dependency-injection">TypeScript dependency injection</a>,
                    <a href="/en/documentation/runtime-types/validation">TypeScript validation</a>,
                    <a href="/en/documentation/framework">TypeScript backend framework</a>.
                </p>
                <div class="meta">
                    @if (latest(); as run) {
                        <a class="chip" [attr.title]="masterTitle()" href="https://github.com/deepkit/deepkit-framework/commit/{{ run.commit }}">{{ masterLabel() }} {{ run.label }}</a>
                        <span class="chip">{{ formatDate(run.date) }}</span>
                    }
                    @if (machine; as m) {
                        <span class="chip">{{ m.cpu }}</span>
                        <span class="chip">Node.js {{ m.node }}</span>
                    }
                </div>
            </section>

            <section class="bm-wide">
                <div class="bm-card bm-head">
                    <h2>Compared with other libraries</h2>
                    <p class="intro">
                        Operations per second, higher is better. Deepkit reads the TypeScript types at runtime, so there is no
                        schema to write: the validators check a plain <code>interface User</code>. typia also uses TypeScript
                        types, but generates its code at build time.
                        <a href="https://github.com/deepkit/deepkit-framework/tree/master/benchmarks/comparison">Benchmark source code on GitHub</a>
                    </p>
                </div>
                <div class="bm-body">
                <div class="charts">
                        @for (chart of charts(); track chart.title) {
                            <benchmark-chart class="panel" [title]="chart.title" [description]="chart.description" [data]="chart.entries" />
                        }
                    </div>
                </div>
            </section>

            @if (databases().length) {
                <section class="bm-wide">
                    <div class="bm-card bm-head">
                        <h2>Databases</h2>
                        <p class="intro">
                            Complete ORM operations against a real database on the same machine: a table with
                            10,000 rows, read as entities or objects of each library. Time per operation, the longer the bar the
                            faster. The raw drivers (striped) are the lower bound of what an ORM on top of them can reach.
                            <a href="https://github.com/deepkit/deepkit-framework/tree/master/benchmarks/comparison/orm">Benchmark source code on GitHub</a>
                        </p>
                    </div>
                    <div class="bm-body">
                    @for (database of databases(); track database.name) {
                            <h3>{{ database.title }}</h3>
                            <div class="charts three">
                                @for (chart of database.charts; track chart.title) {
                                    <benchmark-chart class="panel" [compact]="true" [title]="chart.title" [description]="chart.description" [data]="chart.entries" />
                                }
                            </div>
                        }
                    </div>
                </section>
            }

            @if (rpc().length) {
                <section class="bm-wide">
                    <div class="bm-card bm-head">
                        <h2>RPC</h2>
                        <p class="intro">
                            Complete calls over a local socket, with client and server in one process. Time per call, the
                            longer the bar the faster. The libraries do different amounts of work: Deepkit validates the
                            arguments from their types and uses binary BSON over TCP or WebSocket (TCP in these
                            measurements), tRPC validates with Zod and uses
                            JSON over HTTP, gRPC uses Protocol Buffers over HTTP/2 and only checks the message
                            structure, and Socket.IO sends JSON without validation. Plain ws (striped) sends JSON
                            with no framework at all, as a reference point.
                            <a href="https://github.com/deepkit/deepkit-framework/tree/master/benchmarks/comparison/rpc">Benchmark source code on GitHub</a>
                        </p>
                    </div>
                    <div class="bm-body">
                    <div class="charts three">
                            @for (chart of rpc(); track chart.title) {
                                <benchmark-chart class="panel" [compact]="true" [title]="chart.title" [description]="chart.description" [data]="chart.entries" />
                            }
                        </div>
                    </div>
                </section>
            }

            @if (broker().length) {
                <section class="bm-wide">
                    <div class="bm-card bm-head">
                        <h2>Broker</h2>
                        <p class="intro">
                            Key-value and pub/sub with 64 connections and 8 in-flight calls per connection, spread over 5
                            client processes. Operations per second over all clients, higher is better. Each server runs
                            in its own process, in-memory and with its default threading: the Deepkit broker is one Node.js
                            process, Redis and Valkey are native servers. The Redis, Valkey and NATS clients exchange JSON,
                            Deepkit binary encoded from the types. NATS only has the pub/sub workload, since its key-value
                            store needs JetStream, which persists.
                            <a href="https://github.com/deepkit/deepkit-framework/tree/master/benchmarks/comparison/load">Benchmark source code on GitHub</a>
                        </p>
                    </div>
                    <div class="bm-body">
                    <div class="charts">
                            @for (chart of broker(); track chart.title) {
                                <benchmark-chart class="panel" [compact]="true" [throughput]="true" [title]="chart.title" [description]="chart.description" [data]="chart.entries" />
                            }
                        </div>
                    </div>
                </section>
            }

            @if (release(); as release) {
                <section class="bm-card">
                    <h2>Releases and master</h2>
                    <p class="intro">
                        Time per operation in the last releases and in master, the same benchmarks on the same machine,
                        each with its change to the column before.
                        Compared with {{ release.run.label }}, master is faster in <strong>{{ release.faster }}</strong>,
                        slower in <strong>{{ release.slower }}</strong> and unchanged within the measurement error in
                        {{ release.noise }} of {{ release.total }} benchmarks.
                    </p>
                    <div class="table-scroll">
                        <table [style.--columns]="release.previous ? 3 : 2">
                            <thead>
                                <tr>
                                    <th></th>
                                    @if (release.previous; as previous) {
                                        <th class="number">{{ previous.label }}</th>
                                    }
                                    <th class="number with-change">{{ release.run.label }}</th>
                                    <th class="number with-change" [attr.title]="masterTitle()">{{ masterLabel() }}</th>
                                </tr>
                            </thead>
                            <tbody>
                                @for (group of release.highlights; track group.title) {
                                    <tr class="group">
                                        <th scope="colgroup" [attr.colspan]="release.previous ? 4 : 3">{{ group.title }}</th>
                                    </tr>
                                    @for (row of group.rows; track row.label) {
                                        <tr>
                                            <td><code>{{ row.label }}</code></td>
                                            @for (cell of row.cells; track $index; let last = $last) {
                                                <td class="number" [class.strong]="last" [attr.data-label]="last ? masterLabel() : $index === row.cells.length - 2 ? release.run.label : release.previous?.label">
                                                    {{ cell.time }}
                                                    @if (cell.change; as change) {
                                                        <span class="change" [class.faster]="change.faster" [class.slower]="change.slower" [class.unchanged]="!change.faster && !change.slower">{{ change.text }}</span>
                                                    }
                                                </td>
                                            }
                                        </tr>
                                    }
                                }
                            </tbody>
                        </table>
                    </div>
                </section>
            }

            @if (builds().length) {
                <section class="bm-card" id="build">
                    <h2>Bundle size and build time</h2>
                    <p class="intro">
                        What runtime types cost at build time, measured on our own sources pinned to one commit: the same
                        <code>tsc</code> run (type check and emit) without and with the type compiler.
                        Changes are since the last release{{ releaseLabel() ? ' (' + releaseLabel() + ')' : '' }}.
                    </p>
                    <div class="table-scroll">
                        <table style="--columns: 3">
                            <thead>
                                <tr>
                                    <th>Codebase</th>
                                    <th class="number">JS plain</th>
                                    <th class="number">JS + types</th>
                                    <th class="number">Size overhead</th>
                                    <th class="number">Gzip overhead</th>
                                    <th class="number">Change</th>
                                    <th class="number">Build plain</th>
                                    <th class="number">Build + types</th>
                                    <th class="number">Build overhead</th>
                                    <th class="number">Change</th>
                                </tr>
                            </thead>
                            <tbody>
                                @for (row of builds(); track row.name) {
                                    <tr>
                                        <td>{{ row.name }}<span class="codebase-size">{{ row.files }} files · {{ row.lines }} lines</span></td>
                                        <td data-label="JS plain" class="number">{{ row.plainBytes }}</td>
                                        <td data-label="JS + types" class="number strong">{{ row.reflectedBytes }}</td>
                                        <td data-label="Size overhead" class="number strong">{{ row.sizeOverhead }}</td>
                                        <td data-label="Gzip overhead" class="number">{{ row.gzipOverhead }}</td>
                                        <td data-label="Size change" class="number" [class.faster]="row.sizeBetter" [class.slower]="row.sizeWorse" [class.unchanged]="!row.sizeBetter && !row.sizeWorse">{{ row.sizeChange }}</td>
                                        <td data-label="Build plain" class="number">{{ row.plainTime }}</td>
                                        <td data-label="Build + types" class="number strong">{{ row.reflectedTime }}</td>
                                        <td data-label="Build overhead" class="number strong">{{ row.timeOverhead }}</td>
                                        <td data-label="Build change" class="number" [class.faster]="row.timeBetter" [class.slower]="row.timeWorse" [class.unchanged]="!row.timeBetter && !row.timeWorse">{{ row.timeChange }}</td>
                                    </tr>
                                }
                            </tbody>
                        </table>
                    </div>
                    @for (group of buildTrends(); track group.title) {
                        <h3>{{ group.title }}</h3>
                        <div class="trends">
                            @for (item of group.items; track item.label) {
                                <benchmark-trend [label]="item.label" [points]="item.points" [release]="item.release" [noise]="item.noise" [metric]="group.metric" />
                            }
                        </div>
                    }
                </section>
            }

            <section class="bm-card">
                <h2>Over time</h2>
                <p class="intro">
                    <strong>Time per operation, lower is better</strong>, of whole features from the oldest measured
                    release to master. White circles are releases. The factor compares master with the last
                    release{{ releaseLabel() ? ' (' + releaseLabel() + ')' : '' }}, grey if within the measurement error.
                    Hover a point for its numbers.
                </p>
                @for (group of trends(); track group.title) {
                    <h3>{{ group.title }}</h3>
                    <div class="trends">
                        @for (item of group.items; track item.label) {
                            <benchmark-trend [label]="item.label" [points]="item.points" [release]="item.release" [noise]="item.noise" />
                        }
                    </div>
                }
            </section>

            <section class="bm-card">
                <h2>All benchmarks</h2>
                <p class="intro">
                    Time per operation in master and the change of operations per second since the last release.
                    Changes within twice the measurement error are shown in grey.
                </p>
                @for (suite of suites(); track suite.id) {
                    <details id="{{ suite.id }}">
                        <summary>
                            <span class="suite-title">{{ suite.title }}</span>
                            <span class="file">{{ suite.rows.length }} benchmarks · {{ suite.file }}</span>
                        </summary>
                        <div class="table-scroll">
                            <table style="--columns: 3">
                                <tbody>
                                    @for (row of suite.rows; track row.name) {
                                        <tr>
                                            <td>{{ row.name }}</td>
                                            <td class="number strong">{{ row.time }}</td>
                                            <td class="number">{{ row.ops }} ops/s</td>
                                            <td class="number" [class.faster]="row.faster" [class.slower]="row.slower" [class.unchanged]="!row.faster && !row.slower">
                                                {{ row.change }}
                                            </td>
                                        </tr>
                                    }
                                </tbody>
                            </table>
                        </div>
                    </details>
                }
            </section>

            <section class="bm-card">
                <h2>Run them yourself</h2>
                <p class="intro">
                    The benchmarks are in <code>benchmarks/</code> of each package and in
                    <code>benchmarks/comparison</code>. The results are written to
                    <code>benchmarks/results/&lt;machine&gt;</code>; the ones of this page are committed in the repository.
                </p>
                <highlight-code
                    lang="bash"
                    code="git clone https://github.com/deepkit/deepkit-framework.git
cd deepkit-framework
yarn && npm run postinstall && npm run tsc

npm run bench                         # all benchmarks
npm run bench -- type bson            # files whose path contains type or bson
npm run bench -- --target 1.0.19      # the same benchmarks against a published version"
                />
            </section>
        </div>
        <dw-footer />
    `,
    styles: `
        .bench-page {
            box-sizing: border-box;
            width: 100%;
            text-align: left;
            max-width: 1080px;
            margin: 40px auto 0;
            padding: 0 12px;
            display: flex;
            flex-direction: column;
            gap: 24px;
            font-size: 15px;
            line-height: 1.6;
            color: #cfd3d8;
        }
        .bm-card {
            background: var(--color-content-text-bg);
            border: 1px solid rgba(255, 255, 255, 0.05);
            border-radius: 12px;
            padding: 28px 30px;
        }
        h1 {
            font-size: 26px;
            font-weight: 700;
            color: white;
            margin: 0 0 8px;
        }
        h2 {
            font-size: 19px;
            font-weight: 700;
            color: white;
            margin: 0 0 6px;
        }
        h3 {
            font-size: 15px;
            font-weight: 700;
            color: white;
            margin: 22px 0 10px;
        }
        p {
            margin: 0;
        }
        .intro {
            color: #9aa1a9;
            font-size: 14px;
            max-width: 78ch;
            margin-bottom: 20px;
        }
        code {
            font-style: normal;
            font-size: 13px;
            color: #e3e6ea;
            white-space: nowrap;
        }
        a {
            color: var(--color-link);
        }
        .bm-hero p {
            color: #9aa1a9;
            max-width: 70ch;
        }
        .meta {
            display: flex;
            flex-wrap: wrap;
            gap: 8px;
            margin: 16px 0 0;
        }
        .chip,
        a.chip {
            font-size: 12px;
            padding: 3px 10px;
            border-radius: 20px;
            background: rgba(255, 255, 255, 0.06);
            color: #b8bec5;
            text-decoration: none;
        }
        a.chip:hover {
            color: white;
        }
        /* The head of a chart section keeps the width of the page, the charts below it get the width of the window,
           so that all charts of a topic fit in one row. Both have the same background and read as one shape. */
        .bm-wide {
            --wide: max(100%, min(calc(100vw - 48px), 1800px));
            display: flex;
            flex-direction: column;
        }
        .bm-head {
            border-bottom: none;
            border-bottom-left-radius: 0;
            border-bottom-right-radius: 0;
            padding-bottom: 16px;
            position: relative;
            z-index: 1;
            margin-bottom: -1px;
        }
        .bm-body {
            width: var(--wide);
            margin-left: calc((100% - var(--wide)) / 2);
            box-sizing: border-box;
            background: var(--color-content-text-bg);
            border: 1px solid rgba(255, 255, 255, 0.05);
            border-radius: 12px;
            padding: 24px 30px 28px;
        }
        .bm-body > h3:first-child {
            margin-top: 0;
        }
        /* all charts of a topic in one row: each chart puts its bars below the names, so it can be narrow */
        .charts {
            display: grid;
            grid-template-columns: repeat(auto-fit, minmax(180px, 1fr));
            gap: 14px;
        }
        .panel {
            background: rgba(255, 255, 255, 0.012);
            border: 1px solid rgba(255, 255, 255, 0.03);
            border-radius: 10px;
            padding: 18px 20px;
            margin: 0;
        }
        .trends {
            display: grid;
            grid-template-columns: repeat(auto-fill, minmax(280px, 1fr));
            gap: 12px;
        }
        .table-scroll {
            overflow-x: auto;
        }
        table {
            width: 100%;
            /* the global table style fixes the column widths, then the unwrapped cells overlap on small screens */
            table-layout: auto;
            border-collapse: collapse;
            font-size: 14px;
        }
        th,
        td {
            text-align: left;
            padding: 7px 10px;
            border-bottom: 1px solid rgba(255, 255, 255, 0.05);
        }
        tbody tr:hover {
            background: rgba(255, 255, 255, 0.025);
        }
        tbody tr.group:hover {
            background: none;
        }
        tr.group th {
            padding-top: 18px;
            color: #c4c9cf;
            font-size: 13px;
        }
        th {
            font-weight: normal;
            font-size: 12px;
            color: #80878f;
        }
        .number {
            text-align: right;
            white-space: nowrap;
        }
        td:first-child {
            white-space: nowrap;
        }
        .strong {
            color: white;
        }
        .faster {
            color: #5cb85c;
        }
        .slower {
            color: #e0645c;
        }
        .unchanged {
            color: #80878f;
        }
        th.with-change {
            padding-right: 106px;
        }
        .change {
            display: inline-block;
            min-width: 88px;
            margin-left: 8px;
            font-size: 12px;
            text-align: left;
        }
        details {
            border-bottom: 1px solid rgba(255, 255, 255, 0.05);
        }
        summary {
            display: flex;
            align-items: baseline;
            gap: 12px;
            cursor: pointer;
            padding: 12px 0;
            list-style: none;
            &::before {
                content: '▸';
                color: #80878f;
                font-size: 12px;
            }
        }
        details[open] summary::before {
            content: '▾';
        }
        details[open] summary {
            margin-bottom: 4px;
        }
        .suite-title {
            color: white;
            font-weight: 700;
        }
        .codebase-size {
            display: block;
            font-size: 12px;
            color: var(--color-grey);
            white-space: nowrap;
        }
        .file {
            font-size: 12px;
            color: #80878f;
        }
        @media (max-width: 640px) {
            .bm-card {
                padding: 20px 16px;
            }
            .charts {
                grid-template-columns: 1fr;
            }
        }
        /* too narrow for the columns: each row becomes its name and below it the values, each with its heading */
        @media (max-width: 1000px) {
            table,
            tbody {
                display: block;
            }
            thead {
                display: none;
            }
            tbody tr {
                display: grid;
                grid-template-columns: repeat(var(--columns), minmax(0, 1fr));
                gap: 6px 12px;
                padding: 10px;
                border-bottom: 1px solid rgba(255, 255, 255, 0.05);
            }
            tbody tr.group {
                display: block;
                padding: 18px 10px 8px;
            }
            tr.group th {
                display: block;
                padding: 0;
                border: 0;
            }
            td,
            td.number,
            td:first-child {
                display: block;
                padding: 0;
                border: 0;
                text-align: left;
                white-space: normal;
            }
            td:first-child {
                grid-column: 1 / -1;
            }
            td[data-label]::before {
                content: attr(data-label);
                display: block;
                font-size: 11px;
                color: #80878f;
            }
            .change {
                display: block;
                min-width: 0;
                margin-left: 0;
            }
        }
    `,
})
export class BenchmarksComponent {
    protected readonly machine = data.machine;
    protected readonly formatDate = (date: string) => new Date(date).toISOString().slice(0, 10);

    protected latestIndex = computed(() => {
        for (let i = data.runs.length - 1; i >= 0; i--) if (!data.runs[i].release) return i;
        return data.runs.length - 1;
    });
    protected latest = computed(() => data.runs[this.latestIndex()]);

    /** master, or master~N when N commits that can change the numbers came after the measured one */
    protected masterLabel = computed(() => {
        const behind = this.latest()?.behind;
        return behind ? `master~${behind}` : 'master';
    });

    protected masterTitle = computed(() => {
        const run = this.latest();
        if (!run?.behind) return null;
        return `Measured at ${run.commit}, ${run.behind} commit${run.behind === 1 ? '' : 's'} changing packages or benchmarks behind master`;
    });

    protected releaseIndex = computed(() => {
        for (let i = data.runs.length - 1; i >= 0; i--) if (data.runs[i].release) return i;
        return -1;
    });

    protected databases = computed(() => {
        const index = this.latestIndex();
        return databaseSuites.flatMap(database => {
            const suite = data.suites.find(v => v.name === database.suite);
            if (!suite) return [];
            const charts = databaseOperations.map(operation => {
                const entries: ChartEntry[] = [];
                for (const benchmark of suite.benchmarks) {
                    const [library, name] = benchmark.name.split(': ');
                    const hz = benchmark.hz[index];
                    if (name !== operation.name || !hz) continue;
                    const baseline = database.drivers.includes(library);
                    const label = baseline ? library + ' (driver)' : library;
                    entries.push({ label, hz, highlight: library === 'Deepkit', baseline, version: libraryVersion(label, index) });
                }
                return { title: operation.title, description: operation.description, entries };
            }).filter(v => v.entries.length);
            return charts.length ? [{ name: database.suite, title: database.title, charts }] : [];
        });
    });

    protected rpc = computed(() => {
        const index = this.latestIndex();
        const suite = data.suites.find(v => v.name === 'comparison/rpc');
        if (!suite) return [];
        return rpcOperations.map(operation => {
            const entries: ChartEntry[] = [];
            for (const benchmark of suite.benchmarks) {
                const [library, name] = benchmark.name.split(': ');
                const hz = benchmark.hz[index];
                if (name !== operation.name || !hz) continue;
                const baseline = rpcBaselines.includes(library);
                const label = baseline ? library + ' (no framework)' : library;
                entries.push({ label, hz, highlight: library.startsWith('Deepkit'), baseline, version: libraryVersion(label, index) });
            }
            return { title: operation.title, description: operation.description, entries };
        }).filter(v => v.entries.length);
    });

    protected broker = computed(() => {
        const index = this.latestIndex();
        const suite = data.suites.find(v => v.name === 'comparison/broker-load');
        if (!suite) return [];
        return brokerOperations.map(operation => {
            const entries: ChartEntry[] = [];
            for (const benchmark of suite.benchmarks) {
                const [library, name] = benchmark.name.split(': ');
                const hz = benchmark.hz[index];
                if (name !== `${operation.name}, ${brokerLevel}` || !hz) continue;
                entries.push({ label: library, hz, highlight: library.startsWith('Deepkit'), version: libraryVersion(library, index) });
            }
            return { title: operation.title, description: operation.description, entries };
        }).filter(v => v.entries.length);
    });

    protected charts = computed(() => {
        const index = this.latestIndex();
        return charts.map(chart => {
            const suite = data.suites.find(v => v.name === chart.suite);
            const entries: ChartEntry[] = [];
            for (const [name, label] of Object.entries(chart.benchmarks)) {
                const hz = suite?.benchmarks.find(v => v.name === name)?.hz[index];
                if (hz) entries.push({ label, hz, highlight: label.startsWith('Deepkit'), version: libraryVersion(label, index) });
            }
            return { title: chart.title, description: chart.description, entries };
        });
    });

    protected release = computed(() => {
        const a = this.releaseIndex(), b = this.latestIndex();
        if (a === -1 || a === b) return;
        let faster = 0, slower = 0, noise = 0;
        for (const suite of data.suites) {
            for (const benchmark of suite.benchmarks) {
                const c = change(benchmark, a, b);
                if (!c) continue;
                if (c.noise) noise++;
                else if (c.percent > 0) faster++;
                else slower++;
            }
        }
        const p = this.previousReleaseIndex();
        // previous release, last release, master: each with its change to the column before
        const columns = p === -1 ? [a, b] : [p, a, b];
        const row = (h: { suite: string; name: string; label: string }) => {
            const benchmark = data.suites.find(v => v.name === h.suite)?.benchmarks.find(v => v.name === h.name);
            // a benchmark newer than the release has no value there, but master can be shown
            if (!benchmark || !benchmark.hz[b]) return [];
            const cells = columns.map((run, i) => {
                const hz = benchmark.hz[run];
                if (!hz) return { time: '–' };
                const before = i > 0 ? columns[i - 1] : -1;
                const c = before === -1 ? undefined : change(benchmark, before, run);
                if (!c) return { time: formatTime(hz) };
                const factor = 1 + c.percent / 100;
                return {
                    time: formatTime(hz),
                    change: { text: formatChange(c.percent), faster: !c.noise && factor >= 1, slower: !c.noise && factor < 1 },
                };
            });
            return [{ label: h.label, cells }];
        };
        const groups = highlights
            .map(group => ({ title: group.title, rows: group.items.flatMap(row) }))
            .filter(group => group.rows.length);
        return {
            run: data.runs[a],
            previous: p === -1 ? undefined : data.runs[p],
            faster, slower, noise, total: faster + slower + noise, highlights: groups,
        };
    });

    /** the release before the last one */
    protected previousReleaseIndex = computed(() => {
        for (let i = this.releaseIndex() - 1; i >= 0; i--) if (data.runs[i].release) return i;
        return -1;
    });

    protected releaseLabel = computed(() => (this.releaseIndex() === -1 ? '' : data.runs[this.releaseIndex()].label));

    protected trends = computed(() => {
        const r = this.releaseIndex();
        return trends.map(group => ({
            title: group.title,
            items: group.items.flatMap(item => {
                const benchmark = data.suites.find(v => v.name === item.suite)?.benchmarks.find(v => v.name === item.name);
                if (!benchmark) return [];
                const points: TrendPoint[] = [];
                data.runs.forEach((run, i) => {
                    const hz = benchmark.hz[i];
                    if (hz) points.push({ label: run.label, date: run.date, hz, release: run.release });
                });
                if (!points.length) return [];
                const releaseHz = r === -1 ? null : benchmark.hz[r];
                const c = r === -1 ? undefined : change(benchmark, r, this.latestIndex());
                return [{ label: item.label, points, release: releaseHz ? { label: data.runs[r].label, hz: releaseHz } : undefined, noise: !!c?.noise }];
            }),
        })).filter(v => v.items.length);
    });

    protected builds = computed(() => {
        const a = this.releaseIndex(), b = this.latestIndex();
        return (data.builds || []).flatMap(build => {
            const sizeOverhead = overhead(build.bytes, b);
            const timeOverhead = overhead(build.time, b);
            if (sizeOverhead === undefined || timeOverhead === undefined) return [];
            const previousSize = a === -1 ? undefined : overhead(build.bytes, a);
            const sizeDifference = previousSize === undefined ? undefined : sizeOverhead - previousSize;
            const before = a === -1 ? null : build.time.reflected[a];
            const after = build.time.reflected[b]!;
            const timeDifference = before ? (after / before - 1) * 100 : undefined;
            const timeNoise = timeDifference === undefined || Math.abs(timeDifference) <= Math.max(build.rme.reflected[a] || 0, build.rme.reflected[b] || 0) * 2;
            return [{
                name: build.name,
                files: build.files,
                lines: build.lines.toLocaleString('en-US'),
                plainBytes: formatBytes(build.bytes.plain[b]!),
                reflectedBytes: formatBytes(build.bytes.reflected[b]!),
                sizeOverhead: formatPercent(sizeOverhead),
                gzipOverhead: formatPercent(overhead(build.gzip, b)!),
                sizeChange: sizeDifference === undefined ? 'new' : overheadMetric.change(sizeOverhead, previousSize!),
                sizeBetter: sizeDifference !== undefined && sizeDifference <= -0.05,
                sizeWorse: sizeDifference !== undefined && sizeDifference >= 0.05,
                plainTime: formatMilliseconds(build.time.plain[b]!),
                reflectedTime: formatMilliseconds(after),
                timeOverhead: formatPercent(timeOverhead),
                timeChange: timeDifference === undefined ? 'new' : buildTimeMetric.change(after, before!),
                timeBetter: !timeNoise && timeDifference! < 0,
                timeWorse: !timeNoise && timeDifference! > 0,
            }];
        });
    });

    protected buildTrends = computed(() => {
        const r = this.releaseIndex(), b = this.latestIndex();
        const trend = (build: Build, value: (run: number) => number | undefined | null, noise: boolean) => {
            const points: TrendPoint[] = [];
            data.runs.forEach((run, i) => {
                const hz = value(i);
                if (hz) points.push({ label: run.label, date: run.date, hz, release: run.release });
            });
            const base = r === -1 ? undefined : value(r);
            return points.length ? [{ label: build.name, points, release: base ? { label: data.runs[r].label, hz: base } : undefined, noise }] : [];
        };
        const all = data.builds || [];
        return [
            { title: 'Size overhead of runtime types', metric: overheadMetric, items: all.flatMap(v => trend(v, i => overhead(v.bytes, i), false)) },
            { title: 'Build time with runtime types', metric: buildTimeMetric, items: all.flatMap(v => {
                const before = r === -1 ? null : v.time.reflected[r], after = v.time.reflected[b];
                const noise = !before || !after || Math.abs((after / before - 1) * 100) <= Math.max(v.rme.reflected[r] || 0, v.rme.reflected[b] || 0) * 2;
                return trend(v, i => v.time.reflected[i], noise);
            }) },
            { title: 'Build time overhead of runtime types', metric: overheadMetric, items: all.flatMap(v => trend(v, i => overhead(v.time, i), true)) },
        ].filter(v => v.items.length);
    });

    protected suites = computed(() => {
        const a = this.releaseIndex(), b = this.latestIndex();
        return data.suites
            .filter(v => !v.name.startsWith('comparison/'))
            .map(suite => ({
                id: suite.name.replace(/[^a-z0-9]+/gi, '-'),
                title: suiteTitles[suite.name] || suite.name,
                file: suite.file,
                rows: suite.benchmarks.flatMap(benchmark => {
                    const hz = benchmark.hz[b];
                    if (!hz) return [];
                    const c = a === -1 ? undefined : change(benchmark, a, b);
                    return [{
                        name: benchmark.name,
                        time: formatTime(hz),
                        ops: formatOps(hz),
                        change: !c ? 'new' : formatChange(c.percent),
                        faster: !!c && !c.noise && c.percent > 0,
                        slower: !!c && !c.noise && c.percent < 0,
                    }];
                }),
            }));
    });
}
