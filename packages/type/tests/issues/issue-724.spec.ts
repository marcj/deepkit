import { expect, test } from '@jest/globals';

import { ReflectionClass } from '../../src/reflection/reflection.js';
import { is } from '../../src/typeguard.js';

//https://github.com/marcj/deepkit/issues/724
interface User {
    name: string;
}

test('control: bare modifiers', () => {
    type Draft<T> = { readonly [K in keyof T]?: T[K] };
    const name = ReflectionClass.from<Draft<User>>().getProperty('name');
    expect(name.isOptional()).toBe(true);
    expect(name.isReadonly()).toBe(true);
    expect(is<Draft<User>>({})).toBe(true);
});

test('+? makes properties optional', () => {
    type Draft<T> = { [K in keyof T]+?: T[K] };
    expect(ReflectionClass.from<Draft<User>>().getProperty('name').isOptional()).toBe(true);
    expect(is<Draft<User>>({})).toBe(true);
});

test('+readonly makes properties readonly', () => {
    type Frozen<T> = { +readonly [K in keyof T]: T[K] };
    expect(ReflectionClass.from<Frozen<User>>().getProperty('name').isReadonly()).toBe(true);
});
