#!/usr/bin/env node
// `npm run test [jest args]`: runs jest. A complete, green run writes .test-certificate.json with the
// fingerprint of the tested sources. `npm run publish` requires it for the build (build-stamp.js).
//
// Only master has to be tested, branches can have as many untested commits as they like:
// - `node scripts/test.js check` (pre-commit, pre-merge-commit) declines a commit or merge commit on master
//   whose staged sources were not tested like this.
// - `node scripts/test.js check-push` (pre-push) declines a push to master whose sources were not tested.
//   This also covers fast-forward merges into master, which run no hook that can decline them.
//
// A run is complete without filters: no test paths, no -t and the like. Before a complete run, the packages are
// built with `tsc --build` (incremental), since the tests run against dist.
const { spawnSync } = require('child_process');
const { existsSync, readFileSync, rmSync, writeFileSync } = require('fs');
const { isAbsolute, join } = require('path');
const { tmpdir } = require('os');
const { changedPaths, distHash, fingerprintOfTree, git, headFingerprint, root, stagedFingerprint, workingTreeFingerprint } = require('./fingerprint.js');

const certificateFile = join(root, '.test-certificate.json');
const jest = [process.execPath, '--expose-gc', '--max_old_space_size=3048', join(root, 'node_modules/jest/bin/jest.js')];
// flags that change how tests run, but not which
const neutralFlags = /^(--runInBand|-i|--forceExit|--no-cache|--verbose|--silent|--ci|--detectOpenHandles|--logHeapUsage|--colors|--no-colors|(--maxWorkers|-w|--workerIdleMemoryLimit)(=.*)?)$/;

const protectedBranch = 'master';

function readCertificate() {
    return existsSync(certificateFile) ? JSON.parse(readFileSync(certificateFile, 'utf8')) : undefined;
}

/** Prints why and returns true when the sources were not tested by the last complete run. */
function decline(what, sources) {
    const certificate = readCertificate();
    if (!certificate) {
        console.error(`${what} declined: no test certificate. Run \`npm run test\` (the complete suite) first.`);
        return true;
    }
    const changed = changedPaths(certificate.sources, sources);
    if (!changed.length) return false;
    console.error(`${what} declined: ${protectedBranch} gets sources that were not tested. The last complete test run (${certificate.date}) does not include changes in: ${changed.join(', ')}.`);
    console.error('Run `npm run test` on exactly this state (unstaged changes count too, since the tests run on the working tree).');
    return true;
}

/** pre-commit and pre-merge-commit: only commits on master need tested sources. */
function check() {
    let branch = '';
    try {
        branch = git(['symbolic-ref', '--short', '-q', 'HEAD']);
    } catch {}
    if (branch !== protectedBranch) return;
    // a commit that doesn't change sources (e.g. docs, website) keeps the state of HEAD, which was tested
    if (!changedPaths(headFingerprint(), stagedFingerprint()).length) return;
    if (decline('Commit', stagedFingerprint())) process.exit(1);
}

/** pre-push: reads `<local ref> <local sha> <remote ref> <remote sha>` lines from stdin. */
function checkPush() {
    const lines = readFileSync(0, 'utf8').split('\n').filter(Boolean);
    for (const line of lines) {
        const [, localSha, remoteRef, remoteSha] = line.split(' ');
        if (remoteRef !== `refs/heads/${protectedBranch}` || /^0+$/.test(localSha)) continue;
        const sources = fingerprintOfTree(localSha);
        // a push that doesn't change sources (e.g. docs, website) keeps the tested state of the remote
        let remoteKnown = !/^0+$/.test(remoteSha);
        if (remoteKnown) {
            try {
                git(['cat-file', '-e', remoteSha]);
            } catch {
                remoteKnown = false;
            }
        }
        if (remoteKnown && !changedPaths(fingerprintOfTree(remoteSha), sources).length) continue;
        if (decline('Push', sources)) process.exit(1);
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

const command = process.argv[2];
process.exit(command === 'check' ? (check(), 0) : command === 'check-push' ? (checkPush(), 0) : run(process.argv.slice(2)));
