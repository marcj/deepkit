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
    addType,
    emptyObject,
    flatten,
    getTypeJitContainer,
    indexAccess,
    isMember,
    isOptional,
    isPrimitive,
    isType,
    isTypeIncluded,
    ReflectionKind,
    resolveTypeMembers,
    stringifyType,
    Type,
    TypeAny,
    TypeCallSignature,
    TypeFunction,
    TypeInfer,
    TypeLiteral,
    TypeMethod,
    TypeMethodSignature,
    TypeNumber,
    TypeObjectLiteral,
    TypeParameter,
    TypePromise,
    TypeRest,
    TypeString,
    TypeTemplateLiteral,
    TypeTuple,
    TypeUnion,
} from './type.js';
import { isPrototypeOfBase } from '@deepkit/core';
import { typeInfer } from './processor.js';

type AssignableType = Type | string | boolean | number | symbol | bigint | undefined | null;

type StackEntry = {
    left: Type,
    right: Type,
}

function hasStack(extendStack: StackEntry[], left: Type, right: Type): boolean {
    for (const entry of extendStack) {
        if (entry.left === left && entry.right === right) return true;
    }
    return false;
}

/**
 * The check of `extends` in Typescript. This function can be read as `left extends right`.
 *
 * See https://www.typescriptlang.org/docs/handbook/type-compatibility.html#any-unknown-object-void-undefined-null-and-never-assignability
 * This algo follows strict mode.
 *
 * Warning: If you do not pass Type objects, typeInfer() is used which does not use cache (it is designed to be called withing type processor)
 */
export function isExtendable(leftValue: AssignableType, rightValue: AssignableType, extendStack: StackEntry[] = []): boolean {
    const start = Date.now();
    const right: Type = isType(rightValue) ? rightValue : typeInfer(rightValue);
    const left: Type = isType(leftValue) ? leftValue : typeInfer(leftValue);

    const valid = _isExtendable(left, right, extendStack);
    const took = Date.now() - start;

    if (took > 100) {
        console.warn('isExtendable took very long', Date.now() - start, 'ms comparing', stringifyType(left), 'and', stringifyType(right));
    }

    return valid;
}

function isFunctionLike(type: Type) {
    return type.kind === ReflectionKind.function || type.kind === ReflectionKind.method || type.kind === ReflectionKind.callSignature
        || type.kind === ReflectionKind.methodSignature || type.kind === ReflectionKind.objectLiteral
        || ((type.kind === ReflectionKind.property || type.kind === ReflectionKind.propertySignature) && type.type.kind === ReflectionKind.function);
}

function getFunctionLikeType(type: Type): TypeMethod | TypeMethodSignature | TypeFunction | TypeCallSignature | undefined {
    if (type.kind === ReflectionKind.function || type.kind === ReflectionKind.method || type.kind === ReflectionKind.methodSignature) return type;
    if (type.kind === ReflectionKind.objectLiteral) {
        for (const member of resolveTypeMembers(type)) {
            if (member.kind === ReflectionKind.callSignature) return member;
        }
    }
    if (type.kind === ReflectionKind.property || type.kind === ReflectionKind.propertySignature) {
        return type.type.kind === ReflectionKind.function ? getFunctionLikeType(type.type) : undefined;
    }
    return;
}

