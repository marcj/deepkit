/*
 * Deepkit Framework
 * Copyright (c) Deepkit UG, Marc J. Schmidt
 *
 * This program is free software: you can redistribute it and/or modify
 * it under the terms of the MIT License.
 *
 * You should have received a copy of the MIT License along with this program.
 */

import { AbstractClassType, arrayRemoveItem, capitalize, ClassType, getClassName, getInheritanceChain, getParentClass, indent, isArray, isClass, isGlobalClass, TypeAnnotation } from '@deepkit/core';
import { TypeNumberBrand } from '@deepkit/type-spec';
import { getProperty, ReceiveType, reflect, ReflectionClass, resolveReceiveType, toSignature } from './reflection.js';
import { isExtendable } from './extends.js';
import { state } from './state.js';
import { resolveRuntimeType } from './processor.js';

export enum ReflectionVisibility {
    public,
    protected,
    private,
}

export enum ReflectionKind {
    never,
    any,
    unknown,
    void,
    object,
    string,
    number,
    boolean,
    symbol,
    bigint,
    null,
    undefined,
    regexp,

    literal,
    templateLiteral,
    property,
    method,
    function,
    parameter,

    promise,

    /**
     * Uint8Array, Date, custom classes, Set, Map, etc
     */
    class,

    typeParameter,
    enum,
    union,
    intersection,

    array,
    tuple,
    tupleMember,
    enumMember,

    rest,

    objectLiteral,
    indexSignature,
    propertySignature,
    methodSignature,

    infer,

    callSignature,
}

export type TypeDecorator = (annotations: Annotations, decorator: TypeObjectLiteral) => boolean;

export type Annotations = any; //actual { [name: symbol]: any[] };, but not support in older TS

/**
 * @reflection never
 */
export interface TypeAnnotations {
    // if defined, it is a nominal type. the number is unique for each nominal type.
    id?: number;

    origin?: Type;

    /**
     * True when this type comes from an inline type, e.g.
     *
     * `type A = T;`. Type of `T` is inlined.
     * `type A = {}`. Type of `{}` is not inlined.
     *
     * If the type is not inlined and the result of a type function, then we assign parents of members accordingly. This is not the caee when a type was inlined.
     */
    inlined?: true;

    /**
     * If the type was created by a type function, this contains the alias name.
     */
    typeName?: string;

    /**
     * If the type was created by a type function, this contains the arguments passed the function.
     */
    typeArguments?: Type[];

    /**
     * Set for index access expressions, e.g. Config['property'].
     */
    indexAccessOrigin?: { container: TypeClass | TypeObjectLiteral, index: Type };

    /**
     * type User = {id: number, user: string};
     * type UserCreate = Pick<User, 'user'>;
     * typeOf<UserCreate>().originTypes[0].typeName = 'Pick'
     * typeOf<UserCreate>().originTypes[0].typeArguments = [User, 'user']
     */
    originTypes?: { typeName: string, typeArguments?: Type[] }[];

    annotations?: Annotations; //parsed decorator types as annotations
    decorators?: Type[]; //original decorator type

    scheduleDecorators?: TypeObjectLiteral[];

    /**
     * A place where arbitrary jit functions and its cache data is stored.
     */
    jit?: JitContainer;
}

export function applyScheduledAnnotations(type: Type) {
    if (isWithAnnotations(type) && type.scheduleDecorators) {
        type.annotations = type.annotations ? { ...type.annotations } : {};
        type.decorators = type.decorators ? type.decorators.slice() : [];
        type.decorators.push(...type.scheduleDecorators);

        for (const scheduledDecorator of type.scheduleDecorators) {
            for (const decorator of typeDecorators) {
                decorator(type.annotations, scheduledDecorator);
            }
        }
        type.scheduleDecorators = undefined;
    }
}

export function hasTypeInformation(object: ClassType | Function): boolean {
    return '__type' in object && isArray((object as any).__type);
}

/**
 * Object to hold runtime jit data.
 */
export type JitContainer = any; //actual { [name: string | symbol]: any }; but not supported in older TS

export function getTypeJitContainer(type: Type): JitContainer {
    if (!type.jit) type.jit = {};
    return type.jit;
}

export function clearTypeJitContainer(type: Type): void {
    type.jit = {};
}

export interface TypeNever extends TypeAnnotations {
    kind: ReflectionKind.never,
    parent?: Type;
}

export interface TypeAny extends TypeAnnotations {
    kind: ReflectionKind.any,
    parent?: Type;
}

export interface TypeUnknown extends TypeAnnotations {
    kind: ReflectionKind.unknown,
    parent?: Type;
}

export interface TypeVoid extends TypeAnnotations {
    kind: ReflectionKind.void,
    parent?: Type;
}

export interface TypeObject extends TypeAnnotations {
    kind: ReflectionKind.object,
    parent?: Type;
}

export interface TypeString extends TypeAnnotations {
    kind: ReflectionKind.string,
    parent?: Type;
}

export function isIntegerType(type: Type): type is TypeNumber {
    return type.kind === ReflectionKind.number && type.brand !== undefined && type.brand >= TypeNumberBrand.integer && type.brand <= TypeNumberBrand.uint32;
}

export interface TypeNumber extends TypeAnnotations {
    kind: ReflectionKind.number,
    brand?: TypeNumberBrand; //built in brand
    parent?: Type;
}

export interface TypeBoolean extends TypeAnnotations {
    kind: ReflectionKind.boolean,
    parent?: Type;
}

export interface TypeBigInt extends TypeAnnotations {
    kind: ReflectionKind.bigint,
    parent?: Type;
}

export interface TypeSymbol extends TypeAnnotations {
    kind: ReflectionKind.symbol,
    parent?: Type;
}

export interface TypeNull extends TypeAnnotations {
    kind: ReflectionKind.null,
    parent?: Type;
}

export interface TypeUndefined extends TypeAnnotations {
    kind: ReflectionKind.undefined,
    parent?: Type;
}

export interface TypeLiteral extends TypeAnnotations {
    kind: ReflectionKind.literal,
    literal: symbol | string | number | boolean | bigint | RegExp;
    parent?: Type;
}

export interface TypeTemplateLiteral extends TypeAnnotations {
    kind: ReflectionKind.templateLiteral,
    types: (TypeString | TypeAny | TypeNumber | TypeLiteral | TypeInfer)[]
    parent?: Type;
}

export interface TypeRegexp extends TypeAnnotations {
    kind: ReflectionKind.regexp;
    parent?: Type;
}

class User {
    username!: string;

    getUserName(): this['username'] {
        return '';
    }
}

type a = User & { username: boolean };
type b = ReturnType<a['getUserName']>;

export interface TypeBaseMember extends TypeAnnotations {
    visibility: ReflectionVisibility,
    abstract?: true;
    static?: true;
    optional?: true,
    readonly?: true;
}

export interface TypeParameter extends TypeAnnotations {
    kind: ReflectionKind.parameter,
    name: string;
    type: Type;
    parent: TypeFunction | TypeMethod | TypeMethodSignature | TypeCallSignature;

    //parameter could be a property as well if visibility is set
    visibility?: ReflectionVisibility,
    readonly?: true;
    optional?: true,
    description?: string;

    /**
     * Set when the parameter has a default value aka initializer.
     */
    default?: () => any
}

export interface TypeMethod extends TypeBaseMember {
    kind: ReflectionKind.method,
    parent: TypeClass;
    name: number | string | symbol;
    description?: string;
    parameters: TypeParameter[];
    return: Type;
}

export interface TypeProperty extends TypeBaseMember {
    kind: ReflectionKind.property,
    parent: TypeClass;
    visibility: ReflectionVisibility,
    name: number | string | symbol;
    description?: string;
    type: Type;

    /**
     * Set when the property has a default value aka initializer.
     */
    default?: () => any
}

export interface TypeFunction extends TypeAnnotations {
    kind: ReflectionKind.function,
    parent?: Type;
    name?: number | string | symbol,
    description?: string;
    function?: Function; //reference to the real function if available
    parameters: TypeParameter[];
    return: Type;
}

export interface TypeCallSignature extends TypeAnnotations {
    kind: ReflectionKind.callSignature,
    parent?: Type;
    parameters: TypeParameter[];
    return: Type;
}

export interface TypePromise extends TypeAnnotations {
    kind: ReflectionKind.promise,
    parent?: Type;
    type: Type;
}

export interface TypeClass extends TypeAnnotations {
    kind: ReflectionKind.class,
    parent?: Type;
    classType: ClassType;
    description?: string;

    /**
     * When the class extends another class and uses on it generic type arguments, then those arguments
     * are in this array.
     * For example `class A extends B<string, boolean> {}` then extendsArguments = [string, boolean].
     * The reference to `B` is not part of TypeClass since this information is available in JavaScript runtime
     * by using `Object.getPrototypeOf(type.classType)`.
     */
    extendsArguments?: Type[];

    /**
     * When the class implements another interface/type, then those types are in this array.
     *
     * For example `class A implements B<string, boolean> {}` then implements = [B<string, boolean>].
     */
    implements?: Type[];

    /**
     * When class has generic type arguments, e.g. MyClass<string>, it contains
     * all type arguments. If no type arguments are given, it's undefined.
     */
    arguments?: Type[];

    /**
     * properties/methods.
     */
    types: (TypeIndexSignature | TypeProperty | TypeMethod)[];
}

export interface TypeEnum extends TypeAnnotations {
    kind: ReflectionKind.enum,
    parent?: Type;
    enum: { [name: string]: string | number | undefined | null };
    values: (string | number | undefined | null)[];
    indexType: Type;
    description?: string;
}

export interface TypeEnumMember extends TypeAnnotations {
    kind: ReflectionKind.enumMember,
    parent: TypeEnum;
    name: string;
    default?: () => string | number;
}

export interface TypeTypeParameter extends TypeAnnotations {
    kind: ReflectionKind.typeParameter,
    parent?: Type;
    name: string,
}

export interface TypeUnion extends TypeAnnotations {
    kind: ReflectionKind.union,
    parent?: Type;
    types: Type[];
}

export interface TypeIntersection extends TypeAnnotations {
    kind: ReflectionKind.intersection,
    parent?: Type;
    types: Type[];
}

export interface TypeArray extends TypeAnnotations {
    kind: ReflectionKind.array,
    parent?: Type;
    type: Type;
}

export interface TypePropertySignature extends TypeAnnotations {
    kind: ReflectionKind.propertySignature,
    parent: TypeObjectLiteral;
    name: number | string | symbol;
    optional?: true;
    readonly?: true;
    description?: string;
    type: Type;
}

export interface TypeMethodSignature extends TypeAnnotations {
    kind: ReflectionKind.methodSignature,
    parent: TypeObjectLiteral;
    name: number | string | symbol;
    optional?: true;
    description?: string;
    parameters: TypeParameter[];
    return: Type;
}

/**
 * Object literals or interfaces.
 */
export interface TypeObjectLiteral extends TypeAnnotations {
    kind: ReflectionKind.objectLiteral,

    parent?: Type;
    description?: string;
    types: (TypeIndexSignature | TypePropertySignature | TypeMethodSignature | TypeCallSignature)[];

    /**
     * When the interface extends another interface/type, then those types are in this array.
     *
     * For example `interface A extends B<string, boolean> {}` then implements = [B<string, boolean>].
     */
    implements?: Type[];
}

export interface TypeIndexSignature extends TypeAnnotations {
    kind: ReflectionKind.indexSignature,
    parent: TypeClass | TypeObjectLiteral;
    index: Type;
    type: Type;
}

export interface TypeInfer extends TypeAnnotations {
    kind: ReflectionKind.infer,
    parent?: Type;

    set(type: Type): void;
}

export interface TypeTupleMember extends TypeAnnotations {
    kind: ReflectionKind.tupleMember,
    parent: TypeTuple;
    type: Type;
    optional?: true;
    name?: string;
}

export interface TypeTuple extends TypeAnnotations {
    kind: ReflectionKind.tuple,
    parent?: Type;
    types: TypeTupleMember[]
}

export interface TypeRest extends TypeAnnotations {
    kind: ReflectionKind.rest,
    parent: TypeTypeParameter | TypeTupleMember;
    type: Type
}

/**
 * @reflection never
 */
