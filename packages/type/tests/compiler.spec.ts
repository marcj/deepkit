/** @reflection never */
import { describe, expect, test } from '@jest/globals';
import * as ts from 'typescript';
import { ModuleKind, ScriptTarget, TransformationContext, transpileModule } from 'typescript';
import { DeclarationTransformer, ReflectionTransformer } from '@deepkit/type-compiler';
import { reflect, reflect as reflect2, ReflectionClass, removeTypeName, typeOf as typeOf2 } from '../src/reflection/reflection.js';
import { assertType, defaultAnnotation, primaryKeyAnnotation, ReflectionKind, ReflectionVisibility, stringifyType, Type, TypeClass, TypeFunction, TypeMethod, TypeObjectLiteral, TypeProperty, TypeUnion } from '../src/reflection/type.js';
import { ReflectionOp } from '@deepkit/type-spec';
import { ClassType, isObject } from '@deepkit/core';
import { pack, resolveRuntimeType } from '../src/reflection/processor.js';
import { expectEqualType } from './utils.js';
import { createSystem, createVirtualCompilerHost, knownLibFilesForCompilerOptions } from '@typescript/vfs';
import { dirname, join } from 'path';
import { readFileSync } from 'fs';

Error.stackTraceLimit = 200;

const defaultLibLocation = __dirname + '/node_modules/typescript/lib/';

function readLibs(compilerOptions: ts.CompilerOptions, files: Map<string, string>) {
    const getLibSource = (name: string) => {
        const lib = dirname(require.resolve('typescript'));
        return readFileSync(join(lib, name), 'utf8');
    };
    const libs = knownLibFilesForCompilerOptions(compilerOptions, ts);
    for (const lib of libs) {
        if (lib.startsWith('lib.webworker.d.ts')) continue; //dom and webworker can not go together

        try {
            files.set(defaultLibLocation + lib, getLibSource(lib));
        } catch (error) {
            //that's fine, some libs are not available in all versions
        }
    }
}

export function transpile<T extends string | Record<string, string>>(files: T, options: ts.CompilerOptions = {}): T extends string ? string : Record<string, string> {
    const compilerOptions: ts.CompilerOptions = {
        target: ScriptTarget.ES2020,
        allowNonTsExtensions: true,
        module: ModuleKind.ES2020,
        declaration: true,
        lib: [],
        noLib: true,
        transpileOnly: true,
        moduleResolution: ts.ModuleResolutionKind.NodeJs,
        experimentalDecorators: true,
        esModuleInterop: true,
        skipLibCheck: true,
        ...options
    };

    process.env['DEBUG'] = 'deepkit';
    if ('string' === typeof files) {
        return transpileModule(files, {
            fileName: __dirname + '/module.ts',
            compilerOptions,
            transformers: {
                before: [(context: TransformationContext) => new ReflectionTransformer(context).withReflection({ reflection: 'default' })],
                afterDeclarations: [(context: TransformationContext) => new DeclarationTransformer(context).withReflection({ reflection: 'default' })],
            }
        }).outputText as any;
    }

    const fsMap = new Map<string, string>();
    readLibs(compilerOptions, fsMap);
    compilerOptions.lib = [...fsMap.keys()];

    for (const [fileName, source] of Object.entries(files)) {
        fsMap.set(__dirname + '/' + fileName + '.ts', source);
    }
    const system = createSystem(fsMap);

    const host = createVirtualCompilerHost(system, compilerOptions, ts);
    host.compilerHost.getDefaultLibLocation = () => defaultLibLocation;

    const rootNames = Object.keys(files).map(fileName => __dirname + '/' + fileName + '.ts');
    const program = ts.createProgram({
        rootNames: rootNames,
        options: compilerOptions,
        host: host.compilerHost,
    });
    // for (const d of getPreEmitDiagnostics(program)) {
    //     console.log('diagnostics', d.file?.fileName, d.messageText, d.start, d.length);
    // }
    const res: Record<string, string> = {};

    program.emit(undefined, (fileName, data) => {
        res[fileName.slice(__dirname.length + 1)] = data;
    }, undefined, undefined, {
        before: [(context: TransformationContext) => new ReflectionTransformer(context).forHost(host.compilerHost).withReflection({ reflection: 'default' })],
    });

    return res as any;
}

/**
 * @reflection never
 */
function packRaw(...args: Parameters<typeof pack>): string {
    return `${(pack(...args) as string[]).join().replace(/'/g, '\\\'')}`;
}

/**
 * @reflection never
 */
function packString(...args: Parameters<typeof pack>): string {
    return `'${packRaw(...args)}'`;
}

