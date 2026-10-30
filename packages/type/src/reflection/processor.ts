/*
 * Deepkit Framework
 * Copyright (c) Deepkit UG, Marc J. Schmidt
 *
 * This program is free software: you can redistribute it and/or modify
 * it under the terms of the MIT License.
 *
 * You should have received a copy of the MIT License along with this program.
 */

import {
    Annotations,
    applyScheduledAnnotations,
    CartesianProduct,
    copyAndSetParent,
    defaultAnnotation,
    flattenUnionTypes,
    getAnnotations,
    getMember,
    indexAccess,
    isMember,
    isPrimitive,
    isSameType,
    isType,
    isTypeIncluded,
    isWithAnnotations,
    merge,
    narrowOriginalLiteral,
    ReflectionKind,
    ReflectionVisibility,
    stringifyType,
    Type,
    TypeBaseMember,
    TypeCallSignature,
    TypeClass,
    typeDecorators,
    TypeEnumMember,
    TypeFunction,
    TypeIndexSignature,
    TypeInfer,
    TypeLiteral,
    TypeMethod,
    TypeMethodSignature,
    TypeObjectLiteral,
    TypeParameter,
    TypePromise,
    TypeProperty,
    TypePropertySignature,
    TypeTemplateLiteral,
    TypeTupleMember,
    TypeUnion,
    unboxUnion,
    validationAnnotation,
    widenLiteral,
} from './type.js';
import { MappedModifier, ReflectionOp, TypeIntrinsic } from '@deepkit/type-spec';
import { isExtendable } from './extends.js';
import { ClassType, isArray, isClass, isFunction, stringifyValueWithType } from '@deepkit/core';
import { isWithDeferredDecorators } from '../decorator.js';
import { ReflectionClass, TData } from './reflection.js';
import { state } from './state.js';
import { debug } from '../debug.js';

export type RuntimeStackEntry = Type | Object | (() => ClassType | Object) | string | number | boolean | bigint;

export type Packed<T = any> = (RuntimeStackEntry | string)[] & { __is?: (data: any) => boolean } & { __type?: Type } & { __unpack?: PackStruct };

export class PackStruct {
    constructor(
        public ops: ReflectionOp[] = [],
        public stack: RuntimeStackEntry[] = [],
    ) {
    }
}

function unpackOps(decodedOps: ReflectionOp[], encodedOPs: string): void {
    for (let i = 0; i < encodedOPs.length; i++) {
        decodedOps.push(encodedOPs.charCodeAt(i) - 33);
    }
}

export function encodeOps(ops: ReflectionOp[]): string {
    return ops.map(v => String.fromCharCode(v + 33)).join('');
}

/**
 * Pack a pack structure (op instructions + pre-defined stack) and create a encoded version of it.
 */
export function pack(packOrOps: PackStruct | ReflectionOp[]): Packed {
    const ops = isArray(packOrOps) ? packOrOps : packOrOps.ops;
    const encodedOps = encodeOps(ops);

    if (!isArray(packOrOps)) {
        if (packOrOps.stack.length) {
            return [...packOrOps.stack as RuntimeStackEntry[], encodedOps];
        }
    }

    return [encodedOps];
}

export function unpack(pack: Packed): PackStruct {
    const ops: ReflectionOp[] = [];

    const encodedOPs = pack[pack.length - 1];

    //the end has always to be a string
    if ('string' !== typeof encodedOPs) return { ops: [], stack: [] };

    unpackOps(ops, encodedOPs);

    return { ops, stack: pack.length > 1 ? pack.slice(0, -1) : [] };
}

export function resolvePacked(type: Packed, args: any[] = [], options?: ReflectOptions): Type {
    return resolveRuntimeType(type, args, options) as Type;
}

function isPack(o: any): o is Packed {
    return isArray(o);
}

/**
 * Computes a type of given object. This function caches the result on the object itself.
 * This is the slow path, using the full type virtual machine to resolve the type.
 * If you want to handle some fast paths (including cache), try using resolveReceiveType() instead.
 */
export function resolveRuntimeType(o: ClassType | Function | Packed | any, args: any[] = [], options?: ReflectOptions): Type {
    const type = Processor.get().reflect(o, args, options || { reuseCached: true });

    if (isType(type)) {
        return type as Type;
    }

    throw new Error('No type returned from runtime type program');
}

interface Frame {
    index: number; //just the general frame index
    startIndex: number; //when the frame started, index of the stack
    variables: number;
    inputs: RuntimeStackEntry[];
    previous?: Frame;
    mappedType?: Loop;
    distributiveLoop?: Loop;
}

class Loop {
    private types: Type[] = [];
    private i: number = 0;

    constructor(public fromType: Type) {
        if (fromType.kind === ReflectionKind.union) {
            this.types = fromType.types;
        } else {
            this.types = [fromType];
        }
    }

    next(): Type | undefined {
        return this.types[this.i++];
    }
}

interface Program {
    frame: Frame;
    active: boolean;
    stack: (RuntimeStackEntry | Type)[];
    stackPointer: number; //pointer to the stack
    program: number; //pointer to the current op
    depth: number;
    initialStack: (RuntimeStackEntry | Type)[];
    resultType: Type;
    ops: ReflectionOp[];
    end: number;
    inputs: RuntimeStackEntry[];
    resultTypes?: Type[];
    started: number;
    typeParameters?: Type[];
    previous?: Program;
    //don't operate on newly created ref resultType but return whatever is on the stack directly
    //used in inline-only programs like `typeOf<MyAlias>()` where we want the type of (cached) MyAlias and not a new reference.
    directReturn?: boolean;
    object?: ClassType | Function | Packed | any;
}

function assignResult<T extends Type>(ref: Type, result: T, assignParents: boolean): T {
    Object.assign(ref, result);

    if (assignParents) {
        // if (ref.kind === ReflectionKind.class && ref.arguments) {
        //     for (const member of ref.arguments) member.parent = ref;
        // }

        if (ref.kind === ReflectionKind.function || ref.kind === ReflectionKind.method || ref.kind === ReflectionKind.methodSignature) {
            ref.return.parent = ref;
            for (const member of ref.parameters) member.parent = ref as any;
        }

        if ('types' in ref) {
            for (const member of ref.types) {
                member.parent = ref;
            }
        }
    }

    return ref as T;
}

function isConditionTruthy(condition: Type | number): boolean {
    if ('number' === typeof condition) return condition !== 0;
    return !!(condition.kind === ReflectionKind.literal && condition.literal);
}

function createProgram(options: Partial<Program>, inputs?: RuntimeStackEntry[]): Program {
    const program: Program = {
        active: true,
        frame: { index: 0, startIndex: -1, inputs: inputs || [], variables: 0, previous: undefined },
        stack: options.stack || [],
        stackPointer: options.stackPointer ?? -1,
        program: 0,
        depth: 0,
        initialStack: options.initialStack || [],
        resultType: options.resultType || { kind: ReflectionKind.unknown },
        ops: options.ops || [],
        end: options.end ?? (options.ops ? options.ops.length : 0),
        inputs: inputs || [],
        started: Date.now(),
        // resultTypes: [],
        // typeParameters: [],
        // previous: undefined,
        object: options.object,
    };

    if (options.initialStack) for (let i = 0; i < options.initialStack.length; i++) {
        if (i < program.stack.length) {
            program.stack[i] = options.initialStack[i];
        } else {
            program.stack.push(options.initialStack[i]);
        }
    }

    program.stackPointer = options.initialStack ? options.initialStack.length - 1 : -1;
    program.frame.startIndex = program.stackPointer;

    return program;
}

function isValidCacheEntry(current: Program, object: ClassType | Function | Packed | any, inputs: RuntimeStackEntry[] = []): Program | undefined {
    if (current.object === object) {
        //issue a new reference if inputs are the same
        //todo: when a function has a default, this is not set in current.inputs, and could fail when it differs to given inputs
        let sameInputs = current.inputs.length === inputs.length;
        if (sameInputs) {
            for (let i = 0; i < current.inputs.length; i++) {
                if (!inputs[i] || !isSameType(current.inputs[i] as Type, inputs[i] as Type)) {
                    sameInputs = false;
                    break;
                }
            }
            if (sameInputs) {
                return current;
            }
        }
    }
    return;
}

function findExistingProgram(current: Program | undefined, object: ClassType | Function | Packed | any, inputs: RuntimeStackEntry[] = []) {
    let checks = 0;
    while (current) {
        if (current.object === object) {
            checks++;
            //as safety check to never go into an endless loop, we return just this program if objects matches and we are 1000 programs deep.
            if (checks > 1000) return current;

            //issue a new reference if inputs are the same
            //todo: when a function has a default, this is not set in current.inputs, and could fail when it differs to given inputs
            let sameInputs = current.inputs.length === inputs.length;
            if (sameInputs) {
                for (let i = 0; i < current.inputs.length; i++) {
                    if (!inputs[i] || !isSameType(current.inputs[i] as Type, inputs[i] as Type)) {
                        sameInputs = false;
                        break;
                    }
                }
                if (sameInputs) return current;
            }
        }

        current = current.previous;
    }

    return;
}

function createRef(current: Program): Type {
    if (!current.resultTypes) current.resultTypes = [];
    const ref: Type = { ...current.resultType };
    current.resultTypes.push(ref);
    return ref;
}

export interface ReflectOptions {
    /**
     *
     */
    reuseCached?: boolean;