export type Type =
    TypeNever
    | TypeAny
    | TypeUnknown
    | TypeVoid
    | TypeObject
    | TypeString
    | TypeNumber
    | TypeBoolean
    | TypeBigInt
    | TypeSymbol
    | TypeNull
    | TypeUndefined
    | TypeLiteral
    | TypeTemplateLiteral
    | TypeParameter
    | TypeFunction
    | TypeMethod
    | TypeProperty
    | TypePromise
    | TypeClass
    | TypeEnum
    | TypeEnumMember
    | TypeUnion
    | TypeIntersection
    | TypeArray
    | TypeObjectLiteral
    | TypeIndexSignature
    | TypePropertySignature
    | TypeMethodSignature
    | TypeTypeParameter
    | TypeInfer
    | TypeTuple
    | TypeTupleMember
    | TypeRest
    | TypeRegexp
    | TypeCallSignature
    ;

export type Widen<T> =
    T extends string ? string
        : T extends number ? number
            : T extends bigint ? bigint
                : T extends boolean ? boolean
                    : T extends symbol ? symbol : T;

export type FindType<T extends Type, LOOKUP extends ReflectionKind> = T extends {
    kind: infer K
} ? K extends LOOKUP ? T : never : never;

/**
 * Merge dynamic runtime types with static types. In the type-system resolves as any, in runtime as the correct type.
 *
 * ```typescript
 * const stringType = {kind: ReflectionKind.string};
 * type t = {a: InlineRuntimeType<typeof stringType>}
 *
 * const value = 34;
 * type t = {a: InlineRuntimeType<typeof value>}
 * ```
 */
export type InlineRuntimeType<T extends ReceiveType<unknown> | undefined | ReflectionClass<any> | Type | number | string | boolean | bigint, R = any> = T extends ReflectionClass<infer K>
    ? K : T extends ReceiveType<unknown>
        ? R : T extends Type ? R
            : T extends undefined
                ? never : T;

export function isType(entry: any): entry is Type {
    return entry && 'object' === typeof entry && 'number' === typeof entry.kind;
}

export function isBinary(type: Type): boolean {
    return type.kind === ReflectionKind.class && binaryTypes.includes(type.classType);
}

export function isPrimitive<T extends Type>(type: T): boolean {
    return type.kind === ReflectionKind.string || type.kind === ReflectionKind.number || type.kind === ReflectionKind.bigint || type.kind === ReflectionKind.boolean
        || type.kind === ReflectionKind.literal || type.kind === ReflectionKind.null || type.kind === ReflectionKind.undefined;
}

export function isPropertyType(type: Type): type is TypePropertySignature | TypeProperty {
    return type.kind === ReflectionKind.property || type.kind === ReflectionKind.propertySignature;
}

/**
 * Returns true if the type is TypePropertySignature | TypeProperty and not a static member.
 */
export function isPropertyMemberType(type: Type): type is TypePropertySignature | TypeProperty {
    if (type.kind === ReflectionKind.property) return !type.static;
    return type.kind === ReflectionKind.propertySignature;
}

/**
 * Return all properties created in the constructor (via `constructor(public title: string)`)
 *
 * If a non-property parameter is in the constructor, the type is given instead, e.g. `constructor(public title: string, anotherOne:number)` => [TypeProperty, TypeNumber]
 */
export function getConstructorProperties(type: TypeClass | TypeObjectLiteral): {
    parameters: (TypeProperty | Type)[],
    properties: TypeProperty[]
} {
    const result: { parameters: (TypeProperty | Type)[], properties: TypeProperty[] } = {
        parameters: [],
        properties: [],
    };
    if (type.kind === ReflectionKind.objectLiteral) return result;
    const constructor = findMember('constructor', resolveTypeMembers(type)) as TypeMethod | undefined;
    if (!constructor) return result;

    for (const parameter of constructor.parameters) {
        const property = findMember(parameter.name, resolveTypeMembers(type));
        if (property && property.kind === ReflectionKind.property) {
            result.properties.push(property);
            result.parameters.push(property);
        } else {
            result.parameters.push(parameter.type as Type);
        }
    }
    return result;
}

export type WithAnnotations =
    TypeAny
    | TypeUnknown
    | TypeString
    | TypeNumber
    | TypeBigInt
    | TypeBoolean
    | TypeArray
    | TypeTuple
    | TypeLiteral
    | TypeNull
    | TypeUndefined
    | TypeClass
    | TypeObjectLiteral
    | TypeObject
    | TypeTemplateLiteral
    | TypeRegexp
    | TypeSymbol;

export function isWithAnnotations(type: ParentLessType): type is WithAnnotations {
    return type.kind === ReflectionKind.any || type.kind === ReflectionKind.unknown || type.kind === ReflectionKind.string || type.kind === ReflectionKind.number || type.kind === ReflectionKind.bigint || type.kind === ReflectionKind.boolean
        || type.kind === ReflectionKind.union || type.kind === ReflectionKind.array || type.kind === ReflectionKind.tuple || type.kind === ReflectionKind.literal || type.kind === ReflectionKind.null || type.kind === ReflectionKind.undefined
        || type.kind === ReflectionKind.class || type.kind === ReflectionKind.objectLiteral || type.kind === ReflectionKind.object || type.kind === ReflectionKind.templateLiteral
        || type.kind === ReflectionKind.regexp || type.kind === ReflectionKind.symbol;
}

export function getAnnotations(type: WithAnnotations): Annotations {
    return type.annotations ||= {};
}

type StackEntry = {
    left: Type,
    right: Type,
}

function hasStack(stack: StackEntry[], left: Type, right: Type): boolean {
    for (const entry of stack) {
        if (entry.left === left && entry.right === right) return true;
    }
    return false;
}


/**
 * Checks if the structure of a and b are identical.
 */
export function isSameType(a: Type, b: Type, stack: StackEntry[] = []): boolean {
    if (a === b) return true;

    // If one type has a decorator, we treat it as unique
    if (a.decorators?.length || b.decorators?.length) return false;

    if (hasStack(stack, a, b)) return true;

    stack.push({ left: a, right: b });

    try {
        if (a.kind !== b.kind) return false;
        if (a.typeName && b.typeName && a.typeName !== b.typeName) return false;
        if (a.kind === ReflectionKind.infer || b.kind === ReflectionKind.infer) return false;
        if (a.kind === ReflectionKind.promise && b.kind === ReflectionKind.promise) return isSameType(a.type, b.type, stack);

        if (a.kind === ReflectionKind.literal) return a.literal === (b as TypeLiteral).literal;

        if (a.kind === ReflectionKind.templateLiteral && b.kind === ReflectionKind.templateLiteral) {
            if (a.types.length !== b.types.length) return false;

            for (let i = 0; a.types.length; i++) {
                if (!isSameType(a.types[i], b.types[i], stack)) return false;
            }
            return true;
        }

        if (a.kind === ReflectionKind.class && b.kind === ReflectionKind.class) {
            return a.classType === b.classType;
            // if (a.classType !== b.classType) return false;
            // if (!a.arguments && !b.arguments) return true;
            // if (!a.arguments || !b.arguments) return false;
            //
            // if (a.arguments && !b.arguments) return false;
            // if (!a.arguments && b.arguments) return false;
            //
            // for (let i = 0; a.arguments.length; i++) {
            //     if (!a.arguments[i] || !b.arguments[i]) return false;
            //     const aMember = a.arguments[i];
            //     const bMember = b.arguments[i];
            //     if (aMember === bMember) continue;
            //
            //     if (aMember.kind === ReflectionKind.property) {
            //         if (bMember.kind === ReflectionKind.property) {
            //             if (aMember.name !== bMember.name) return false;
            //             if (aMember.readonly !== bMember.readonly) return false;
            //             if (aMember.optional !== bMember.optional) return false;
            //             if (aMember.abstract !== bMember.abstract) return false;
            //             if (aMember.visibility !== bMember.visibility) return false;
            //             if (!isSameType(aMember.type, bMember.type, stack)) return false;
            //         } else {
            //             return false;
            //         }
            //     } else {
            //         if (!isSameType(aMember, bMember)) return false;
            //     }
            // }
            // return true;
        }

        if (a.kind === ReflectionKind.objectLiteral && b.kind === ReflectionKind.objectLiteral) {
            if (a.types.length !== b.types.length) return false;

            for (const aMember of a.types) {
                //todo: call signature
                if (aMember.kind === ReflectionKind.indexSignature) {
                    const valid = b.types.some(v => {
                        if (v.kind !== ReflectionKind.indexSignature) return false;
                        const sameIndex = isSameType(aMember.index, v.index, stack);
                        const sameType = isSameType(aMember.type, v.type, stack);
                        return sameIndex && sameType;
                    });
                    if (!valid) return false;
                } else if (aMember.kind === ReflectionKind.propertySignature || aMember.kind === ReflectionKind.methodSignature) {
                    const bMember = findMember(aMember.name, b.types);
                    if (!bMember) return false;
                    if (aMember === bMember) continue;

                    if (aMember.kind === ReflectionKind.propertySignature) {
                        if (bMember.kind === ReflectionKind.propertySignature) {
                            if (aMember.name !== bMember.name) return false;
                            if (aMember.readonly !== bMember.readonly) return false;
                            if (aMember.optional !== bMember.optional) return false;
                            if (aMember.type === bMember.type) continue;
                            if (!isSameType(aMember.type, bMember.type, stack)) return false;
                        } else {
                            return false;
                        }
                    } else {
                        if (!isSameType(aMember, bMember, stack)) return false;
                    }
                }
            }
            return true;
        }

        if (a.kind === ReflectionKind.tupleMember) {
            if (b.kind !== ReflectionKind.tupleMember) return false;

            return a.optional === b.optional && a.name === b.name && isSameType(a.type, b.type, stack);
        }

        if (a.kind === ReflectionKind.array) {
            if (b.kind !== ReflectionKind.array) return false;

            return isSameType(a.type, b.type, stack);
        }

        if (a.kind === ReflectionKind.tuple) {
            if (b.kind !== ReflectionKind.tuple) return false;
            if (a.types.length !== b.types.length) return false;

            for (let i = 0; i < a.types.length; i++) {
                if (!isSameType(a.types[i], b.types[i], stack)) return false;
            }
            return true;
        }

        if (a.kind === ReflectionKind.parameter) {
            if (b.kind !== ReflectionKind.parameter) return false;
            return a.name === b.name && a.optional === b.optional && isSameType(a.type, b.type, stack);
        }

        if (a.kind === ReflectionKind.function || a.kind === ReflectionKind.method || a.kind === ReflectionKind.methodSignature) {
            if (b.kind !== ReflectionKind.function && b.kind !== ReflectionKind.method && b.kind !== ReflectionKind.methodSignature) return false;
            if (a.parameters.length !== b.parameters.length) return false;
            if (a.kind === ReflectionKind.function && b.kind === ReflectionKind.function && a.function !== b.function) return false;

            if (a.kind === ReflectionKind.method && b.kind === ReflectionKind.method) {
                if (a.visibility !== b.visibility) return false;
            }

            if (a.name !== b.name) return false;

            for (let i = 0; i < a.parameters.length; i++) {
                if (!isSameType(a.parameters[i], b.parameters[i], stack)) return false;
            }

            return isSameType(a.return, b.return, stack);
        }

        if (a.kind === ReflectionKind.enum) {
            if (b.kind !== ReflectionKind.enum) return false;
            if (a.values.length !== b.values.length) return false;

            for (let i = 0; i < a.values.length; i++) {
                if (a.values[i] !== b.values[i]) return false;
            }

            return true;
        }

        if (a.kind === ReflectionKind.union) {
            if (b.kind !== ReflectionKind.union) return false;
            if (a.types.length !== b.types.length) return false;
            for (let i = 0; i < a.types.length; i++) {
                const left = a.types[i];
                const right = b.types[i];
                if (!left || !right) return false;
                if (left === right) continue;

                const same = isSameType(left, right, stack);
                if (!same) return false;
            }
        }

        return a.kind === b.kind;
    } finally {
        // stack.pop();
    }
}

