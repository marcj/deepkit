import * as fs from 'fs';
import { writeFileSync } from 'fs';
import { join } from 'path';
import * as ts from 'typescript';
import { SyntaxKind } from 'typescript';
import glob from 'tiny-glob';
import { getCurrentDirName } from '@deepkit/core';

const dirname = getCurrentDirName();

function getFileGroup(sourceFile: ts.SourceFile): string | undefined {
    for (const stmt of sourceFile.statements) {
        const jsDocs = ts.getJSDocTags(stmt);
        const groupTag = jsDocs.find(tag => tag.tagName.text === 'group');

        if (groupTag && groupTag.comment) {
            return typeof groupTag.comment === 'string'
                ? groupTag.comment.trim()
                : groupTag.comment.map(p => p.text).join('').trim();
        }

        break; // only check first declared statement
    }

    return undefined;
}

function getDocGroup(symbol: ts.Symbol): string | undefined {
    const decls = symbol.getDeclarations() ?? [];
    for (const decl of decls) {
        const tags = ts.getJSDocTags(decl);
        const groupTag = tags.find(t => t.tagName.text === 'group');
        if (groupTag && groupTag.comment) {
            return typeof groupTag.comment === 'string'
                ? groupTag.comment.trim()
                : groupTag.comment.map(p => p.text).join('');
        }
    }
    return undefined;
}

