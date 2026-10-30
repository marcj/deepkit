import { expect, test } from '@jest/globals';
import { existsSync, readFileSync, readdirSync, statSync } from 'fs';
import { join, relative } from 'path';

const packagesDir = join(__dirname, '../..');

function sourceFiles(dir: string, out: string[] = []): string[] {
    if (!existsSync(dir)) return out;
    for (const name of readdirSync(dir)) {
        if (name === 'node_modules' || name === 'dist') continue;
        const path = join(dir, name);
        if (statSync(path).isDirectory()) sourceFiles(path, out);
        else if (/\.tsx?$/.test(name) && !/\.(spec|test|d)\.tsx?$/.test(name)) out.push(path);
    }
    return out;
}

test('every @deepkit import of a published package is a declared dependency', () => {
    // `npm install @deepkit/rpc` crashed with "Cannot find module '@deepkit/event'": the import was only
    // satisfied inside the monorepo. Type-only imports count too, otherwise the published .d.ts degrades to any.
    const missing: string[] = [];
    for (const dir of readdirSync(packagesDir)) {
        const pkgPath = join(packagesDir, dir, 'package.json');
        if (!existsSync(pkgPath)) continue;
        const pkg = JSON.parse(readFileSync(pkgPath, 'utf8'));
        // GUIs publish a prebuilt bundle, their imports are compiled in.
        if (pkg.private || dir.endsWith('-gui')) continue;
        const declared = new Set([...Object.keys(pkg.dependencies || {}), ...Object.keys(pkg.peerDependencies || {})]);
        const files = [...sourceFiles(join(packagesDir, dir, 'src')), join(packagesDir, dir, 'index.ts')].filter(existsSync);
        for (const file of files) {
            const code = readFileSync(file, 'utf8')
                .replace(/\/\*[\s\S]*?\*\//g, '')
                .replace(/^\s*\/\/.*$/gm, '');
            for (const m of code.matchAll(/(?:\bfrom\s+|\bimport\s*\(\s*|\brequire\(\s*)['"](@deepkit\/[\w-]+)['"]/g)) {
                if (m[1] === pkg.name || declared.has(m[1])) continue;
                missing.push(`${pkg.name}: ${m[1]} (${relative(packagesDir, file)})`);
            }
        }
    }
    expect([...new Set(missing.map(v => v.replace(/ \(.*/, '')))]).toEqual([]);
});

test('@deepkit peer dependencies require the current version', () => {
    // lerna does not bump peer ranges: @deepkit/framework kept accepting @deepkit/broker ^1.0.1, which lacked
    // the BrokerKeyValue export it imports (#574). `npm run version` (run by lerna on release) updates them.
    const versions: { [name: string]: string } = {};
    const pkgs: any[] = [];
    for (const dir of readdirSync(packagesDir)) {
        const pkgPath = join(packagesDir, dir, 'package.json');
        if (!existsSync(pkgPath)) continue;
        const pkg = JSON.parse(readFileSync(pkgPath, 'utf8'));
        versions[pkg.name] = pkg.version;
        pkgs.push(pkg);
    }
    const outdated: string[] = [];
    for (const pkg of pkgs) {
        for (const [name, range] of Object.entries(pkg.peerDependencies || {})) {
            if (versions[name] && range !== '^' + versions[name]) outdated.push(`${pkg.name}: ${name}@${range}`);
        }
    }
    expect(outdated).toEqual([]);
});

test('published packages exclude .tsbuildinfo files', () => {
    // tsc writes them into dist, they added 4.4 MB to every release
    const missing: string[] = [];
    for (const dir of readdirSync(packagesDir)) {
        const pkgPath = join(packagesDir, dir, 'package.json');
        if (!existsSync(pkgPath)) continue;
        const pkg = JSON.parse(readFileSync(pkgPath, 'utf8'));
        if (pkg.private) continue;
        const npmignore = join(packagesDir, dir, '.npmignore');
        const excluded = pkg.files
            ? pkg.files.includes('!**/*.tsbuildinfo')
            : existsSync(npmignore) && readFileSync(npmignore, 'utf8').split('\n').includes('*.tsbuildinfo');
        if (!excluded) missing.push(pkg.name);
    }
    expect(missing).toEqual([]);
});