export function _isExtendable(left: Type, right: Type, extendStack: StackEntry[] = []): boolean {
    if (hasStack(extendStack, left, right)) return true;

    try {
        extendStack.push({ left, right });

        if (right === left) return true;

        if (left.kind === ReflectionKind.infer) {
            left.set(right as Type);
            return true;
        }

        if (right.kind === ReflectionKind.infer) {
            right.set(left as Type);
            return true;
        }

        if (right.kind === ReflectionKind.any || right.kind === ReflectionKind.unknown) return true;
        if (left.kind === ReflectionKind.promise && right.kind === ReflectionKind.promise) return _isExtendable(left.type, right.type);

        if (left.kind === ReflectionKind.promise && right.kind === ReflectionKind.object) return true;

        if (left.kind === ReflectionKind.promise) {
            return _isExtendable(createPromiseObjectLiteral(left), right);
        }
        if (right.kind === ReflectionKind.promise) {
            return _isExtendable(left, createPromiseObjectLiteral(right));
        }

        if (right.kind !== ReflectionKind.union) {
            if (left.kind === ReflectionKind.null) {
                return right.kind === ReflectionKind.null;
            }

            if (left.kind === ReflectionKind.undefined) {
                return right.kind === ReflectionKind.void || right.kind === ReflectionKind.undefined;
            }

            if (left.kind === ReflectionKind.void) {
                return right.kind === ReflectionKind.void;
            }

            if (left.kind === ReflectionKind.any) {
                return right.kind !== ReflectionKind.never;
            }

            if (left.kind === ReflectionKind.object) {
                return right.kind === ReflectionKind.object
                    || (right.kind === ReflectionKind.objectLiteral && right.types.length === 0)
                    || (right.kind === ReflectionKind.class && right.types.length === 0);
            }

            if (left.kind === ReflectionKind.objectLiteral && left.types.length === 0) {
                return right.kind === ReflectionKind.object
                    || (right.kind === ReflectionKind.objectLiteral && right.types.length === 0)
                    || (right.kind === ReflectionKind.class && right.types.length === 0);
            }
        }

        if (left.kind === ReflectionKind.never) return true;
        if (right.kind === ReflectionKind.never) return false;

        if (left.kind === ReflectionKind.literal && right.kind === ReflectionKind.literal) return left.literal === right.literal;
        if (left.kind === ReflectionKind.string && right.kind === ReflectionKind.string) return true;
        if (left.kind === ReflectionKind.number && right.kind === ReflectionKind.number) return true;
        if (left.kind === ReflectionKind.boolean && right.kind === ReflectionKind.boolean) return true;
        if (left.kind === ReflectionKind.bigint && right.kind === ReflectionKind.bigint) return true;
        if (left.kind === ReflectionKind.symbol && right.kind === ReflectionKind.symbol) return true;
        if (left.kind === ReflectionKind.regexp && right.kind === ReflectionKind.regexp) return true;

        if (right.kind === ReflectionKind.objectLiteral) {
            if (left.kind === ReflectionKind.null || left.kind === ReflectionKind.undefined) return false;
            if (right.types.length === 0) {
                //string extends {}, number extends {} are all valid
                return left.kind === ReflectionKind.templateLiteral || left.kind === ReflectionKind.function || isPrimitive(left);
            }
        }

        if (left.kind === ReflectionKind.enum) {
            if (right.kind === ReflectionKind.enum) {
                if (left.values.length !== right.values.length) return false;
                for (let i = 0; i < right.values.length; i++) {
                    if (left.values[i] !== right.values[i]) return false;
                }
                return true;
            }

            return false;
        }

        if (left.kind === ReflectionKind.literal) {
            if ('string' === typeof left.literal && right.kind === ReflectionKind.string) return true;
            if ('number' === typeof left.literal && right.kind === ReflectionKind.number) return true;
            if ('boolean' === typeof left.literal && right.kind === ReflectionKind.boolean) return true;
            if ('bigint' === typeof left.literal && right.kind === ReflectionKind.bigint) return true;
            if ('symbol' === typeof left.literal && right.kind === ReflectionKind.symbol) return true;

            if ('string' === typeof left.literal && right.kind === ReflectionKind.templateLiteral) {
                return extendTemplateLiteral(left, right);
            }
            if (right.kind === ReflectionKind.union) return right.types.some(v => _isExtendable(left, v, extendStack));
            return false;
        }

        if (left.kind === ReflectionKind.templateLiteral) {
            if (emptyObject(right)) return true;
            if (right.kind === ReflectionKind.string) return true;

            if (right.kind === ReflectionKind.literal) {
                if (right.literal === '') return false;

                return extendTemplateLiteral(left, { kind: ReflectionKind.templateLiteral, types: [right] });
            }
            if (right.kind === ReflectionKind.templateLiteral) {
                return extendTemplateLiteral(left, right);
            }
        }

        if (isFunctionLike(left) && isFunctionLike(right)) {
            const leftType = getFunctionLikeType(left);
            const rightType = getFunctionLikeType(right);
            if (leftType && rightType) {
                if (rightType.kind === ReflectionKind.function && rightType.function === Function) return true;
                if (leftType.kind === ReflectionKind.function && rightType.kind === ReflectionKind.function && leftType.function && leftType.function === rightType.function) return true;

                const returnValid = _isExtendable(leftType.return, rightType.return, extendStack);
                if (!returnValid) return false;

                return isFunctionParameterExtendable(leftType, rightType, extendStack);
            }
        }

        if ((left.kind === ReflectionKind.propertySignature || left.kind === ReflectionKind.property) && (right.kind === ReflectionKind.propertySignature || right.kind === ReflectionKind.property)) {
            return _isExtendable(left.type, right.type, extendStack);
        }

        if ((left.kind === ReflectionKind.class || left.kind === ReflectionKind.objectLiteral) && right.kind === ReflectionKind.function && right.name === 'new') {
            const leftConstructor = (left.types as Type[]).find(v => (v.kind === ReflectionKind.method && v.name === 'constructor') || (v.kind === ReflectionKind.methodSignature && v.name === 'new'));
            const valid = _isExtendable(right, leftConstructor || { kind: ReflectionKind.function, parameters: [], return: { kind: ReflectionKind.any } }, extendStack);
            return valid;
        }

        if ((left.kind === ReflectionKind.class || left.kind === ReflectionKind.objectLiteral) && (right.kind === ReflectionKind.object || (right.kind === ReflectionKind.objectLiteral && right.types.length === 0))) {
            return true;
        }

        if ((left.kind === ReflectionKind.class || left.kind === ReflectionKind.objectLiteral) && (right.kind === ReflectionKind.class && right.classType === Date)) {
            if (left.kind === ReflectionKind.objectLiteral && left.types.length === 0) return true;
            if (left.kind === ReflectionKind.class && left.classType === Date) return true;
            return false;
        }

        if ((left.kind === ReflectionKind.class || left.kind === ReflectionKind.objectLiteral) && (right.kind === ReflectionKind.objectLiteral || right.kind === ReflectionKind.class)) {
            const rightConstructor = (right.types as Type[]).find(v => (v.kind === ReflectionKind.methodSignature && v.name === 'new')) as TypeMethodSignature | undefined;

            if (left.kind === ReflectionKind.class && rightConstructor) {
                //if rightConstructor is set then its maybe something like:
                // `class {} extends {new (...args: []) => infer T} ? T : never`
                //check if parameters are compatible
                const leftConstructor = left.types.find(v => (v.kind === ReflectionKind.method && v.name === 'constructor')) as TypeMethod | undefined;
                if (leftConstructor) {
                    if (!isFunctionParameterExtendable(leftConstructor, rightConstructor, extendStack)) {
                        return false;
                    }
                }

                return _isExtendable(left, rightConstructor.return, extendStack);
            }

            for (const member of right.types) {
                //todo: call signature
                //todo: index signatures

                if (isMember(member)) {
                    if (member.name === 'constructor') continue;
                    const leftMember = (left.types as Type[]).find(v => isMember(v) && v.name === member.name);
                    if (!leftMember) return false;
                    if (!_isExtendable(leftMember, member, extendStack)) {
                        return false;
                    }
                }
            }

            if (left.kind === ReflectionKind.class && right.kind === ReflectionKind.class && left.types.length === 0 && right.types.length === 0) {
                //class User extends Base {}
                //User extends Base = true
                if (left.classType === right.classType) return true;
                return isPrototypeOfBase(left.classType, right.classType);
            }

            return true;
        }


        if (left.kind === ReflectionKind.array && right.kind === ReflectionKind.array) {
            return _isExtendable(left.type, right.type, extendStack);
        }

        if (left.kind === ReflectionKind.tuple && right.kind === ReflectionKind.array) {
            const tupleUnion: TypeUnion = { kind: ReflectionKind.union, types: [] };
            for (const member of left.types) {
                if (member.optional && !isTypeIncluded(tupleUnion.types, { kind: ReflectionKind.undefined })) tupleUnion.types.push({ kind: ReflectionKind.undefined });
                const type = member.type.kind === ReflectionKind.rest ? member.type.type : member.type;
                if (!isTypeIncluded(tupleUnion.types, type)) tupleUnion.types.push(type);
            }
            //every element has to extend the array's element type
            return _isExtendable(tupleUnion, right.type, extendStack);
        }

        if (left.kind === ReflectionKind.array && right.kind === ReflectionKind.tuple) {
            const hasRest = right.types.some(v => v.type.kind === ReflectionKind.rest);
            if (!hasRest && (left.type.kind !== ReflectionKind.union || !isOptional(left.type))) return false;
            for (const member of right.types) {
                let type = member.type.kind === ReflectionKind.rest ? member.type.type : member.type;
                if (member.optional) type = flatten({ kind: ReflectionKind.union, types: [{ kind: ReflectionKind.undefined }, type] });
                if (!_isExtendable(left.type, type, extendStack)) return false;
            }
            return true;
        }

        if (left.kind === ReflectionKind.tuple && right.kind === ReflectionKind.tuple) {
            const rightRest = right.types.findIndex(v => v.type.kind === ReflectionKind.rest);
            if (rightRest !== -1 && rightRest < right.types.length - 1 && !left.types.some(v => v.type.kind === ReflectionKind.rest)) {
                return isTupleWithLeadingRestExtendable(left, right, rightRest, extendStack);
            }

            for (let i = 0; i < right.types.length; i++) {
                const rightType = indexAccess(right, { kind: ReflectionKind.literal, literal: i });
                const leftType = indexAccess(left, { kind: ReflectionKind.literal, literal: i });
                if (rightType.kind === ReflectionKind.infer || leftType.kind === ReflectionKind.infer) continue;
                const valid = _isExtendable(leftType, rightType, extendStack);
                if (!valid) return false;
            }
            inferFromTuple(left, right);

            return true;
        }

        if (left && left.kind === ReflectionKind.union) return left.types.every(v => _isExtendable(v, right, extendStack));

        if (right.kind === ReflectionKind.union) return right.types.some(v => _isExtendable(left, v, extendStack));

        return false;
    } finally {
        // extendStack.pop();
    }
}

