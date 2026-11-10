# Benchmarks

Each package has its benchmarks in `packages/<package>/benchmarks/*.bench.ts`. The comparisons with other libraries (typia, zod, valibot, arktype, TypeBox, class-validator, class-transformer, bson) are in `benchmarks/comparison`.

```sh
npm run bench                          # all benchmarks against the workspace
npm run bench -- type bson             # only files whose path contains one of the filters
npm run bench -- build                 # only the emitted size and build time of the pinned codebases
npm run bench -- --target 1.0.19       # the same files against the published packages of 1.0.19
npm run bench -- --compare a.json b.json   # markdown table of two result files
```

Results are written to `benchmarks/results/<machine>/<label>.json`: the commit for workspace runs (with `-dirty` if `packages` has uncommitted changes), or the version for `--target`. They contain the machine, Node.js version, and per benchmark the operations per second, the relative margin of error, and the mean time. Commit results of a quiet machine, so they can be compared over time and shown on the website. Laptops are too noisy for that.

The MongoDB benchmark needs a database: `docker compose up -d mongo`, or `MONGO_URL`.

## Load benchmarks

The single-client comparisons in `comparison/rpc` and `comparison/orm` show the cost of one call. The ones in `comparison/load` show what happens with many clients and connections, and how each library scales. `npm run bench -- comparison/load` takes about 5 minutes for all libraries.

- Every library gets its own set of processes: optionally a server (RPC, one Node.js process per library) and load processes, each with some clients and a closed loop of callers per client. A caller starts its next call when the previous one returned. The workloads and levels of a library run one after the other on these processes.
- `LOAD_WARMUP` (0.5) and `LOAD_SECONDS` (1) set the time per cell, `LOAD_PROCESSES` (5) the most load processes, `LOAD_POOL` (10) the size of the connection pools, `LOAD_LIBRARY` a part of the libraries (e.g. `rpc/grpc` or `postgres`).
- RPC levels: 8 and 64 connections × 8 in-flight calls per connection. The connections are spread over up to 5 load processes.
- ORM levels: 16 users in one application process with a pool of 10 connections, and 128 users spread over 4 application processes with a pool of 10 each. All libraries use the same pool size and the same tables and rows, created by the harness. Workloads are findOne, a page of 100 rows and inserting one row returning its generated key.
- Broker levels: the same as RPC. Workloads are reading, writing and incrementing a key, and publishing a message until the subscriber received it. Redis and Valkey run in-memory with their default threading. NATS only runs the publish workload, its key-value store needs JetStream, which persists. The server binaries come from `PATH`, or `REDIS_SERVER`, `VALKEY_SERVER` and `NATS_SERVER`.
- SQLite has one writer in the process of the application, so only 16 users in one process run, without pool settings.

A result has the usual `hz` (total calls per second), `rme` (of the per-second throughput), `mean` (the mean latency in ms, not 1/hz) and `iterations`, plus `load` with the latency percentiles (`p50`, `p90`, `p99`, `p999`, `max` in ms), `errors`, and the CPU, GC and memory of the server and the load processes. A cell that failed has `hz: 0` and `load.error`. The CPU of the load processes shows whether the load generator was the limit, which is expected with a single connection, since one connection can only live in one process.

## Bundle size and build time

Every full run also compiles the codebases in `build/codebases.json` with the type compiler off (`reflection: never`) and on, with the same `tsc` a project uses: type check and emit, five times each in a fresh process. The results contain the emitted bytes, gzipped bytes and the median build time for both, so the overhead of runtime types can be tracked over time. The codebases are our own sources pinned to one commit, so the numbers only change when the compiler does; change `ref` deliberately, since it starts a new series.

The packages have to be built first (`npm run tsc`), since dependencies resolve to the workspace.

## Writing benchmarks

A benchmark file exports a function that returns a `BenchSuite`:

```typescript
import { BenchSuite } from '@deepkit/bench';
import { serialize } from '@deepkit/type';

export default function () {
    const suite = new BenchSuite('type/serialize');
    suite.add('serialize user', () => serialize<User>(user));
    return suite;
}
```

- Import packages by name (`@deepkit/type`, not `../src`), so the same file runs against older versions with `--target`.
- Use different input objects (see `rotate()` in `comparison/models.ts`): V8 can move the work for an unchanged object out of the benchmark loop.
- Every file runs in its own process, in the folder of its `tsconfig.json` (`reflection: true`).

## typia

typia generates its validators ahead of time with the native TypeScript compiler (`ttsc`, needs Go). The generated code in `comparison/typia-generated` is committed. After changing `comparison/typia/validators.ts` or updating typia, run `npm run bench:typia`.
