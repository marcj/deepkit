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
    ArrayTypeNode,
    ArrowFunction,
    Block,
    Bundle,
    CallExpression,
    CallSignatureDeclaration,
    ClassDeclaration,
    ClassElement,
    ClassExpression,
    CompilerHost,
    CompilerOptions,
    ConciseBody,
    ConditionalTypeNode,
    ConstructorDeclaration,
    ConstructorTypeNode,
    ConstructSignatureDeclaration,
    CustomTransformer,
    CustomTransformerFactory,
    Declaration,
    EntityName,
    EnumDeclaration,
    ExportDeclaration,
    Expression,
    ExpressionWithTypeArguments,
    FunctionDeclaration,
    FunctionExpression,
    FunctionTypeNode,
    Identifier,
    ImportDeclaration,
    IndexedAccessTypeNode,
    IndexSignatureDeclaration,
    InferTypeNode,
    InterfaceDeclaration,
    IntersectionTypeNode,
    isJSDocImportTag,
    JSDocImportTag,
    LiteralTypeNode,
    MappedTypeNode,
    MethodDeclaration,
    MethodSignature,
    Modifier,
    ModuleDeclaration,
    ModuleExportName,
    NewExpression,
    Node,
    NodeArray,
    NodeFactory,
    ParseConfigHost,
    PropertyAccessExpression,
    PropertyDeclaration,
    PropertySignature,
    QualifiedName,
    RestTypeNode,
    SignatureDeclaration,
    Statement,
    TemplateLiteralTypeNode,
    TransformationContext,
    TupleTypeNode,
    TypeAliasDeclaration,
    TypeChecker,
    TypeLiteralNode,
    TypeNode,
    TypeOperatorNode,
    TypeParameterDeclaration,
    TypeQueryNode,
    TypeReferenceNode,
    UnionTypeNode,
} from 'typescript';

import {
    ensureImportIsEmitted,
    extractJSDocAttribute,
    findSourceFile,
    getEscapedText,
    getGlobalsOfSourceFile,
    getIdentifierName,
    getNameAsString,
    getPropertyName,
    hasModifier,
    isNodeWithLocals,
    NodeConverter,
    PackExpression,
    serializeEntityNameAsExpression,
} from './reflection-ast.js';
import { SourceFile } from './ts-types.js';
import { MappedModifier, ReflectionOp, TypeNumberBrand } from '@deepkit/type-spec';
import { Resolver } from './resolver.js';
import { knownLibFilesForCompilerOptions } from '@typescript/vfs';
import { debug, debug2 } from './debug.js';
import { ConfigResolver, getConfigResolver, MatchResult, ReflectionConfig, ReflectionConfigCache, reflectionModeMatcher, ResolvedConfig } from './config.js';

const {
    visitEachChild,
    visitNode,
    isPropertyAssignment,
    isArrayTypeNode,
    isArrowFunction,
    isBlock,
    isCallExpression,
    isCallSignatureDeclaration,
    isClassDeclaration,
    isClassExpression,
    isConstructorDeclaration,
    isConstructorTypeNode,
    isConstructSignatureDeclaration,
    isEnumDeclaration,
    isExportDeclaration,
    isExpression,
    isExpressionWithTypeArguments,
    isFunctionDeclaration,
    isFunctionExpression,
    isFunctionLike,
    isIdentifier,
    isImportClause,
    isImportDeclaration,
    isImportSpecifier,
    isInferTypeNode,
    isInterfaceDeclaration,
    isMethodDeclaration,
    isMethodSignature,
    isModuleDeclaration,
    isNamedExports,
    isNamedTupleMember,
    isNewExpression,
    isObjectLiteralExpression,
    isOptionalTypeNode,
    isParameter,
    isParenthesizedExpression,
    isParenthesizedTypeNode,
    isPropertyAccessExpression,
    isQualifiedName,
    isSourceFile,
    isStringLiteral,
    isTypeAliasDeclaration,
    isTypeLiteralNode,
    isTypeParameterDeclaration,
    isTypeQueryNode,
    isTypeReferenceNode,
    isUnionTypeNode,
    isExpressionStatement,
    isVariableDeclaration,
    getEffectiveConstraintOfTypeParameter,
    addSyntheticLeadingComment,
    createCompilerHost,
    createPrinter,
    escapeLeadingUnderscores,
    EmitHint,
    NodeFlags,
    SyntaxKind,
    ScriptTarget,
    ModifierFlags,
    ScriptKind,
} = ts;

export function encodeOps(ops: ReflectionOp[]): string {
    return ops.map(v => String.fromCharCode(v + 33)).join('');
}

function filterUndefined(object: { [name: string]: any }): { [name: string]: any } {
    return Object.fromEntries(Object.entries(object).filter(([, v]) => v !== undefined));
}

export const packSizeByte: number = 6;

const serverEnv = 'undefined' !== typeof process;

/**
 * It can't be more ops than this given number
 */
export const packSize: number = 2 ** packSizeByte; //64

const OPs: { [op in ReflectionOp]?: { params: number } } = {
    [ReflectionOp.literal]: { params: 1 },
    // [ReflectionOp.pointer]: { params: 1 },
    // [ReflectionOp.arg]: { params: 1 },
    [ReflectionOp.classReference]: { params: 1 },
    [ReflectionOp.propertySignature]: { params: 1 },
    [ReflectionOp.property]: { params: 1 },
    [ReflectionOp.jump]: { params: 1 },
    [ReflectionOp.enum]: { params: 0 },
    [ReflectionOp.enumMember]: { params: 1 },
    [ReflectionOp.typeParameter]: { params: 1 },
    [ReflectionOp.typeParameterDefault]: { params: 1 },
    [ReflectionOp.mappedType]: { params: 2 },
    [ReflectionOp.call]: { params: 1 },
    [ReflectionOp.inline]: { params: 1 },
    [ReflectionOp.inlineCall]: { params: 2 },
    [ReflectionOp.loads]: { params: 2 },
    [ReflectionOp.extends]: { params: 0 },
    [ReflectionOp.infer]: { params: 2 },
    [ReflectionOp.defaultValue]: { params: 1 },
    [ReflectionOp.parameter]: { params: 1 },
    [ReflectionOp.method]: { params: 1 },
    [ReflectionOp.function]: { params: 1 },
    [ReflectionOp.description]: { params: 1 },
    [ReflectionOp.numberBrand]: { params: 1 },
    [ReflectionOp.typeof]: { params: 1 },
    [ReflectionOp.classExtends]: { params: 1 },
    [ReflectionOp.distribute]: { params: 1 },
    [ReflectionOp.jumpCondition]: { params: 2 },
    [ReflectionOp.typeName]: { params: 1 },
    [ReflectionOp.implements]: { params: 1 },
};

export function debugPackStruct(sourceFile: SourceFile, forType: Node, pack: { ops: ReflectionOp[], stack: PackExpression[] }): void {
    const items: any[] = [];

    for (let i = 0; i < pack.ops.length; i++) {
        const op = pack.ops[i];
        const opInfo = OPs[op];
        items.push(ReflectionOp[op]);
        if (opInfo && opInfo.params > 0) {
            for (let j = 0; j < opInfo.params; j++) {
                const address = pack.ops[++i];
                items.push(address);
            }
        }
    }

    const printer = createPrinter();
    const stack: any[] = [];
    for (const s of pack.stack) {
        if ('object' === typeof s && 'getText' in s) {
            stack.push(printer.printNode(EmitHint.Unspecified, s, sourceFile));
        } else {
            stack.push(JSON.stringify(s));
        }
    }
    console.log(stack.join(','), '|', ...items);
}

interface Frame {
    variables: { name: string, index: number }[],
    opIndex: number;
    conditional?: true;
    previous?: Frame;
}

function findVariable(frame: Frame, name: string, frameOffset: number = 0): { frameOffset: number, stackIndex: number } | undefined {
    const variable = frame.variables.find(v => v.name === name);
    if (variable) {
        return { frameOffset, stackIndex: variable.index };
    }

    if (frame.previous) return findVariable(frame.previous, name, frameOffset + 1);

    return;
}

function findConditionalFrame(frame: Frame): Frame | undefined {
    if (frame.conditional) return frame;
    if (frame.previous) return findConditionalFrame(frame.previous);

    return;
}

type StackEntry = Expression | string | number | boolean;

class CompilerProgram {
    protected ops: ReflectionOp[] = [];
    protected stack: StackEntry[] = [];
    protected mainOffset: number = 0;

    protected stackPosition: number = 0;

    protected frame: Frame = { variables: [], opIndex: 0 };

    protected activeCoRoutines: { ops: ReflectionOp[] }[] = [];
    protected coRoutines: { ops: ReflectionOp[] }[] = [];

    constructor(public forNode: Node, public sourceFile?: SourceFile) {
    }

    buildPackStruct() {
        const ops: ReflectionOp[] = [...this.ops];

        if (this.coRoutines.length) {
            for (let i = this.coRoutines.length - 1; i >= 0; i--) {
                ops.unshift(...this.coRoutines[i].ops);
            }
        }

        if (this.mainOffset) {
            ops.unshift(ReflectionOp.jump, this.mainOffset);
        }

        return { ops, stack: this.stack };
    }

    isEmpty(): boolean {
        return this.ops.length === 0;
    }

    pushConditionalFrame(): void {
        const frame = this.pushFrame();
        frame.conditional = true;
    }

    pushStack(item: StackEntry): number {
        this.stack.push(item);
        return this.stackPosition++;
    }

    pushCoRoutine(): void {
        this.pushFrame(true); //co-routines have implicit stack frames due to call convention
        this.activeCoRoutines.push({ ops: [] });
    }

    popCoRoutine(): number {
        const coRoutine = this.activeCoRoutines.pop();
        if (!coRoutine) throw new Error('No active co routine found');
        this.popFrameImplicit();
        if (this.mainOffset === 0) {
            this.mainOffset = 2; //we add JUMP + index when building the program
        }
        const startIndex = this.mainOffset;
        coRoutine.ops.push(ReflectionOp.return);
        this.coRoutines.push(coRoutine);
        this.mainOffset += coRoutine.ops.length;
        return startIndex;
    }

    pushOp(...ops: ReflectionOp[]): void {
        for (const op of ops) {
            if ('number' !== typeof op) {
                throw new Error('No valid OP added');
            }
            // if (op + 33 > 126) {
            //todo: encode as var int
            // throw new Error('stack pointer too big ' + op);
            // }
        }
        if (this.activeCoRoutines.length) {
            this.activeCoRoutines[this.activeCoRoutines.length - 1].ops.push(...ops);
            return;
        }

        this.ops.push(...ops);
    }

    pushOpAtFrame(frame: Frame, ...ops: ReflectionOp[]): void {
        if (this.activeCoRoutines.length) {
            this.activeCoRoutines[this.activeCoRoutines.length - 1].ops.splice(frame.opIndex, 0, ...ops);
            return;
        }

        this.ops.splice(frame.opIndex, 0, ...ops);
    }

    /**
     * Returns the index of the `entry` in the stack, if already exists. If not, add it, and return that new index.
     */
    findOrAddStackEntry(entry: any): number {
        const index = this.stack.indexOf(entry);
        if (index !== -1) return index;
        return this.pushStack(entry);
    }

    /**
     * To make room for a stack entry expected on the stack as input for example.
     */
    increaseStackPosition(): number {
        return this.stackPosition++;
    }

    protected resolveFunctionParameters = new Map<Node, number>();

    resolveFunctionParametersIncrease(fn: Node) {
        this.resolveFunctionParameters.set(fn, (this.resolveFunctionParameters.get(fn) || 0) + 1);
    }

    resolveFunctionParametersDecrease(fn: Node) {
        this.resolveFunctionParameters.set(fn, (this.resolveFunctionParameters.get(fn) || 1) - 1);
    }

    isResolveFunctionParameters(fn: Node) {
        return (this.resolveFunctionParameters.get(fn) || 0) > 0;
    }

    /**
     *
     * Each pushFrame() call needs a popFrame() call.
     */
    pushFrame(implicit: boolean = false) {
        if (!implicit) this.pushOp(ReflectionOp.frame);
        const opIndex = this.activeCoRoutines.length ? this.activeCoRoutines[this.activeCoRoutines.length - 1].ops.length : this.ops.length;
        this.frame = { previous: this.frame, variables: [], opIndex };
        return this.frame;
    }

    findConditionalFrame() {
        return findConditionalFrame(this.frame);
    }

    /**
     * Remove stack without doing it as OP in the processor. Some other command calls popFrame() already, which makes popFrameImplicit() an implicit popFrame.
     * e.g. union, class, etc. all call popFrame(). the current CompilerProgram needs to be aware of that, which this function is for.
     */
    popFrameImplicit() {
        if (this.frame.previous) this.frame = this.frame.previous;
    }

    moveFrame() {
        this.pushOp(ReflectionOp.moveFrame);
        if (this.frame.previous) this.frame = this.frame.previous;
    }

    pushVariable(name: string, frame: Frame = this.frame): number {
        this.pushOpAtFrame(frame, ReflectionOp.var);
        frame.variables.push({
            index: frame.variables.length,
            name,
        });
        return frame.variables.length - 1;
    }

    pushTemplateParameter(name: string, withDefault: boolean = false): number {
        this.pushOp(withDefault ? ReflectionOp.typeParameterDefault : ReflectionOp.typeParameter, this.findOrAddStackEntry(name));
        this.frame.variables.push({
            index: this.frame.variables.length,
            name,
        });
        return this.frame.variables.length - 1;
    }

    findVariable(name: string, frame = this.frame) {
        return findVariable(frame, name);
    }
}

function getAssignTypeExpression(call: Expression): Expression | undefined {
    if (isParenthesizedExpression(call) && isCallExpression(call.expression)) {
        call = call.expression;
    }

    if (isCallExpression(call) && isIdentifier(call.expression) && getIdentifierName(call.expression) === '__assignType' && call.arguments.length > 0) {
        return call.arguments[0];
    }

    return;
}