const tests: [code: string | { [file: string]: string }, contains: string | string[]][] = [
    [`class Entity { p: string }`, `Entity.__type = ['p', 'Entity', ${packString([ReflectionOp.string, ReflectionOp.property, 0, ReflectionOp.class, ReflectionOp.typeName, 1])}]`],
    [`class Entity { p: number }`, `Entity.__type = ['p', 'Entity', ${packString([ReflectionOp.number, ReflectionOp.property, 0, ReflectionOp.class, ReflectionOp.typeName, 1])}]`],
    [`class Entity { p: boolean }`, `Entity.__type = ['p', 'Entity', ${packString([ReflectionOp.boolean, ReflectionOp.property, 0, ReflectionOp.class, ReflectionOp.typeName, 1])}]`],
    [`class Entity { p: bigint }`, `Entity.__type = ['p', 'Entity', ${packString([ReflectionOp.bigint, ReflectionOp.property, 0, ReflectionOp.class, ReflectionOp.typeName, 1])}]`],
    [`class Entity { p: any }`, `Entity.__type = ['p', 'Entity', ${packString([ReflectionOp.any, ReflectionOp.property, 0, ReflectionOp.class, ReflectionOp.typeName, 1])}]`],
    [`class Entity { p: Date }`, `Entity.__type = ['p', 'Entity', ${packString([ReflectionOp.date, ReflectionOp.property, 0, ReflectionOp.class, ReflectionOp.typeName, 1])}]`],
    [`class Entity { private p: string }`, `Entity.__type = ['p', 'Entity', ${packString([ReflectionOp.string, ReflectionOp.property, 0, ReflectionOp.private, ReflectionOp.class, ReflectionOp.typeName, 1])}]`],
    [`class Entity { p?: string }`, `Entity.__type = ['p', 'Entity', ${packString([ReflectionOp.string, ReflectionOp.property, 0, ReflectionOp.optional, ReflectionOp.class, ReflectionOp.typeName, 1])}]`],
    [`class Entity { p: string | undefined }`, `Entity.__type = ['p', 'Entity', ${packString([ReflectionOp.frame, ReflectionOp.string, ReflectionOp.undefined, ReflectionOp.union, ReflectionOp.property, 0, ReflectionOp.class, ReflectionOp.typeName, 1])}]`],
    [`class Entity { p: string | null }`, `Entity.__type = ['p', 'Entity', ${packString([ReflectionOp.frame, ReflectionOp.string, ReflectionOp.null, ReflectionOp.union, ReflectionOp.property, 0, ReflectionOp.class, ReflectionOp.typeName, 1])}]`],
    [`class Entity { p: number[] }`, `Entity.__type = ['p', 'Entity', ${packString([ReflectionOp.number, ReflectionOp.array, ReflectionOp.property, 0, ReflectionOp.class, ReflectionOp.typeName, 1])}]`],
    [`class Entity { p: (number | string)[] }`, `Entity.__type = ['p', 'Entity', ${packString([ReflectionOp.frame, ReflectionOp.number, ReflectionOp.string, ReflectionOp.union, ReflectionOp.array, ReflectionOp.property, 0, ReflectionOp.class, ReflectionOp.typeName, 1])}]`],

    [`class Entity { p: Promise<number> }`, `Entity.__type = ['p', 'Entity', ${packString([ReflectionOp.number, ReflectionOp.promise, ReflectionOp.property, 0, ReflectionOp.class, ReflectionOp.typeName, 1])}]`],
    [`class Entity { p: number | string }`, `Entity.__type = ['p', 'Entity', ${packString([ReflectionOp.frame, ReflectionOp.number, ReflectionOp.string, ReflectionOp.union, ReflectionOp.property, 0, ReflectionOp.class, ReflectionOp.typeName, 1])}]`],
    // [
    //     `class Book {}; class IdentifiedReference<T> {} class Entity { p: IdentifiedReference<Book> }`,
    //     `Entity.__type = [() => Book, () => IdentifiedReference, 'p', ${packString([ReflectionOp.classReference, 0, ReflectionOp.classReference, 1, ReflectionOp.property, 2, ReflectionOp.class])}]`
    // ],
    // [
    //     `class Container<T> {data: T}`,
    //     `Container.__type = ['T', 'data', ${packString([ReflectionOp.typeParameter, 0, ReflectionOp.loads, 0, 0, ReflectionOp.property, 1, ReflectionOp.class])}]`
    // ],
    //
    // [
    //     `class Container<T> {data: T extends boolean ? number : never}`,
    //     `Container.__type = ['T', 'data', ${packString([ReflectionOp.typeParameter, 0, ReflectionOp.frame, ReflectionOp.loads, 1, 0, ReflectionOp.boolean, ReflectionOp.extends, ReflectionOp.number, ReflectionOp.never, ReflectionOp.condition, ReflectionOp.property, 1, ReflectionOp.class])}]`
    // ],
    //
    // [
    //     `class Container<T, L> {data: T, label: L}`,
    //     `Container.__type = ['T', 'L', 'data', 'label', ${packString([ReflectionOp.typeParameter, 0, ReflectionOp.typeParameter, 1, ReflectionOp.loads, 0, 0, ReflectionOp.property, 2, ReflectionOp.loads, 0, 1, ReflectionOp.property, 3, ReflectionOp.class])}]`
    // ],
    //
    // [`class Entity { p: string | number; p2: string}`,
    //     [`['p', 'p2', ${packString([ReflectionOp.string, ReflectionOp.number, ReflectionOp.union, ReflectionOp.property, 0, ReflectionOp.string, ReflectionOp.property, 1, ReflectionOp.class])}`]],
    //
    // [`class Entity { p: Uint8Array }`, `['p', ${packString([ReflectionOp.uint8Array, ReflectionOp.property, 0, ReflectionOp.class])}]`],
    // [`class Model{}; class Entity { p: Model }`, `[() => Model, 'p', ${packString([ReflectionOp.classReference, 0, ReflectionOp.property, 1, ReflectionOp.class])}]`],
    //
    // [`class Entity { constructor(param: string) {} }`, `['param', 'constructor', ${packString([ReflectionOp.string, ReflectionOp.parameter, 0, ReflectionOp.any, ReflectionOp.method, 1, ReflectionOp.class])}]`],
    // [`class Entity { p(param: string): void }`, `['param', 'p', ${packString([ReflectionOp.string, ReflectionOp.parameter, 0, ReflectionOp.void, ReflectionOp.method, 1, ReflectionOp.class])}]`],
    // [`class Entity { p(param: string): any }`, `['param', 'p', ${packString([ReflectionOp.string, ReflectionOp.parameter, 0, ReflectionOp.any, ReflectionOp.method, 1, ReflectionOp.class])}]`],
    // [`class Entity { p(param: string, size: number): void }`, `['param', 'size', 'p', ${packString([ReflectionOp.string, ReflectionOp.parameter, 0, ReflectionOp.number, ReflectionOp.parameter, 1, ReflectionOp.void, ReflectionOp.method, 2, ReflectionOp.class])}]`],
    //
    // [`function f() {enum MyEnum {}; class Entity { p: MyEnum;} }`, `[() => MyEnum, 'p', ${packString([ReflectionOp.enum, 0, ReflectionOp.property, 1, ReflectionOp.class])}]`],
    //
    // [`class Model {} class Entity { p: Model;}`, `[() => Model, 'p', ${packString([ReflectionOp.classReference, 0, ReflectionOp.property, 1, ReflectionOp.class])}]`],
    // [`class Entity { p: 'a';}`, `['a', 'p', ${packString([ReflectionOp.literal, 0, ReflectionOp.property, 1, ReflectionOp.class])}]`],
    // [`class Entity { p: 'a' | 'b';}`, `['a', 'b', 'p', ${packString([ReflectionOp.literal, 0, ReflectionOp.literal, 1, ReflectionOp.union, ReflectionOp.property, 2, ReflectionOp.class])}]`],
    // [`class Entity { p: 'a' | 'b' | undefined;}`, `['a', 'b', 'p', ${packString([ReflectionOp.literal, 0, ReflectionOp.literal, 1, ReflectionOp.undefined, ReflectionOp.union, ReflectionOp.property, 2, ReflectionOp.class])}]`],
    //
    // [`class Entity { p: 'a' | 'b' | 'c' | undefined;}`, `['a', 'b', 'c', 'p', ${packString([ReflectionOp.literal, 0, ReflectionOp.literal, 1, ReflectionOp.literal, 2, ReflectionOp.undefined, ReflectionOp.union, ReflectionOp.property, 3, ReflectionOp.class])}]`],
    // [`class Entity { p: 'a' | 'b' | null;}`, `['a', 'b', 'p', ${packString([ReflectionOp.literal, 0, ReflectionOp.literal, 1, ReflectionOp.null, ReflectionOp.union, ReflectionOp.property, 2, ReflectionOp.class])}]`],
    // [`class Entity { p: ('a' | 'b')[];}`, `['a', 'b', 'p', ${packString([ReflectionOp.literal, 0, ReflectionOp.literal, 1, ReflectionOp.union, ReflectionOp.array, ReflectionOp.property, 2, ReflectionOp.class])}]`],
    // [`class Entity { p?: ('a' | 'b')[];}`, `['a', 'b', 'p', ${packString([ReflectionOp.literal, 0, ReflectionOp.literal, 1, ReflectionOp.union, ReflectionOp.array, ReflectionOp.property, 2, ReflectionOp.optional, ReflectionOp.class])}]`],
    // [`class Entity { p: {[name: string]: number};}`, `['p', ${packString([ReflectionOp.frame, ReflectionOp.string, ReflectionOp.number, ReflectionOp.indexSignature, ReflectionOp.objectLiteral, ReflectionOp.property, 0, ReflectionOp.class])}]`],
    // [`class Entity { p: {[name: string]: number|undefined};}`, `['p', ${packString([ReflectionOp.frame, ReflectionOp.string, ReflectionOp.frame, ReflectionOp.number, ReflectionOp.undefined, ReflectionOp.union, ReflectionOp.indexSignature, ReflectionOp.objectLiteral, ReflectionOp.property, 0, ReflectionOp.class])}]`],
    // [`class Entity { p: {[name: number]: number};}`, `['p', ${packString([ReflectionOp.frame, ReflectionOp.number, ReflectionOp.number, ReflectionOp.indexSignature, ReflectionOp.objectLiteral, ReflectionOp.property, 0, ReflectionOp.class])}]`],
    //
    // [`class Entity { p: Record<string, number>; }`, `['p', ${packString([ReflectionOp.string, ReflectionOp.number, ReflectionOp.indexSignature, ReflectionOp.objectLiteral, ReflectionOp.property, 0, ReflectionOp.class])}]`],
    // [`class Entity { p: Record<string, number|undefined>; }`, `['p', ${packString([ReflectionOp.string, ReflectionOp.frame, ReflectionOp.number, ReflectionOp.undefined, ReflectionOp.union, ReflectionOp.indexSignature, ReflectionOp.objectLiteral, ReflectionOp.property, 0, ReflectionOp.class])}]`],
    // [`class Entity { p: Record<number, number>; }`, `['p', ${packString([ReflectionOp.number, ReflectionOp.number, ReflectionOp.indexSignature, ReflectionOp.objectLiteral, ReflectionOp.property, 0, ReflectionOp.class])}]`],
    //
    // [{
    //     app: `import {MyEnum} from './enum.js'; class Entity { p: MyEnum;}`,
    //     enum: `export enum MyEnum {}`
    // }, `[() => MyEnum, 'p', ${packString([ReflectionOp.enum, 0, ReflectionOp.property, 1, ReflectionOp.class])}]`],
    //
    // [{
    //     app: `import {Model} from './model.js'; class Entity { p: Model;}`,
    //     model: `export class Model {}`
    // }, `[() => Model, 'p', ${packString([ReflectionOp.classReference, 0, ReflectionOp.property, 1, ReflectionOp.class])}]`],
    // [{
    //     app: `import {Pattern} from './model.js'; class Entity { p: Pattern;}`,
    //     model: `export const REGEX = /abc/;\nexport type Pattern = {regex: typeof REGEX};`
    // }, `import { REGEX } from './model.js'`],
    // [{
    //     app: `import {Pattern} from './model.js'; class Entity { p: Pattern;}`,
    //     model: `export const REGEX = /abc/;\ntype M<T> = {name: T, regex: typeof REGEX}; type Pattern = M<true>;`
    // }, `import { REGEX } from './model.js'`],
    // [{
    //     app: `import {Email} from './validator.js'; class Entity { p: Email;}`,
    //     validator: `
    //         export const REGEX = /abc/;
    //         export type ValidatorMeta<Name extends string, Args extends [...args: any[]] = []> = { __meta?: { id: 'validator', name: Name, args: Args } }
    //         export type Pattern<T extends RegExp> = ValidatorMeta<'pattern', [T]>
    //         export type Email = string & Pattern<typeof EMAIL_REGEX>;`
    // }, `import { EMAIL_REGEX } from './validator.js';`],
    //
    // [`export interface MyInterface {id: number}; class Controller { public p: MyInterface[] = [];}`,
    //     [
    //         `['id', ${packString([ReflectionOp.frame, ReflectionOp.number, ReflectionOp.propertySignature, 0, ReflectionOp.objectLiteral])}]`,
    //         `[__ΩMyInterface, 'p', () => [], ${packString([ReflectionOp.inline, 0, ReflectionOp.array, ReflectionOp.property, 1, ReflectionOp.defaultValue, 2, ReflectionOp.class])}]`
    //     ]
    // ],
    //
    // [`interface Base {title: string}; interface MyInterface extends Base {id: number}; class Controller { public p: MyInterface[] = [];}`,
    //     [
    //         `['id', 'title', ${packString([ReflectionOp.frame, ReflectionOp.number, ReflectionOp.propertySignature, 0, ReflectionOp.string, ReflectionOp.propertySignature, 1, ReflectionOp.objectLiteral])}]`,
    //         `[__ΩMyInterface, 'p', () => [], ${packString([ReflectionOp.inline, 0, ReflectionOp.array, ReflectionOp.property, 1, ReflectionOp.defaultValue, 2, ReflectionOp.class])}]`
    //     ]
    // ],
    //
    // [`export type MyAlias = string; class Controller { public p: MyAlias[] = [];}`,
    //     [
    //         `${packString([ReflectionOp.string])}`,
    //         `[__ΩMyAlias, 'p', () => [], ${packString([ReflectionOp.inline, 0, ReflectionOp.array, ReflectionOp.property, 1, ReflectionOp.defaultValue, 2, ReflectionOp.class])}]`,
    //     ]
    // ],
    //
    // [`
    // /** @reflection never */
    // function() {
    //     class Entity { p: number;}
    // }`, '!__type'],
    // [`
    // function() {
    //     class Entity {
    //         /** @reflection never */
    //         p: number;
    //
    //         p2: number;
    //     }
    // }`, `['p2', ${packString([ReflectionOp.number, ReflectionOp.property, 0, ReflectionOp.class])}]`],
    //
    // // Imported interfaces/types will be erased and inlined
    // [{
    //     app: `import {Type} from './model.js'; class Entity { p: Type[];}`,
    //     model: `export type Type = {title: string}`
    // }, [
    //     `!./model`, `!import {Type} from './model.js'`,
    //     `['title', 'p', ${packString([ReflectionOp.frame, ReflectionOp.string, ReflectionOp.propertySignature, 0, ReflectionOp.objectLiteral, ReflectionOp.array, ReflectionOp.property, 1, ReflectionOp.class])}]`,
    // ]],
    //
    // [{
    //     app: `import {Message, Model} from './model.js'; class Entity { p: Message[]; m: Model[];}`,
    //     model: `export type Message = number; export class Model {};`
    // }, [`import { Model } from './model'`, `[__ΩMessage, 'p', () => Model, 'm.js', ${packString([
    //     ReflectionOp.inline, 0, ReflectionOp.array, ReflectionOp.property, 1,
    //     ReflectionOp.classReference, 2, ReflectionOp.array, ReflectionOp.property, 3, ReflectionOp.class])}]`]],
    //
    // [{
    //     app: `import {Type} from './model.js'; class Entity { p: Type[];}`,
    //     model: `export interface Type {title: string}`
    // }, [`!./model`, `!import {Type} from './model.js'`]],
    //
    // // multiple exports can be resolved
    // [{
    //     app: `import {Type, Model} from './myPackage.js'; class Entity { p: Type[]; p2: Model[]};`,
    //     myPackage: `export * from './myPackageModel.js';`,
    //     myPackageModel: `export interface Type {title: string}; export class Model {}`
    // }, [`import { Model } from './myPackage'`, `[__ΩType, 'p', () => Model, 'p2.js', ${packString([
    //     ReflectionOp.inline, 0, ReflectionOp.array, ReflectionOp.property, 1, ReflectionOp.classReference, 2, ReflectionOp.array, ReflectionOp.property, 3, ReflectionOp.class])}]`]],
    //
    // [{
    //     app: `import {Type, Model} from './myPackage.js'; class Entity { p: Type[]; p2: Model[]};`,
    //     myPackage: `export {Model, Type} from './myPackageModel.js';`,
    //     myPackageModel: `export interface Type {title: string}; export class Model {}`
    // }, [`import { Model } from './myPackage'`, `[__ΩType, 'p', () => Model, 'p2.js', ${packString([
    //     ReflectionOp.inline, 0, ReflectionOp.array, ReflectionOp.property, 1, ReflectionOp.classReference, 2, ReflectionOp.array, ReflectionOp.property, 3, ReflectionOp.class])}]`]],
    //
    // [{
    //     app: `import {Type, Model} from './myPackage.js'; class Entity { p: Type[]; p2: Model[]};`,
    //     myPackage: `export {MM as Model, TT as Type} from './myPackageModel.js';`,
    //     myPackageModel: `export interface TT {title: string}; export class MM {}`
    // }, [`import { Model } from './myPackage'`, `[__ΩType, 'p', () => Model, 'p2.js', ${packString([
    //     ReflectionOp.inline, 0, ReflectionOp.array, ReflectionOp.property, 1, ReflectionOp.classReference, 2, ReflectionOp.array, ReflectionOp.property, 3, ReflectionOp.class])}]`]],
    //
    // [`
    // /** @reflection never */
    // class Entity1 { p: number;}
    // class Entity2 { p: string;}
    // `, [`!['p', ${packString([ReflectionOp.number, ReflectionOp.property, 0, ReflectionOp.class])}]`, `['p', ${packString([ReflectionOp.string, ReflectionOp.property, 0, ReflectionOp.class])}]`]],
    //
    // [`
    // class Entity1 { p: number;}
    // /** @reflection never */
    // class Entity2 { p: string;}
    // `, [`['p', ${packString([ReflectionOp.number, ReflectionOp.property, 0, ReflectionOp.class])}]`, `!['p', ${packString([ReflectionOp.string, ReflectionOp.property, 0, ReflectionOp.class])}]`]],
    //
    // // erasable types will be kept
    // [{
    //     app: `import {Model} from './model.js'; class Entity { p: Model[];}`,
    //     model: `export class Model {}`
    // }, [`[() => Model, 'p', ${packString([ReflectionOp.classReference, 0, ReflectionOp.array, ReflectionOp.property, 1, ReflectionOp.class])}]`, `import { Model } from './model.js';`]],
    //
    // //functions
    // [`const fn = (param: string): void {}`, `const fn = Object.assign((param) => { }, { __type: ['param', '', ${packString([ReflectionOp.string, ReflectionOp.parameter, 0, ReflectionOp.void, ReflectionOp.function, 1])}] })`],
    // [`const fn = (param: string) {}`, `const fn = Object.assign((param) => { }, { __type: ['param', '', ${packString([ReflectionOp.string, ReflectionOp.parameter, 0, ReflectionOp.any, ReflectionOp.function, 1])}] })`],
    // [`const fn = () {}`, `!__type:`],
    // [`const fn = (): any {}`, `const fn = Object.assign(() => { }, { __type: ['', ${packString([ReflectionOp.any, ReflectionOp.function, 0])}] })`],
    //
    // [`const fn = function () {}`, `!__type`],
    // [`const fn = function (): any {}`, `const fn = Object.assign(function () { }, { __type: ['', ${packString([ReflectionOp.any, ReflectionOp.function, 0])}] })`],
    // [`function createFn() { return function(): any {} }`, `return Object.assign(function () { }, { __type: ['', ${packString([ReflectionOp.any, ReflectionOp.function, 0])}] })`],
    //
    // [`class Entity { createFn() { return function(param: string) {} }}`, `return Object.assign(function (param) { }, { __type: ['param', '', ${packString([ReflectionOp.string, ReflectionOp.parameter, 0, ReflectionOp.any, ReflectionOp.function, 1])}] })`],
    //
    // [`function name(): any {}`, `function name() { }\nname.__type = ['name', ${packString([ReflectionOp.any, ReflectionOp.function, 0])}];`],
];

