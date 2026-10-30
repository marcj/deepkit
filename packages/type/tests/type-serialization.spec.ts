import { getClassName } from '@deepkit/core';
import { expect, test } from '@jest/globals';
import { ReceiveType, reflect, ReflectionClass, resolveReceiveType, typeOf } from '../src/reflection/reflection.js';
import {
    assertType,
    Entity,
    entityAnnotation,
    findMember,
    isSameType,
    PrimaryKey,
    primaryKeyAnnotation,
    Reference,
    ReflectionKind,
    Type,
    TypeClass,
    TypeProperty
} from '../src/reflection/type.js';
import { deserializeType, serializeType } from '../src/type-serialization.js';
import { entity } from '../src/decorator.js';
import { deserialize } from '../src/serializer-facade.js';

test('serialize basics', () => {
    expect(serializeType(typeOf<string>())).toEqual([{ kind: ReflectionKind.string }]);
    expect(serializeType(typeOf<number>())).toEqual([{ kind: ReflectionKind.number }]);
    expect(serializeType(typeOf<boolean>())).toEqual([{ kind: ReflectionKind.boolean }]);
    expect(serializeType(typeOf<bigint>())).toEqual([{ kind: ReflectionKind.bigint }]);
    expect(serializeType(typeOf<symbol>())).toEqual([{ kind: ReflectionKind.symbol }]);
    expect(serializeType(typeOf<object>())).toEqual([{ kind: ReflectionKind.object }]);
    expect(serializeType(typeOf<RegExp>())).toEqual([{ kind: ReflectionKind.regexp }]);

    expect(serializeType(typeOf<'a'>())).toEqual([{ kind: ReflectionKind.literal, literal: 'a' }]);
    expect(serializeType(typeOf<2>())).toEqual([{ kind: ReflectionKind.literal, literal: 2 }]);
    expect(serializeType(typeOf<true>())).toEqual([{ kind: ReflectionKind.literal, literal: true }]);
    expect(serializeType(typeOf<12n>())).toEqual([{ kind: ReflectionKind.literal, literal: { type: 'bigint', value: '12' } }]);
    const s = Symbol('abc');
    expect(serializeType(typeOf<typeof s>())).toEqual([{ kind: ReflectionKind.literal, literal: { type: 'symbol', name: 'abc' } }]);
    const r = /abc/g;
    expect(serializeType(typeOf<typeof r>())).toEqual([{ kind: ReflectionKind.literal, literal: { type: 'regex', regex: '/abc/g' } }]);
});

test('serialize type annotations', () => {
    type t = string & PrimaryKey;
    expect(serializeType(typeOf<t>())).toEqual([
        { kind: ReflectionKind.string, typeName: 't', decorators: [1] },
        { kind: ReflectionKind.objectLiteral, typeName: 'PrimaryKey', types: [2] },
        { kind: ReflectionKind.propertySignature, name: '__meta', optional: true, type: 3 },
        { kind: ReflectionKind.tuple, types: [{ kind: ReflectionKind.tupleMember, type: 4 }, { kind: ReflectionKind.tupleMember, type: 5 }] },
        { kind: ReflectionKind.literal, literal: 'primaryKey' },
        { kind: ReflectionKind.never }
    ]);
});

test('serialize container', () => {
    expect(serializeType(typeOf<string[]>())).toEqual([{ kind: ReflectionKind.array, type: 1 }, { kind: ReflectionKind.string }]);
    expect(serializeType(typeOf<string[][]>())).toEqual([{ kind: ReflectionKind.array, type: 1 }, { kind: ReflectionKind.array, type: 2 }, { kind: ReflectionKind.string }]);

    expect(serializeType(typeOf<[string, number]>())).toEqual([{
        kind: ReflectionKind.tuple,
        types: [{ kind: ReflectionKind.tupleMember, type: 1 }, { kind: ReflectionKind.tupleMember, type: 2 }]
    }, { kind: ReflectionKind.string }, { kind: ReflectionKind.number }]);

    expect(serializeType(typeOf<Record<string, number>>())).toEqual([{
        kind: ReflectionKind.objectLiteral,
        typeName: 'Record',
        typeArguments: [1, 2],
        types: [3]
    }, { kind: ReflectionKind.string }, { kind: ReflectionKind.number }, { kind: ReflectionKind.indexSignature, type: 2, index: 1 }]);

    expect(serializeType(typeOf<{ [name: string]: number }>())).toEqual([{
        kind: ReflectionKind.objectLiteral,
        types: [1]
    }, { kind: ReflectionKind.indexSignature, type: 3, index: 2 }, { kind: ReflectionKind.string }, { kind: ReflectionKind.number }]);

    expect(serializeType(typeOf<{ a: number, b: string }>())).toEqual([{
        kind: ReflectionKind.objectLiteral,
        types: [1, 3]
    }, { kind: ReflectionKind.propertySignature, name: 'a', type: 2 }, { kind: ReflectionKind.number },
        { kind: ReflectionKind.propertySignature, name: 'b', type: 4 }, { kind: ReflectionKind.string }]);

    class MyClass {
        a: number = 2;
        b?: string;
    }

    expect(serializeType(typeOf<MyClass>())).toEqual([{
        kind: ReflectionKind.class,
        typeName: 'MyClass',
        classType: 'MyClass',
        types: [1, 3]
    }, { kind: ReflectionKind.property, visibility: 0, name: 'a', type: 2, default: true }, { kind: ReflectionKind.number },
        { kind: ReflectionKind.property, visibility: 0, name: 'b', optional: true, type: 4 }, { kind: ReflectionKind.string }]);
});