function getReceiveTypeParameter(type: TypeNode): TypeReferenceNode | undefined {
    if (isUnionTypeNode(type)) {
        for (const t of type.types) {
            const rfn = getReceiveTypeParameter(t);
            if (rfn) return rfn;
        }
    } else if (isTypeReferenceNode(type) && isIdentifier(type.typeName)
        && getIdentifierName(type.typeName) === 'ReceiveType' && !!type.typeArguments
        && type.typeArguments.length === 1) return type;

    return;
}

export class Cache {
    resolver: ReflectionConfigCache = {};
    sourceFiles: { [fileName: string]: SourceFile } = {};

    globalSourceFiles?: SourceFile[];

    /**
     * Signals the cache to check if it needs to be cleared.
     */
    tick() {
        if (Object.keys(this.sourceFiles).length > 300) {
            this.sourceFiles = {};
        }
    }
}

/**
 * Read the TypeScript AST and generate pack struct (instructions + pre-defined stack).
 *
 * This transformer extracts type and add the encoded (so its small and low overhead) at classes and functions as property.
 *
 * Deepkit/type can then extract and decode them on-demand.
 */
export class ReflectionTransformer implements CustomTransformer {
    sourceFile!: SourceFile;
    protected f: NodeFactory;

    protected embedAssignType: boolean = false;

    /**
     * Types added to this map will get a type program directly under it.
     * This is for types used in the very same file.
     */
    protected compileDeclarations = new Map<
        TypeAliasDeclaration | InterfaceDeclaration | EnumDeclaration,
        { name: EntityName, sourceFile: SourceFile, compiled?: Statement[] }
    >();

    /**
     * Types added to this map will get a type program at the top root level of the program.
     * This is for imported types, which need to be inlined into the current file, as we do not emit type imports (TS will omit them).
     */
    protected embedDeclarations = new Map<Node, { name: EntityName, sourceFile?: SourceFile }>();

    /**
     * When a node was embedded or compiled (from the maps above), we store it here to know to not add it again.
     */
    protected compiledDeclarations = new Set<Node>();

    protected addImports: { importDeclaration: ImportDeclaration | JSDocImportTag, identifier: Identifier }[] = [];
    protected additionalImports = new Map<ImportDeclaration | JSDocImportTag, Statement>();

    protected nodeConverter: NodeConverter;
    protected typeChecker?: TypeChecker;
    protected resolver: Resolver;
    protected host: CompilerHost;
    protected overriddenHost = false;
    protected overriddenConfigResolver?: ConfigResolver;

    protected compilerOptions: CompilerOptions;

    /**
     * When a deep call expression was found a script-wide variable is necessary
     * as temporary storage.
     */
    protected tempResultIdentifier?: Identifier;
    protected parseConfigHost: ParseConfigHost;
    protected intrinsicMetaDeclaration: TypeAliasDeclaration;

    constructor(
        protected context: TransformationContext,
        protected cache: Cache = new Cache,
    ) {
        this.f = context.factory;
        this.nodeConverter = new NodeConverter(this.f);
        // It is important to not have undefined values like {paths: undefined} because it would override the read tsconfig.json.
        // Important to create a copy since we will modify it.
        this.compilerOptions = { ...filterUndefined(context.getCompilerOptions()) };
        // compilerHost has no internal cache and is cheap to build, so no cache needed.
        // Resolver loads SourceFile which has cache implemented.
        this.host = createCompilerHost(this.compilerOptions);
        this.resolver = new Resolver(this.compilerOptions, this.host, this.cache.sourceFiles);
        this.parseConfigHost = {
            useCaseSensitiveFileNames: true,
            fileExists: (path: string) => this.host.fileExists(path),
            readFile: (path: string) => this.host.readFile(path),
            readDirectory: (path: string, extensions?: readonly string[], exclude?: readonly string[], include?: readonly string[], depth?: number) => {
                if (!this.host.readDirectory) return [];
                return this.host.readDirectory(path, extensions || [], exclude, include || [], depth);
            },
        };

        {
            // TypeAnnotation<T, Options> = { __meta?: never & [T, Options] }
            const T = this.f.createIdentifier('T');
            const Options = this.f.createIdentifier('Options');
            this.intrinsicMetaDeclaration = this.f.createTypeAliasDeclaration(
                [],
                'TypeAnnotation',
                [
                    this.f.createTypeParameterDeclaration([], T),
                    this.f.createTypeParameterDeclaration([], Options, undefined, this.f.createTypeReferenceNode('never')),
                ],
                this.f.createTypeLiteralNode([
                    this.f.createPropertySignature(
                        undefined,
                        '__meta',
                        this.f.createToken(SyntaxKind.QuestionToken),
                        this.f.createIntersectionTypeNode(
                            [
                                this.f.createTypeReferenceNode('never'),
                                this.f.createTupleTypeNode([
                                    this.f.createTypeReferenceNode(T),
                                    this.f.createTypeReferenceNode(Options),
                                ]),
                            ],
                        ),
                    ),
                ]),
            );
        }
    }

    forHost(host: CompilerHost): this {
        this.host = host;
        this.resolver.host = host;
        this.overriddenHost = true;
        return this;
    }

    withReflection(config: ReflectionConfig): this {
        const match = (path: string) => {
            const mode = reflectionModeMatcher(config, path);
            return { mode, tsConfigPath: '' };
        };
        const configResolver: ResolvedConfig = { ...config, path: '', mergeStrategy: 'replace', compilerOptions: this.compilerOptions };
        this.overriddenConfigResolver = { config: configResolver, match };
        return this;
    }

    transformBundle(node: Bundle): Bundle {
        return node;
    }

    getTempResultIdentifier(): Identifier {
        if (this.tempResultIdentifier) return this.tempResultIdentifier;

        const locals = isNodeWithLocals(this.sourceFile) ? this.sourceFile.locals : undefined;

        if (locals) {
            let found = 'Ωr';
            for (let i = 0; ; i++) {
                found = 'Ωr' + (i ? i : '');
                if (!locals.has(escapeLeadingUnderscores(found))) break;
            }
            this.tempResultIdentifier = this.f.createIdentifier(found);
        } else {
            this.tempResultIdentifier = this.f.createIdentifier('Ωr');
        }
        return this.tempResultIdentifier;
    }

    protected getConfigResolver(sourceFile: { fileName: string }): ConfigResolver {
        if (this.overriddenConfigResolver) return this.overriddenConfigResolver;
        return getConfigResolver(this.cache.resolver, this.parseConfigHost, this.compilerOptions, sourceFile);
    }

    protected getReflectionConfig(sourceFile: { fileName: string }): MatchResult {
        const configResolver = this.getConfigResolver(sourceFile);
        return configResolver.match(sourceFile.fileName);
    }

    protected isWithReflection(sourceFile: SourceFile | undefined, node: Node & { __deepkitConfig?: ReflectionConfig }): boolean {
        const mode = this.getExplicitReflectionMode(sourceFile, node);
        if (mode === false) return false;
        if (!sourceFile) return true; // intrinsic types are always with reflection
        const reflection = this.getReflectionConfig(sourceFile);
        // explicit means reflection needs to be enabled per Node/File via @reflection
        if (reflection.mode === 'explicit') return mode === true;
        return reflection.mode === 'default';
    }