describe('transformer', () => {
    for (const entry of tests) {
        const [code, contains] = entry;
        const label = 'string' === typeof code ? code : code['app'] || '';
        test(`${label.slice(-40)}: ${contains}`, () => {
            const transpiled = transpile(code);
            const result = isObject(transpiled) ? transpiled['app.js'] : transpiled;
            const e = expect(result);
            for (const c of (Array.isArray(contains) ? contains : [contains])) {
                if (c.startsWith('!')) {
                    e.not.toContain(c.substr(1));
                } else {
                    e.toContain(c);
                }
            }
        });
    }
});

function transpileAndReturn(source: string): { [name: string]: any } {
    const js = transpile(`(() => { ${source} })()`);
    return run(js);
}

function run(js: string): any {
    const typeOf = function (...args: any[]) {
        return removeTypeName(typeOf2(...args));
    };
    const reflect = reflect2;
    return eval(js);
}

test('class', () => {
    const code = `
    function say(text: string): void {}
    return class User {id: number; username: string}`;
    const clazz = transpileAndReturn(code);
    const js = transpile(code);
    console.log('js', js);
    const type = reflect(clazz);
    assertType(type, ReflectionKind.class);
    expect(type.classType).toBe(clazz);
    assertType(type.types[0], ReflectionKind.property);
    assertType(type.types[0].type, ReflectionKind.number);
    expect(type.types[0].name).toBe('id');
    assertType(type.types[1], ReflectionKind.property);
    assertType(type.types[1].type, ReflectionKind.string);
    expect(type.types[1].name).toBe('username');
});

test('class declaration', () => {
    const code = `
    /**
     * This is my class
     */
    class User {id: number; username: string}

    /** My function */
    function p() {}
    `;
    const js = transpile({ 'app.ts': code });
    console.log('js', js);
});

