// Runs the benchmarks of all packages (packages/*/benchmarks/**/*.bench.ts) and the comparisons with other
// libraries (benchmarks/comparison/**/*.bench.ts), and writes the results to benchmarks/results/<label>.json.
//
//   npm run bench                         all benchmarks against the workspace
//   npm run bench -- bson injector        only files whose path matches one of the filters
//   npm run bench -- --target 1.0.19      the same benchmark files against the published packages of 1.0.19
//   npm run bench -- --compare a.json b.json   compares two result files
//
// Each file runs in its own process, so the JIT state of one suite doesn't influence the next.
import { execFileSync, spawnSync } from 'child_process';
import { cpSync, existsSync, mkdirSync, readdirSync, readFileSync, rmSync, symlinkSync, writeFileSync } from 'fs';
import { cpus, hostname, tmpdir } from 'os';
import { dirname, join, relative } from 'path';

import { formatHz } from '@deepkit/bench';

interface BenchmarkEntry {
    hz: number;
    rme: number;
    mean: number;
    iterations: number;
}

interface ResultFile {
    label: string;
    /** dependency versions forced for an older target */
    overrides?: { [name: string]: string };
    version: string;
    commit?: string;
    date: string;
    machine: { hostname: string; cpu: string; cores: number; platform: string; node: string };
    /** installed versions of the compared libraries (zod, prisma, ...), shown next to their results */
    libraries?: { [name: string]: string };
    /** file -> suite -> benchmark -> result */
    files: { [file: string]: { [suite: string]: { [benchmark: string]: BenchmarkEntry } } };
}

const root = join(import.meta.dirname, '..');

/** The installed versions of the libraries the comparisons run against, from their package.json in node_modules. */
function libraryVersions(): { [name: string]: string } {
    const benchmarksPackage = JSON.parse(readFileSync(join(root, 'benchmarks', 'package.json'), 'utf8'));
    const names = [...Object.keys({ ...benchmarksPackage.dependencies, ...benchmarksPackage.devDependencies }), 'better-sqlite3'];
    const versions: { [name: string]: string } = {};
    for (const name of names.filter(v => !v.startsWith('@deepkit/')).sort()) {
        for (const dir of [join(root, 'benchmarks', 'node_modules'), join(root, 'node_modules')]) {
            const file = join(dir, name, 'package.json');
            if (!existsSync(file)) continue;
            versions[name] = JSON.parse(readFileSync(file, 'utf8')).version;
            break;
        }
    }
    return versions;
}
const resultsDir = join(root, 'benchmarks', 'results');

function findBenchmarks(filters: string[]): string[] {
    const files: string[] = [];
    const dirs = readdirSync(join(root, 'packages')).map(v => join(root, 'packages', v, 'benchmarks'));
    dirs.push(join(root, 'benchmarks', 'comparison'));
    for (const dir of dirs) {
        if (!existsSync(dir)) continue;
        for (const file of readdirSync(dir, { recursive: true }) as string[]) {
            if (file.endsWith('.bench.ts')) files.push(relative(root, join(dir, file)));
        }
    }
    files.sort();
    return filters.length ? files.filter(file => filters.some(filter => file.includes(filter))) : files;
}

/**
 * @deepkit/run compiles with the tsconfig.json of the working directory, so a benchmark runs in the folder of its
 * nearest tsconfig.json (with `reflection: true`), e.g. its package.
 */
function configDir(file: string): string {
    for (let dir = dirname(file); dir.length > 1; dir = dirname(dir)) {
        if (existsSync(join(dir, 'tsconfig.json'))) return dir;
    }
    return dirname(file);
}

function git(...args: string[]): string {
    return execFileSync('git', args, { cwd: root, encoding: 'utf8' }).trim();
}

/**
 * Installs the published packages of a version in a temporary folder, with the benchmark files copied into it,
 * so they import that version. The new @deepkit/bench is used, since the old one has no BenchSuite.
 */