    transformSourceFile(sourceFile: SourceFile): SourceFile {
        this.sourceFile = sourceFile;

        //if it's not a TS/TSX file, we do not transform it
        if (sourceFile.scriptKind !== ScriptKind.TS && sourceFile.scriptKind !== ScriptKind.TSX) return sourceFile;

        if ((sourceFile as any).deepkitTransformed) return sourceFile;
        this.embedAssignType = false;
        this.addImports = [];
        this.additionalImports.clear();

        const start = Date.now();
        const configResolver = this.getConfigResolver(sourceFile);
        const reflection = configResolver.match(sourceFile.fileName);

        // important to override the compilerOptions with the one from the configResolver
        // since the one provided by TSC/plugins are not necessarily the full picture.
        // ConfigResolver resolves the whole config.
        // Since this.compilerOptions was already passed to Resolver, we update its values by reference.
        Object.assign(this.compilerOptions, configResolver.config.compilerOptions);

        if (reflection.mode === 'never') {
            debug(`Transform file with reflection=${reflection.mode} took ${Date.now() - start}ms (${this.getModuleType()}) ${sourceFile.fileName} via config ${reflection.tsConfigPath || 'none'}.`);
            return sourceFile;
        }

        if (!(sourceFile as any).locals) {
            //@ts-ignore
            ts.bindSourceFile(sourceFile, this.compilerOptions);
        }

        if (sourceFile.kind !== SyntaxKind.SourceFile) {
            if ('undefined' === typeof require) {
                throw new Error(`Invalid TypeScript library imported. SyntaxKind different ${sourceFile.kind} !== ${SyntaxKind.SourceFile}.`);
            }
            const path = require.resolve('typescript');
            throw new Error(`Invalid TypeScript library imported. SyntaxKind different ${sourceFile.kind} !== ${SyntaxKind.SourceFile}. typescript package path: ${path}`);
        }

        const visitor = (node: Node): any => {
            node = visitEachChild(node, visitor, this.context);

            if ((isInterfaceDeclaration(node) || isTypeAliasDeclaration(node) || isEnumDeclaration(node))) {
                if (this.isWithReflection(sourceFile, node)) {
                    this.compileDeclarations.set(node, {
                        name: node.name,
                        sourceFile: this.sourceFile,
                    });
                }
            }

            if (isMethodDeclaration(node) && node.parent && node.body && isObjectLiteralExpression(node.parent)) {
                //replace MethodDeclaration with MethodExpression
                // {add(v: number) {}} => {add: function (v: number) {}}
                //so that __type can be added.
                //{default(){}} can not be converted without losing the function name, so we skip that for the moment.
                let valid = true;
                if (node.name.kind === SyntaxKind.Identifier && getIdentifierName(node.name) === 'default') valid = false;
                if (valid) {
                    const method = this.decorateFunctionExpression(
                        this.f.createFunctionExpression(
                            node.modifiers as ReadonlyArray<Modifier>, node.asteriskToken, isIdentifier(node.name) ? node.name : undefined,
                            node.typeParameters, node.parameters, node.type, node.body,
                        ),
                    );
                    node = this.f.createPropertyAssignment(node.name, method);
                }
            }

            if (isClassDeclaration(node)) {
                return this.decorateClass(sourceFile, node);
            } else if (isParameter(node) && node.parent && node.type) {
                // ReceiveType
                const typeParameters = isConstructorDeclaration(node.parent) ? node.parent.parent.typeParameters : node.parent.typeParameters;
                if (!typeParameters) return node;

                const receiveType = getReceiveTypeParameter(node.type);
                if (receiveType && receiveType.typeArguments) {
                    const first = receiveType.typeArguments[0];
                    if (first && isTypeReferenceNode(first) && isIdentifier(first.typeName)) {
                        const name = getIdentifierName(first.typeName);
                        //find type parameter position
                        const index = typeParameters.findIndex(v => getIdentifierName(v.name) === name);

                        let container: Expression = this.f.createIdentifier('globalThis');
                        if (isArrowFunction(node.parent)) {
                            const next = this.getArrowFunctionΩPropertyAccessIdentifier(node.parent);
                            if (!next) return node;
                            container = next;
                        } else if ((isFunctionDeclaration(node.parent) || isFunctionExpression(node.parent)) && node.parent.name) {
                            container = node.parent.name;
                        } else if (isMethodDeclaration(node.parent) && isIdentifier(node.parent.name)) {
                            container = this.f.createPropertyAccessExpression(this.f.createIdentifier('this'), node.parent.name);
                        } else if (isConstructorDeclaration(node.parent)) {
                            container = this.f.createPropertyAccessExpression(this.f.createIdentifier('this'), 'constructor');
                        }

                        return this.f.updateParameterDeclaration(node, node.modifiers as ReadonlyArray<Modifier>, node.dotDotDotToken, node.name,
                            node.questionToken, receiveType, this.f.createElementAccessChain(
                                this.f.createPropertyAccessExpression(
                                    container,
                                    this.f.createIdentifier('Ω'),
                                ),
                                this.f.createToken(SyntaxKind.QuestionDotToken),
                                this.f.createNumericLiteral(index),
                            ),
                        );
                    }
                }
            } else if (isClassExpression(node)) {
                return this.decorateClass(sourceFile, node);
            } else if (isFunctionExpression(node)) {
                return this.decorateFunctionExpression(this.injectResetΩ(node));
            } else if (isFunctionDeclaration(node)) {
                return this.decorateFunctionDeclaration(this.injectResetΩ(node));
            } else if (isMethodDeclaration(node) || isConstructorDeclaration(node)) {
                return this.injectResetΩ(node);
            } else if (isArrowFunction(node)) {
                return this.decorateArrowFunction(this.injectResetΩ(node));
            } else if ((isNewExpression(node) || isCallExpression(node)) && node.typeArguments && node.typeArguments.length > 0) {

                if (isCallExpression(node)) {
                    const autoTypeFunctions = ['valuesOf', 'propertiesOf', 'typeOf'];
                    if (isIdentifier(node.expression) && autoTypeFunctions.includes(getIdentifierName(node.expression))) {
                        const args: Expression[] = [...node.arguments];

                        if (!args.length) {
                            args.push(this.f.createArrayLiteralExpression());
                        }

                        // const resolvedType = this.resolveType(node.typeArguments[0]);
                        const type = this.getTypeOfType(node.typeArguments[0]);
                        if (!type) return node;
                        args.push(type);

                        return this.f.updateCallExpression(node, node.expression, node.typeArguments, this.f.createNodeArray(args));
                    }
                }

                //put the type argument in FN.Ω
                const expressionToCheck = getAssignTypeExpression(node.expression) || node.expression;
                if (isArrowFunction(expressionToCheck)) {
                    //inline arrow functions are excluded from type passing
                    return node;
                }

                const typeExpressions: Expression[] = [];
                for (const a of node.typeArguments) {
                    const type = this.getTypeOfType(a);
                    typeExpressions.push(type || this.f.createIdentifier('undefined'));
                }

                let container: Expression = this.f.createIdentifier('globalThis');
                if (isIdentifier(node.expression)) {
                    container = node.expression;
                } else if (isPropertyAccessExpression(node.expression)) {
                    container = node.expression;
                }

                const assignQ = this.f.createBinaryExpression(
                    this.f.createPropertyAccessExpression(container, 'Ω'),
                    this.f.createToken(SyntaxKind.EqualsToken),
                    this.f.createArrayLiteralExpression(typeExpressions),
                );

                const update: any = isNewExpression(node) ? this.f.updateNewExpression : this.f.updateCallExpression;

                if (isPropertyAccessExpression(node.expression)) {
                    //e.g. http.deep.response();
                    if (isCallExpression(node.expression.expression)) {
                        //e.g. http.deep().response();
                        //change to (Ωr = http.deep(), Ωr.response.Ω = [], Ωr).response()
                        const r = this.getTempResultIdentifier();
                        const assignQ = this.f.createBinaryExpression(
                            this.f.createPropertyAccessExpression(
                                this.f.createPropertyAccessExpression(r, node.expression.name),
                                'Ω',
                            ),
                            this.f.createToken(SyntaxKind.EqualsToken),
                            this.f.createArrayLiteralExpression(typeExpressions),
                        );

                        return update(node,
                            this.f.createPropertyAccessExpression(
                                this.f.createParenthesizedExpression(this.f.createBinaryExpression(
                                    this.f.createBinaryExpression(
                                        this.f.createBinaryExpression(
                                            r,
                                            this.f.createToken(ts.SyntaxKind.EqualsToken),
                                            node.expression.expression,
                                        ),
                                        this.f.createToken(ts.SyntaxKind.CommaToken),
                                        assignQ,
                                    ),
                                    this.f.createToken(ts.SyntaxKind.CommaToken),
                                    r,
                                )),
                                node.expression.name,
                            ),
                            node.typeArguments,
                            node.arguments,
                        );

                    } else if (isParenthesizedExpression(node.expression.expression)) {
                        //e.g. (http.deep()).response();
                        //only work necessary when `http.deep()` is using type args and was converted to:
                        //  (Ω = [], http.deep()).response()

                        //it's a call like (obj.method.Ω = ['a'], obj.method()).method()
                        //which needs to be converted so that Ω is correctly read by the last call
                        //(r = (obj.method.Ω = [['a']], obj.method()), obj.method.Ω = [['b']], r).method());

                        const r = this.getTempResultIdentifier();
                        const assignQ = this.f.createBinaryExpression(
                            this.f.createPropertyAccessExpression(
                                this.f.createPropertyAccessExpression(r, node.expression.name),
                                'Ω',
                            ),
                            this.f.createToken(SyntaxKind.EqualsToken),
                            this.f.createArrayLiteralExpression(typeExpressions),
                        );

                        const updatedNode = update(
                            node,
                            this.f.updatePropertyAccessExpression(
                                node.expression,
                                this.f.updateParenthesizedExpression(
                                    node.expression.expression,
                                    this.f.createBinaryExpression(
                                        this.f.createBinaryExpression(
                                            this.f.createBinaryExpression(
                                                r,
                                                this.f.createToken(SyntaxKind.EqualsToken),
                                                node.expression.expression.expression,
                                            ),
                                            this.f.createToken(SyntaxKind.CommaToken),
                                            assignQ,
                                        ),
                                        this.f.createToken(SyntaxKind.CommaToken),
                                        r,
                                    ),
                                ),
                                node.expression.name,
                            ),
                            node.typeArguments,
                            node.arguments,
                        );

                        return this.f.createParenthesizedExpression(updatedNode);
                    } else {
                        //e.g. http.deep.response();
                        //nothing to do
                    }
                }

                //(fn.Ω = [], call())
                return this.f.createParenthesizedExpression(this.f.createBinaryExpression(
                    assignQ,
                    this.f.createToken(SyntaxKind.CommaToken),
                    node,
                ));
            }

            return node;
        };
        this.sourceFile = visitNode(this.sourceFile, visitor);

        const newTopStatements: Statement[] = [];

        while (true) {
            let allCompiled = true;
            for (const d of this.compileDeclarations.values()) {
                if (d.compiled) continue;
                allCompiled = false;
                break;
            }

            if (this.embedDeclarations.size === 0 && allCompiled) break;

            for (const [node, d] of [...this.compileDeclarations.entries()]) {
                if (d.compiled) continue;
                d.compiled = this.createProgramVarFromNode(node, d.name, this.sourceFile);
            }

            if (this.embedDeclarations.size) {
                for (const node of this.embedDeclarations.keys()) {
                    this.compiledDeclarations.add(node);
                }
                const entries = Array.from(this.embedDeclarations.entries());
                this.embedDeclarations.clear();
                for (const [node, d] of entries) {
                    newTopStatements.push(...this.createProgramVarFromNode(node, d.name, d.sourceFile));
                }
            }
        }

        //externalize type aliases
        const compileDeclarations = (node: Node): any => {
            node = visitEachChild(node, compileDeclarations, this.context);

            if ((isTypeAliasDeclaration(node) || isInterfaceDeclaration(node) || isEnumDeclaration(node))) {
                const d = this.compileDeclarations.get(node);
                if (!d) {
                    return node;
                }
                this.compileDeclarations.delete(node);
                this.compiledDeclarations.add(node);
                if (d.compiled) {
                    return [...d.compiled, node];
                }
            }

            return node;
        };
        this.sourceFile = visitNode(this.sourceFile, compileDeclarations);

        if (this.addImports.length) {
            const handledIdentifier: string[] = [];
            // group by importDeclaration so that we have one `{...} per importDeclaration`
            const importMap = new Map<ImportDeclaration | JSDocImportTag, Identifier[]>();
            for (const imp of this.addImports) {
                if (handledIdentifier.includes(getIdentifierName(imp.identifier))) continue;
                handledIdentifier.push(getIdentifierName(imp.identifier));
                let arr = importMap.get(imp.importDeclaration);
                if (!arr) {
                    arr = [];
                    importMap.set(imp.importDeclaration, arr);
                }
                arr.push(imp.identifier);
            }

            for (const [importDeclaration, identifiers] of importMap.entries()) {
                if (this.additionalImports.has(importDeclaration)) {
                    throw new Error('Internal error: additional import already exists');
                }
                if (this.getModuleType() === 'cjs') {
                    // var {a, b, c} = require('./bar')
                    const varDeclaration = this.f.createVariableStatement(
                        undefined,
                        this.f.createVariableDeclarationList(
                            [this.f.createVariableDeclaration(
                                this.f.createObjectBindingPattern(identifiers.map(identifier => this.f.createBindingElement(
                                    undefined, undefined, identifier, undefined
                                ))),
                                undefined,
                                undefined,
                                this.f.createCallExpression(this.f.createIdentifier("require"), undefined, [importDeclaration.moduleSpecifier])
                            )],
                            ts.NodeFlags.None
                        )
                    );

                    const typeDeclWithComment = addSyntheticLeadingComment(
                        varDeclaration,
                        SyntaxKind.MultiLineCommentTrivia,
                        '@ts-ignore',
                        true,
                    );
                    this.additionalImports.set(importDeclaration, typeDeclWithComment);
                } else {
                    // import {a, b, c} from './bar.js'
                    const namedImports = this.f.createNamedImports(identifiers.map(identifier => this.f.createImportSpecifier(false, undefined, identifier)));
                    const importStatement = this.f.createImportDeclaration(undefined,
                        this.f.createImportClause(false, undefined, namedImports), importDeclaration.moduleSpecifier,
                    );
                    const typeDeclWithComment = addSyntheticLeadingComment(
                        importStatement,
                        SyntaxKind.MultiLineCommentTrivia,
                        '@ts-ignore',
                        true,
                    );
                    this.additionalImports.set(importDeclaration, typeDeclWithComment);
                }
            }
        }

        if (this.embedAssignType) {
            const assignType = this.f.createFunctionDeclaration(
                undefined,
                undefined,
                this.f.createIdentifier('__assignType'),
                undefined,
                [
                    this.f.createParameterDeclaration(
                        undefined,
                        undefined,
                        this.f.createIdentifier('fn'),
                        undefined,
                        undefined, //this.f.createKeywordTypeNode(SyntaxKind.AnyKeyword),
                        undefined,
                    ),
                    this.f.createParameterDeclaration(
                        undefined,
                        undefined,
                        this.f.createIdentifier('args'),
                        undefined,
                        undefined, //this.f.createKeywordTypeNode(SyntaxKind.AnyKeyword),
                        undefined,
                    ),
                ],
                undefined, //this.f.createKeywordTypeNode(SyntaxKind.AnyKeyword),
                this.f.createBlock(
                    [
                        this.f.createExpressionStatement(this.f.createBinaryExpression(
                            this.f.createPropertyAccessExpression(
                                this.f.createIdentifier('fn'),
                                this.f.createIdentifier('__type'),
                            ),
                            this.f.createToken(SyntaxKind.EqualsToken),
                            this.f.createIdentifier('args'),
                        )),
                        this.f.createReturnStatement(this.f.createIdentifier('fn')),
                    ],
                    true,
                ),
            );
            newTopStatements.push(assignType);
        }

        if (this.tempResultIdentifier) {
            newTopStatements.push(
                this.f.createVariableStatement(
                    undefined,
                    this.f.createVariableDeclarationList(
                        [this.f.createVariableDeclaration(
                            this.tempResultIdentifier,
                            undefined,
                            undefined,
                            undefined,
                        )],
                        ts.NodeFlags.None,
                    ),
                ),
            );
        }

        // we want to keep "use strict", or "use client", etc at the very top
        const indexOfFirstLiteralExpression = this.sourceFile.statements.findIndex(v => isExpressionStatement(v) && isStringLiteral(v.expression));

        const newStatements = indexOfFirstLiteralExpression === -1
            ? [...newTopStatements, ...this.attachAdditionalStatements(this.sourceFile.statements)]
            : [
                ...this.sourceFile.statements.slice(0, indexOfFirstLiteralExpression + 1),
                ...newTopStatements,
                ...this.attachAdditionalStatements(this.sourceFile.statements.slice(indexOfFirstLiteralExpression + 1)),
            ];
        this.sourceFile = this.f.updateSourceFile(this.sourceFile, newStatements);

        // console.log(createPrinter().printNode(EmitHint.SourceFile, this.sourceFile, this.sourceFile));
        const took = Date.now() - start;
        debug(`Transform file with reflection=${reflection.mode} took ${took}ms (${this.getModuleType()}) ${sourceFile.fileName} via config ${reflection.tsConfigPath || 'none'}.`);
        (this.sourceFile as any).deepkitTransformed = true;
        return this.sourceFile;
    }

    attachAdditionalStatements(statements: NodeArray<Statement> | Statement[]): Statement[] {
        const result: Statement[] = [];
        for (const statement of statements) {
            if (isImportDeclaration(statement) || isJSDocImportTag(statement)) {
                const additional = this.additionalImports.get(statement);
                if (additional) {
                    result.push(additional);
                }
            }
            result.push(statement);
        }
        return result;
    }

    protected getModuleType(): 'cjs' | 'esm' {
        if (this.compilerOptions.module === ts.ModuleKind.Node16 || this.compilerOptions.module === ts.ModuleKind.NodeNext) {
            if (this.sourceFile.impliedNodeFormat === ts.ModuleKind.ESNext) {
                return 'esm';
            }
            return 'cjs';
        }
        return this.compilerOptions.module === ts.ModuleKind.CommonJS ? 'cjs' : 'esm';
    }

    protected getArrowFunctionΩPropertyAccessIdentifier(node: ArrowFunction): Identifier | undefined {
        let { parent } = (node as any).original || node;
        if (isVariableDeclaration(parent) && isIdentifier(parent.name)) {
            return parent.name;
        } else if (isPropertyAssignment(parent) && isIdentifier(parent.name)) {
            const names: string[] = [];
            while (parent) {
                if (isObjectLiteralExpression(parent)) {
                    parent = parent.parent;
                } else if (isVariableDeclaration(parent)) {
                    names.unshift(getIdentifierName(parent.name as Identifier));
                    break;
                } else if (isIdentifier(parent.name)) {
                    names.unshift(getIdentifierName(parent.name));
                    parent = parent.parent;
                } else {
                    return;
                }
            }
            return this.f.createIdentifier(names.join('.'));
        }
        return;
    }

    protected injectResetΩ<T extends FunctionDeclaration | FunctionExpression | MethodDeclaration | ConstructorDeclaration | ArrowFunction>(node: T): T {
        let hasReceiveType = false;
        for (const param of node.parameters) {
            if (param.type && getReceiveTypeParameter(param.type)) hasReceiveType = true;
        }
        if (!hasReceiveType) return node;

        let container: Expression = this.f.createIdentifier('globalThis');
        if (isArrowFunction(node)) {
            const next = this.getArrowFunctionΩPropertyAccessIdentifier(node);
            if (!next) return node;
            container = next;
        } else if ((isFunctionDeclaration(node) || isFunctionExpression(node)) && node.name) {
            container = node.name;
        } else if (isMethodDeclaration(node) && isIdentifier(node.name)) {
            container = this.f.createPropertyAccessExpression(this.f.createIdentifier('this'), node.name);
        } else if (isConstructorDeclaration(node)) {
            container = this.f.createPropertyAccessExpression(this.f.createIdentifier('this'), 'constructor');
        }

        const reset: Statement = this.f.createExpressionStatement(this.f.createBinaryExpression(
            this.f.createPropertyAccessExpression(
                container,
                this.f.createIdentifier('Ω'),
            ),
            this.f.createToken(ts.SyntaxKind.EqualsToken),
            this.f.createIdentifier('undefined'),
        ));

        // convert expression into statements array
        let body = node.body && isBlock(node.body) ? node.body : undefined;
        let bodyStatements: Statement[] = node.body && isBlock(node.body) ? [...node.body.statements] : [];
        if (node.body) {
            if (isExpression(node.body)) {
                bodyStatements = [this.f.createReturnStatement(node.body)];
            }
            body = this.f.updateBlock(node.body as Block, [reset, ...bodyStatements]);
        }

        if (isArrowFunction(node)) {
            return this.f.updateArrowFunction(node, node.modifiers, node.typeParameters, node.parameters, node.type, node.equalsGreaterThanToken, body as ConciseBody) as T;
        } else if (isFunctionDeclaration(node)) {
            return this.f.updateFunctionDeclaration(node, node.modifiers, node.asteriskToken, node.name,
                node.typeParameters, node.parameters, node.type, body) as T;
        } else if (isFunctionExpression(node)) {
            return this.f.updateFunctionExpression(node, node.modifiers, node.asteriskToken, node.name,
                node.typeParameters, node.parameters, node.type, body || node.body) as T;
        } else if (isMethodDeclaration(node)) {
            return this.f.updateMethodDeclaration(node, node.modifiers as ReadonlyArray<Modifier>, node.asteriskToken, node.name,
                node.questionToken, node.typeParameters, node.parameters, node.type, body) as T;
        } else if (isConstructorDeclaration(node)) {
            return this.f.updateConstructorDeclaration(node, node.modifiers, node.parameters, body) as T;
        }
        return node;
    }

