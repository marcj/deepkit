import { createFilter } from '@rollup/pluginutils';
import * as ts from 'typescript';
import { declarationTransformer, transformer } from '@deepkit/type-compiler';
import type { Plugin } from 'vite' with { 'resolution-mode': 'import' };

export interface Options {
    include?: string;
    exclude?: string;
    tsConfig?: string;
    transformers?: ts.CustomTransformers;
    compilerOptions?: ts.CompilerOptions;
}

export function deepkitType(options: Options = {}) {
    const filter = createFilter(options.include ?? ['**/*.tsx', '**/*.ts'], options.exclude ?? 'node_modules/**');
    const transformers = options.transformers || {
        before: [transformer],
        after: [declarationTransformer],
    };
    return {
        name: 'deepkit-type',
        enforce: 'pre',
        transform(code: string, fileName: string) {
            if (!filter(fileName)) return null;
            const transformed = ts.transpileModule(code, {
                'compilerOptions': Object.assign({
                    'target': ts.ScriptTarget.ESNext,
                    'module': ts.ModuleKind.ESNext,
                    configFilePath: options.tsConfig || process.cwd() + '/tsconfig.json',
                }, options.compilerOptions || {}),
                fileName,
                //@ts-ignore
                transformers,
            });

            return {
                code: transformed.outputText,
                map: transformed.sourceMapText,
            };
        },
    } as Plugin;
}