/**
 * We don't want to embed in each and every file the type definition of Promise<t>,
 * so we do it ondemand at runtime instead. This saves bundle size.
 */
export function createPromiseObjectLiteral(type: TypePromise): TypeObjectLiteral {
    const jit = getTypeJitContainer(type);
    if (jit.__promiseObjectLiteral) return jit.__promiseObjectLiteral;

    const promise: TypeObjectLiteral = {} as any;
    jit.__promiseObjectLiteral = promise;
    Object.assign(promise, {
        kind: ReflectionKind.objectLiteral,
        types: [
            {
                kind: ReflectionKind.methodSignature, parent: promise, name: 'then',
                parameters: [
                    {
                        kind: ReflectionKind.parameter, parent: {} as any, name: 'onfulfilled',
                        optional: true,
                        type: {
                            kind: ReflectionKind.union, types: [{
                                kind: ReflectionKind.function, parameters: [
                                    { kind: ReflectionKind.parameter, name: 'value', type: type.type },
                                ], return: { kind: ReflectionKind.union, types: [type.type, promise] }
                            }, { kind: ReflectionKind.null }, { kind: ReflectionKind.undefined }]
                        }
                    },
                    {
                        kind: ReflectionKind.parameter, parent: {} as any, name: 'onrejected',
                        optional: true,
                        type: {
                            kind: ReflectionKind.function, parameters: [
                                { kind: ReflectionKind.parameter, name: 'reason', type: { kind: ReflectionKind.any } },
                            ], return: { kind: ReflectionKind.any }
                        }
                    },
                ], return: { kind: ReflectionKind.any },
            },
            {
                kind: ReflectionKind.methodSignature, parent: promise, name: 'catch',
                parameters: [
                    {
                        kind: ReflectionKind.parameter, parent: {} as any, name: 'onrejected',
                        optional: true,
                        type: {
                            kind: ReflectionKind.function, parameters: [
                                { kind: ReflectionKind.parameter, name: 'reason', type: { kind: ReflectionKind.any } }
                            ], return: { kind: ReflectionKind.any }
                        }
                    },
                ], return: { kind: ReflectionKind.any },
            },
        ]
    });
    return promise;
}