    protected createProgramVarFromNode(node: Node, name: EntityName, sourceFile?: SourceFile): Statement[] {
        const typeProgram = new CompilerProgram(node, sourceFile);

        if ((isTypeAliasDeclaration(node) || isInterfaceDeclaration(node)) && node.typeParameters) {
            for (const param of node.typeParameters) {
                if (param.default) {
                    //push default on the stack
                    this.extractPackStructOfType(param.default, typeProgram);
                }
                typeProgram.pushTemplateParameter(getIdentifierName(param.name), !!param.default);
            }
        }

        this.extractPackStructOfType(node, typeProgram);

        if (isTypeAliasDeclaration(node) || isInterfaceDeclaration(node) || isClassDeclaration(node) || isClassExpression(node)) {
            typeProgram.pushOp(ReflectionOp.nominal);
        }

        const typeProgramExpression = this.packOpsAndStack(typeProgram);

        const variable = this.f.createVariableStatement(
            [],
            this.f.createVariableDeclarationList([
                this.f.createVariableDeclaration(
                    this.getDeclarationVariableName(name),
                    undefined,
                    undefined,
                    typeProgramExpression,
                ),
            ], NodeFlags.Const),
        );

        //when its commonJS, the `variable` would be exported as `exports.$name = $value`, but all references point just to $name.
        //so the idea is, that we create a normal variable and export it via `export {$name}`.
        if (hasModifier(node, SyntaxKind.ExportKeyword)) {
            //propertyName in ExportSpecifier is set to avoid a TS compile error:
            // TypeError: Cannot read properties of undefined (reading 'escapedText')
            //   at Object.idText (/Users/marc/bude/deepkit-framework/packages/benchmark/node_modules/typescript/lib/typescript.js:11875:67)
            const exportNode = this.f.createExportDeclaration(undefined, false, this.f.createNamedExports([
                this.f.createExportSpecifier(false, this.getDeclarationVariableName(name), this.getDeclarationVariableName(name)),
            ]));
            return [variable, exportNode];
        }

        return [variable];
    }

    protected extractPackStructOfExpression(node: Expression, program: CompilerProgram): void {
        switch (node.kind) {
            case SyntaxKind.StringLiteral: {
                program.pushOp(ReflectionOp.string);
                return;
            }
            case SyntaxKind.NumericLiteral: {
                program.pushOp(ReflectionOp.number);
                return;
            }
            case SyntaxKind.FalseKeyword:
            case SyntaxKind.TrueKeyword: {
                program.pushOp(ReflectionOp.boolean);
                return;
            }
            case SyntaxKind.BigIntLiteral: {
                program.pushOp(ReflectionOp.bigint);
                return;
            }
            //Symbol() is a function call, so we need to check for that
            case SyntaxKind.CallExpression: {
                const call = node as CallExpression;
                if (isIdentifier(call.expression) && getIdentifierName(call.expression) === 'Symbol') {
                    program.pushOp(ReflectionOp.symbol);
                    return;
                }
                break;
            }
            //new Date()
            case SyntaxKind.NewExpression: {
                const call = node as NewExpression;
                if (isIdentifier(call.expression)) {
                    const map: { [name: string]: ReflectionOp } = {
                        'Date': ReflectionOp.date,
                        'RegExp': ReflectionOp.regexp,
                        'Uint8Array': ReflectionOp.uint8Array,
                        'Uint8ClampedArray': ReflectionOp.uint8ClampedArray,
                        'Uint16Array': ReflectionOp.uint16Array,
                        'Uint32Array': ReflectionOp.uint32Array,
                        'Int8Array': ReflectionOp.int8Array,
                        'Int16Array': ReflectionOp.int16Array,
                        'Int32Array': ReflectionOp.int32Array,
                        'Float32Array': ReflectionOp.float32Array,
                        'Float64Array': ReflectionOp.float64Array,
                        'ArrayBuffer': ReflectionOp.arrayBuffer,
                    };
                    const op = map[getIdentifierName(call.expression)];
                    if (op) {
                        program.pushOp(op);
                        return;
                    }
                }
                break;
            }
        }

        program.pushOp(ReflectionOp.never);
    }