export function addType<T extends Type>(container: T, type: Type): T {
    if (container.kind === ReflectionKind.tuple) {
        if (type.kind === ReflectionKind.tupleMember) {
            container.types.push({ ...type, parent: container });
        } else {
            container.types.push({ kind: ReflectionKind.tupleMember, parent: container, type: type as Type });
        }
    } else if (container.kind === ReflectionKind.union) {
        if (type.kind === ReflectionKind.union) {
            for (const t of flatten(type).types) {
                addType(container, t);
            }
        } else if (type.kind === ReflectionKind.tupleMember) {
            if (type.optional && !isTypeIncluded(container.types, { kind: ReflectionKind.undefined })) {
                container.types.push({ kind: ReflectionKind.undefined, parent: container });
            }
            addType(container, type.type);
        } else if (type.kind === ReflectionKind.rest) {
            addType(container, type.type);
        } else {
            if (!isTypeIncluded(container.types, type)) {
                container.types.push({ ...type as any, parent: container });
            }
        }
    }

    return container;
}

export function isTypeIncluded(types: Type[], type: Type, stack: StackEntry[] = []): boolean {
    for (const t of types) {
        if (isSameType(t, type, stack)) return true;
    }

    return false;
}

/**
 * `true | (string | number)` => `true | string | number`
 */
export function flatten<T extends Type>(type: T): T {
    if (type.kind === ReflectionKind.union) {
        type.types = flattenUnionTypes(type.types);
    }
    return type;
}

/**
 * Flatten nested union types.
 */
export function flattenUnionTypes(types: Type[]): Type[] {
    const result: Type[] = [];
    for (const type of types) {
        if (type.kind === ReflectionKind.union) {
            for (const s of flattenUnionTypes(type.types)) {
                if (!isTypeIncluded(result, s)) result.push(s);
            }
        } else {
            if (!isTypeIncluded(result, type)) result.push(type);
        }
    }

    return result;
}

/**
 * empty union => never
 * union with one member => member
 * otherwise the union is returned
 */
export function unboxUnion(union: TypeUnion): Type {
    if (union.types.length === 0) return { kind: ReflectionKind.never };
    if (union.types.length === 1) return union.types[0] as Type;

    // //convert union of {a: string} | {b: number} | {c: any} to {a?: string, b?: number, c?: any};
    // //this does work: {a?: string, b?: string} | {b2?: number} | {c: any} to {a?: string, b?: number, c?: any};
    // //this does not work: {a?: string, b?: string} | {b?: number} | {c: any} to {a?: string, b?: number, c?: any};
    // if (union.types.length > 1) {
    //     //if a property is known already, don't merge it
    //     const known: string[] = [];
    //
    //     for (const member of union.types) {
    //         if (member.kind !== ReflectionKind.objectLiteral) return union;
    //         if (member.decorators) return union; //if one member has a decorators, we do not merge
    //         const needsOptional = member.types.length > 1;
    //         for (const t of member.types) {
    //             if (t.kind === ReflectionKind.indexSignature) return union;
    //             const name = memberNameToString(t.name);
    //             if (known.includes(name)) return union;
    //             known.push(name);
    //             if (needsOptional && !isOptional(t)) return union;
    //         }
    //     }
    //     const bl: {[index: string]: boolean} = {};
    //
    //     const big: TypeObjectLiteral = { kind: ReflectionKind.objectLiteral, types: [] };
    //     for (const member of union.types) {
    //         if (member.kind !== ReflectionKind.objectLiteral) continue;
    //         for (const t of member.types) {
    //             if (t.kind === ReflectionKind.indexSignature) return union;
    //             big.types.push(t);
    //             t.parent = big;
    //             t.optional = true;
    //         }
    //     }
    //     big.parent = union.parent;
    //     return big;
    // }

    return union;
}

export function findMember(
    index: string | number | symbol | TypeTemplateLiteral, types: Type[],
): TypePropertySignature | TypeMethodSignature | TypeMethod | TypeProperty | TypeIndexSignature | undefined {
    const indexType = typeof index;

    for (const member of types) {
        if (member.kind === ReflectionKind.propertySignature && member.name === index) return member;
        if (member.kind === ReflectionKind.methodSignature && member.name === index) return member;
        if (member.kind === ReflectionKind.property && member.name === index) return member;
        if (member.kind === ReflectionKind.method && member.name === index) return member;

        if (member.kind === ReflectionKind.indexSignature) {
            if (member.index.kind === ReflectionKind.string && 'string' === indexType) return member;
            if (member.index.kind === ReflectionKind.number && 'number' === indexType) return member;
            if (member.index.kind === ReflectionKind.symbol && 'symbol' === indexType) return member;
            //todo: union needs to match depending on union and indexType
        }
    }

    return;
}

function resolveObjectIndexType(type: TypeObjectLiteral | TypeClass, index: Type): Type {
    if (index.kind === ReflectionKind.literal && ('string' === typeof index.literal || 'number' === typeof index.literal || 'symbol' === typeof index.literal)) {
        const member = findMember(index.literal, resolveTypeMembers(type));
        if (member) {
            if (member.kind === ReflectionKind.indexSignature) {
                //todo: check if index type matches literal type
                return member.type;
            } else if (member.kind === ReflectionKind.method || member.kind === ReflectionKind.methodSignature) {
                return member;
            } else if (member.kind === ReflectionKind.property || member.kind === ReflectionKind.propertySignature) {
                return member.type;
            } else {
                return { kind: ReflectionKind.never };
            }
        } else {
            return { kind: ReflectionKind.never };
        }
    } else if (index.kind === ReflectionKind.string || index.kind === ReflectionKind.number || index.kind === ReflectionKind.symbol) {
        //check if index signature match
        for (const member of resolveTypeMembers(type)) {
            if (member.kind === ReflectionKind.indexSignature) {
                if (isExtendable(index, member.index)) return member.type;
            }
        }
    }
    return { kind: ReflectionKind.never };
}

interface CStack {
    iterator: Type[];
    i: number;
    round: number;
}

export function emptyObject(type: Type): boolean {
    return (type.kind === ReflectionKind.objectLiteral || type.kind === ReflectionKind.class) && type.types.length === 0;
}

export class CartesianProduct {
    protected stack: CStack[] = [];

    private current(s: CStack): Type {
        return s.iterator[s.i];
    }

    private next(s: CStack): boolean {
        return (++s.i === s.iterator.length) ? (s.i = 0, false) : true;
    }

    toGroup(type: Type): Type[] {
        if (type.kind === ReflectionKind.boolean) {
            return [{ kind: ReflectionKind.literal, literal: 'false' }, {
                kind: ReflectionKind.literal,
                literal: 'true',
            }];
        } else if (type.kind === ReflectionKind.null) {
            return [{ kind: ReflectionKind.literal, literal: 'null' }];
        } else if (type.kind === ReflectionKind.undefined) {
            return [{ kind: ReflectionKind.literal, literal: 'undefined' }];
            // } else if (type.kind === ReflectionKind.templateLiteral) {
            // //     //todo: this is wrong
            // //     return type.types;
            //     const result: Type[] = [];
            //     for (const s of type.types) {
            //         const g = this.toGroup(s);
            //         result.push(...g);
            //     }
            //
            //     return result;
        } else if (type.kind === ReflectionKind.union) {
            const result: Type[] = [];
            for (const s of type.types) {
                const g = this.toGroup(s);
                result.push(...g);
            }

            return result;
        } else {
            return [type];
        }
    }

    add(item: Type) {
        this.stack.push({ iterator: this.toGroup(item), i: 0, round: 0 });
    }

    calculate(): Type[][] {
        const result: Type[][] = [];
        outer:
            while (true) {
                const row: Type[] = [];
                for (const s of this.stack) {
                    const item = this.current(s);
                    if (item.kind === ReflectionKind.templateLiteral) {
                        row.push(...item.types);
                    } else {
                        row.push(item);
                    }
                }
                result.push(row);

                for (let i = this.stack.length - 1; i >= 0; i--) {
                    const active = this.next(this.stack[i]);
                    //when that i stack is active, continue in main loop
                    if (active) continue outer;

                    //i stack was rewinded. If its the first, it means we are done
                    if (i === 0) break outer;
                }
                break;
            }

        return result;
    }
}

/**
 * Query a container type and return the result.
 *
 * container[index]
 *
 * e.g. {a: string}['a'] => string
 * e.g. {a: string, b: number}[keyof T] => string | number
 * e.g. [string, number][0] => string
 * e.g. [string, number][number] => string | number
 */
export function indexAccess(container: Type, index: Type): Type {
    if (container.kind === ReflectionKind.array) {
        if ((index.kind === ReflectionKind.literal && 'number' === typeof index.literal) || index.kind === ReflectionKind.number) return container.type;
        if (index.kind === ReflectionKind.literal && index.literal === 'length') return { kind: ReflectionKind.number };
    } else if (container.kind === ReflectionKind.tuple) {
        if (index.kind === ReflectionKind.literal && index.literal === 'length') {
            return { kind: ReflectionKind.literal, literal: container.types.length };
        }
        if (index.kind === ReflectionKind.literal && 'number' === typeof index.literal && index.literal < 0) {
            index = { kind: ReflectionKind.number };
        }

        if (index.kind === ReflectionKind.literal && 'number' === typeof index.literal) {
            type b0 = [string, boolean?][0]; //string
            type b1 = [string, boolean?][1]; //boolean|undefined
            type a0 = [string, ...number[], boolean][0]; //string
            type a1 = [string, ...number[], boolean][1]; //number|boolean
            type a2 = [string, ...number[], boolean][2]; //number|boolean
            type a22 = [string, ...number[], boolean][3]; //number|boolean
            // type a23 = [string, number, boolean][4]; //number|boolean
            type a3 = [string, number, ...number[], boolean][1]; //number
            type a4 = [string, number, ...number[], boolean][-2]; //string|number|boolean, minus means all
            type a5 = [string, number, ...number[], boolean][number]; //string|number|boolean

            let restPosition = -1;
            for (let i = 0; i < container.types.length; i++) {
                if (container.types[i].type.kind === ReflectionKind.rest) {
                    restPosition = i;
                    break;
                }
            }

            if (restPosition === -1 || index.literal < restPosition) {
                const sub = container.types[index.literal];
                if (!sub) return { kind: ReflectionKind.undefined };
                if (sub.optional) return {
                    kind: ReflectionKind.union,
                    types: [sub.type, { kind: ReflectionKind.undefined }],
                };
                return sub.type;
            }

            //index beyond a rest, return all beginning from there as big enum

            const result: TypeUnion = { kind: ReflectionKind.union, types: [] };
            for (let i = restPosition; i < container.types.length; i++) {
                const member = container.types[i];
                const type = member.type.kind === ReflectionKind.rest ? member.type.type : member.type;
                if (!isTypeIncluded(result.types, type)) result.types.push(type);
                if (member.optional && !isTypeIncluded(result.types, { kind: ReflectionKind.undefined })) result.types.push({ kind: ReflectionKind.undefined });
            }

            return unboxUnion(result);
        } else if (index.kind === ReflectionKind.number) {
            const union: TypeUnion = { kind: ReflectionKind.union, types: [] };
            for (const sub of container.types) {
                if (sub.type.kind === ReflectionKind.rest) {
                    if (isTypeIncluded(union.types, sub.type.type)) continue;
                    union.types.push(sub.type.type);
                } else {
                    if (isTypeIncluded(union.types, sub.type)) continue;
                    union.types.push(sub.type);
                }
            }
            return unboxUnion(union);
        } else {
            return { kind: ReflectionKind.never };
        }
    } else if (container.kind === ReflectionKind.objectLiteral || container.kind === ReflectionKind.class) {
        if (index.kind === ReflectionKind.literal) {
            return resolveObjectIndexType(container, index);
        } else if (index.kind === ReflectionKind.union) {
            const union: TypeUnion = { kind: ReflectionKind.union, types: [] };
            for (const t of index.types) {
                const result = resolveObjectIndexType(container, t);
                if (result.kind === ReflectionKind.never) continue;

                if (result.kind === ReflectionKind.union) {
                    for (const resultT of result.types) {
                        if (isTypeIncluded(union.types, resultT)) continue;
                        union.types.push(resultT);
                    }
                } else {
                    if (isTypeIncluded(union.types, result)) continue;
                    union.types.push(result);
                }
            }
            return unboxUnion(union);
        } else {
            return { kind: ReflectionKind.never };
        }
    } else if (container.kind === ReflectionKind.any) {
        return { kind: ReflectionKind.any };
    } else if (container.kind === ReflectionKind.union) {
        if (index.kind === ReflectionKind.literal) {
            // Deals with indexing a union with a literal.
            // For example, if you have a union of {foo: 'bar'} | {foo: 'baz'}
            // and you index it with 'foo', you get 'bar' | 'baz'. This should
            // accordingly print ['bar', 'baz'] when valueOf<...>() is called
            // on the union.
            if (['string', 'number', 'symbol'].includes(typeof index.literal)) {
                const union: TypeUnion = { kind: ReflectionKind.union, types: [] };

                // For each type in the union, t, resolve the type at index.
                for (const t of container.types) {
                    const resolvedType = indexAccess(t, index);
                    if (isTypeIncluded(union.types, resolvedType)) continue;
                    union.types.push(resolvedType);
                }

                return unboxUnion(union);
            }
        } else if (index.kind === ReflectionKind.union) {
            // Further, it is possible to index a union with a union of
            // literals. So this deals with that case. For example, if you
            // have a union of {foo: 'bar', a: 'b'} | {foo: 'baz', a: 'c'} and
            // you index it with 'foo' | 'a', you get 'bar' | 'baz' | 'b' | 'c'
            // and valueOf<...>() should return ['bar', 'baz', 'b', 'c'].

            const types: Type[] = [];

            // Pre-compute a list of indices to avoid having to re-do this for
            // each entry in the union.
            const indices: TypeLiteral[] = [];

            const unboxedIndex = unboxUnion(index);
            if (unboxedIndex.kind === ReflectionKind.union) {
                for (const indexEntry of unboxedIndex.types) {
                    // (At least for now) accept only literals as indices.
                    if (indexEntry.kind !== ReflectionKind.literal) continue;
                    // Don't add duplicate indices.
                    if (indices.includes(indexEntry)) continue;
                    // Push the index to the list of indices.
                    indices.push(indexEntry);
                }
            }

            // Each type in the type union (where that type union is indexable)
            // is assumed to be an object literal or class, so we loop over
            // each of those types.
            for (const t of container.types) {
                // This approach does not produce identical results to
                // TypeScript - as this reduces all duplicates from the result
                // (i.e., it produces the 'set' of all types that would be
                // returned by TypeScript), whereas TypeScript will not reduce
                // string literals to a single entry, but will reduce numeric
                // literals. Unless this absolute fidelity is required, this
                // approach is simpler and probably makes more sense too.
                for (const index of indices) {
                    const resolvedType = indexAccess(t, index);
                    if (isTypeIncluded(types, resolvedType)) continue;
                    types.push(resolvedType);
                }
            }

            return unboxUnion({ kind: ReflectionKind.union, types });
        }
    }
    return { kind: ReflectionKind.never };
}

