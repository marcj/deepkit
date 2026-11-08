import { expect, test } from '@jest/globals';

import { ReflectionClass } from '../../src/reflection/reflection.js';
import { ReflectionKind } from '../../src/reflection/type.js';
import { Element, Options, Plain } from './issue-220/lib.js';

//https://github.com/marcj/deepkit/issues/220
class Service {
    parse(ele: Element): void {}
    plain(ele: Plain): void {}
    options(options: Options): void {}
}

const parameter = (name: string) => ReflectionClass.from(Service).getMethod(name).getParameters()[0].type;

test('a class re-exported with export type has no runtime value', () => {
    expect(parameter('parse')).toMatchObject({ kind: ReflectionKind.any, typeName: 'Element' });
});

test('control: a normal re-export keeps its runtime reference', () => {
    expect(parameter('plain')).toMatchObject({ kind: ReflectionKind.class, classType: Plain });
});

test('control: an interface re-exported with export type', () => {
    expect(parameter('options').kind).not.toBe(ReflectionKind.class);
});
