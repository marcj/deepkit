// Fingerprints of the sources and of the build output, used by build-stamp.js and test.js to check that a
// build or a test run belongs to exactly the code that is published or committed.
const { execFileSync } = require('child_process');
const { createHash } = require('crypto');
const { copyFileSync, existsSync, readdirSync, readFileSync, rmSync, statSync } = require('fs');
const { join, relative } = require('path');
const { tmpdir } = require('os');

const root = join(__dirname, '..');

// everything that affects the build and the tests
const sourcePaths = [
    'packages',
    'package.json',
    'yarn.lock',
    'tsconfig.json',
    'tsconfig.esm.json',
    'tsconfig.base.json',
    'install-compiler.sh',
    'jest-resolver.js',
    'jest-serial-runner.js',
    'jest-setup-runtime.js',
    'docker-compose.yml',
];

function git(args, env) {
    return execFileSync('git', args, { cwd: root, env: { ...process.env, ...env }, encoding: 'utf8' }).trim();
}

function fingerprintOfTree(tree) {
    return sourcePaths
        .map(path => {
            let id = 'missing';
            try {
                id = git(['rev-parse', '--verify', '--quiet', `${tree}:${path}`]);
            } catch {}
            return path + ':' + id;
        })
        .join('\n');
}

/**
 * The sources in the working tree, including uncommitted and new (not ignored) files.
 * Uses a temporary index, so the real index and the stash are not touched.
 */
function workingTreeFingerprint() {
    const index = join(tmpdir(), `deepkit-fingerprint-${process.pid}.index`);
    const realIndex = git(['rev-parse', '--path-format=absolute', '--git-path', 'index']);
    if (existsSync(realIndex)) copyFileSync(realIndex, index);
    try {
        git(['add', '--all', '--', ...sourcePaths], { GIT_INDEX_FILE: index });
        return fingerprintOfTree(git(['write-tree'], { GIT_INDEX_FILE: index }));
    } finally {
        rmSync(index, { force: true });
    }
}

/**
 * The sources as staged, i.e. what the next commit contains.
 */
function stagedFingerprint() {
    return fingerprintOfTree(git(['write-tree']));
}

/**
 * The sources of the last commit.
 */
function headFingerprint() {
    return fingerprintOfTree('HEAD');
}

/**
 * Hash of all files in packages/*\/dist.
 */
function distHash() {
    const hash = createHash('sha256');
    const files = [];
    const walk = dir => {
        for (const name of readdirSync(dir)) {
            const path = join(dir, name);
            if (statSync(path).isDirectory()) walk(path);
            else files.push(path);
        }
    };
    const packagesDir = join(root, 'packages');
    for (const pkg of readdirSync(packagesDir)) {
        const dist = join(packagesDir, pkg, 'dist');
        if (existsSync(dist)) walk(dist);
    }
    files.sort();
    for (const file of files) {
        hash.update(relative(root, file) + '\0');
        hash.update(readFileSync(file));
    }
    return { hash: hash.digest('hex'), files: files.length };
}

/**
 * Compares two fingerprints and returns the source paths that differ.
 */
function changedPaths(a, b) {
    const left = new Map(a.split('\n').map(v => v.split(':')));
    return b
        .split('\n')
        .map(v => v.split(':'))
        .filter(([path, id]) => left.get(path) !== id)
        .map(([path]) => path);
}

module.exports = { root, workingTreeFingerprint, stagedFingerprint, headFingerprint, distHash, changedPaths };