test('serialize functions', () => {
    expect(serializeType(typeOf<(a: string, b?: number) => any>())).toEqual([{
        kind: ReflectionKind.function,
        parameters: [{ kind: ReflectionKind.parameter, name: 'a', type: 1 }, { kind: ReflectionKind.parameter, optional: true, name: 'b', type: 2 }],
        return: 3
    }, { kind: ReflectionKind.string }, { kind: ReflectionKind.number }, { kind: ReflectionKind.any }]);

    expect(serializeType(typeOf<(...a: string[]) => any>())).toEqual([{
        kind: ReflectionKind.function,
        parameters: [{ kind: ReflectionKind.parameter, name: 'a', type: 1 }],
        return: 3
    }, { kind: ReflectionKind.rest, type: 2 }, { kind: ReflectionKind.string }, { kind: ReflectionKind.any }]);
});

test('serialize enum', () => {
    enum MyEnum {
        a = 3,
        b = 'abc'
    }

    expect(serializeType(typeOf<MyEnum>())).toEqual([{
        kind: ReflectionKind.enum,
        typeName: 'MyEnum',
        enum: { a: 3, b: 'abc' },
        values: [3, 'abc'],
        indexType: 1
    }, { kind: ReflectionKind.union, types: [2, 3] }, { kind: ReflectionKind.string }, { kind: ReflectionKind.number }]);
});

function roundTrip<T>(type?: ReceiveType<T>): Type {
    const json = serializeType(resolveReceiveType(type));
    const back = deserializeType(json);
    return back;
}

test('roundTrip', () => {
    expect(roundTrip<string>()).toEqual({ kind: ReflectionKind.string });
    expect(roundTrip<number>()).toEqual({ kind: ReflectionKind.number });
    expect(roundTrip<boolean>()).toEqual({ kind: ReflectionKind.boolean });
    expect(roundTrip<true>()).toEqual({ kind: ReflectionKind.literal, literal: true });
    expect(roundTrip<12>()).toEqual({ kind: ReflectionKind.literal, literal: 12 });
    expect(roundTrip<12n>()).toEqual({ kind: ReflectionKind.literal, literal: 12n });

    const s = Symbol('abc');
    const rs = roundTrip<typeof s>();
    assertType(rs, ReflectionKind.literal);
    expect(String(rs.literal)).toBe('Symbol(abc)');

    const r = /abc/g;
    const rr = roundTrip<typeof r>();
    assertType(rr, ReflectionKind.literal);
    expect(String(rr.literal)).toBe('/abc/g');

    {
        const type = roundTrip<string[]>();
        assertType(type, ReflectionKind.array);
        expect(type.type).toMatchObject({ kind: ReflectionKind.string });
        expect(type.type.parent === type).toBe(true);
    }

    {
        const type = roundTrip<string | number>();
        assertType(type, ReflectionKind.union);
        expect(type.types).toMatchObject([{ kind: ReflectionKind.string }, { kind: ReflectionKind.number }]);
        expect(type.types[0].parent === type).toBe(true);
        expect(type.types[1].parent === type).toBe(true);
    }
});

test('roundTrip objectLiteral', () => {
    {
        const type = roundTrip<Record<string, number>>();
        assertType(type, ReflectionKind.objectLiteral);
        expect(type.typeName).toBe('Record');
        assertType(type.types[0], ReflectionKind.indexSignature);

        expect(type.typeArguments![0]).toBe(type.types[0].index);
        expect(type.typeArguments![1]).toBe(type.types[0].type);

        expect(type.types[0].index).toMatchObject({ kind: ReflectionKind.string });
        expect(type.types[0].type).toMatchObject({ kind: ReflectionKind.number });
        expect(type.types[0].index.parent === type.types[0]).toBe(true);
        expect(type.types[0].parent === type).toBe(true);
    }
    {
        const type = roundTrip<{ [name: string]: number }>();
        assertType(type, ReflectionKind.objectLiteral);
        expect(type.typeName).toBe(undefined);
        assertType(type.types[0], ReflectionKind.indexSignature);

        expect(type.typeArguments).toBe(undefined);

        expect(type.types[0].index).toMatchObject({ kind: ReflectionKind.string });
        expect(type.types[0].type).toMatchObject({ kind: ReflectionKind.number });
        expect(type.types[0].index.parent === type.types[0]).toBe(true);
        expect(type.types[0].parent === type).toBe(true);
    }
});