test('generic class', () => {
    const code = `return class Container<T> {data: T}`;
    const js = transpile(code);
    const clazz = transpileAndReturn(code);
    const type = reflect(clazz, { kind: ReflectionKind.string });
    expect(type).toMatchObject({
        kind: ReflectionKind.class,
        classType: clazz,
        types: [{
            kind: ReflectionKind.property,
            name: 'data',
            visibility: ReflectionVisibility.public,
            type: { kind: ReflectionKind.string }
        }]
    });
});

test('class constructor', () => {
    const code = `return class Container {constructor(public title: string) {}}`;
    const js = transpile(code);
    console.log('js', js);
    const clazz = transpileAndReturn(code);
    const type = reflect(clazz);
    expectEqualType(type, {
        kind: ReflectionKind.class,
        classType: clazz as ClassType,
        types: [{
            kind: ReflectionKind.method,
            name: 'constructor',
            visibility: ReflectionVisibility.public,
            parameters: [
                { kind: ReflectionKind.parameter, name: 'title', type: { kind: ReflectionKind.string }, visibility: ReflectionVisibility.public }
            ],
            return: { kind: ReflectionKind.any }
        },
            { kind: ReflectionKind.property, name: 'title', type: { kind: ReflectionKind.string }, visibility: ReflectionVisibility.public }
        ]
    } as Type);
});

test('default value', () => {
    const code = `return class Container {
        id: number = 0
    }`;
    const js = transpile(code);
    const clazz = transpileAndReturn(code);
    const type = reflect(clazz);
    expect(((type as TypeClass).types[0] as TypeProperty).default!()).toBe(0);

    const reflection = new ReflectionClass(type as TypeClass);
    const id = reflection.getProperty('id')!;

    expect(id.type.kind).toBe(ReflectionKind.number);
    expect(id.hasDefault()).toBe(true);
    expect(id.getDefaultValue()).toBe(0);
});

test('external object literal', () => {
    const code = `
    type o = { a: string, b: number };
    return class Container {data: o}`;
    const js = transpile(code);

    expect(js).toContain(`const __Ωo = `);

    const clazz = transpileAndReturn(code);

    expect(reflect(clazz)).toMatchObject({
        kind: ReflectionKind.class,
        classType: clazz,
        types: [{
            kind: ReflectionKind.property,
            name: 'data',
            visibility: ReflectionVisibility.public,
            type: {
                kind: ReflectionKind.objectLiteral,
                typeName: 'o',
                types: [
                    {
                        kind: ReflectionKind.propertySignature,
                        type: { kind: ReflectionKind.string },
                        name: 'a',
                    },
                    {
                        kind: ReflectionKind.propertySignature,
                        type: { kind: ReflectionKind.number },
                        name: 'b',
                    }
                ]
            } as TypeObjectLiteral
        }]
    });
});

test('partial', () => {
    const code = `
    type Partial<T> = {
        [P in keyof T]?: T[P];
    }
    type o = { a: string, b: number };
    return class Container {data: Partial<o>}`;

    const js = transpile(code);
    console.log('js', js);
    const clazz = transpileAndReturn(code);

    expect(reflect(clazz)).toMatchObject({
        kind: ReflectionKind.class,
        classType: clazz,
        types: [{
            kind: ReflectionKind.property,
            name: 'data',
            visibility: ReflectionVisibility.public,
            type: {
                kind: ReflectionKind.objectLiteral,
                types: [
                    {
                        kind: ReflectionKind.propertySignature,
                        type: { kind: ReflectionKind.string },
                        name: 'a',
                        optional: true,
                    },
                    {
                        kind: ReflectionKind.propertySignature,
                        type: { kind: ReflectionKind.number },
                        name: 'b',
                        optional: true,
                    }
                ]
            } as TypeObjectLiteral
        }]
    });
});

test('type emitted at the right place', () => {
    const code = `
        type Partial<T> = {
            [P in keyof T]: T[P];
        }
        () => {
            type o = { a: string };
            type p = Partial<o>;
            typeOf<p>();
        };
        return true;
    `;

    const js = transpile(code);
    console.log('js', js);
    expect(js).toContain(`() => {\n    const __Ωo = ['a', 'o', '${packRaw([ReflectionOp.frame])}`);
    const type = transpileAndReturn(code);
    console.log(type);
});

test('no global clash', () => {
    const code = `
    type Partial<T> = {
        [P in keyof T]: T[P];
    }

    () => {
        type o = { a: string };
        type p = Partial<o>;
        typeOf<p>();
    };

    () => {
        type AllString<T> = {
            [P in keyof T]: string;
        }

        type o = { a: string, b: number };
        type p = AllString<o>;
        typeOf<p>();
    };
    `;

    const js = transpile(code);
    console.log('js', js);
    expect(js).toContain(`const __Ωo = ['a', 'o', '${packRaw([ReflectionOp.frame])}`);
    expect(js).toContain(`const __Ωo = ['a', 'b', 'o', '${packRaw([ReflectionOp.frame])}`);
    // const clazz = transpileAndReturn(code);
});

test('function type', () => {
    const type = transpileAndReturn(`
    type fn = (a: string) => void;
    return typeOf<fn>();`);

    expectEqualType(type, {
        kind: ReflectionKind.function,
        parameters: [
            { kind: ReflectionKind.parameter, name: 'a', type: { kind: ReflectionKind.string } }
        ],
        return: { kind: ReflectionKind.void },
        name: undefined
    } as TypeFunction);
});

test('boolean type', () => {
    const type = transpileAndReturn(`
    return typeOf<boolean>();`);

    expect(type).toEqual({ kind: ReflectionKind.boolean });
});

test('resolve query string', () => {
    const type = transpileAndReturn(`
    type o = { a: string };
    return typeOf<o['a']>();`);

    expect(type).toMatchObject({
        kind: ReflectionKind.string
    });
});

test('resolve query union', () => {
    const type = transpileAndReturn(`
    type o = { a: string | true };
    return typeOf<o['a']>();`);

    expectEqualType(type, {
        kind: ReflectionKind.union,
        types: [
            { kind: ReflectionKind.string },
            { kind: ReflectionKind.literal, literal: true },
        ]
    });
});

test('emit function types in objects', () => {
    const code = `
    const wrap = {
        add(item: string) {
        }
    };
    return typeOf<typeof wrap>();
    `;
    const js = transpile(code);
    console.log('js', js);
    const type = transpileAndReturn(code);
    expectEqualType(type, {
        kind: ReflectionKind.objectLiteral,
        types: [
            {
                kind: ReflectionKind.methodSignature,
                name: 'add',
                parameters: [{ kind: ReflectionKind.parameter, name: 'item', type: { kind: ReflectionKind.string } }],
                return: { kind: ReflectionKind.any }
            }
        ]
    } as Type);
});

test('emit optional for method signatures', () => {
    const code = `
    interface Wrap {
        maybe?(item: string): any;
    }
    return typeOf<Wrap>();
    `;
    const js = transpile(code);
    console.log('js', js);
    const type = transpileAndReturn(code);
    expectEqualType(type, {
        kind: ReflectionKind.objectLiteral,
        types: [
            {
                kind: ReflectionKind.methodSignature,
                name: 'maybe',
                optional: true,
                parameters: [{ kind: ReflectionKind.parameter, name: 'item', type: { kind: ReflectionKind.string } }],
                return: { kind: ReflectionKind.any }
            }
        ]
    } as Type);
});

test('emit class extends types', () => {
    const code = `
        class ClassA<T> { item: T; }
        class ClassB extends ClassA<string> { }
        return typeOf<ClassB>();
    `;
    const js = transpile(code);
    console.log('js', js);
    const type = transpileAndReturn(code);
    console.log('type', type);
    expectEqualType(type, {
        kind: ReflectionKind.class,
        extendsArguments: [{ kind: ReflectionKind.string }],
    });
});

test('emit class implements types', () => {
    const code = `
        class ClassA<T> { item: T; }
        class ClassB implements ClassA<string> {
            item: string;
        }
        return typeOf<ClassB>();
    `;
    const js = transpile(code);
    const type = transpileAndReturn(code) as Type;
    assertType(type, ReflectionKind.class);
    assertType(type.implements![0], ReflectionKind.class);
    expect(type.implements![0].typeName).toBe('ClassA');
});

test('emit interface extends types', () => {
    const code = `
        interface ClassA<T> { item: T; }
        interface ClassB extends ClassA<string>;
        return typeOf<ClassB>();
    `;
    const js = transpile(code);
    const type = transpileAndReturn(code) as Type;
    assertType(type, ReflectionKind.objectLiteral);
    assertType(type.implements![0], ReflectionKind.objectLiteral);
    expect(type.implements![0].typeName).toBe('ClassA');
});

test('nominal interfaces cache', () => {
    const code = `
        interface A {
        }
        return [typeOf<A>(), typeOf<A>()];
    `;
    const js = transpile(code);
    console.log('js', js);
    const types = transpileAndReturn(code) as Type[];
    assertType(types[0], ReflectionKind.objectLiteral);
    assertType(types[1], ReflectionKind.objectLiteral);
    expect(types[0].id).toBe(types[1].id);
});

