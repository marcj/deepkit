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

interface BenchmarkData {
    machine?: { hostname: string; cpu: string; cores: number; platform: string; node: string };
    runs: BenchmarkRun[];
    suites: Suite[];
}

const data = benchmarkData as BenchmarkData;

export function formatOps(hz: number): string {
    if (hz >= 1e6) return (hz / 1e6).toFixed(hz >= 1e8 ? 0 : 1) + 'M';
    if (hz >= 1e3) return (hz / 1e3).toFixed(hz >= 1e5 ? 0 : 1) + 'K';
    return hz.toFixed(hz >= 100 ? 0 : 1);
}

export function formatTime(hz: number): string {
    const ns = 1e9 / hz;
    if (ns < 1000) return ns.toFixed(ns < 10 ? 1 : 0) + ' ns';
    const us = ns / 1000;
    if (us < 1000) return us.toFixed(us < 10 ? 1 : 0) + ' µs';
    const ms = us / 1000;
    return ms.toFixed(ms < 10 ? 1 : 0) + ' ms';
}

/** Change in percent of b to a, undefined if one is missing; noise if within twice the margin of error, like `npm run bench -- --compare`. */
export function change(benchmark: Benchmark, a: number, b: number): { percent: number; noise: boolean } | undefined {
    const before = benchmark.hz[a], after = benchmark.hz[b];
    if (!before || !after) return;
    const percent = (after / before - 1) * 100;
    const rme = Math.max(benchmark.rme[a] || 0, benchmark.rme[b] || 0);
    return { percent, noise: Math.abs(percent) <= rme * 2 };
}

interface ChartEntry {
    label: string;
    hz: number;
    highlight: boolean;
}

@Component({
    selector: 'benchmark-chart',
    changeDetection: ChangeDetectionStrategy.OnPush,
    template: `
        <h3>{{ title() }}</h3>
        @if (description()) {
            <p class="description">{{ description() }}</p>
        }
        <div class="chart">
            @for (entry of entries(); track entry.label) {
                <div class="row" [class.highlight]="entry.highlight">
                    <div class="label">{{ entry.label }}</div>
                    <div class="bar-container">
                        <div class="bar" [style.width.%]="entry.width"></div>
                        <div class="value">
                            {{ entry.ops }} ops/s <span class="time">{{ entry.time }}</span>
                        </div>
                    </div>
                </div>
            }
        </div>
    `,
    styles: `
        :host {
            display: block;
            margin-bottom: 40px;
        }
        h3 {
            margin-bottom: 4px;
        }
        .description {
            margin: 0 0 12px;
            color: var(--color-grey);
            font-size: 14px;
        }
        .chart {
            display: flex;
            flex-direction: column;
            gap: 6px;
        }
        .row {
            display: grid;
            grid-template-columns: 260px 1fr;
            gap: 12px;
            align-items: center;
            font-size: 14px;
        }
        .label {
            text-align: right;
            white-space: nowrap;
            overflow: hidden;
            text-overflow: ellipsis;
        }
        .bar-container {
            display: flex;
            align-items: center;
            gap: 10px;
        }
        .bar {
            height: 18px;
            min-width: 2px;
            border-radius: 3px;
            background: #3a4049;
        }
        .highlight .bar {
            background: var(--color-orange);
        }
        .highlight .label {
            color: white;
        }
        .value {
            white-space: nowrap;
            font-size: 13px;
        }
        .time {
            color: var(--color-grey);
            margin-left: 4px;
        }
        @media (max-width: 640px) {
            .row {
                grid-template-columns: 1fr;
                gap: 2px;
            }
            .label {
                text-align: left;
            }
        }
    `,
})
export class BenchmarkChartComponent {
    title = input.required<string>();
    description = input<string>('');
    data = input.required<ChartEntry[]>();

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
}