    protected extractPackStructOfType(node: Node | Declaration | ClassDeclaration | ClassExpression, program: CompilerProgram): void {
        if (isParenthesizedTypeNode(node)) return this.extractPackStructOfType(node.type, program);

        switch (node.kind) {
            case SyntaxKind.StringKeyword: {
                program.pushOp(ReflectionOp.string);
                break;
            }
            case SyntaxKind.NumberKeyword: {
                program.pushOp(ReflectionOp.number);
                break;
            }
            case SyntaxKind.BooleanKeyword: {
                program.pushOp(ReflectionOp.boolean);
                break;
            }
            case SyntaxKind.BigIntKeyword: {
                program.pushOp(ReflectionOp.bigint);
                break;
            }
            case SyntaxKind.VoidKeyword: {
                program.pushOp(ReflectionOp.void);
                break;
            }
            case SyntaxKind.UnknownKeyword: {
                program.pushOp(ReflectionOp.unknown);
                break;
            }
            case SyntaxKind.ObjectKeyword: {
                program.pushOp(ReflectionOp.object);
                break;
            }
            case SyntaxKind.SymbolKeyword: {
                program.pushOp(ReflectionOp.symbol);
                break;
            }
            case SyntaxKind.NullKeyword: {
                program.pushOp(ReflectionOp.null);
                break;
            }
            case SyntaxKind.NeverKeyword: {
                program.pushOp(ReflectionOp.never);
                break;
            }
            case SyntaxKind.AnyKeyword: {
                program.pushOp(ReflectionOp.any);
                break;
            }
            case SyntaxKind.UndefinedKeyword: {
                program.pushOp(ReflectionOp.undefined);
                break;
            }
            case SyntaxKind.TrueKeyword: {
                program.pushOp(ReflectionOp.literal, program.pushStack(this.f.createTrue()));
                break;
            }
            case SyntaxKind.FalseKeyword: {
                program.pushOp(ReflectionOp.literal, program.pushStack(this.f.createFalse()));
                break;
            }
            case SyntaxKind.ClassDeclaration:
            case SyntaxKind.ClassExpression: {
                //TypeScript does not narrow types down
                const narrowed = node as ClassDeclaration | ClassExpression;
                //class nodes have always their own program, so the start is always fresh, means we don't need a frame

                if (node) {
                    const members: ClassElement[] = [];

                    if (narrowed.typeParameters) {
                        for (const typeParameter of narrowed.typeParameters) {
                            const name = getNameAsString(typeParameter.name);
                            if (typeParameter.default) {
                                //push default on the stack
                                this.extractPackStructOfType(typeParameter.default, program);
                            }
                            program.pushTemplateParameter(name, !!typeParameter.default);
                        }
                    }

                    if (narrowed.heritageClauses) {
                        for (const heritage of narrowed.heritageClauses) {
                            if (heritage.token === SyntaxKind.ExtendsKeyword) {
                                for (const extendType of heritage.types) {
                                    program.pushFrame();
                                    if (extendType.typeArguments) {
                                        for (const typeArgument of extendType.typeArguments) {
                                            this.extractPackStructOfType(typeArgument, program);
                                        }
                                    }
                                    const index = program.pushStack(
                                        this.f.createArrowFunction(undefined, undefined, [], undefined, undefined, this.nodeConverter.toExpression(extendType.expression)),
                                    );
                                    program.pushOp(ReflectionOp.classReference, index);
                                    program.popFrameImplicit();
                                }
                            }
                        }
                    }

                    for (const member of narrowed.members) {
                        const name = getNameAsString(member.name);
                        if (name) {
                            const has = members.some(v => getNameAsString(v.name) === name);
                            if (has) continue;
                        }
                        members.push(member);

                        this.extractPackStructOfType(member, program);
                    }

                    program.pushOp(ReflectionOp.class);

                    if (narrowed.heritageClauses) {
                        for (const heritageClause of narrowed.heritageClauses) {
                            if (heritageClause.token === SyntaxKind.ExtendsKeyword) {
                                //extends only supports extending one class
                                const first = heritageClause.types[0];
                                if (isExpressionWithTypeArguments(first) && first.typeArguments) {
                                    for (const typeArgument of first.typeArguments) {
                                        this.extractPackStructOfType(typeArgument, program);
                                    }
                                    program.pushOp(ReflectionOp.classExtends, first.typeArguments.length);
                                }
                            } else if (heritageClause.token === SyntaxKind.ImplementsKeyword) {
                                for (const type of heritageClause.types) {
                                    this.extractPackStructOfTypeReference(type, program);
                                }
                                program.pushOp(ReflectionOp.implements, heritageClause.types.length);
                            }
                        }
                    }

                    if (narrowed.name) this.resolveTypeName(getIdentifierName(narrowed.name), program);

                    // for whatever reason: narrowed.name.parent !== narrowed. narrowed.name.parent has jsDoc, narrowed.name not.
                    const description = extractJSDocAttribute(this.sourceFile, narrowed.name?.parent, 'description');
                    if (description) program.pushOp(ReflectionOp.description, program.findOrAddStackEntry(description));
                }
                break;
            }
            case SyntaxKind.IntersectionType: {
                //TypeScript does not narrow types down
                const narrowed = node as IntersectionTypeNode;
                program.pushFrame();

                for (const type of narrowed.types) {
                    this.extractPackStructOfType(type, program);
                }

                program.pushOp(ReflectionOp.intersection);
                program.popFrameImplicit();
                break;
            }
            case SyntaxKind.MappedType: {
                //TypeScript does not narrow types down
                const narrowed = node as MappedTypeNode;

                //<Type>{[Property in keyof Type]: boolean;};
                program.pushFrame();
                program.pushVariable(getIdentifierName(narrowed.typeParameter.name));

                const constraint = getEffectiveConstraintOfTypeParameter(narrowed.typeParameter);
                if (constraint) {
                    this.extractPackStructOfType(constraint, program);
                } else {
                    program.pushOp(ReflectionOp.never);
                }

                let modifier = 0;
                if (narrowed.questionToken) {
                    if (narrowed.questionToken.kind === SyntaxKind.QuestionToken) {
                        modifier |= MappedModifier.optional;
                    }
                    if (narrowed.questionToken.kind === SyntaxKind.MinusToken) {
                        modifier |= MappedModifier.removeOptional;
                    }
                }
                if (narrowed.readonlyToken) {
                    if (narrowed.readonlyToken.kind === SyntaxKind.ReadonlyKeyword) {
                        modifier |= MappedModifier.readonly;
                    }
                    if (narrowed.readonlyToken.kind === SyntaxKind.MinusToken) {
                        modifier |= MappedModifier.removeReadonly;
                    }
                }
                program.pushCoRoutine();
                if (narrowed.nameType) program.pushFrame();
                if (narrowed.type) {
                    this.extractPackStructOfType(narrowed.type, program);
                } else {
                    program.pushOp(ReflectionOp.never);
                }
                if (narrowed.nameType) {
                    this.extractPackStructOfType(narrowed.nameType, program);
                    program.pushOp(ReflectionOp.tuple);
                    program.popFrameImplicit();
                }
                const coRoutineIndex = program.popCoRoutine();

                if (narrowed.nameType) {
                    program.pushOp(ReflectionOp.mappedType2, coRoutineIndex, modifier);
                } else {
                    program.pushOp(ReflectionOp.mappedType, coRoutineIndex, modifier);
                }

                program.popFrameImplicit();
                break;
            }
            case SyntaxKind.TypeAliasDeclaration: {
                let narrowed = node as TypeAliasDeclaration;

                if (program.sourceFile && getNameAsString(narrowed.name) === 'TypeAnnotation') {
                    const attribute = extractJSDocAttribute(program.sourceFile, narrowed, 'intrinsic');
                    if (attribute !== undefined) {
                        // TypeAnnotation<T> is like an intrinsic type, so we don't need to resolve it
                        narrowed = this.intrinsicMetaDeclaration;
                    }
                }

                this.extractPackStructOfType(narrowed.type, program);
                if (narrowed.name) this.resolveTypeName(getIdentifierName(narrowed.name), program);
                break;
            }
            case SyntaxKind.TypeLiteral:
            case SyntaxKind.InterfaceDeclaration: {
                //TypeScript does not narrow types down
                const narrowed = node as TypeLiteralNode | InterfaceDeclaration;
                let descriptionNode: Node = narrowed;
                program.pushFrame();

                //first all extend expressions
                if (isInterfaceDeclaration(narrowed) && narrowed.heritageClauses) {
                    for (const heritage of narrowed.heritageClauses) {
                        if (heritage.token === SyntaxKind.ExtendsKeyword) {
                            for (const extendType of heritage.types) {
                                this.extractPackStructOfTypeReference(extendType, program);
                            }
                        }
                    }
                }

                for (const member of narrowed.members) {
                    this.extractPackStructOfType(member, program);
                }
                program.pushOp(ReflectionOp.objectLiteral);
                if (isTypeLiteralNode(narrowed)) {
                    descriptionNode = narrowed.parent;
                }
                const description = descriptionNode && extractJSDocAttribute(this.sourceFile, descriptionNode, 'description');
                if (description) program.pushOp(ReflectionOp.description, program.findOrAddStackEntry(description));

                if (isInterfaceDeclaration(narrowed)) {
                    if (narrowed.name) this.resolveTypeName(getIdentifierName(narrowed.name), program);
                }
                program.popFrameImplicit();
                break;
            }
            case SyntaxKind.TypeReference: {
                this.extractPackStructOfTypeReference(node as TypeReferenceNode, program);
                break;
            }
            case SyntaxKind.ArrayType: {
                this.extractPackStructOfType((node as ArrayTypeNode).elementType, program);
                program.pushOp(ReflectionOp.array);
                break;
            }
            case SyntaxKind.RestType: {
                let type = (node as RestTypeNode).type;
                if (isArrayTypeNode(type)) {
                    type = type.elementType;
                }
                this.extractPackStructOfType(type, program);
                program.pushOp(ReflectionOp.rest);
                break;
            }
            case SyntaxKind.TupleType: {
                program.pushFrame();
                for (const element of (node as TupleTypeNode).elements) {
                    if (isOptionalTypeNode(element)) {
                        this.extractPackStructOfType(element.type, program);
                        program.pushOp(ReflectionOp.tupleMember);
                        program.pushOp(ReflectionOp.optional);
                    } else if (isNamedTupleMember(element)) {
                        if (element.dotDotDotToken) {
                            let type = element.type;
                            if (isArrayTypeNode(type)) {
                                type = type.elementType;
                            }
                            this.extractPackStructOfType(type, program);
                            program.pushOp(ReflectionOp.rest);
                        } else {
                            this.extractPackStructOfType(element.type, program);
                        }
                        const index = program.findOrAddStackEntry(getIdentifierName(element.name));
                        program.pushOp(ReflectionOp.namedTupleMember, index);
                        if (element.questionToken) {
                            program.pushOp(ReflectionOp.optional);
                        }
                    } else {
                        this.extractPackStructOfType(element, program);
                    }
                }
                program.pushOp(ReflectionOp.tuple);
                program.popFrameImplicit();
                break;
            }
            case SyntaxKind.PropertySignature: {
                //TypeScript does not narrow types down
                const narrowed = node as PropertySignature;
                if (narrowed.type) {
                    this.extractPackStructOfType(narrowed.type, program);
                    const name = getPropertyName(this.f, narrowed.name);
                    program.pushOp(ReflectionOp.propertySignature, program.findOrAddStackEntry(name));
                    if (narrowed.questionToken) program.pushOp(ReflectionOp.optional);
                    if (hasModifier(narrowed, SyntaxKind.ReadonlyKeyword)) program.pushOp(ReflectionOp.readonly);

                    const description = extractJSDocAttribute(this.sourceFile, narrowed, 'description');
                    if (description) program.pushOp(ReflectionOp.description, program.findOrAddStackEntry(description));
                } else {
                    program.pushOp(ReflectionOp.unknown);
                }
                break;
            }
            case SyntaxKind.PropertyDeclaration: {
                //TypeScript does not narrow types down
                const narrowed = node as PropertyDeclaration;

                // if the property was explicitly marked as `@reflection no`, we ignore it
                if (false === this.getExplicitReflectionMode(program.sourceFile, narrowed)) return;

                if (narrowed.type) {
                    this.extractPackStructOfType(narrowed.type, program);
                } else if (narrowed.initializer) {
                    this.extractPackStructOfExpression(narrowed.initializer, program);
                } else {
                    program.pushOp(ReflectionOp.unknown);
                }

                const name = getPropertyName(this.f, narrowed.name);
                program.pushOp(ReflectionOp.property, program.findOrAddStackEntry(name));

                if (narrowed.questionToken) program.pushOp(ReflectionOp.optional);
                if (hasModifier(narrowed, SyntaxKind.ReadonlyKeyword)) program.pushOp(ReflectionOp.readonly);
                if (hasModifier(narrowed, SyntaxKind.PrivateKeyword)) program.pushOp(ReflectionOp.private);
                if (hasModifier(narrowed, SyntaxKind.ProtectedKeyword)) program.pushOp(ReflectionOp.protected);
                if (hasModifier(narrowed, SyntaxKind.AbstractKeyword)) program.pushOp(ReflectionOp.abstract);
                if (hasModifier(narrowed, SyntaxKind.StaticKeyword)) program.pushOp(ReflectionOp.static);

                if (narrowed.initializer) {
                    //important to use Function, since it will be called using a different `this`
                    program.pushOp(ReflectionOp.defaultValue, program.findOrAddStackEntry(
                        this.f.createFunctionExpression(undefined, undefined, undefined, undefined, undefined, undefined,
                            this.f.createBlock([this.f.createReturnStatement(narrowed.initializer)])),
                    ));
                }

                const description = extractJSDocAttribute(this.sourceFile, narrowed, 'description');
                if (description) program.pushOp(ReflectionOp.description, program.findOrAddStackEntry(description));

                break;
            }
            case SyntaxKind.ConditionalType: {
                //TypeScript does not narrow types down
                const narrowed = node as ConditionalTypeNode;

                // Depending on whether this a distributive conditional type or not, it has to be moved to its own function
                // my understanding of when a distributive conditional type is used is:
                // 1. the `checkType` is a simple identifier (just `T`, no `[T]`, no `T | x`, no `{a: T}`, etc)
                const distributiveOverIdentifier: Identifier | undefined = isTypeReferenceNode(narrowed.checkType) && isIdentifier(narrowed.checkType.typeName)
                    ? narrowed.checkType.typeName : undefined;

                if (distributiveOverIdentifier) {
                    program.pushFrame();
                    //first we add to the stack the origin type we distribute over.
                    this.extractPackStructOfType(narrowed.checkType, program);

                    //since the distributive conditional type is a loop that changes only the found `T`, it is necessary to add that as variable,
                    //so call convention can take over.
                    program.pushVariable(getIdentifierName(distributiveOverIdentifier));
                    program.pushCoRoutine();
                }

                program.pushConditionalFrame(); //gets its own frame for `infer T` ops. all infer variables will be registered in this frame
                this.extractPackStructOfType(narrowed.checkType, program);
                this.extractPackStructOfType(narrowed.extendsType, program);

                program.pushOp(ReflectionOp.extends);

                program.pushCoRoutine();
                this.extractPackStructOfType(narrowed.trueType, program);
                const trueProgram = program.popCoRoutine();

                program.pushCoRoutine();
                this.extractPackStructOfType(narrowed.falseType, program);
                const falseProgram = program.popCoRoutine();

                program.pushOp(ReflectionOp.jumpCondition, trueProgram, falseProgram);
                program.moveFrame(); //pops frame

                if (distributiveOverIdentifier) {
                    const coRoutineIndex = program.popCoRoutine();
                    program.pushOp(ReflectionOp.distribute, coRoutineIndex);
                    program.popFrameImplicit();
                }
                break;
            }
            case SyntaxKind.InferType: {
                //TypeScript does not narrow types down
                const narrowed = node as InferTypeNode;

                const frame = program.findConditionalFrame();
                if (frame) {
                    const typeParameterName = getIdentifierName(narrowed.typeParameter.name);
                    let variable = program.findVariable(typeParameterName);
                    if (!variable) {
                        program.pushVariable(typeParameterName, frame);
                        variable = program.findVariable(typeParameterName);
                        if (!variable) throw new Error('Could not find inserted infer variable');
                    }
                    program.pushOp(ReflectionOp.infer, variable.frameOffset, variable.stackIndex);
                } else {
                    program.pushOp(ReflectionOp.never);
                }
                break;
            }
            case SyntaxKind.MethodSignature:
            case SyntaxKind.MethodDeclaration:
            case SyntaxKind.Constructor:
            case SyntaxKind.ArrowFunction:
            case SyntaxKind.FunctionExpression:
            case SyntaxKind.ConstructSignature:
            case SyntaxKind.ConstructorType:
            case SyntaxKind.FunctionType:
            case SyntaxKind.CallSignature:
            case SyntaxKind.FunctionDeclaration: {
                //TypeScript does not narrow types down
                const narrowed = node as MethodSignature | MethodDeclaration | CallSignatureDeclaration | ConstructorTypeNode
                    | ConstructSignatureDeclaration | ConstructorDeclaration | ArrowFunction | FunctionExpression | FunctionTypeNode | FunctionDeclaration;

                // if the function was explicitly marked as `@reflection no`, we ignore it
                if (false === this.getExplicitReflectionMode(program.sourceFile, narrowed)) {
                    program.pushOp(ReflectionOp.any);
                    return;
                }

                const name = isCallSignatureDeclaration(node)
                    ? '' : isConstructorTypeNode(narrowed) || isConstructSignatureDeclaration(node)
                        ? 'new' : isConstructorDeclaration(narrowed) ? 'constructor' : getPropertyName(this.f, narrowed.name);
                if (!narrowed.type && narrowed.parameters.length === 0 && !name) return;

                program.pushFrame();
                for (let i = 0; i < narrowed.parameters.length; i++) {
                    const parameter = narrowed.parameters[i];
                    const parameterName = isIdentifier(parameter.name) ? getNameAsString(parameter.name) : 'param' + i;

                    const type = parameter.type
                        ? (parameter.dotDotDotToken && isArrayTypeNode(parameter.type) ? parameter.type.elementType : parameter.type) : undefined;

                    if (type) {
                        this.extractPackStructOfType(type, program);
                    } else {
                        program.pushOp(ReflectionOp.any);
                    }

                    if (parameter.dotDotDotToken) {
                        program.pushOp(ReflectionOp.rest);
                    }

                    program.pushOp(ReflectionOp.parameter, program.findOrAddStackEntry(parameterName));

                    if (parameter.questionToken) program.pushOp(ReflectionOp.optional);
                    if (hasModifier(parameter, SyntaxKind.PublicKeyword)) program.pushOp(ReflectionOp.public);
                    if (hasModifier(parameter, SyntaxKind.PrivateKeyword)) program.pushOp(ReflectionOp.private);
                    if (hasModifier(parameter, SyntaxKind.ProtectedKeyword)) program.pushOp(ReflectionOp.protected);
                    if (hasModifier(parameter, SyntaxKind.ReadonlyKeyword)) program.pushOp(ReflectionOp.readonly);
                    const description = extractJSDocAttribute(this.sourceFile, parameter, 'description');
                    if (description) program.pushOp(ReflectionOp.description, program.findOrAddStackEntry(description));
                    if (parameter.initializer && parameter.type && !getReceiveTypeParameter(parameter.type)) {
                        program.pushOp(
                            ReflectionOp.defaultValue,
                            program.findOrAddStackEntry(this.f.createArrowFunction(undefined, undefined, [], undefined, undefined, parameter.initializer)),
                        );
                    }
                }

                if (narrowed.type) {
                    this.extractPackStructOfType(narrowed.type, program);
                } else {
                    program.pushOp(ReflectionOp.any);
                }

                program.pushOp(
                    isCallSignatureDeclaration(node) ? ReflectionOp.callSignature :
                        isMethodSignature(narrowed) || isConstructSignatureDeclaration(narrowed)
                            ? ReflectionOp.methodSignature
                            : isMethodDeclaration(narrowed) || isConstructorDeclaration(narrowed)
                                ? ReflectionOp.method : ReflectionOp.function, program.findOrAddStackEntry(name),
                );

                if ((isMethodSignature(narrowed) || isMethodDeclaration(narrowed)) && narrowed.questionToken) {
                    program.pushOp(ReflectionOp.optional);
                }

                if (isMethodDeclaration(narrowed)) {
                    if (hasModifier(narrowed, SyntaxKind.PrivateKeyword)) program.pushOp(ReflectionOp.private);
                    if (hasModifier(narrowed, SyntaxKind.ProtectedKeyword)) program.pushOp(ReflectionOp.protected);
                    if (hasModifier(narrowed, SyntaxKind.AbstractKeyword)) program.pushOp(ReflectionOp.abstract);
                    if (hasModifier(narrowed, SyntaxKind.StaticKeyword)) program.pushOp(ReflectionOp.static);
                }
                const description = extractJSDocAttribute(this.sourceFile, narrowed, 'description');
                if (description) program.pushOp(ReflectionOp.description, program.findOrAddStackEntry(description));
                program.popFrameImplicit();
                break;
            }
            case SyntaxKind.LiteralType: {
                //TypeScript does not narrow types down
                const narrowed = node as LiteralTypeNode;

                if (narrowed.literal.kind === SyntaxKind.NullKeyword) {
                    program.pushOp(ReflectionOp.null);
                } else {
                    program.pushOp(ReflectionOp.literal, program.findOrAddStackEntry(narrowed.literal));
                }
                break;
            }
            case SyntaxKind.TemplateLiteralType: {
                //TypeScript does not narrow types down
                const narrowed = node as TemplateLiteralTypeNode;

                program.pushFrame();
                if (narrowed.head.rawText) {
                    program.pushOp(ReflectionOp.literal, program.findOrAddStackEntry(narrowed.head.rawText));
                }

                for (const span of narrowed.templateSpans) {
                    this.extractPackStructOfType(span.type, program);
                    if (span.literal.rawText) {
                        program.pushOp(ReflectionOp.literal, program.findOrAddStackEntry(span.literal.rawText));
                    }
                }

                program.pushOp(ReflectionOp.templateLiteral);
                program.popFrameImplicit();

                break;
            }
            case SyntaxKind.UnionType: {
                //TypeScript does not narrow types down
                const narrowed = node as UnionTypeNode;

                if (narrowed.types.length === 0) {
                    //nothing to emit
                } else if (narrowed.types.length === 1) {
                    //only emit the type
                    this.extractPackStructOfType(narrowed.types[0], program);
                } else {
                    program.pushFrame();

                    for (const subType of narrowed.types) {
                        this.extractPackStructOfType(subType, program);
                    }

                    program.pushOp(ReflectionOp.union);
                    program.popFrameImplicit();
                }
                break;
            }
            case SyntaxKind.EnumDeclaration: {
                //TypeScript does not narrow types down
                const narrowed = node as EnumDeclaration;
                program.pushFrame();

                for (const type of narrowed.members) {
                    const name = getPropertyName(this.f, type.name);
                    program.pushOp(ReflectionOp.enumMember, program.findOrAddStackEntry(name));
                    if (type.initializer) {
                        program.pushOp(
                            ReflectionOp.defaultValue,
                            program.findOrAddStackEntry(this.f.createArrowFunction(undefined, undefined, [], undefined, undefined, type.initializer)),
                        );
                    }
                }
                program.pushOp(ReflectionOp.enum);
                const description = extractJSDocAttribute(this.sourceFile, narrowed, 'description');
                if (description) program.pushOp(ReflectionOp.description, program.findOrAddStackEntry(description));
                if (narrowed.name) this.resolveTypeName(getIdentifierName(narrowed.name), program);
                program.popFrameImplicit();
                break;
            }
            case SyntaxKind.IndexSignature: {
                //TypeScript does not narrow types down
                const narrowed = node as IndexSignatureDeclaration;

                //node.parameters = first item is {[name: string]: number} => 'name: string'
                if (narrowed.parameters.length && narrowed.parameters[0].type) {
                    this.extractPackStructOfType(narrowed.parameters[0].type, program);
                } else {
                    program.pushOp(ReflectionOp.any);
                }

                //node.type = first item is {[name: string]: number} => 'number'
                this.extractPackStructOfType(narrowed.type, program);
                program.pushOp(ReflectionOp.indexSignature);
                break;
            }
            case SyntaxKind.TypeQuery: {
                //TypeScript does not narrow types down
                const narrowed = node as TypeQueryNode;

                // if (program.importSpecifier) {
                //     //if this is set, the current program is embedded into another file. All locally used symbols like a variable in `typeof` need to be imported
                //     //in the other file as well.
                //     if (isIdentifier(narrowed.exprName)) {
                //         const originImportStatement = program.importSpecifier.parent.parent.parent;
                //         this.addImports.push({ identifier: narrowed.exprName, from: originImportStatement.moduleSpecifier });
                //     }
                // }
                if (isIdentifier(narrowed.exprName)) {
                    const resolved = this.resolveDeclaration(narrowed.exprName);
                    if (resolved && findSourceFile(resolved.declaration) !== this.sourceFile && resolved.importDeclaration) {
                        ensureImportIsEmitted(resolved.importDeclaration, narrowed.exprName);
                    }
                }

                const expression = serializeEntityNameAsExpression(this.f, narrowed.exprName);
                program.pushOp(ReflectionOp.typeof, program.pushStack(this.f.createArrowFunction(undefined, undefined, [], undefined, undefined, expression)));
                break;
            }
            case SyntaxKind.TypeOperator: {
                //TypeScript does not narrow types down
                const narrowed = node as TypeOperatorNode;

                if (narrowed.type.kind === SyntaxKind.ThisType) {
                    //for the moment we treat `keyof this` as any, since `this` is not implemented at all.
                    //this makes it possible that the code above works at least.
                    program.pushOp(ReflectionOp.any);
                    break;
                }

                switch (narrowed.operator) {
                    case SyntaxKind.KeyOfKeyword: {
                        this.extractPackStructOfType(narrowed.type, program);
                        program.pushOp(ReflectionOp.keyof);
                        break;
                    }
                    case SyntaxKind.ReadonlyKeyword: {
                        this.extractPackStructOfType(narrowed.type, program);
                        program.pushOp(ReflectionOp.readonly);
                        break;
                    }
                    default: {
                        program.pushOp(ReflectionOp.never);
                    }
                }
                break;
            }
            case SyntaxKind.IndexedAccessType: {
                //TypeScript does not narrow types down
                const narrowed = node as IndexedAccessTypeNode;

                this.extractPackStructOfType(narrowed.objectType, program);
                this.extractPackStructOfType(narrowed.indexType, program);
                program.pushOp(ReflectionOp.indexAccess);
                break;
            }
            case SyntaxKind.Identifier: {
                //TypeScript does not narrow types down
                const narrowed = node as Identifier;

                //check if it references a variable
                const variable = program.findVariable(getIdentifierName(narrowed));
                if (variable) {
                    program.pushOp(ReflectionOp.loads, variable.frameOffset, variable.stackIndex);
                } else {
                    program.pushOp(ReflectionOp.never);
                }
                break;
            }
            default: {
                program.pushOp(ReflectionOp.never);
            }
        }
    }

