/**
 * Deepkit Framework
 * Copyright (C) 2021 Deepkit UG, Marc J. Schmidt
 *
 * This program is free software: you can redistribute it and/or modify
 * it under the terms of the MIT License.
 *
 * You should have received a copy of the MIT License along with this program.
 */

/**
 * @deepkit/bench - Zero-dependency benchmark utility with visualization and statistical analysis.
 *
 * Features:
 * - Automatic sync/async detection
 * - Adaptive iteration selection (1x to 10M)
 * - GC event tracking (when --expose-gc is used)
 * - Heap delta measurement
 * - Statistical analysis (RME, variance)
 * - Color-coded output with block bar visualization
 * - Both simple API and class-based BenchSuite API
 */

declare var global: any;

const AsyncFunction = (async () => {}).constructor as { new (...args: string[]): Function };

// ══════════════════════════════════════════════════════════════════════════════
// TYPES
// ══════════════════════════════════════════════════════════════════════════════

/**
 * Result of a single benchmark
 */
export interface BenchResult {
    /** Operations per second */
    hz: number;
    /** Total elapsed time in seconds */
    elapsed: number;
    /** Relative margin of error (as percentage) */
    rme: number;
    /** Mean time per operation in milliseconds */
    mean: number;
    /** Variance of samples */
    variance: number;
    /** Number of iterations run */
    iterations: number;
    /** Sample timings for visualization (up to 50 samples) */
    samples: number[];
    /** Heap memory difference in bytes */
    heapDiff: number;
    /** Whether this is an async benchmark */
    async: boolean;
    /** GC events during benchmark (pause times in ms) */
    gcEvents: number[];
}

/**
 * Results of a benchmark suite (name -> result)
 */
export type BenchSuiteResult = { [name: string]: BenchResult };

/**
 * Options for individual benchmarks
 */
export interface BenchmarkOptions {
    /** Maximum time to run in seconds (default: 1) */
    maxTime?: number;
    /** Runs before every iteration and is not timed. Async benchmarks only, which then run one iteration at a time. */
    beforeEach?: () => Promise<void>;
    /** Runs after every iteration and is not timed. Async benchmarks only, which then run one iteration at a time. */
    afterEach?: () => Promise<void>;
}

interface BenchmarkEntry {
    name: string;
    fn: () => void | Promise<void>;
    options: BenchmarkOptions;
}

// ══════════════════════════════════════════════════════════════════════════════
// ANSI COLORS
// ══════════════════════════════════════════════════════════════════════════════

function hsvToRgb(h: number, s: number, v: number): [number, number, number] {
    const c = v * s;
    const x = c * (1 - Math.abs(((h / 60) % 2) - 1));
    const m = v - c;
    let r = 0,
        g = 0,
        b = 0;
    if (h < 60) [r, g, b] = [c, x, 0];
    else if (h < 120) [r, g, b] = [x, c, 0];
    else if (h < 180) [r, g, b] = [0, c, x];
    else if (h < 240) [r, g, b] = [0, x, c];
    else if (h < 300) [r, g, b] = [x, 0, c];
    else [r, g, b] = [c, 0, x];
    return [Math.round((r + m) * 255), Math.round((g + m) * 255), Math.round((b + m) * 255)];
}

function colorHSV(text: string, h: number, s = 1, v = 1): string {
    const [r, g, b] = hsvToRgb(h, s, v);
    return `\x1b[38;2;${r};${g};${b}m${text}\x1b[0m`;
}

const Reset = '\x1b[0m';
const Bold = '\x1b[1m';
const Dim = '\x1b[2m';
const FgGreen = '\x1b[32m';
const FgYellow = '\x1b[33m';
const FgCyan = '\x1b[36m';
const FgMagenta = '\x1b[35m';
const FgRed = '\x1b[31m';
const FgGray = '\x1b[90m';