export function merge(types: (TypeObjectLiteral | TypeClass)[]): TypeObjectLiteral {
    const type: TypeObjectLiteral = { kind: ReflectionKind.objectLiteral, id: state.nominalId++, types: [] };

    for (const subType of types) {
        for (const member of subType.types) {
            if (member.kind === ReflectionKind.indexSignature) {
                member.parent = type;
                type.types.push(member);
            } else if (!isMember(member)) {
                continue;
            } else {
                const t = toSignature(member);
                t.parent = type;
                const existing = getMember(type, member.name);
                if (existing) {
                    arrayRemoveItem(type.types, existing as Type);
                }
                type.types.push(t);
            }
        }
    }
    return type;
}

export function narrowOriginalLiteral(type: Type): Type {
    if ((type.kind === ReflectionKind.string || type.kind === ReflectionKind.number || type.kind === ReflectionKind.boolean || type.kind === ReflectionKind.bigint) && type.origin) {
        return type.origin;
    }
    return type;
}

type GetArrayElement<T extends any[]> = [T] extends [Array<infer K>] ? K : never;
type RemoveParent<T, K extends keyof T> = { [P in K]: T[P] extends Type[] ? RemoveParentHomomorphic<GetArrayElement<T[P]>>[] : T[P] extends Type ? RemoveParentHomomorphic<T[P]> : T[P] };
type RemoveParentHomomorphic<T> = RemoveParent<T, Exclude<keyof T, 'parent'>>;
type RemoveDeepParent<T extends Type> = T extends infer K ? RemoveParentHomomorphic<K> : never;
export type ParentLessType = RemoveDeepParent<Type>;

/**
 * This function does not do a deep copy, only shallow. A deep copy makes it way to inefficient, so much that router.spec.ts takes up to 20-30seconds
 * to complete instead of barely 30ms.
 */
export function copyAndSetParent<T extends ParentLessType>(inc: T, parent?: Type): FindType<Type, T['kind']> {
    const type = parent ? { ...inc, parent: parent } as Type : { ...inc } as Type;

    if (isWithAnnotations(type) && isWithAnnotations(inc)) {
        if (inc.annotations) {
            type.annotations = {};
            //we have to make copies of each annotation since they get modified when intersected
            for (const prop of Object.getOwnPropertySymbols(inc.annotations)) {
                if (inc.annotations[prop]) type.annotations[prop] = inc.annotations[prop].slice();
            }
        }
        if (inc.decorators) type.decorators = inc.decorators.slice();
        if (inc.indexAccessOrigin) type.indexAccessOrigin = { ...inc.indexAccessOrigin };
        if (inc.typeArguments) type.typeArguments = inc.typeArguments.slice();
        type.jit = {};
    }

    switch (type.kind) {
        case ReflectionKind.objectLiteral:
        case ReflectionKind.tuple:
        case ReflectionKind.union:
        case ReflectionKind.class:
        case ReflectionKind.intersection:
        case ReflectionKind.templateLiteral:
            type.types = type.types.slice();
            break;
        case ReflectionKind.string:
        case ReflectionKind.number:
        case ReflectionKind.bigint:
        case ReflectionKind.symbol:
        case ReflectionKind.regexp:
        case ReflectionKind.boolean:
            // if (type.origin) type.origin = copyAndSetParent(type.origin, type, stack);
            break;
        case ReflectionKind.function:
        case ReflectionKind.method:
        case ReflectionKind.methodSignature:
            // type.return = copyAndSetParent(type.return, type, stack);
            // type.parameters = type.parameters.map(member => copyAndSetParent(member, type, stack));
            break;
        case ReflectionKind.propertySignature:
        case ReflectionKind.property:
        case ReflectionKind.array:
        case ReflectionKind.promise:
        case ReflectionKind.parameter:
        case ReflectionKind.tupleMember:
        case ReflectionKind.rest:
            // type.type = copyAndSetParent(type.type, type, stack);
            break;
        case ReflectionKind.indexSignature:
            // type.index = copyAndSetParent(type.index, type, stack);
            // type.type = copyAndSetParent(type.type, type, stack);
            break;
    }

    return type as any;
}

export function widenLiteral(type: Type): Type {
    if (type.kind === ReflectionKind.literal) {
        if ('number' === typeof type.literal) return copyAndSetParent({ kind: ReflectionKind.number, origin: type });
        if ('boolean' === typeof type.literal) return copyAndSetParent({ kind: ReflectionKind.boolean, origin: type });
        if ('bigint' === typeof type.literal) return copyAndSetParent({ kind: ReflectionKind.bigint, origin: type });
        if ('symbol' === typeof type.literal) return copyAndSetParent({ kind: ReflectionKind.symbol, origin: type });
        if ('string' === typeof type.literal) return copyAndSetParent({ kind: ReflectionKind.string, origin: type });
        if (type.literal instanceof RegExp) return copyAndSetParent({ kind: ReflectionKind.regexp, origin: type });
    }

    return type;
}

export function assertType<K extends ReflectionKind, T>(t: Type | undefined, kind: K): asserts t is FindType<Type, K> {
    if (!t || t.kind !== kind) throw new Error(`Invalid type ${t ? ReflectionKind[t.kind] : undefined}, expected ${ReflectionKind[kind]}`);
}

export function getClassType(type: Type): ClassType {
    if (type.kind !== ReflectionKind.class) throw new Error(`Type needs to be TypeClass, but ${ReflectionKind[type.kind]} given.`);
    return type.classType;
}

export function isMember(type: Type): type is TypePropertySignature | TypeProperty | TypeMethodSignature | TypeMethod {
    return type.kind === ReflectionKind.propertySignature || type.kind === ReflectionKind.property
        || type.kind === ReflectionKind.methodSignature || type.kind === ReflectionKind.method;
}

export function hasMember(type: TypeObjectLiteral | TypeClass, memberName: number | string | symbol, memberType?: Type): boolean {
    return type.types.some(v => isMember(v) && v.name === memberName && (!memberType || isExtendable(v.kind === ReflectionKind.propertySignature || v.kind === ReflectionKind.property ? v.type : v, memberType)));
}

export function getMember(type: TypeObjectLiteral | TypeClass, memberName: number | string | symbol): TypeMethodSignature | TypeMethod | TypePropertySignature | TypeProperty | void {
    return (type.types as (TypeIndexSignature | TypeMethodSignature | TypeMethod | TypePropertySignature | TypeProperty)[]).find(v => isMember(v) && v.name === memberName) as TypeMethodSignature | TypeMethod | TypePropertySignature | TypeProperty | void;
}

export function getTypeObjectLiteralFromTypeClass<T extends Type>(type: T): T extends TypeClass ? TypeObjectLiteral : T {
    if (type.kind === ReflectionKind.class) {
        const objectLiteral: TypeObjectLiteral = {
            kind: ReflectionKind.objectLiteral,
            id: state.nominalId++,
            types: [],
        };
        for (const member of type.types) {
            if (member.kind === ReflectionKind.indexSignature) {
                objectLiteral.types.push(member);
                member.parent = objectLiteral;
            } else if (member.kind === ReflectionKind.property) {
                const m = { ...member, kind: ReflectionKind.propertySignature } as any as TypePropertySignature;
                m.parent = objectLiteral;
                objectLiteral.types.push(m);
            } else if (member.kind === ReflectionKind.method) {
                const m = { ...member, kind: ReflectionKind.methodSignature } as any as TypeMethodSignature;
                m.parent = objectLiteral;
                objectLiteral.types.push(m);
            }
        }
        return objectLiteral as any;
    }

    return type as any;
}

/**
 * Checks whether `undefined` is allowed as type.
 */
export function isOptional(type: Type): boolean {
    if (isMember(type) && type.optional === true) return true;
    if (type.kind === ReflectionKind.parameter) return type.optional || isOptional(type.type);
    if (type.kind === ReflectionKind.tupleMember) return type.optional || isOptional(type.type);
    if (type.kind === ReflectionKind.property || type.kind === ReflectionKind.propertySignature || type.kind === ReflectionKind.indexSignature) return isOptional(type.type);
    return type.kind === ReflectionKind.any || type.kind === ReflectionKind.undefined || (type.kind === ReflectionKind.union && type.types.some(isOptional));
}

/**
 * Whether a property has an initializer/default value.
 */
export function hasDefaultValue(type: Type): boolean {
    return (type.kind === ReflectionKind.property || type.kind === ReflectionKind.parameter) && type.default !== undefined;
}

/**
 * Checks whether `null` is allowed as type.
 */
export function isNullable(type: Type): boolean {
    if (type.kind === ReflectionKind.property || type.kind === ReflectionKind.propertySignature || type.kind === ReflectionKind.indexSignature) return isNullable(type.type);
    return type.kind === ReflectionKind.null || (type.kind === ReflectionKind.union && type.types.some(isNullable));
}

/**
 * Integer
 */
export type integer = number;

/**
 * Integer 8 bit.
 * Min value -127, max value 128
 */
export type int8 = number;

/**
 * Unsigned integer 8 bit.
 * Min value 0, max value 255
 */
export type uint8 = number;

/**
 * Integer 16 bit.
 * Min value -32768, max value 32767
 */
export type int16 = number;

/**
 * Unsigned integer 16 bit.
 * Min value 0, max value 65535
 */
export type uint16 = number;

/**
 * Integer 8 bit.
 * Min value -2147483648, max value 2147483647
 */
export type int32 = number;

/**
 * Unsigned integer 32 bit.
 * Min value 0, max value 4294967295
 */
export type uint32 = number;

/**
 * Float (same as number, but different semantic for databases).
 */
export type float = number;

/**
 * Float 32 bit.
 */
export type float32 = number;

/**
 * Float 64 bit.
 */
export type float64 = number;

export class AnnotationDefinition<T = true> {
    public symbol: symbol;

