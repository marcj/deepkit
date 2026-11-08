/*
 * Deepkit Framework
 * Copyright (c) Deepkit UG, Marc J. Schmidt
 *
 * This program is free software: you can redistribute it and/or modify
 * it under the terms of the MIT License.
 *
 * You should have received a copy of the MIT License along with this program.
 */

import ts, {
    __String,
    ArrowFunction,
    BigIntLiteral,
    BinaryExpression,
    EntityName,
    Expression,
    Identifier,
    ImportDeclaration,
    isBigIntLiteral,
    JSDoc,
    JSDocImportTag,
    ModifierLike,
    Node,
    NodeArray,
    NodeFactory,
    NumericLiteral,
    PrivateIdentifier,
    PropertyAccessExpression,
    PropertyName,
    QualifiedName,
    StringLiteral,
    StringLiteralLike,
    SymbolTable,
} from 'typescript';
import { cloneNode as tsNodeClone, CloneNodeHook } from '@marcj/ts-clone-node';
import { SourceFile } from './ts-types.js';

const {
    isArrowFunction,
    isComputedPropertyName,
    isIdentifier,
    isNamedImports,
    isNamespaceImport,
    isNumericLiteral,
    isPrivateIdentifier,
    isStringLiteral,
    isStringLiteralLike,
    setOriginalNode,
    getLeadingCommentRanges,
    isNoSubstitutionTemplateLiteral,
    NodeFlags,
    SyntaxKind,
} = ts;

export type PackExpression = Expression | string | number | boolean | bigint;

function is__String(value: any): value is __String {
    return typeof value === 'string';
}

export function getIdentifierName(node: Identifier | PrivateIdentifier | StringLiteral | __String): string {
    if (is__String(node)) return node as string;
    if (isIdentifier(node) || isPrivateIdentifier(node)) {
        return ts.unescapeLeadingUnderscores(node.escapedText);
    }
    if (isStringLiteral(node)) return node.text;
    return '';
}

export function getEscapedText(node: Identifier | PrivateIdentifier | StringLiteral | __String): string {
    if (is__String(node)) return node as string;
    if (isIdentifier(node) || isPrivateIdentifier(node)) return node.escapedText as string;
    return getIdentifierName(node);
}

export function findSourceFile(node: Node): SourceFile | undefined {
    if (node.kind === SyntaxKind.SourceFile) return node as SourceFile;
    let current = node.parent;
    while (current && current.kind !== SyntaxKind.SourceFile) {
        current = current.parent;
    }
    return current as SourceFile;
}

export function joinQualifiedName(name: EntityName): string {
    if (isIdentifier(name)) return getIdentifierName(name);
    return joinQualifiedName(name.left) + '_' + getIdentifierName(name.right);
}

export function getCommentOfNode(sourceFile: SourceFile, node: Node): string | undefined {
    const comment = getLeadingCommentRanges(sourceFile.text, node.pos);
    if (!comment) return;

    return comment.map(v => sourceFile.text.substring(v.pos, v.end)).join('\n');
}

export function parseJSDocAttributeFromText(comment: string, attribute: string): string | undefined {
    // no regex
    const index = comment.indexOf('@' + attribute + ' ');
    if (index === -1) {
        let start = 0;
        while (true) {
            const withoutContent = comment.indexOf('@' + attribute, start);
            if (withoutContent === -1) return undefined;
            //make sure next character is space or end of comment
            const nextCharacter = comment[withoutContent + attribute.length + 1];
            if (!nextCharacter || nextCharacter === ' ' || nextCharacter === '\n' || nextCharacter === '\r' || nextCharacter === '\t') {
                return '';
            }
            start = withoutContent + attribute.length + 1;
        }
        return undefined;
    }

    const start = index + attribute.length + 2;
    // end is either next attribute @ or end of comment.
    const nextAttribute = comment.indexOf('@', start);
    const endOfComment = comment.indexOf('*/', start);
    const end = nextAttribute === -1 ? endOfComment : Math.min(nextAttribute, endOfComment);
    const content = comment.substring(start, end).trim();

    // make sure multiline comments are supported, and each line is trimmed and `\s\s\s\*` removed
    return content.split('\n').map(v => {
        const indexOfStar = v.indexOf('*');
        if (indexOfStar === -1) return v.trim();
        return v.substring(indexOfStar + 1).trim();
    }).join('\n');
}

