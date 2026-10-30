/*
 * Deepkit Framework
 * Copyright Deepkit UG, Marc J. Schmidt
 *
 * This program is free software: you can redistribute it and/or modify
 * it under the terms of the MIT License.
 *
 * You should have received a copy of the MIT License along with this program.
 */

import { ClassType } from '@deepkit/core';
import { expect, test } from '@jest/globals';
import { entity, t } from '../src/decorator.js';
import { propertiesOf, reflect, ReflectionClass, ReflectionFunction, ReflectionMethod, typeOf, valuesOf } from '../src/reflection/reflection.js';
import {
    annotateClass,
    assertType,
    AutoIncrement,
    autoIncrementAnnotation,
    BackReference,
    Data,
    databaseAnnotation,
    defaultAnnotation,
    Embedded,
    Entity,
    entityAnnotation,
    Excluded,
    Group,
    Index,
    integer,
    MapName,
    MySQL,
    Postgres,
    PrimaryKey,
    primaryKeyAnnotation,
    Reference,
    referenceAnnotation,
    ReflectionKind,
    ReflectionVisibility,
    SQLite,
    stringifyResolvedType,
    Type,
    typeAnnotation,
    TypeClass,
    TypeFunction,
    TypeIndexSignature,
    TypeMethod,
    TypeNumber,
    TypeObjectLiteral,
    TypeTuple,
    Unique,
} from '../src/reflection/type.js';
import { TypeNumberBrand } from '@deepkit/type-spec';
import { validate, ValidatorError } from '../src/validator.js';
import { expectEqualType } from './utils.js';
import { MyAlias } from './types.js';
import { resolveRuntimeType } from '../src/reflection/processor.js';
import { uuid } from '../src/utils.js';

test('class', () => {
    class Entity {
        tags!: string[];
    }

    const type = reflect(Entity);
    expectEqualType(type, {
        kind: ReflectionKind.class,
        classType: Entity,
        types: [
            {
                kind: ReflectionKind.property,
                visibility: ReflectionVisibility.public,
                name: 'tags',
                type: { kind: ReflectionKind.array, type: { kind: ReflectionKind.string } }
            }
        ]
    });
});

test('class optional question mark', () => {
    class Entity {
        title?: string;
    }

    const type = reflect(Entity);
    expectEqualType(type, {
        kind: ReflectionKind.class,
        classType: Entity,
        types: [
            {
                kind: ReflectionKind.property,
                visibility: ReflectionVisibility.public,
                name: 'title',
                optional: true,
                type: { kind: ReflectionKind.string }
            }
        ]
    });
});

test('class optional union', () => {
    class Entity {
        title: string | undefined;
    }

    const type = reflect(Entity);
    expectEqualType(type, {
        kind: ReflectionKind.class,
        classType: Entity,
        types: [
            {
                kind: ReflectionKind.property,
                visibility: ReflectionVisibility.public,
                name: 'title',
                optional: true,
                type: { kind: ReflectionKind.string }
            }
        ]
    });
});

test('class constructor', () => {
    class Entity1 {
        constructor(title: string) {
        }
    }

    class Entity2 {
        constructor(public title: string) {
        }
    }

    expectEqualType(reflect(Entity1), {
        kind: ReflectionKind.class,
        classType: Entity1,
        types: [
            {
                kind: ReflectionKind.method,
                visibility: ReflectionVisibility.public,
                name: 'constructor',
                parameters: [
                    { kind: ReflectionKind.parameter, name: 'title', type: { kind: ReflectionKind.string } }
                ],
                return: { kind: ReflectionKind.any }
            }
        ]
    } as Type);

    expectEqualType(reflect(Entity2), {
        kind: ReflectionKind.class,
        classType: Entity2,
        types: [
            {
                kind: ReflectionKind.method,
                visibility: ReflectionVisibility.public,
                name: 'constructor',
                parameters: [
                    { kind: ReflectionKind.parameter, name: 'title', visibility: ReflectionVisibility.public, type: { kind: ReflectionKind.string } }
                ],
                return: { kind: ReflectionKind.any }
            },
            {
                kind: ReflectionKind.property,
                visibility: ReflectionVisibility.public,
                name: 'title',
                type: { kind: ReflectionKind.string }
            },
        ]
    } as Type);
});

test('class extends another', () => {
    class Class1 {
        constructor(title: string) {
        }
    }

    class Class2 extends Class1 {
        constructor() {
            super('asd');
        }
    }

    const reflection = ReflectionClass.from(Class2);
    const constructor = reflection.getMethodOrUndefined('constructor');
    expect(constructor).toBeInstanceOf(ReflectionMethod);
    expect(constructor!.getParameters().length).toBe(0);
});

test('class expression extends another', () => {
    class Class1 {
        constructor(title: string) {
        }
    }

    const class2 = class extends Class1 {
        constructor() {
            super('asd');
        }
    };

    const reflection = ReflectionClass.from(class2);
    const constructor = reflection.getMethodOrUndefined('constructor');
    expect(constructor).toBeInstanceOf(ReflectionMethod);
    expect(constructor!.getParameters().length).toBe(0);
});

test('constructor type abstract', () => {
    type constructor = abstract new (...args: any) => any;
    expectEqualType(typeOf<constructor>(), {
        kind: ReflectionKind.function,
        name: 'new',
        parameters: [
            { kind: ReflectionKind.parameter, name: 'args', type: { kind: ReflectionKind.rest, type: { kind: ReflectionKind.any } } }
        ],
        return: { kind: ReflectionKind.any }
    });
});

test('constructor type normal', () => {
    type constructor = new (a: string, b: number) => void;
    expectEqualType(typeOf<constructor>(), {
        kind: ReflectionKind.function,
        name: 'new',
        parameters: [
            { kind: ReflectionKind.parameter, name: 'a', type: { kind: ReflectionKind.string } },
            { kind: ReflectionKind.parameter, name: 'b', type: { kind: ReflectionKind.number } },
        ],
        return: { kind: ReflectionKind.void }
    } as TypeFunction);
});

test('interface', () => {
    interface Entity {
        tags: string[];
    }

    const type = typeOf<Entity>();
    expectEqualType(type, {
        kind: ReflectionKind.objectLiteral,
        typeName: 'Entity',
        types: [
            {
                kind: ReflectionKind.propertySignature,
                name: 'tags',
                type: { kind: ReflectionKind.array, type: { kind: ReflectionKind.string } }
            }
        ]
    });
});

test('tuple', () => {
    {
        const type = typeOf<[string]>();
        expectEqualType(type, {
            kind: ReflectionKind.tuple,
            types: [
                { kind: ReflectionKind.tupleMember, type: { kind: ReflectionKind.string } }
            ]
        } as TypeTuple);
    }
    {
        const type = typeOf<[string, number]>();
        expectEqualType(type, {
            kind: ReflectionKind.tuple,
            types: [
                { kind: ReflectionKind.tupleMember, type: { kind: ReflectionKind.string } },
                { kind: ReflectionKind.tupleMember, type: { kind: ReflectionKind.number } }
            ]
        } as TypeTuple);
    }
});

test('any of type alias', () => {
    {
        const type = typeOf<MyAlias<any>>();
        expectEqualType(type, { kind: ReflectionKind.any });
    }

    {
        class MyClass {
            private c: MyAlias<any>;
        }

        const reflection = ReflectionClass.from(MyClass);
        const property = reflection.getProperty('c');
        expectEqualType(property.type, { kind: ReflectionKind.any });
    }
});

test('named tuple', () => {
    {
        const type = typeOf<[title: string]>();
        expectEqualType(type, {
            kind: ReflectionKind.tuple,
            types: [
                { kind: ReflectionKind.tupleMember, type: { kind: ReflectionKind.string }, name: 'title' }
            ]
        } as TypeTuple);
    }
    {
        const type = typeOf<[title: string, prio: number]>();
        expectEqualType(type, {
            kind: ReflectionKind.tuple,
            types: [
                { kind: ReflectionKind.tupleMember, type: { kind: ReflectionKind.string }, name: 'title' },
                { kind: ReflectionKind.tupleMember, type: { kind: ReflectionKind.number }, name: 'prio' }
            ]
        } as TypeTuple);
    }
});

test('rest tuple', () => {
    {
        const type = typeOf<[...string[]]>();
        expectEqualType(type, {
            kind: ReflectionKind.tuple,
            types: [
                { kind: ReflectionKind.tupleMember, type: { kind: ReflectionKind.rest, type: { kind: ReflectionKind.string } } }
            ]
        } as TypeTuple);
    }
    {
        const type = typeOf<[...string[], number]>();
        expectEqualType(type, {
            kind: ReflectionKind.tuple,
            types: [
                { kind: ReflectionKind.tupleMember, type: { kind: ReflectionKind.rest, type: { kind: ReflectionKind.string } } },
                { kind: ReflectionKind.tupleMember, type: { kind: ReflectionKind.number } }
            ]
        } as TypeTuple);
    }
});