    protected knownClasses: { [name: string]: ReflectionOp } = {
        'Int8Array': ReflectionOp.int8Array,
        'Uint8Array': ReflectionOp.uint8Array,
        'Uint8ClampedArray': ReflectionOp.uint8ClampedArray,
        'Int16Array': ReflectionOp.int16Array,
        'Uint16Array': ReflectionOp.uint16Array,
        'Int32Array': ReflectionOp.int32Array,
        'Uint32Array': ReflectionOp.uint32Array,
        'Float32Array': ReflectionOp.float32Array,
        'Float64Array': ReflectionOp.float64Array,
        'ArrayBuffer': ReflectionOp.arrayBuffer,
        'BigInt64Array': ReflectionOp.bigInt64Array,
        'Date': ReflectionOp.date,
        'RegExp': ReflectionOp.regexp,
        'String': ReflectionOp.string,
        'Number': ReflectionOp.number,
        'BigInt': ReflectionOp.bigint,
        'Boolean': ReflectionOp.boolean,
    };

    protected getGlobalLibs(): SourceFile[] {
        if (this.cache.globalSourceFiles) return this.cache.globalSourceFiles;

        this.cache.globalSourceFiles = [];

        //todo also read compiler options "types" + typeRoot

        //currently knownLibFilesForCompilerOptions from @typescript/vfs doesn't return correct lib files for esnext,
        //so we switch here to es2022 if bigger than es2022.
        const options = { ...this.compilerOptions };
        if (options.target && (options.target === ScriptTarget.ESNext)) {
            options.target = ScriptTarget.ES2022;
        }
        const libs = knownLibFilesForCompilerOptions(options, ts);

        for (const lib of libs) {
            if (this.isExcluded(lib)) continue;
            const sourceFile = this.resolver.resolveSourceFile(this.sourceFile, this.f.createStringLiteral('typescript/lib/' + lib.replace('.d.ts', '')));
            if (!sourceFile) continue;
            this.cache.globalSourceFiles.push(sourceFile);
        }
        return this.cache.globalSourceFiles;
    }

    /**
     * This is a custom resolver based on populated `locals` from the binder. It uses a custom resolution algorithm since
     * we have no access to the binder/TypeChecker directly and instantiating a TypeChecker per file/transformer is incredible slow.
     */
    protected resolveDeclaration(typeName: EntityName): { declaration: Node, importDeclaration?: ImportDeclaration | JSDocImportTag, typeOnly?: boolean } | void {
        let current: Node = typeName.parent;
        if (typeName.kind === SyntaxKind.QualifiedName) return; //namespace access not supported yet, e.g. type a = Namespace.X;

        let declaration: Node | undefined = undefined;

        while (current) {
            if (isNodeWithLocals(current) && current.locals) {
                const found = current.locals.get(typeName.escapedText);
                if (found && found.declarations && found.declarations[0]) {
                    /**
                     * Discard parameters, since they can not be referenced from inside
                     *
                     * ```typescript
                     * type B = string;
                     * function a(B: B) {}
                     *
                     * class A {
                     *    constructor(B: B) {}
                     * }
                     * ```
                     *
                     */
                    if (!isParameter(found.declarations[0])) {
                        declaration = found.declarations[0];
                        break;
                    }
                }
            }

            if (current.kind === SyntaxKind.SourceFile) break;
            current = current.parent;
        }

        if (!declaration) {
            // look in globals, read through all files, see checker.ts initializeTypeChecker
            for (const file of this.getGlobalLibs()) {
                const globals = getGlobalsOfSourceFile(file);
                if (!globals) continue;
                const symbol = globals.get(typeName.escapedText);
                if (symbol && symbol.declarations && symbol.declarations[0]) {
                    declaration = symbol.declarations[0];
                    // console.log('found global', typeName.escapedText, 'in', file.fileName);
                    break;
                }
            }
        }

        let importDeclaration: ImportDeclaration | JSDocImportTag | undefined = undefined;
        let typeOnly = false;

        if (declaration && isImportSpecifier(declaration)) {
            if (declaration.isTypeOnly) typeOnly = true;
            importDeclaration = declaration.parent.parent.parent;
        } else if (declaration && isImportDeclaration(declaration)) {
            // declaration = this.resolveImportSpecifier(typeName.escapedText, declaration);
            importDeclaration = declaration;
        } else if (declaration && isImportClause(declaration)) {
            importDeclaration = declaration.parent;
        }

        if (importDeclaration) {
            if (importDeclaration.importClause && importDeclaration.importClause.isTypeOnly) typeOnly = true;
            declaration = this.resolveImportSpecifier(getEscapedText(typeName), importDeclaration, this.sourceFile);
        }

        if (declaration && declaration.kind === SyntaxKind.TypeParameter && declaration.parent.kind === SyntaxKind.TypeAliasDeclaration) {
            //for alias like `type MyAlias<T> = T`, `T` is returned from `typeChecker.getDeclaredTypeOfSymbol(symbol)`.
            declaration = declaration.parent as TypeAliasDeclaration;
        }

        if (!declaration) return;

        return { declaration, importDeclaration, typeOnly };
    }

    protected getDeclarationVariableName(typeName: EntityName): Identifier {
        if (isIdentifier(typeName)) {
            return this.f.createIdentifier('__Ω' + getIdentifierName(typeName));
        }

        function joinQualifiedName(name: EntityName): string {
            if (isIdentifier(name)) return getIdentifierName(name);
            return joinQualifiedName(name.left) + '_' + getIdentifierName(name.right);
        }

        return this.f.createIdentifier('__Ω' + joinQualifiedName(typeName));
    }

    /**
     * The semantic of isExcluded is different from checking if the fileName is part
     * of reflection config option. isExcluded checks if the file should be excluded
     * via the exclude option. mainly used to exclude globals and external libraries.
     */
    protected isExcluded(fileName: string): boolean {
        // getConfigResolver depends on the current source file, so we know the "exclude" option from deepkit config
        const resolver = this.overriddenConfigResolver || getConfigResolver(this.cache.resolver, this.parseConfigHost, this.compilerOptions, this.sourceFile);
        const res = reflectionModeMatcher({ reflection: 'default', exclude: resolver.config.exclude }, fileName);
        return res === 'never';
    }