    constructor(public readonly id: string) {
        this.symbol = Symbol(id);
    }

    register(annotations: Annotations, data: T) {
        annotations[this.symbol] ||= [];
        annotations[this.symbol].push(data);
    }

    reset(annotations: Annotations) {
        //not `delete` so that Object.assign works
        annotations[this.symbol] = undefined;
    }

    registerType<TType extends Type>(type: TType, data: T): TType {
        type.annotations ||= {};
        this.register(type.annotations, data);
        return type;
    }

    replace(annotations: Annotations, annotation: T[]) {
        annotations[this.symbol] = annotation;
    }

    replaceType(type: Type, annotation: T[]) {
        type.annotations ||= {};
        type.annotations[this.symbol] = annotation;
    }

    getAnnotations(type: Type): T[] {
        if (type.annotations) return type.annotations[this.symbol] || [];
        return [];
    }

    getFirst(type: Type): T | undefined {
        return this.getAnnotations(type)[0];
    }

    hasAnnotations(type: Type): boolean {
        return this.getAnnotations(type).length > 0;
    }
}

export type AnnotationType<T extends AnnotationDefinition<any>> = T extends AnnotationDefinition<infer K> ? K : never;

export type ReferenceActions = 'RESTRICT' | 'NO ACTION' | 'CASCADE' | 'SET NULL' | 'SET DEFAULT';

export interface ReferenceOptions {
    /**
     * Default is CASCADE.
     */
    onDelete?: ReferenceActions,

    /**
     * Default is CASCADE.
     */
    onUpdate?: ReferenceActions
}

/**
 * note: if this is adjusted, make sure to adjust ReflectionClass, entityAnnotation, and type serializer accordingly.
 */
export interface EntityOptions {
    name?: string;
    description?: string;
    collection?: string;
    database?: string;
    singleTableInheritance?: boolean;
    indexes?: { names: string[], options: IndexOptions }[];
}

/**
 * Type to decorate an interface/object literal with entity information.
 *
 * ```typescript
 * interface User extends Entity<{name: 'user'}> {
 *     id: number & PrimaryKey & AutoIncrement;
 *     username: string & Unique;
 * }
 * ```
 */
export type Entity<T extends EntityOptions> = {} & TypeAnnotation<'entity', T>

/**
 * Marks a property as primary key.
 * ```typescript
 * class Entity {
 *     id: number & Primary = 0;
 * }
 * ```
 */
export type PrimaryKey = TypeAnnotation<'primaryKey'>;

type TypeKeyOf<T> = T[keyof T];
export type PrimaryKeyFields<T> = any extends T ? any : { [P in keyof T]: Required<T[P]> extends Required<PrimaryKey> ? T[P] : never };
export type PrimaryKeyType<T> = any extends T ? any : TypeKeyOf<PrimaryKeyFields<T>>;

export type ReferenceFields<T> = { [P in keyof T]: Required<T[P]> extends Required<Reference> | Required<BackReference> ? T[P] : never };

/**
 * Marks a primary property key as auto-increment.
 *
 * ```typescript
 * class Entity {
 *     id: number & Primary & AutoIncrement = 0;
 * }
 * ```
 */
export type AutoIncrement = TypeAnnotation<'autoIncrement'>;

/**
 * UUID v4, as string, serialized as string in JSON, and binary in database.
 * Use `uuid()` as handy initializer.
 *
 * ```typescript
 * class Entity {
 *     id: UUID = uuid();
 * }
 * ```
 */
export type UUID = string & TypeAnnotation<'UUIDv4'>;

/**
 * MongoDB's ObjectID type. serialized as string in JSON, ObjectID in database.
 */
export type MongoId = string & TypeAnnotation<'mongoId'>;

/**
 * Same as `bigint` but serializes to unsigned binary with unlimited size (instead of 8 bytes in most databases).
 * Negative values will be converted to positive (abs(x)).
 *
 * ```typescript
 * class Entity {
 *     id: BinaryBigInt = 0n;
 * }
 * ```
 */
export type BinaryBigInt = bigint & TypeAnnotation<'binaryBigInt'>;

/**
 * Same as `bigint` but serializes to signed binary with unlimited size (instead of 8 bytes in most databases).
 * The binary has an additional leading sign byte and is represented as an uint: 255 for negative, 0 for zero, or 1 for positive.
 *
 * ```typescript
 * class Entity {
 *     id: SignedBinaryBigInt = 0n;
 * }
 * ```
 */
export type SignedBinaryBigInt = bigint & TypeAnnotation<'signedBinaryBigInt'>;

export interface BackReferenceOptions {
    /**
     * Necessary for normalised many-to-many relations. This defines the class of the pivot table/collection.
     */
    via?: ClassType | {};

    /**
     * A reference/backReference can define which reference on the other side
     * reference back. This is necessary when there are multiple outgoing references
     * to the same entity.
     */
    mappedBy?: string,
}

export type Reference<Options extends ReferenceOptions = {}> = TypeAnnotation<'reference', Options>;
export type BackReference<Options extends BackReferenceOptions = {}> = TypeAnnotation<'backReference', Options>;
export type EmbeddedMeta<Options> = TypeAnnotation<'embedded', Options>;
export type Embedded<T, Options extends { prefix?: string } = {}> = T & EmbeddedMeta<Options>;

export type MapName<Alias extends string, ForSerializer extends string = ''> = TypeAnnotation<'mapName', [Alias, ForSerializer]>;

export const referenceAnnotation = new AnnotationDefinition<ReferenceOptions>('reference');
export const entityAnnotation = new class extends AnnotationDefinition<EntityOptions> {
    set<K extends keyof EntityOptions>(type: Type, name: K, value: EntityOptions[K]) {
        const data = this.getFirst(type) || {};
        data[name] = value;
        this.replaceType(type, [data]);
    }

    get(type: Type): EntityOptions {
        let data = this.getFirst(type);
        if (data) return data;
        data = {};
        this.replaceType(type, [data]);
        return data;
    }
}('entity');
export const mapNameAnnotation = new AnnotationDefinition<{ name: string, serializer?: string }>('mapName');

export const autoIncrementAnnotation = new AnnotationDefinition('autoIncrement');
export const primaryKeyAnnotation = new class extends AnnotationDefinition {
    isPrimaryKey(type: Type): boolean {
        return this.getAnnotations(type).length > 0;
    }
}('primaryKey');

export interface BackReferenceOptionsResolved {
    /**
     * Necessary for normalised many-to-many relations. This defines the class of the pivot table/collection.
     */
    via?: TypeClass | TypeObjectLiteral;

    /**
     * A reference/backReference can define which reference on the other side
     * reference back. This is necessary when there are multiple outgoing references
     * to the same entity.
     */
    mappedBy?: string,
}

export const backReferenceAnnotation = new AnnotationDefinition<BackReferenceOptionsResolved>('backReference');
export const validationAnnotation = new AnnotationDefinition<{ name: string, args: Type[] }>('validation');
export const UUIDAnnotation = new AnnotationDefinition('UUID');
export const mongoIdAnnotation = new AnnotationDefinition('mongoID');
export const uuidAnnotation = new AnnotationDefinition('uuid');
export const defaultAnnotation = new AnnotationDefinition<Type>('default');

export function isUUIDType(type: Type): boolean {
    return uuidAnnotation.getFirst(type) !== undefined;
}

export function isPrimaryKeyType(type: Type): boolean {
    return primaryKeyAnnotation.isPrimaryKey(type);
}

export function isAutoIncrementType(type: Type): boolean {
    return autoIncrementAnnotation.getFirst(type) !== undefined;
}

export function isMongoIdType(type: Type): boolean {
    return mongoIdAnnotation.getFirst(type) !== undefined;
}

export function isBinaryBigIntType(type: Type): boolean {
    return binaryBigIntAnnotation.getFirst(type) !== undefined;
}

export function isReferenceType(type: Type): boolean {
    return referenceAnnotation.getFirst(resolveProperty(type)) !== undefined;
}

export function getReferenceType(type: Type): ReferenceOptions | undefined {
    return referenceAnnotation.getFirst(resolveProperty(type));
}

export function isBackReferenceType(type: Type): boolean {
    return backReferenceAnnotation.getFirst(resolveProperty(type)) !== undefined;
}

export function resolveProperty(type: Type): Type {
    if (type.kind === ReflectionKind.propertySignature || type.kind === ReflectionKind.property) {
        type = type.type;
    }
    return type;
}

export function getBackReferenceType(type: Type): BackReferenceOptionsResolved {
    const options = backReferenceAnnotation.getFirst(type);
    if (!options) throw new Error('No back reference');
    return options;
}

export function isDateType(type: Type): boolean {
    return type.kind === ReflectionKind.class && type.classType === Date;
}

export function isSetType(type: Type): boolean {
    return type.kind === ReflectionKind.class && type.classType === Set;
}

export function isMapType(type: Type): boolean {
    return type.kind === ReflectionKind.class && type.classType === Map;
}

/**
 * Get the key type of a Map or object literal with index signatures.
 */
export function getKeyType(type: Type): Type {
    if (type.kind === ReflectionKind.class && type.classType === Map && type.typeArguments) return type.typeArguments[0] || { kind: ReflectionKind.any };
    if (type.kind === ReflectionKind.objectLiteral) {
        const type: TypeUnion = { kind: ReflectionKind.union, types: [] };
        for (const t of type.types) {
            if (t.kind === ReflectionKind.indexSignature) type.types.push(t.index);
        }
        if (type.types.length === 1) return type.types[0];
        if (type.types.length === 0) return { kind: ReflectionKind.any };
        return type;
    }
    return { kind: ReflectionKind.any };
}

/**
 * Get the value type of a Map or object literal with index signatures.
 */
export function getValueType(type: Type): Type {
    if (type.kind === ReflectionKind.class && type.classType === Map && type.typeArguments) return type.typeArguments[1] || { kind: ReflectionKind.any };
    if (type.kind === ReflectionKind.objectLiteral) {
        const type: TypeUnion = { kind: ReflectionKind.union, types: [] };
        for (const t of type.types) {
            if (t.kind === ReflectionKind.indexSignature) type.types.push(t.type);
        }
        if (type.types.length === 1) return type.types[0];
        if (type.types.length === 0) return { kind: ReflectionKind.any };
        return type;
    }
    return { kind: ReflectionKind.any };
}


export interface EmbeddedOptions {
    prefix?: string;
}

export const embeddedAnnotation = new AnnotationDefinition<EmbeddedOptions>('embedded');

export function hasEmbedded(type: Type): boolean {
    if (type.kind === ReflectionKind.propertySignature || type.kind === ReflectionKind.property) return hasEmbedded(type.type);
    if (type.kind === ReflectionKind.union) return type.types.some(hasEmbedded);
    return embeddedAnnotation.getFirst(type) !== undefined;
}

//`never` is here to allow using a decorator multiple times on the same type without letting the TS complaining about incompatible types.

/**
 * Assigns one or multiple groups to a type.
 *
 * @example
 * ```typescript
 * interface User {
 *     username: string;
 *     password: string & Group<'credentials'>;
 * }
 * ```
 */
export type Group<Name extends string> = TypeAnnotation<'group', Name>;

/**
 * Excludes the type from serialization of all kind.
 *
 * @example
 * ```typescript
 * interface User {
 *    username: string;
 *    password: string & Excluded;
 *  }
 *  ```
 */
export type Excluded<Name extends string = '*'> = TypeAnnotation<'excluded', Name>;

/**
 * Assigns arbitrary data to a type that can be read in runtime.
 *
 * @example
 * ```typescript
 * interface User {
 *   username: string;
 *   password: string & Data<'role', 'admin'>;
 * }
 * ```
 */
export type Data<Name extends string, Value> = TypeAnnotation<'data', [Name, Value]>;

/**
 * Resets an already set decorator to undefined.
 *
 * The required Name is the name of the type decorator (its first tuple entry).
 *
 * ```typescript
 * type Password = string & MinLength<6> & Excluded;
 *
 * interface UserCreationPayload {
 *     password: Password & ResetAnnotation<'excluded'>
 * }
 * ```
 */
export type ResetAnnotation<Name extends string> = TypeAnnotation<'reset', Name>;