function prepareTarget(version: string, files: string[]): string {
    const dir = join(tmpdir(), 'deepkit-bench-' + version);
    //older versions don't declare all @deepkit packages they import, so all core packages are installed
    const packages = new Set(['run', 'type-compiler', 'type-spec', 'type', 'core', 'core-rxjs', 'injector', 'event', 'app', 'logger', 'stopwatch', 'workflow', 'bson', 'rpc', 'http', 'template', 'orm', 'sql', 'sqlite', 'mongo'].map(v => '@deepkit/' + v));
    for (const file of files) {
        for (const match of readFileSync(join(root, file), 'utf8').matchAll(/from '(@deepkit\/[a-z-]+)/g)) packages.add(match[1]);
    }
    packages.delete('@deepkit/bench');
    const dependencies: { [name: string]: string } = { typescript: '~5.8.3', rxjs: '^7.8.0' };
    for (const name of packages) dependencies[name] = version;

    const packageFile = join(dir, 'package.json');
    //drivers that older versions can't build on the current Node.js version, e.g. better-sqlite3 before 12.11 on Node.js 26
    const overrides = { 'better-sqlite3': JSON.parse(readFileSync(join(root, 'packages', 'sqlite', 'package.json'), 'utf8')).dependencies['better-sqlite3'] };
    const packageJson = JSON.stringify({ name: 'deepkit-bench-target', private: true, type: 'module', dependencies, overrides }, null, 2);
    if (!existsSync(packageFile) || readFileSync(packageFile, 'utf8') !== packageJson) {
        mkdirSync(dir, { recursive: true });
        writeFileSync(packageFile, packageJson);
        console.log(`Installing ${version} in ${dir}`);
        execFileSync('npm', ['install', '--no-audit', '--no-fund', '--loglevel=error'], { cwd: dir, stdio: 'inherit' });
        execFileSync('npx', ['deepkit-type-install'], { cwd: dir, stdio: 'inherit' });
    }
    writeFileSync(join(dir, 'tsconfig.json'), JSON.stringify({
        compilerOptions: { target: 'es2022', module: 'es2022', moduleResolution: 'bundler', experimentalDecorators: true, emitDecoratorMetadata: true, skipLibCheck: true },
        reflection: true,
    }, null, 2));

    //the libraries of the comparison benchmarks are linked from the workspace, so both runs use the same versions
    const devDependencies = JSON.parse(readFileSync(join(root, 'benchmarks', 'package.json'), 'utf8')).devDependencies || {};
    for (const name of Object.keys(devDependencies)) {
        //ttsc and the native TypeScript only generate the typia code, which is committed
        if (name.startsWith('@deepkit/') || name === 'ttsc' || name === 'typescript-native') continue;
        const source = [join(root, 'benchmarks', 'node_modules', name), join(root, 'node_modules', name)].find(v => existsSync(v));
        if (!source) throw new Error(`${name} is not installed in the workspace, run yarn`);
        const link = join(dir, 'node_modules', name);
        rmSync(link, { recursive: true, force: true });
        mkdirSync(dirname(link), { recursive: true });
        symlinkSync(source, link);
    }

    const bench = join(dir, 'node_modules', '@deepkit', 'bench');
    rmSync(bench, { recursive: true, force: true });
    cpSync(join(root, 'packages', 'bench'), bench, { recursive: true, filter: v => !v.includes('node_modules') });

    //the benchmark folders with their helpers (e.g. models.ts, generated code, tsconfig.json)
    rmSync(join(dir, 'benchmarks'), { recursive: true, force: true });
    rmSync(join(dir, 'packages'), { recursive: true, force: true });
    const folders = new Set(files.map(file => file.startsWith('benchmarks/') ? 'benchmarks/comparison' : file.slice(0, file.indexOf('/benchmarks/') + '/benchmarks'.length)));
    for (const folder of [...folders, 'benchmarks/run-file.ts', 'benchmarks/tsconfig.json']) {
        cpSync(join(root, folder), join(dir, folder), { recursive: true });
    }
    return dir;
}

function run(args: string[]) {
    let target = '';
    let out = '';
    const filters: string[] = [];
    for (let i = 0; i < args.length; i++) {
        if (args[i] === '--target') target = args[++i];
        else if (args[i] === '--out') out = args[++i];
        else filters.push(args[i]);
    }

    const files = findBenchmarks(filters);
    if (!files.length) throw new Error('No benchmark files found');
    const cwd = target ? prepareTarget(target, files) : root;

    const version = target || JSON.parse(readFileSync(join(root, 'lerna.json'), 'utf8')).version;
    const commit = target ? undefined : git('rev-parse', '--short=9', 'HEAD') + (git('status', '--porcelain', '--', 'packages').length ? '-dirty' : '');
    //lerna.json keeps the last released version until the release, so workspace runs are named by commit
    const label = target || commit!;
    const result: ResultFile = {
        label,
        overrides: target ? JSON.parse(readFileSync(join(cwd, 'package.json'), 'utf8')).overrides : undefined,
        version,
        commit,
        date: new Date().toISOString(),
        machine: { hostname: hostname(), cpu: cpus()[0]?.model.trim() || '', cores: cpus().length, platform: `${process.platform} ${process.arch}`, node: process.version },
        libraries: libraryVersions(),
        files: {},
    };

    const tmpResult = join(tmpdir(), `deepkit-bench-result-${process.pid}.json`);
    for (const file of files) {
        console.log(`\n▶ ${file} (${label})`);
        const status = spawnSync(process.execPath, ['--expose-gc', '--import', '@deepkit/run', join(cwd, 'benchmarks', 'run-file.ts'), join(cwd, file), tmpResult], {
            cwd: configDir(join(cwd, file)),
            stdio: 'inherit',
        }).status;
        if (status !== 0 || !existsSync(tmpResult)) {
            console.error(`✗ ${file} failed (exit code ${status})`);
            continue;
        }
        const suites = JSON.parse(readFileSync(tmpResult, 'utf8'));
        rmSync(tmpResult);
        result.files[file] = {};
        for (const [suite, benchmarks] of Object.entries<any>(suites)) {
            result.files[file][suite] = {};
            for (const [name, v] of Object.entries<any>(benchmarks)) {
                result.files[file][suite][name] = { hz: Math.round(v.hz * 100) / 100, rme: Math.round(v.rme * 100) / 100, mean: v.mean, iterations: v.iterations };
            }
        }
    }

    out ||= join(resultsDir, result.machine.hostname.replace(/\.local$/, ''), label + '.json');
    //a filtered run updates its files in an existing result of the same label
    if (filters.length && existsSync(out)) {
        const existing: ResultFile = JSON.parse(readFileSync(out, 'utf8'));
        result.files = { ...existing.files, ...result.files };
        result.libraries = { ...existing.libraries, ...result.libraries };
        Object.assign(result, { label: existing.label, commit: existing.commit, date: existing.date });
    }
    mkdirSync(dirname(out), { recursive: true });
    writeFileSync(out, JSON.stringify(result, null, 2) + '\n');
    console.log(`\nResults written to ${relative(process.cwd(), out)}`);
}

/**
 * Prints a markdown table of all benchmarks in both files, with the change from a to b.
 */
function compare(fileA: string, fileB: string) {
    const a: ResultFile = JSON.parse(readFileSync(fileA, 'utf8'));
    const b: ResultFile = JSON.parse(readFileSync(fileB, 'utf8'));
    console.log(`| Benchmark | ${a.label} | ${b.label} | Change |`);
    console.log('|---|---:|---:|---:|');
    for (const [file, suites] of Object.entries(b.files)) {
        for (const [suite, benchmarks] of Object.entries(suites)) {
            for (const [name, entry] of Object.entries(benchmarks)) {
                const before = a.files[file]?.[suite]?.[name];
                const change = before ? ((entry.hz / before.hz - 1) * 100) : undefined;
                // differences within the measurement error are noise
                const noise = before && change !== undefined && Math.abs(change) <= Math.max(before.rme, entry.rme) * 2;
                const changeText = change === undefined ? 'new' : `${change > 0 ? '+' : ''}${change.toFixed(1)}%${noise ? ' (noise)' : ''}`;
                console.log(`| ${suite}: ${name} | ${before ? formatHz(before.hz) : '–'} | ${formatHz(entry.hz)} | ${changeText} |`);
            }
        }
    }
}

const args = process.argv.slice(2);
if (args[0] === '--compare') compare(args[1], args[2]);
else run(args);