test('roundTrip class static', () => {
    class MyClass {
        a: string = '1';
        b?: number;
    }

    {
        const type = roundTrip<MyClass>();
        assertType(type, ReflectionKind.class);
        expect(getClassName(type.classType)).toBe('MyClass');
        assertType(type.types[0], ReflectionKind.property);
        assertType(type.types[1], ReflectionKind.property);

        expect(type.typeArguments).toBe(undefined);

        expect(type.types[0].name).toBe('a');
        assertType(type.types[0].type, ReflectionKind.string);

        expect(type.types[1].name).toBe('b');
        expect(type.types[1].optional).toBe(true);
        assertType(type.types[1].type, ReflectionKind.number);
        expect(type.types[1].type.parent === type.types[1]).toBe(true);
        expect(type.types[1].parent === type).toBe(true);
    }
});

test('roundTrip class generic', () => {
    class MyClass<T> {
        a: string = '1';
        b?: T;
    }

    {
        const type = roundTrip<MyClass<boolean>>();
        assertType(type, ReflectionKind.class);
        expect(getClassName(type.classType)).toBe('MyClass');
        assertType(type.types[0], ReflectionKind.property);
        assertType(type.types[1], ReflectionKind.property);

        assertType(type.typeArguments![0], ReflectionKind.boolean);

        expect(type.types[0].name).toBe('a');
        assertType(type.types[0].type, ReflectionKind.string);

        expect(type.types[1].name).toBe('b');
        expect(type.types[1].optional).toBe(true);
        assertType(type.types[1].type, ReflectionKind.boolean);
        expect(type.types[1].type.parent === type.types[1]).toBe(true);
        expect(type.types[1].parent === type).toBe(true);
    }
});

test('type annotations', () => {
    {
        type t = string & PrimaryKey;
        const type = roundTrip<t>();
        assertType(type, ReflectionKind.string);
        expect(type.typeName).toBe('t');
        expect(primaryKeyAnnotation.isPrimaryKey(type)).toBe(true);
    }
});

test('BehaviorSubject', () => {
    class MyModel {
    }

    /** @reflection never */
    class BehaviorSubject<T> {
    }

    const type = serializeType(typeOf<Promise<BehaviorSubject<MyModel>>>());
    console.log('type', type);
});

test('circular basics', () => {
    class MyModel {
        sub?: MyModel;
    }

    const json = serializeType(typeOf<MyModel>());
    const type = deserializeType(json);

    assertType(type, ReflectionKind.class);
    expect(getClassName(type.classType)).toBe('MyModel');
    assertType(type.types[0], ReflectionKind.property);
    expect(type.types[0].name).toBe('sub');
    assertType(type.types[0].type, ReflectionKind.class);
    expect(getClassName(type.types[0].type.classType)).toBe('MyModel');
});

test('circular with decorators', () => {
    class MyModel {
        sub?: MyModel & PrimaryKey;
    }

    const json = serializeType(typeOf<MyModel>());
    const type = deserializeType(json);

    assertType(type, ReflectionKind.class);
    expect(getClassName(type.classType)).toBe('MyModel');
    expect(primaryKeyAnnotation.isPrimaryKey(type)).toBe(false);
    assertType(type.types[0], ReflectionKind.property);
    expect(type.types[0].name).toBe('sub');
    assertType(type.types[0].type, ReflectionKind.class);
    expect(getClassName(type.types[0].type.classType)).toBe('MyModel');
    expect(primaryKeyAnnotation.isPrimaryKey(type.types[0].type)).toBe(true);
});

test('globals Uint8Array', () => {
    const json = serializeType(typeOf<Uint8Array>());
    const type = deserializeType(json);
    assertType(type, ReflectionKind.class);
    expect(type.classType === Uint8Array).toBe(true);
});

test('globals Date', () => {
    const json = serializeType(typeOf<Date>());
    const type = deserializeType(json);
    assertType(type, ReflectionKind.class);
    expect(type.classType === Date).toBe(true);
});

test('Type excluded', () => {
    const type = typeOf<Type>();

    class Validation {
        constructor(public message: string, public type?: Type) {
        }
    }

    const member = findMember('type', (reflect(Validation) as TypeClass).types) as TypeProperty;
    expect(isSameType(type, member.type)).toBe(true);

    const json = serializeType(typeOf<Validation>());
    const back = deserializeType(json);
    assertType(back, ReflectionKind.class);
    const typeMember = findMember('type', back.types);
    assertType(typeMember, ReflectionKind.property);
    expect(typeMember.type.kind).toBe(ReflectionKind.any);
});