export type IndexOptions = {
    name?: string;
    //index size. Necessary for blob/longtext, etc.
    size?: number,

    unique?: boolean,
    spatial?: boolean,
    sparse?: boolean,

    //only in mongodb
    fulltext?: boolean,
    where?: string,

    expireAfterSeconds?: number,
};

export type Unique<Options extends IndexOptions = {}> = TypeAnnotation<'index', Options & { unique: true }>;
export type Index<Options extends IndexOptions = {}> = TypeAnnotation<'index', Options>;

export interface DatabaseFieldOptions {
    /**
     * The name of the column in the database.
     * e.g. `userName: string & DatabaseField<{name: 'user_name'}>`
     *
     * Can alternatively also be configured by using a different NamingStrategy.
     */
    name?: string;

    /**
     *
     * e.g. `field: string & MySQL<{type: 'VARCHAR(255)'}>`
     */
    type?: string;

    /**
     * If the property is on a class, its initializer/default value is per default used.
     * This can be overridden using this option.
     * e.g. `field: string & MySQL<{default: 'abc'}>`
     */
    default?: any;

    /**
     * e.g. `field: string & MySQL<{defaultExpr: 'NOW()'}>`
     */
    defaultExpr?: any;

    /**
     * If true no default column value is inferred from the property initializer/default value.
     * e.g. `field: string & MySQL<{noDefault: true}> = ''`
     */
    noDefault?: true;

    /**
     * Skip this property in all queries and database migration files.
     */
    skip?: true;

    /**
     * Skip this property in database migration files. This excludes the property from the database, but
     * keeps it in the queries.
     */
    skipMigration?: true;
}

export interface MySQLOptions extends DatabaseFieldOptions {
}

export interface PostgresOptions extends DatabaseFieldOptions {
}

export interface SqliteOptions extends DatabaseFieldOptions {
}

type Database<Name extends string, Options extends { [name: string]: any }> = TypeAnnotation<'database', [Name, Options]>;
export type MySQL<Options extends MySQLOptions> = Database<'mysql', Options>;
export type Postgres<Options extends PostgresOptions> = Database<'postgres', Options>;
export type SQLite<Options extends SqliteOptions> = Database<'sqlite', Options>;
export type DatabaseField<Options extends DatabaseFieldOptions, Name extends string = '*'> = Database<Name, Options>;

export enum BinaryBigIntType {
    unsigned,
    signed
}

export const binaryBigIntAnnotation = new AnnotationDefinition<BinaryBigIntType>('binaryBigInt');
export const groupAnnotation = new AnnotationDefinition<string>('group');
export const excludedAnnotation = new class extends AnnotationDefinition<string> {
    isExcluded(type: Type, name: string): boolean {
        const excluded = this.getAnnotations(type);
        return excluded.includes('*') || excluded.includes(name);
    }
}('excluded');
export const dataAnnotation = new class extends AnnotationDefinition<{ [name: string]: any }> {
    set<T extends Type>(type: T, key: string, value: any): T {
        const data = this.getFirst(type) || {};
        data[key] = value;
        this.replaceType(type, [data]);
        return type;
    }

    get(type: Type, key: string): any {
        const data = this.getFirst(type) || {};
        return data[key];
    }
}('data');

/**
 * All raw data from `TypeAnnotation<Name, Options>` types.
 */
export const typeAnnotation = new class extends AnnotationDefinition<{ name: string, options: Type }> {
    /**
     * Returns the parsed Type to JS objects, e.g. `{name: string}` => `{name: 'xy'}`
     */
    getOption(type: Type, name: string): any {
        const options = this.getType(type, name);
        return options ? typeToObject(options) : undefined;
    }

    /**
     * Returns the Type object of the annotation which can be parsed with `typeToObject`.
     */
    getType(type: Type, name: string): Type | undefined {
        for (const v of this.getAnnotations(type)) {
            if (v.name === name) return v.options;
        }
        return;
    }
}('meta');
export const indexAnnotation = new AnnotationDefinition<IndexOptions>('index');
export const databaseAnnotation = new class extends AnnotationDefinition<{
    name: string,
    options: { [name: string]: any }
}> {
    getDatabase<T extends DatabaseFieldOptions>(type: Type, name: string): T | undefined {
        let options: T | undefined = undefined;
        for (const annotation of this.getAnnotations(type)) {
            if (annotation.name === '*' || annotation.name === name) {
                if (!options) options = {} as T;
                Object.assign(options, annotation.options as T);
            }
        }
        return options as any;
    };
}('database');

export function registerTypeDecorator(decorator: TypeDecorator) {
    typeDecorators.push(decorator);
}

/**
 * Type annotations are object literals with a single optional __meta in it
 * that has as type a tuple with the name of the annotation as first entry.
 * The tuple is intersected with the `never` type to make sure it does not
 * interfere with type checking.
 *
 * The processor has currently implemented to not resolve `never & x` to `never`,
 * so we still have the intersection type in runtime to resolve __meta correctly.
 *
 * ```typescript
 * type MyAnnotation1 = TypeAnnotation<'myAnnotation'>
 * type MyAnnotation1<T> = TypeAnnotation<'myAnnotation', T>
 *
 * //under the hood it is:
 * type lowLevel1 = { __meta?: never & ['myAnnotation'] }
 * type lowLevel2<T> = { __meta?: never & ['myAnnotation', T] }
 * ```
 */
export function getAnnotationMeta(type: TypeObjectLiteral): { id: string, options: Type } | undefined {
    const meta = getProperty(type, '__meta');
    if (!meta || !meta.optional) return;
    let tuple: TypeTuple | undefined = undefined;

    if (meta.type.kind === ReflectionKind.intersection) {
        if (meta.type.types.length === 1 && meta.type.types[0].kind === ReflectionKind.tuple) {
            tuple = meta.type.types[0] as TypeTuple;
        }
        if (!tuple && meta.type.types.length === 2) {
            tuple = meta.type.types.find(v => v.kind === ReflectionKind.tuple) as TypeTuple | undefined;
            if (tuple && !meta.type.types.find(v => v.kind === ReflectionKind.never)) {
                tuple = undefined;
            }
        }
    } else if (meta.type.kind === ReflectionKind.tuple) {
        tuple = meta.type;
    }

    if (!tuple) return;

    const id = tuple.types[0];
    if (!id || id.type.kind !== ReflectionKind.literal || 'string' !== typeof id.type.literal) return;
    const optionsMember = tuple.types[1];

    return { id: id.type.literal, options: optionsMember?.type };
}

export const typeDecorators: TypeDecorator[] = [
    (annotations: Annotations, decorator: TypeObjectLiteral) => {
        const meta = getAnnotationMeta(decorator);
        if (!meta) return false;

        switch (meta.id) {
            case 'reference': {
                const optionsType = meta.options;
                if (!optionsType || optionsType.kind !== ReflectionKind.objectLiteral) return false;
                const options = typeToObject(optionsType);
                referenceAnnotation.replace(annotations, [options]);
                return true;
            }
            case 'entity': {
                const optionsType = meta.options;
                if (!optionsType || optionsType.kind !== ReflectionKind.objectLiteral) return false;
                const options = typeToObject(optionsType);
                entityAnnotation.replace(annotations, [options]);
                return true;
            }
            case 'mapName': {
                if (!meta.options) return false;
                const [name, serializer] = typeToObject(meta.options);

                if ('string' === typeof name && (!serializer || 'string' === typeof serializer)) {
                    mapNameAnnotation.replace(annotations, [{ name, serializer }]);
                }
                return true;
            }
            case 'autoIncrement':
                autoIncrementAnnotation.register(annotations, true);
                return true;
            case 'binaryBigInt':
                binaryBigIntAnnotation.replace(annotations, [BinaryBigIntType.unsigned]);
                return true;
            case 'signedBinaryBigInt':
                binaryBigIntAnnotation.replace(annotations, [BinaryBigIntType.signed]);
                return true;
            case 'primaryKey':
                primaryKeyAnnotation.register(annotations, true);
                return true;
            case 'mongoId':
                mongoIdAnnotation.register(annotations, true);
                return true;
            case 'UUIDv4':
                uuidAnnotation.register(annotations, true);
                return true;
            case 'embedded': {
                const optionsType = meta.options;
                if (!optionsType || optionsType.kind !== ReflectionKind.objectLiteral) return false;
                const options = typeToObject(optionsType);
                embeddedAnnotation.replace(annotations, [options]);
                return true;
            }
            case 'group': {
                const nameType = meta.options;
                if (!nameType || nameType.kind !== ReflectionKind.literal || 'string' !== typeof nameType.literal) return false;
                groupAnnotation.register(annotations, nameType.literal);
                return true;
            }
            case 'index': {
                const optionsType = meta.options;
                if (!optionsType || optionsType.kind !== ReflectionKind.objectLiteral) return false;
                const options = typeToObject(optionsType);
                indexAnnotation.replace(annotations, [options]);
                return true;
            }
            case 'database': {
                const [name, options] = typeToObject(meta.options);
                databaseAnnotation.register(annotations, { name: name, options });
                return true;
            }
            case 'excluded': {
                const name = typeToObject(meta.options);
                excludedAnnotation.register(annotations, name);
                return true;
            }
            case 'reset': {
                const name = typeToObject(meta.options);
                if ('string' !== typeof name) return false;
                const map: { [name: string]: AnnotationDefinition<any> } = {
                    primaryKey: primaryKeyAnnotation,
                    autoIncrement: autoIncrementAnnotation,
                    excluded: excludedAnnotation,
                    database: databaseAnnotation,
                    index: indexAnnotation,
                    data: dataAnnotation,
                    group: groupAnnotation,
                    embedded: excludedAnnotation,
                    mapName: mapNameAnnotation,
                    reference: referenceAnnotation,
                    backReference: backReferenceAnnotation,
                    validator: validationAnnotation,
                };
                const annotation = map[name] || typeAnnotation;
                annotation.reset(annotations);
                return true;
            }
            case 'data': {
                const tuple = meta.options;
                if (!tuple || tuple.kind !== ReflectionKind.tuple) return false;
                const nameType = tuple.types[0].type;
                if (!nameType || nameType.kind !== ReflectionKind.literal || 'string' !== typeof nameType.literal) return false;
                const dataType = tuple.types[1].type;
                if (!dataType) return false;

                annotations[dataAnnotation.symbol] ||= [];
                let data: { [name: string]: any } = {};
                if (annotations[dataAnnotation.symbol].length) {
                    data = annotations[dataAnnotation.symbol][0];
                } else {
                    annotations[dataAnnotation.symbol].push(data);
                }

                data[nameType.literal] = dataType.kind === ReflectionKind.literal ? dataType.literal : dataType;

                return true;
            }
            case 'backReference': {
                const optionsType = meta.options;
                if (!optionsType || optionsType.kind !== ReflectionKind.objectLiteral) return false;

                const options = typeToObject(optionsType);
                const member = findMember('via', resolveTypeMembers(optionsType));
                backReferenceAnnotation.register(annotations, {
                    mappedBy: options.mappedBy,
                    via: member && member.kind === ReflectionKind.propertySignature && (member.type.kind === ReflectionKind.objectLiteral || member.type.kind === ReflectionKind.class) ? member.type : undefined,
                });
                return true;
            }
            case 'validator': {
                const tuple = meta.options;
                if (!tuple || tuple.kind !== ReflectionKind.tuple) return false;
                const nameType = tuple.types[0].type;
                if (!nameType || nameType.kind !== ReflectionKind.literal || 'string' !== typeof nameType.literal) return false;
                const name = nameType.literal;

                const argsType = tuple.types[1].type;
                if (!argsType || argsType.kind !== ReflectionKind.tuple) return false;
                const args: Type[] = argsType.types.map(v => v.type);

                const options: AnnotationType<typeof validationAnnotation> = { name, args };
                validationAnnotation.register(annotations, options);
                return true;
            }
            default: {
                typeAnnotation.register(annotations, { name: meta.id, options: meta.options });
                return true;
            }
        }
    },
];