export function parametersToTuple(parameters: TypeParameter[]): TypeTuple {
    const tuple = {
        kind: ReflectionKind.tuple,
        types: []
    } as TypeTuple;

    for (const v of parameters) {
        tuple.types.push({ kind: ReflectionKind.tupleMember, parent: tuple, name: v.name, optional: (v.optional || v.default !== undefined) ? true : undefined, type: v.type });
    }
    return tuple;
}

function isFunctionParameterExtendable(left: { parameters: TypeParameter[] }, right: { parameters: TypeParameter[] }, extendStack: StackEntry[]): boolean {
    //convert parameters to tuple and just compare that, as it's the same algorithm
    const leftTuple: TypeTuple = parametersToTuple(left.parameters);
    const rightTuple: TypeTuple = parametersToTuple(right.parameters);

    //we have to change the position here since its type assignability is inversed to tuples rules
    // true for tuple:     [a: string] extends [a: string, b: string]
    // false for function: (a: string) extends (a: string, b: string)
    const valid = _isExtendable(rightTuple, leftTuple, extendStack);
    if (valid) {
        inferFromTuple(leftTuple, rightTuple);
    }
    return valid;
}

export function extendTemplateLiteral(left: TypeLiteral | TypeTemplateLiteral, right: TypeTemplateLiteral): boolean {
    interface ReadQueueItem {
        type: TypeString | TypeNumber | TypeLiteral | TypeAny;
        position: number;
        next?: ReadQueueItem;
    }

    let matchQueue: (TypeInfer | TypeNumber | TypeString | TypeAny)[] = [];

    let current = (left.kind === ReflectionKind.literal ? { type: left as (TypeLiteral & { literal: string }), position: 0 } : {
        type: left.types[0],
        position: 0
    }) as ReadQueueItem | undefined;

    if (current && left.kind === ReflectionKind.templateLiteral) {
        for (let i = 1; i < left.types.length; i++) {
            const t = left.types[i];
            if (t.kind === ReflectionKind.infer) continue;
            current.next = { type: t, position: 0 };
        }
    }

    function search(delimiter: string): ReadQueueItem | undefined {
        let result = current;
        while (result) {
            if (result.type.kind === ReflectionKind.literal) {
                const value = result.type.literal as string;
                if (value !== '') {
                    const position = value.indexOf(delimiter, result.position);
                    if (position !== -1) {
                        return { ...result, position: position };
                    }
                }
                //go next
            }

            result = result.next;
        }

        //not found
        return;
    }

    function handleQueue(end?: ReadQueueItem): boolean {
        if (matchQueue.length === 0) return true;

        const last = matchQueue[matchQueue.length - 1];
        for (const item of matchQueue) {
            const isLast = item === last;

            if (!isLast) {
                //pick only one character
                while (current) {
                    if (current.type.kind === ReflectionKind.literal) {
                        const value = current.type.literal as string;
                        if (current.position === value.length) {
                            //end, go next
                            current = current.next;
                            continue;
                        }
                        const char = value[current.position++];
                        if (item.kind === ReflectionKind.number) {
                            if (value === '' || isNaN(+char)) return false;
                        } else if (item.kind === ReflectionKind.infer) {
                            item.set({ kind: ReflectionKind.literal, literal: char });
                        }
                    } else if (current.type.kind === ReflectionKind.string) {
                        if (item.kind === ReflectionKind.number) {
                            return false;
                        } else if (item.kind === ReflectionKind.infer) {
                            item.set(current.type);
                        }
                    } else if (current.type.kind === ReflectionKind.any) {
                        if (item.kind === ReflectionKind.infer) {
                            item.set(current.type);
                        }
                    } else if (current.type.kind === ReflectionKind.number) {
                        if (item.kind === ReflectionKind.infer) {
                            item.set(current.type);
                        }
                    }
                    break;
                }
            } else {
                if (item.kind === ReflectionKind.any || item.kind === ReflectionKind.string || item.kind === ReflectionKind.infer) {
                    const result: TypeTemplateLiteral = { kind: ReflectionKind.templateLiteral, types: [] };
                    while (current) {
                        if (current.type.kind === ReflectionKind.literal) {
                            const value = current.type.literal as string;
                            if (current.position === value.length) {
                                //end, go next
                                current = current.next;
                                continue;
                            }

                            const v = value.slice(current.position, end ? end.position : undefined);
                            result.types.push({ kind: ReflectionKind.literal, literal: v });
                        } else {
                            result.types.push(current.type);
                            //     if (item.kind === ReflectionKind.infer) {
                            //         item.set(current.type);
                            //     }
                        }
                        if (end && current.type === end.type) break;
                        current = current.next;
                    }

                    if (item.kind === ReflectionKind.infer) {
                        if (result.types.length === 1) {
                            item.set(result.types[0]);
                        } else {
                            item.set(result);
                        }
                    }
                } else if (item.kind === ReflectionKind.number) {
                    //read until no number
                    let value = '';
                    while (current) {
                        if (current.type.kind === ReflectionKind.literal) {
                            const v = (current.type.literal as string).slice(current.position, end ? end.position : undefined);
                            value += v;
                        } else if (current.type.kind === ReflectionKind.number || current.type.kind === ReflectionKind.any) {
                            //number is fine
                        } else {
                            //string is not fine as it can contain characters not compatible to number
                            return false;
                        }
                        current = current.next;
                    }
                    if (value === '' || isNaN(+value)) return false;
                }
            }
        }
        matchQueue = [];
        return true;
    }

    for (const span of right.types) {
        if (span.kind === ReflectionKind.literal) {
            const position = search(span.literal as string);
            if (!position) return false;
            if (!handleQueue(position)) return false;
            current = { ...position, position: position.position + (span.literal as string).length };
        } else if (span.kind === ReflectionKind.infer) {
            matchQueue.push(span);
        } else if (span.kind === ReflectionKind.string) {
            matchQueue.push(span);
        } else if (span.kind === ReflectionKind.number) {
            matchQueue.push(span);
        }
    }
    if (!handleQueue()) return false;

    return true;
}