export function extractJSDocAttribute(sourceFile: SourceFile, node: Node | undefined, attribute: string): string | undefined {
    // in TypeScript 5.3 they made JSDoc parsing optional and disabled by default.
    // we need to read the comments manually and then parse @{attribute} {value} manually.
    // we need reference to SourceFile, since Node.getSourceFile() although available in types,
    // is not available at runtime sometimes (works in tests, but fails with tsc).
    if (!node) return undefined;
    const comment = getCommentOfNode(sourceFile, node);
    if (!comment) return undefined;

    return parseJSDocAttributeFromText(comment, attribute);
}

export function getPropertyName(f: NodeFactory, node?: PropertyName): string | symbol | number | ArrowFunction {
    if (!node) return '';

    if (isIdentifier(node)) return getIdentifierName(node);
    if (isStringLiteral(node)) return node.text;
    if (isNumericLiteral(node)) return +node.text;
    if (isNoSubstitutionTemplateLiteral(node)) return node.text;
    if (isComputedPropertyName(node)) {
        return f.createArrowFunction(undefined, undefined, [], undefined, undefined, node.expression);
    }
    if (isPrivateIdentifier(node)) return getIdentifierName(node);

    return '';
}

export function getNameAsString(node?: PropertyName | QualifiedName): string {
    if (!node) return '';
    if (isIdentifier(node)) return getIdentifierName(node);
    if (isStringLiteral(node)) return node.text;
    if (isNumericLiteral(node)) return node.text;
    if (isBigIntLiteral(node)) return node.text;
    if (isNoSubstitutionTemplateLiteral(node)) return node.text;
    if (isComputedPropertyName(node)) {
        if (isStringLiteralLike(node) || isNumericLiteral(node)) return (node as StringLiteralLike | NumericLiteral).text;
        return '';
    }
    if (isPrivateIdentifier(node)) return getIdentifierName(node);

    return joinQualifiedName(node);
}

export function hasModifier(node: Node & { modifiers?: NodeArray<ModifierLike> }, modifier: ts.SyntaxKind): boolean {
    if (!node.modifiers) return false;
    return node.modifiers.some(v => v.kind === modifier);
}

const cloneHook = <T extends Node>(node: T, payload: { depth: number }): CloneNodeHook<T> | undefined => {
    if (isIdentifier(node)) {
        //ts-clone-node wants to read `node.text` which does not exist. we hook into it and provide the correct value.
        return {
            text: () => {
                return getIdentifierName(node);
            },
        } as any;
    }
    return;
};

export class NodeConverter {
    constructor(protected f: NodeFactory) {
    }

    toExpression<T extends PackExpression | PackExpression[]>(node?: T): Expression {
        if (node === undefined) return this.f.createIdentifier('undefined');

        if (Array.isArray(node)) {
            return this.f.createArrayLiteralExpression(this.f.createNodeArray(node.map(v => this.toExpression(v))) as NodeArray<Expression>);
        }

        if ('string' === typeof node) return this.f.createStringLiteral(node, true);
        if ('number' === typeof node) return this.f.createNumericLiteral(node);
        if ('bigint' === typeof node) return this.f.createBigIntLiteral(String(node));
        if ('boolean' === typeof node) return node ? this.f.createTrue() : this.f.createFalse();

        if (node.pos === -1 && node.end === -1 && node.parent === undefined) {
            if (isArrowFunction(node)) {
                if (node.body.pos === -1 && node.body.end === -1 && node.body.parent === undefined) return node;
                return this.f.createArrowFunction(node.modifiers, node.typeParameters, node.parameters, node.type, node.equalsGreaterThanToken, this.toExpression(node.body as Expression));
            }
            return node;
        }
        switch (node.kind) {
            case SyntaxKind.Identifier:
                return finish(node, this.f.createIdentifier(getIdentifierName(node as Identifier)));
            case SyntaxKind.StringLiteral:
                return finish(node, this.f.createStringLiteral((node as StringLiteral).text));
            case SyntaxKind.NumericLiteral:
                return finish(node, this.f.createNumericLiteral((node as NumericLiteral).text));
            case SyntaxKind.BigIntLiteral:
                return finish(node, this.f.createBigIntLiteral((node as BigIntLiteral).text));
            case SyntaxKind.TrueKeyword:
                return finish(node, this.f.createTrue());
            case SyntaxKind.FalseKeyword:
                return finish(node, this.f.createFalse());
        }

        //todo: ts-node-clone broke with ts 4.8,
        // => TypeError: Cannot read properties of undefined (reading 'emitNode')
        // which is probably due a broken node clone. We need to figure out which node it is
        // and see what the issue is. since ts-node-clone is not really maintained anymore,
        // we need to fork it
        try {
            return tsNodeClone(node, {
                preserveComments: false,
                factory: this.f,
                setOriginalNodes: true,
                preserveSymbols: true,
                setParents: true,
                hook: cloneHook,
            }) as Expression;
        } catch (error) {
            console.error('could not clone node', node);
            throw error;
        }

    }
}

