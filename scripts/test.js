#!/usr/bin/env node
// `npm run test [jest args]`: runs jest. A complete, green run writes .test-certificate.json with the
// fingerprint of the tested sources. The pre-commit hook (`node scripts/test.js check`) declines a commit if
// its staged sources were not tested like this, and `npm run publish` requires it for the build (build-stamp.js).
//
// A run is complete without filters: no test paths, no -t and the like. Before a complete run, the packages are
// built with `tsc --build` (incremental), since the tests run against dist.
const { spawnSync } = require('child_process');
const { existsSync, readFileSync, rmSync, writeFileSync } = require('fs');
const { isAbsolute, join } = require('path');
const { tmpdir } = require('os');
const { changedPaths, distHash, headFingerprint, root, stagedFingerprint, workingTreeFingerprint } = require('./fingerprint.js');

const certificateFile = join(root, '.test-certificate.json');
const jest = [process.execPath, '--expose-gc', '--max_old_space_size=3048', join(root, 'node_modules/jest/bin/jest.js')];
// flags that change how tests run, but not which
const neutralFlags = /^(--runInBand|-i|--forceExit|--no-cache|--verbose|--silent|--ci|--detectOpenHandles|--logHeapUsage|--colors|--no-colors|(--maxWorkers|-w|--workerIdleMemoryLimit)(=.*)?)$/;

function check() {
    // a commit that doesn't change sources (e.g. docs, website) keeps the state of HEAD, which was tested
    if (!changedPaths(headFingerprint(), stagedFingerprint()).length) return;
    if (!existsSync(certificateFile)) {
        console.error('Commit declined: no test certificate. Run `npm run test` (the complete suite) first.');
        process.exit(1);
    }
    const certificate = JSON.parse(readFileSync(certificateFile, 'utf8'));
    const changed = changedPaths(certificate.sources, stagedFingerprint());
    if (changed.length) {
        console.error(`Commit declined: the staged changes were not tested. The last complete test run (${certificate.date}) does not include changes in: ${changed.join(', ')}.`);
        console.error('Run `npm run test` again (unstaged changes count too, since the tests run on the working tree).');
        process.exit(1);
    }
}

function run(args) {
    const complete = args.every(v => neutralFlags.test(v));
    if (!complete) {
        console.log('Not a complete test run (filters given), no test certificate is written.');
        return spawnSync(jest[0], [...jest.slice(1), '--forceExit', '--no-cache', ...args], { cwd: root, stdio: 'inherit' }).status ?? 1;
    }

    const sources = workingTreeFingerprint();
    // CommonJS and ESM: most tests use dist/cjs, some start processes that load dist/esm
    const tsc = spawnSync(process.execPath, [join(root, 'node_modules/typescript/bin/tsc'), '--build', 'tsconfig.json', 'tsconfig.esm.json'], { cwd: root, stdio: 'inherit' });
    if (tsc.status !== 0) return tsc.status ?? 1;

    // only real file paths: jest can print warnings to stdout too (e.g. a haste naming collision in CI)
    const listed = spawnSync(jest[0], [...jest.slice(1), '--listTests'], { cwd: root, encoding: 'utf8' }).stdout.split('\n');
    const expectedSuites = new Set(listed.filter(v => isAbsolute(v) && existsSync(v)));
    const resultFile = join(tmpdir(), `deepkit-test-result-${process.pid}.json`);
    const status = spawnSync(jest[0], [...jest.slice(1), '--forceExit', '--no-cache', ...args, '--json', `--outputFile=${resultFile}`], { cwd: root, stdio: 'inherit' }).status ?? 1;
    const result = existsSync(resultFile) ? JSON.parse(readFileSync(resultFile, 'utf8')) : undefined;
    rmSync(resultFile, { force: true });

    const problems = [];
    if (status !== 0 || !result || !result.success) problems.push('tests failed');
    else {
        const ran = new Set(result.testResults.map(v => v.name));
        const missing = [...expectedSuites].filter(v => !ran.has(v));
        if (missing.length) problems.push(`${missing.length} of ${expectedSuites.size} test suites did not run: ${missing.join(', ')}`);
    }
    if (workingTreeFingerprint() !== sources) problems.push('sources changed during the test run');
    if (problems.length) {
        rmSync(certificateFile, { force: true });
        console.error(`No test certificate: ${problems.join(', ')}.`);
        return status || 1;
    }

    const certificate = {
        date: new Date().toISOString(),
        sources,
        dist: distHash().hash,
        suites: result.numTotalTestSuites,
        tests: result.numPassedTests,
        skipped: result.numPendingTests,
    };
    writeFileSync(certificateFile, JSON.stringify(certificate, null, 2) + '\n');
    console.log(`Test certificate written: ${certificate.suites} suites, ${certificate.tests} tests passed.`);
    return 0;
}

process.exit(process.argv[2] === 'check' ? (check(), 0) : run(process.argv.slice(2)));