    inline?: boolean;

    typeName?: string;
}

/**
 * @reflection never
 */
export class Processor {
    static typeProcessor?: Processor;

    static get(): Processor {
        return Processor.typeProcessor ||= new Processor();
    }

    private cache: Program[] = [];

    /**
     * Linked list of programs to execute. For each external call to external program will this be changed.
     */
    protected program: Program = {
        active: false,
        frame: { index: 0, startIndex: -1, inputs: [], variables: 0 },
        stack: [],
        stackPointer: -1,
        program: 0,
        depth: 0,
        initialStack: [],
        resultType: { kind: ReflectionKind.unknown },
        // resultTypes: [],
        inputs: [],
        end: 0,
        ops: [],
        started: 0,
        // previous: undefined,
        // object: undefined,
    };

    reflect(object: ClassType | Function | Packed | any, inputs: RuntimeStackEntry[] = [], options: ReflectOptions = {}): Type {
        const start = Date.now();
        const result = this._reflect(object, inputs, options);

        const took = Date.now() - start;
        if (took > 100) {
            console.warn(`Type computation took very long ${took}ms for ${stringifyType(result)}`);
        }
        return result;
    }

    _reflect(object: ClassType | Function | Packed | any, inputs: RuntimeStackEntry[] = [], options: ReflectOptions = {}): Type {
        const packed: Packed | undefined = isPack(object) ? object : object.__type;
        if (!packed) {
            if (isFunction(object) && object.length === 0) {
                //functions without any type annotations do not have the overhead of an assigned __type
                return {
                    kind: ReflectionKind.function,
                    function: object, name: object.name,
                    parameters: [], return: { kind: ReflectionKind.any },
                };
            }
            throw new Error(`No valid runtime type for ${stringifyValueWithType(object)} given. Is @deepkit/type-compiler correctly installed? Execute deepkit-type-install to check`);
        }

        for (let i = 0; i < inputs.length; i++) {
            if (isClass(inputs[i])) inputs[i] = resolveRuntimeType(inputs[i]);
        }

        //this checks if there is an active program still running for given packed. if so, issue a new reference.
        //this reference is changed (its content only via Object.assign(reference, computedValues)) once the program finished.
        //this is independent of reuseCache since it's the cache for the current 'run', not a global cache
        const found = findExistingProgram(this.program, object, inputs);
        if (found) {
            const result = createRef(found);
            result.typeName ||= options.typeName;
            return result;
        }

        //the cache of already computed types is stored on the Packed (the array of the type program) because it's a static object that never changes
        //and will be GC correctly (and with it this cache). Its crucial that not all reflect() calls cache the content, otherwise it would pollute the
        //memory with useless types. For example a global type Partial<> would hold all its instances, what we do not want.
        //We cache only direct non-generic (inputs empty) types passed to typeOf<>() or resolveRuntimeType(). all other reflect() calls do not use this cache.
        //make sure the same type is returned if already known.
        //packed.length === 0 for deserialized TypeClass with reconstructed classes.
        if ((options.reuseCached || packed.length === 0) && packed.__type && inputs.length === 0) {
            return packed.__type;
        }

        //all computed types should be cached until the program terminates, otherwise a lot of types will be computed
        //way too often. This means we have a much bigger array cache and put everything in there, even for generics,
        //and clear the cache once the program terminates. findExistingProgram will be replaced by that.
        //with this change we could also remove the linked structure of Program and put it into an array as well.
        for (const cache of this.cache) {
            if (isValidCacheEntry(cache, object, inputs)) {
                //if program is still active, create new ref otherwise copy computed type
                const result = cache.active ? createRef(cache) : copyAndSetParent(cache.resultType);
                result.typeName ||= options.typeName;
                return result;
            }
        }

        //if reuseCached is disabled but there is already a computed type, we return that as shallow clone
        if (!options.reuseCached && packed.__type && inputs.length === 0) {
            const result = copyAndSetParent(packed.__type);
            result.typeName ||= options.typeName;
            if (options.inline) result.inlined = true;
            return result;
        }

        // process.stdout.write(`${options.reuseCached} Cache miss ${stringifyValueWithType(object)}(...${inputs.length})\n`);
        const pack = packed.__unpack ||= unpack(packed);
        const program = createProgram({ ops: pack.ops, initialStack: pack.stack, object }, inputs);
        const type = this.runProgram(program);
        type.typeName ||= options.typeName;

        if (inputs.length === 0) {
            packed.__type = type;
        }

        if (options.inline === true) {
            //when inline was used, we do not return the original type, because inline means it's part of another type
            //and its properties will change depending on the context (e.g. parent), which should not propagate to the original type.
            const result = createRef(program);
            result.typeName ||= options.typeName;
            result.inlined = true;
            return result;
        }

        return type;
    }

    run(ops: ReflectionOp[], initialStack: RuntimeStackEntry[], inputs: RuntimeStackEntry[] = [], object?: ClassType | Function | Packed | any): Type {
        return this.runProgram(createProgram({ ops, initialStack, object }, inputs));
    }

    runProgram(program: Program): Type {
        const loopRunning = this.program.end !== 0;
        program.previous = this.program;
        program.depth = this.program.depth + 1;
        this.program = program;
        this.cache.push(program);

        // process.stdout.write(`jump to program: ${stringifyValueWithType(program.object)}\n`);
        if (!loopRunning) {
            return this.loop(program) as Type;
        }

        return program.resultType;
    }

    /**
     * Semantic is important here: This triggers true only for the very last op of a program.
     * If it is checked in OP inline then it could be true or false:
     *
     * type t<T> = T; => false since we have nominal past the inline op
     * typeOf<T>() => true since we have no nominal past the inline op
     */
    protected isEnded(): boolean {
        return this.program.program + 1 >= this.program.end;
    }

