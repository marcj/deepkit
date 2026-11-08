import {
    getTypeJitContainer,
    ParentLessType,
    ReflectionKind,
    stringifyResolvedType,
    Type,
} from '../src/reflection/type.js';
import { Processor, RuntimeStackEntry } from '../src/reflection/processor.js';
import { ReceiveType, removeTypeName, resolveReceiveType } from '../src/reflection/reflection.js';
import { expect } from '@jest/globals';
import { ReflectionOp } from '@deepkit/type-spec';
import { isArray, isObject } from '@deepkit/core';

export function assertValidParent(a: Type): void {
    visitWithParent(a, (type, path, parent) => {
        if (type.parent && type.parent !== parent) {
            if (!parent) throw new Error('Parent was set, but not expected at ' + path);
            throw new Error(`Invalid parent set at ${path}. Got ${ReflectionKind[type.parent.kind]} but expected ${parent ? ReflectionKind[parent.kind] : 'undefined'}`);
        }
    });
}

function reflectionName(kind: ReflectionKind): string {
    return ReflectionKind[kind];
}

let visitStackId: number = 0;

export function visitWithParent(type: Type, visitor: (type: Type, path: string, parent?: Type) => false | void, onCircular?: () => void, stack: number = visitStackId++, path: string = '', parent?: Type): void {
    const jit = getTypeJitContainer(type);
    if (jit.visitId === visitStackId) {
        if (onCircular) onCircular();
        return;
    }
    jit.visitId = visitStackId;

    if (!path) path = '[' + reflectionName(type.kind) + ']';

    if (visitor(type, path, parent) === false) return;

    switch (type.kind) {
        case ReflectionKind.objectLiteral:
        case ReflectionKind.tuple:
        case ReflectionKind.union:
        case ReflectionKind.class:
        case ReflectionKind.intersection:
        case ReflectionKind.templateLiteral:
            for (const member of type.types) visitWithParent(member, visitor, onCircular, stack, (path && path + '.') + 'types[' + reflectionName(member.kind) + ']', type);
            break;
        case ReflectionKind.string:
        case ReflectionKind.number:
        case ReflectionKind.bigint:
        case ReflectionKind.symbol:
        case ReflectionKind.regexp:
        case ReflectionKind.boolean:
            if (type.origin) visitWithParent(type.origin, visitor, onCircular, stack, (path && path + '.') + 'origin[' + reflectionName(type.origin.kind) + ']', type);
            break;
        case ReflectionKind.function:
        case ReflectionKind.method:
        case ReflectionKind.methodSignature:
            visitWithParent(type.return, visitor, onCircular, stack, (path && path + '.') + 'return[' + reflectionName(type.return.kind) + ']', type);
            for (const member of type.parameters) visitWithParent(member, visitor, onCircular, stack, (path && path + '.') + 'parameters[' + reflectionName(member.kind) + ']', type);
            break;
        case ReflectionKind.propertySignature:
        case ReflectionKind.property:
        case ReflectionKind.array:
        case ReflectionKind.promise:
        case ReflectionKind.parameter:
        case ReflectionKind.tupleMember:
        case ReflectionKind.rest:
            const name = 'name' in type ? String(type.name) : 'type';
            visitWithParent(type.type, visitor, onCircular, stack, (path && path + '.') + name + '[' + reflectionName(type.type.kind) + ']', type);
            break;
        case ReflectionKind.indexSignature:
            visitWithParent(type.index, visitor, onCircular, stack, (path && path + '.') + 'index[' + reflectionName(type.index.kind) + ']', type);
            visitWithParent(type.type, visitor, onCircular, stack, (path && path + '.') + 'type[' + reflectionName(type.type.kind) + ']', type);
            break;
    }
}


export function expectType<E extends ParentLessType>(
    pack: ReflectionOp[] | { ops: ReflectionOp[], stack: RuntimeStackEntry[], inputs?: RuntimeStackEntry[] },
    expectObject: E | number | string | boolean,
): void {
    const type = Processor.get().run(isArray(pack) ? pack : pack.ops, isArray(pack) ? [] : pack.stack, isArray(pack) ? [] : pack.inputs);

    // console.log('computed type', inspect(type, undefined, 4));
    if (isObject(expectObject)) {
        expectEqualType(type, expectObject);
        if (expectObject.kind === ReflectionKind.class || expectObject.kind === ReflectionKind.objectLiteral || expectObject.kind === ReflectionKind.function) {
            assertValidParent(type);
        }
    } else {
        expect(type).toEqual(expectObject);
    }
}

export function equalType<A, B>(a?: ReceiveType<A>, b?: ReceiveType<B>) {
    const aType = removeTypeName(resolveReceiveType(a));
    const bType = removeTypeName(resolveReceiveType(b));
    expect(stringifyResolvedType(aType)).toBe(stringifyResolvedType(bType));
    expectEqualType(aType, bType as any);
}

/**
 * Types can not be compared via toEqual since they contain circular references (.parent) and other stuff can not be easily assigned.
 */
export function expectEqualType(actual: any, expected: any, options: {
    noTypeNames?: true,
    noOrigin?: true,
    excludes?: string[],
    stack?: any[]
} = {}, path: string = ''): void {
    if (!options.stack) options.stack = [];

    if (options.stack.includes(expected)) {
        return;
    }
    options.stack.push(expected);

    if ('object' === typeof expected) {
        if ('object' !== typeof actual) throw new Error('Not equal object type: ' + path);

        for (const i in expected) {
            if (i === 'parent') continue;
            if (i === 'decorators') continue;
            if (options.excludes && options.excludes.includes(i)) continue;
            if (i === 'annotations') continue;
            if (i === 'parent') continue;
            if (i === 'jit') continue;
            if (i === 'id') continue;
            if (i === 'indexAccessOrigin') continue;
            if (i === 'declared') continue;
            if (options.noOrigin && i === 'origin') continue;
            if (options.noTypeNames && (i === 'typeName' || i === 'typeArguments')) continue;

            if (isArray(expected[i])) {
                if (!isArray(actual[i])) throw new Error(`Not equal array type: ${path}, ${expected[i]} vs ${actual[i]} at ${i}`);
                if (actual[i].length !== expected[i].length) throw new Error('Not equal array length: ' + path + '.' + i);
                for (let j = 0; j < expected[i].length; j++) {
                    expectEqualType(expected[i][j], actual[i][j], options, path + '.' + i + '.' + j);
                }
            } else {
                expectEqualType(expected[i], actual[i], options, path + '.' + i);
            }
        }
    } else {
        if (expected !== actual) throw new Error(`Invalid type ${path}: ${expected} !== ${actual}`);
    }

    options.stack.pop();
}