test('nominal interfaces index access', () => {
    const code = `
        interface A {
            id: string;
        }
        interface C {
            a: A;
        }
        return [typeOf<A>(), typeOf<C['a']>()];
    `;
    const js = transpile(code);
    console.log('js', js);
    const types = transpileAndReturn(code) as Type[];
    console.dir(types, {depth: null});
    assertType(types[0], ReflectionKind.objectLiteral);
    assertType(types[1], ReflectionKind.objectLiteral);
    expect(types[0].id).toBe(types[1].id);
});

test('infer T in function primitive', () => {
    const code = `
        return function fn<T extends string | number>(v: T) {
            return typeOf<T>();
        }
    `;
    const js = transpile(code);
    console.log('js', js);
    const type = transpileAndReturn(code) as (v: string | number) => Type;
    console.log(type);
    console.log(type('abc'));
});

test('constructor', () => {
    const code = `
        type constructor = abstract new (...args: any) => any;
        return typeOf<constructor>();
    `;
    const js = transpile(code);
    console.log('js', js);
    const type = transpileAndReturn(code) as (v: string | number) => Type;
    console.log(type);
});

test('template literal', () => {
    const code = '' +
        'type d8 = `1233` extends `${number}${infer T1}${number}` ? T1 : never;\n' +
        'type d9 = `1133` extends `${object}${infer T1}${number}` ? T1 : never;';
    const js = transpile(code);
    console.log('js', js);
    const type = transpileAndReturn(code) as (v: string | number) => Type;
    console.log(type);
});

test('multiple infer', () => {
    const code = 'type a2 = \'abcd\' extends `a${infer T}${infer T2}` ? [T, T2] : never;\n' +
        'return typeOf<a2>();';
    const js = transpile(code);
    console.log('js', js);
    const type = transpileAndReturn(code) as (v: string | number) => Type;
    console.log(type);
});

test('ClassType declaration', () => {
    const code = `
    interface ClassType<T = any> {
        new(...args: any[]): T;
    }

    return typeOf<ClassType<string>>();
    `;

    const js = transpile(code);
    console.log('js', js);
    const type = transpileAndReturn(code) as () => Type;
    expect(type).toMatchObject({
        kind: ReflectionKind.objectLiteral,
        types: [
            {
                kind: ReflectionKind.methodSignature,
                name: 'new',
                return: { kind: ReflectionKind.string },
                parameters: [{ kind: ReflectionKind.parameter, name: 'args', type: { kind: ReflectionKind.rest, type: { kind: ReflectionKind.any } } }]
            }
        ]
    });
});

test('ClassType infer', () => {
    const code = `
    interface ClassType<T = any> {
        new(...args: any[]): T;
    }

    class MyClass {
        id: number;
    }

    return typeOf<MyClass extends ClassType<infer R> ? R : never>();
    `;

    const js = transpile(code);
    console.log('js', js);
    const type = transpileAndReturn(code) as () => Type;
    expect(type).toMatchObject({
        kind: ReflectionKind.class,
        types: [
            {
                kind: ReflectionKind.property,
                name: 'id',
                type: { kind: ReflectionKind.number },
            }
        ]
    });
});

test('infer parameter in returned class constructor', () => {
    const code = `
    interface ClassType<T = any> {
        new(...args: any[]): T;
    }

    class StreamApiResponseClass<T> {
        constructor(public response: T) {
        }
    }

    function StreamApiResponse2<T>(responseBodyClass: ClassType<T>) {
        if (!responseBodyClass) throw new Error();

        class A extends StreamApiResponseClass<T> {
            constructor(public response: T) {
                super(response);
            }
        }

        return A;
    }

    return StreamApiResponse2;
    `;
    const js = transpile(code);
    console.log('js', js);
    const res = transpileAndReturn(code) as (v: ClassType) => ClassType;
    const type = resolveRuntimeType(res(class MyResponse {
    })) as TypeClass;
    console.log('type', stringifyType(type));
    expect((type.types[0] as TypeMethod).parameters[0].type.kind).toBe(ReflectionKind.class);
    console.log((type.types[0] as TypeMethod).parameters[0]);
});

test('index signature with template literal index', () => {
    const code = `
    type a1 = { [index: \`a\${number}\`]: number };
    return typeOf<a1>();
    `;
    const js = transpile(code);
    console.log('js', js);
    const type = transpileAndReturn(code) as Type;
    console.log(type);
});

test('complex infer T', () => {
    function fn1<T extends string | number>(v: T) {
        type inferT = typeof v;
    }

    type Box<T> = { a: T };

    function fn2<T extends string | number>(v: Box<{ b: T }>) {
        type inferT = typeof v extends Box<{ b: infer T }> ? T : never;
    }

    function fn3<T extends { [name: string]: any }, U extends keyof T>(v: Box<{ b: T }>, u?: U) {
        type inferU = keyof (typeof v extends Box<{ b: infer T }> ? T : never);
    }
});

test('infer T in function boxed primitive', () => {
    const code = `
        type Box<T> = { a: T };
        return function fn<T extends string | number>(v: Box<T>) {
            // type result = typeof v extends Box<{b: infer T}> ? T : never; //this needs to be generated. It just replaces T with infer T

            //todo: full validation happens with that program:
            // (typeof v extends Box<{b: infer T}> ? T : never) extends infer RES ? RES extends string | number ? RES : never : never;
            // this gives us also the information whether RES needs can be narrowed.
            return typeOf<T>();
        }
    `;

    type Box<T> = { a: T };

    function fn<T extends string | number>(v: Box<T>): T {
        return undefined as any;
    }

    const t1 = fn({ a: 'abc' });
    const t2 = fn({ a: 23 });

    const js = transpile(code);
    console.log('js', js);
    const type = transpileAndReturn(code) as (v: { a: any }) => Type;
    expectEqualType(type({ a: 'abc' }), { kind: ReflectionKind.literal, literal: 'abc' });
    expectEqualType(type({ a: 23 }), { kind: ReflectionKind.literal, literal: 23 });
    expectEqualType(type(false as any), { kind: ReflectionKind.never });
});

test('infer T in function inferred second template arg', () => {
    const code = `
        type Box<T> = T extends string ? 'string' : 'number';
        return function fn<T extends string | number, U extends Box<T>>(v: T) {
            return typeOf<U>();
        }
    `;
    const js = transpile(code);
    console.log('js', js);
    const type = transpileAndReturn(code) as (v: string | number) => Type;
    expect(type('abc')).toMatchObject({ kind: ReflectionKind.literal, literal: 'string' });
    expect(type(34)).toMatchObject({ kind: ReflectionKind.literal, literal: 'number' });
});

test('infer T in function branded type', () => {
    const code = `
        type PrimaryKey<T> = T & {__brand?: 'primaryKey'};

        return function fn<T extends PrimaryKey<any>>(v: T) {
            return typeOf<T>();
        }
    `;
    const js = transpile(code);
    console.log('js', js);
    const type = transpileAndReturn(code) as (v: string | number) => Type;
    expect(type('abc')).toEqual({ kind: ReflectionKind.literal, literal: 'abc' });
    expect(type(34)).toEqual({ kind: ReflectionKind.literal, literal: 34 });
});

test('correct T resolver', () => {
    const code = `
    return function a<T>(v: T) {
        return class {item: T}
    }
    `;
    const js = transpile(code);
    console.log('js', js);
    const type = transpileAndReturn(code) as (v: any) => ClassType;
    const classType = type('abc');
    expectEqualType(reflect(classType), {
        kind: ReflectionKind.class,
        classType: classType,
        types: [
            { kind: ReflectionKind.property, visibility: ReflectionVisibility.public, name: 'item', type: { kind: ReflectionKind.literal, literal: 'abc' } }
        ]
    } as Type);
});

test('dynamic class with member of outer T', () => {
    const code = `
        return function bla<T>(v: T) {
            class P {
                type!: T;
            }

            return P;
        }
    `;
    const js = transpile(code);
    console.log('js', js);
    const type = transpileAndReturn(code) as (v: string | number) => Type;
    console.log(type);
    console.log(type('abc'));
});

test('infer T in function alias', () => {
    const code = `
        type A<T> = T;
        return function fn<T extends string | number>(v: A<T>) {
            return typeOf<T>();
        }
    `;

    const js = transpile(code);
    console.log('js', js);
    const type = transpileAndReturn(code);
    console.log(type);
});

test('infer T in class', () => {
    const js = transpile(`
        class Wrap<T> {
            constructor(public item: T) {}
        }

        return new Wrap('abc');
    `);
    console.log('js', js);
});

test('resolve partial', () => {
    const type = transpileAndReturn(`
    type Partial2<T> = {
        [P in keyof T]?: T[P];
    }
    type o = { a: true | string };
    return typeOf<Partial2<o>>();`);

    expect(type).toMatchObject({
        kind: ReflectionKind.objectLiteral,
        types: [
            {
                kind: ReflectionKind.propertySignature,
                optional: true,
                name: 'a',
                type: {
                    kind: ReflectionKind.union, types: [
                        { kind: ReflectionKind.literal, literal: true },
                        { kind: ReflectionKind.string },
                    ]
                } as TypeUnion
            },
        ]
    });
});