/**
 * Handles a fixed-length left tuple against a right tuple with a rest element followed by more elements,
 * e.g. `[string, string, number] extends [...infer P, infer L]`. Elements after the rest are matched from the end.
 */
function isTupleWithLeadingRestExtendable(left: TypeTuple, right: TypeTuple, rightRest: number, extendStack: StackEntry[]): boolean {
    const after = right.types.length - rightRest - 1;
    const restEnd = left.types.length - after;
    if (restEnd < rightRest) return false;

    const inferred: [TypeInfer, Type][] = [];
    const matches = (leftType: Type, rightType: Type): boolean => {
        if (rightType.kind === ReflectionKind.infer) {
            inferred.push([rightType, leftType]);
            return true;
        }
        return _isExtendable(leftType, rightType, extendStack);
    };

    for (let i = 0; i < rightRest; i++) {
        if (!matches(left.types[i].type, right.types[i].type)) return false;
    }
    for (let i = 0; i < after; i++) {
        if (!matches(left.types[restEnd + i].type, right.types[rightRest + 1 + i].type)) return false;
    }

    const rest = right.types[rightRest].type as TypeRest;
    if (rest.type.kind === ReflectionKind.infer) {
        const restTuple: TypeTuple = { kind: ReflectionKind.tuple, types: [] };
        for (let j = rightRest; j < restEnd; j++) addType(restTuple, left.types[j]);
        inferred.push([rest.type, restTuple]);
    } else {
        for (let j = rightRest; j < restEnd; j++) {
            if (!_isExtendable(left.types[j].type, rest.type, extendStack)) return false;
        }
    }

    for (const [infer, type] of inferred) infer.set(type);
    return true;
}