function green(text: string): string {
    return `${FgGreen}${text}${Reset}`;
}
function yellow(text: string): string {
    return `${FgYellow}${text}${Reset}`;
}
function cyan(text: string): string {
    return `${FgCyan}${text}${Reset}`;
}
function magenta(text: string): string {
    return `${FgMagenta}${text}${Reset}`;
}
function red(text: string): string {
    return `${FgRed}${text}${Reset}`;
}
function gray(text: string): string {
    return `${FgGray}${text}${Reset}`;
}
function bold(text: string): string {
    return `${Bold}${text}${Reset}`;
}
function dim(text: string): string {
    return `${Dim}${text}${Reset}`;
}

// ══════════════════════════════════════════════════════════════════════════════
// VISUALIZATION
// ══════════════════════════════════════════════════════════════════════════════

const BLOCK_CHARS = ['▁', '▂', '▃', '▄', '▅', '▆', '▇', '█'];

/**
 * Creates a colored block bar visualization from sample data.
 * Uses HSV color gradient (green -> yellow) based on value.
 */
export function getBlockBar(values: number[], width: number = 20): string {
    if (values.length === 0) return '';

    const max = Math.max(...values);
    const min = Math.min(...values);
    const range = max - min || 1;

    // Sample down to width
    const step = Math.max(1, Math.floor(values.length / width));
    let result = '';

    for (let i = 0; i < width && i * step < values.length; i++) {
        const v = values[i * step];
        const norm = (v - min) / range;
        const idx = Math.min(7, Math.floor(norm * 8));
        const hue = 120 - Math.round(norm * 60); // green -> yellow gradient
        result += colorHSV(BLOCK_CHARS[idx], hue, 0.8, 1);
    }

    return result;
}

/**
 * Creates a Braille-based bar visualization (more compact).
 */
export function getBrailleBar(values: number[]): string {
    if (values.length === 0) return '';

    const max = Math.max(...values);
    const min = Math.min(...values);
    const norm = values.map(v => (v - min) / (max - min || 1));

    const BRAILLE_BASE = 0x2800;
    let result = '';

    for (let i = 0; i < norm.length; i += 2) {
        const top = norm[i];
        const bottom = norm[i + 1] ?? norm[i];
        const dots = (Math.round(top * 3) << 0) | (Math.round(bottom * 3) << 3);
        const char = String.fromCharCode(BRAILLE_BASE + dots);
        const ratio = (top + bottom) / 2;
        const hue = 180 - Math.round(ratio * 180);
        result += colorHSV(char, hue, 1, 1);
    }

    return result;
}

// ══════════════════════════════════════════════════════════════════════════════
// FORMATTING
// ══════════════════════════════════════════════════════════════════════════════

/**
 * Formats operations per second with K/M/B suffix.
 */
export function formatHz(v: number): string {
    if (v >= 1_000_000_000) return (v / 1_000_000_000).toFixed(2) + 'B';
    if (v >= 1_000_000) return (v / 1_000_000).toFixed(2) + 'M';
    if (v >= 1_000) return (v / 1_000).toFixed(2) + 'K';
    return v.toFixed(2);
}

/**
 * Formats operations per second with full number and locale formatting.
 */
