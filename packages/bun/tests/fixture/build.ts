// Executed with `bun build.ts <outdir>`: exercises the plugin with Bun.build().
import { deepkitType } from '../../src/plugin';

declare const Bun: any;

const result = await Bun.build({
    entrypoints: [import.meta.dir + '/model.ts'],
    outdir: process.argv[2],
    format: 'esm',
    plugins: [deepkitType()],
});
if (!result.success) {
    console.error(result.logs);
    process.exit(1);
}