test('rest named tuple', () => {
    {
        const type = typeOf<[...title: string[]]>();
        expectEqualType(type, {
            kind: ReflectionKind.tuple,
            types: [
                { kind: ReflectionKind.tupleMember, name: 'title', type: { kind: ReflectionKind.rest, type: { kind: ReflectionKind.string } } }
            ]
        } as TypeTuple);
    }
    {
        const type = typeOf<[...title: string[], prio: number]>();
        expectEqualType(type, {
            kind: ReflectionKind.tuple,
            types: [
                { kind: ReflectionKind.tupleMember, name: 'title', type: { kind: ReflectionKind.rest, type: { kind: ReflectionKind.string } } },
                { kind: ReflectionKind.tupleMember, name: 'prio', type: { kind: ReflectionKind.number } },
            ]
        } as TypeTuple);
    }
});

test('typeof primitives', () => {
    expectEqualType(typeOf<string>(), { kind: ReflectionKind.string });
    expectEqualType(typeOf<number>(), { kind: ReflectionKind.number });
    expectEqualType(typeOf<boolean>(), { kind: ReflectionKind.boolean });
    expectEqualType(typeOf<bigint>(), { kind: ReflectionKind.bigint });
    expectEqualType(typeOf<null>(), { kind: ReflectionKind.null });
    expectEqualType(typeOf<undefined>(), { kind: ReflectionKind.undefined });
    expectEqualType(typeOf<any>(), { kind: ReflectionKind.any });
    expectEqualType(typeOf<never>(), { kind: ReflectionKind.never });
    expectEqualType(typeOf<void>(), { kind: ReflectionKind.void });
});

test('typeof union', () => {
    type t = 'a' | 'b';
    expectEqualType(typeOf<t>(), { kind: ReflectionKind.union, types: [{ kind: ReflectionKind.literal, literal: 'a' }, { kind: ReflectionKind.literal, literal: 'b' }] });
});

test('valuesOf union', () => {
    type t = 'a' | 'b';
    expectEqualType(valuesOf<t>(), ['a', 'b']);
    expectEqualType(valuesOf<string | number>(), [{ kind: ReflectionKind.string }, { kind: ReflectionKind.number }]);
});

test('valuesOf object literal', () => {
    type t = { a: string, b: number };
    expectEqualType(valuesOf<t>(), [{ kind: ReflectionKind.string }, { kind: ReflectionKind.number }]);
});

test('propertiesOf inline', () => {
    expect(propertiesOf<{ a: string, b: number }>()).toEqual(['a', 'b']);
});

test('object literal index signature', () => {
    type t = { [name: string]: string | number, a: string, };
    expect(typeOf<t>()).toMatchObject({
        kind: ReflectionKind.objectLiteral,
        types: [
            {
                kind: ReflectionKind.indexSignature,
                index: { kind: ReflectionKind.string },
                type: { kind: ReflectionKind.union, types: [{ kind: ReflectionKind.string }, { kind: ReflectionKind.number }] }
            } as TypeIndexSignature,
            {
                kind: ReflectionKind.propertySignature,
                name: 'a',
                type: { kind: ReflectionKind.string }
            }
        ]
    });
});

test('propertiesOf external', () => {
    type o = { a: string, b: number };
    expect(propertiesOf<o>()).toEqual(['a', 'b']);
});

test('propertiesOf class', () => {
    class User {
        a!: string;
        b!: string;
    }

    expect(propertiesOf<User>()).toEqual(['a', 'b']);
});

test('typeof object literal', () => {
    expectEqualType(typeOf<{ a: string }>(), {
        kind: ReflectionKind.objectLiteral,
        types: [{ kind: ReflectionKind.propertySignature, name: 'a', type: { kind: ReflectionKind.string } }]
    } as TypeObjectLiteral);
});

test('typeof object literal with function', () => {
    expectEqualType(typeOf<{ add(item: string): any }>(), {
        kind: ReflectionKind.objectLiteral,
        types: [{
            kind: ReflectionKind.methodSignature,
            name: 'add',
            parameters: [{ kind: ReflectionKind.parameter, name: 'item', type: { kind: ReflectionKind.string } }],
            return: { kind: ReflectionKind.any }
        }]
    } as TypeObjectLiteral);
});

test('typeof class', () => {
    class Entity {
        a!: string;
    }

    expectEqualType(typeOf<Entity>(), {
        kind: ReflectionKind.class,
        classType: Entity,
        types: [{ kind: ReflectionKind.property, name: 'a', visibility: ReflectionVisibility.public, type: { kind: ReflectionKind.string } }]
    } as TypeClass);

    expectEqualType(reflect(Entity), {
        kind: ReflectionKind.class,
        classType: Entity,
        types: [{ kind: ReflectionKind.property, name: 'a', visibility: ReflectionVisibility.public, type: { kind: ReflectionKind.string } }]
    } as TypeClass);
});

test('typeof generic class', () => {
    class Entity<T> {
        a!: T;
    }

    expectEqualType(typeOf<Entity<string>>(), {
        kind: ReflectionKind.class,
        classType: Entity,
        arguments: [typeOf<string>()],
        types: [{ kind: ReflectionKind.property, name: 'a', visibility: ReflectionVisibility.public, type: { kind: ReflectionKind.string } }]
    } as TypeClass);

    expectEqualType(reflect(Entity, typeOf<string>()), {
        kind: ReflectionKind.class,
        arguments: [typeOf<string>()],
        classType: Entity,
        types: [{ kind: ReflectionKind.property, name: 'a', visibility: ReflectionVisibility.public, type: { kind: ReflectionKind.string } }]
    } as TypeClass);
});

test('function', () => {
    function pad(text: string, size: number): string {
        return text;
    }

    const type = reflect(pad);
    expectEqualType(type, {
        kind: ReflectionKind.function,
        name: 'pad',
        function: pad,
        parameters: [
            { kind: ReflectionKind.parameter, name: 'text', type: { kind: ReflectionKind.string } },
            { kind: ReflectionKind.parameter, name: 'size', type: { kind: ReflectionKind.number } },
        ],
        return: { kind: ReflectionKind.string }
    });
});

test('type function', () => {
    type pad = (text: string, size: number) => string;

    expectEqualType(typeOf<pad>(), {
        kind: ReflectionKind.function,
        parameters: [
            { kind: ReflectionKind.parameter, name: 'text', type: { kind: ReflectionKind.string } },
            { kind: ReflectionKind.parameter, name: 'size', type: { kind: ReflectionKind.number } },
        ],
        return: { kind: ReflectionKind.string }
    });
});

test('query literal', () => {
    type o = { a: string | number };

    expectEqualType(typeOf<o['a']>(), {
        kind: ReflectionKind.union,
        types: [
            { kind: ReflectionKind.string },
            { kind: ReflectionKind.number },
        ]
    });
});

test('template literal', () => {
    type l = `_${'a' | 'b'}Changed`;
    type l2 = `_${string}Changed${'a' | 'b'}`;
    type l3 = `_${string}Changed${2 | 'b'}`;
    type l33 = `_${string}Changed${number | 'b'}`;
    type l4 = `_${string}Changed${true | 'b'}`;
    type l5 = `_${string}Changed${boolean | 'b'}`;
    type l6 = `_${string}Changed${bigint | 'b'}`;
    type l7 = `${string}`;
    type l77 = `${number}`;
    type l771 = `${boolean}`;
    type l8 = `helloworld`;
    type hw = 'hello' | 'world';
    type l9 = `${hw | 'b'}_`
    type l10 = `${`(${hw})`}_`

    const type0 = typeOf<l>();
    expectEqualType(type0, {
        kind: ReflectionKind.union,
        types: [{ kind: ReflectionKind.literal, literal: '_aChanged' }, { kind: ReflectionKind.literal, literal: '_bChanged' }]
    } as Type);

    const type1 = typeOf<l2>();
    expectEqualType(type1, {
        kind: ReflectionKind.union,
        types: [
            {
                kind: ReflectionKind.templateLiteral, types: [
                    { kind: ReflectionKind.literal, literal: '_' },
                    { kind: ReflectionKind.string },
                    { kind: ReflectionKind.literal, literal: 'Changeda' },

                ]
            },
            {
                kind: ReflectionKind.templateLiteral, types: [
                    { kind: ReflectionKind.literal, literal: '_' },
                    { kind: ReflectionKind.string },
                    { kind: ReflectionKind.literal, literal: 'Changedb' },

                ]
            },
        ]
    } as Type);

    expect(stringifyResolvedType(typeOf<l3>())).toBe('`_${string}Changed2` | `_${string}Changedb`');
    expect(stringifyResolvedType(typeOf<l33>())).toBe('`_${string}Changed${number}` | `_${string}Changedb`');
    expect(stringifyResolvedType(typeOf<l4>())).toBe('`_${string}Changedtrue` | `_${string}Changedb`');
    expect(stringifyResolvedType(typeOf<l5>())).toBe('`_${string}Changedfalse` | `_${string}Changedtrue` | `_${string}Changedb`');
    expect(stringifyResolvedType(typeOf<l6>())).toBe('`_${string}Changed${bigint}` | `_${string}Changedb`');
    expect(stringifyResolvedType(typeOf<l7>())).toBe('string');
    expect(stringifyResolvedType(typeOf<l77>())).toBe('`${number}`');
    expect(stringifyResolvedType(typeOf<l771>())).toBe(`'false' | 'true'`);
    expect(stringifyResolvedType(typeOf<l8>())).toBe(`'helloworld'`);
    expect(stringifyResolvedType(typeOf<l9>())).toBe(`'hello_' | 'world_' | 'b_'`);
    expect(stringifyResolvedType(typeOf<l10>())).toBe(`'(hello)_' | '(world)_'`);
});

