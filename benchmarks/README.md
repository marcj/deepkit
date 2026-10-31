# Benchmarks

Each package has its benchmarks in `packages/<package>/benchmarks/*.bench.ts`. The comparisons with other libraries (typia, zod, valibot, arktype, TypeBox, class-validator, class-transformer, bson) are in `benchmarks/comparison`.

```sh
npm run bench                          # all benchmarks against the workspace
npm run bench -- type bson             # only files whose path contains one of the filters
npm run bench -- --target 1.0.19       # the same files against the published packages of 1.0.19
npm run bench -- --compare a.json b.json   # markdown table of two result files
```

Results are written to `benchmarks/results/<machine>/<label>.json`: the commit for workspace runs (with `-dirty` if `packages` has uncommitted changes), or the version for `--target`. They contain the machine, Node.js version, and per benchmark the operations per second, the relative margin of error, and the mean time. Commit results of a quiet machine, so they can be compared over time and shown on the website. Laptops are too noisy for that.

The MongoDB benchmark needs a database: `docker compose up -d mongo`, or `MONGO_URL`.

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
