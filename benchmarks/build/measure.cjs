// Compiles a folder like `tsc` does (type check and emit, in memory) and prints the emitted size and the time as JSON,
// see buildBenchmarks in ../runner.ts. Plain CommonJS and its own process: nothing of an earlier run is warm.
// Usage: node measure.cjs <dir> <true|never>
const { readdirSync, readFileSync, writeFileSync } = require('fs');
const { join } = require('path');
const { gzipSync } = require('zlib');

const [dir, reflection] = process.argv.slice(2);
const ts = require(require.resolve('typescript', { paths: [dir] }));

const roots = readdirSync(dir, { recursive: true })
    .filter(v => /\.tsx?$/.test(v) && !v.endsWith('.d.ts') && !/(^|\/)(node_modules|dist|tests)\//.test(v))
    .sort()
    .map(v => join(dir, v));

// the reflection setting comes from the config of the compiler options, as in a project
const configFilePath = join(dir, `tsconfig.${reflection}.json`);
writeFileSync(configFilePath, JSON.stringify({ reflection: reflection === 'true' ? true : 'never' }));
const options = {
    module: ts.ModuleKind.ESNext,
    moduleResolution: ts.ModuleResolutionKind.Bundler,
    target: ts.ScriptTarget.ES2022,
    experimentalDecorators: true,
    esModuleInterop: true,
    skipLibCheck: true,
    types: ['node'],
    newLine: ts.NewLineKind.LineFeed,
    configFilePath,
};

const output = {};
const start = performance.now();
const program = ts.createProgram(roots, options);
ts.getPreEmitDiagnostics(program);
program.emit(undefined, (name, text) => {
    if (name.endsWith('.js')) output[name] = text;
});
const time = performance.now() - start;

const code = Object.keys(output).sort().map(v => output[v]).join('\n');
console.log(JSON.stringify({
    files: roots.length,
    lines: roots.reduce((sum, v) => sum + readFileSync(v, 'utf8').split('\n').length, 0),
    bytes: Buffer.byteLength(code),
    gzip: gzipSync(code).length,
    time,
}));
