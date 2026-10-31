// Aggregates the benchmark results of a machine (benchmarks/results/<machine>/*.json, written by `npm run bench`)
// into src/app/benchmarks/benchmark-data.json for the benchmarks page.
import { execFileSync } from 'child_process';
import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';

const machine = 'i9mac';
const root = dirname(fileURLToPath(import.meta.url));
const resultsDir = join(root, '..', 'benchmarks', 'results', machine);
const out = join(root, 'src', 'app', 'benchmarks', 'benchmark-data.json');

const isRelease = label => /^\d+\.\d+\.\d+/.test(label);

function compareVersions(a, b) {
    const pa = a.split(/[.-]/).map(Number);
    const pb = b.split(/[.-]/).map(Number);
    for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
        if ((pa[i] || 0) !== (pb[i] || 0)) return (pa[i] || 0) - (pb[i] || 0);
    }
    return 0;
}

/** The date of the commit (or tag of a release), so a run measured later is still at its place in the history. */
function commitDate(commit) {
    try {
        return execFileSync('git', ['log', '-1', '--format=%cI', commit], { cwd: root, stdio: ['ignore', 'pipe', 'ignore'] }).toString().trim();
    } catch {
        return undefined;
    }
}

const files = existsSync(resultsDir) ? readdirSync(resultsDir).filter(v => v.endsWith('.json') && !v.includes('-dirty')) : [];
const results = files.map(file => JSON.parse(readFileSync(join(resultsDir, file), 'utf8')));
for (const result of results) {
    result.sortDate = (isRelease(result.label) ? commitDate('v' + result.label) : result.commit && commitDate(result.commit)) || result.date;
}

// in the order of the history: releases at the date of their tag, commits at their date
results.sort((a, b) => {
    const diff = new Date(a.sortDate).getTime() - new Date(b.sortDate).getTime();
    if (diff) return diff;
    if (isRelease(a.label) && isRelease(b.label)) return compareVersions(a.label, b.label);
    return 0;
});

const suites = new Map();
results.forEach((result, runIndex) => {
    for (const [file, fileSuites] of Object.entries(result.files)) {
        for (const [suiteName, benchmarks] of Object.entries(fileSuites)) {
            let suite = suites.get(suiteName);
            if (!suite) suites.set(suiteName, suite = { name: suiteName, file, benchmarks: new Map() });
            for (const [name, entry] of Object.entries(benchmarks)) {
                let benchmark = suite.benchmarks.get(name);
                if (!benchmark) {
                    benchmark = { name, hz: results.map(() => null), rme: results.map(() => null) };
                    suite.benchmarks.set(name, benchmark);
                }
                benchmark.hz[runIndex] = Math.round(entry.hz * 100) / 100;
                benchmark.rme[runIndex] = entry.rme;
            }
        }
    }
});

const data = {
    machine: results.length ? results[results.length - 1].machine : undefined,
    runs: results.map(v => ({ label: v.label, commit: v.commit, date: v.sortDate, release: isRelease(v.label), libraries: v.libraries || {} })),
    suites: [...suites.values()].map(v => ({ name: v.name, file: v.file, benchmarks: [...v.benchmarks.values()] })),
};

mkdirSync(dirname(out), { recursive: true });
writeFileSync(out, JSON.stringify(data));
console.log(`benchmark data: ${results.length} runs, ${data.suites.length} suites -> ${out}`);