    /**
     * Runs all scheduled programs until termination.
     */
    protected loop(until?: Program): Type | RuntimeStackEntry {
        let result = this.program.stack[0];

        programLoop:
            while (this.program.active) {
                const program = this.program;
                // process.stdout.write(`jump to program: ${stringifyValueWithType(program.object)}\n`);
                for (; program.program < program.end; program.program++) {
                    const op = program.ops[program.program];

                    // process.stdout.write(`[${program.depth}:${program.frame.index}] step ${program.program} ${ReflectionOp[op]}\n`);
                    switch (op) {
                        case ReflectionOp.string:
                            this.pushType({ kind: ReflectionKind.string });
                            break;
                        case ReflectionOp.number:
                            this.pushType({ kind: ReflectionKind.number });
                            break;
                        case ReflectionOp.numberBrand:
                            const ref = this.eatParameter() as number;
                            this.pushType({ kind: ReflectionKind.number, brand: ref });
                            break;
                        case ReflectionOp.boolean:
                            this.pushType({ kind: ReflectionKind.boolean });
                            break;
                        case ReflectionOp.void:
                            this.pushType({ kind: ReflectionKind.void });
                            break;
                        case ReflectionOp.unknown:
                            this.pushType({ kind: ReflectionKind.unknown });
                            break;
                        case ReflectionOp.object:
                            this.pushType({ kind: ReflectionKind.object });
                            break;
                        case ReflectionOp.never:
                            this.pushType({ kind: ReflectionKind.never });
                            break;
                        case ReflectionOp.undefined:
                            this.pushType({ kind: ReflectionKind.undefined });
                            break;
                        case ReflectionOp.bigint:
                            this.pushType({ kind: ReflectionKind.bigint });
                            break;
                        case ReflectionOp.symbol:
                            this.pushType({ kind: ReflectionKind.symbol });
                            break;
                        case ReflectionOp.null:
                            this.pushType({ kind: ReflectionKind.null });
                            break;
                        case ReflectionOp.any:
                            this.pushType({ kind: ReflectionKind.any });
                            break;
                        case ReflectionOp.literal: {
                            const ref = this.eatParameter() as number;
                            this.pushType({ kind: ReflectionKind.literal, literal: program.stack[ref] as string | number | boolean | bigint });
                            break;
                        }
                        case ReflectionOp.templateLiteral: {
                            this.handleTemplateLiteral();
                            break;
                        }
                        case ReflectionOp.date:
                            this.pushType({ kind: ReflectionKind.class, classType: Date, types: [] });
                            break;
                        case ReflectionOp.uint8Array:
                            this.pushType({ kind: ReflectionKind.class, classType: Uint8Array, types: [] });
                            break;
                        case ReflectionOp.int8Array:
                            this.pushType({ kind: ReflectionKind.class, classType: Int8Array, types: [] });
                            break;
                        case ReflectionOp.uint8ClampedArray:
                            this.pushType({ kind: ReflectionKind.class, classType: Uint8ClampedArray, types: [] });
                            break;
                        case ReflectionOp.uint16Array:
                            this.pushType({ kind: ReflectionKind.class, classType: Uint16Array, types: [] });
                            break;
                        case ReflectionOp.int16Array:
                            this.pushType({ kind: ReflectionKind.class, classType: Int16Array, types: [] });
                            break;
                        case ReflectionOp.uint32Array:
                            this.pushType({ kind: ReflectionKind.class, classType: Uint32Array, types: [] });
                            break;
                        case ReflectionOp.int32Array:
                            this.pushType({ kind: ReflectionKind.class, classType: Int32Array, types: [] });
                            break;
                        case ReflectionOp.float32Array:
                            this.pushType({ kind: ReflectionKind.class, classType: Float32Array, types: [] });
                            break;
                        case ReflectionOp.float64Array:
                            this.pushType({ kind: ReflectionKind.class, classType: Float64Array, types: [] });
                            break;
                        case ReflectionOp.bigInt64Array:
                            this.pushType({
                                kind: ReflectionKind.class,
                                classType: 'undefined' !== typeof BigInt64Array ? BigInt64Array : class BigInt64ArrayNotAvailable {
                                },
                                types: [],
                            });
                            break;
                        case ReflectionOp.arrayBuffer:
                            this.pushType({ kind: ReflectionKind.class, classType: ArrayBuffer, types: [] });
                            break;
                        case ReflectionOp.class: {
                            const types = this.popFrame() as Type[];
                            let t = { kind: ReflectionKind.class, id: state.nominalId++, classType: Object, types: [] } as TypeClass;

                            function add(member: Type) {
                                if (member.kind === ReflectionKind.propertySignature) {
                                    member = {
                                        ...member,
                                        parent: t,
                                        visibility: ReflectionVisibility.public,
                                        kind: ReflectionKind.property,
                                    } as TypeProperty;
                                } else if (member.kind === ReflectionKind.methodSignature) {
                                    member = {
                                        ...member,
                                        parent: t,
                                        visibility: ReflectionVisibility.public,
                                        kind: ReflectionKind.method,
                                    } as TypeMethod;
                                }

                                switch (member.kind) {
                                    case ReflectionKind.indexSignature: {
                                        //todo, replace the old one?
                                        t.types.push(member);
                                        break;
                                    }
                                    case ReflectionKind.property:
                                    case ReflectionKind.method: {
                                        const existing = t.types.findIndex(v => (v.kind === ReflectionKind.property || v.kind === ReflectionKind.method) && v.name === (member as TypeProperty | TypeMethod).name);
                                        if (existing !== -1) {
                                            //remove entry, since we replace it
                                            t.types.splice(existing, 1);
                                        }
                                        t.types.push(member);

                                        if (member.kind === ReflectionKind.method && member.name === 'constructor') {
                                            for (const parameter of member.parameters) {
                                                if (parameter.visibility !== undefined || parameter.readonly) {
                                                    const property = {
                                                        kind: ReflectionKind.property,
                                                        name: parameter.name,
                                                        visibility: parameter.visibility,
                                                        default: parameter.default,
                                                        type: parameter.type,
                                                    } as TypeProperty;
                                                    if (parameter.optional) property.optional = true;
                                                    if (parameter.readonly) property.readonly = true;
                                                    parameter.type.parent = property;
                                                    add(property);
                                                }
                                            }
                                        }
                                        break;
                                    }
                                }
                            }

                            for (const member of types) {
                                switch (member.kind) {
                                    case ReflectionKind.objectLiteral:
                                    case ReflectionKind.class: {
                                        for (const sub of member.types) add(sub);
                                        break;
                                    }
                                    case ReflectionKind.indexSignature:
                                    case ReflectionKind.property:
                                    case ReflectionKind.method: {
                                        add(member);
                                    }
                                }
                                // if (member.kind === ReflectionKind.property) member.type = widenLiteral(member.type);
                            }
                            const args = program.frame.inputs.filter(isType);

                            for (const member of t.types) member.parent = t;
                            if (t.arguments) for (const member of t.arguments) member.parent = t;

                            if (args.length) t.arguments = args;
                            t.typeArguments = program.typeParameters;

                            this.pushType(t);
                            break;
                        }
                        case ReflectionOp.widen: {
                            const current = (program.stack[program.stackPointer] as Type);
                            if (current.kind === ReflectionKind.literal) {
                                this.pushType(widenLiteral(this.pop() as TypeLiteral));
                            }
                            break;
                        }
                        case ReflectionOp.classExtends: {
                            const argsNumber = this.eatParameter() as number;
                            const typeArguments: Type[] = [];
                            for (let i = 0; i < argsNumber; i++) {
                                typeArguments.push(this.pop() as Type);
                            }

                            (program.stack[program.stackPointer] as TypeClass).extendsArguments = typeArguments;

                            break;
                        }
                        case ReflectionOp.implements: {
                            const argsNumber = this.eatParameter() as number;
                            const types: Type[] = [];
                            for (let i = 0; i < argsNumber; i++) {
                                types.push(this.pop() as Type);
                            }

                            (program.stack[program.stackPointer] as TypeClass).implements = types;

                            break;
                        }
                        case ReflectionOp.parameter: {
                            const ref = this.eatParameter() as number;
                            const t: Type = { kind: ReflectionKind.parameter, parent: undefined as any, name: program.stack[ref] as string, type: this.pop() as Type };
                            if (t.type) t.type.parent = t;
                            this.pushType(t);
                            break;
                        }
                        case ReflectionOp.functionReference:
                        case ReflectionOp.classReference: {
                            const ref = this.eatParameter() as number;
                            const classOrFunction = resolveFunction(program.stack[ref] as Function, program.object);
                            const inputs = this.popFrame() as Type[];
                            if (!classOrFunction) {
                                this.pushType({ kind: ReflectionKind.unknown });
                                break;
                            }

                            if (!classOrFunction.__type) {
                                if (op === ReflectionOp.classReference) {
                                    this.pushType({ kind: ReflectionKind.class, classType: classOrFunction, typeArguments: inputs, types: [] });
                                } else if (op === ReflectionOp.functionReference) {
                                    this.pushType({ kind: ReflectionKind.function, function: classOrFunction, parameters: [], return: { kind: ReflectionKind.unknown } });
                                }
                            } else {
                                //when it's just a simple reference resolution like typeOf<Class>() then enable cache re-use (so always the same type is returned)
                                const directReference = !!(this.isEnded() && program.previous && program.previous.end === 0);
                                const result = this.reflect(classOrFunction, inputs, { inline: !directReference, reuseCached: directReference });
                                if (directReference) program.directReturn = true;
                                this.push(result, program);

                                if (isWithAnnotations(result) && inputs.length) {
                                    result.typeArguments = result.typeArguments || [];
                                    for (let i = 0; i < inputs.length; i++) {
                                        result.typeArguments[i] = inputs[i];
                                    }
                                }

                                //this.reflect/run might create another program onto the stack. switch to it if so
                                if (this.program !== program) {
                                    //continue to next this.program.
                                    program.program++; //manual increment as the for loop would normally do that
                                    continue programLoop;
                                }
                            }
                            break;
                        }
                        case ReflectionOp.enum: {
                            const types = this.popFrame() as TypeEnumMember[];
                            const enumType: { [name: string]: string | number } = {};

                            let i = 0;
                            for (const type of types) {
                                if (type.default) {
                                    const v = type.default();
                                    enumType[type.name] = v;
                                    if ('number' === typeof v) {
                                        i = v + 1;
                                    }
                                } else {
                                    enumType[type.name] = i++;
                                }
                            }
                            const values = Object.values(enumType);
                            const t: Type = { kind: ReflectionKind.enum, enum: enumType, values, indexType: getEnumType(values) };
                            this.pushType(t);
                            break;
                        }
                        case ReflectionOp.enumMember: {
                            const name = program.stack[this.eatParameter() as number] as string | (() => string);
                            this.pushType({
                                kind: ReflectionKind.enumMember,
                                parent: undefined as any,
                                name: isFunction(name) ? name() : name,
                            });
                            break;
                        }
                        case ReflectionOp.tuple: {
                            this.handleTuple();
                            break;
                        }
                        case ReflectionOp.tupleMember: {
                            const t: TypeTupleMember = {
                                kind: ReflectionKind.tupleMember, type: this.pop() as Type,
                                parent: undefined as any,
                            };
                            t.type.parent = t;
                            this.pushType(t);
                            break;
                        }
                        case ReflectionOp.namedTupleMember: {
                            const name = program.stack[this.eatParameter() as number] as string;
                            const t: Type = {
                                kind: ReflectionKind.tupleMember, type: this.pop() as Type,
                                parent: undefined as any,
                                name: isFunction(name) ? name() : name,
                            };
                            t.type.parent = t;
                            this.pushType(t);
                            break;
                        }
                        case ReflectionOp.rest: {
                            const t: Type = {
                                kind: ReflectionKind.rest,
                                parent: undefined as any,
                                type: this.pop() as Type,
                            };
                            t.type.parent = t;
                            this.pushType(t);
                            break;
                        }
                        case ReflectionOp.regexp: {
                            this.pushType({ kind: ReflectionKind.regexp });
                            break;
                        }
                        case ReflectionOp.typeParameter:
                        case ReflectionOp.typeParameterDefault: {
                            const nameRef = this.eatParameter() as number;
                            program.typeParameters = program.typeParameters || [];
                            let type = program.frame.inputs[program.frame.variables++];

                            if (op === ReflectionOp.typeParameterDefault) {
                                const defaultValue = this.pop();
                                if (type === undefined) {
                                    type = defaultValue;
                                }
                            }

                            if (type === undefined) {
                                //generic not instantiated
                                program.typeParameters.push({ kind: ReflectionKind.any, typeParameter: true } as any);
                                this.pushType({ kind: ReflectionKind.typeParameter, name: program.stack[nameRef] as string });
                            } else {
                                program.typeParameters.push(type as Type);
                                this.pushType(type as Type);
                            }
                            break;
                        }
                        case ReflectionOp.set: {
                            const t: Type = { kind: ReflectionKind.class, classType: Set, arguments: [this.pop() as Type], types: [] };
                            t.arguments![0].parent = t;
                            this.pushType(t);
                            break;
                        }
                        case ReflectionOp.map: {
                            const value = this.pop() as Type;
                            const key = this.pop() as Type;
                            const t: TypeClass = { kind: ReflectionKind.class, classType: Map, arguments: [key, value], types: [] };
                            t.arguments![0].parent = t;
                            t.arguments![1].parent = t;
                            this.pushType(t);
                            break;
                        }
                        case ReflectionOp.promise: {
                            const type = this.pop() as Type;
                            const t: TypePromise = { kind: ReflectionKind.promise, type };
                            t.type.parent = t;
                            this.pushType(t);
                            break;
                        }
                        case ReflectionOp.union: {
                            const types = this.popFrame() as Type[];
                            const flattened = flattenUnionTypes(types);
                            const t: Type = unboxUnion({ kind: ReflectionKind.union, types: flattened });
                            if (t.kind === ReflectionKind.union) {
                                for (const member of t.types) {
                                    member.parent = t;
                                }
                            }
                            this.pushType(t);
                            break;
                        }
                        case ReflectionOp.intersection: {
                            let t = this.handleIntersection();
                            if (t) this.pushType(t);
                            break;
                        }
                        case ReflectionOp.callSignature:
                        case ReflectionOp.function: {
                            const types = this.popFrame() as Type[];
                            let name = program.stack[this.eatParameter() as number] as string;

                            const returnType = types.length > 0 ? types[types.length - 1] as Type : { kind: ReflectionKind.any } as Type;
                            const parameters = types.length > 1 ? types.slice(0, -1) as TypeParameter[] : [];
                            if (isFunction(name)) name = name();

                            let t = op === ReflectionOp.callSignature ? {
                                kind: ReflectionKind.callSignature,
                                return: returnType,
                                parameters,
                            } as TypeCallSignature : {
                                kind: ReflectionKind.function,
                                name: name || undefined,
                                return: returnType,
                                parameters,
                            } as TypeFunction;
                            t.return.parent = t;
                            for (const member of t.parameters) member.parent = t;
                            this.pushType(t);
                            break;
                        }
                        case ReflectionOp.array: {
                            const t: Type = { kind: ReflectionKind.array, type: this.pop() as Type };
                            t.type.parent = t;
                            this.pushType(t);
                            break;
                        }
                        case ReflectionOp.property:
                        case ReflectionOp.propertySignature: {
                            const name = program.stack[this.eatParameter() as number] as number | string | symbol | (() => symbol);
                            let type = this.pop() as Type;
                            let isOptional = false;

                            if (type.kind === ReflectionKind.union && type.types.length === 2) {
                                const undefinedType = type.types.find(v => v.kind === ReflectionKind.undefined);
                                const restType = type.types.find(v => v.kind !== ReflectionKind.null && v.kind !== ReflectionKind.undefined);
                                if (restType && undefinedType) {
                                    type = restType;
                                    isOptional = true;
                                }
                            }

                            const property = {
                                kind: op === ReflectionOp.propertySignature ? ReflectionKind.propertySignature : ReflectionKind.property,
                                type,
                                name: isFunction(name) ? name() : name,
                            } as TypeProperty | TypePropertySignature;

                            if (isOptional) {
                                property.optional = true;
                            }

                            if (op === ReflectionOp.property) {
                                (property as TypeProperty).visibility = ReflectionVisibility.public;
                            }

                            property.type.parent = property;
                            this.pushType(property);
                            break;
                        }
                        case ReflectionOp.method:
                        case ReflectionOp.methodSignature: {
                            let name = program.stack[this.eatParameter() as number] as number | string | symbol | (() => symbol);
                            const types = this.popFrame() as Type[];
                            const returnType = types.length > 0 ? types[types.length - 1] as Type : { kind: ReflectionKind.any } as Type;
                            const parameters: TypeParameter[] = types.length > 1 ? types.slice(0, -1) as TypeParameter[] : [];
                            if (isFunction(name)) name = name();

                            let t: TypeMethod | TypeMethodSignature = op === ReflectionOp.method
                                ? { kind: ReflectionKind.method, parent: undefined as any, visibility: ReflectionVisibility.public, name, return: returnType, parameters }
                                : { kind: ReflectionKind.methodSignature, parent: undefined as any, name, return: returnType, parameters };
                            t.return.parent = t;
                            for (const member of t.parameters) member.parent = t;
                            this.pushType(t);
                            break;
                        }
                        case ReflectionOp.optional:
                            (program.stack[program.stackPointer] as TypeBaseMember | TypeTupleMember).optional = true;
                            break;
                        case ReflectionOp.readonly:
                            (program.stack[program.stackPointer] as TypeBaseMember).readonly = true;
                            break;
                        case ReflectionOp.public:
                            (program.stack[program.stackPointer] as TypeBaseMember).visibility = ReflectionVisibility.public;
                            break;
                        case ReflectionOp.protected:
                            (program.stack[program.stackPointer] as TypeBaseMember).visibility = ReflectionVisibility.protected;
                            break;
                        case ReflectionOp.private:
                            (program.stack[program.stackPointer] as TypeBaseMember).visibility = ReflectionVisibility.private;
                            break;
                        case ReflectionOp.abstract:
                            (program.stack[program.stackPointer] as TypeBaseMember).abstract = true;
                            break;
                        case ReflectionOp.static:
                            (program.stack[program.stackPointer] as TypeBaseMember).static = true;
                            break;
                        case ReflectionOp.defaultValue:
                            (program.stack[program.stackPointer] as TypeProperty | TypeEnumMember | TypeParameter).default = program.stack[this.eatParameter() as number] as () => any;
                            break;
                        case ReflectionOp.description:
                            (program.stack[program.stackPointer] as TypeProperty).description = program.stack[this.eatParameter() as number] as string;
                            break;
                        case ReflectionOp.typeName: {
                            const type = (program.stack[program.stackPointer] as Type);
                            const name = program.stack[this.eatParameter() as number] as string;
                            if (type.typeName) {
                                type.originTypes = [{ typeName: type.typeName, typeArguments: type.typeArguments }, ...(type.originTypes || [])];
                                type.typeArguments = undefined;
                            }
                            type.typeName = name;
                            break;
                        }
                        case ReflectionOp.indexSignature: {
                            const type = this.pop() as Type;
                            const index = this.pop() as Type;
                            const t: Type = { kind: ReflectionKind.indexSignature, parent: undefined as any, index, type };
                            t.type.parent = t;
                            t.index.parent = t;
                            this.pushType(t);
                            break;
                        }
                        case ReflectionOp.objectLiteral: {
                            let t = {
                                kind: ReflectionKind.objectLiteral,
                                id: state.nominalId++,
                                types: [],
                            } as TypeObjectLiteral;

                            const frameTypes = this.popFrame() as (TypeIndexSignature | TypePropertySignature | TypeMethodSignature | TypeObjectLiteral | TypeCallSignature)[];
                            pushObjectLiteralTypes(t, frameTypes);
                            for (const member of t.types) member.parent = t;
                            this.pushType(t);
                            break;
                        }
                        // case ReflectionOp.pointer: {
                        //     this.push(program.stack[this.eatParameter() as number]);
                        //     break;
                        // }
                        case ReflectionOp.distribute: {
                            this.handleDistribute(program);
                            break;
                        }
                        case ReflectionOp.condition: {
                            const right = this.pop() as Type;
                            const left = this.pop() as Type;
                            const condition = this.pop() as Type | number;
                            this.popFrame();
                            isConditionTruthy(condition) ? this.pushType(left) : this.pushType(right);
                            break;
                        }
                        case ReflectionOp.jumpCondition: {
                            const leftProgram = this.eatParameter() as number;
                            const rightProgram = this.eatParameter() as number;
                            const condition = this.pop() as Type | number;
                            const truthy = isConditionTruthy(condition);
                            this.call(truthy ? leftProgram : rightProgram);
                            break;
                        }
                        case ReflectionOp.infer: {
                            const frameOffset = this.eatParameter() as number;
                            const stackEntryIndex = this.eatParameter() as number;
                            const frame = program.frame;

                            let last: Type = { kind: ReflectionKind.unknown };
                            this.push({
                                kind: ReflectionKind.infer, set: (type: Type) => {
                                    if (last.kind !== ReflectionKind.unknown) {
                                        if (last.kind === ReflectionKind.union || last.kind === ReflectionKind.intersection) {
                                            if (!isTypeIncluded(last.types, type)) {
                                                last.types.push(type);
                                            }
                                        } else {
                                            if (type.parent && type.parent.kind === ReflectionKind.parameter) {
                                                last = { kind: ReflectionKind.intersection, types: [last, type] };
                                            } else {
                                                last = { kind: ReflectionKind.union, types: [last, type] };
                                            }
                                        }
                                    } else {
                                        last = type;
                                    }

                                    if (frameOffset === 0) {
                                        program.stack[frame.startIndex + 1 + stackEntryIndex] = last;
                                    } else if (frameOffset === 1) {
                                        program.stack[frame.previous!.startIndex + 1 + stackEntryIndex] = last;
                                    } else if (frameOffset === 2) {
                                        program.stack[frame.previous!.previous!.startIndex + 1 + stackEntryIndex] = last;
                                    } else if (frameOffset === 3) {
                                        program.stack[frame.previous!.previous!.previous!.startIndex + 1 + stackEntryIndex] = last;
                                    } else if (frameOffset === 4) {
                                        program.stack[frame.previous!.previous!.previous!.previous!.startIndex + 1 + stackEntryIndex] = last;
                                    } else {
                                        let current = frame;
                                        for (let i = 0; i < frameOffset; i++) current = current.previous!;
                                        program.stack[current.startIndex + 1 + stackEntryIndex] = last;
                                    }
                                },
                            } as TypeInfer);
                            break;
                        }
                        case ReflectionOp.extends: {
                            const right = this.pop() as string | number | boolean | Type;
                            const left = this.pop() as string | number | boolean | Type;
                            const result = isExtendable(left, right);
                            this.pushType({ kind: ReflectionKind.literal, literal: result });
                            break;
                        }
                        case ReflectionOp.indexAccess: {
                            this.handleIndexAccess();
                            break;
                        }
                        case ReflectionOp.typeof: {
                            const param1 = this.eatParameter() as number;
                            const fn = program.stack[param1] as () => any;
                            const value = fn();

                            //typeInfer calls Processor.run() and changes this.program, so handle it correctly
                            const result = typeInfer(value);
                            this.push(result, program);

                            //this.reflect/run might create another program onto the stack. switch to it if so
                            if (this.program !== program) {
                                //continue to next this.program.
                                program.program++; //manual increment as the for loop would normally do that
                                continue programLoop;
                            }
                            break;
                        }
                        case ReflectionOp.keyof: {
                            this.handleKeyOf();
                            break;
                        }
                        case ReflectionOp.var: {
                            this.push({ kind: ReflectionKind.unknown, var: true });
                            program.frame.variables++;
                            break;
                        }
                        case ReflectionOp.mappedType2: {
                            this.handleMappedType(program, true);
                            break;
                        }
                        case ReflectionOp.mappedType: {
                            this.handleMappedType(program);
                            break;
                        }
                        case ReflectionOp.loads: {
                            const frameOffset = this.eatParameter() as number;
                            const stackEntryIndex = this.eatParameter() as number;
                            if (frameOffset === 0) {
                                this.push(program.stack[program.frame.startIndex + 1 + stackEntryIndex]);
                            } else if (frameOffset === 1) {
                                this.push(program.stack[program.frame.previous!.startIndex + 1 + stackEntryIndex]);
                            } else if (frameOffset === 2) {
                                this.push(program.stack[program.frame.previous!.previous!.startIndex + 1 + stackEntryIndex]);
                            } else if (frameOffset === 3) {
                                this.push(program.stack[program.frame.previous!.previous!.previous!.startIndex + 1 + stackEntryIndex]);
                            } else if (frameOffset === 4) {
                                this.push(program.stack[program.frame.previous!.previous!.previous!.previous!.startIndex + 1 + stackEntryIndex]);
                            } else {
                                let current = program.frame;
                                for (let i = 0; i < frameOffset; i++) current = current.previous!;
                                this.push(program.stack[current.startIndex + 1 + stackEntryIndex]);
                            }
                            break;
                        }
                        case ReflectionOp.arg: {
                            //used by InlineRuntimeType too
                            const arg = this.eatParameter() as number;
                            const t = program.stack[arg] as Type | ReflectionClass<any> | number | string | boolean | bigint;
                            if (t instanceof ReflectionClass) {
                                this.push({ ...t.type, typeName: t.getClassName() });
                            } else if ('string' === typeof t || 'number' === typeof t || 'boolean' === typeof t || 'bigint' === typeof t) {
                                this.push({ kind: ReflectionKind.literal, literal: t });
                            } else if (Array.isArray(t)) {
                                const directReference = !!(this.isEnded() && program.previous && program.previous.end === 0);
                                const result = this.reflect(t, [], { inline: !directReference, reuseCached: directReference });
                                if (directReference) program.directReturn = true;
                                this.push(result, program);

                                //this.reflect/run might create another program onto the stack. switch to it if so
                                if (this.program !== program) {
                                    //continue to next this.program.
                                    program.program++; //manual increment as the for loop would normally do that
                                    continue programLoop;
                                }
                            } else {
                                this.push(t);
                            }
                            break;
                        }
                        case ReflectionOp.return: {
                            this.returnFrame();
                            break;
                        }
                        case ReflectionOp.frame: {
                            this.pushFrame();
                            break;
                        }
                        case ReflectionOp.moveFrame: {
                            const type = this.pop();
                            this.popFrame();
                            if (type) this.push(type);
                            break;
                        }
                        case ReflectionOp.jump: {
                            const arg = this.eatParameter() as number;
                            program.program = arg - 1; //-1 because next iteration does program++
                            break;
                        }
                        case ReflectionOp.call: {
                            const programPointer = this.eatParameter() as number;
                            this.call(programPointer);
                            break;
                        }
                        case ReflectionOp.nominal: {
                            const t = program.stack[program.stackPointer] as Type;
                            //program ended, so assign new nominal id to objectLiteral or class
                            t.id = state.nominalId++;
                            break;
                        }
                        case ReflectionOp.intrinsic: {
                            // intrinsics operate on the current stack entry
                            const type = this.pop() as Type;
                            const kind = this.eatParameter() as TypeIntrinsic;
                            switch (kind) {
                                case TypeIntrinsic.Uppercase: {
                                    this.push(handleUppercase(type));
                                    break;
                                }
                                case TypeIntrinsic.Lowercase: {
                                    this.push(handleLowercase(type));
                                    break;
                                }
                                case TypeIntrinsic.Capitalize: {
                                    this.push(handleCapitalize(type));
                                    break;
                                }
                                case TypeIntrinsic.Uncapitalize: {
                                    this.push(handleUncapitalize(type));
                                    break;
                                }
                                default: {
                                    this.push(type);
                                    break;
                                }
                            }
                            break;
                        }
                        case ReflectionOp.inline: {
                            const pPosition = this.eatParameter() as number;
                            const pOrFn = program.stack[pPosition] as number | Packed | (() => Packed);
                            const p = isFunction(pOrFn) ? pOrFn() : pOrFn;
                            if (p === undefined) {
                                debug(`Failed runtime inlining of ${pOrFn.toString()}. Value is undefined, probably because of a circular reference or failed import.`);
                                this.push({ kind: ReflectionKind.unknown });
                            } else if ('number' === typeof p) {
                                //self circular reference, usually a 0, which indicates we put the result of the current program as the type on the stack.
                                this.push(program.resultType);
                            } else {
                                //when it's just a simple reference resolution like typeOf<Class>() then don't issue a new reference (no inline: true)
                                const directReference = !!(this.isEnded() && program.previous && program.previous.end === 0);
                                const result = this.reflect(p, [], { inline: !directReference, reuseCached: directReference });
                                if (directReference) program.directReturn = true;
                                this.push(result, program);

                                //this.reflect/run might create another program onto the stack. switch to it if so
                                if (this.program !== program) {
                                    //continue to next this.program.
                                    program.program++; //manual increment as the for loop would normally do that
                                    continue programLoop;
                                }
                            }
                            break;
                        }
                        case ReflectionOp.inlineCall: {
                            const pPosition = this.eatParameter() as number;
                            const argumentSize = this.eatParameter() as number;
                            const inputs: Type[] = [];
                            for (let i = 0; i < argumentSize; i++) {
                                let input = this.pop() as Type;
                                if ((input.kind === ReflectionKind.never || input.kind === ReflectionKind.unknown) && program.inputs[i]) input = program.inputs[i] as Type;
                                inputs.unshift(input);
                            }
                            const pOrFn = program.stack[pPosition] as number | Packed | (() => Packed);
                            const p = isFunction(pOrFn) ? pOrFn() : pOrFn;
                            if (p === undefined) {
                                debug(`Failed runtime inlining call of ${pOrFn.toString()}. Value is undefined, probably because of a circular reference or failed import.`);
                                this.push({ kind: ReflectionKind.unknown });
                            } else if ('number' === typeof p) {
                                if (argumentSize === 0) {
                                    //self circular reference, usually a 0, which indicates we put the result of the current program as the type on the stack.
                                    this.push(program.resultType);
                                } else {
                                    const found = findExistingProgram(this.program, program.object, inputs);
                                    if (found) {
                                        this.push(createRef(found), program);
                                    } else {
                                        // process.stdout.write(`Cache miss ${pOrFn.toString()}(...${inputs.length})\n`);
                                        //execute again the current program
                                        const nextProgram = createProgram({
                                            ops: program.ops,
                                            initialStack: program.initialStack,
                                        }, inputs);
                                        this.push(this.runProgram(nextProgram), program);

                                        //continue to next this.program that was assigned by runProgram()
                                        program.program++; //manual increment as the for loop would normally do that
                                        continue programLoop;
                                    }
                                }
                            } else {
                                const result = this.reflect(p, inputs);

                                if (isWithAnnotations(result) && inputs.length) {
                                    result.typeArguments = result.typeArguments || [];
                                    for (let i = 0; i < inputs.length; i++) {
                                        result.typeArguments[i] = inputs[i];
                                    }
                                }

                                this.push(result, program);

                                //this.reflect/run might create another program onto the stack. switch to it if so
                                if (this.program !== program) {
                                    //continue to next this.program.
                                    program.program++; //manual increment as the for loop would normally do that
                                    continue programLoop;
                                }
                            }
                            break;
                        }
                    }
                }

                result = narrowOriginalLiteral(program.stack[program.stackPointer] as Type);
                // process.stdout.write(`Done ${program.depth} in ${Date.now() - program.started}ms with ${stringifyValueWithType(program.object)} -> ${stringifyShortResolvedType(result as Type)}\n`);

                if (isType(result)) {
                    if (program.object) {
                        if (result.kind === ReflectionKind.class && result.classType === Object) {
                            result.classType = program.object;
                            applyClassDecorators(result);
                        }
                        if (result.kind === ReflectionKind.function && !result.function) {
                            result.function = program.object;
                        }
                    }
                    if (!program.directReturn) {
                        result = assignResult(program.resultType, result as Type, !result.inlined);
                        applyScheduledAnnotations(program.resultType);
                    }
                }

                program.active = false;
                if (program.previous) this.program = program.previous;

                if (program.resultTypes) for (const ref of program.resultTypes) {
                    assignResult(ref, result as Type, false);
                    applyScheduledAnnotations(ref);
                }
                if (until === program) {
                    this.cache = [];
                    return result;
                }
            }

        this.cache = [];
        return result;
    }

