import { type BunPlugin } from 'bun';

import { type Options, deepkitType as createTransform } from '@deepkit/type-compiler/plugin';

export type { Options };

declare var Bun: any;

export function deepkitType(options: Options = {}): BunPlugin {
    // same transform as the vite plugin: include/exclude, tsConfig and compilerOptions are handled there
    const transform = createTransform(options);

    return {
        name: 'Deepkit',
        setup(build: any) {
            build.onLoad({ filter: /\.tsx?$/ }, async (args: any) => {
                const code = await Bun.file(args.path).text();
                const transformed = transform(code, args.path);
                // excluded files are loaded unchanged
                return { contents: transformed ? transformed.code : code };
            });
        },
    };
}