test('mapped type key literal', () => {
    type o = { a: string, b: number, c: boolean, [2]: any };
    type Prefix<T> = {
        [P in keyof T as P extends string ? `v${P}` : never]: T[P]
    };

    type o2 = Prefix<o>;
});

test('pick', () => {
    class Config {
        debug: boolean = false;
        title: string = '';
    }

    type t = Pick<Config, 'debug'>;
    expectEqualType(typeOf<t>(), {
        kind: ReflectionKind.objectLiteral,
        types: [
            { kind: ReflectionKind.propertySignature, name: 'debug', type: { kind: ReflectionKind.boolean } },
        ]
    });

    class MyService {
        constructor(public config: Pick<Config, 'debug'>) {
        }
    }

    const reflection = ReflectionClass.from(MyService);
    const parameters = reflection.getMethodParameters('constructor');
    expect(parameters[0].getType()).toMatchObject({
        kind: ReflectionKind.objectLiteral,
        types: [
            { kind: ReflectionKind.propertySignature, name: 'debug', type: { kind: ReflectionKind.boolean } },
        ]
    });
});

test('query union from keyof', () => {
    type o = { a: string, b: string, c: number };

    expectEqualType(typeOf<o[keyof o]>(), {
        kind: ReflectionKind.union,
        types: [
            { kind: ReflectionKind.string },
            { kind: ReflectionKind.number },
        ]
    });
});

test('query union manual', () => {
    type o = { a: string, b: string, c: number };

    expectEqualType(typeOf<o['a' | 'b' | 'c']>(), {
        kind: ReflectionKind.union,
        types: [
            { kind: ReflectionKind.string },
            { kind: ReflectionKind.number },
        ]
    });
});

test('query number index', () => {
    type o = [string, string, number];

    expectEqualType(typeOf<o[number]>(), {
        kind: ReflectionKind.union,
        types: [
            { kind: ReflectionKind.string },
            { kind: ReflectionKind.number },
        ]
    });

    expectEqualType(typeOf<o[0]>(), { kind: ReflectionKind.string });
    expectEqualType(typeOf<o[1]>(), { kind: ReflectionKind.string });
    expectEqualType(typeOf<o[2]>(), { kind: ReflectionKind.number });
});

test('mapped type partial', () => {
    type Partial2<T> = {
        [P in keyof T]?: T[P];
    }

    type o = { a: string };
    type p = Partial2<o>;

    expect(typeOf<p>()).toMatchObject({
        kind: ReflectionKind.objectLiteral,
        types: [{ kind: ReflectionKind.propertySignature, name: 'a', optional: true, type: { kind: ReflectionKind.string } }]
    });
});

test('mapped type required', () => {
    type Required2<T> = {
        [P in keyof T]-?: T[P];
    }

    type o = { a?: string };
    type p = Required2<o>;

    expect(typeOf<p>()).toMatchObject({
        kind: ReflectionKind.objectLiteral,
        types: [{ kind: ReflectionKind.propertySignature, name: 'a', type: { kind: ReflectionKind.string } }]
    });
});

test('mapped type partial readonly', () => {
    type Partial2<T> = {
        readonly [P in keyof T]?: T[P];
    }

    type o = { a: string };
    type p = Partial2<o>;

    expect(typeOf<p>()).toMatchObject({
        kind: ReflectionKind.objectLiteral,
        types: [{ kind: ReflectionKind.propertySignature, name: 'a', readonly: true, optional: true, type: { kind: ReflectionKind.string } }]
    });
});

test('mapped type filter never', () => {
    type FilterB<T> = {
        [P in keyof T]?: P extends 'b' ? never : T[P];
    }

    type o = { a?: string, b: string };
    type p = FilterB<o>;

    expect(typeOf<p>()).toMatchObject({
        kind: ReflectionKind.objectLiteral,
        types: [{ kind: ReflectionKind.propertySignature, optional: true, name: 'a', type: { kind: ReflectionKind.string } }]
    });
});

test('object literal optional', () => {
    expectEqualType(typeOf<{ a?: string }>(), {
        kind: ReflectionKind.objectLiteral,
        types: [{ kind: ReflectionKind.propertySignature, name: 'a', optional: true, type: { kind: ReflectionKind.string } }]
    });
});

test('object literal readonly', () => {
    expectEqualType(typeOf<{ readonly a: string }>(), {
        kind: ReflectionKind.objectLiteral,
        types: [{ kind: ReflectionKind.propertySignature, name: 'a', readonly: true, type: { kind: ReflectionKind.string } }]
    });
});

test('type alias partial remove readonly', () => {
    type Partial2<T> = {
        -readonly [P in keyof T]?: T[P];
    }

    type o = { readonly a: string };
    type p = Partial2<o>;

    expect(typeOf<p>()).toMatchObject({
        kind: ReflectionKind.objectLiteral,
        types: [{ kind: ReflectionKind.propertySignature, name: 'a', optional: true, type: { kind: ReflectionKind.string } }]
    });
});

test('global partial', () => {
    type o = { a: string };
    type p = Partial<o>;

    expect(typeOf<p>()).toMatchObject({
        kind: ReflectionKind.objectLiteral,
        types: [{ kind: ReflectionKind.propertySignature, name: 'a', optional: true, type: { kind: ReflectionKind.string } }]
    });

});

test('global record', () => {
    type p = Record<string, number>;
    //equivalent to
    type a = { [K in string]: number };

    expect(typeOf<p>()).toMatchObject({
        kind: ReflectionKind.objectLiteral,
        types: [{ kind: ReflectionKind.indexSignature, type: { kind: ReflectionKind.number }, index: { kind: ReflectionKind.string } }]
    } as Type as any);

    expect(typeOf<a>()).toMatchObject({
        kind: ReflectionKind.objectLiteral,
        types: [{ kind: ReflectionKind.indexSignature, type: { kind: ReflectionKind.number }, index: { kind: ReflectionKind.string } }]
    });
});

test('global InstanceType', () => {
    // type InstanceType<T extends abstract new (...args: any) => any> = T extends abstract new (...args: any) => infer R ? R : true;
    type a = InstanceType<any>;

    // expect(typeOf<a>()).toMatchObject({kind: ReflectionKind.any} as Type as any);
});

test('type alias all string', () => {
    type AllString<T> = {
        [P in keyof T]: string;
    }

    type o = { a: string, b: number };
    type p = AllString<o>;

    expect(typeOf<p>()).toMatchObject({
        kind: ReflectionKind.objectLiteral,
        types: [
            { kind: ReflectionKind.propertySignature, name: 'a', type: { kind: ReflectionKind.string } },
            { kind: ReflectionKind.propertySignature, name: 'b', type: { kind: ReflectionKind.string } }
        ]
    });
});

test('type alias conditional type', () => {
    type IsString<T> = {
        [P in keyof T]: T[P] extends string ? true : false;
    }

    type o = { a: string, b: number };
    type p = IsString<o>;

    expect(typeOf<p>()).toMatchObject({
        kind: ReflectionKind.objectLiteral,
        types: [
            { kind: ReflectionKind.propertySignature, name: 'a', type: { kind: ReflectionKind.literal, literal: true, } },
            { kind: ReflectionKind.propertySignature, name: 'b', type: { kind: ReflectionKind.literal, literal: false, } },
        ]
    });
});

test('keep optional property', () => {
    interface Base {
        a: string;
        b: boolean;
        c?: number;
    }
    type Omitted = Omit<Base, 'b'>;
    const type = typeOf<Omitted>();
    assertType(type, ReflectionKind.objectLiteral);
    assertType(type.types[0], ReflectionKind.propertySignature);
    assertType(type.types[1], ReflectionKind.propertySignature);

    expect(type.types[0].name).toBe('a');
    expect(type.types[0].optional).toBe(undefined);
    expect(type.types[1].name).toBe('c');
    expect(type.types[1].optional).toBe(true);
})

test('type alias infer', () => {
    type InferTypeOfT<T> = {
        [P in keyof T]: T[P] extends { t: infer OT } ? OT : never
    }

    type o = { a: { t: string }, b: { t: number } };
    type p = InferTypeOfT<o>;

    expect(typeOf<p>()).toMatchObject({
        kind: ReflectionKind.objectLiteral,
        types: [
            { kind: ReflectionKind.propertySignature, name: 'a', type: { kind: ReflectionKind.string } },
            { kind: ReflectionKind.propertySignature, name: 'b', type: { kind: ReflectionKind.number } },
        ]
    });
});