function inferFromTuple(left: TypeTuple, right: TypeTuple) {
    //when all types match, we find `infer`
    for (let i = 0; i < right.types.length; i++) {
        const rightType = right.types[i];
        if (rightType.type.kind === ReflectionKind.infer || (rightType.type.kind === ReflectionKind.rest && rightType.type.type.kind === ReflectionKind.infer)) {
            const inferred: TypeTuple = { kind: ReflectionKind.tuple, types: [] };
            let restAdded = false;
            for (let j = 0; j < left.types.length; j++) {
                const leftType = left.types[j];
                if (leftType.type.kind === ReflectionKind.rest) {
                    addType(inferred, leftType);
                    restAdded = true; //when a rest element is added, all subsequent types will be added as well
                } else if (restAdded || j >= i) {
                    addType(inferred, leftType);
                }
            }

            //[foo: string, ...args: infer P] P keeps being tuple
            //[foo: string, args: infer P] P no tuple
            //[args: infer P] P no tuple
            let inferredType: Type = inferred.types.length === 0 ? { kind: ReflectionKind.never } : inferred;

            //simplify [...r: number[]] to number[]
            if (inferred.types.length === 1 && inferred.types[0].type.kind === ReflectionKind.rest) {
                inferredType = { kind: ReflectionKind.array, type: inferred.types[0].type.type };
            }

            //when `[1, 2] extends [infer K]` result is `1`, not a tuple
            if (rightType.type.kind !== ReflectionKind.rest) {
                inferredType = inferred.types[0].type;
            }

            if (rightType.type.kind === ReflectionKind.infer) {
                rightType.type.set(inferredType);
            } else if (rightType.type.kind === ReflectionKind.rest && rightType.type.type.kind === ReflectionKind.infer) {
                rightType.type.type.set(inferredType);
            }
        }
    }
}
