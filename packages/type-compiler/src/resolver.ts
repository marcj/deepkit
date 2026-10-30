import micromatch from 'micromatch';
import {
    CompilerHost,
    CompilerOptions,
    ExportDeclaration,
    Expression,
    ImportDeclaration, JSDocImportTag,
    ResolvedModule,
    SourceFile,
    StringLiteral,
} from 'typescript';
import ts from 'typescript';
import { dirname, join } from 'node:path';
import { existsSync, readFileSync } from 'node:fs';

const { createSourceFile, resolveModuleName, isStringLiteral, JSDocParsingMode, ScriptTarget } = ts;

/**
 * Nearest package.json content per directory (null if there is none).
 */
const packageJsonCache = new Map<string, any>();

export function readNearestPackageJson(filePath: string): any {
    const visited: string[] = [];
    let dir = dirname(filePath);
    let content: any = null;
    while (true) {
        const cached = packageJsonCache.get(dir);
        if (cached !== undefined) {
            content = cached;
            break;
        }
        visited.push(dir);
        const packageJsonPath = join(dir, 'package.json');
        if (existsSync(packageJsonPath)) {
            content = JSON.parse(readFileSync(packageJsonPath, 'utf8'));
            break;
        }
        const parent = dirname(dir);
        if (parent === dir) break;
        dir = parent;
    }
    for (const v of visited) packageJsonCache.set(v, content);
    return content ?? undefined;
}

export function patternMatch(path: string, patterns: string[], base?: string): boolean {
    const include = patterns.filter(pattern => pattern[0] !== '!');

    const exclude = patterns.filter(pattern => pattern[0] === '!').map(pattern => pattern.substring(1));

    return micromatch.isMatch(path, include, {
        ignore: exclude,
    });
}

/**
 * A utility to resolve a module path and its declaration.
 *
 * It automatically reads a SourceFile, binds and caches it.
 */
export class Resolver {
    constructor(
        public compilerOptions: CompilerOptions,
        public host: CompilerHost,
        protected sourceFiles: { [fileName: string]: SourceFile },
    ) {}

    resolve(from: SourceFile, importOrExportNode: ExportDeclaration | ImportDeclaration | JSDocImportTag): SourceFile | undefined {
        const moduleSpecifier: Expression | undefined = importOrExportNode.moduleSpecifier;
        if (!moduleSpecifier) return;
        if (!isStringLiteral(moduleSpecifier)) return;

        return this.resolveSourceFile(from, moduleSpecifier);
    }

    protected resolveImpl(modulePath: StringLiteral, sourceFile: SourceFile): ResolvedModule | undefined {
        if (this.host.resolveModuleNameLiterals !== undefined) {
            const results = this.host.resolveModuleNameLiterals(
                [modulePath],
                sourceFile.fileName,
                /*reusedNames*/ undefined,
                this.compilerOptions,
                sourceFile,
                undefined,
            );
            if (results[0]) return results[0].resolvedModule;
            return;
        }
        if (this.host.resolveModuleNames !== undefined) {
            return this.host.resolveModuleNames(
                [modulePath.text],
                sourceFile.fileName,
                /*reusedNames*/ undefined,
                /*redirectedReference*/ undefined,
                this.compilerOptions,
            )[0];
        }
        const result = resolveModuleName(modulePath.text, sourceFile.fileName, this.compilerOptions, this.host);
        return result.resolvedModule;
    }

    /**
     * Tries to resolve the .ts/d.ts file path for a given module path.
     * Scans relative paths. Looks into package.json "types" and "exports" (with new 4.7 support)
     *
     * @param sourceFile the SourceFile of the file that contains the import. modulePath is relative to that.
     * @param modulePath the x in 'from x'.
     */
    resolveSourceFile(sourceFile: SourceFile, modulePath: StringLiteral): SourceFile | undefined {
        const result = this.resolveImpl(modulePath, sourceFile);
        if (!result) return;

        // only .ts, .tsx and .d.ts files are supported
        if (!result.resolvedFileName.endsWith('.ts')
            && !result.resolvedFileName.endsWith('.tsx')
            && !result.resolvedFileName.endsWith('.d.ts')) {
            return;
        }

        const fileName = result.resolvedFileName;
        if (this.sourceFiles[fileName]) return this.sourceFiles[fileName];

        const source = this.host.readFile(result.resolvedFileName);
        if (!source) return;
        const moduleSourceFile = (this.sourceFiles[fileName] = createSourceFile(
            fileName,
            source,
            {
                languageVersion: this.compilerOptions.target || ScriptTarget.ES2018,
                // JSDocParsingMode is not available in TS < 5.3
                jsDocParsingMode: JSDocParsingMode ? JSDocParsingMode.ParseNone : undefined,
            },
            true,
        ));

        this.sourceFiles[fileName] = moduleSourceFile;

        //@ts-ignore
        ts.bindSourceFile(moduleSourceFile, this.compilerOptions);

        return moduleSourceFile;
    }
}