test('user interface', () => {
    interface User {
        username: string;
        created: Date;
    }

    const type = typeOf<User>();
    expect(type).toMatchObject({
        kind: ReflectionKind.objectLiteral,
        types: [
            {
                kind: ReflectionKind.propertySignature, name: 'username',
                type: { kind: ReflectionKind.string }
            },
            {
                kind: ReflectionKind.propertySignature, name: 'created',
                type: { kind: ReflectionKind.class, classType: Date, types: [] }
            },
        ]
    });
});

test('generic static', () => {
    interface Request<T> {
        body: T;
    }

    interface Body {
        title: string;
    }

    const type = typeOf<Request<Body>>();
    expect(type).toMatchObject({
        kind: ReflectionKind.objectLiteral,
        types: [
            {
                kind: ReflectionKind.propertySignature, name: 'body',
                type: {
                    kind: ReflectionKind.objectLiteral, types: [
                        { kind: ReflectionKind.propertySignature, name: 'title', type: { kind: ReflectionKind.string } }
                    ]
                }
            },
        ]
    });

    expect(typeOf<Request<string>>()).toMatchObject({
        kind: ReflectionKind.objectLiteral,
        types: [
            {
                kind: ReflectionKind.propertySignature, name: 'body',
                type: { kind: ReflectionKind.string }
            },
        ]
    });
});

//this does not work yet
// test('function generic static', () => {
//     function infer<T extends string | number>(): Type {
//         return typeOf<T>();
//     }
//
//     expect(infer<'abc'>()).toMatchObject({ kind: ReflectionKind.string });
//     expect(infer<123>()).toMatchObject({ kind: ReflectionKind.number });
// });

test('generic dynamic', () => {
    interface Request<T extends object> {
        body: T;
    }

    interface Body {
        title: string;
    }

    const type = typeOf<Request<never>>([typeOf<Body>()]);
    expect(type).toMatchObject({
        kind: ReflectionKind.objectLiteral,
        types: [
            {
                kind: ReflectionKind.propertySignature, name: 'body',
                type: {
                    kind: ReflectionKind.objectLiteral, types: [
                        { kind: ReflectionKind.propertySignature, name: 'title', type: { kind: ReflectionKind.string } }
                    ]
                }
            },
        ]
    });

    expect(typeOf<Request<never>>([typeOf<string>()])).toMatchObject({
        kind: ReflectionKind.objectLiteral,
        types: [
            {
                kind: ReflectionKind.propertySignature, name: 'body',
                type: { kind: ReflectionKind.string }
            },
        ]
    });
});

test('reflection class', () => {
    class User {
        created: Date = new Date;

        constructor(public username: string) {
        }

        say(text: string): void {
            console.log(`${this.username}: ${text}`);
        }
    }

    const reflection = ReflectionClass.from(User);
    expect(reflection.getMethodNames()).toEqual(['constructor', 'say']);

    const sayMethod = reflection.getMethod('say')!;
    expect(sayMethod.getParameterNames()).toEqual(['text']);
    expect(sayMethod.getParameterType('text')!.kind).toBe(ReflectionKind.string);
    expect(sayMethod.getReturnType().kind).toEqual(ReflectionKind.void);

    expect(reflection.getPropertyNames()).toEqual(['created', 'username']);
    expectEqualType(reflection.getProperty('username')!.type, { kind: ReflectionKind.string }); //string
    expect(reflection.getProperty('username')!.isPublic()).toBe(true); //true
});

test('reflection function', () => {
    function say(text: string): void {
        console.log(`Text: ${text}`);
    }

    const reflection = ReflectionFunction.from(say);
    reflection.getParameters(); //[text: string]
    reflection.getReturnType(); //[void]

    expect(reflection.getParameterNames()).toEqual(['text']);
    expect(reflection.getParameter('text')!.getType().kind).toBe(ReflectionKind.string);
    expect(reflection.getParameterType('text')!.kind).toBe(ReflectionKind.string);

    expect(reflection.getReturnType().kind).toBe(ReflectionKind.void);
});

test('destructing params', () => {
    interface Param {
        title: string;
    }

    function say(first: string, { title }: Param, last: number): void {
    }

    const reflection = ReflectionFunction.from(say);
    expect(reflection.getParameterNames()).toEqual(['first', 'param1', 'last']);
});

test('interface extends basic', () => {
    interface Base {
        base: boolean;
    }

    interface User extends Base {
        id: number & PrimaryKey;
    }

    const reflection = ReflectionClass.from(typeOf<User>());
    console.log('reflection', reflection.type);
    expect(reflection.getProperty('base').getKind()).toBe(ReflectionKind.boolean);
    expect(reflection.getProperty('id').getKind()).toBe(ReflectionKind.number);
    expect(reflection.getProperty('id').isPrimaryKey()).toBe(true);
});

test('interface extends generic', () => {
    interface Base<T> {
        base: T;
    }

    interface User extends Base<boolean> {
        id: number & PrimaryKey;
    }

    const reflection = ReflectionClass.from(typeOf<User>());
    console.log('reflection', reflection.type);
    expect(reflection.getProperty('base').getKind()).toBe(ReflectionKind.boolean);
    expect(reflection.getProperty('id').getKind()).toBe(ReflectionKind.number);
    expect(reflection.getProperty('id').isPrimaryKey()).toBe(true);
});

test('interface entity', () => {
    interface User extends Entity<{ name: 'user', collection: 'users' }> {
        id: number & PrimaryKey;
    }

    const reflection = ReflectionClass.from(typeOf<User>());
    const entityOptions = entityAnnotation.getFirst(reflection.type);
    expect(entityOptions).toEqual({ name: 'user', collection: 'users' });
    expect(reflection.name).toBe('user');
    expect(reflection.collectionName).toBe('users');
});

test('primaryKey', () => {
    type a = number & PrimaryKey;
    console.log((typeOf<a>() as any).decorators[0].types);

    class User {
        id: number & PrimaryKey = 0;
    }

    const reflection = ReflectionClass.from(User);
    const property = reflection.getProperty('id')!;
    expect(property.getType().kind).toBe(ReflectionKind.number);
    const annotations = primaryKeyAnnotation.getAnnotations(property.getType());
    expect(annotations![0]).toEqual(true);
    expect(property.isPrimaryKey()).toEqual(true);
});

test('Reference', () => {
    interface User {
        id: number & PrimaryKey;

        pages: Page[] & BackReference;
    }

    interface Page {
        owner: User & Reference;
    }

    const reflection = ReflectionClass.from(typeOf<Page>() as TypeClass);
    const property = reflection.getProperty('owner')!;
    const owner = property.getType();
    assertType(owner, ReflectionKind.objectLiteral);
    expect(owner.typeName).toBe('User');
    assertType(owner.types[0], ReflectionKind.propertySignature);
    expect(owner.types[0].name).toBe('id');
    assertType(owner.types[0].type, ReflectionKind.number);

    const annotations = referenceAnnotation.getAnnotations(owner);
    expect(annotations![0]).toEqual({});
});

test('cache with annotations array', () => {
    type MyString = string;
    type MyPrimaryKeys = MyString[] & PrimaryKey;

    const string = typeOf<MyString>();
    assertType(string, ReflectionKind.string);
    expect(primaryKeyAnnotation.isPrimaryKey(string)).toEqual(false);

    const primaryKeys = typeOf<MyPrimaryKeys>();
    assertType(primaryKeys, ReflectionKind.array);
    assertType(primaryKeys.type, ReflectionKind.string);
    expect(primaryKeyAnnotation.isPrimaryKey(primaryKeys)).toEqual(true);
    expect(primaryKeyAnnotation.isPrimaryKey(primaryKeys.type)).toEqual(false);

    assertType(primaryKeys.type.parent!, ReflectionKind.array);
    expect(primaryKeys.type.parent!.type === primaryKeys.type).toBe(true);

    //intersection with decorators shallow copy the MyString[], which makes the subchild parent "invalid"
    // expect(primaryKeys.type.parent === primaryKeys).toBe(true);
});

test('cache with annotations type alias', () => {
    type MyString = string;
    type MyPrimaryKey = MyString & PrimaryKey;

    const str = typeOf<MyString>();
    assertType(str, ReflectionKind.string);
    expect(primaryKeyAnnotation.isPrimaryKey(str)).toEqual(false);

    const primaryKey = typeOf<MyPrimaryKey>();
    assertType(primaryKey, ReflectionKind.string);
    expect(primaryKeyAnnotation.isPrimaryKey(primaryKey)).toEqual(true);

    const str2 = typeOf<MyString>();
    assertType(str2, ReflectionKind.string);
    expect(primaryKeyAnnotation.isPrimaryKey(str2)).toEqual(false);

    interface User {
        id: MyPrimaryKey & AutoIncrement;
        id2: MyPrimaryKey;
    }

    const user = typeOf<User>();
    assertType(user, ReflectionKind.objectLiteral);
    assertType(user.types[0], ReflectionKind.propertySignature);
    expect(primaryKeyAnnotation.getAnnotations(user.types[0].type)).toEqual([true]);
    expect(autoIncrementAnnotation.getAnnotations(user.types[0].type)).toEqual([true]);

    assertType(user.types[1], ReflectionKind.propertySignature);
    expect(primaryKeyAnnotation.getAnnotations(user.types[1].type)).toEqual([true]);
    expect(autoIncrementAnnotation.getAnnotations(user.types[1].type)).toEqual([]);
});