export function stringifyAnnotationAsType(symbol: Symbol, type: Type): string | [string, Type[]][] {
    switch (symbol) {
        case primaryKeyAnnotation.symbol:
            return 'PrimaryKey';
        case autoIncrementAnnotation.symbol:
            return 'AutoIncrement';
        case uuidAnnotation.symbol:
            return 'UUID';
        case mongoIdAnnotation.symbol:
            return 'MongoId';
        case binaryBigIntAnnotation.symbol: {
            return binaryBigIntAnnotation.getFirst(type) === BinaryBigIntType.signed ? 'SignedBinaryBigInt' : 'BinaryBigInt';
        }
        case referenceAnnotation.symbol:
            return 'Reference';
        case backReferenceAnnotation.symbol:
            return 'BackReference';
        case embeddedAnnotation.symbol:
            return 'Embedded';
        case groupAnnotation.symbol:
            return 'Group';
        case excludedAnnotation.symbol:
            return 'Excluded';
        case indexAnnotation.symbol:
            return 'Index';
        case databaseAnnotation.symbol:
            return 'DatabaseField';
        case validationAnnotation.symbol: {
            const validations = validationAnnotation.getAnnotations(type);
            const defaultArgsMapping: Record<string, any[]> = {
                'decimal': [1, 100],
                // todo: implement all defaults, or find a better way
            };
            return validations.map(v => {
                const defaults = defaultArgsMapping[v.name];
                const argValues = v.args.map(v => typeToObject(v));
                let args = v.args;
                if (defaults) {
                    args = v.args.filter((arg, index) => {
                        const def = defaults[index];
                        const argValue = argValues[index];
                        return argValue !== def;
                    });
                }

                switch (v.name) {
                    case 'positive': {
                        return [argValues[0] === true ? 'Positive' : 'PositiveNoZero', []];
                    }
                    // todo implement more normalization, see validator.ts
                }

                return [v.name, args];
            });
        }
        default:
            return '';
    }
}

export function typeToObject(type?: Type, state: { stack: Type[] } = { stack: [] }): any {
    if (!type) return;

    if (state.stack.includes(type)) return undefined;
    state.stack.push(type);

    try {
        switch (type.kind) {
            case ReflectionKind.any:
            case ReflectionKind.void:
            case ReflectionKind.never:
            case ReflectionKind.undefined:
                return undefined;
            case ReflectionKind.null:
                return null;
            case ReflectionKind.string:
                return '';
            case ReflectionKind.number:
                return 0;
            case ReflectionKind.bigint:
                return BigInt(0);
            case ReflectionKind.regexp:
                return; //;
            case ReflectionKind.boolean:
                return true;
            case ReflectionKind.literal:
                return type.literal;
            case ReflectionKind.promise:
                return typeToObject(type.type);
            case ReflectionKind.templateLiteral:
                return '';
            case ReflectionKind.class: {
                return type.classType;
            }
            case ReflectionKind.objectLiteral: {
                const res: { [name: string | number | symbol]: any } = {};
                for (const t of type.types) {
                    if (t.kind === ReflectionKind.propertySignature) {
                        res[String(t.name)] = typeToObject(t.type);
                    } else if (t.kind === ReflectionKind.methodSignature) {
                    }
                }
                return res;
            }
            case ReflectionKind.union:
            case ReflectionKind.intersection:
                return typeToObject(type.types[0]);
            case ReflectionKind.function:
                return type.function;
            case ReflectionKind.array:
                return [typeToObject(type.type)];
            case ReflectionKind.tuple:
                return type.types.map(v => typeToObject(v.type, state));
        }

        return undefined;
    } finally {
        state.stack.pop();
    }
}

export function memberNameToString(name: number | string | symbol): string {
    if (isType(name)) {
        return stringifyResolvedType(name);
    }
    return String(name);
}

export const binaryTypes: ClassType[] = [
    Int8Array,
    Uint8Array,
    Uint8ClampedArray,
    Int16Array,
    Uint16Array,
    Int32Array,
    Uint32Array,
    Float32Array,
    Float64Array,
    ArrayBuffer,
];

/**
 * Returns true if the given type is Date, ArrayBuffer, Uint8Array, etc.
 */
export function isGlobalTypeClass(type: Type): type is TypeClass {
    if (type.kind !== ReflectionKind.class) return false;
    return isGlobalClass(type.classType);
}

/**
 * Returns true if the given type is TypeClass and references a custom (non-global) class.
 */
export function isCustomTypeClass(type: Type): type is TypeClass {
    return type.kind === ReflectionKind.class && !isGlobalTypeClass(type);
}

/**
 * Returns a type predicate that checks if the given type is a class and is of the given classType.
 * If withInheritance is true, it also checks if the type is a subclass of the given classType.
 */
export function isTypeClassOf(classType: ClassType, withInheritance: boolean = true): (type: Type) => boolean {
    if (!withInheritance) return (type: Type) => type.kind === ReflectionKind.class && type.classType === classType;

    return (type: Type) => {
        if (type.kind !== ReflectionKind.class) return false;
        const chain = getInheritanceChain(type.classType);
        return chain.includes(classType);
    };
}

/**
 * Returns the members of a class or object literal.
 */
export function resolveTypeMembers(type: TypeClass | TypeObjectLiteral): (TypeProperty | TypePropertySignature | TypeMethodSignature | TypeMethod | TypeIndexSignature | TypeCallSignature)[] {
    return type.types;
}

export function stringifyResolvedType(type: Type): string {
    return stringifyType(type, { showNames: false, showFullDefinition: true });
}

export function stringifyShortResolvedType(type: Type, stateIn: Partial<StringifyTypeOptions> = {}): string {
    return stringifyType(type, { ...stateIn, showNames: false, showFullDefinition: false });
}

/**
 * Returns all (including inherited) constructor properties of a class.
 */
export function getDeepConstructorProperties(type: TypeClass): TypeParameter[] {
    const chain = getInheritanceChain(type.classType);
    const res: TypeParameter[] = [];
    for (const classType of chain) {
        const type = resolveReceiveType(classType) as TypeClass;
        if (type.kind !== ReflectionKind.class) continue;
        const constructor = findMember('constructor', type.types);
        if (!constructor || constructor.kind !== ReflectionKind.method) continue;
        for (const param of constructor.parameters) {
            if (param.kind !== ReflectionKind.parameter) continue;
            if (param.readonly === true || param.visibility !== undefined) {
                res.push(param);
            }
        }
    }
    return res;
}

/**
 * Returns the index to `type.values` if the given value is part of the enum, exactly or case-insensitive.
 * Returns -1 if not found.
 */
export function getEnumValueIndexMatcher(type: TypeEnum): (value: string | number | undefined | null) => number {
    const lowerCaseValues = Object.keys(type.enum).map(v => String(v).toLowerCase());
    return (value): number => {
        const exactMatch = type.values.indexOf(value);
        if (exactMatch !== -1) return exactMatch;
        const lowerCaseMatch = lowerCaseValues.indexOf(String(value).toLowerCase());
        if (lowerCaseMatch !== -1) return lowerCaseMatch;

        return -1;
    };
}

interface StringifyTypeOptions {
    //show type alias names
    showNames: boolean;
    showFullDefinition: boolean;
    showDescription: boolean;
    defaultIsOptional: boolean;
    showHeritage: boolean;
    showDefaults: boolean;
    defaultValues: any;
    stringify?: (type: Type) => string | undefined;
}

let stringifyTypeId: number = 1;

