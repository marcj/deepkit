import { expect, test } from '@jest/globals';
import { ReflectionFunction } from '../../src/reflection/reflection.js';

// function declarations are hoisted, so their type must be available before the declaration (#664)
const parameters = ReflectionFunction.from(system).getParameters().map(v => v.name);

test('function used before its declaration', () => {
    expect(parameters).toEqual(['foo', 'bar']);
});

function system(foo: string, bar: number) {
    return foo;
}