export function formatHzFull(v: number): string {
    return v.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

/**
 * Formats mean time per operation with appropriate unit (ns, µs, ms, s).
 */
export function formatMean(ms: number): string {
    if (ms < 0.001) return (ms * 1000000).toFixed(3) + ' ns';
    if (ms < 1) return (ms * 1000).toFixed(3) + ' µs';
    if (ms < 1000) return ms.toFixed(3) + ' ms';
    return (ms / 1000).toFixed(3) + ' s';
}

/**
 * Formats relative margin of error as percentage.
 */
export function formatRme(v: number): string {
    return '±' + v.toFixed(2) + '%';
}

/**
 * Formats bytes with appropriate unit (B, KB, MB).
 */
export function formatBytes(bytes: number): string {
    if (Math.abs(bytes) < 1024) return bytes + ' B';
    if (Math.abs(bytes) < 1024 * 1024) return (bytes / 1024).toFixed(2) + ' KB';
    return (bytes / 1024 / 1024).toFixed(2) + ' MB';
}

// ══════════════════════════════════════════════════════════════════════════════
// HELPERS
// ══════════════════════════════════════════════════════════════════════════════

function mean(arr: number[]): number {
    return arr.reduce((a, b) => a + b, 0) / arr.length;
}

function variance(arr: number[], m: number): number {
    return arr.reduce((a, b) => a + (b - m) ** 2, 0) / arr.length;
}

const callGc = typeof global !== 'undefined' && global.gc ? global.gc : () => undefined;

function getHeapUsed(): number {
    return typeof process !== 'undefined' ? process.memoryUsage().heapUsed : 0;
}

function print(...args: any[]) {
    process.stdout.write(args.join(' ') + '\n');
}

// ══════════════════════════════════════════════════════════════════════════════
// EXECUTORS (loop-based for V8 optimization)
// ══════════════════════════════════════════════════════════════════════════════
//
// IMPORTANT: V8 shares type feedback between functions with identical bytecode.
// Each executor must have unique bytecode (via unique ID comment) to prevent
// megamorphic fn() call site pollution, which causes 3-5x performance degradation.
//
// Previously used shared executors which caused benchmark results to degrade
// as more benchmarks were run in the same process.
//

let executorId = 0;

const EXECUTOR_SIZES = [1, 10, 100, 1000, 10000, 100000, 1000000];

/**
 * Results of benchmarked functions end up here, so V8 can't remove a call whose result is unused
 * (pure functions like type guards would otherwise measure close to 0 ns).
 */
const sink = { value: 0 };

function getExecutor(times: number): (fn: Function) => number {
    const id = executorId++;
    // Unique bytecode per executor via unique ID comment prevents IC sharing
    const executor = new Function('fn', 'sink', `// Executor ${id}\nlet used = 0; for (let i = 0; i < ${times}; i++) if (fn() === sink) used++; sink.value += used; return ${times};`);
    return (fn: Function) => executor(fn, sink);
}

function getAsyncExecutor(times: number): (fn: Function) => Promise<number> {
    const id = executorId++;
    // Unique bytecode per executor via unique ID comment prevents IC sharing
    return new AsyncFunction(
        'fn',
        `// Executor ${id}\nfor (let i = 0; i < ${times}; i++) await fn(); return ${times};`,
    ) as (fn: Function) => Promise<number>;
}

/**
 * Create a fresh set of executors for a single benchmark.
 * Each benchmark gets its own executors with unique bytecode to prevent IC pollution.
 */
function createExecutors(): ((fn: Function) => number)[] {
    return EXECUTOR_SIZES.map(size => getExecutor(size));
}

function createAsyncExecutors(): ((fn: Function) => Promise<number>)[] {
    return EXECUTOR_SIZES.map(size => getAsyncExecutor(size));
}

// ══════════════════════════════════════════════════════════════════════════════
// BENCHSUITE CLASS
// ══════════════════════════════════════════════════════════════════════════════

/**
 * BenchSuite - A benchmark suite for organizing and running multiple benchmarks.
 *
 * Features:
 * - Automatic sync/async detection
 * - Block bar visualization
 * - Memory tracking
 * - Relative comparison between benchmarks
 * - Callback when suite completes
 *
 * @example
 * ```typescript
 * const suite = new BenchSuite('serialization');
 *
 * suite.add('serialize', () => {
 *     serialize<User>(user);
 * });
 *
 * suite.add('deserialize', () => {
 *     deserialize<User>(data);
 * });
 *
 * await suite.runAsync();
 * ```
 */
export class BenchSuite {
    private benchmarks: BenchmarkEntry[] = [];
    private results: BenchSuiteResult = {};

    /** Global callback when any suite completes */
    static onComplete?: (name: string, result: BenchSuiteResult) => void;

    constructor(
        /** Name of the benchmark suite */
        public readonly name: string,
        /** Default maximum time per benchmark in seconds */
        private defaultMaxTime: number = 1,
        /** Show comparison summary at end */
        private showSummary: boolean = false,
    ) {}

    /**
     * Add a benchmark to the suite.
     *
     * @param name - Name of the benchmark
     * @param fn - Function to benchmark (can be sync or async)
     * @param options - Optional settings
     */
    add(name: string, fn: () => void | Promise<void>, options: BenchmarkOptions = {}): this {
        this.benchmarks.push({ name, fn, options });
        return this;
    }

    /**
     * Run all benchmarks synchronously and return results.
     * Only works with sync benchmark functions.
     * For async benchmarks, use runAsync().
     */
    run(options: { verbose?: boolean } = {}): BenchSuiteResult {
        const { verbose = true } = options;

        if (this.benchmarks.length === 0) {
            if (verbose) console.log(gray(`No benchmarks to run in suite "${this.name}"`));
            return {};
        }

        const maxNameLen = Math.max(...this.benchmarks.map(b => b.name.length));

        if (verbose) {
            console.log();
            console.log(bold(`━━━ ${green(this.name)} ━━━`));
            console.log();
        }

        for (const bench of this.benchmarks) {
            try {
                const result = this.testSync(bench.fn as () => void, bench.options.maxTime ?? this.defaultMaxTime);
                if (verbose) {
                    this.printResult(bench.name, result, maxNameLen, false);
                }
                this.results[bench.name] = result;
            } catch (err) {
                if (verbose) console.error(red(`  ✗ ${bench.name} failed:`), err);
            }
        }

        if (verbose && this.showSummary) {
            this.printSummary();
        }

        if (BenchSuite.onComplete) {
            BenchSuite.onComplete(this.name, this.results);
        }

        return this.results;
    }

    /**
     * Run all benchmarks asynchronously.
     *
     * @returns Promise resolving to suite results
     */
    async runAsync(options: { verbose?: boolean } = {}): Promise<BenchSuiteResult> {
        const { verbose = true } = options;

        if (this.benchmarks.length === 0) {
            if (verbose) console.log(gray(`No benchmarks to run in suite "${this.name}"`));
            return {};
        }

        // Calculate max name length for alignment
        const maxNameLen = Math.max(...this.benchmarks.map(b => b.name.length));

        if (verbose) {
            console.log();
            console.log(bold(`━━━ ${green(this.name)} ━━━`));
            console.log();
        }

        for (const bench of this.benchmarks) {
            try {
                const result = await this.runBenchmark(bench, verbose, maxNameLen);
                this.results[bench.name] = result;
            } catch (err) {
                if (verbose) console.error(red(`  ✗ ${bench.name} failed:`), err);
            }
        }

        if (verbose && this.showSummary) {
            this.printSummary();
        }

        if (BenchSuite.onComplete) {
            BenchSuite.onComplete(this.name, this.results);
        }

        return this.results;
    }

    /**
     * Get results as JSON-serializable object.
     */
    getResults(): BenchSuiteResult {
        return this.results;
    }

    // ────────────────────────────────────────────────────────────────────────────
    // PRIVATE
    // ────────────────────────────────────────────────────────────────────────────

    private async runBenchmark(bench: BenchmarkEntry, verbose: boolean, maxNameLen: number = 20): Promise<BenchResult> {
        const maxTime = bench.options.maxTime ?? this.defaultMaxTime;
        const isAsync = bench.fn instanceof AsyncFunction || (bench.fn as any).constructor?.name === 'AsyncFunction';

        const result = isAsync
            ? await this.testAsync(bench.fn as () => Promise<void>, maxTime, bench.options)
            : this.testSync(bench.fn as () => void, maxTime);

        result.async = isAsync;

        if (verbose) {
            this.printResult(bench.name, result, maxNameLen, isAsync);
        }

        return result;
    }

    private testSync(fn: () => void, seconds: number): BenchResult {
        // Create fresh executors for this benchmark to avoid IC pollution
        const executors = createExecutors();

        // Find optimal executor (auto-calibrate)
        let executor = executors[0];
        for (const ex of executors) {
            const start = performance.now();
            ex(fn);
            const t = performance.now() - start;
            if (t > 5) break;
            executor = ex;
        }

        // Warmup
        for (let i = 0; i < 50; i++) executor(fn);

        // Run
        const maxMs = seconds * 1000;
        let consumed = 0;
        let iterations = 0;
        const samples: number[] = [];
        const gcEvents: number[] = [];

        callGc();
        const beforeHeap = getHeapUsed();
        const startTotal = performance.now();

        while (consumed < maxMs) {
            const start = performance.now();
            const r = executor(fn);
            const t = performance.now() - start;
            consumed += t;
            samples.push(t / r);
            iterations += r;
        }

        const elapsed = (performance.now() - startTotal) / 1000;
        const heapDiff = getHeapUsed() - beforeHeap;

        return this.collectResult(samples, iterations, elapsed, heapDiff, gcEvents);
    }

    private async testAsync(fn: () => Promise<void>, seconds: number, options: BenchmarkOptions = {}): Promise<BenchResult> {
        // Create fresh executors for this benchmark to avoid IC pollution
        const asyncExecutors = createAsyncExecutors();

        // Find optimal executor (auto-calibrate)
        let executor = asyncExecutors[0];
        const { beforeEach, afterEach } = options;
        // the hooks have to run around every single iteration
        if (!beforeEach && !afterEach) {
            for (const ex of asyncExecutors) {
                const start = performance.now();
                await ex(fn);
                const t = performance.now() - start;
                if (t > 5) break;
                executor = ex;
            }
        }

        // only the executor is timed
        const timed = async (): Promise<[iterations: number, time: number]> => {
            if (beforeEach) await beforeEach();
            const start = performance.now();
            const iterations = await executor(fn);
            const time = performance.now() - start;
            if (afterEach) await afterEach();
            return [iterations, time];
        };

        // Warmup
        for (let i = 0; i < 20; i++) await timed();

        // Run
        const maxMs = seconds * 1000;
        let consumed = 0;
        let iterations = 0;
        const samples: number[] = [];
        const gcEvents: number[] = [];

        callGc();
        const beforeHeap = getHeapUsed();
        const startTotal = performance.now();

        while (consumed < maxMs) {
            const [r, t] = await timed();
            consumed += t;
            samples.push(t / r);
            iterations += r;
        }

        const elapsed = (performance.now() - startTotal) / 1000;
        const heapDiff = getHeapUsed() - beforeHeap;

        return this.collectResult(samples, iterations, elapsed, heapDiff, gcEvents);
    }

    private collectResult(
        samples: number[],
        iterations: number,
        elapsed: number,
        heapDiff: number,
        gcEvents: number[],
    ): BenchResult {
        const avg = mean(samples);
        const varr = variance(samples, avg);
        const rme = (Math.sqrt(varr) / avg) * 100;
        const hz = 1000 / avg;

        return {
            hz,
            elapsed,
            rme: isFinite(rme) ? rme : 0,
            mean: avg,
            variance: varr,
            iterations,
            samples: samples.slice(0, 50),
            heapDiff,
            async: false,
            gcEvents,
        };
    }

    private printResult(name: string, result: BenchResult, maxNameLen: number, isAsync: boolean): void {
        const bar = getBlockBar(result.samples, 20);
        const hzStr = green(formatHzFull(result.hz).padStart(18));
        const meanStr = yellow(formatMean(result.mean).padStart(12));
        const rmeStr = gray(formatRme(result.rme).padStart(8));
        const asyncTag = isAsync ? dim(' (async)') : '';
        const gcInfo = result.gcEvents.length ? gray(` ${result.gcEvents.length}gc`) : '';

        console.log(`  ${bar} ${hzStr} ops/sec ${meanStr}/op ${rmeStr}  ${name}${asyncTag}${gcInfo}`);
    }

    private printSummary(): void {
        const entries = Object.entries(this.results);
        if (entries.length === 0) return;

        // Sort by ops/sec descending
        entries.sort((a, b) => b[1].hz - a[1].hz);
        const fastest = entries[0];

        console.log();
        console.log(bold('  Summary:'));

        for (let i = 0; i < entries.length; i++) {
            const [name, result] = entries[i];
            const isFastest = i === 0;
            const factor = fastest[1].hz / result.hz;

            // Performance bar (relative to fastest)
            const barWidth = 15;
            const filled = Math.round((result.hz / fastest[1].hz) * barWidth);
            const bar = green('█'.repeat(filled)) + gray('░'.repeat(barWidth - filled));

            const hzStr = cyan(formatHz(result.hz).padStart(10));
            const factorStr = isFastest ? green(bold('fastest')) : dim(`x${factor.toFixed(2).padStart(6)}`);

            const nameStr = isFastest ? bold(green(name)) : name;

            console.log(`  ${bar} ${hzStr} ops/sec ${factorStr}  ${nameStr}`);
        }

        console.log();
    }
}

// ══════════════════════════════════════════════════════════════════════════════
// SIMPLE API (for quick benchmarks)
// ══════════════════════════════════════════════════════════════════════════════

interface SimpleBenchmark {
    name: string;
    fn: () => void | Promise<void>;
    iterations: number;
    avgTime: number;
    variance: number;
    rme: number;
    samples: number[];
    heapDiff: number;
    gcEvents: number[];
}

function noop() {}

const benchmarks: SimpleBenchmark[] = [
    {
        name: '',
        fn: noop,
        gcEvents: [],
        samples: [],
        iterations: 0,
        avgTime: 0,
        heapDiff: 0,
        rme: 0,
        variance: 0,
    },
];
let benchmarkCurrent = 1;
let current = benchmarks[0];

function report(benchmark: SimpleBenchmark) {
    const hz = 1000 / benchmark.avgTime;
    const bar = getBlockBar(benchmark.samples, 20);

    print(
        ' ',
        bar,
        'x',
        green(hz.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 }).padStart(14)),
        'ops/sec',
        '\xb1' + benchmark.rme.toFixed(2).padStart(5) + '%',
        yellow(
            benchmark.avgTime
                .toLocaleString(undefined, { minimumFractionDigits: 6, maximumFractionDigits: 6 })
                .padStart(10),
        ),
        'ms/op',
        green(benchmark.name) + (current.fn instanceof AsyncFunction ? ' (async)' : ''),
        `\t${benchmark.iterations} samples`,
        benchmark.gcEvents.length
            ? `\t${benchmark.gcEvents.length} gc (${benchmark.gcEvents.reduce((a, b) => a + b, 0)}ms)`
            : '',
    );
}