    private handleTuple() {
        const types: TypeTupleMember[] = [];
        const stackTypes = this.popFrame() as Type[];
        for (const type of stackTypes) {
            const resolved: TypeTupleMember = type.kind === ReflectionKind.tupleMember ? type : {
                kind: ReflectionKind.tupleMember,
                parent: undefined as any,
                type,
            };
            type.parent = resolved;
            if (resolved.type.kind === ReflectionKind.rest) {
                if (resolved.type.type.kind === ReflectionKind.tuple) {
                    for (const sub of resolved.type.type.types) {
                        types.push(sub);
                    }
                } else {
                    types.push(resolved);
                }
            } else {
                types.push(resolved);
            }
        }
        const t: Type = { kind: ReflectionKind.tuple, types };
        for (const member of t.types) member.parent = t;
        this.pushType(t);
    }

    private handleIntersection() {
        const types = this.popFrame() as Type[];
        let result: Type | undefined = { kind: ReflectionKind.unknown };
        if (!types.length) {
            this.pushType({ kind: ReflectionKind.never });
            return;
        }
        const annotations: Annotations = {};
        const decorators: TypeObjectLiteral[] = [];
        const defaultDecorators: Type[] = [];

        function appendAnnotations(a: Type) {
            if (a.annotations === annotations) return;
            if (a.annotations) Object.assign(annotations, a.annotations);
            if (a.decorators) decorators.push(...a.decorators as TypeObjectLiteral[]);
        }

        function handleUnion(a: Type, unionType: TypeUnion): Type {
            if (a.kind === ReflectionKind.objectLiteral || a.kind === ReflectionKind.class) {
                return unboxUnion({ kind: ReflectionKind.union, types: unionType.types.map(v => collapse(v, a)).filter(v => v.kind !== ReflectionKind.never) });
            }
            return unboxUnion({ kind: ReflectionKind.union, types: unionType.types.filter(v => isExtendable(v, a)) });
        }

        function handleAndObject(a: Type, objectType: TypeObjectLiteral): Type {
            if (objectType.types.length === 0) {
                return isExtendable(a, objectType) ? a : { kind: ReflectionKind.never };
            }
            defaultDecorators.push(objectType);
            annotations[defaultAnnotation.symbol] = defaultDecorators;
            return a;
        }

        function collapse(a: Type, b: Type): Type {
            if (a.kind === ReflectionKind.any) return a;
            if (b.kind === ReflectionKind.any) return b;

            if (a.kind === ReflectionKind.union) {
                return handleUnion(b, a);
            }

            if (b.kind === ReflectionKind.union) {
                return handleUnion(a, b);
            }

            if ((a.kind === ReflectionKind.objectLiteral || a.kind === ReflectionKind.class) && (b.kind === ReflectionKind.objectLiteral || b.kind === ReflectionKind.class)) {
                appendAnnotations(a);
                appendAnnotations(b);
                return merge([a, b]);
            }

            // object & {then() ...}
            if (a.kind === ReflectionKind.object && b.kind === ReflectionKind.objectLiteral) {
                return b;
            }
            if (b.kind === ReflectionKind.object && a.kind === ReflectionKind.objectLiteral) {
                return a;
            }

            if (isPrimitive(a) && b.kind === ReflectionKind.objectLiteral) {
                return handleAndObject(a, b);
            }

            if (isPrimitive(b) && a.kind === ReflectionKind.objectLiteral) {
                return handleAndObject(b, a);
            }

            //1 & number => 1
            //number & 1 => 1
            //'2' & string => '2'
            //string & '2' => '2'
            //2 & string => never
            //string & 2 => never
            //'b' & number => never
            //number & 'b' => never
            if (isPrimitive(a) && b.kind === ReflectionKind.literal) {
                return isExtendable(b, a) ? b : { kind: ReflectionKind.never };
            }
            if (isPrimitive(b) && a.kind === ReflectionKind.literal) {
                return isExtendable(a, b) ? a : { kind: ReflectionKind.never };
            }

            // two different primitives always return never
            if (isPrimitive(a) && isPrimitive(b) && a.kind !== b.kind) {
                return { kind: ReflectionKind.never };
            }

            if (b.kind === ReflectionKind.unknown) return a;

            if (a.kind === ReflectionKind.objectLiteral || a.kind === ReflectionKind.class || a.kind === ReflectionKind.never || a.kind === ReflectionKind.unknown) return b;

            if (b.annotations) {
                Object.assign(annotations, b.annotations);
            }

            return a;
        }

        outer:
            for (const type of types) {
                if (type.kind === ReflectionKind.never) continue;
                if (type.kind === ReflectionKind.objectLiteral) {
                    for (const decorator of typeDecorators) {
                        if (decorator(annotations, type)) {
                            decorators.push(type);
                            continue outer;
                        }
                    }
                }
                if (result.kind === ReflectionKind.never) {
                    result = { kind: ReflectionKind.never };
                    break;
                } else if (result.kind === ReflectionKind.unknown) {
                    result = type;
                    appendAnnotations(type);
                } else {
                    result = collapse(result, type);
                }
            }

        if (result.kind === ReflectionKind.unknown) {
            //type not calculated yet, so schedule annotations. Those will be applied once the type is fully computed.
            result.scheduleDecorators = decorators;
        } else {
            //copy so the original type is not modified
            result = copyAndSetParent(result);
            result.annotations = result.annotations || {};
            if (decorators.length) result.decorators = decorators;
            Object.assign(result.annotations, annotations);
        }
        return result;
    }

