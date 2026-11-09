// Aggregates the benchmark results of a machine (benchmarks/results/<machine>/*.json, written by `npm run bench`)
// into src/app/benchmarks/benchmark-data.json for the benchmarks page.
import { execFileSync } from 'child_process';
import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';

const machine = process.env.BENCH_MACHINE || 'i9mac';
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

/** How many commits that can change the numbers came after the commit, website-only commits don't count. */
function commitsBehind(commit) {
    try {
        execFileSync('git', ['merge-base', '--is-ancestor', commit, 'HEAD'], { cwd: root, stdio: 'ignore' });
        const count = execFileSync('git', ['rev-list', '--count', `${commit}..HEAD`, '--', 'packages', 'benchmarks', ':!benchmarks/results', 'package.json', 'yarn.lock'], {
            cwd: join(root, '..'),
            stdio: ['ignore', 'pipe', 'ignore'],
        });
        return Number(count.toString().trim());
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

// emitted size and build time of the pinned codebases, per run
const builds = new Map();
results.forEach((result, runIndex) => {
    for (const [name, entry] of Object.entries(result.builds || {})) {
        let build = builds.get(name);
        if (!build) {
            const perRun = () => results.map(() => null);
            builds.set(name, build = {
                name,
                bytes: { plain: perRun(), reflected: perRun() },
                gzip: { plain: perRun(), reflected: perRun() },
                time: { plain: perRun(), reflected: perRun() },
                rme: { plain: perRun(), reflected: perRun() },
            });
        }
        build.files = entry.files;
        build.lines = entry.lines;
        for (const side of ['plain', 'reflected']) {
            build.bytes[side][runIndex] = entry[side].bytes;
            build.gzip[side][runIndex] = entry[side].gzip;
            build.time[side][runIndex] = entry[side].time;
            build.rme[side][runIndex] = entry[side].rme;
        }
    }
});

const data = {
    machine: results.length ? results[results.length - 1].machine : undefined,
    runs: results.map(v => ({ label: v.label, commit: v.commit, date: v.sortDate, release: isRelease(v.label), behind: !isRelease(v.label) && v.commit ? commitsBehind(v.commit) : undefined, libraries: v.libraries || {} })),
    suites: [...suites.values()].map(v => ({ name: v.name, file: v.file, benchmarks: [...v.benchmarks.values()] })),
    builds: [...builds.values()],
};

mkdirSync(dirname(out), { recursive: true });
writeFileSync(out, JSON.stringify(data));
console.log(`benchmark data: ${results.length} runs, ${data.suites.length} suites -> ${out}`);