/**
 * Registers a benchmark with the given name and function.
 * Function can be synchronous or asynchronous.
 *
 * @example
 * ```typescript
 * import { benchmark, run } from '@deepkit/bench';
 *
 * benchmark('serialize', () => {
 *     serialize<User>(user);
 * });
 *
 * await run(1); // Run for 1 second
 * ```
 */
export function benchmark(name: string, fn: () => void | Promise<void>) {
    benchmarks.push({
        name,
        fn,
        gcEvents: [],
        samples: [],
        iterations: 0,
        avgTime: 0,
        heapDiff: 0,
        rme: 0,
        variance: 0,
    });
}

/**
 * Runs all registered benchmarks each for the given number of seconds.
 *
 * @param seconds - Duration to run each benchmark (default: 1)
 */
export async function run(seconds: number = 1) {
    print('Node', process.version);

    while (benchmarkCurrent < benchmarks.length) {
        current = benchmarks[benchmarkCurrent];
        try {
            if (current.fn instanceof AsyncFunction) {
                await testSimpleAsync(seconds);
            } else {
                testSimpleSync(seconds);
            }
        } catch (error) {
            print(`Benchmark ${current.name} failed`, error);
        }
        benchmarkCurrent++;
        report(current);
    }

    console.log('done');
}

function testSimpleSync(seconds: number) {
    // Create fresh executors for this benchmark to avoid IC pollution
    const executors = createExecutors();

    let iterations = 1;
    let samples: number[] = [];
    const max = seconds * 1000;

    let execIdx = 0;
    let executor = executors[execIdx];
    // Check which executor to use, go up until one round takes more than 5ms
    do {
        const candidate = executors[execIdx++];
        if (!candidate) break;
        const start = performance.now();
        candidate(current.fn);
        const end = performance.now();
        const time = end - start;
        if (time > 5) break;
        executor = candidate;
    } while (true);

    // Warmup
    for (let i = 0; i < 100; i++) {
        executor(current.fn);
    }

    let consumed = 0;
    const beforeHeap = process.memoryUsage().heapUsed;
    callGc();
    do {
        const start = performance.now();
        const r = executor(current.fn);
        const end = performance.now();
        const time = end - start;
        consumed += time;
        samples.push(time / r);
        iterations += r;
    } while (consumed < max);

    collectSimple(current, beforeHeap, samples, iterations);
}