test('resolve partial 2', () => {
    const code = `
    type Partial2<T> = {
        [P in keyof T]?: T[P];
    }

    type o = { a: string };
    type p = Partial2<o>;

    return typeOf<p>();`;

    const js = transpile(code);
    console.log('js', js);
    const type = transpileAndReturn(code);

    expect(type).toMatchObject({
        kind: ReflectionKind.objectLiteral,
        types: [
            {
                kind: ReflectionKind.propertySignature,
                optional: true,
                name: 'a',
                type: { kind: ReflectionKind.string }
            },
        ]
    });
});

test('conditional simple', () => {
    const code = `
    type Conditional = string extends string ? true : false;

    return typeOf<Conditional>();`;

    const js = transpile(code);
    console.log('js', js);
    const type = transpileAndReturn(code);

    expect(type).toMatchObject({
        kind: ReflectionKind.literal,
        literal: true,
    });
});

test('conditional map', () => {
    const code = `
    type IsString<T> = {
        [P in keyof T]: T[P] extends string ? true : false;
    }

    type o = { a: string, b: number };
    type p = IsString<o>;
    return typeOf<p>()`;

    const js = transpile(code);
    console.log('js', js);
    const type = transpileAndReturn(code);

    expect(type).toMatchObject({
        kind: ReflectionKind.objectLiteral,
        types: [
            { kind: ReflectionKind.propertySignature, name: 'a', type: { kind: ReflectionKind.literal, literal: true, } },
            { kind: ReflectionKind.propertySignature, name: 'b', type: { kind: ReflectionKind.literal, literal: false, } },
        ]
    });
});

test('conditional infer', () => {
    const code = `
    type Conditional = {t: string} extends {t: infer K} ? K : never;

    return typeOf<Conditional>();`;

    const js = transpile(code);
    console.log('js', js);
    const type = transpileAndReturn(code);

    expect(type).toMatchObject({
        kind: ReflectionKind.string
    });
});

test('nested object literal', () => {
    const code = `
    type o = { a: {t: string}, b: {t: number} };
    return typeOf<o>();`;

    const js = transpile(code);
    console.log('js', js);
    const type = transpileAndReturn(code);

    expect(type).toMatchObject({
        kind: ReflectionKind.objectLiteral,
        types: [
            {
                kind: ReflectionKind.propertySignature, name: 'a', type: {
                    kind: ReflectionKind.objectLiteral, types: [
                        { kind: ReflectionKind.propertySignature, name: 't', type: { kind: ReflectionKind.string } }
                    ]
                }
            },
            {
                kind: ReflectionKind.propertySignature, name: 'b', type: {
                    kind: ReflectionKind.objectLiteral, types: [
                        { kind: ReflectionKind.propertySignature, name: 't', type: { kind: ReflectionKind.number } }
                    ]
                }
            },
        ]
    });
});

test('branded type', () => {
    const code = `
    type ASD<T> = T & {__primaryKey?: true};
    return typeOf<ASD<string>>();`;

    const js = transpile(code);
    console.log('js', js);
    const type = transpileAndReturn(code);
    expectEqualType(type, {
        kind: ReflectionKind.string,
        annotations: {
            [defaultAnnotation.symbol]: [
                {
                    kind: ReflectionKind.objectLiteral, types: [
                        { kind: ReflectionKind.propertySignature, type: { kind: ReflectionKind.literal, literal: true }, optional: true, name: '__primaryKey' }
                    ]
                },
            ]
        }
    } as Type);
});

test('mapped type string index', () => {
    const code = `
    type A = {[K in 'asd']: string};
    return typeOf<A>();`;

    const js = transpile(code);
    console.log('js', js);
    const type = transpileAndReturn(code);
    expectEqualType(type, {
        kind: ReflectionKind.objectLiteral,
        types: [
            { kind: ReflectionKind.propertySignature, name: 'asd', type: { kind: ReflectionKind.string } },
        ]
    } as TypeObjectLiteral);
});

test('mapped type var index', () => {
    const code = `
    type A<T> = {[K in T]: string};
    return typeOf<A<'asd'>>();`;

    const js = transpile(code);
    console.log('js', js);
    const type = transpileAndReturn(code);
    expectEqualType(type, {
        kind: ReflectionKind.objectLiteral,
        types: [
            { kind: ReflectionKind.propertySignature, name: 'asd', type: { kind: ReflectionKind.string } },
        ]
    } as TypeObjectLiteral);
});

test('brand mapped type var index', () => {
    const code = `
    type A<T, name = 'brand'> = T & {[K in name]: string};
    return typeOf<A<string>>();`;

    const js = transpile(code);
    console.log('js', js);
    const type = transpileAndReturn(code);
    expectEqualType(type, {
        kind: ReflectionKind.string,
        annotations: {
            [defaultAnnotation.symbol]: [
                {
                    kind: ReflectionKind.objectLiteral, types: [
                        { kind: ReflectionKind.propertySignature, name: 'brand', type: { kind: ReflectionKind.string } },
                    ]
                }
            ]
        }
    } as Type);
});

test('brand mapped type var index/type', () => {
    const code = `
    type A<T, Branding, ReservedName = 'brand'> = T & {[K in ReservedName]: Branding};
    return typeOf<A<string, 'uuid'>>();`;

    const js = transpile(code);
    console.log('js', js);
    const type = transpileAndReturn(code);
    expectEqualType(type, {
        kind: ReflectionKind.string,
        annotations: {
            [defaultAnnotation.symbol]: [
                {
                    kind: ReflectionKind.objectLiteral, types: [
                        { kind: ReflectionKind.propertySignature, name: 'brand', type: { kind: ReflectionKind.literal, literal: 'uuid' } },
                    ]
                }
            ]
        }
    } as Type);
});

test('fn default argument', () => {
    const code = `
    type A<T = string> = T;
    return typeOf<A>();`;

    const js = transpile(code);
    console.log('js', js);
    const type = transpileAndReturn(code);
    expect(type.kind).toEqual(ReflectionKind.string);
});

test('ReceiveType standard function', () => {
    const code = `
    function cast<T>(type: ReceiveType<T>) {
        return reflect(type);
    }
    return cast<string>();`;

    const js = transpile(code);
    console.log('js', js);
    expect(js).toContain('type = cast.Ω?.[0]');
    expect(js).toContain('cast.Ω = undefined');
    //the declaration is known, so the type is passed directly as argument
    expect(js).toContain('cast(Ωt0)');

    const type = transpileAndReturn(code);
    expect(type).toEqual({ kind: ReflectionKind.string });
});

test('ReceiveType arrow function', () => {
    const code = `
    const cast = <T>(type: ReceiveType<T>) => {
        return reflect(type);
    }
    return cast<string>();`;

    const js = transpile(code);
    console.log('js', js);
    expect(js).toContain('type = cast.Ω?.[0]');
    expect(js).toContain('cast.Ω = undefined');
    //the declaration is known, so the type is passed directly as argument
    expect(js).toContain('cast(Ωt0)');

    const type = transpileAndReturn(code);
    expect(type).toEqual({ kind: ReflectionKind.string });
});

test('ReceiveType object property assignment arrow function', () => {
    const code = `
        const obj = {
          cast: <T>(type: ReceiveType<T>) => {
            return reflect(type);
          },
        };
        return obj.cast<string>();
    `;

    const js = transpile(code);
    console.log('js', js);
    expect(js).toContain('type = obj.cast.Ω?.[0]');
    expect(js).toContain('obj.cast.Ω = undefined');
    expect(js).toContain('obj.cast.Ω = [');

    const type = transpileAndReturn(code);
    expect(type).toEqual({ kind: ReflectionKind.string });
});


test('generic static', () => {
    const code = `
    interface Request<T> {
        body: T;
    }

    interface Body {
        title: string;
    }
    return typeOf<Request<Body>>();
    `;

    const js = transpile(code);
    console.log('js', js);
    const type = transpileAndReturn(code);
    expect(type).toMatchObject({
        kind: ReflectionKind.objectLiteral,
        types: [
            {
                kind: ReflectionKind.propertySignature, name: 'body', type: {

                    kind: ReflectionKind.objectLiteral,
                    types: [
                        { kind: ReflectionKind.propertySignature, name: 'title', type: { kind: ReflectionKind.string } },
                    ]
                }
            },
        ]
    });
});

test('generic dynamic', () => {
    const code = `
    interface Request<T> {
        body: T;
    }

    interface Body {
        title: string;
    }
    return typeOf<Request<never>>([typeOf<string>()]);
    `;

    const js = transpile(code);
    console.log('js', js);
    const type = transpileAndReturn(code);
    expect(type).toMatchObject({
        kind: ReflectionKind.objectLiteral,
        types: [
            {
                kind: ReflectionKind.propertySignature, name: 'body', type: { kind: ReflectionKind.string },
            }
        ]
    });
});

test('map conditional infer', () => {
    const code = `
    type Conditional<T> = {
        [P in keyof T]: T[P] extends {t: infer K} ? K : never;
    }
    type o = { a: {t: string}, b: {t: number} };
    return typeOf<Conditional<o>>();`;

    const js = transpile(code);
    console.log('js', js);
    const type = transpileAndReturn(code);

    expectEqualType(type, {
        kind: ReflectionKind.objectLiteral,
        types: [
            { kind: ReflectionKind.propertySignature, name: 'a', type: { kind: ReflectionKind.string, } },
            { kind: ReflectionKind.propertySignature, name: 'b', type: { kind: ReflectionKind.number, } },
        ]
    });
});