    private handleDistribute(program: Program) {
        const programPointer = this.eatParameter() as number;

        if (program.frame.distributiveLoop) {
            const type = this.pop() as Type;

            if (type.kind === ReflectionKind.never) {
                //we ignore never, to filter them out
            } else {
                this.push(type);
            }
        } else {
            //start loop
            const distributeOver = this.pop() as Type;
            program.frame.distributiveLoop = new Loop(distributeOver);
        }

        const next = program.frame.distributiveLoop.next();
        if (next === undefined) {
            //end
            const types = this.popFrame() as Type[];
            const result: TypeUnion = { kind: ReflectionKind.union, types: flattenUnionTypes(types) };
            const t: Type = unboxUnion(result);
            if (t.kind === ReflectionKind.union) for (const member of t.types) member.parent = t;
            this.push(t);
        } else {
            program.stack[program.frame.startIndex + 1] = next;
            this.call(programPointer, -1); //-1=jump back to this very same position, to be able to loop
        }
    }

    private handleIndexAccess() {
        const right = this.pop() as Type;
        const left = this.pop() as Type;

        if (!isType(left)) {
            this.push({ kind: ReflectionKind.never });
        } else {
            const t: Type = indexAccess(left, right);
            if (isWithAnnotations(t)) {
                t.indexAccessOrigin = { container: left as TypeObjectLiteral, index: right as Type };
            }
            this.push(copyAndSetParent(t));
        }
    }