    protected extractPackStructOfTypeReference(type: TypeReferenceNode | ExpressionWithTypeArguments, program: CompilerProgram): void {
        const typeName: EntityName | undefined = isTypeReferenceNode(type) ? type.typeName : (isIdentifier(type.expression) ? type.expression : undefined);
        if (!typeName) {
            program.pushOp(ReflectionOp.any);
            return;
        }

        if (isIdentifier(typeName) && getIdentifierName(typeName) === 'InlineRuntimeType' && type.typeArguments && type.typeArguments[0] && isTypeQueryNode(type.typeArguments[0])) {
            const expression = serializeEntityNameAsExpression(this.f, type.typeArguments[0].exprName);
            program.pushOp(ReflectionOp.arg, program.pushStack(expression));
            return;
        }

        if (isIdentifier(typeName) && getIdentifierName(typeName) !== 'constructor' && this.knownClasses[getIdentifierName(typeName)]) {
            const name = getIdentifierName(typeName);
            const op = this.knownClasses[name];
            program.pushOp(op);
        } else if (isIdentifier(typeName) && getIdentifierName(typeName) === 'Promise') {
            //promise has always one sub type
            if (type.typeArguments && type.typeArguments[0]) {
                this.extractPackStructOfType(type.typeArguments[0], program);
            } else {
                program.pushOp(ReflectionOp.any);
            }
            program.pushOp(ReflectionOp.promise);
        } else if (isIdentifier(typeName) && getIdentifierName(typeName) === 'integer') {
            program.pushOp(ReflectionOp.numberBrand, TypeNumberBrand.integer as number);
        } else if (isIdentifier(typeName) && getIdentifierName(typeName) !== 'constructor' && TypeNumberBrand[getIdentifierName(typeName) as any] !== undefined) {
            program.pushOp(ReflectionOp.numberBrand, TypeNumberBrand[getIdentifierName(typeName) as any] as any);
        } else {
            //check if it references a variable
            if (isIdentifier(typeName)) {
                const variable = program.findVariable(getIdentifierName(typeName));
                if (variable) {
                    program.pushOp(ReflectionOp.loads, variable.frameOffset, variable.stackIndex);
                    return;
                }
            } else if (isInferTypeNode(typeName)) {
                this.extractPackStructOfType(typeName, program);
                return;
            }

            const resolved = this.resolveDeclaration(typeName);

            if (!resolved) {
                //maybe reference to enum
                if (isQualifiedName(typeName)) {
                    if (isIdentifier(typeName.left)) {
                        const resolved = this.resolveDeclaration(typeName.left);
                        if (resolved && isEnumDeclaration(resolved.declaration)) {
                            let lastExpression: Expression | undefined;
                            let indexValue: number = 0;
                            for (const member of resolved.declaration.members) {
                                if (getNameAsString(member.name) === getNameAsString(typeName.right)) {
                                    if (member.initializer) {
                                        program.pushOp(ReflectionOp.arg, program.pushStack(this.nodeConverter.toExpression(member.initializer)));
                                    } else if (lastExpression) {
                                        const exp = this.nodeConverter.toExpression(lastExpression);
                                        program.pushOp(ReflectionOp.arg, program.pushStack(
                                            this.f.createBinaryExpression(exp, SyntaxKind.PlusToken, this.nodeConverter.toExpression(indexValue)),
                                        ));
                                    } else {
                                        program.pushOp(ReflectionOp.arg, program.pushStack(this.nodeConverter.toExpression(indexValue)));
                                    }
                                    return;
                                } else {
                                    indexValue++;
                                    if (member.initializer) {
                                        lastExpression = member.initializer;
                                        //restart index
                                        indexValue = 0;
                                    }
                                }
                            }
                        }
                    }
                }

                //non-existing references are ignored.
                program.pushOp(ReflectionOp.never);
                debug2(`Could not resolve ${getNameAsString(typeName)} in ${program.sourceFile?.fileName || 'intrinsic'}`);
                return;
            }

            let declaration: Node = resolved.declaration;
            const declarationSourceFile = findSourceFile(declaration);

            // if (!declarationSourceFile) {
            //     program.pushOp(ReflectionOp.never);
            //     debug2(`Could not find source file for ${getNameAsString(typeName)} in ${program.sourceFile.fileName}`);
            //     return;
            // }

            const isGlobal = !declarationSourceFile || (resolved.importDeclaration === undefined && declarationSourceFile.fileName !== this.sourceFile.fileName);
            const isFromImport = resolved.importDeclaration !== undefined;

            if (isVariableDeclaration(declaration)) {
                if (declaration.type) {
                    declaration = declaration.type;
                } else if (declaration.initializer) {
                    declaration = declaration.initializer;
                }
            }

            if (isModuleDeclaration(declaration) && resolved.importDeclaration) {
                if (isIdentifier(typeName)) ensureImportIsEmitted(resolved.importDeclaration, typeName);

                //we can not infer from module declaration, so do `typeof T` in runtime
                program.pushOp(
                    ReflectionOp.typeof,
                    program.pushStack(this.f.createArrowFunction(undefined, undefined, [], undefined, undefined, serializeEntityNameAsExpression(this.f, typeName))),
                );
            } else if (isTypeAliasDeclaration(declaration) || isInterfaceDeclaration(declaration) || isEnumDeclaration(declaration)) {
                //Set/Map are interface declarations
                const name = getNameAsString(typeName);
                if (name === 'Array') {
                    if (type.typeArguments && type.typeArguments[0]) {
                        this.extractPackStructOfType(type.typeArguments[0], program);
                    } else {
                        program.pushOp(ReflectionOp.any);
                    }

                    program.pushOp(ReflectionOp.array);
                    return;
                } else if (name === 'Function') {
                    program.pushFrame();
                    const index = program.pushStack(this.f.createArrowFunction(undefined, undefined, [], undefined, undefined, this.f.createIdentifier('Function')));
                    program.pushOp(ReflectionOp.functionReference, index);
                    program.popFrameImplicit();
                    return;
                } else if (name === 'Set') {
                    if (type.typeArguments && type.typeArguments[0]) {
                        this.extractPackStructOfType(type.typeArguments[0], program);
                    } else {
                        program.pushOp(ReflectionOp.any);
                    }
                    program.pushOp(ReflectionOp.set);
                    return;
                } else if (name === 'Map') {
                    if (type.typeArguments && type.typeArguments[0]) {
                        this.extractPackStructOfType(type.typeArguments[0], program);
                    } else {
                        program.pushOp(ReflectionOp.any);
                    }
                    if (type.typeArguments && type.typeArguments[1]) {
                        this.extractPackStructOfType(type.typeArguments[1], program);
                    } else {
                        program.pushOp(ReflectionOp.any);
                    }
                    program.pushOp(ReflectionOp.map);
                    return;
                }

                const runtimeTypeName = this.getDeclarationVariableName(typeName);

                //to break recursion, we track which declaration has already been compiled
                if (!this.compiledDeclarations.has(declaration) && !this.compileDeclarations.has(declaration)) {
                    if (declarationSourceFile && this.isExcluded(declarationSourceFile.fileName)) {
                        program.pushOp(ReflectionOp.any);
                        return;
                    }

                    if (isGlobal) {
                        //we don't embed non-global imported declarations anymore, only globals
                        this.embedDeclarations.set(declaration, {
                            name: typeName,
                            sourceFile: declarationSourceFile,
                        });
                    } else if (isFromImport) {
                        if (resolved.importDeclaration) {
                            //if explicit `import {type T}`, we do not emit an import and instead push any
                            if (resolved.typeOnly) {
                                this.resolveTypeOnlyImport(typeName, program);
                                return;
                            }

                            // debug('import', getNameAsString(typeName), 'from',
                            //     (resolved.importDeclaration.moduleSpecifier as StringLiteral).text, ' in', program.sourceFile.fileName);

                            // Previously we checked for tsconfig.json/package.json with a "reflection" option.
                            // This is now changed, and we look directly if there is a __Ω{name} exported.
                            // If so, then we can be 100% sure that the referenced module is built with runtime types.
                            // Note that if `found` is a TypeScript file (not d.ts), then we need to check using the fileName
                            // since it is part of the current transpilation phase. Thus, it depends on the
                            // current config + @reflection decorator instead.
                            if (declarationSourceFile.fileName.endsWith('.d.ts')) {
                                // Note that if import was something like `import { XY } from 'my-module'` then resolve()
                                // returns the index.d.ts file of the module, not the actual file where XY is exported.
                                // this is necessary since we emit an additional import `import { __ΩXY } from 'my-module'`,
                                // so we check if whatever file we get from resolve() actually exports __ΩXY.
                                const resolverDecVariable = this.resolveImportSpecifier(
                                    getEscapedText(runtimeTypeName),
                                    resolved.importDeclaration,
                                    this.sourceFile,
                                );

                                if (!resolverDecVariable) {
                                    debug2(`Symbol ${runtimeTypeName.escapedText} not found in ${declarationSourceFile.fileName}`);
                                    //no __Ω{name} exported, so we can not be sure if the module is built with runtime types
                                    this.resolveTypeOnlyImport(typeName, program);
                                    return;
                                }

                                this.addImports.push({ identifier: runtimeTypeName, importDeclaration: resolved.importDeclaration });
                            } else {
                                const reflection = this.getReflectionConfig(declarationSourceFile);
                                // if this is never, then its generally disabled for this file
                                if (reflection.mode === 'never') {
                                    this.resolveTypeOnlyImport(typeName, program);
                                    return;
                                }

                                const declarationReflection = this.isWithReflection(declarationSourceFile, declaration);
                                if (!declarationReflection) {
                                    this.resolveTypeOnlyImport(typeName, program);
                                    return;
                                }

                                this.addImports.push({ identifier: runtimeTypeName, importDeclaration: resolved.importDeclaration });
                            }
                        }
                    } else {
                        //it's a reference type inside the same file. Make sure its type is reflected
                        const reflection = this.isWithReflection(program.sourceFile, declaration);
                        if (!reflection) {
                            this.resolveTypeOnlyImport(typeName, program);
                            return;
                        }

                        this.compileDeclarations.set(declaration, {
                            name: typeName,
                            sourceFile: declarationSourceFile,
                        });
                    }
                }

                const index = program.pushStack(
                    program.forNode === declaration ? 0 : this.f.createArrowFunction(undefined, undefined, [], undefined, undefined, runtimeTypeName),
                );
                if (type.typeArguments) {
                    for (const argument of type.typeArguments) {
                        this.extractPackStructOfType(argument, program);
                    }
                    program.pushOp(ReflectionOp.inlineCall, index, type.typeArguments.length);
                } else {
                    program.pushOp(ReflectionOp.inline, index);
                }

                // if (type.typeArguments) {
                //     for (const argument of type.typeArguments) {
                //         this.extractPackStructOfType(argument, program);
                //     }
                //     program.pushOp(ReflectionOp.inlineCall, index, type.typeArguments.length);
                // } else {
                //     program.pushOp(ReflectionOp.inline, index);
                // }
                // } else if (isTypeLiteralNode(declaration)) {
                //     this.extractPackStructOfType(declaration, program);
                //     return;
                // } else if (isMappedTypeNode(declaration)) {
                //     //<Type>{[Property in keyof Type]: boolean;};
                //     this.extractPackStructOfType(declaration, program);
                //     return;
            } else if (isClassDeclaration(declaration) || isFunctionDeclaration(declaration) || isFunctionExpression(declaration) || isArrowFunction(declaration)) {
                // classes, functions and arrow functions are handled differently, since they exist in runtime.

                //if explicit `import {type T}`, we do not emit an import and instead push any
                if (resolved.typeOnly) {
                    this.resolveTypeOnlyImport(typeName, program);
                    return;
                }

                // If a function/class declarations comes from a built library (e.g. node_modules), then we
                // declarationSourceFile is a d.ts file. We do know if they are built in runtime by checking `xy.__type`.
                // Otherwise, check if the file will be built with runtime types.
                const reflection = declarationSourceFile?.fileName.endsWith('.d.ts') || this.isWithReflection(program.sourceFile, declaration);
                if (!reflection) {
                    this.resolveTypeOnlyImport(typeName, program);
                    return;
                }

                if (resolved.importDeclaration && isIdentifier(typeName)) ensureImportIsEmitted(resolved.importDeclaration, typeName);
                program.pushFrame();
                if (type.typeArguments) {
                    for (const typeArgument of type.typeArguments) {
                        this.extractPackStructOfType(typeArgument, program);
                    }
                }
                const body = isIdentifier(typeName) ? typeName : this.createAccessorForEntityName(typeName);
                const index = program.pushStack(this.f.createArrowFunction(undefined, undefined, [], undefined, undefined, body));
                program.pushOp(isClassDeclaration(declaration) ? ReflectionOp.classReference : ReflectionOp.functionReference, index);
                program.popFrameImplicit();
            } else if (isTypeParameterDeclaration(declaration)) {
                this.resolveTypeParameter(declaration, type, program);
            } else {
                this.extractPackStructOfType(declaration, program);
            }
        }
    }

    /**
     * Returns the class declaration, function/arrow declaration, or block where type was used.
     */
    protected getTypeUser(type: Node): Node {
        let current: Node = type;
        while (current) {
            if (current.kind === SyntaxKind.Block) return current; //return the block
            if (current.kind === SyntaxKind.ClassDeclaration) return current; //return the class
            if (current.kind === SyntaxKind.ClassExpression) return current; //return the class
            if (current.kind === SyntaxKind.Constructor) return current.parent; //return the class
            if (current.kind === SyntaxKind.MethodDeclaration) return current.parent; //return the class
            if (current.kind === SyntaxKind.ArrowFunction || current.kind === SyntaxKind.FunctionDeclaration || current.kind === SyntaxKind.FunctionExpression) return current;

            current = current.parent;
        }
        return current;
    }

    /**
     * With this function we want to check if `type` is used in the signature itself from the parent of `declaration`.
     * If so, we do not try to infer the type from runtime values.
     *
     * Examples where we do not infer from runtime, `type` being `T` and `declaration` being `<T>` (return false):
     *
     * ```typescript
     * class User<T> {
     *     config: T;
     * }
     *
     * class User<T> {
     *    constructor(public config: T) {}
     * }
     *
     * function do<T>(item: T): void {}
     * function do<T>(item: T): T {}
     * ```
     *
     * Examples where we infer from runtime (return true):
     *
     * ```typescript
     * function do<T>(item: T) {
     *     return typeOf<T>; //<-- because of that
     * }
     *
     * function do<T>(item: T) {
     *     class A {
     *         config: T; //<-- because of that
     *     }
     *     return A;
     * }
     *
     * function do<T>(item: T) {
     *     class A {
     *         doIt() {
     *             class B {
     *                 config: T; //<-- because of that
     *             }
     *             return B;
     *         }
     *     }
     *     return A;
     * }
     *
     * function do<T>(item: T) {
     *     class A {
     *         doIt(): T { //<-- because of that
     *         }
     *     }
     *     return A;
     * }
     * ```
     */
    protected needsToBeInferred(declaration: TypeParameterDeclaration, type: TypeReferenceNode | ExpressionWithTypeArguments): boolean {
        const declarationUser = this.getTypeUser(declaration);
        const typeUser = this.getTypeUser(type);

        return declarationUser !== typeUser;
    }

    protected resolveTypeOnlyImport(entityName: EntityName, program: CompilerProgram) {
        program.pushOp(ReflectionOp.any);
        const typeName = ts.isIdentifier(entityName)
            ? getIdentifierName(entityName)
            : getIdentifierName(entityName.right);
        this.resolveTypeName(typeName, program);
    }

    protected resolveTypeName(typeName: string, program: CompilerProgram) {
        if (!typeName) return;
        program.pushOp(ReflectionOp.typeName, program.findOrAddStackEntry(typeName));
    }

    protected resolveTypeParameter(declaration: TypeParameterDeclaration, type: TypeReferenceNode | ExpressionWithTypeArguments, program: CompilerProgram) {
        //check if `type` was used in an expression. if so, we need to resolve it from runtime, otherwise we mark it as T
        const isUsedInFunction = isFunctionLike(declaration.parent);
        const resolveRuntimeTypeParameter = (isUsedInFunction && program.isResolveFunctionParameters(declaration.parent)) || (this.needsToBeInferred(declaration, type));

        if (resolveRuntimeTypeParameter) {
            //go through all parameters and look where `type.name.escapedText` is used (recursively).
            //go through all found parameters and replace `T` with `infer T` and embed its type in `typeof parameter extends Type<infer T> ? T : never`, if T is not directly used
            const argumentName = declaration.name.escapedText as string; //T
            const foundUsers: { type: Node, parameterName: Identifier }[] = [];

            if (isUsedInFunction) {
                for (const parameter of (declaration.parent as SignatureDeclaration).parameters) {
                    if (!parameter.type) continue;
                    //if deeply available?
                    let found = false;
                    const searchArgument = (node: Node): Node => {
                        node = visitEachChild(node, searchArgument, this.context);

                        if (isIdentifier(node) && node.escapedText === argumentName) {
                            //transform to infer T
                            found = true;
                            node = this.f.createInferTypeNode(declaration);
                        }

                        return node;
                    };

                    if (isIdentifier(parameter.name)) {
                        const updatedParameterType = visitEachChild(parameter.type, searchArgument, this.context);
                        if (found) {
                            foundUsers.push({ type: updatedParameterType, parameterName: parameter.name });
                        }
                    }
                }
            }

            if (foundUsers.length) {
                //todo: if there are multiple infers, we need to create an intersection
                if (foundUsers.length > 1) {
                    //todo: intersection start
                }

                const isReceiveType = foundUsers.find(v => isTypeReferenceNode(v.type) && isIdentifier(v.type.typeName) && getIdentifierName(v.type.typeName) === 'ReceiveType');
                if (isReceiveType) {
                    // If it's used in ReceiveType<T>, then we can just use T directly without trying to infer it from ReceiveType<T> itself
                    program.pushOp(ReflectionOp.inline, program.pushStack(isReceiveType.parameterName));
                } else {
                    for (const foundUser of foundUsers) {
                        program.pushConditionalFrame();

                        program.pushOp(ReflectionOp.typeof, program.pushStack(this.f.createArrowFunction(undefined, undefined, [], undefined, undefined, foundUser.parameterName)));
                        this.extractPackStructOfType(foundUser.type, program);
                        program.pushOp(ReflectionOp.extends);

                        const found = program.findVariable(getIdentifierName(declaration.name));
                        if (found) {
                            this.extractPackStructOfType(declaration.name, program);
                        } else {
                            //type parameter was never found in X of `Y extends X` (no `infer X` was created), probably due to a not supported parameter type expression.
                            program.pushOp(ReflectionOp.any);
                        }
                        this.extractPackStructOfType({ kind: SyntaxKind.NeverKeyword } as TypeNode, program);
                        program.pushOp(ReflectionOp.condition);
                        program.popFrameImplicit();
                    }
                }

                if (foundUsers.length > 1) {
                    //todo: intersection end
                }

            } else if (declaration.constraint) {
                if (isUsedInFunction) program.resolveFunctionParametersIncrease(declaration.parent);
                const constraint = getEffectiveConstraintOfTypeParameter(declaration);
                if (constraint) {
                    this.extractPackStructOfType(constraint, program);
                } else {
                    program.pushOp(ReflectionOp.never);
                }
                if (isUsedInFunction) program.resolveFunctionParametersDecrease(declaration.parent);
            } else {
                program.pushOp(ReflectionOp.never);
            }
        } else {
            program.pushOp(ReflectionOp.any);
            // program.pushOp(ReflectionOp.typeParameter, program.findOrAddStackEntry(getNameAsString(typeName)));
        }
    }