test('tuple with generic', () => {
    const code = `
    type Tuple<T extends any[]> = ['hi', ...T];
    type r = Tuple<[string, number]>;
    return typeOf<r>();`;

    const js = transpile(code);
    console.log('js', js);
    const type = transpileAndReturn(code);

    expectEqualType(type, {
        kind: ReflectionKind.tuple,
        types: [
            { kind: ReflectionKind.tupleMember, type: { kind: ReflectionKind.literal, literal: 'hi', } },
            { kind: ReflectionKind.tupleMember, type: { kind: ReflectionKind.string } },
            { kind: ReflectionKind.tupleMember, type: { kind: ReflectionKind.number } },
        ]
    });
});

test('class with constructor', () => {
    const code = `
    class User {
        created: Date = new Date;

        constructor(public username: string) {}

        say(text: string): void {
        }
    }
    return User;
    `;

    const js = transpile(code);
    console.log('js', js);
    const classType = transpileAndReturn(code) as ClassType;

    const type = reflect(classType);

    expect(type).toMatchObject({
        kind: ReflectionKind.class,
        classType: classType,
        types: [
            {
                kind: ReflectionKind.property,
                name: 'created',
                // default: () => new Date,
                visibility: ReflectionVisibility.public,
                type: { kind: ReflectionKind.class, classType: Date, types: [] }
            },
            {
                kind: ReflectionKind.method,
                name: 'constructor',
                visibility: ReflectionVisibility.public,
                return: { kind: ReflectionKind.any },
                parameters: [
                    {
                        kind: ReflectionKind.parameter,
                        name: 'username',
                        visibility: ReflectionVisibility.public,
                        type: { kind: ReflectionKind.string }
                    }
                ]
            },
            {
                kind: ReflectionKind.property,
                name: 'username',
                visibility: ReflectionVisibility.public,
                type: { kind: ReflectionKind.string }
            },
            {
                kind: ReflectionKind.method,
                name: 'say',
                visibility: ReflectionVisibility.public,
                return: { kind: ReflectionKind.void },
                parameters: [
                    {
                        kind: ReflectionKind.parameter,
                        name: 'text',
                        type: { kind: ReflectionKind.string }
                    }
                ]
            },
        ]
    } as TypeClass as Record<any, any>);
});

test('description', () => {
    const code = `
    interface User {
        /**
         * @see asd
         * @deprecated
         * @description Hello what up?
         * asdasd
         *
         * das
         */
        username: string;
    }
    return typeOf<User>();
    `;

    const js = transpile(code);
    console.log('js', js);
    const type = transpileAndReturn(code);

    expectEqualType(type, {
        kind: ReflectionKind.objectLiteral,
        types: [
            { kind: ReflectionKind.propertySignature, name: 'username', description: 'Hello what up?\nasdasd\n\ndas', type: { kind: ReflectionKind.string } }
        ]
    } as TypeObjectLiteral);
});

test('brand with symbol property', () => {
    const code = `
    const symbol = Symbol.for('computedType1');
    type MyBrand<T> = T & {[symbol]?: true};
    return typeOf<MyBrand<string>>();
    `;

    const js = transpile(code);
    console.log('js', js);
    const type = transpileAndReturn(code);
    expectEqualType(type, {
        kind: ReflectionKind.string,
        annotations: {
            [defaultAnnotation.symbol]: [
                {
                    kind: ReflectionKind.objectLiteral, types: [
                        { kind: ReflectionKind.propertySignature, name: Symbol.for('computedType1'), type: { kind: ReflectionKind.literal, literal: true }, optional: true }
                    ]
                },
            ]
        }
    } as Type);
});

test('intersection with symbol property', () => {
    const code = `
    const symbol = Symbol.for('computedType1');
    type MyBrand = {[symbol]?: true};
    return typeOf<string & MyBrand>();
    `;

    const js = transpile(code);
    console.log('js', js);
    const type = transpileAndReturn(code);
    expectEqualType(type, {
        kind: ReflectionKind.string,
        annotations: {
            [defaultAnnotation.symbol]: [
                {
                    kind: ReflectionKind.objectLiteral, typeName: 'MyBrand', types: [
                        { kind: ReflectionKind.propertySignature, name: Symbol.for('computedType1'), type: { kind: ReflectionKind.literal, literal: true }, optional: true }
                    ]
                },
            ]
        }
    } as Type);
});

test('branded type 2', () => {
    const code = `
    type PrimaryKey<T> = T & {__type?: 'primaryKey'};
    return typeOf<PrimaryKey<string>>();
    `;

    const js = transpile(code);
    console.log('js', js);
    const type = transpileAndReturn(code);
    expectEqualType(type, {
        kind: ReflectionKind.string,
        annotations: {
            [defaultAnnotation.symbol]: [
                {
                    kind: ReflectionKind.objectLiteral, types: [
                        {
                            kind: ReflectionKind.propertySignature,
                            name: '__type',
                            type: { kind: ReflectionKind.literal, literal: 'primaryKey' },
                            optional: true
                        }
                    ]
                },
            ]
        }
    } as Type);
});

test('brand intersection', () => {
    const code = `
    type PrimaryKey = {__type?: 'primaryKey'};

    return typeOf<string & PrimaryKey>();
    `;

    const js = transpile(code);
    console.log('js', js);
    const type = transpileAndReturn(code);
    expectEqualType(type, {
        kind: ReflectionKind.string,
        annotations: {
            [defaultAnnotation.symbol]: [
                {
                    kind: ReflectionKind.objectLiteral, typeName: 'PrimaryKey', types: [
                        { kind: ReflectionKind.propertySignature, name: '__type', type: { kind: ReflectionKind.literal, literal: 'primaryKey' }, optional: true }
                    ]
                },
            ]
        }
    } as Type);
});

test('interface extends base', () => {
    const code = `
        interface Base {
            base: boolean;
        }

        interface User extends Base {
            id: number;
        }
        return typeOf<User>();
    `;

    const js = transpile(code);
    console.log('js', js);
    const type = transpileAndReturn(code);
    console.log('type', type);
    expectEqualType(type, {
        kind: ReflectionKind.objectLiteral,
        types: [
            { kind: ReflectionKind.propertySignature, name: 'base', type: { kind: ReflectionKind.boolean } },
            { kind: ReflectionKind.propertySignature, name: 'id', type: { kind: ReflectionKind.number } },
        ]
    } as Type);
});

test('interface extends generic', () => {
    const code = `
        interface Base<T> {
            base: T;
        }

        interface User extends Base<boolean> {
            id: number;
        }
        return typeOf<User>();
    `;

    const js = transpile(code);
    console.log('js', js);
    const type = transpileAndReturn(code);
    console.log('type', type);
    expectEqualType(type, {
        kind: ReflectionKind.objectLiteral,
        types: [
            { kind: ReflectionKind.propertySignature, name: 'base', type: { kind: ReflectionKind.boolean } },
            { kind: ReflectionKind.propertySignature, name: 'id', type: { kind: ReflectionKind.number } },
        ]
    } as Type);
});

test('interface extends decorator', () => {
    const code = `
        type PrimaryKey = { __meta?: never & ['primaryKey'] };

        interface User extends PrimaryKey {
            id: number;
        }
        return typeOf<User>();
    `;

    const js = transpile(code);
    console.log('js', js);
    const type = transpileAndReturn(code) as Type;
    console.log('type', type);
    expectEqualType(type, {
        kind: ReflectionKind.objectLiteral,
        types: [
            { kind: ReflectionKind.propertySignature, name: 'id', type: { kind: ReflectionKind.number } },
        ]
    } as Type);

    assertType(type, ReflectionKind.objectLiteral);
    expect(type.annotations).toEqual({
        [primaryKeyAnnotation.symbol]: [true]
    });
});

test('brand intersection symbol', () => {
    const code = `
    const meta = Symbol.for('deepkit/meta');
    type PrimaryKey = { [meta]?: 'primaryKey' };

    return typeOf<string & PrimaryKey>();
    `;

    const js = transpile(code);
    console.log('js', js);
    const type = transpileAndReturn(code);
    expectEqualType(type, {
        kind: ReflectionKind.string,
        annotations: {
            [defaultAnnotation.symbol]: [
                {
                    kind: ReflectionKind.objectLiteral, typeName: 'PrimaryKey', types: [
                        { kind: ReflectionKind.propertySignature, name: Symbol.for('deepkit/meta'), type: { kind: ReflectionKind.literal, literal: 'primaryKey' }, optional: true }
                    ]
                },
            ]
        }
    } as Type);
});

test('circular 1', () => {
    const code = `
    type Page = {
        title: string;
        children: Page[]
    }
    return typeOf<Page>();
    `;

    const js = transpile(code);
    console.log('js', js);
    // const type = transpileAndReturn(code);
    // expect(type).toEqual({
    //     kind: ReflectionKind.intersection,
    //     types: [
    //         {kind: ReflectionKind.string},
    //         {
    //             kind: ReflectionKind.objectLiteral, types: [
    //                 {kind: ReflectionKind.propertySignature, name: Symbol.for('deepkit/meta'), type: {kind: ReflectionKind.literal, literal: 'primaryKey'}, optional: true}
    //             ]
    //         },
    //     ]
    // } as Type);
});