    private handleKeyOf() {
        const type = this.pop() as Type;
        if (type.kind === ReflectionKind.objectLiteral || type.kind === ReflectionKind.class) {
            const union = { kind: ReflectionKind.union, origin: type, types: [] } as TypeUnion;
            for (const member of type.types) {
                if ((member.kind === ReflectionKind.propertySignature || member.kind === ReflectionKind.property) && member.name !== 'new') {
                    union.types.push({ kind: ReflectionKind.literal, literal: member.name, parent: union, origin: member } as TypeLiteral);
                } else if ((member.kind === ReflectionKind.methodSignature || member.kind === ReflectionKind.method) && member.name !== 'constructor') {
                    union.types.push({ kind: ReflectionKind.literal, literal: member.name, parent: union, origin: member } as TypeLiteral);
                }
            }
            this.push(union);
        } else if (type.kind === ReflectionKind.tuple) {
            const union = { kind: ReflectionKind.union, origin: type, types: [] } as TypeUnion;
            for (let i = 0; i < type.types.length; i++) {
                union.types.push({ kind: ReflectionKind.literal, literal: i, parent: union } as TypeLiteral);
            }
            this.push(union);
        } else if (type.kind === ReflectionKind.any) {
            this.push({ kind: ReflectionKind.union, types: [{ kind: ReflectionKind.string }, { kind: ReflectionKind.number }, { kind: ReflectionKind.symbol }] });
        } else {
            this.push({ kind: ReflectionKind.never });
        }
    }

