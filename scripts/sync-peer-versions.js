#!/usr/bin/env node
// Lerna bumps dependencies and devDependencies of our packages on release, but not peerDependencies.
// This sets every @deepkit/* peer range to ^<current version>, so a package never accepts an older
// @deepkit release that lacks exports it uses (#574). Runs as the root "version" script, which lerna
// calls after bumping the versions and before the release commit.
const { execFileSync } = require('child_process');
const { existsSync, readdirSync, readFileSync, writeFileSync } = require('fs');
const { join } = require('path');

const packagesDir = join(__dirname, '../packages');
const packages = {};
for (const dir of readdirSync(packagesDir)) {
    const path = join(packagesDir, dir, 'package.json');
    if (!existsSync(path)) continue;
    const raw = readFileSync(path, 'utf8');
    packages[JSON.parse(raw).name] = { path, raw };
}

const changed = [];
for (const { path, raw } of Object.values(packages)) {
    const pkg = JSON.parse(raw);
    let modified = false;
    for (const name of Object.keys(pkg.peerDependencies || {})) {
        const peer = packages[name];
        if (!peer) continue;
        const range = '^' + JSON.parse(peer.raw).version;
        if (pkg.peerDependencies[name] === range) continue;
        pkg.peerDependencies[name] = range;
        modified = true;
    }
    if (!modified) continue;
    const indent = raw.match(/\n(\s+)"/)[1];
    writeFileSync(path, JSON.stringify(pkg, null, indent) + (raw.endsWith('\n') ? '\n' : ''));
    changed.push(path);
}

console.log(`peer dependencies updated in ${changed.length} packages`);
if (changed.length && process.env.npm_lifecycle_event === 'version') {
    execFileSync('git', ['add', ...changed], { stdio: 'inherit' });
}