test('cache same type', () => {
    interface User {
        id: number;
    }

    const user = typeOf<User>();
    const user2 = typeOf<User>();
    expect(user === user2).toBe(true);
});

test('cache with annotations class', () => {
    interface User extends Entity<{ name: 'user', collection: 'users' }> {
        username: string;
    }

    interface Page {
        owner: User & Reference;
        admin: User;
    }

    const page = typeOf<Page>();
    assertType(page, ReflectionKind.objectLiteral);
    assertType(page.types[0], ReflectionKind.propertySignature);
    expect(page.types[0].name).toBe('owner');
    assertType(page.types[0].type, ReflectionKind.objectLiteral);

    const user = typeOf<User>();
    const user2 = typeOf<User>();
    expect(user).toBe(user2);
    assertType(user, ReflectionKind.objectLiteral);
    expect(referenceAnnotation.getAnnotations(user)).toEqual([]);
    expect(entityAnnotation.getFirst(user)).toEqual({ name: 'user', collection: 'users' });

    expect(referenceAnnotation.getAnnotations(page.types[0].type)).toEqual([{}]);
    expect(entityAnnotation.getFirst(page.types[0].type)).toEqual({ name: 'user', collection: 'users' });

    assertType(page.types[1], ReflectionKind.propertySignature);
    assertType(page.types[1].type, ReflectionKind.objectLiteral);
    expect(referenceAnnotation.getAnnotations(page.types[1].type)).toEqual([]);
    expect(entityAnnotation.getFirst(page.types[1].type)).toEqual({ name: 'user', collection: 'users' });
});

test('cache different types', () => {
    interface Post {
        slug: string & SQLite<{ type: 'text' }>;
        size: number & SQLite<{ type: 'integer(4)' }>;
    }

    const post = typeOf<Post>();
    assertType(post, ReflectionKind.objectLiteral);
    assertType(post.types[0], ReflectionKind.propertySignature);
    const slugDatabase = databaseAnnotation.getDatabase(post.types[0].type, 'sqlite');
    expect(slugDatabase!.type).toBe('text');

    assertType(post.types[1], ReflectionKind.propertySignature);
    const sizeDatabase = databaseAnnotation.getDatabase(post.types[1].type, 'sqlite');
    expect(sizeDatabase!.type).toBe('integer(4)');
});

test('cache parent unset', () => {
    type MyString = string;
    type Union = MyString | number;

    const union = typeOf<Union>();
    const string = typeOf<MyString>();

    expect(string.parent).toBeUndefined();

    assertType(string, ReflectionKind.string);
    assertType(union, ReflectionKind.union);
    assertType(union.types[0], ReflectionKind.string);
    expect(union.types[0].parent).not.toBeUndefined();
    expect(union.types[0].parent).toBe(union);
});

test('cache parent unset circular', () => {
    interface User {
        groups: Group[] & BackReference<{ via: UserGroup }>;
    }

    interface Group {
    }

    interface UserGroup {
        user: User;
    }

    const user = typeOf<User>();
    const group = typeOf<Group>();
    const userGroup = typeOf<UserGroup>();

    expect(userGroup.parent).toBeUndefined();
    expect(group.parent).toBeUndefined();
    expect(user.parent).toBeUndefined();

    assertType(user, ReflectionKind.objectLiteral);
    assertType(user.types[0], ReflectionKind.propertySignature);
    assertType(user.types[0].type, ReflectionKind.array);
    assertType(user.types[0].type.type, ReflectionKind.objectLiteral);

    expect(user.types[0].type.parent === user.types[0]).toBe(true);

    //intersection with decorators shallow copy the Group[], which makes the subchild parent "invalid"
    // expect(user.types[0].type.type.parent === user.types[0].type).toBe(true);
});

test('circular interface', () => {
    interface User extends Entity<{ name: 'user', collection: 'users' }> {
        pages: Page[] & BackReference;
        page: Page & BackReference;
    }

    interface Page {
        owner: User & Reference;
        admin: User;
    }

    const user = typeOf<User>();
    const user2 = typeOf<User>();
    expect(user === user2).toBe(true);
    assertType(user, ReflectionKind.objectLiteral);
    expect(referenceAnnotation.getAnnotations(user)).toEqual([]);
    expect(entityAnnotation.getFirst(user)).toEqual({ name: 'user', collection: 'users' });

    const page = typeOf<Page>();
    assertType(page, ReflectionKind.objectLiteral);
    assertType(page.types[0], ReflectionKind.propertySignature);
    expect(page.types[0].name).toBe('owner');
    assertType(page.types[0].type, ReflectionKind.objectLiteral);

    expect(referenceAnnotation.getAnnotations(page.types[0].type)).toEqual([{}]);
    expect(entityAnnotation.getFirst(page.types[0].type)).toEqual({ name: 'user', collection: 'users' });

    assertType(page.types[1], ReflectionKind.propertySignature);
    assertType(page.types[1].type, ReflectionKind.objectLiteral);
    expect(referenceAnnotation.getAnnotations(page.types[1].type)).toEqual([]);
    expect(entityAnnotation.getFirst(page.types[1].type)).toEqual({ name: 'user', collection: 'users' });
});

test('built in numeric type', () => {
    class User {
        id: integer = 0;
    }

    const reflection = ReflectionClass.from(User);
    const property = reflection.getProperty('id')!;
    expect(property.getType().kind).toBe(ReflectionKind.number);
    expect((property.getType() as TypeNumber).brand).toBe(TypeNumberBrand.integer);
});

test('class validator', () => {
    class Email {
        constructor(public email: string) {
        }

        @t.validator
        validator(): ValidatorError | void {
            if (this.email === '') return new ValidatorError('email', 'Invalid email');
        }
    }

    const reflection = ReflectionClass.from(Email);
    expect(reflection.validationMethod).toBe('validator');

    expect(validate<Email>(new Email(''))).toEqual([{ path: '', code: 'email', message: 'Invalid email' }]);
    expect(validate<Email>(new Email('asd'))).toEqual([]);
});

test('value object single field', () => {
    class Price {
        constructor(public amount: integer) {
        }

        isFree() {
            return this.amount === 0;
        }
    }

    class Product {
        price2?: Price;

        constructor(public title: string, public price: Embedded<Price>) {
        }
    }

    const reflection = ReflectionClass.from(Product);
    const title = reflection.getProperty('title')!;
    expect(title.isEmbedded()).toBe(false);

    const price = reflection.getProperty('price')!;
    expect(price.isEmbedded()).toBe(true);
    expect(price.getEmbedded()).toEqual({});
    assertType(price.type, ReflectionKind.class);
    expect(price.type.classType).toBe(Price);

    const price2 = reflection.getProperty('price2')!;
    expect(price2.isEmbedded()).toBe(false);
    assertType(price2.type, ReflectionKind.class);
    expect(price2.type.classType).toBe(Price);
});

test('type annotation with union', () => {
    type HttpQuery<T> = T & { __meta?: never & ['httpQuery'] };

    type a = HttpQuery<number | string>;
    const type = typeOf<a>();
    assertType(type, ReflectionKind.union);
    expect(typeAnnotation.getAnnotations(type)).toEqual([{ name: 'httpQuery', options: undefined }]);
});

test('simple brands', () => {
    type Username = string & { __brand: 'username' };
    const type = typeOf<Username>();
    assertType(type, ReflectionKind.string);

    class User {
        username: Username = '' as Username;
    }

    const reflection = ReflectionClass.from(User);
    const property = reflection.getProperty('username')!;
    expect(property.getType().kind).toBe(ReflectionKind.string);
    expect(stringifyResolvedType(defaultAnnotation.getAnnotations(property.getType())[0])).toEqual(`{__brand: 'username'}`);
});

// test('ts-brand', () => {
//     type Brand<Base,
//         Branding,
//         ReservedName extends string = '__type__'> = Base & { [K in ReservedName]: Branding } & { __witness__: Base };
//
//     const type = typeOf<Brand<string, 'uuid'>>();
//     const expected: TypeString = {
//         kind: ReflectionKind.string,
//         brands: [
//             {
//                 kind: ReflectionKind.objectLiteral, types: [
//                     { kind: ReflectionKind.propertySignature, name: '__type__', type: { kind: ReflectionKind.literal, literal: 'uuid' } },
//                 ]
//             },
//             {
//                 kind: ReflectionKind.objectLiteral, types: []
//             }
//         ]
//     };
//     (expected.brands![1] as TypeObjectLiteral).types.push({ kind: ReflectionKind.propertySignature, name: '__witness__', type: expected });
//     expect(type).toEqual(expected);
// });