    protected createAccessorForEntityName(e: QualifiedName): PropertyAccessExpression {
        return this.f.createPropertyAccessExpression(isIdentifier(e.left) ? e.left : this.createAccessorForEntityName(e.left), e.right);
    }

    protected findDeclarationInFile(sourceFile: SourceFile | ModuleDeclaration, declarationName: string): Declaration | undefined {
        if (isNodeWithLocals(sourceFile) && sourceFile.locals) {
            const declarationSymbol = sourceFile.locals.get(declarationName as __String);
            if (declarationSymbol && declarationSymbol.declarations && declarationSymbol.declarations[0]) {
                return declarationSymbol.declarations[0];
            }
        }
        return;
    }

    protected resolveImportSpecifier(_declarationName: string | ModuleExportName, importOrExport: ExportDeclaration | ImportDeclaration | JSDocImportTag, sourceFile: SourceFile): Declaration | undefined {
        const declarationName = 'string' === typeof _declarationName ? _declarationName : getIdentifierName(_declarationName);
        if (!importOrExport.moduleSpecifier || !isStringLiteral(importOrExport.moduleSpecifier)) {
            return;
        }

        const source: SourceFile | ModuleDeclaration | undefined = this.resolver.resolve(sourceFile, importOrExport);

        if (!source) {
            debug('module not found', (importOrExport.moduleSpecifier as any).text, 'Is transpileOnly enabled? It needs to be disabled.');
            return;
        }

        const declaration = this.findDeclarationInFile(source, declarationName);
        sourceFile = source;

        /**
         * declaration could also be `import {PrimaryKey} from 'xy'`, which we want to skip
         */
        if (declaration && !isImportSpecifier(declaration)) {
            //if `export {PrimaryKey} from 'xy'`, then follow xy
            if (isExportDeclaration(declaration)) {
                return this.followExport(declarationName, declaration, sourceFile);
            }
            return declaration;
        }

        //not found, look in exports
        if (isSourceFile(sourceFile)) {
            for (const statement of sourceFile.statements) {
                if (!isExportDeclaration(statement)) continue;
                const found = this.followExport(declarationName, statement, sourceFile);
                if (found) return found;
            }
        }

        return;
    }

    protected followExport(declarationName: string, statement: ExportDeclaration, sourceFile: SourceFile): Declaration | undefined {
        if (statement.exportClause) {
            //export {y} from 'x'
            if (isNamedExports(statement.exportClause)) {
                for (const element of statement.exportClause.elements) {
                    //see if declarationName is exported
                    if (getEscapedText(element.name) === declarationName) {
                        if (!statement.moduleSpecifier || !isStringLiteral(statement.moduleSpecifier)) {
                            // it's `export {Class}` and Class is either a Declaration or ImportSpecifier
                            if (!statement.moduleSpecifier || !isStringLiteral(statement.moduleSpecifier)) {
                                // it's `export {Class};` and Class is either a Declaration or ImportSpecifier
                                if (isNodeWithLocals(sourceFile) && sourceFile.locals) {
                                    const found = sourceFile.locals.get(declarationName as __String);
                                    if (found && found.declarations && found.declarations[0]) {
                                        const declaration = found.declarations[0];
                                        if (declaration && isImportSpecifier(declaration)) {
                                            const importOrExport = declaration.parent.parent.parent;
                                            const found = this.resolveImportSpecifier(
                                                element.propertyName ? getEscapedText(element.propertyName) : declarationName,
                                                importOrExport, sourceFile,
                                            );
                                            if (found) return found;
                                        } else if (declaration) {
                                        }
                                        return declaration;
                                    }
                                }
                            }
                        } else {
                            // it's `export {Class} from 'x'`
                            const found = this.resolveImportSpecifier(element.propertyName ? getEscapedText(element.propertyName) : declarationName, statement, sourceFile);
                            if (found) return found;
                        }
                    }
                }
            }
        } else {
            //export * from 'x'
            //see if `x` exports declarationName (or one of its exports * from 'y')
            const found = this.resolveImportSpecifier(declarationName, statement, sourceFile);
            if (found) {
                return found;
            }
        }
        return;
    }

    protected getTypeOfType(type: Node | Declaration): Expression | undefined {
        const reflection = this.isWithReflection(this.sourceFile, type);
        if (!reflection) return;

        const program = new CompilerProgram(type, this.sourceFile);
        this.extractPackStructOfType(type, program);
        return this.packOpsAndStack(program);
    }

    protected packOpsAndStack(program: CompilerProgram) {
        const packStruct = program.buildPackStruct();
        if (packStruct.ops.length === 0) return;
        // debugPackStruct(this.sourceFile, program.forNode, packStruct);
        const packed = [...packStruct.stack, encodeOps(packStruct.ops)];
        return this.valueToExpression(packed);
    }

    /**
     * Note: We have to duplicate the expressions as it can be that incoming expression are from another file and contain wrong pos/end properties,
     * so the code generation is then broken when we simply reuse them. Wrong code like ``User.__type = [.toEqual({`` is then generated.
     * This function is probably not complete, but we add new copies when required.
     */
    protected valueToExpression(value: undefined | PackExpression | PackExpression[]): Expression {
        return this.nodeConverter.toExpression(value);
    }

    /**
     * A class is decorated with type information by adding a static variable.
     *
     * class Model {
     *     static __types = pack(ReflectionOp.string); //<-- encoded type information
     *     title: string;
     * }
     */
    protected decorateClass(sourceFile: SourceFile, node: ClassDeclaration | ClassExpression): Node {
        const reflection = this.isWithReflection(sourceFile, node);
        if (!reflection) {
            return node;
        }
        const type = this.getTypeOfType(node);
        const __type = this.f.createPropertyDeclaration(
            this.f.createModifiersFromModifierFlags(ModifierFlags.Static), '__type',
            undefined, undefined,
            type);

        if (isClassDeclaration(node)) {
            // return node;
            return this.f.updateClassDeclaration(node, node.modifiers,
                node.name, node.typeParameters, node.heritageClauses,
                this.f.createNodeArray<ClassElement>([...node.members, __type]),
            );
        }

        return this.f.updateClassExpression(node, node.modifiers,
            node.name, node.typeParameters, node.heritageClauses,
            this.f.createNodeArray<ClassElement>([...node.members, __type]),
        );
    }

    /**
     * const fn = function() {}
     *
     * => const fn = __assignType(function() {}, [34])
     */
    protected decorateFunctionExpression(expression: FunctionExpression) {
        const encodedType = this.getTypeOfType(expression);
        if (!encodedType) return expression;

        return this.wrapWithAssignType(expression, encodedType);
    }

    /**
     * function name() {}
     *
     * => function name() {}; name.__type = 34;
     */
    protected decorateFunctionDeclaration(declaration: FunctionDeclaration) {
        const encodedType = this.getTypeOfType(declaration);
        if (!encodedType) return declaration;

        if (!declaration.name) {
            //its likely `export default function() {}`
            if (!declaration.body) return;

            //since a new default export is created, we do not need ExportKey&DefaultKeyword on the function anymore,
            //but it should preserve all others like Async.
            const modifier: readonly Modifier[] = declaration.modifiers
                ? declaration.modifiers.filter(v => v.kind !== SyntaxKind.ExportKeyword && v.kind !== SyntaxKind.DefaultKeyword && v.kind !== SyntaxKind.Decorator) as Modifier[]
                : [];
            return this.f.createExportAssignment(undefined, undefined, this.wrapWithAssignType(
                this.f.createFunctionExpression(modifier, declaration.asteriskToken, declaration.name, declaration.typeParameters, declaration.parameters, declaration.type, declaration.body),
                encodedType,
            ));
        }

        const statements: Statement[] = [declaration];
        statements.push(this.f.createExpressionStatement(
            this.f.createAssignment(this.f.createPropertyAccessExpression(serializeEntityNameAsExpression(this.f, declaration.name), '__type'), encodedType),
        ));
        return statements;
    }

    /**
     * const fn = () => {}
     * => const fn = __assignType(() => {}, [34])
     */
    protected decorateArrowFunction(expression: ArrowFunction) {
        const encodedType = this.getTypeOfType(expression);
        if (!encodedType) return expression;

        return this.wrapWithAssignType(expression, encodedType);
    }

    /**
     * Object.assign(fn, {__type: []}) is much slower than a custom implementation like
     *
     * assignType(fn, [])
     *
     * where we embed assignType() at the beginning of the type.
     */
    protected wrapWithAssignType(fn: Expression, type: Expression) {
        this.embedAssignType = true;

        return this.f.createCallExpression(
            this.f.createIdentifier('__assignType'),
            undefined,
            [
                fn,
                type,
            ],
        );
    }

    /**
     * Checks if reflection was disabled/enabled in file via JSDoc attribute for a particular
     * Node, e.g `@reflection no`. If nothing is found, "reflection" config option needs to be used.
     */
    protected getExplicitReflectionMode(sourceFile: SourceFile | undefined, node: Node): boolean | undefined {
        let current: Node | undefined = node;

        let reflectionComment: string | undefined = undefined;

        while ('undefined' === typeof reflectionComment && current) {
            const next = sourceFile && extractJSDocAttribute(sourceFile, current, 'reflection');
            if ('undefined' !== typeof next) reflectionComment = next;
            current = current.parent;
        }

        if (reflectionComment === '' || reflectionComment === 'true' || reflectionComment === 'default'
            || reflectionComment === 'enabled' || reflectionComment === '1') {
            return true;
        }

        if (reflectionComment === 'false' || reflectionComment === 'disabled' || reflectionComment === 'never'
            || reflectionComment === 'no' || reflectionComment === '0') {
            return false;
        }

        return;
    }
}

export class DeclarationTransformer extends ReflectionTransformer {
    protected addExports: { identifier: string }[] = [];

    transformSourceFile(sourceFile: SourceFile): SourceFile {
        if ((sourceFile as any).deepkitDeclarationTransformed) return sourceFile;

        this.sourceFile = sourceFile;
        this.addExports = [];

        const configResolver = this.getConfigResolver(sourceFile);
        const reflection = configResolver.match(sourceFile.fileName);

        // important to override the compilerOptions with the one from the configResolver
        // since the one provided by TSC/plugins are not necessarily the full picture.
        // ConfigResolver resolves the whole config.
        // Since this.compilerOptions was already passed to Resolver, we update its values by reference.
        Object.assign(this.compilerOptions, configResolver.config.compilerOptions);

        if (reflection.mode === 'never') return sourceFile;

        const visitor = (node: Node): any => {
            node = visitEachChild(node, visitor, this.context);

            if ((isTypeAliasDeclaration(node) || isInterfaceDeclaration(node) || isEnumDeclaration(node)) && hasModifier(node, SyntaxKind.ExportKeyword)) {
                const reflection = this.isWithReflection(sourceFile, node);
                if (reflection) {
                    this.addExports.push({ identifier: getIdentifierName(this.getDeclarationVariableName(node.name)) });
                }
            }

            return node;
        };
        this.sourceFile = visitNode(this.sourceFile, visitor);

        if (this.addExports.length) {
            const exports: Statement[] = [];
            const handledIdentifier: string[] = [];
            for (const imp of this.addExports) {
                if (handledIdentifier.includes(imp.identifier)) continue;
                handledIdentifier.push(imp.identifier);

                //export declare type __ΩXY = any[];
                exports.push(this.f.createTypeAliasDeclaration([
                        this.f.createModifier(SyntaxKind.ExportKeyword),
                        this.f.createModifier(SyntaxKind.DeclareKeyword),
                    ], this.f.createIdentifier(imp.identifier),
                    undefined,
                    this.f.createArrayTypeNode(this.f.createKeywordTypeNode(SyntaxKind.AnyKeyword)),
                ));
            }

            this.sourceFile = this.f.updateSourceFile(this.sourceFile, [...this.sourceFile.statements, ...exports]);
        }

        (this.sourceFile as any).deepkitDeclarationTransformed = true;

        return this.sourceFile;
    }
}

let loaded = false;
const cache = new Cache;

export const transformer: CustomTransformerFactory = function deepkitTransformer(context) {
    if (!loaded) {
        debug('@deepkit/type transformer loaded\n');
        loaded = true;
    }
    cache.tick();
    return new ReflectionTransformer(context, cache);
};

export const declarationTransformer: CustomTransformerFactory = function deepkitDeclarationTransformer(context) {
    return new DeclarationTransformer(context, cache);
};