export function stringifyType(type: Type, stateIn: Partial<StringifyTypeOptions> = {}): string {
    const state: StringifyTypeOptions = {
        showNames: true,
        defaultIsOptional: false,
        showDefaults: false,
        defaultValues: undefined,
        showDescription: false,
        showHeritage: false,
        showFullDefinition: false,
        ...stateIn,
    };
    const stack: { type?: Type, defaultValue?: any, before?: string, after?: string, depth?: number }[] = [];
    stack.push({ type, defaultValue: state.defaultValues, depth: 1 });
    const stackId: number = stringifyTypeId++;
    const result: string[] = [];

    while (stack.length) {
        const entry = stack.pop();
        if (!entry) break;
        const type = entry.type;

        const depth = entry.depth || 1;
        if (type && stateIn.stringify) {
            const manual = stateIn.stringify(type);
            if ('string' === typeof manual) {
                if (manual !== '') {
                    if (entry.before) {
                        result.push(entry.before);
                    }
                    result.push(manual);
                    if (entry.after) {
                        result.push(entry.after);
                    }
                }
                continue;
            }
        }

        if (entry.before) {
            result.push(entry.before);
        }

        if (type) {
            const jit = getTypeJitContainer(type);
            if (entry.depth !== undefined && jit.visitStack && jit.visitStack.id === stackId && jit.visitStack.depth < entry.depth) {
                result.push((type.typeName ? type.typeName : '* Recursion *'));
                continue;
            }

            // objectLiteral and class types usually get their own reference, but their types are shared.
            // thus we have to check for their member types identity to check for recursions.
            if (type.kind === ReflectionKind.objectLiteral || type.kind === ReflectionKind.class) {
                const first = type.types[0];
                const jit = first ? getTypeJitContainer(first) : undefined;
                if (jit && entry.depth !== undefined && jit.visitStack && jit.visitStack.id === stackId && jit.visitStack.depth < entry.depth + 1) {
                    result.push((type.typeName ? type.typeName : '* Recursion *'));
                    continue;
                }
            }

            jit.visitStack = { id: stackId, depth };

            const manual = stateIn.stringify ? stateIn.stringify(type) : undefined;
            if ('string' === typeof manual) {
                result.push(jit.stringifyTypeResult = manual);
                continue;
            }

            if (state.showNames && type.typeName && !state.showFullDefinition) {
                if (type.typeArguments && type.typeArguments.length) {
                    stack.push({ before: '>' });
                    for (let i = type.typeArguments.length - 1; i >= 0; i--) {
                        stack.push({ type: type.typeArguments[i], before: i === 0 ? undefined : ', ', depth });
                    }
                    stack.push({ before: '<' });
                }
                result.push(type.typeName);
                continue;
            }

            if (type.annotations) {
                for (const symbol of Object.getOwnPropertySymbols(type.annotations)) {
                    const annotationString = stringifyAnnotationAsType(symbol, type);
                    if ('string' === typeof annotationString && annotationString) {
                        stack.push({ before: annotationString });
                        stack.push({ before: ' & ' });
                    } else if (isArray(annotationString)) {
                        for (let i = annotationString.length - 1; i >= 0; i--) {
                            const [name, args] = annotationString[i];
                            if (args && args.length) {
                                stack.push({ after: '>' });
                                for (let j = args.length - 1; j >= 0; j--) {
                                    stack.push({ type: args[j] });
                                    if (j !== 0) {
                                        stack.push({ after: ', ' });
                                    }
                                }
                                stack.push({ after: '<' });
                            }
                            stack.push({ after: ' & ' + capitalize(name) });
                        }
                    }
                }
            }

            switch (type.kind) {
                case ReflectionKind.never:
                    result.push(`never`);
                    break;
                case ReflectionKind.any:
                    result.push(`any`);
                    break;
                case ReflectionKind.unknown:
                    result.push(`unknown`);
                    break;
                case ReflectionKind.void:
                    result.push(`void`);
                    break;
                case ReflectionKind.undefined:
                    result.push(`undefined`);
                    break;
                case ReflectionKind.null:
                    result.push(`null`);
                    break;
                case ReflectionKind.object:
                    result.push(`object`);
                    break;
                case ReflectionKind.string:
                    result.push('string');
                    break;
                case ReflectionKind.infer:
                    result.push('infer');
                    break;
                case ReflectionKind.number:
                    result.push('number');
                    break;
                case ReflectionKind.bigint:
                    result.push('bigint');
                    break;
                case ReflectionKind.regexp:
                    result.push('RegExp');
                    break;
                case ReflectionKind.boolean:
                    result.push('boolean');
                    break;
                case ReflectionKind.symbol:
                    result.push('symbol');
                    break;
                case ReflectionKind.literal:
                    if ('number' === typeof type.literal) {
                        result.push(type.literal + '');
                    } else if ('boolean' === typeof type.literal) {
                        result.push(type.literal + '');
                    } else {
                        result.push(`'${String(type.literal).replace(/'/g, '\\\'')}'`);
                    }
                    break;
                case ReflectionKind.promise:
                    result.push('Promise<');
                    stack.push({ before: '>' });
                    stack.push({ type: type.type, depth: depth + 1 });
                    break;
                case ReflectionKind.templateLiteral:
                    stack.push({ before: '`' });
                    for (let i = type.types.length - 1; i >= 0; i--) {
                        const sub = type.types[i];
                        if (sub.kind === ReflectionKind.literal) {
                            stack.push({ before: String(sub.literal) });
                        } else {
                            stack.push({ type: sub, before: '${', after: '}', depth: depth + 1 });
                        }
                    }
                    stack.push({ before: '`' });
                    break;
                case ReflectionKind.class: {
                    if (type.classType === Date) {
                        result.push(`Date`);
                        break;
                    }
                    if (type.classType === Set) {
                        result.push('Set<');
                        stack.push({ before: '>' });
                        stack.push({ type: type.arguments![0], depth: depth + 1 });
                        break;
                    }
                    if (type.classType === Map) {
                        result.push('Map<');
                        stack.push({ before: '>' });
                        stack.push({ type: type.arguments![1], depth: depth + 1 });
                        stack.push({ before: ', ' });
                        stack.push({ type: type.arguments![0], depth: depth + 1 });
                        break;
                    }
                    if (binaryTypes.includes(type.classType)) {
                        result.push(getClassName(type.classType));
                        break;
                    }

                    const typeName = type.typeName || getClassName(type.classType);
                    const superClass = getParentClass(type.classType);

                    if (state.showFullDefinition) {
                        const types = state.showHeritage ? type.types : resolveTypeMembers(type);
                        stack.push({ before: '}' });
                        for (let i = types.length - 1; i >= 0; i--) {
                            const sub = types[i];
                            const showDescription = stateIn.showDescription && sub.kind === ReflectionKind.property && sub.description;
                            const withIndentation = types.length > 1 || showDescription;

                            if (withIndentation && i === types.length - 1) {
                                stack.push({ before: '\n' + (' '.repeat((depth - 1) * 2)) });
                            }
                            if (state.stringify) {
                                const manual = state.stringify(sub);
                                if ('string' === typeof manual) {
                                    if (manual !== '') {
                                        stack.push({ before: manual });
                                    }
                                    continue;
                                }
                            }
                            if (showDescription || (types.length > 1 && (withIndentation || i !== types.length - 1))) {
                                stack.push({ before: withIndentation ? ';' : '; ' });
                            }
                            const defaultValue = entry.defaultValue && (sub.kind === ReflectionKind.property) ? entry.defaultValue[sub.name] : undefined;
                            const showDefault = sub.kind === ReflectionKind.property && sub.type.kind !== ReflectionKind.class && sub.type.kind !== ReflectionKind.objectLiteral;
                            if (state.showDefaults && showDefault) {
                                if (defaultValue !== undefined) {
                                    stack.push({ before: ' = ' + JSON.stringify(defaultValue) });
                                } else if (sub.kind === ReflectionKind.property && sub.default) {
                                    try {
                                        stack.push({ before: ' = ' + JSON.stringify(sub.default()) });
                                    } catch {
                                    }
                                }
                            }
                            stack.push({ type: sub, defaultValue, depth: depth + 1 });
                            if (withIndentation) {
                                stack.push({ before: '\n' + (' '.repeat(depth * 2)) });
                            }
                            if (showDescription) {
                                const indentation = indent(depth * 2, ' * ');
                                stack.push({ before: '\n' + indentation('/* ' + sub.description + ' */') });
                            }
                        }

                        stack.push({ before: ' {' });
                    }

                    if (superClass && state.showHeritage) {
                        try {
                            const superClassType = reflect(superClass);
                            if (superClassType.kind === ReflectionKind.class) {

                                if (type.extendsArguments && type.extendsArguments.length) {
                                    stack.push({ before: '>' });
                                    for (let i = type.extendsArguments.length - 1; i >= 0; i--) {
                                        stack.push({
                                            type: type.extendsArguments[i],
                                            before: i === 0 ? undefined : ', ',
                                            depth: depth + 1,
                                        });
                                    }
                                    stack.push({ before: '<' });
                                }

                                stack.push({ before: ' extends ' + (superClassType.typeName || superClass.name) });
                            }
                        } catch {
                            stack.push({ before: ' extends ' + (superClass.name) });
                        }
                    }

                    const typeArguments = type.arguments || type.typeArguments;
                    if ((!state.showFullDefinition || type.types.length === 0) && typeArguments && typeArguments.length) {
                        stack.push({ before: '>' });
                        for (let i = typeArguments.length - 1; i >= 0; i--) {
                            stack.push({
                                type: typeArguments[i],
                                before: i === 0 ? undefined : ', ',
                                depth: depth + 1,
                            });
                        }
                        stack.push({ before: '<' });
                    }

                    stack.push({ before: typeName });
                    break;
                }
                case ReflectionKind.objectLiteral: {
                    const typeName = type.typeName || '';
                    result.push(typeName);

                    if (!typeName || state.showFullDefinition) {
                        result.push(typeName ? ' {' : '{');

                        stack.push({ before: '}' });
                        for (let i = type.types.length - 1; i >= 0; i--) {
                            const sub = type.types[i];
                            const showDescription = stateIn.showDescription && sub.kind === ReflectionKind.propertySignature && sub.description;
                            const withIndentation = type.types.length > 1 || showDescription;

                            if (state.stringify) {
                                const manual = state.stringify(sub);
                                if ('string' === typeof manual) {
                                    if (manual !== '') {
                                        stack.push({ before: manual });
                                    }
                                    continue;
                                }
                            }

                            if (withIndentation && i === type.types.length - 1) {
                                stack.push({ before: '\n' + (' '.repeat((depth - 1) * 2)) });
                            }
                            if (state.stringify) {
                                const manual = state.stringify(sub);
                                if ('string' === typeof manual) {
                                    if (manual !== '') {
                                        stack.push({ before: manual });
                                    }
                                    continue;
                                }
                            }
                            if (showDescription || (type.types.length > 1 && (withIndentation || i !== type.types.length - 1))) {
                                stack.push({ before: withIndentation ? ';' : '; ' });
                            }

                            const defaultValue = entry.defaultValue && (sub.kind === ReflectionKind.propertySignature) ? entry.defaultValue[sub.name] : undefined;
                            const showDefault = sub.kind === ReflectionKind.propertySignature && sub.type.kind !== ReflectionKind.class && sub.type.kind !== ReflectionKind.objectLiteral;
                            if (state.showDefaults && showDefault) {
                                if (defaultValue !== undefined) {
                                    stack.push({ before: ' = ' + JSON.stringify(defaultValue) });
                                }
                            }
                            stack.push({ type: sub, defaultValue, depth: depth + 1 });

                            if (withIndentation) {
                                stack.push({ before: '\n' + (' '.repeat(depth * 2)) });
                            }
                            if (showDescription) {
                                const indentation = indent(depth * 2, ' * ');
                                stack.push({ before: '\n' + indentation('/* ' + sub.description + ' */') });
                            }
                        }
                    }
                    break;
                }
                case ReflectionKind.union:
                    for (let i = type.types.length - 1; i >= 0; i--) {
                        stack.push({ type: type.types[i], before: i === 0 ? undefined : ' | ', depth: depth + 1 });
                    }
                    break;
                case ReflectionKind.intersection:
                    for (let i = type.types.length - 1; i >= 0; i--) {
                        stack.push({ type: type.types[i], before: i === 0 ? undefined : ' & ', depth: depth + 1 });
                    }
                    break;
                case ReflectionKind.parameter: {
                    const visibility = type.visibility ? ReflectionVisibility[type.visibility] + ' ' : '';
                    const dotdotdot = type.type.kind === ReflectionKind.rest ? '...' : '';
                    result.push(`${type.readonly ? 'readonly ' : ''}${visibility}${dotdotdot}${type.name}${type.optional ? '?' : ''}: `);
                    stack.push({ type: type.type, depth: depth + 1 });
                    break;
                }
                case ReflectionKind.callSignature:
                case ReflectionKind.function:
                    stack.push({ type: type.return, depth: depth + 1 });
                    stack.push({ before: ') => ' });
                    for (let i = type.parameters.length - 1; i >= 0; i--) {
                        stack.push({ type: type.parameters[i], before: i === 0 ? undefined : ', ', depth: depth + 1 });
                    }
                    stack.push({ before: '(' });
                    break;
                case ReflectionKind.enum:
                    const members = Object.entries(type.enum).map(([label, value]) => `${label}: ${value}`).join(', ');
                    stack.push({ before: `${type.typeName ? type.typeName : 'Enum'} {` + (members) + '}' });
                    break;
                case ReflectionKind.array:
                    stack.push({ before: '>' });
                    stack.push({ type: type.type, before: 'Array<', depth: depth + 1 });
                    break;
                case ReflectionKind.typeParameter:
                    stack.push({ before: type.name });
                    break;
                case ReflectionKind.rest:
                    stack.push({ before: '[]' });
                    stack.push({ type: type.type, depth: depth + 1 });
                    if (type.parent && type.parent.kind === ReflectionKind.tupleMember && !type.parent.name) {
                        stack.push({ before: '...' });
                    }
                    break;
                case ReflectionKind.tupleMember:
                    if (type.name) {
                        const dotdotdot = type.type.kind === ReflectionKind.rest ? '...' : '';
                        result.push(`${dotdotdot}${type.name}${type.optional ? '?' : ''}: `);
                        stack.push({ type: type.type, depth: depth + 1 });
                        break;
                    }
                    if (type.optional) {
                        stack.push({ before: '?' });
                    }
                    stack.push({ type: type.type, depth: depth + 1 });
                    break;
                case ReflectionKind.tuple:
                    stack.push({ before: ']' });
                    for (let i = type.types.length - 1; i >= 0; i--) {
                        stack.push({ type: type.types[i], before: i === 0 ? undefined : ', ', depth: depth + 1 });
                    }
                    stack.push({ before: '[' });
                    break;
                case ReflectionKind.indexSignature:
                    stack.push({ type: type.type, depth: depth + 1 });
                    stack.push({ before: ']: ' });
                    stack.push({ type: type.index, depth: depth + 1 });
                    stack.push({ before: '[index: ' });
                    // name = `{[index: ${stringifyType(type.index, state)}]: ${stringifyType(type.type, state)}`;
                    break;
                case ReflectionKind.propertySignature:
                    result.push(`${type.readonly ? 'readonly ' : ''}${memberNameToString(type.name)}${type.optional ? '?' : ''}: `);
                    stack.push({ type: type.type, defaultValue: entry.defaultValue, depth });
                    break;
                case ReflectionKind.property: {
                    const visibility = type.visibility ? ReflectionVisibility[type.visibility] + ' ' : '';
                    const optional = type.optional || (stateIn.defaultIsOptional && type.default !== undefined);
                    result.push(`${type.static ? 'static ' : ''}${type.readonly ? 'readonly ' : ''}${visibility}${memberNameToString(type.name)}${optional ? '?' : ''}: `);
                    stack.push({ type: type.type, defaultValue: entry.defaultValue, depth });
                    break;
                }
                case ReflectionKind.methodSignature:
                    stack.push({ type: type.return, depth });
                    stack.push({ before: '): ' });
                    for (let i = type.parameters.length - 1; i >= 0; i--) {
                        stack.push({ type: type.parameters[i], before: i === 0 ? undefined : ', ', depth });
                    }
                    stack.push({ before: `${memberNameToString(type.name)}${type.optional ? '?' : ''}(` });
                    break;
                case ReflectionKind.method: {
                    const visibility = type.visibility ? ReflectionVisibility[type.visibility] + ' ' : '';
                    const abstract = type.abstract ? 'abstract ' : '';
                    const staticPrefix = type.static ? 'static ' : '';
                    if (type.name === 'constructor') {
                        stack.push({ before: ')' });
                    } else {
                        stack.push({ type: type.return, depth });
                        stack.push({ before: '): ' });
                    }
                    for (let i = type.parameters.length - 1; i >= 0; i--) {
                        stack.push({ type: type.parameters[i], before: i === 0 ? undefined : ', ', depth });
                    }
                    stack.push({ before: `${staticPrefix}${abstract}${visibility}${memberNameToString(type.name)}${type.optional ? '?' : ''}(` });
                    break;
                }
            }
        }

        if (entry.after) {
            result.push(entry.after);
        }
    }

    return result.join('');
}

export function annotateClass<T>(clazz: ClassType | AbstractClassType, type?: ReceiveType<T>) {
    (clazz as any).__type = isClass(type) ? (type as any).__type || [] : [];
    type = resolveRuntimeType(type);
    (clazz as any).__type.__type = type;
}
