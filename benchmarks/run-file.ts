// Runs one benchmark file and writes its results as JSON, see runner.ts.
// Usage: node --expose-gc --import @deepkit/run run-file.ts <file.bench.ts> <out.json>
import { writeFileSync } from 'fs';
import { pathToFileURL } from 'url';

import { BenchSuite, BenchSuiteResult } from '@deepkit/bench';

const [file, out] = process.argv.slice(2);
const results: { [suite: string]: BenchSuiteResult } = {};
BenchSuite.onComplete = (name, result) => {
    results[name] = result;
};

const module = await import(pathToFileURL(file).href);
const exported = module.default ?? module.suite ?? module.run;
const suite = typeof exported === 'function' && exported !== module.run ? await exported() : exported;
if (suite instanceof BenchSuite) {
    await suite.runAsync();
} else if (typeof module.run === 'function') {
    await module.run();
}

writeFileSync(out, JSON.stringify(results));
process.exit(0);