function isExternalOrCommonJsModule(file: SourceFile): boolean {
    //both attributes are internal and not yet public
    return (file.externalModuleIndicator || file.commonJsModuleIndicator) !== undefined;
}

export function isNodeWithLocals(node: Node): node is (Node & { locals: SymbolTable | undefined }) {
    return 'locals' in node;
}

//logic copied from typescript
export function getGlobalsOfSourceFile(file: SourceFile): SymbolTable | void {
    if (file.redirectInfo) return;
    if (!isNodeWithLocals(file)) return;
    if (!isExternalOrCommonJsModule(file)) return file.locals;
    if (file.jsGlobalAugmentations) return file.jsGlobalAugmentations;
    if (file.symbol && file.symbol.globalExports) return file.symbol.globalExports;
}

/**
 * For imports that can removed (like a class import only used as type only, like `p: Model[]`) we have
 * to modify the import so TS does not remove it.
 */
export function ensureImportIsEmitted(importDeclaration: ImportDeclaration | JSDocImportTag, specifierName?: Identifier) {
    if (specifierName && importDeclaration.importClause && importDeclaration.importClause.namedBindings) {
        // const binding = importDeclaration.importClause.namedBindings;
        if (isNamedImports(importDeclaration.importClause.namedBindings)) {
            for (const element of importDeclaration.importClause.namedBindings.elements) {
                if (element.name.escapedText === specifierName.escapedText) {
                    (element.flags as any) |= NodeFlags.Synthesized;
                    return;
                }
            }
        }
    }

    if (importDeclaration.importClause && importDeclaration.importClause.namedBindings && isNamespaceImport(importDeclaration.importClause.namedBindings)) {
        (importDeclaration.importClause.namedBindings.flags as any) |= NodeFlags.Synthesized;
    }

    (importDeclaration.flags as any) |= NodeFlags.Synthesized;
}


/**
 * Serializes an entity name as an expression for decorator type metadata.
 *
 * @param node The entity name to serialize.
 */
export function serializeEntityNameAsExpression(f: NodeFactory, node: EntityName): SerializedEntityNameAsExpression {
    switch (node.kind) {
        case SyntaxKind.Identifier:
            return finish(node, f.createIdentifier(getIdentifierName(node)));
        case SyntaxKind.QualifiedName:
            return finish(node, serializeQualifiedNameAsExpression(f, node));
    }
    return node;
}

type SerializedEntityNameAsExpression = Identifier | BinaryExpression | PropertyAccessExpression;

/**
 * Serializes an qualified name as an expression for decorator type metadata.
 *
 * @param node The qualified name to serialize.
 * @param useFallback A value indicating whether to use logical operators to test for the
 *                    qualified name at runtime.
 */
function serializeQualifiedNameAsExpression(f: NodeFactory, node: QualifiedName): SerializedEntityNameAsExpression {
    return f.createPropertyAccessExpression(serializeEntityNameAsExpression(f, node.left), node.right);
}

export type MetaNode = Node & {
    jsDoc?: JSDoc[];
    _original?: MetaNode;
    original?: MetaNode;
    _symbol?: Symbol;
    symbol?: Symbol;
    _parent?: MetaNode;
    localSymbol?: Symbol;
};

function finish<T extends MetaNode>(oldNode: MetaNode, newNode: T): T {
    setOriginalNode(newNode, oldNode);
    newNode._original = newNode.original;

    newNode._symbol = oldNode._symbol ?? oldNode.symbol;
    newNode.symbol = newNode._symbol;
    return newNode;
}