    private handleMappedType(program: Program, withName = false) {
        const functionPointer = this.eatParameter() as number;
        const modifier = this.eatParameter() as number;

        function isSimpleIndex(index: Type): boolean {
            if (index.kind === ReflectionKind.string || index.kind === ReflectionKind.number || index.kind === ReflectionKind.symbol) return true;
            if (index.kind === ReflectionKind.union) {
                const types = index.types.filter(v => isSimpleIndex(v));
                return types.length === 0;
            }
            return false;
        }

        if (program.frame.mappedType) {
            let type = this.pop() as Type;
            let index: Type | string | boolean | symbol | number | bigint = program.stack[program.frame.startIndex + 1] as Type;
            if (withName) {
                if (type.kind === ReflectionKind.tuple) {
                    index = type.types[1].type;
                    type = type.types[0].type;
                } else {
                    throw new Error('Tuple expect');
                }
            }
            const fromType = program.frame.mappedType.fromType;
            const isTuple = fromType.origin && fromType.origin.kind === ReflectionKind.tuple;

            if (index.kind === ReflectionKind.never) {
                //ignore
            } else if (index.kind === ReflectionKind.any || isSimpleIndex(index)) {
                const t: TypeIndexSignature = { kind: ReflectionKind.indexSignature, type, index, parent: undefined as any };
                t.type.parent = t;
                t.index.parent = t;
                this.push(t);
            } else {
                let optional: true | undefined = undefined;
                let readonly: true | undefined = undefined;

                if (index.kind === ReflectionKind.literal && !(index.literal instanceof RegExp)) {
                    optional = !!index.origin && isMember(index.origin) && index.origin.optional ? true : undefined;
                    index = index.literal;
                }

                // If the type was a property, then grab the optional modifier from the property itself.
                // Note: This is inconsistent with TS official behaviour, as
                // mapped types only preserve modifiers when its homomorphic
                // https://github.com/microsoft/TypeScript/pull/12563
                if (type.parent && (type.parent.kind === ReflectionKind.propertySignature || type.parent.kind === ReflectionKind.property)) {
                    if (type.parent.optional) optional = true;
                    if (type.parent.readonly) readonly = true;
                }

                const property: TypeProperty | TypePropertySignature | TypeTupleMember = type.kind === ReflectionKind.propertySignature || type.kind === ReflectionKind.property || type.kind === ReflectionKind.tupleMember
                    ? type
                    : { kind: isTuple ? ReflectionKind.tupleMember : ReflectionKind.propertySignature, name: index, type } as TypePropertySignature;

                if (optional) {
                    property.optional = true;
                }
                if (readonly && property.kind !== ReflectionKind.tupleMember) property.readonly = true;

                if (property !== type) type.parent = property;
                if (property.type.kind !== ReflectionKind.never) {
                    //never is filtered out
                    if (modifier !== 0) {
                        if (modifier & MappedModifier.optional) {
                            property.optional = true;
                        }
                        if (modifier & MappedModifier.removeOptional && property.optional) {
                            property.optional = undefined;
                        }
                        if (property.kind !== ReflectionKind.tupleMember) {
                            if (modifier & MappedModifier.readonly) {
                                property.readonly = true;
                            }
                            if (modifier & MappedModifier.removeReadonly && property.readonly) {
                                property.readonly = undefined;
                            }
                        }
                    }
                    this.push(property);
                }
            }
        } else {
            program.frame.mappedType = new Loop(this.pop() as Type);
        }

        let next = program.frame.mappedType.next();
        if (next === undefined) {
            //end
            const fromType = program.frame.mappedType.fromType;
            const members = this.popFrame() as Type[];
            let t: Type;

            if (fromType.origin && fromType.origin.kind === ReflectionKind.tuple) {
                t = { kind: ReflectionKind.tuple, types: members as any[] };
            } else {
                t = { kind: ReflectionKind.objectLiteral, id: state.nominalId++, types: members as any[] };
            }

            this.push(t);
        } else {
            if (isMember(next)) {
                next = { kind: ReflectionKind.literal, literal: next.name };
            }
            program.stack[program.frame.startIndex + 1] = next; //change the mapped type parameter
            this.call(functionPointer, -2);
        }
    }

    private handleTemplateLiteral() {
        const types = this.popFrame() as Type[];
        const result: TypeUnion = { kind: ReflectionKind.union, types: [] };
        const cartesian = new CartesianProduct();
        for (const type of types) {
            cartesian.add(type);
        }
        const product = cartesian.calculate();

        outer:
            for (const combination of product) {
                const template: TypeTemplateLiteral = { kind: ReflectionKind.templateLiteral, types: [] };
                let hasPlaceholder = false;
                let lastLiteral: { kind: ReflectionKind.literal, literal: string, parent?: Type } | undefined = undefined;
                //merge a combination of types, e.g. [string, 'abc', '3'] as template literal => `${string}abc3`.
                for (const item of combination) {
                    if (item.kind === ReflectionKind.never) {
                        //template literals that contain a never like `prefix.${never}` are completely ignored
                        continue outer;
                    }

                    if (item.kind === ReflectionKind.literal) {
                        if (lastLiteral) {
                            lastLiteral.literal += item.literal as string + '';
                        } else {
                            lastLiteral = { kind: ReflectionKind.literal, literal: item.literal as string + '', parent: template };
                            template.types.push(lastLiteral);
                        }
                    } else {
                        hasPlaceholder = true;
                        lastLiteral = undefined;
                        item.parent = template;
                        template.types.push(item as TypeTemplateLiteral['types'][number]);
                    }
                }

                if (hasPlaceholder) {
                    if (template.types.length === 1 && template.types[0].kind === ReflectionKind.string) {
                        template.types[0].parent = result;
                        result.types.push(template.types[0]);
                    } else {
                        template.parent = result;
                        result.types.push(template);
                    }
                } else if (lastLiteral) {
                    lastLiteral.parent = result;
                    result.types.push(lastLiteral);
                }
            }
        const t: Type = unboxUnion(result);
        if (t.kind === ReflectionKind.union) for (const member of t.types) member.parent = t;
        this.pushType(t);
    }

    protected push(entry: RuntimeStackEntry, program: Program = this.program): void {
        const i = ++program.stackPointer;

        if (i < program.stack.length) {
            program.stack[i] = entry;
        } else {
            program.stack.push(entry);
        }
    }

    protected pop(): RuntimeStackEntry {
        if (this.program.stackPointer < 0) throw new Error('Stack empty');
        // return this.program.stack.pop()!;
        return this.program.stack[this.program.stackPointer--];
    }

    protected pushFrame(): void {
        this.program.frame = {
            index: this.program.frame.index + 1,
            startIndex: this.program.stackPointer,
            inputs: [],
            variables: 0,
            previous: this.program.frame,
        };
    }

    protected popFrame(): RuntimeStackEntry[] {
        const result = this.program.stack.slice(this.program.frame.startIndex + this.program.frame.variables + 1, this.program.stackPointer + 1);
        this.program.stackPointer = this.program.frame.startIndex;
        if (this.program.frame.previous) this.program.frame = this.program.frame.previous;
        return result;
    }

    /**
     * Create a new stack frame with the calling convention.
     */
    protected call(program: number, jumpBackTo: number = 1): void {
        this.push(this.program.program + jumpBackTo); //the `return address`
        this.pushFrame();
        // process.stdout.write(`[${this.program.frame.index}] call ${program}\n`);
        this.program.program = program - 1; //-1 because next iteration does program++
    }

    /**
     * Removes the stack frame, and puts the latest entry on the stack.
     */
    protected returnFrame(): void {
        const returnValue = this.pop(); //latest entry on the stack is the return value
        const returnAddress = this.program.stack[this.program.frame.startIndex]; //startIndex points the to new frame - 1 position, which is the `return address`.
        // process.stdout.write(`[${this.program.frame.index}] return ${returnAddress}\n`);
        this.program.stackPointer = this.program.frame.startIndex - 1; //-1 because call convention adds `return address` before entering new frame
        this.push(returnValue);
        if ('number' === typeof returnAddress) this.program.program = returnAddress - 1; //-1 because iteration does program++
        if (this.program.frame.previous) this.program.frame = this.program.frame.previous;
    }

    protected pushType(type: Type): void {
        this.push(type);
    }

    protected eatParameter(): RuntimeStackEntry {
        return this.program.ops[++this.program.program];
    }
}

function handleUppercase(type: Type): Type {
    if (type.kind === ReflectionKind.union) {
        return { kind: ReflectionKind.union, types: type.types.map(t => handleUppercase(t)) };
    }
    if (type.kind !== ReflectionKind.literal || 'string' !== typeof type.literal) {
        return { kind: ReflectionKind.string };
    }
    if (!type.literal) return type;
    return { kind: ReflectionKind.literal, literal: type.literal.toUpperCase() };
}

function handleLowercase(type: Type): Type {
    if (type.kind === ReflectionKind.union) {
        return { kind: ReflectionKind.union, types: type.types.map(t => handleLowercase(t)) };
    }
    if (type.kind !== ReflectionKind.literal || 'string' !== typeof type.literal) {
        return { kind: ReflectionKind.string };
    }
    if (!type.literal) return type;
    return { kind: ReflectionKind.literal, literal: type.literal.toLowerCase() };
}

