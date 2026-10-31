# @deepkit/bench

Zero-dependency benchmark utility with visualization and statistical analysis.

## Features

- Automatic sync/async detection
- Adaptive iteration selection (1x to 10M iterations)
- GC event tracking (when `--expose-gc` is used)
- Heap delta measurement
- Statistical analysis (RME, variance)
- Color-coded output with block bar visualization
- Both simple API and class-based `BenchSuite` API

## Installation

```bash
npm install @deepkit/bench
```

## Simple API

For quick, one-off benchmarks:

```typescript
import { benchmark, run } from '@deepkit/bench';

let counter = 0;

benchmark('increment', () => {
  counter += 10;
});

benchmark('multiply', () => {
  counter *= 2;
});

await run(1); // Run each benchmark for 1 second
```

Run with:

```bash
node --import @deepkit/run benchmarks/test.ts
```

## BenchSuite API

For organized benchmark suites with comparison:

```typescript
import { BenchSuite } from '@deepkit/bench';

const suite = new BenchSuite('serialization', 1, true); // name, maxTime, showSummary

suite.add('serialize', () => {
  serialize<User>(user);
});

suite.add('deserialize', () => {
  deserialize<User>(data);
});

await suite.runAsync();
```

### Output

```
━━━ serialization ━━━

  ▁▂▃▄▅▆▇█▇▆▅▄▃▂▁▂▃▄▅▆   32,456,789.12 ops/sec    30.821 ns/op   ±1.23%  serialize
  ▁▂▃▄▅▆▇█▇▆▅▄▃▂▁▂▃▄▅▆   28,123,456.78 ops/sec    35.557 ns/op   ±0.98%  deserialize

  Summary:
  ███████████████   32.46M ops/sec fastest  serialize
  █████████████░░   28.12M ops/sec   x1.15  deserialize
```

## Formatting Utilities

```typescript
import { formatBytes, formatHz, formatHzFull, formatMean, formatRme } from '@deepkit/bench';

formatHz(1_000_000); // "1.00M"
formatHzFull(1_000_000); // "1,000,000.00"
formatMean(0.000001); // "1.000 ns"
formatMean(0.001); // "1.000 µs"
formatMean(1); // "1.000 ms"
formatRme(1.5); // "±1.50%"
formatBytes(1024); // "1.00 KB"
```

## Visualization Utilities

```typescript
import { getBlockBar, getBrailleBar } from '@deepkit/bench';

// Block bar (uses █▇▆▅▄▃▂▁ characters with HSV color gradient)
getBlockBar(samples, 20);

// Braille bar (more compact, uses Braille characters)
getBrailleBar(samples);
```

## Memory & GC Utilities

```typescript
import { forceGC, getHeapUsage, warmup, warmupAsync } from '@deepkit/bench';

// Force garbage collection (requires --expose-gc)
forceGC();

// Get current heap usage in bytes
const heap = getHeapUsage();

// Warmup a function for V8 optimization
warmup(myFunction, 100);

// Warmup an async function
await warmupAsync(myAsyncFunction, 50);
```

## API Reference

### Types

```typescript
interface BenchResult {
  hz: number; // Operations per second
  elapsed: number; // Total elapsed time in seconds
  rme: number; // Relative margin of error (percentage)
  mean: number; // Mean time per operation in milliseconds
  variance: number; // Variance of samples
  iterations: number; // Number of iterations run
  samples: number[]; // Sample timings (up to 50)
  heapDiff: number; // Heap memory difference in bytes
  async: boolean; // Whether this is an async benchmark
  gcEvents: number[]; // GC events during benchmark (pause times in ms)
}

type BenchSuiteResult = { [name: string]: BenchResult };

interface BenchmarkOptions {
  maxTime?: number; // Maximum time to run in seconds (default: 1)
}
```

### BenchSuite

```typescript
class BenchSuite {
  static onComplete?: (name: string, result: BenchSuiteResult) => void;

  constructor(
    name: string,
    defaultMaxTime?: number, // Default: 1
    showSummary?: boolean, // Default: false
  );

  add(name: string, fn: () => void | Promise<void>, options?: BenchmarkOptions): this;
  run(options?: { verbose?: boolean }): void;
  runAsync(options?: { verbose?: boolean }): Promise<BenchSuiteResult>;
  getResults(): BenchSuiteResult;
}
```

## Tips for Accurate Benchmarks

1. **Use `--expose-gc`** for GC tracking: `node --expose-gc script.ts`
2. **Warmup functions** before benchmarking to ensure V8 optimization
3. **Avoid side effects** in benchmark functions that could skew results
4. **Run multiple times** to account for system variance
5. **Use longer durations** (2-5 seconds) for more stable results