test('circular 2', () => {
    const code = `
    type Document = {
        title: string;
        root: Node;
    }

    type Node = {
        children: Node[]
    }

    return typeOf<Document>();
    `;

    const js = transpile(code);
    console.log('js', js);
});

test('circular class 2', () => {
    const code = `
    class Document {
        title!: string;
        root!: Node;
    }

    class Node {
    }

    return typeOf<Document>();
    `;

    const js = transpile(code);
    console.log('js', js);
    const type = transpileAndReturn(code);
    console.log('type', type);
});

test('InlineRuntimeType', () => {
    const code = `
        const stringType = {kind: ${ReflectionKind.string}};
        type t = {a: InlineRuntimeType<typeof stringType>}
        return typeOf<t>();
    `;

    const js = transpile(code);
    console.log('js', js);
    const type = transpileAndReturn(code);
    console.log('type', type.types[0].type);
    expect(type.types[0].type).toMatchObject({ kind: ReflectionKind.string });
});

test('InstanceType', () => {
    const code = `
        type InstanceType<T extends abstract new (...args: any) => any> = T extends abstract new (...args: any) => infer R ? R : any;
        type t = InstanceType<any>;
        return typeOf<t>();
    `;

    const js = transpile(code);
    console.log('js', js);
    const type = transpileAndReturn(code);
    console.log('type', type);
    expect(type).toMatchObject({ kind: ReflectionKind.unknown });
});

test('import types named import esm simple', () => {
    const js = transpile({
        'app': `
            import {User} from './user.js';
            typeOf<User>();
        `,
        'user': `export interface User {id: number}`
    });
    console.log('js', js);
    expect(js['app.js']).toContain(`__ΩUser`);

    expect(js['user.js']).toContain(`export { __ΩUser as __ΩUser };`);
    expect(js['user.d.ts']).toContain(`export declare type __ΩUser = any[]`);

    console.log(js);
});

test('import types named import esm', () => {
    const js = transpile({
        'app': `
            import {User} from './user.js';
            export type bla = string;
            export const hi = 'yes';
            type a = Partial<User>;
            typeOf<a>();
        `,
        'user': `export interface User {id: number}`
    });
    console.log('js', js);
    expect(js['app.js']).toContain(`__ΩUser`);
    expect(js['app.js']).toContain(`const __ΩPartial = [`);
    expect(js['app.js']).toContain(`export { __Ωbla as __Ωbla };`);
    expect(js['app.js']).toContain(`const __Ωa = [`);

    expect(js['user.js']).toContain(`export { __ΩUser as __ΩUser };`);
    expect(js['user.d.ts']).toContain(`export declare type __ΩUser = any[]`);

    console.log(js);
});

test('import types named import cjs', () => {
    const js = transpile({
        'app': `
            import {User} from './user.js';
            export type bla = string;
            export const hi = 'yes';
            type a = Partial<User>;
            typeOf<a>();
        `,
        'user': `export interface User {id: number}`
    }, { module: ModuleKind.CommonJS });
    console.log(js);
    expect(js['app.js']).toContain(`__ΩUser`);
    expect(js['app.js']).toContain(`const __ΩPartial = [`);
    expect(js['app.js']).toContain(`exports.__Ωbla = __Ωbla`);
    expect(js['app.js']).toContain(`const __Ωa = [`);

    expect(js['user.js']).toContain(`exports.__ΩUser = __ΩUser`);
    expect(js['user.d.ts']).toContain(`export declare type __ΩUser = any[]`);
});

test('emit typeName for type only imports', () => {
    const js = transpile({
        'app': `
            import type {User} from './user.js';
            typeOf<User>();
        `,
        'user': `export interface User {id: number}`
    }, {
        module: ModuleKind.CommonJS
    });
    const typeOf = typeOf2;
    expect(eval(js['app.js'])).toMatchInlineSnapshot(`
        {
          "kind": 1,
          "typeName": "User",
        }
    `);
});

test('emit typeName for named type only import', () => {
    const js = transpile({
        'app': `
            import {type User} from './user.js';
            typeOf<User>();
        `,
        'user': `export interface User {id: number}`
    }, {
        module: ModuleKind.CommonJS
    });
    const typeOf = typeOf2;
    expect(eval(js['app.js'])).toMatchInlineSnapshot(`
        {
          "kind": 1,
          "typeName": "User",
        }
    `);
});

test('import types named import typeOnly', () => {
    const js = transpile({
        'app': `
            import {type User} from './user.js';
            export type bla = string;
            export const hi = 'yes';
            type a = Partial<User>;
            typeOf<a>();
        `,
        'user': `export interface User {id: number}`
    });
    console.log(js);
    expect(js['app.js']).not.toContain(`__ΩUser`);
    expect(js['app.js']).toContain(`const __ΩPartial = [`);
    expect(js['app.js']).toContain(`export { __Ωbla as __Ωbla };`);
    expect(js['app.js']).toContain(`const __Ωa = [`);

    expect(js['user.js']).toContain(`export { __ΩUser as __ΩUser };`);
    expect(js['user.d.ts']).toContain(`export declare type __ΩUser = any[]`);
});

test('import types named import with disabled reflection', () => {
    const js = transpile({
        'app': `
            import {User} from './user.js';
            export type bla = string;
            export const hi = 'yes';
            type a = Partial<User>;
            typeOf<a>();
        `,
        'user': `/** @reflection never */ export interface User {id: number}`
    });
    expect(js['app.js']).not.toContain(`__ΩUser`);
    expect(js['app.js']).toContain(`const __ΩPartial = [`);
    expect(js['app.js']).toContain(`export { __Ωbla as __Ωbla };`);
    expect(js['app.js']).toContain(`const __Ωa = [`);
    expect(js['user.js']).not.toContain(`export { __ΩUser };`);
    expect(js['user.d.ts']).not.toContain(`__ΩUser`);

    console.log(js);
});

test('import types star import', () => {
    //not supported yet
    const js = transpile({
        'app.ts': `
            import * as user from './user.js';
            type a = Partial<user.User>;
            typeOf<a>();
        `,
        'user.ts': `export interface User {id: number}`
    });
    console.log(js);
});

test('multiple exports', () => {
    //not supported yet
    const js = transpile(`
        /**
         * @public
         */
        export interface ClassType<T = any> {
            new(...args: any[]): T;
        }

        /**
         * @public
         */
        export type AbstractClassType<T = any> = abstract new (...args: any[]) => T;

        export type ExtractClassType<T> = T extends ClassType<infer K> ? K : never;

    `);
    console.log(js);
});

test('enum literals', () => {
    //not supported yet
    const code = `
        enum Type {
            add,
            delete
        }

        interface Message {
            type: Type.delete;
            id: number;
        }

        return typeOf<Message>();
    `;
    const js = transpile(code);
    console.log('js', js);
    const type = transpileAndReturn(code);
    console.log('type', type);
    // expect(type).toMatchObject({ kind: ReflectionKind.unknown });
});

test('class implements', () => {
    const code = `
        interface A {}

        class Clazz implements A {}

        return typeOf<Clazz>();
    `;
    const js = transpile(code);
    console.log('js', js);
    const type = transpileAndReturn(code);
    console.log('type', type);
});

test('circular mapped type', () => {
    //todo: fix this
    const code = `

        type Placeholder<T> = () => T;
        type Resolve<T extends { _: Placeholder<any> }> = ReturnType<T['_']>;
        type Replace<T, R> = T & { _: Placeholder<R> };

        type Methods<T> = { [K in keyof T]: K extends keyof Query<any> ? never : K };

        class Query<T> {
            //for higher kinded type for selected fields
            _!: () => T;

            constructor(
                classSchema: ReflectionClass<T>,
                protected session: DatabaseSession<any>,
                protected resolver: GenericQueryResolver<T>
            ) {
            }

            public myMethod(): Methods<Query<T>> {
                return undefined as any;
            }

            protected async callOnFetchEvent(query: Query<any>): Promise<this> {
                return undefined as any;
            }

            public async find(): Promise<Resolve<this>[]> {
                return undefined as any;
            }
        }
        return typeOf<Query<any>>();
    `;

    const js = transpile(code);
    console.log('js', js);
    const type = transpileAndReturn(code);
    console.log('type', type);
});

test('pass type argument', () => {
    //not supported yet
    const code = `
        function test<T>() {

        }

        interface User {}

    `;
    const js = transpile(code);
    console.log('js', js);

    `
        (globals.Targs = () => [__ΩUser], test)();
    `;

    const t = () => a;
    const a = '';

    function test(a = (test as any).targs) {
        console.log('test', a);
    }

    class Database {
        query(a: any = (this as any).query.targs) {
            console.log('query', a);
        }
    }


    ((test as any).targs = () => [''], test)();

    const db = new Database();
    ((db.query as any).targs = [], db).query();

    // ((db.query as any).targs = () => [''], db.query)();

    // const type = transpileAndReturn(code);
    // console.log('type', type);
    // // expect(type).toMatchObject({ kind: ReflectionKind.unknown });
});