test('entity classes', () => {
    @(entity.name('user').collection('users').databaseSchema('db').index(['id'], { name: 'primary' }))
    class User {
        id: number = 0;
    }

    const reflection1 = ReflectionClass.from(User);

    const json = serializeType(typeOf<User>());
    const back = deserializeType(json, { disableReuse: true });

    const entityAttributes = entityAnnotation.getFirst(back);
    expect(entityAttributes).not.toBeUndefined();
    if (entityAttributes) {
        expect(entityAttributes.name).toBe('user');
        expect(entityAttributes.collection).toBe('users');
        expect(entityAttributes.database).toBe('db');
        expect(entityAttributes.singleTableInheritance).toBe(undefined);
        expect(entityAttributes.indexes).toEqual([{ names: ['id'], options: { name: 'primary' } }]);
    }

    const reflection = ReflectionClass.from(back);
    expect(reflection1 !== reflection).toBe(true);

    expect(reflection.name).toBe('user');
    expect(reflection.collectionName).toBe('users');
    expect(reflection.databaseSchemaName).toBe('db');
    expect(reflection.singleTableInheritance).toBe(false);
    expect(reflection.indexes).toEqual([{ names: ['id'], options: { name: 'primary' } }]);
});

test('entity interface', () => {
    interface User extends Entity<{ name: 'user', collection: 'users', database: 'db', indexes: [{ names: ['id'], options: { name: 'primary' } }] }> {
        id: number;
    }

    const json = serializeType(typeOf<User>());
    const back = deserializeType(json, { disableReuse: true });

    const entityAttributes = entityAnnotation.getFirst(back);
    expect(entityAttributes).not.toBeUndefined();
    if (entityAttributes) {
        expect(entityAttributes.name).toBe('user');
        expect(entityAttributes.collection).toBe('users');
        expect(entityAttributes.database).toBe('db');
        expect(entityAttributes.singleTableInheritance).toBe(undefined);
        expect(entityAttributes.indexes).toEqual([{ names: ['id'], options: { name: 'primary' } }]);
    }
});

test('class constructor back serialized', () => {
    class User {
        id: number = 0;

        constructor(unused: string, public username: string) {
        }
    }

    const json = serializeType(typeOf<User>());
    const back = deserializeType(json, { disableReuse: true });

    const instance = deserialize({id: 2, username: 'Peter'}, undefined, undefined, undefined, back);
    expect(instance).toEqual({id: 2, username: 'Peter'});
});

test('class reference with entity options', () => {
    @entity.name('author')
    class Author {
        id: number & PrimaryKey = 0;
        firstName?: string;
    }

    class Book {
        author?: Author & Reference;
    }

    const json = serializeType(typeOf<Book>());
    const back = deserializeType(json, {disableReuse: true});
    assertType(back, ReflectionKind.class);
    const author = findMember('author', back.types);
    assertType(author, ReflectionKind.property);
    const authorReflection = ReflectionClass.from(author.type);
    expect(authorReflection.getName()).toBe('author');
    expect(authorReflection.getPrimary().name).toBe('id');

    expect(authorReflection.getProperty('firstName').isOptional()).toBe(true);
});

test('roundTrip class with generic parent (#241)', () => {
    class Entity<T = never> {
    }

    class MyEntity extends Entity<unknown> {
        id: number = 0;
    }

    const back = deserializeType(serializeType(reflect(MyEntity)), { disableReuse: true });
    assertType(back, ReflectionKind.class);
    expect(getClassName(back.classType)).toBe('MyEntity');
    expect(getClassName(Object.getPrototypeOf(back.classType))).toBe('Entity');
    expect(ReflectionClass.from(back).getPropertyNames()).toEqual(['id']);
});

test('roundTrip class with parent without runtime type (#241)', () => {
    const Parent = function Parent() {
    } as any as { new(): {} };
    delete (Parent as any).__type;

    class Child extends Parent {
        a: string = '';
    }

    const back = deserializeType(serializeType(reflect(Child)), { disableReuse: true });
    assertType(back, ReflectionKind.class);
    expect(ReflectionClass.from(back).getPropertyNames()).toEqual(['a']);

    //types serialized before the fix have a function as superClass
    const old: any = [
        { kind: ReflectionKind.class, classType: 'Child', types: [], superClass: 1 },
        { kind: ReflectionKind.function, parameters: [], return: 2 },
        { kind: ReflectionKind.any },
    ];
    expect(getClassName((deserializeType(old, { disableReuse: true }) as TypeClass).classType)).toBe('Child');
});
