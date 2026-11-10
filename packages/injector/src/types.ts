import { reflect, ReflectionKind, Type } from '@deepkit/type';
import { getParentClass } from '@deepkit/core';

/**
 * Checks if given type is nominally compatible with the given interface.
 *
 * 0 means not compatible, 1 means exactly compatible, n>1 means compatible but not exactly. The higher the number the further away the compatibility is (the inheritance chain).
 *
 * @example
 * ```typescript
 * class A {
 * }
 *
 * class B extends A {
 * }
 *
 * interface B0 extends B {}
 *
 * class C {
 * }
 *
 * nominalCompatibility(A, A) // true
 * nominalCompatibility(A, B) // true
 * nominalCompatibility(A, B0) // true
 * nominalCompatibility(A, C) // false
 *
 */
export function nominalCompatibility(token: Type, provider: Type): number {
    //we want to check if the token is nominal the same with the provider.
    if (token === provider) return 1;

    const stack: { spec: number, type: Type }[] = [{ spec: 1, type: provider }];

    while (stack.length) {
        const entry = stack.pop()!;
        const current = entry.type;
        if (current.id && current.id === token.id) return entry.spec;

        if (!current.id && !token.id) {
            //both have no nominal ID, so compare by value identity (literal, classType, function)
            if (current.kind === ReflectionKind.function && token.kind === ReflectionKind.function && current.function && current.function === token.function) return entry.spec;
            if (current.kind === ReflectionKind.class && token.kind === ReflectionKind.class && current.classType && current.classType === token.classType) return entry.spec;
            if (current.kind === ReflectionKind.literal && token.kind === ReflectionKind.literal && current.literal === token.literal) return entry.spec;
        }

        if (current.kind === ReflectionKind.class) {
            const parent = getParentClass(current.classType);
            if (parent) {
                // a parent with @reflection never has no type, but can still be the token
                const next = (parent as any).__type ? reflect(parent) : { kind: ReflectionKind.class, classType: parent, types: [] } as Type;
                stack.push({ spec: entry.spec + 1, type: next });
            }
        }

        if ((current.kind === ReflectionKind.class || current.kind === ReflectionKind.objectLiteral) && current.implements) {
            for (const i of current.implements) {
                stack.push({ spec: entry.spec + 1, type: i });
            }
        }
    }

    return 0;
}