/** Operations per second over the commits, with the last release as dashed line. */
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
                        <span [class.faster]="!noise() && c.change.startsWith('+')" [class.slower]="!noise() && c.change.startsWith('-')" [class.unchanged]="noise()">{{ c.change }}</span>
                    }
                </div>
            }
        </div>
        @if (chart(); as c) {
            <svg viewBox="0 0 300 70" preserveAspectRatio="none">
                @if (c.releaseY !== undefined) {
                    <line x1="0" x2="300" [attr.y1]="c.releaseY" [attr.y2]="c.releaseY" class="release" />
                }
                <polyline [attr.points]="c.points" />
                @for (point of c.dots; track point.x) {
                    <circle [attr.cx]="point.x" [attr.cy]="point.y" r="2.5"><title>{{ point.title }}</title></circle>
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
            background: rgba(24, 28, 35, 0.6);
            border-radius: 4px;
            padding: 12px 14px 8px;
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
        }
        .latest {
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
            height: 70px;
            overflow: visible;
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
        line.release {
            stroke: #6b7280;
            stroke-dasharray: 4 4;
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
    /** operations per second of the last release */
    release = input<{ label: string; hz: number }>();
    /** whether the change to the release is within the measurement error */
    noise = input(false);

    chart = computed(() => {
        const points = this.points();
        if (!points.length) return;
        const release = this.release();
        const max = Math.max(...points.map(v => v.hz), release?.hz || 0) * 1.1;
        const y = (hz: number) => 70 - (hz / max) * 70;
        const x = (i: number) => (points.length === 1 ? 150 : (i / (points.length - 1)) * 300);
        const dots = points.map((v, i) => ({ x: x(i), y: y(v.hz), title: `${v.label} (${v.date.slice(0, 10)}): ${formatOps(v.hz)} ops/s, ${formatTime(v.hz)}` }));
        const last = points[points.length - 1];
        const base = release?.hz || points[0].hz;
        const percent = (last.hz / base - 1) * 100;
        return {
            points: dots.map(v => `${v.x},${v.y}`).join(' '),
            dots,
            releaseY: release ? y(release.hz) : undefined,
            latest: formatTime(last.hz),
            change: points.length > 1 || release ? (percent >= 0 ? '+' : '') + percent.toFixed(0) + '%' : '',
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
            'typia is (valid)': 'typia (ahead-of-time compiled)',
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
            'typia validate (invalid)': 'typia (ahead-of-time compiled)',
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


/** Benchmarks of whole operations, shown over time. */
const trends: { title: string; items: { suite: string; name: string; label: string }[] }[] = [
    {
        title: 'Database',
        items: [
            { suite: 'orm/sqlite', name: 'query findOne', label: 'SQLite findOne' },
            { suite: 'orm/sqlite', name: 'insert single item', label: 'SQLite insert' },
            { suite: 'mongo', name: 'findOne by _id', label: 'MongoDB findOne' },
            { suite: 'mongo', name: 'find 100 with hydration', label: 'MongoDB find 100 entities' },
            { suite: 'mongo', name: 'insert 100 in one session', label: 'MongoDB insert 100 in a session' },
            { suite: 'mongo', name: 'change detection + update of a loaded entity', label: 'MongoDB load, change, update' },
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

/** Benchmarks shown in "Since the last release". */
const highlights: { suite: string; name: string; label: string }[] = [
    { suite: 'comparison/validation', name: 'deepkit is (valid)', label: 'is<User>()' },
    { suite: 'comparison/validation', name: 'deepkit validate (invalid)', label: 'validate<User>() with errors' },
    { suite: 'comparison/serialization', name: 'deepkit serialize', label: 'serialize<User>()' },
    { suite: 'comparison/serialization', name: 'deepkit deserialize', label: 'deserialize<User>()' },
    { suite: 'comparison/serialization', name: 'deepkit cast (with validation)', label: 'cast<User>()' },
    { suite: 'type/serialization', name: 'deepkit array[100] deserialize', label: 'deserialize<T[]>(), 100 items' },
    { suite: 'http/router', name: 'deserialize - user array (10)', label: 'HTTP body with 10 users' },
    { suite: 'rpc/messages', name: 'createRpcMessage small body', label: 'RPC message with body' },
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
    'http/router': 'HTTP',
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
        <div class="app-content benchmarks">
            <h1>Benchmarks</h1>
            <p>
                Every package of Deepkit has benchmarks, and the comparisons with other libraries use the same data
                and run in the same process. The results below are from
                @if (latest(); as run) {
                    <a href="https://github.com/deepkit/deepkit-framework/commit/{{ run.commit }}">{{ run.label }}</a>
                    on {{ formatDate(run.date) }},
                }
                measured on a dedicated machine:
                @if (machine; as m) {
                    {{ m.cpu }}, {{ m.platform }}, Node.js {{ m.node }}.
                }
            </p>

            <h2>Compared with other libraries</h2>
            <p>
                Operations per second, higher is better. Deepkit reads the TypeScript types at runtime, so there is no
                schema to write: the validators below check a plain <code>interface User</code>. typia also uses
                TypeScript types, but generates its code at build time.
            </p>
            @for (chart of charts(); track chart.title) {
                <benchmark-chart [title]="chart.title" [description]="chart.description" [data]="chart.entries" />
            }

            @if (release(); as release) {
                <h2>Since the last release</h2>
                <p>
                    {{ latest()?.label }} compared with {{ release.run.label }}, the same benchmarks on the same machine:
                    <strong>{{ release.faster }}</strong> faster, <strong>{{ release.slower }}</strong> slower and
                    {{ release.noise }} unchanged within the measurement error, of {{ release.total }} benchmarks.
                </p>
                <table>
                    <thead>
                        <tr>
                            <th></th>
                            <th>{{ release.run.label }}</th>
                            <th>{{ latest()?.label }}</th>
                            <th>Change</th>
                        </tr>
                    </thead>
                    <tbody>
                        @for (row of release.highlights; track row.label) {
                            <tr>
                                <td>
                                    <code>{{ row.label }}</code>
                                </td>
                                <td>{{ row.before }}</td>
                                <td>{{ row.after }}</td>
                                <td class="faster">{{ row.factor }}</td>
                            </tr>
                        }
                    </tbody>
                </table>
            }

            <h2>Over time</h2>
            <p>
                Whole operations, per measured commit, from the first to the latest. The dashed line is the last
                release{{ releaseLabel() ? ' (' + releaseLabel() + ')' : '' }}, the percentage the change of the
                latest commit to it, grey if within the measurement error. Hover a point for its numbers.
            </p>
            @for (group of trends(); track group.title) {
                <h3>{{ group.title }}</h3>
                <div class="trends">
                    @for (item of group.items; track item.label) {
                        <benchmark-trend [label]="item.label" [points]="item.points" [release]="item.release" [noise]="item.noise" />
                    }
                </div>
            }

            <h2>All benchmarks</h2>
            <p>
                Time per operation in the latest run, and the change of operations per second since the last release.
                Changes within twice the measurement error count as no change.
            </p>
            @for (suite of suites(); track suite.id) {
                <details id="{{ suite.id }}">
                    <summary>
                        <h3>{{ suite.title }}</h3>
                        <span class="file">{{ suite.rows.length }} benchmarks, {{ suite.file }}</span>
                    </summary>
                    <table>
                        <tbody>
                            @for (row of suite.rows; track row.name) {
                                <tr>
                                    <td>{{ row.name }}</td>
                                    <td class="number">{{ row.time }}</td>
                                    <td class="number">{{ row.ops }} ops/s</td>
                                    <td class="number" [class.faster]="row.faster" [class.slower]="row.slower" [class.unchanged]="!row.faster && !row.slower">
                                        {{ row.change }}
                                    </td>
                                </tr>
                            }
                        </tbody>
                    </table>
                </details>
            }

            <h2>Run them yourself</h2>
            <p>
                The benchmarks are in <code>benchmarks/</code> of each package and in <code>benchmarks/comparison</code>.
                The results are written to <code>benchmarks/results/&lt;machine&gt;</code>; the ones of this page are
                committed in the repository.
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
        </div>
        <dw-footer />
    `,
    styles: `
        .benchmarks {
            max-width: 1000px;
            margin: 0 auto;
        }
        table {
            width: 100%;
            border-collapse: collapse;
            font-size: 14px;
            margin-bottom: 30px;
        }
        th,
        td {
            text-align: left;
            padding: 5px 8px;
            border-bottom: 1px solid rgba(224, 224, 224, 0.08);
        }
        th {
            font-weight: normal;
            color: var(--color-grey);
        }
        .number {
            text-align: right;
            white-space: nowrap;
        }
        .faster {
            color: #5cb85c;
        }
        .slower {
            color: #e0645c;
        }
        .trends {
            display: grid;
            grid-template-columns: repeat(auto-fill, minmax(280px, 1fr));
            gap: 12px;
            margin-bottom: 24px;
        }
        .unchanged {
            color: var(--color-grey);
        }
        details {
            border-bottom: 1px solid rgba(224, 224, 224, 0.08);
        }
        summary {
            display: flex;
            align-items: baseline;
            gap: 10px;
            cursor: pointer;
            padding: 10px 0;
            h3 {
                display: inline;
                margin: 0;
            }
        }
        details[open] summary {
            margin-bottom: 6px;
        }
        .file {
            font-size: 12px;
            font-weight: normal;
            color: var(--color-grey);
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

    protected releaseIndex = computed(() => {
        for (let i = data.runs.length - 1; i >= 0; i--) if (data.runs[i].release) return i;
        return -1;
    });

    protected charts = computed(() => {
        const index = this.latestIndex();
        return charts.map(chart => {
            const suite = data.suites.find(v => v.name === chart.suite);
            const entries: ChartEntry[] = [];
            for (const [name, label] of Object.entries(chart.benchmarks)) {
                const hz = suite?.benchmarks.find(v => v.name === name)?.hz[index];
                if (hz) entries.push({ label, hz, highlight: label.startsWith('Deepkit') });
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
        const rows = highlights.flatMap(h => {
            const benchmark = data.suites.find(v => v.name === h.suite)?.benchmarks.find(v => v.name === h.name);
            const before = benchmark?.hz[a], after = benchmark?.hz[b];
            if (!before || !after) return [];
            return [{ label: h.label, before: formatTime(before), after: formatTime(after), factor: after >= before ? (after / before).toFixed(1) + '× faster' : (before / after).toFixed(1) + '× slower' }];
        });
        return { run: data.runs[a], faster, slower, noise, total: faster + slower + noise, highlights: rows };
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
                    if (!run.release && hz) points.push({ label: run.label, date: run.date, hz });
                });
                if (!points.length) return [];
                const releaseHz = r === -1 ? null : benchmark.hz[r];
                const c = r === -1 ? undefined : change(benchmark, r, this.latestIndex());
                return [{ label: item.label, points, release: releaseHz ? { label: data.runs[r].label, hz: releaseHz } : undefined, noise: !!c?.noise }];
            }),
        })).filter(v => v.items.length);
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
                        change: !c ? 'new' : c.noise ? 'no change' : (c.percent > 0 ? '+' : '') + c.percent.toFixed(0) + '%',
                        faster: !!c && !c.noise && c.percent > 0,
                        slower: !!c && !c.noise && c.percent < 0,
                    }];
                }),
            }));
    });
}
