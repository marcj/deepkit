#!/usr/bin/env bash
# Installs the packed @deepkit packages into a fresh CommonJS and a fresh ESM project, compiles app.tsx
# with plain tsc (type-compiler installed via its install hook, skipLibCheck off) and runs it.
# Run `npm run build` first. Usage: scripts/consumer-smoke/run.sh [cjs|esm ...]
set -eu
ROOT=$(cd "$(dirname "$0")/../.." && pwd)
WORK=$(mktemp -d "${TMPDIR:-/tmp}/deepkit-consumer.XXXXXX")
FORMATS=${*:-cjs esm}
echo "working in $WORK"

mkdir -p "$WORK/tgz"
for dir in "$ROOT"/packages/*/; do
    [ -f "$dir/package.json" ] || continue
    node -e 'process.exit(require(process.argv[1]).private ? 1 : 0)' "$dir/package.json" || continue
    (cd "$dir" && npm pack --pack-destination "$WORK/tgz" > /dev/null 2>&1)
done

failed=0
for format in $FORMATS; do
    project="$WORK/$format"
    mkdir -p "$project/src"
    cp "$ROOT/scripts/consumer-smoke/app.tsx" "$project/src/app.tsx"
    (cd "$project" && node - "$format" <<'NODE'
const fs = require('fs');
const { execSync } = require('child_process');
const format = process.argv[2];
const tgz = {};
for (const f of fs.readdirSync('../tgz')) if (f.endsWith('.tgz')) tgz['@deepkit/' + f.replace(/^deepkit-/, '').replace(/-[0-9][^-]*\.tgz$/, '')] = 'file:../tgz/' + f;
// npm does not install peers that overrides redirect to tarballs, so all needed @deepkit packages are listed
const meta = name => JSON.parse(execSync('tar -xOzf ' + tgz[name].slice(5) + ' package/package.json').toString());
const needed = new Set();
const visit = name => {
    if (needed.has(name) || !tgz[name]) return;
    needed.add(name);
    const m = meta(name);
    const optional = m.peerDependenciesMeta || {};
    for (const dep of Object.keys({ ...m.dependencies, ...m.peerDependencies })) if (dep.startsWith('@deepkit/') && !optional[dep]?.optional) visit(dep);
};
['type', 'framework', 'http', 'rpc', 'orm', 'sqlite', 'mongo', 'template', 'app'].forEach(d => visit('@deepkit/' + d));
needed.delete('@deepkit/type-compiler');
fs.writeFileSync('package.json', JSON.stringify({
    name: 'deepkit-consumer-' + format, version: '1.0.0', private: true,
    type: format === 'esm' ? 'module' : 'commonjs',
    dependencies: Object.fromEntries([...needed].sort().map(v => [v, tgz[v]])),
    devDependencies: { '@deepkit/type-compiler': tgz['@deepkit/type-compiler'], typescript: '~6.0.3', '@types/node': '^24' },
    overrides: tgz,
}, null, 2));
fs.writeFileSync('tsconfig.json', JSON.stringify({
    compilerOptions: {
        target: 'es2022', module: 'nodenext', moduleResolution: 'nodenext', strict: true,
        experimentalDecorators: true, jsx: 'react-jsx', jsxImportSource: '@deepkit/template',
        outDir: 'dist', rootDir: 'src', types: ['node'], skipLibCheck: false,
    },
    reflection: true,
    include: ['src'],
}, null, 2));
NODE
    )
    echo "== $format"
    # like a user project: install peers (npm run passes the repo's legacy-peer-deps=true via the environment)
    if ! (cd "$project" && npm install --no-audit --no-fund --legacy-peer-deps=false > install.log 2>&1); then
        tail -20 "$project/install.log"; failed=1; continue
    fi
    if ! (cd "$project" && npx tsc); then failed=1; continue; fi
    (cd "$project" && node dist/app.js) || failed=1
done

[ $failed = 0 ] && rm -rf "$WORK" || echo "kept $WORK for inspection"
exit $failed