function collectSimple(current: SimpleBenchmark, beforeHeap: number, samples: number[], iterations: number) {
    // Remove first 10% of samples
    const allSamples = samples.slice();
    samples = samples.slice(Math.floor(samples.length * 0.1));

    const avgTime = samples.reduce((sum, t) => sum + t, 0) / samples.length;
    samples.sort((a, b) => a - b);

    const varianceVal = samples.reduce((sum, t) => sum + Math.pow(t - avgTime, 2), 0) / samples.length;
    const rme = (Math.sqrt(varianceVal) / avgTime) * 100; // Relative Margin of Error (RME)

    const afterHeap = process.memoryUsage().heapUsed;
    const heapDiff = afterHeap - beforeHeap;

    current.avgTime = avgTime;
    current.variance = varianceVal;
    current.rme = rme;
    current.heapDiff = heapDiff;
    current.iterations = iterations;
    // Pick 20 samples from allSamples, make sure the first and last are included
    current.samples = allSamples.filter(
        (v, i) => i === 0 || i === allSamples.length - 1 || i % Math.floor(allSamples.length / 20) === 0,
    );
}

async function testSimpleAsync(seconds: number) {
    // Create fresh executors for this benchmark to avoid IC pollution
    const asyncExecutors = createAsyncExecutors();

    let iterations = 1;
    let samples: number[] = [];
    const max = seconds * 1000;

    let execIdx = 0;
    let executor = asyncExecutors[execIdx];
    // Check which executor to use, go up until one round takes more than 5ms
    do {
        const candidate = asyncExecutors[execIdx++];
        if (!candidate) break;
        const start = performance.now();
        await candidate(current.fn);
        const end = performance.now();
        const time = end - start;
        if (time > 5) break;
        executor = candidate;
    } while (true);

    // Warmup
    for (let i = 0; i < 100; i++) {
        await executor(current.fn);
    }

    let consumed = 0;
    const beforeHeap = process.memoryUsage().heapUsed;
    callGc();
    do {
        const start = performance.now();
        const r = await executor(current.fn);
        const end = performance.now();
        const time = end - start;
        consumed += time;
        samples.push(time / r);
        iterations += r;
    } while (consumed < max);

    collectSimple(current, beforeHeap, samples, iterations);
}

// ══════════════════════════════════════════════════════════════════════════════
// UTILITY FUNCTIONS
// ══════════════════════════════════════════════════════════════════════════════

/**
 * Forces garbage collection if --expose-gc flag was used.
 */
export function forceGC(): void {
    callGc();
}

/**
 * Gets current heap memory usage in bytes.
 */
export function getHeapUsage(): number {
    return getHeapUsed();
}

/**
 * Warmup function for V8 optimization.
 * Run a function multiple times to ensure V8 optimizes it before benchmarking.
 *
 * @param fn - Function to warmup
 * @param times - Number of warmup iterations (default: 100)
 */
export function warmup(fn: () => unknown, times: number = 100): void {
    for (let i = 0; i < times; i++) {
        fn();
    }
}

/**
 * Async warmup function for V8 optimization.
 *
 * @param fn - Async function to warmup
 * @param times - Number of warmup iterations (default: 50)
 */
export async function warmupAsync(fn: () => Promise<unknown>, times: number = 50): Promise<void> {
    for (let i = 0; i < times; i++) {
        await fn();
    }
}
