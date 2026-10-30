#!/usr/bin/env node
// Makes sure a release is published from the build that was tested.
//
// `node scripts/build-stamp.js write` (end of npm run build) stores the fingerprint of the sources and of
// packages/*/dist in .build-stamp.json.
// `node scripts/build-stamp.js check` (start of npm run publish) fails if the sources or dist changed since
// then (e.g. dist was overwritten by building another branch), or if `npm run test` did not pass completely
// on this build afterwards (see test.js).
const { existsSync, readFileSync, writeFileSync } = require('fs');
const { join } = require('path');
const { changedPaths, distHash, root, workingTreeFingerprint } = require('./fingerprint.js');

const stampFile = join(root, '.build-stamp.json');
const certificateFile = join(root, '.test-certificate.json');

const command = process.argv[2];
if (command === 'write') {
    const dist = distHash();
    const stamp = { date: new Date().toISOString(), sources: workingTreeFingerprint(), dist: dist.hash, distFiles: dist.files };
    writeFileSync(stampFile, JSON.stringify(stamp, null, 2) + '\n');
    console.log(`build stamp written (${dist.files} dist files)`);
} else if (command === 'check') {
    const fail = (message) => {
        console.error(message);
        console.error('Run `npm run build` and `npm run test` again before publishing.');
        process.exit(1);
    };
    if (!existsSync(stampFile)) fail('No build stamp found.');
    const stamp = JSON.parse(readFileSync(stampFile, 'utf8'));
    const changed = changedPaths(stamp.sources, workingTreeFingerprint());
    if (changed.length) fail(`The build from ${stamp.date} is outdated, changed since then: ${changed.join(', ')}.`);
    if (distHash().hash !== stamp.dist) fail(`dist changed since the build from ${stamp.date} (another build or manual changes).`);

    if (!existsSync(certificateFile)) fail('No test certificate found: the full test suite did not pass on this build.');
    const certificate = JSON.parse(readFileSync(certificateFile, 'utf8'));
    if (certificate.sources !== stamp.sources || certificate.dist !== stamp.dist || certificate.date < stamp.date) {
        fail(`The test certificate from ${certificate.date} does not belong to the build from ${stamp.date}.`);
    }
    console.log(`build from ${stamp.date} is fresh and passed all tests (${certificate.tests} tests).`);
} else {
    console.error('usage: build-stamp.js write|check');
    process.exit(1);
}