// test('decorate class', () => {
//     @t.group('a')
//     class User {
//         username: string = '';
//     }
//
//     const reflection = ReflectionClass.from(User);
//     expect(reflection.groups).toEqual(['a']);
// });

test('group decorator', () => {
    class User {
        username: string & Group<'a'> = '';
    }

    const reflection = ReflectionClass.from(User);
    const username = reflection.getProperty('username');
    expect(username!.getGroups()).toEqual(['a']);
});

test('exclude decorator', () => {
    class User {
        username: string & Excluded<'json'> = '';
    }

    const reflection = ReflectionClass.from(User);
    const username = reflection.getProperty('username');
    expect(username!.getExcluded()).toEqual(['json']);
});

test('data decorator', () => {
    class User {
        username: string & Data<'key', 3> = '';

        config: number & Data<'key', true> = 3;
    }

    const reflection = ReflectionClass.from(User);
    const username = reflection.getProperty('username');
    expect(username!.getData()).toEqual({ key: 3 });
    expect(reflection.getProperty('config')!.getData()).toEqual({ key: true });
});

test('reference decorator', () => {
    class Group {
    }

    class User {
        group?: Group & Reference;
        group2?: Group & Reference<{ onDelete: 'SET NULL' }>;
    }

    const reflection = ReflectionClass.from(User);
    expect(reflection.getProperty('group')!.getReference()).toEqual({});
    expect(reflection.getProperty('group2')!.getReference()).toEqual({ onDelete: 'SET NULL' });
});

test('index decorator', () => {
    class User {
        username: string & Index<{ name: 'username', unique: true }> = '';

        email?: string & Unique;

        config: number & Index = 2;
    }

    const reflection = ReflectionClass.from(User);
    const username = reflection.getProperty('username');
    expect(username!.getIndex()).toEqual({ name: 'username', unique: true });
    expect(reflection.getProperty('email')!.getIndex()).toEqual({ unique: true });
    expect(reflection.getProperty('config')!.getIndex()).toEqual({});
});

test('database decorator', () => {
    class User {
        username: string & MySQL<{ type: 'varchar(255)' }> = '';

        email?: string & SQLite<{ type: 'varchar(128)' }>;

        config: number & Postgres<{ type: 'smallint' }> = 5;

        nope?: number;
    }

    const reflection = ReflectionClass.from(User);
    const username = reflection.getProperty('username');
    expect(username!.getDatabase('mysql')).toEqual({ type: 'varchar(255)' });
    expect(reflection.getProperty('email')!.getDatabase('sqlite')).toEqual({ type: 'varchar(128)' });
    expect(reflection.getProperty('config')!.getDatabase('postgres')).toEqual({ type: 'smallint' });
    expect(reflection.getProperty('nope')!.getDatabase('postgres')).toEqual(undefined);
});

test('enum const', () => {
    const enum MyEnum {
        a, b, c
    }

    const type = typeOf<MyEnum>();
    expectEqualType(type, {
        kind: ReflectionKind.enum,
        enum: { a: 0, b: 1, c: 2 },
        values: [0, 1, 2]
    });
});

test('enum default', () => {
    enum MyEnum {
        a, b, c
    }

    const type = typeOf<MyEnum>();

    expectEqualType(type, {
        kind: ReflectionKind.enum,
        enum: { a: 0, b: 1, c: 2 },
        values: [0, 1, 2]
    });
});

test('enum initializer 1', () => {
    enum MyEnum {
        a = 3, b, c
    }

    const type = typeOf<MyEnum>();

    expectEqualType(type, {
        kind: ReflectionKind.enum,
        enum: { a: 3, b: 4, c: 5 },
        values: [3, 4, 5]
    });
});

test('enum initializer 2', () => {
    enum MyEnum {
        a = 0,
        b = 1 << 0,
        c = 1 << 1,
        d = 1 << 2,
    }

    const type = typeOf<MyEnum>();

    expectEqualType(type, {
        kind: ReflectionKind.enum,
        enum: { a: 0, b: 1, c: 2, d: 4 },
        values: [0, 1, 2, 4]
    });
});

test('decorate class inheritance', () => {
    class Timestamp {
        created: Date & Group<'base'> = new Date;
    }

    class User extends Timestamp {
        username: string & Group<'a'> & Group<'b'> = '';
    }

    const reflection = ReflectionClass.from(User);
    const username = reflection.getProperty('username');
    expect(username!.getGroups()).toEqual(['a', 'b']);

    const created = reflection.getProperty('created');
    expect(created!.getGroups()).toEqual(['base']);
});

test('decorate class inheritance override decorator data', () => {
    class Timestamp {
        created: Date & Group<'base'> = new Date;
    }

    class User extends Timestamp {
        created: Date & Group<'a'> = new Date;
    }

    const reflection = ReflectionClass.from(User);
    const created = reflection.getProperty('created');
    expect(created!.getGroups()).toEqual(['a']);
});

// test('decorate interface', () => {
//     interface User {
//         /**
//          * @description test
//          */
//         username: string;
//     }
//
//     const reflection = decorate<User>({
//         username: t.group('a')
//     });
//
//     const username = reflection.getProperty('username')!;
//     expect(username.getKind()).toBe(ReflectionKind.string);
//     expect(username.groups).toEqual(['a']);
//     expect(username.getDescription()).toEqual('test');
// });

test('set constructor parameter manually', () => {
    class Response {
        constructor(public success: boolean) {
        }
    }

    class StreamApiResponseClass<T> {
        constructor(public response: T) {
        }
    }

    // {
    //     const reflection = reflect(StreamApiResponseClass);
    //     assertType(reflection, ReflectionKind.class);
    //
    //     // type T = StreamApiResponseClass;
    //     // type a = T['response'];
    //     //if there is no type passed to T it resolved to any
    //     expect(reflection.typeArguments).toEqual([{ kind: ReflectionKind.any }]);
    // }
    //
    // {
    //     class StreamApiResponseClassWithDefault<T = string> {
    //         constructor(public response: T) {
    //         }
    //     }
    //
    //     const reflection = reflect(StreamApiResponseClassWithDefault);
    //     assertType(reflection, ReflectionKind.class);
    //
    //     // type T = StreamApiResponseClassWithDefault;
    //     // type a = T['response'];
    //     expect(reflection.typeArguments).toMatchObject([{ kind: ReflectionKind.string }]);
    // }
    //
    // expectEqualType(typeOf<Response>(), {
    //     kind: ReflectionKind.class,
    //     classType: Response,
    //     types: [
    //         {
    //             kind: ReflectionKind.method, name: 'constructor', visibility: ReflectionVisibility.public, parameters: [
    //                 { kind: ReflectionKind.parameter, name: 'success', visibility: ReflectionVisibility.public, type: { kind: ReflectionKind.boolean } }
    //             ], return: { kind: ReflectionKind.any }
    //         },
    //         {
    //             kind: ReflectionKind.property, visibility: ReflectionVisibility.public, name: 'success', type: { kind: ReflectionKind.boolean }
    //         }
    //     ]
    // } as Type);

    function StreamApiResponse<T>(responseBodyClass: ClassType<T>) {
        class A extends StreamApiResponseClass<T> {
            constructor(@t.type(responseBodyClass) public response: T) {
                super(response);
            }
        }

        return A;
    }

    {
        const classType = StreamApiResponse(Response);
        const reflection = ReflectionClass.from(classType);
        expect(reflection.getMethods().length).toBe(1);
        expect(reflection.getProperties().length).toBe(1);
        expect(reflection.getMethod('constructor')!.getParameters().length).toBe(1);
        //if this fails, ClassType can probably not be resolved, which means @deepkit/core wasn't built correctly
        expect(reflection.getMethod('constructor')!.getParameter('response')!.getType().kind).toBe(ReflectionKind.class);
        expect(reflection.getMethods()[0].getName()).toBe('constructor');
        const responseType = reflection.getProperty('response')!.getType();
        expect(responseType.kind).toBe(ReflectionKind.class);
        if (responseType.kind === ReflectionKind.class) {
            expect(responseType.classType).toBe(Response);
        }
    }

    function StreamApiResponse2<T>(responseBodyClass: ClassType<T>) {
        if (!responseBodyClass) throw new Error();

        class A extends StreamApiResponseClass<T> {
            constructor(public response: T) {
                super(response);
            }
        }

        return A;
    }

    {
        const classType = StreamApiResponse2(Response);
        const type = resolveRuntimeType(classType) as TypeClass;
        expect((type.types[0] as TypeMethod).parameters[0].type.kind).toBe(ReflectionKind.class);
        const reflection = ReflectionClass.from(classType);
        expect(reflection.getMethods().length).toBe(1);
        expect(reflection.getProperties().length).toBe(1);
        expect(reflection.getMethod('constructor').getParameters().length).toBe(1);
        expect(reflection.getMethod('constructor').getParameter('response').getType().kind).toBe(ReflectionKind.class);
        expect(reflection.getMethods()[0].getName()).toBe('constructor');
        //make sure parent's T is correctly set
        expect(reflection.getSuperReflectionClass()!.type.typeArguments![0].kind).toBe(ReflectionKind.class);

        const responseType = reflection.getProperty('response')!.getType();
        expect(responseType.kind).toBe(ReflectionKind.class);
        if (responseType.kind === ReflectionKind.class) {
            expect(responseType.classType).toBe(Response);
        }
    }

    {
        const type = typeOf<StreamApiResponseClass<Response>>() as TypeClass;
        const reflection = ReflectionClass.from(type);
        if (type.kind === ReflectionKind.class) {
            const t1 = type.arguments![0] as TypeClass;
            expect(t1.kind).toBe(ReflectionKind.class);
            expect(t1.classType).toBe(Response);
        }
        expect(reflection.getMethods().length).toBe(1);
        expect(reflection.getProperties().length).toBe(1);
        expect(reflection.getMethod('constructor').getParameters().length).toBe(1);
        expect(reflection.getMethod('constructor').getParameter('response').getType().kind).toBe(ReflectionKind.class);
        const responseType = reflection.getProperty('response')!.getType();
        expect(responseType.kind).toBe(ReflectionKind.class);
        if (responseType.kind === ReflectionKind.class) {
            expect(responseType.classType).toBe(Response);
        }

        expect(reflection.getMethods()[0].getName()).toBe('constructor');
    }
});

