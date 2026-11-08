import { expect, test } from '@jest/globals';

import { ReceiveType, reflect, resolveReceiveType } from '../../src/reflection/reflection.js';
import { ReflectionKind, Type } from '../../src/reflection/type.js';

//https://github.com/marcj/deepkit/issues/730
function parameterKinds(fn: Function) {
    const type = reflect(fn);
    return type.kind === ReflectionKind.function ? type.parameters.map(v => v.type.kind) : undefined;
}

function named(fn: Function, name: string) {
    expect(fn.name).toBe(name);
    expect(parameterKinds(fn)).toEqual([ReflectionKind.string]);
}

export const exportedArrow = (a: string) => a;
export const exportedFunction = function (a: string) {
    return a;
};

namespace Space {
    export const inNamespace = (a: string) => a;
}

test('variables', () => {
    const arrow = (a: string) => a;
    const fn = function (a: string) {
        return a;
    };
    let later = (a: string) => a;
    var old = (a: string) => a;
    named(arrow, 'arrow');
    named(fn, 'fn');
    named(later, 'later');
    named(old, 'old');
});

test('exports and namespaces', () => {
    named(exportedArrow, 'exportedArrow');
    named(exportedFunction, 'exportedFunction');
    // TypeScript emits `Space.inNamespace = () => {}` here, an assignment to a member names nothing
    named(Space.inNamespace, '');
});

test('through parentheses and type assertions', () => {
    const paren = ((a: string) => a);
    const cast = ((a: string) => a) as (a: string) => string;
    const satisfied = ((a: string) => a) satisfies (a: string) => string;
    named(paren, 'paren');
    named(cast, 'cast');
    named(satisfied, 'satisfied');
});

test('several declarations in one statement can use each other', () => {
    const first = (a: string) => a, kinds = parameterKinds(first), second = (a: string) => a;
    expect(kinds).toEqual([ReflectionKind.string]);
    named(first, 'first');
    named(second, 'second');
});

test('a for initializer', () => {
    for (const inLoop = (a: string) => a, once = [0]; once.length; once.pop()) {
        named(inLoop, 'inLoop');
    }
});

test('a var as the body of an if', () => {
    if (true) var inIf = (a: string) => a;
    named(inIf, 'inIf');
});

test('object properties', () => {
    const o = {
        arrow: (a: string) => a,
        fn: function (a: string) {
            return a;
        },
        'quoted-key': (a: string) => a,
        1: (a: string) => a,
    };
    named(o.arrow, 'arrow');
    named(o.fn, 'fn');
    named(o['quoted-key'], 'quoted-key');
    named(o[1], '1');
});

test('a function property keeps its receiver', () => {
    const o = {
        value: 5,
        get: function (a: string) {
            return this.value;
        },
    };
    expect(o.get('')).toBe(5);
});

test('a computed key is evaluated once', () => {
    let calls = 0;
    const key = () => {
        calls++;
        return 'm';
    };
    const o = { [key()]: (a: string) => a };
    expect(calls).toBe(1);
    expect(o.m('x')).toBe('x');
});

test('class fields', () => {
    class A {
        field = (a: string) => a;
        static stat = (a: string) => a;
        'quoted-field' = (a: string) => a;
    }
    named(new A().field, 'field');
    named(A.stat, 'stat');
    named(new A()['quoted-field'], 'quoted-field');
});

test('an arrow in a class field keeps this', () => {
    class A {
        value = 5;
        get = (a: string) => this.value;
    }
    expect(new A().get('')).toBe(5);
});

test('default values', () => {
    function parameter(cb = (a: string) => a) {
        return cb;
    }
    const { destructured = (a: string) => a } = {} as { destructured?: (a: string) => string };
    named(parameter(), 'cb');
    named(destructured, 'destructured');
});

test('assignments', () => {
    let assigned: any;
    assigned = (a: string) => a;
    named(assigned, 'assigned');

    let logical: any;
    logical ??= (a: string) => a;
    named(logical, 'logical');
});

test('control: an assignment to a member gets no name', () => {
    const o: any = {};
    o.member = (a: string) => a;
    expect(o.member.name).toBe('');
});

test('control: a function expression keeps its own name', () => {
    const outer = function inner(a: string) {
        return a;
    };
    named(outer, 'inner');
});

test('an arrow function can receive its type argument', () => {
    const kind = <T>(type?: ReceiveType<T>): Type => resolveReceiveType(type);
    expect(kind<string>().kind).toBe(ReflectionKind.string);
    expect(kind.name).toBe('kind');
});

test('computed keys give the name', () => {
    const key = 'dynamic';
    const symbol = Symbol('sym');
    const o = {
        [key]: (a: string) => a,
        [symbol]: (a: string) => a,
    };
    named(o[key], 'dynamic');
    named(o[symbol], '[sym]');
});

test('computed method keys give the name and are evaluated once', () => {
    let calls = 0;
    const key = () => {
        calls++;
        return 'dynamic';
    };
    const o = {
        [key()](a: string) {
            return a;
        },
    };
    expect(calls).toBe(1);
    named((o as any).dynamic, 'dynamic');
});

test('a computed key in a default parameter still works', () => {
    const key = 'dynamic';
    function fn(o = { [key]: (a: string) => a }) {
        return o[key];
    }
    expect(fn()('x')).toBe('x');
});

test('a recursive function with a computed key does not share the key', () => {
    function build(depth: number): any {
        return { [`level${depth}`]: (a: string) => a, inner: depth > 0 ? build(depth - 1) : undefined };
    }
    const result = build(1);
    named(result.level1, 'level1');
    named(result.inner.level0, 'level0');
});
