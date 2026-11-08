import { expect, test } from '@jest/globals';

import { typeOf } from '../../src/reflection/reflection.js';
import { ReflectionKind } from '../../src/reflection/type.js';
import { is } from '../../src/typeguard.js';
import * as models from './issue-729/models.js';
import { User, UserRecord } from './issue-729/models.js';

//https://github.com/marcj/deepkit/issues/729
test('control: named imports', () => {
    expect(typeOf<User>().kind).toBe(ReflectionKind.objectLiteral);
    expect(typeOf<UserRecord>().kind).toBe(ReflectionKind.class);
    expect(is<User>({ name: 'Alice' })).toBe(true);
});

test('namespace import of an interface', () => {
    expect(typeOf<models.User>().kind).toBe(ReflectionKind.objectLiteral);
});

test('namespace import of a class', () => {
    expect(typeOf<models.UserRecord>().kind).toBe(ReflectionKind.class);
});

test('type guard through a namespace import', () => {
    expect(is<models.User>({ name: 'Alice' })).toBe(true);
    expect(is<models.User>({ name: 1 })).toBe(false);
});

test('generic interface, type alias, enum and export * through a namespace import', () => {
    expect(is<models.Box<number>>({ value: 1 })).toBe(true);
    expect(is<models.Box<number>>({ value: 'a' })).toBe(false);
    expect(is<models.Id>('a')).toBe(true);
    expect(is<models.Id>(1)).toBe(false);
    expect(is<models.Color>(models.Color.blue)).toBe(true);
    expect(is<models.Color>(5)).toBe(false);
    expect(is<models.Reexported>({ id: 1 })).toBe(true);
    expect(is<models.Reexported>({ id: 'a' })).toBe(false);
});

test('same name from a named import and a namespace import', () => {
    expect(is<User>({ name: 'Alice' })).toBe(true);
    expect(is<models.User>({ name: 'Alice' })).toBe(true);
});

test('class referenced through a namespace import keeps its runtime reference', () => {
    expect(typeOf<models.UserRecord>()).toMatchObject({ kind: ReflectionKind.class, classType: models.UserRecord });
    expect(is<models.UserRecord>(new models.UserRecord())).toBe(true);
});