test('circular type 1', () => {
    type Page = {
        title: string;
        children: Page[]
    }

    const type = typeOf<Page>();

    expect(type.kind).toBe(ReflectionKind.objectLiteral);
    if (type.kind === ReflectionKind.objectLiteral) {
        const c = type.types[1];
        expect(c.kind).toBe(ReflectionKind.propertySignature);
        if (c.kind === ReflectionKind.propertySignature) {
            const cType = c.type;
            expect(cType.kind).toBe(ReflectionKind.array);
            if (cType.kind === ReflectionKind.array) {
                expect(cType.type.kind).toBe(ReflectionKind.objectLiteral);
                expect(cType.type === type).toBe(true);
            }
        }
    }
});

test('circular type 2', () => {
    type Document = {
        title: string;
        root: Node;
    }

    type Node = {
        children: Node[]
    }

    const type = typeOf<Document>();

    expect(type.kind).toBe(ReflectionKind.objectLiteral);

    if (type.kind === ReflectionKind.objectLiteral) {
        const rootProperty = type.types[1];
        expect(rootProperty.kind).toBe(ReflectionKind.propertySignature);
        if (rootProperty.kind === ReflectionKind.propertySignature) {
            const rootType = rootProperty.type;
            expect(rootType.kind).toBe(ReflectionKind.objectLiteral);
            if (rootType.kind === ReflectionKind.objectLiteral) {
                const childrenProperty = rootType.types[0];
                expect(childrenProperty.kind).toBe(ReflectionKind.propertySignature);
                if (childrenProperty.kind === ReflectionKind.propertySignature) {
                    expect(childrenProperty.type.kind).toBe(ReflectionKind.array);
                    if (childrenProperty.type.kind === ReflectionKind.array) {
                        //`root: Node` is not the same as `Node` in `children: Node[]`,
                        //as they have different parents.
                        expect(childrenProperty.type.type === rootType).toBe(false);
                    }
                }
            }
        }
    }
});

test('circular interface 2', () => {
    interface Document {
        title: string;
        root: Node;
    }

    interface Node {
        children: Node[];
    }

    const type = typeOf<Document>();

    expect(type.kind).toBe(ReflectionKind.objectLiteral);

    if (type.kind === ReflectionKind.objectLiteral) {
        const rootProperty = type.types[1];
        expect(rootProperty.kind).toBe(ReflectionKind.propertySignature);
        if (rootProperty.kind === ReflectionKind.propertySignature) {
            const rootType = rootProperty.type;
            expect(rootType.kind).toBe(ReflectionKind.objectLiteral);
            if (rootType.kind === ReflectionKind.objectLiteral) {
                const childrenProperty = rootType.types[0];
                expect(childrenProperty.kind).toBe(ReflectionKind.propertySignature);
                if (childrenProperty.kind === ReflectionKind.propertySignature) {
                    expect(childrenProperty.type.kind).toBe(ReflectionKind.array);
                    if (childrenProperty.type.kind === ReflectionKind.array) {
                        //`root: Node` is not the same as `Node` in `children: Node[]`,
                        //as they have different parents.
                        expect(childrenProperty.type.type === rootType).toBe(false);
                    }
                }
            }
        }
    }
});

test('circular class 2', () => {
    class Document {
        title!: string;
        root!: Node;
    }

    class Node {
        children!: Node[];
    }

    const type = typeOf<Document>();

    assertType(type, ReflectionKind.class);
    const rootProperty = type.types[1];
    assertType(rootProperty, ReflectionKind.property);
    assertType(rootProperty.type, ReflectionKind.class);
    assertType(rootProperty.type.types[0], ReflectionKind.property);
    assertType(rootProperty.type.types[0].type, ReflectionKind.array);
    assertType(rootProperty.type.types[0].type.type, ReflectionKind.class);
    assertType(rootProperty.type.types[0].type.type.types[0], ReflectionKind.property);
    expect(rootProperty.type.types[0].type.type.types[0].name).toBe('children');
});

test('circular class 3', () => {
    class Document {
        title!: string;
        root!: Node;
    }

    class Node {
        document!: Document;
        children!: Node[];
    }

    const type = typeOf<Document>();

    assertType(type, ReflectionKind.class);

    const rootProperty = type.types[1];
    assertType(rootProperty, ReflectionKind.property);
    const rootType = rootProperty.type;
    assertType(rootType, ReflectionKind.class);
    const documentProperty = rootType.types[0];
    assertType(documentProperty, ReflectionKind.property);
    assertType(documentProperty.type, ReflectionKind.class);

    const childrenProperty = rootType.types[1];
    assertType(childrenProperty, ReflectionKind.property);
    assertType(childrenProperty.type, ReflectionKind.array);
    assertType(childrenProperty.type.type, ReflectionKind.class);
});

test('typeOf returns same instance, and new one for generics', () => {
    class Clazz {
    }

    class GenericClazz<T> {
        item!: T;
    }

    {
        const clazz1 = typeOf<Clazz>();
        const clazz2 = typeOf<Clazz>();
        //this has to be equal otherwise JitContainer is always empty, and we would basically have no place to store cache data
        expect(clazz1 === clazz2).toBe(true);
    }

    //but types used in other types get their own instance
    {
        const clazz1 = typeOf<Clazz>();
        const clazz2 = typeOf<Clazz>();
        //this has to be equal otherwise JitContainer is always empty, and we would basically have no place to store cache data
        expect(clazz1 === clazz2).toBe(true);
    }

    {
        const clazz1 = typeOf<GenericClazz<string>>();
        const clazz2 = typeOf<GenericClazz<string>>();
        const clazz3 = typeOf<GenericClazz<number>>();
        //generics produce always a new type, no matter what. otherwise, it would be a memory leak.
        expect(clazz1 === clazz2).toBe(false);
        expect(clazz2 === clazz3).toBe(false);

        //to get a cached result, a type alias can be used
        type GenericClassString = GenericClazz<string>;
        const clazz4 = typeOf<GenericClassString>();
        const clazz5 = typeOf<GenericClassString>();
        expect(clazz4 === clazz5).toBe(true);
    }

    {
        class Composition {
            clazz1!: Clazz;
            clazz2!: Clazz;
        }

        const clazz1 = typeOf<Clazz>();
        const t = typeOf<Composition>();
        assertType(t, ReflectionKind.class);
        assertType(t.types[0], ReflectionKind.property);
        assertType(t.types[1], ReflectionKind.property);
        assertType(t.types[0].type, ReflectionKind.class);
        assertType(t.types[1].type, ReflectionKind.class);
        expect(t.types[0].type.classType === Clazz).toBe(true);

        //properties clazz1 and clazz2 get each their own type instance
        expect(t.types[0].type === t.types[1].type).toBe(false);

        //properties get their own instance, so it's not equal to clazz1 (as annotations would otherwise be redirected to the actual class)
        expect(t.types[0].type === clazz1).toBe(false);
    }
});

test('reference types decorators correct', () => {
    @entity.name('user')
    class User {
        id!: number & PrimaryKey & AutoIncrement;
    }

    @entity.name('post')
    class Post {
        id!: number & PrimaryKey & AutoIncrement;
        user?: User & Reference;
    }

    const user = ReflectionClass.from(User);
    expect(user.getProperty('id').isPrimaryKey()).toBe(true);
    expect(user.getProperty('id').isAutoIncrement()).toBe(true);
    expect(user.getPrimary() === user.getProperty('id')).toBe(true);
    expect(user.getAutoIncrement() === user.getProperty('id')).toBe(true);
});