function extractNormalizedJsDoc(node: ts.Node): string | undefined {
    const fullText = node.getFullText();
    const match = fullText.match(/\/\*\*([\s\S]*?)\*\//);
    if (!match) return undefined;

    let code = match[1];
    const indentationSize = code.search(/\S/); // find first non-whitespace character
    if (indentationSize < 0) return code; // no indentation found

    // Remove common leading spaces
    const lines = code.split('\n').map(line => ' ' + line.slice(indentationSize - 1));
    return lines.join('\n');
}

function getPublicClassDeclaration(symbol: ts.Symbol): string | undefined {
    const decl = symbol.getDeclarations()?.[0];
    if (!decl || (!ts.isClassDeclaration(decl) && !ts.isInterfaceDeclaration(decl))) return undefined;

    const printer = ts.createPrinter({ removeComments: false });

    const publicMembers: (ts.ClassElement | ts.TypeElement)[] = [];

    for (const member of decl.members) {
        const modifiers = ts.canHaveModifiers(member) ? ts.getModifiers(member) ?? [] : [];
        const tags = ts.getJSDocTags(member);

        const isPrivateOrProtected = modifiers.some(m =>
            m.kind === ts.SyntaxKind.PrivateKeyword || m.kind === ts.SyntaxKind.ProtectedKeyword,
        );
        const hasInternal = tags.some(tag => tag.tagName.text === 'internal');
        if (isPrivateOrProtected || hasInternal) continue;

        const filteredModifiers = modifiers.filter(m => m.kind !== ts.SyntaxKind.PublicKeyword);
        let newMember: ts.ClassElement | ts.TypeElement | undefined;

        if (ts.isMethodDeclaration(member)) {
            newMember = ts.factory.createMethodDeclaration(
                filteredModifiers,
                member.asteriskToken,
                member.name,
                member.questionToken,
                member.typeParameters,
                member.parameters,
                member.type,
                undefined, // remove body
            );
        } else if (ts.isPropertyDeclaration(member)) {
            newMember = ts.factory.createPropertyDeclaration(
                filteredModifiers,
                member.name,
                member.questionToken,
                member.type,
                undefined, // remove initializer
            );
        } else if (ts.isConstructorDeclaration(member)) {
            newMember = ts.factory.createConstructorDeclaration(
                filteredModifiers,
                member.parameters,
                undefined, // remove body
            );
        } else if (ts.isGetAccessorDeclaration(member)) {
            newMember = ts.factory.createGetAccessorDeclaration(
                filteredModifiers,
                member.name,
                member.parameters,
                member.type,
                undefined, // remove body
            );
        } else if (ts.isCallSignatureDeclaration(member)) {
            newMember = ts.factory.createCallSignature(
                member.typeParameters,
                member.parameters,
                member.type,
            );
        } else if (ts.isConstructSignatureDeclaration(member)) {
            newMember = ts.factory.createConstructSignature(
                member.typeParameters,
                member.parameters,
                member.type,
            );
        } else if (ts.isIndexSignatureDeclaration(member)) {
            newMember = ts.factory.createIndexSignature(
                filteredModifiers,
                member.parameters,
                member.type,
            );
        } else if (ts.isMethodSignature(member)) {
            newMember = ts.factory.createMethodSignature(
                filteredModifiers,
                member.name,
                member.questionToken,
                member.typeParameters,
                member.parameters,
                member.type,
            );
        } else if (ts.isPropertySignature(member)) {
            newMember = ts.factory.updatePropertySignature(
                member,
                filteredModifiers,
                member.name,
                member.questionToken,
                member.type,
            );
        }

        if (newMember) {
            // Reattach JSDoc as synthetic comment
            const comment = extractNormalizedJsDoc(member);
            if (comment) {
                ts.addSyntheticLeadingComment(newMember, SyntaxKind.MultiLineCommentTrivia, '*' + comment, true);
            }

            publicMembers.push(newMember);
        }
    }

    const classDecl = ts.isInterfaceDeclaration(decl)
        ? ts.factory.createInterfaceDeclaration(
            decl.modifiers,
            decl.name,
            decl.typeParameters,
            decl.heritageClauses,
            publicMembers as ts.TypeElement[],
        )
        :
        ts.factory.createClassDeclaration(
            decl.modifiers,
            decl.name,
            decl.typeParameters,
            decl.heritageClauses,
            publicMembers as ts.ClassElement[],
        );

    const sf = ts.factory.createSourceFile(
        [classDecl],
        ts.factory.createToken(ts.SyntaxKind.EndOfFileToken),
        ts.NodeFlags.None,
    );

    return printer.printNode(ts.EmitHint.Unspecified, classDecl, sf);
}

function getCleanedDeclarationText(decl: ts.Declaration): string {
    let source = decl.getSourceFile().getFullText();
    const comments = ts.getLeadingCommentRanges(source, decl.getFullStart()) ?? [];
    const start = comments.length > 0 ? comments[0].end : decl.getFullStart();
    source = source.slice(start, decl.getEnd()).trim();
    if (source.startsWith('export ')) return source.slice(7);
    return source;
}

function getDeclarationTypeString(symbol: ts.Symbol, checker: ts.TypeChecker): string {
    const declarations = symbol.getDeclarations();
    if (!declarations || declarations.length === 0) return '';

    const decl = declarations[0];

    if (ts.isFunctionDeclaration(decl) || ts.isMethodSignature(decl)) {
        const functionDecls = declarations.filter(ts.isFunctionDeclaration);
        const overloads = functionDecls.filter(d => !d.body);

        if (overloads.length > 0) {
            return overloads
                .map(d => {
                    const sig = checker.getSignatureFromDeclaration(d);
                    return sig ? checker.signatureToString(sig, d, ts.TypeFormatFlags.WriteArrowStyleSignature) : '';
                })
                .filter(Boolean)
                .join('\n');
        }

        // fallback: no overloads, just a single function
        const sig = checker.getSignatureFromDeclaration(decl as ts.FunctionDeclaration);
        return sig ? checker.signatureToString(sig, decl) : '';
    }

    if (ts.isVariableDeclaration(decl)) {
        const type = checker.getTypeAtLocation(decl.name);
        return checker.typeToString(type);
    }

    if (ts.isClassDeclaration(decl)) {
        const printed = getPublicClassDeclaration(symbol);
        if (printed) return printed;
        const type = checker.getTypeAtLocation(decl.name!);
        return checker.typeToString(type);
    }

    if (ts.isInterfaceDeclaration(decl) || ts.isTypeAliasDeclaration(decl)) {
        // const printed = getPublicClassDeclaration(symbol);
        // if (printed) return printed;
        // const type = checker.getTypeAtLocation(decl.name!);
        // return checker.typeToString(type);
        return getCleanedDeclarationText(decl);
    }

    return '';
}

export interface ApiType {
    name: string;
    kind: 'function' | 'class' | 'type' | 'variable' | 'event' | 'error';
    type: string;
    group: string;
    description: string;
    typeArguments?: string[];
    source: {
        file: string;
        line: number;
    };
}

function isEventConst(node: ts.VariableDeclaration, checker: ts.TypeChecker): boolean {
    const varType = checker.getTypeAtLocation(node);
    const resolved = resolveTypeAlias(varType, checker);
    return typeExtendsFrom(resolved, 'EventToken', checker);
}

function isErrorClass(node: ts.ClassDeclaration, checker: ts.TypeChecker): boolean {
    if (!node.name) return false;

    const classType = checker.getTypeAtLocation(node);
    const resolved = resolveTypeAlias(classType, checker);
    return typeExtendsFrom(resolved, 'Error', checker);
}

function resolveTypeAlias(type: ts.Type, checker: ts.TypeChecker): ts.Type {
    if (type.aliasSymbol) {
        return checker.getDeclaredTypeOfSymbol(type.aliasSymbol);
    }

    const symbol = type.getSymbol();
    if (!symbol) return type;

    if (symbol.flags & ts.SymbolFlags.Alias) {
        const real = checker.getAliasedSymbol(symbol);
        return checker.getDeclaredTypeOfSymbol(real);
    }

    return type;
}

function typeExtendsFrom(type: ts.Type, baseName: string, checker: ts.TypeChecker): boolean {
    // first get declaration, then check if ClassDeclaration or InterfaceDeclaration, then go through the heritage clauses
    const symbol = type.getSymbol();
    if (!symbol) return false;
    if (symbol.name === baseName) return true;

    const declarations = symbol.getDeclarations();
    if (!declarations || declarations.length === 0) return false;
    for (const decl of declarations) {
        if (ts.isClassDeclaration(decl) || ts.isInterfaceDeclaration(decl)) {
            const heritageClauses = decl.heritageClauses;
            if (heritageClauses) {
                for (const clause of heritageClauses) {
                    for (const typeNode of clause.types) {
                        if (ts.isIdentifier(typeNode.expression) && typeNode.expression.text === baseName) {
                            return true;
                        }
                        // go deeper into the type
                        const classType = checker.getTypeAtLocation(typeNode);
                        if (typeExtendsFrom(classType, baseName, checker)) return true;
                    }
                }
            }
        }
    }
    return false;
}

function isInternal(symbol: ts.Symbol): boolean {
    const declarations = symbol.getDeclarations() || [];
    for (const decl of declarations) {
        const tags = ts.getJSDocTags(decl);
        for (const tag of tags) {
            if (tag.tagName.getText() === 'internal') return true;
        }
    }
    return false;
}

function getJSDocComment(symbol: ts.Symbol): string {
    const decls = symbol.getDeclarations() ?? [];
    for (const decl of decls) {
        const jsDocs = ts.getJSDocCommentsAndTags(decl);
        for (const tag of jsDocs) {
            if (ts.isJSDoc(tag) && tag.comment) {
                return typeof tag.comment === 'string'
                    ? tag.comment
                    : tag.comment.map(part => part.text).join('');
            }
        }
    }
    return '';
}

function getKind(node: ts.Node, checker: ts.TypeChecker): ApiType['kind'] | undefined {
    if (ts.isFunctionDeclaration(node)) return 'function';
    if (ts.isClassDeclaration(node)) {
        if (isErrorClass(node, checker)) return 'error';
        return 'class';
    }
    if (ts.isInterfaceDeclaration(node) || ts.isTypeAliasDeclaration(node)) return 'type';
    if (ts.isVariableDeclaration(node)) {
        const type = checker.getTypeAtLocation(node.name);
        if (type.getCallSignatures().length > 0) return 'function'; // const foo = () => ...

        if (isEventConst(node, checker)) return 'event';
        return 'variable';
    }
    return undefined;
}

/**
 * Receives real .d.ts path, we want the git path to the source file.
 * /root/path/packages/core/dist/cjs/index.d.ts -> /root/path/packages/core/src/index.ts
 */
function fixDtsFileName(path: string): string {
    // ng-packagr libraries: dist/types/<package>.d.ts is built from src/index.ts
    path = path.replace(/dist\/types\/[^/]+\.d\.ts$/, 'src/index.ts');
    // replace dist/cjs with src
    path = path.replace(/dist\/cjs\//, '');
    path = path.replace(/dist\//, 'src/');
    // .d.ts to .ts
    if (path.endsWith('.d.ts')) {
        path = path.slice(0, -5) + '.ts';
    }
    return path;
}

/**
 * /root/path/packages/core/src/index.ts -> packages/core/src/index.ts
 */
function fixFileName(basePath: string, fileName: string): string {
    if (!fileName.startsWith(basePath)) return fileName;
    return fileName.substring(basePath.length);
}

function visitDeclaration(
    basePath: string,
    api: ApiType[],
    symbol: ts.Symbol,
    node: ts.Declaration,
    checker: ts.TypeChecker,
    rootExports: readonly ts.Symbol[],
    allDeclarations: ts.Declaration[] = [node],
) {
    if (isInternal(symbol)) return;

    const name = symbol.getName();
    const kind = getKind(node, checker);
    if (!kind) return;

    if (name.startsWith('__Ω')) return;
    const comment = getJSDocComment(symbol);
    const type = getDeclarationTypeString(symbol, checker);
    const group = getFileGroup(node.getSourceFile()) || getDocGroup(symbol) || '';

    const apiType: ApiType = {
        name,
        kind,
        type,
        group,
        description: comment,
        source: {
            file: fixFileName(basePath, node.getSourceFile().fileName),
            line: node.getStart() === -1 ? 0 : node.getSourceFile().getLineAndCharacterOfPosition(node.getStart()).line + 1,
        },
    };

    if (ts.isTypeAliasDeclaration(node) || ts.isInterfaceDeclaration(node)) {
        apiType.typeArguments = node.typeParameters?.map(tp => tp.name.getText());
    }

    api.push(apiType);
}

export function analyzePackages(
    basePath: string,
    mapping: Record<string, string>,
) {
    const entryFiles = Object.values(mapping);
    const paths: Record<string, string[]> = {};
    for (const [pkgName, entryFile] of Object.entries(mapping)) {
        paths[pkgName] = [entryFile];
    }
    const program = ts.createProgram(entryFiles, {
        target: ts.ScriptTarget.ESNext,
        module: ts.ModuleKind.ESNext,
        declaration: true,
        emitDeclarationOnly: true,
        skipLibCheck: true,
        paths,
    });

    const checker = program.getTypeChecker();
    const packages: Record<string, ApiType[]> = {};

    for (const [pkgName, entryFile] of Object.entries(mapping)) {
        const sourceFile = program.getSourceFile(entryFile);
        if (!sourceFile) continue;

        const moduleSymbol = checker.getSymbolAtLocation(sourceFile);
        if (!moduleSymbol) continue;

        const exports = checker.getExportsOfModule(moduleSymbol);

        const api: ApiType[] = [];
        for (const symbol of exports) {
            const decls = symbol.getDeclarations() || [];
            const real = symbol.flags & ts.SymbolFlags.Alias
                ? checker.getAliasedSymbol(symbol)
                : symbol;

            if (real.flags & ts.SymbolFlags.Function) {
                // collect all function declarations (overloads and impl)
                const overloadDecls = decls.filter(ts.isFunctionDeclaration);
                if (overloadDecls.length) {
                    visitDeclaration(basePath, api, real, overloadDecls[0], checker, exports, overloadDecls);
                    continue;
                }
            }

            // default: visit each declaration individually
            for (const decl of decls) {
                visitDeclaration(basePath, api, real, decl, checker, exports);
            }
        }
        packages[pkgName] = api;
    }

    writeFileSync(join(dirname, 'api-docs.json'), JSON.stringify(packages, null, 2));
}


async function main() {
    const basePath = join(dirname, '../');
    const packageDirs = await glob(basePath + '/packages/*');
    // const packageDirs: string[] = [
    //     join(basePath, 'packages/desktop-ui'),
    // ];

    type PackageExports = Record<string, string[]>;

    const pkgEntryMap: PackageExports = {};
    // e.g. `@deepkit/app` => `../packages/app/dist/cjs/index.d.ts`
    const typeScriptMapping: Record<string, string> = {};

    for (const dir of packageDirs) {
        const pkgJsonPath = join(dir, 'package.json');
        const pkgJson = JSON.parse(fs.readFileSync(pkgJsonPath, 'utf8'));
        const exportsField = pkgJson.exports as Record<string, { types: string }> | undefined;
        if (!exportsField) continue;
        const pkgName = pkgJson.name;

        const resolvedExports: string[] = [];

        for (const [key, value] of Object.entries(exportsField)) {
            resolvedExports.push(join(pkgName, key));
            if (value.types) {
                const dtsPath = join(dir, value.types);
                typeScriptMapping[join(pkgName, key)] = fixDtsFileName(dtsPath);
            }
        }
        pkgEntryMap[pkgName] = resolvedExports;
    }

    console.log('typeScriptMapping', typeScriptMapping);
    analyzePackages(basePath, typeScriptMapping);
}

main();