function handleCapitalize(type: Type): Type {
    if (type.kind === ReflectionKind.union) {
        return { kind: ReflectionKind.union, types: type.types.map(t => handleCapitalize(t)) };
    }
    if (type.kind !== ReflectionKind.literal || 'string' !== typeof type.literal) {
        return { kind: ReflectionKind.string };
    }
    if (!type.literal) return type;
    return { kind: ReflectionKind.literal, literal: type.literal.charAt(0).toUpperCase() + type.literal.slice(1) };
}

function handleUncapitalize(type: Type): Type {
    if (type.kind === ReflectionKind.union) {
        return { kind: ReflectionKind.union, types: type.types.map(t => handleUncapitalize(t)) };
    }
    if (type.kind !== ReflectionKind.literal || 'string' !== typeof type.literal) {
        return { kind: ReflectionKind.string };
    }
    if (!type.literal) return type;
    return { kind: ReflectionKind.literal, literal: type.literal.charAt(0).toLowerCase() + type.literal.slice(1) };
}

function typeInferFromContainer(container: Iterable<any>): Type {
    const union: TypeUnion = { kind: ReflectionKind.union, types: [] };
    for (const item of container) {
        const type = widenLiteral(typeInfer(item));
        if (!isTypeIncluded(union.types, type)) union.types.push(type);
    }

    return union.types.length === 0 ? { kind: ReflectionKind.any } : union.types.length === 1 ? union.types[0] : union;
}

export function typeInfer(value: any): Type {
    if ('string' === typeof value || 'number' === typeof value || 'boolean' === typeof value || 'bigint' === typeof value || 'symbol' === typeof value) {
        return { kind: ReflectionKind.literal, literal: value };
    } else if (null === value) {
        return { kind: ReflectionKind.null };
    } else if (undefined === value) {
        return { kind: ReflectionKind.undefined };
    } else if (value instanceof RegExp) {
        return { kind: ReflectionKind.literal, literal: value };
    } else if ('function' === typeof value) {
        if (isArray(value.__type)) {
            //with emitted types: function or class
            //don't use resolveRuntimeType since we don't allow cache here
            // console.log('typeInfer of', value.name);
            return Processor.get().reflect(value, undefined, { inline: true }) as Type;
        }

        if (isClass(value)) {
            //unknown class
            return { kind: ReflectionKind.class, classType: value as ClassType, types: [] };
        }

        return { kind: ReflectionKind.function, function: value, name: value.name, return: { kind: ReflectionKind.any }, parameters: [] };
    } else if (isArray(value)) {
        return { kind: ReflectionKind.array, type: typeInferFromContainer(value) };
    } else if ('object' === typeof value) {
        const constructor = value.constructor;
        if ('function' === typeof constructor && constructor !== Object && isArray(constructor.__type)) {
            //with emitted types
            //don't use resolveRuntimeType since we don't allow cache here
            return Processor.get().reflect(constructor, undefined, { inline: true }) as Type;
        }

        if (constructor === RegExp) return { kind: ReflectionKind.regexp };
        if (constructor === Date) return { kind: ReflectionKind.class, classType: Date, types: [] };
        if (constructor === Set) {
            const type = typeInferFromContainer(value);
            return { kind: ReflectionKind.class, classType: Set, arguments: [type], types: [] };
        }

        if (constructor === Map) {
            const keyType = typeInferFromContainer((value as Map<any, any>).keys());
            const valueType = typeInferFromContainer((value as Map<any, any>).values());
            return { kind: ReflectionKind.class, classType: Map, arguments: [keyType, valueType], types: [] };
        }

        //generate a new program that builds a objectLiteral. This is necessary since typeInfer() with its Processor.reflect() calls might return immediately TypeAny if
        //the execution was scheduled (if we are in an executing program) so we can not depend on the result directly.
        //each part of the program of a value[i] is executed after the current OP, so we have to schedule new OPs doing the same as
        //in this loop here and construct the objectLiteral in the VM.
        const resultType: TypeObjectLiteral = { kind: ReflectionKind.objectLiteral, id: state.nominalId++, types: [] };
        const ops: ReflectionOp[] = [];
        const stack: RuntimeStackEntry[] = [];

        for (const i in value) {
            const indexTypeOfArg = stack.length;
            stack.push(() => value[i]);
            ops.push(ReflectionOp.typeof, indexTypeOfArg, ReflectionOp.widen);

            const indexName = stack.length;
            stack.push(i);
            ops.push(ReflectionOp.propertySignature, indexName);
        }

        ops.push(ReflectionOp.objectLiteral);

        return Processor.get().runProgram(createProgram({ ops, stack, resultType })) as Type;
    }
    return { kind: ReflectionKind.any };
}

function applyClassDecorators(type: TypeClass) {
    if (!isWithDeferredDecorators(type.classType)) return;

    for (const decorator of type.classType.__decorators) {
        const { data, property, parameterIndexOrDescriptor } = decorator;

        if (property !== undefined) {
            const member = getMember(type, property);
            if (!member) continue;

            if (member.kind === ReflectionKind.propertySignature || member.kind === ReflectionKind.property) {
                applyPropertyDecorator(member.type, data);
            }

            if ('number' === typeof parameterIndexOrDescriptor && (member.kind === ReflectionKind.method || member.kind === ReflectionKind.methodSignature)) {
                const param = member.parameters[parameterIndexOrDescriptor];
                if (param) {
                    applyPropertyDecorator(param.type, data);
                }
            }
        }
    }
}

function applyPropertyDecorator(type: Type, data: TData) {
    //map @t.validate to Validate<>
    if (data.validators.length && isWithAnnotations(type)) {
        const annotations = getAnnotations(type);
        for (const validator of data.validators) {
            validationAnnotation.register(annotations, {
                name: 'function',
                args: [{ kind: ReflectionKind.function, function: validator, parameters: [], return: { kind: ReflectionKind.any } }],
            });
        }
    }
}

function collapseFunctionToMethod(member: TypePropertySignature | TypeMethodSignature): member is TypePropertySignature & { type: TypeMethodSignature } {
    return member.kind === ReflectionKind.propertySignature && member.type.kind === ReflectionKind.function && member.type.function !== Function;
}

function pushObjectLiteralTypes(
    type: TypeObjectLiteral,
    types: (TypeIndexSignature | TypePropertySignature | TypeMethodSignature | TypeObjectLiteral | TypeCallSignature)[],
) {
    let annotations: Annotations = {};
    const decorators: Type[] = [];

    outer:
        for (const member of types) {
            if (member.kind === ReflectionKind.propertySignature && member.type.kind === ReflectionKind.never) continue;

            if (member.kind === ReflectionKind.objectLiteral) {
                //all `extends T` expression land at the beginning of the stack frame, and are always an objectLiteral.
                //we use it as base and move its types first into types

                //it might be a decorator
                for (const decorator of typeDecorators) {
                    if (decorator(annotations, member)) {
                        decorators.push(member);
                        continue outer;
                    }
                }

                type.implements ||= [];
                type.implements.push(member);

                pushObjectLiteralTypes(type, member.types);

                //redirect decorators
                if (member.decorators) {
                    decorators.push(...member.decorators);
                }
                if (member.annotations) {
                    annotations = Object.assign(member.annotations, annotations);
                }
            } else if (member.kind === ReflectionKind.indexSignature) {
                //note: is it possible to overwrite an index signature?
                type.types.push(member);
            } else if (member.kind === ReflectionKind.propertySignature || member.kind === ReflectionKind.methodSignature) {
                const toAdd = collapseFunctionToMethod(member) ? {
                    kind: ReflectionKind.methodSignature,
                    name: member.name,
                    optional: member.optional,
                    parameters: member.type.parameters,
                    return: member.type.return,
                } as TypeMethodSignature : member;

                const existing = type.types.findIndex(v => (v.kind === ReflectionKind.propertySignature || v.kind === ReflectionKind.methodSignature) && v.name === toAdd.name);
                if (existing !== -1) {
                    //remove entry, since we replace it
                    type.types.splice(existing, 1, toAdd);
                } else {
                    type.types.push(toAdd);
                }
            } else if (member.kind === ReflectionKind.callSignature) {
                type.types.push(member);
            }
        }

    type.annotations = type.annotations || {};
    if (decorators.length) type.decorators = decorators;

    Object.assign(type.annotations, annotations);
}

export function getEnumType(values: any[]): Type {
    let allowUndefined = false;
    let allowNull = false;
    let allowString = false;
    let allowNumber = false;

    for (const v of values) {
        if (v === undefined) allowUndefined = true;
        if (v === null) allowNull = true;
        if (typeof v === 'number') allowNumber = true;
        if (typeof v === 'string') allowString = true;
    }

    const union: TypeUnion = { kind: ReflectionKind.union, types: [] };
    if (allowString) union.types.push({ kind: ReflectionKind.string });
    if (allowNumber) union.types.push({ kind: ReflectionKind.number });
    if (allowNull) union.types.push({ kind: ReflectionKind.null });
    if (allowUndefined) union.types.push({ kind: ReflectionKind.undefined });

    return unboxUnion(union);
}

function resolveFunction<T extends Function>(fn: T, forObject: any): any {
    try {
        return fn();
    } catch (error) {
        return undefined;
        // throw new Error(`Could not resolve function of object ${getClassName(forObject)} via ${fn.toString()}: ${error}`);
    }
}