test('singleTableInheritance', () => {
    @entity.collection('persons')
    abstract class Person {
        id: number & PrimaryKey & AutoIncrement = 0;
        firstName?: string;
        lastName?: string;
        abstract type: string;
    }

    @entity.singleTableInheritance()
    class Employee extends Person {
        email?: string;

        type: 'employee' = 'employee';
    }

    @entity.singleTableInheritance()
    class Freelancer extends Person {
        @t budget: number = 10_000;

        type: 'freelancer' = 'freelancer';
    }

    const person = ReflectionClass.from(Person);
    const employee = ReflectionClass.from(Employee);
    const freelancer = ReflectionClass.from(Freelancer);

    expect(person.singleTableInheritance).toBe(false);
    expect(person.collectionName).toBe('persons');
    expect(employee.singleTableInheritance).toBe(true);
    expect(employee.collectionName).toBe('persons'); //todo: this should be inherited?
    expect(freelancer.singleTableInheritance).toBe(true);

    const discriminant = person.getSingleTableInheritanceDiscriminantName();
    expect(discriminant).toBe('type');
});

test('Array<T>', () => {
    expect(typeOf<string[]>()).toMatchObject({ kind: ReflectionKind.array, type: { kind: ReflectionKind.string } });
    expect(typeOf<Array<string>>()).toMatchObject({ kind: ReflectionKind.array, type: { kind: ReflectionKind.string } });
});

test('default function expression', () => {
    class post {
        uuid: string = uuid();
        id: integer & AutoIncrement & PrimaryKey = 0;
        created: Date = new Date;
        created2: Date = new Date();
        type: string = 'asd';
        renewal: string = 'new value';
        tags: string[] = [];
    }

    const reflection = ReflectionClass.from(post);
    expect(reflection.getProperty('uuid').hasDefaultFunctionExpression()).toBe(true);
    expect(reflection.getProperty('id').hasDefaultFunctionExpression()).toBe(false);
    expect(reflection.getProperty('created').hasDefaultFunctionExpression()).toBe(true);
    expect(reflection.getProperty('created2').hasDefaultFunctionExpression()).toBe(true);
    expect(reflection.getProperty('type').hasDefaultFunctionExpression()).toBe(false);
    expect(reflection.getProperty('renewal').hasDefaultFunctionExpression()).toBe(false);
    expect(reflection.getProperty('tags').hasDefaultFunctionExpression()).toBe(false);

    function fn(a: Date = new Date, b: string = 'x') {
    }

    const fnReflection = ReflectionFunction.from(fn);
    expect(fnReflection.getParameter('a')!.hasDefaultFunctionExpression()).toBe(true);
    expect(fnReflection.getParameter('b')!.hasDefaultFunctionExpression()).toBe(false);

});

test('type annotation first position', () => {
    class author {
    }

    class post {
        id: PrimaryKey & number = 0;
        author?: Reference & MapName<'_author'> & author;
    }

    type a = Omit<post, 'author'>;

    const reflection = ReflectionClass.from(post);
    expect(reflection.getProperty('id').type.kind).toBe(ReflectionKind.number);
    expect(reflection.getProperty('id').isPrimaryKey()).toBe(true);
    expect(reflection.getProperty('author').type.kind).toBe(ReflectionKind.class);
    expect(reflection.getProperty('author').isPrimaryKey()).toBe(false);
    expect(reflection.getProperty('author').isReference()).toBe(true);

});

test('annotateClass static', () => {
    class ExternalClass {
    }

    interface AnnotatedClass {
        id: number;
    }

    annotateClass<AnnotatedClass>(ExternalClass);

    expect(stringifyResolvedType(reflect(ExternalClass))).toBe('AnnotatedClass {id: number}');
});

test('annotateClass generic', () => {
    class ExternalClass {
    }

    class AnnotatedClass<T> {
        id!: T;
    }

    annotateClass(ExternalClass, AnnotatedClass);

    expect(stringifyResolvedType(reflect(ExternalClass))).toBe('AnnotatedClass {id: T}');
    expect(stringifyResolvedType(reflect(ExternalClass, typeOf<number>()))).toBe('AnnotatedClass {id: number}');
});

test('test', () => {
    interface Article {
        id: number;
        title?: string;
    }

    validate<Article>({ id: 1 }).length; //0, means it validated successfully
    validate<Article>({}).length; //1, means there are validation errors

    console.log(validate<Article>({}));
});

test('map tuple', () => {
    type MapTuple<T extends any[]> = {
        [Payload in keyof T]?: T[Payload];
    };

    type tuple = [string, number];
    type mapped = MapTuple<tuple>;

    const type = typeOf<mapped>();
    assertType(type, ReflectionKind.tuple);

    assertType(type.types[0], ReflectionKind.tupleMember);
    expect(type.types[0].optional).toBe(true);
    assertType(type.types[0].type, ReflectionKind.string);

    assertType(type.types[1], ReflectionKind.tupleMember);
    expect(type.types[1].optional).toBe(true);
    assertType(type.types[1].type, ReflectionKind.number);
});

test('template literal with never', () => {
    type t1 = `_${'a' & string}`;
    type t2 = `_${never}`;
    type t3 = `_${3 & string}`;
    type t4 = 3 & string;
    type t5 = string & 3;
    type t6 = '3' & string;
    expect(stringifyResolvedType(typeOf<t4>())).toBe(`never`);
    expect(stringifyResolvedType(typeOf<t5>())).toBe(`never`);
    expect(stringifyResolvedType(typeOf<t6>())).toBe(`'3'`);

    expect(stringifyResolvedType(typeOf<t1>())).toBe(`'_a'`);
    expect(stringifyResolvedType(typeOf<t2>())).toBe(`never`);
    expect(stringifyResolvedType(typeOf<t3>())).toBe(`never`);
});

test('object literal with numeric index', () => {
    type o = { a: string, b: number, 3: boolean };
    const type = typeOf<o>();
    assertType(type, ReflectionKind.objectLiteral);

    expect(type.types.length).toBe(3);
    assertType(type.types[0], ReflectionKind.propertySignature);
    expect(type.types[0].name).toBe('a');
    assertType(type.types[1], ReflectionKind.propertySignature);
    expect(type.types[1].name).toBe('b');
    assertType(type.types[2], ReflectionKind.propertySignature);
    expect(type.types[2].name).toBe(3);
});

test('map as', () => {
    type MapTuple<T> = {
        [Payload in keyof T as `_${Payload & string}`]: T[Payload];
    };

    type o = { a: string, b: number, 3: boolean };
    type mapped = MapTuple<o>;

    const type = typeOf<mapped>();
    assertType(type, ReflectionKind.objectLiteral);

    expect(stringifyResolvedType(type)).toBe(`mapped {
  _a: string;
  _b: number;
}`);

    expect(type.types.length).toBe(2);
    assertType(type.types[0], ReflectionKind.propertySignature);
    expect(type.types[0].name).toBe('_a');
    assertType(type.types[1], ReflectionKind.propertySignature);
    expect(type.types[1].name).toBe('_b');
});

test('inheritance overrides property type', () => {
    interface Payload {
        key: string;
        payload: unknown;
    }

    interface ThePayload extends Payload {
        key: 'theKey';
        payload: {
            thePayload: string;
        };
    }

    const type = typeOf<ThePayload>();
    assertType(type, ReflectionKind.objectLiteral);
    assertType(type.types[0], ReflectionKind.propertySignature);
    expect(type.types[0].name).toBe('key');
    assertType(type.types[0].type, ReflectionKind.literal);
    expect(type.types[0].type.literal).toBe('theKey');

    assertType(type.types[1], ReflectionKind.propertySignature);
    expect(type.types[1].name).toBe('payload');
    assertType(type.types[1].type, ReflectionKind.objectLiteral);
});

test('map as complex', () => {
    interface Payload {
        key: string;
        payload: unknown;
    }

    interface ThePayload extends Payload {
        key: 'theKey';
        payload: {
            thePayload: string;
        };
    }
    interface ThePayload2 extends Payload {
        key: 'theKey2';
        payload: {
            thePayload: number;
        };
    }

    type PayloadMap<Payloads extends any[]> = {
        [Payload in Payloads[number] as Payload['key']]?: Payload['payload'];
    };

    type PayloadTypes = [ThePayload, ThePayload2];

    interface TheRequestBody<Payloads extends Payload[]> {
        payloadData: PayloadMap<Payloads>;
    }

    const type = typeOf<TheRequestBody<PayloadTypes>>();
    expect(stringifyResolvedType(type)).toBe(`TheRequestBody {payloadData: PayloadMap {
    theKey?: {thePayload: string};
    theKey2?: {thePayload: number};
  }}`);

    assertType(type, ReflectionKind.objectLiteral);

    assertType(type.types[0], ReflectionKind.propertySignature);
    expect(type.types[0].name).toBe('payloadData');
    assertType(type.types[0].type, ReflectionKind.objectLiteral);

    assertType(type.types[0].type.types[0], ReflectionKind.propertySignature);
    expect(type.types[0].type.types[0].name).toBe('theKey');

    assertType(type.types[0].type.types[0].type, ReflectionKind.objectLiteral);
    assertType(type.types[0].type.types[0].type.types[0], ReflectionKind.propertySignature);
    expect(type.types[0].type.types[0].type.types[0].name).toBe('thePayload');
    assertType(type.types[0].type.types[0].type.types[0].type, ReflectionKind.string);
});
