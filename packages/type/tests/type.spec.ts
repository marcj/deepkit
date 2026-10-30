import { describe, expect, test } from '@jest/globals';
import {
    hasCircularReference,
    ReceiveType,
    reflect,
    ReflectionClass,
    reflectOrUndefined,
    resolveReceiveType,
    typeOf,
    visit,
} from '../src/reflection/reflection.js';
import {
    assertType,
    Embedded,
    Excluded,
    excludedAnnotation,
    findMember,
    Group,
    groupAnnotation,
    indexAccess,
    InlineRuntimeType,
    isSameType,
    PrimaryKey,
    primaryKeyAnnotation,
    ReflectionKind,
    ResetAnnotation,
    resolveTypeMembers,
    stringifyResolvedType,
    stringifyType,
    Type,
    typeAnnotation,
    TypeClass,
    TypeObjectLiteral,
    TypeProperty,
    typeToObject,
    UUID,
    validationAnnotation,
} from '../src/reflection/type.js';
import { isExtendable } from '../src/reflection/extends.js';
import { expectEqualType } from './utils.js';
import { ClassType, TypeAnnotation } from '@deepkit/core';
import { Partial } from '../src/changes.js';
import { MaxLength, MinLength } from '../src/validator.js';

//note: this needs to run in a strict TS mode to infer correctly in the IDE
type Extends<A, B> = [A] extends [B] ? true : false;

test('stringify primitives', () => {
    expect(stringifyType(typeOf<string>())).toBe('string');
    expect(stringifyType(typeOf<number>())).toBe('number');
    expect(stringifyType(typeOf<boolean>())).toBe('boolean');
    expect(stringifyType(typeOf<bigint>())).toBe('bigint');
    expect(stringifyType(typeOf<'a'>())).toBe(`'a'`);
    expect(stringifyType(typeOf<1>())).toBe(`1`);
    expect(stringifyType(typeOf<true>())).toBe(`true`);
});

test('stringify array', () => {
    expect(stringifyType(typeOf<string[]>())).toBe('Array<string>');
    expect(stringifyType(typeOf<number[]>())).toBe('Array<number>');
});

test('stringify date/set/map', () => {
    expect(stringifyType(typeOf<Date>())).toBe('Date');
    expect(stringifyType(typeOf<Map<string, number>>())).toBe('Map<string, number>');
    expect(stringifyType(typeOf<Set<string>>())).toBe('Set<string>');
});

test('type annotation', () => {
    type MyAnnotation = { __meta?: never & ['myAnnotation'] };
    type Username = string & MyAnnotation;
    const type = typeOf<Username>();
    const data = typeAnnotation.getType(type, 'myAnnotation');
    expect(data).toEqual(undefined);
});

test('type annotation non-flattening', () => {
    type MyAnnotation = { __meta?: never & ['myAnnotation'] };
    type Username = string & MyAnnotation;
    const type = typeOf<Username | string>();
    // we treat Annotation as unique types
    assertType(type, ReflectionKind.union);
    expect(type.types.length).toBe(2);
    expect(stringifyType(type)).toBe('Username | string');
});

test('type annotation with option', () => {
    type MyAnnotation<Option> = { __meta?: never & ['myAnnotation', Option] };
    type Username = string & MyAnnotation<string>;
    const type = typeOf<Username>();
    const data = typeAnnotation.getType(type, 'myAnnotation');
    expect(data).toMatchObject({ kind: ReflectionKind.string });
});

test('type annotation TypeAnnotation', () => {
    type MyAnnotation<Option> = TypeAnnotation<'myAnnotation', Option>;
    type Username = string & MyAnnotation<'yes'>;
    const type = typeOf<Username>();
    const data = typeAnnotation.getType(type, 'myAnnotation');
    expect(data).toMatchObject({ kind: ReflectionKind.literal });
    expect(typeToObject(data)).toBe('yes');
});

test('intersection same type', () => {
    expect(stringifyType(typeOf<string & string>())).toBe('string');
    expect(stringifyType(typeOf<number & number>())).toBe('number');

    type MyAnnotation = { __meta?: never & ['myAnnotation'] };
    type Username = string & MyAnnotation;
    expect(stringifyType(typeOf<string & Username>())).toBe('string');
    expect(stringifyType(typeOf<Username & string>())).toBe('Username');
});


test('intersection different primitive types', () => {
    // just testing a few cases as there would be quite a few combinations
    expect(stringifyType(typeOf<string & number>())).toBe('never');
    expect(stringifyType(typeOf<undefined & null>())).toBe('never');
    expect(stringifyType(typeOf<boolean & null>())).toBe('never');
    expect(stringifyType(typeOf<bigint & number>())).toBe('never');
    expect(stringifyType(typeOf<3 & 6>())).toBe('never');
});

test('intersection with never', () => {
    type A = never & Group<'a'>;
    type B = Group<'b'> & never;

    type ObjectID = never;
    type C = ObjectID & Group<'c'>;

    expect(groupAnnotation.getAnnotations(typeOf<A>())).toEqual(['a']);
    expect(groupAnnotation.getAnnotations(typeOf<B>())).toEqual(['b']);
    expect(groupAnnotation.getAnnotations(typeOf<C>())).toEqual(['c']);
});

test('intersection with unknown', () => {
    // T & unknown = T (unknown is absorbed in intersections, per TypeScript semantics)
    expect(stringifyType(typeOf<string & unknown>())).toBe('string');
    expect(stringifyType(typeOf<unknown & string>())).toBe('string');
    expect(stringifyType(typeOf<number & unknown>())).toBe('number');
    expect(stringifyType(typeOf<unknown & number>())).toBe('number');
    expect(stringifyType(typeOf<boolean & unknown>())).toBe('boolean');
    expect(stringifyType(typeOf<bigint & unknown>())).toBe('bigint');
    expect(stringifyType(typeOf<null & unknown>())).toBe('null');
    expect(stringifyType(typeOf<undefined & unknown>())).toBe('undefined');

    // object literal & unknown = object literal
    type MyObj = { a: string };
    expect(stringifyType(typeOf<MyObj & unknown>())).toBe('MyObj');
    expect(stringifyType(typeOf<unknown & MyObj>())).toBe('MyObj');

    // class & unknown = class
    class MyClass { name!: string; }
    expect(stringifyType(typeOf<MyClass & unknown>())).toBe('MyClass');
    expect(stringifyType(typeOf<unknown & MyClass>())).toBe('MyClass');

    // unknown & unknown = unknown
    expect(stringifyType(typeOf<unknown & unknown>())).toBe('unknown');
});

test('intersection same type keep annotation', () => {
    type MyAnnotation = { __meta?: never & ['myAnnotation'] };
    type Username = string & MyAnnotation;
    {
        const type = typeOf<string & Username>();
        const data = typeAnnotation.getType(type, 'myAnnotation');
        expect(data).toEqual(undefined);
    }
    {
        const type = typeOf<string & string & Username>();
        const data = typeAnnotation.getType(type, 'myAnnotation');
        expect(data).toEqual(undefined);
    }
    {
        const type = typeOf<Username & string>();
        const data = typeAnnotation.getType(type, 'myAnnotation');
        expect(data).toEqual(undefined);
    }
    {
        const type = typeOf<Username & string & string>();
        const data = typeAnnotation.getType(type, 'myAnnotation');
        expect(data).toEqual(undefined);
    }
});

test('intersection simply overrides properties', () => {
    interface User {
        username: string;
        password: string;
    }

    type t = User & { password: void };
    const type = typeOf<t>();
    assertType(type, ReflectionKind.objectLiteral);
    const password = findMember('password', type.types);
    assertType(password, ReflectionKind.propertySignature);
    assertType(password.type, ReflectionKind.void);

    type t1 = User & { readonly password?: string };
    const type1 = typeOf<t1>() as TypeObjectLiteral;
    const password1 = findMember('password', type1.types) as TypeProperty;
    expect(password1.optional).toBe(true);
    expect(password1.readonly).toBe(true);
});

test('copy index access', () => {
    interface User {
        password: string & MinLength<6> & MaxLength<30>;
    }

    interface UserCreationPayload {
        password: User['password'] & Group<'a'>;
    }

    const type = typeOf<UserCreationPayload>();

    assertType(type, ReflectionKind.objectLiteral);
    const password = findMember('password', type.types);
    assertType(password, ReflectionKind.propertySignature);
    assertType(password.type, ReflectionKind.string);
    const validations = validationAnnotation.getAnnotations(password.type);
    expect(validations[0].name).toBe('minLength');
    expect(validations[1].name).toBe('maxLength');
    const groups = groupAnnotation.getAnnotations(password.type);
    expect(groups[0]).toBe('a');
});

test('reset primary decorator', () => {
    interface User {
        id: number & PrimaryKey;
    }

    interface UserCreationPayload {
        id: User['id'] & ResetAnnotation<'primaryKey'>;
    }

    const type = typeOf<UserCreationPayload>();
    assertType(type, ReflectionKind.objectLiteral);
    const id = findMember('id', type.types);
    assertType(id, ReflectionKind.propertySignature);
    assertType(id.type, ReflectionKind.number);
    expect(primaryKeyAnnotation.isPrimaryKey(id.type)).toBe(false);
});

test('reset type annotation', () => {
    interface User {
        password: string & MinLength<6> & Excluded<'json'>;
    }

    interface UserCreationPayload {
        password: User['password'] & Group<'a'> & ResetAnnotation<'excluded'>;
    }

    {
        const type = typeOf<UserCreationPayload>();
        assertType(type, ReflectionKind.objectLiteral);
        const password = findMember('password', type.types);
        assertType(password, ReflectionKind.propertySignature);
        assertType(password.type, ReflectionKind.string);
        const validations = validationAnnotation.getAnnotations(password.type);
        expect(validations[0].name).toBe('minLength');
        const groups = groupAnnotation.getAnnotations(password.type);
        expect(groups[0]).toBe('a');
        expect(excludedAnnotation.isExcluded(password.type, 'json')).toBe(false);
    }

    {
        const type = typeOf<User>();
        assertType(type, ReflectionKind.objectLiteral);
        const password = findMember('password', type.types);
        assertType(password, ReflectionKind.propertySignature);
        assertType(password.type, ReflectionKind.string);
        const validations = validationAnnotation.getAnnotations(password.type);
        expect(validations[0].name).toBe('minLength');
        const groups = groupAnnotation.getAnnotations(password.type);
        expect(groups).toEqual([]);
        expect(excludedAnnotation.isExcluded(password.type, 'json')).toBe(true);
    }
});

test('type alias preserved', () => {
    type MyString = string;
    expect(stringifyType(typeOf<MyString>())).toBe('MyString');

    expect(stringifyType(typeOf<UUID>())).toBe('UUID');
});

test('stringify', () => {
    expect(stringifyResolvedType(typeOf<any & {}>())).toBe(`any`);
});

test('stringify class', () => {
    class User {
        id!: number;
        username!: string;
    }

    expect(stringifyResolvedType(typeOf<User>())).toBe(`User {\n  id: number;\n  username: string;\n}`);
    expect(stringifyResolvedType(typeOf<Partial<User>>())).toBe(`Partial {\n  id?: number;\n  username?: string;\n}`);
    expect(stringifyType(typeOf<Partial<User>>())).toBe(`Partial<User>`);
});

test('stringify class generic', () => {
    class User<T> {
        id!: number;
        username!: T;
    }

    expect(stringifyResolvedType(typeOf<User<string>>())).toBe(`User {\n  id: number;\n  username: string;\n}`);
    expect(stringifyType(typeOf<User<string>>())).toBe(`User<string>`);
});

test('stringify interface', () => {
    interface User {
        id: number;
        username: string;
    }

    expect(stringifyResolvedType(typeOf<User>())).toBe(`User {\n  id: number;\n  username: string;\n}`);
});

test('stringify nested class', () => {
    class Config {
        color!: number;
    }

    class User {
        id!: number;
        username?: string;
        config!: Config;
    }

    expect(stringifyResolvedType(typeOf<User>())).toBe(`User {\n  id: number;\n  username?: string;\n  config: Config {color: number};\n}`);
});

test('stringify nested interface', () => {
    interface Config {
        color: number;
    }

    interface User {
        id: number;
        username?: string;
        config: Config;
    }

    expect(stringifyResolvedType(typeOf<User>())).toBe(`User {\n  id: number;\n  username?: string;\n  config: Config {color: number};\n}`);
});

function validExtend<A, B>(a?: ReceiveType<A>, b?: ReceiveType<B>) {
    const aType = resolveReceiveType(a);
    const bType = resolveReceiveType(b);
    expect(isExtendable(aType, bType)).toBe(true);
}

function invalidExtend<A, B>(a?: ReceiveType<A>, b?: ReceiveType<B>) {
    const aType = resolveReceiveType(a);
    const bType = resolveReceiveType(b);
    expect(isExtendable(aType, bType)).toBe(false);
}

test('extendability union', () => {
    validExtend<'a', number | string>();
    validExtend<null, null | undefined>();
    validExtend<undefined, null | undefined>();
    invalidExtend<string, null | undefined>();
});

test('promise', () => {
    validExtend<Promise<void>, Promise<void>>();
    validExtend<Promise<string>, Promise<string>>();
    invalidExtend<Promise<string>, Promise<number>>();
    invalidExtend<Promise<string>, never>();
    validExtend<never, Promise<void>>();
    validExtend<any, Promise<void>>();
    validExtend<Promise<void>, any>();
});

test('interface with method', () => {
    interface Connection {
        id: number;

        write(data: Uint16Array): void;
    }

    class MyConnection implements Connection {
        id: number = 0;

        write(data: Uint16Array): void {
        }

        additional(): void {

        }
    }

    validExtend<{ id: number, write(data: Uint16Array): void }, Connection>();
    invalidExtend<{ id: number }, Connection>();
    validExtend<MyConnection, Connection>();

    type t1 = { id: number, write(data: Uint32Array): void } extends Connection ? true : false;
    type t2 = { id: number, write(): void } extends Connection ? true : false;

    invalidExtend<{ id: number, write(data: Uint32Array): void }, Connection>();
    validExtend<{ id: number, write(): void }, Connection>();
    invalidExtend<Connection, { id: number, write(): void }>();

    class SubUint16Array extends Uint16Array {
    }

    validExtend<Connection, { id: number, write(data: SubUint16Array): void }>();
});

test('extends Date', () => {
    validExtend<{}, Date>();
    invalidExtend<{ y: string }, Date>();
});

test('readonly constructor properties', () => {
    class Pilot {
        constructor(readonly name: string, readonly age: number) {
        }
    }

    const reflection = ReflectionClass.from(Pilot);
    expect(reflection.getProperty('name').type.kind).toBe(ReflectionKind.string);
    expect(reflection.getProperty('age').type.kind).toBe(ReflectionKind.number);

    expect(stringifyResolvedType(typeOf<Pilot>())).toBe(`Pilot {
  constructor(readonly name: string, readonly age: number);
  readonly name: string;
  readonly age: number;
}`);
});

test('class with statics', () => {
    class PilotId {
        public static readonly none: PilotId = new PilotId(0);

        constructor(public readonly value: number) {
        }

        static from(value: number) {
            return new PilotId(value);
        }
    }

    expect(stringifyResolvedType(typeOf<PilotId>())).toContain(`constructor(readonly value: number);
  readonly value: number;
  static from(value: number): any;`);
});

test('extendability constructor', () => {
    type c = abstract new (...args: any) => any;

    class User {
        constructor() {
        }
    }

    class Setting {
        constructor(public key: string, public value: any) {
        }
    }

    validExtend<any, c>();
    validExtend<User, c>();
    validExtend<Setting, c>();
    invalidExtend<string, c>();
    invalidExtend<string, c>();

    type c2 = new (key: string, value: any) => any;
    type c3 = typeof User extends c2 ? true : false;
    type c4 = typeof Setting extends c2 ? true : false;

    type d1 = new () => any;
    type d2 = typeof User extends d1 ? true : false;
    type d3 = typeof Setting extends d1 ? true : false;

    // type d2 = (key: string, value: any) => any;
    // type d3 = (() => void) extends d2 ? true : false;

    validExtend<Setting, c2>();
    invalidExtend<User, c2>();
});

test('extendability function', () => {
    validExtend<(a: string) => void, (a: string) => void>();
    validExtend<(a: string) => void, (...args: any[]) => void>();

    type f1 = ((a: string) => void) extends ((a: string, b: string) => void) ? true : false;
    validExtend<(a: string) => void, (a: string, b: string) => void>();


    type f2 = ((a: string, b: string) => void) extends ((a: string) => void) ? true : false;
    invalidExtend<(a: string, b: string) => void, (a: string) => void>();

    validExtend<() => void, (a: string) => void>();
});

test('extendability', () => {
    validExtend<string, string>();
    validExtend<'a', string>();
    invalidExtend<23, string>();
    invalidExtend<true, string>();
    invalidExtend<boolean, string>();
    invalidExtend<number, string>();

    validExtend<number, number>();
    validExtend<34, number>();
    validExtend<-34, number>();

    validExtend<boolean, boolean>();
    validExtend<true, boolean>();
    validExtend<false, boolean>();

    validExtend<string, any>();
    validExtend<[string], any>();
    validExtend<boolean, any>();
    validExtend<{ a: string }, any>();
    validExtend<never, any>();

    type a1 = Extends<never, any>;
    type a11 = Extends<never, unknown>;
    type a12 = Extends<never, object>;
    type a13 = Extends<never, void>;
    type a14 = Extends<never, undefined>;
    type a15 = Extends<never, never>;
    type a16 = Extends<never, null>;
    type a17 = Extends<never, string>;
    type a18 = Extends<never, {}>;
    type a181 = Extends<never, { a: string }>;
    type a19 = Extends<never, User>;
    validExtend<never, any>();
    validExtend<never, unknown>();
    validExtend<never, object>();
    validExtend<never, void>();
    validExtend<never, undefined>();
    validExtend<never, never>();
    validExtend<never, null>();
    validExtend<never, string>();
    validExtend<never, number>();
    validExtend<never, boolean>();
    validExtend<never, bigint>();
    validExtend<never, symbol>();
    validExtend<never, {}>();
    validExtend<never, { a: string }>();
    validExtend<never, User>();

    type a2 = Extends<null, any>;
    type a21 = Extends<null, unknown>;
    type a22 = Extends<null, object>;
    type a23 = Extends<null, void>;
    type a24 = Extends<null, undefined>;
    type a25 = Extends<null, never>;
    type a26 = Extends<null, null>;
    type a27 = Extends<null, string>;
    type a28 = Extends<null, {}>;
    type a288 = Extends<null, { a: string }>;
    type a29 = Extends<null, User>;
    validExtend<null, any>();
    validExtend<null, unknown>();
    invalidExtend<null, object>();
    invalidExtend<null, void>();
    invalidExtend<null, undefined>();
    invalidExtend<null, never>();
    validExtend<null, null>();
    invalidExtend<null, string>();
    invalidExtend<null, number>();
    invalidExtend<null, boolean>();
    invalidExtend<null, bigint>();
    invalidExtend<null, symbol>();
    invalidExtend<null, {}>();
    invalidExtend<null, { a: string }>();
    invalidExtend<null, User>();

    type a3 = Extends<undefined, any>;
    type a31 = Extends<undefined, unknown>;
    type a32 = Extends<undefined, object>;
    type a33 = Extends<undefined, void>;
    type a34 = Extends<undefined, undefined>;
    type a35 = Extends<undefined, never>;
    type a36 = Extends<undefined, null>;
    type a37 = Extends<undefined, string>;
    type a38 = Extends<undefined, {}>;
    type a388 = Extends<undefined, { a: string }>;
    type a39 = Extends<undefined, User>;
    validExtend<undefined, any>();
    validExtend<undefined, unknown>();
    invalidExtend<undefined, object>();
    validExtend<undefined, void>();
    validExtend<undefined, undefined>();
    invalidExtend<undefined, never>();
    invalidExtend<undefined, null>();
    invalidExtend<undefined, string>();
    invalidExtend<undefined, number>();
    invalidExtend<undefined, boolean>();
    invalidExtend<undefined, bigint>();
    invalidExtend<undefined, symbol>();
    invalidExtend<undefined, {}>();
    invalidExtend<undefined, { a: string }>();
    invalidExtend<undefined, User>();

    type a4 = Extends<void, any>;
    type a41 = Extends<void, unknown>;
    type a42 = Extends<void, object>;
    type a43 = Extends<void, void>;
    type a44 = Extends<void, undefined>;
    type a45 = Extends<void, never>;
    type a46 = Extends<void, null>;
    type a47 = Extends<void, string>;
    type a48 = Extends<void, {}>;
    type a488 = Extends<void, { a: string }>;
    type a49 = Extends<void, User>;
    validExtend<void, any>();
    validExtend<void, unknown>();
    invalidExtend<void, object>();
    validExtend<void, void>();
    invalidExtend<void, undefined>();
    invalidExtend<void, never>();
    invalidExtend<void, null>();
    invalidExtend<void, string>();
    invalidExtend<void, number>();
    invalidExtend<void, boolean>();
    invalidExtend<void, bigint>();
    invalidExtend<void, symbol>();
    invalidExtend<void, {}>();
    invalidExtend<void, { a: string }>();
    invalidExtend<void, User>();

    type a5 = Extends<object, any>;
    type a51 = Extends<object, unknown>;
    type a52 = Extends<object, object>;
    type a53 = Extends<object, void>;
    type a54 = Extends<object, undefined>;
    type a55 = Extends<object, never>;
    type a56 = Extends<object, null>;
    type a57 = Extends<object, string>;
    type a58 = Extends<object, {}>;
    type a588 = Extends<object, { a: string }>;
    type a59 = Extends<object, User>;
    type a599 = Extends<object, EmptyEntity>;
    validExtend<object, any>();
    validExtend<object, unknown>();
    validExtend<object, object>();
    invalidExtend<object, void>();
    invalidExtend<object, undefined>();
    invalidExtend<object, never>();
    invalidExtend<object, null>();
    invalidExtend<object, string>();
    invalidExtend<object, number>();
    invalidExtend<object, boolean>();
    invalidExtend<object, bigint>();
    invalidExtend<object, symbol>();
    validExtend<object, {}>();
    invalidExtend<object, { a: string }>();
    invalidExtend<object, User>();
    validExtend<object, EmptyEntity>();

    type a6 = Extends<unknown, any>;
    type a61 = Extends<unknown, unknown>;
    type a62 = Extends<unknown, object>;
    type a63 = Extends<unknown, void>;
    type a64 = Extends<unknown, undefined>;
    type a65 = Extends<unknown, never>;
    type a66 = Extends<unknown, null>;
    type a67 = Extends<unknown, string>;
    type a68 = Extends<unknown, {}>;
    type a688 = Extends<unknown, { a: string }>;
    type a69 = Extends<unknown, User>;
    validExtend<unknown, any>();
    validExtend<unknown, unknown>();
    invalidExtend<unknown, object>();
    invalidExtend<unknown, void>();
    invalidExtend<unknown, undefined>();
    invalidExtend<unknown, never>();
    invalidExtend<unknown, null>();
    invalidExtend<unknown, string>();
    invalidExtend<unknown, number>();
    invalidExtend<unknown, boolean>();
    invalidExtend<unknown, bigint>();
    invalidExtend<unknown, symbol>();
    invalidExtend<unknown, {}>();
    invalidExtend<unknown, { a: string }>();
    invalidExtend<unknown, User>();

    type a7 = Extends<any, any>;
    type a71 = Extends<any, unknown>;
    type a72 = Extends<any, object>;
    type a73 = Extends<any, void>;
    type a74 = Extends<any, undefined>;
    type a75 = Extends<any, never>;
    type a76 = Extends<any, null>;
    type a77 = Extends<any, string>;
    type a78 = Extends<any, {}>;
    type a788 = Extends<any, { a: string }>;
    type a79 = Extends<any, User>;
    type a799 = Extends<any, EmptyEntity>;
    validExtend<any, any>();
    validExtend<any, unknown>();
    validExtend<any, object>();
    validExtend<any, void>();
    validExtend<any, undefined>();
    invalidExtend<any, never>();
    validExtend<any, null>();
    validExtend<any, string>();
    validExtend<any, number>();
    validExtend<any, boolean>();
    validExtend<any, bigint>();
    validExtend<any, symbol>();
    validExtend<any, {}>();
    validExtend<any, { a: string }>();
    validExtend<any, User>();

    type a8 = Extends<{}, any>;
    type a81 = Extends<{}, unknown>;
    type a82 = Extends<{}, object>;
    type a83 = Extends<{}, void>;
    type a84 = Extends<{}, undefined>;
    type a85 = Extends<{}, never>;
    type a86 = Extends<{}, null>;
    type a87 = Extends<{}, string>;
    type a88 = Extends<{}, {}>;
    type a888 = Extends<{}, { a: string }>;
    type a89 = Extends<{}, User>;
    type a899 = Extends<{}, EmptyEntity>;
    validExtend<{}, any>();
    validExtend<{}, unknown>();
    validExtend<{}, object>();
    invalidExtend<{}, void>();
    invalidExtend<{}, undefined>();
    invalidExtend<{}, never>();
    invalidExtend<{}, null>();
    invalidExtend<{}, string>();
    invalidExtend<{}, number>();
    invalidExtend<{}, boolean>();
    invalidExtend<{}, bigint>();
    invalidExtend<{}, symbol>();
    validExtend<{}, {}>();
    invalidExtend<{}, { a: string }>();
    invalidExtend<{}, User>();
    validExtend<{}, EmptyEntity>();

    type a9 = Extends<`a${string}`, any>;
    type a91 = Extends<`a${string}`, unknown>;
    type a911 = Extends<`${string}`, unknown>;
    type a912 = Extends<string, unknown>;
    type a92 = Extends<`a${string}`, object>;
    type a93 = Extends<`a${string}`, void>;
    type a94 = Extends<`a${string}`, undefined>;
    type a95 = Extends<`a${string}`, never>;
    type a96 = Extends<`a${string}`, null>;
    type a97 = Extends<`a${string}`, string>;
    type a971 = Extends<`a${string}`, number>;
    type a98 = Extends<`a${string}`, {}>;
    type a988 = Extends<`a${string}`, { a: string }>;
    type a99 = Extends<`a${string}`, User>;
    type a999 = Extends<`a${string}`, EmptyEntity>;
    validExtend<`a${string}`, any>();
    validExtend<`a${string}`, unknown>();
    validExtend<`${string}`, unknown>();
    validExtend<string, unknown>();
    invalidExtend<`a${string}`, object>();
    invalidExtend<`a${string}`, void>();
    invalidExtend<`a${string}`, undefined>();
    invalidExtend<`a${string}`, never>();
    invalidExtend<`a${string}`, null>();
    validExtend<`a${string}`, string>();
    invalidExtend<`a${string}`, number>();
    invalidExtend<`a${string}`, boolean>();
    invalidExtend<`a${string}`, bigint>();
    invalidExtend<`a${string}`, symbol>();
    validExtend<`a${string}`, {}>();
    invalidExtend<`a${string}`, { a: string }>();
    invalidExtend<`a${string}`, User>();
    validExtend<`a${string}`, EmptyEntity>();

    type b9 = Extends<any, `a${string}`>;
    type b91 = Extends<unknown, `a${string}`>;
    type b92 = Extends<object, `a${string}`>;
    type b93 = Extends<void, `a${string}`>;
    type b94 = Extends<undefined, `a${string}`>;
    type b95 = Extends<never, `a${string}`>;
    type b96 = Extends<null, `a${string}`>;
    type b97 = Extends<string, `a${string}`>;
    type b971 = Extends<number, `a${string}`>;
    type b98 = Extends<{}, `a${string}`>;
    type b988 = Extends<{ a: string }, `a${string}`>;
    type b99 = Extends<User, `a${string}`>;
    type b999 = Extends<EmptyEntity, `a${string}`>;
    validExtend<any, `a${string}`>();
    invalidExtend<unknown, `a${string}`>();
    invalidExtend<unknown, `${string}`>();
    invalidExtend<object, `a${string}`>();
    invalidExtend<void, `a${string}`>();
    invalidExtend<undefined, `a${string}`>();
    validExtend<never, `a${string}`>();
    invalidExtend<null, `a${string}`>();
    invalidExtend<string, `a${string}`>();
    invalidExtend<number, `a${string}`>();
    invalidExtend<boolean, `a${string}`>();
    invalidExtend<bigint, `a${string}`>();
    invalidExtend<symbol, `a${string}`>();
    invalidExtend<{}, `a${string}`>();
    invalidExtend<{ a: string }, `a${string}`>();
    invalidExtend<User, `a${string}`>();
    invalidExtend<EmptyEntity, `a${string}`>();

    type c9 = Extends<string, unknown>;
    type c91 = Extends<number, unknown>;
    type c92 = Extends<boolean, unknown>;
    type c93 = Extends<any, unknown>;
    type c94 = Extends<{}, unknown>;
    type c95 = Extends<User, unknown>;
    type c96 = Extends<{ a: string }, unknown>;
    type c97 = Extends<object, unknown>;
    type c98 = Extends<null, unknown>;
    type c99 = Extends<undefined, unknown>;
    type c100 = Extends<never, unknown>;
    validExtend<string, unknown>();
    validExtend<number, unknown>();
    validExtend<boolean, unknown>();
    validExtend<string, unknown>();
});

test('template literal basics', () => {
    expectEqualType(typeOf<`${string}`>(), typeOf<string>());
    expectEqualType(typeOf<`${number}`>(), typeOf<`${number}`>());
    expectEqualType(typeOf<`${1}`>(), typeOf<'1'>());
    expectEqualType(typeOf<`${true}`>(), typeOf<'true'>());
    expectEqualType(typeOf<`${boolean}`>(), typeOf<'false' | 'true'>());
});

test('literal extends template literal', () => {
    validExtend<string, `${string}`>();
    invalidExtend<string, `a${string}`>();
    validExtend<`a${string}`, string>();

    type b1 = Extends<'abc', `a${string}`>;
    type b2 = Extends<'abc', `a${string}bc`>;
    type b3 = Extends<'abc', `a${string}c`>;
    type c1 = Extends<'abc', `a${number}`>;
    type c2 = Extends<'a2', `a${number}`>;
    type c3 = Extends<'a2e4s', `a${number}s`>;
    type c4 = Extends<'a2.34s', `a${number}s`>;
    type c5 = Extends<'2.34s', `${number}${string}`>;

    validExtend<'abc', `a${string}`>();
    validExtend<'abc', `a${string}bc`>();
    validExtend<'abc', `a${string}c`>();

    invalidExtend<'abc', `a${number}`>();
    validExtend<'a2', `a${number}`>();
    validExtend<'a2e4s', `a${number}s`>();
    validExtend<'a2.34s', `a${number}s`>();
    validExtend<'2.34s', `${number}${string}`>();

    validExtend<'abc', `a${string}c`>();
});

test('template literal extends literal', () => {
    type a0 = `a${string}` extends '' ? true : false;
    type a1 = `${string}` extends 'asd' ? true : false;

    invalidExtend<`a${string}`, ''>();
    invalidExtend<`${string}`, ''>();
    invalidExtend<`${string}`, 'asd'>();
});

test('template literal extends template literal', () => {
    // type a0 = Extends<`a${'abc'}`, `aabc`>;
    // type a1 = Extends<`a${string}`, `a${string}`>;
    // type a2 = Extends<`a${string}`, `${'1' | ''}a${string}`>;
    // type a3 = Extends<`abcd`, `a${string}b${string}`>;
    //
    // type d1 = `a${number}${number}${string}d` extends `a${infer A}${infer B}d` ? [A, B] : never;
    // type d2 = `a${number}${number}${string}d` extends `a${string}${string}d` ? true : never;
    // type d3 = `a122` extends `a${infer A}${infer B}` ? [A, B] : never;
    // type d4 = `123` extends `${infer S}${number}` ? [S] : never;
    // type d5 = `!abc123` extends `${infer S}${number}` ? [S] : never;
    // type d6 = `a1b` extends `${infer T1}${number}${infer T3}` ? [T1, 'number', T3] : never;
    // type d7 = `a123` extends `${string}${number}${infer T1}${number}` ? T1 : never;
    //
    // type d123 = `abc${string}3` extends `a${infer T1}${infer T2}` ? [T1, T2] : never;
    //
    // type d8 = `1234` extends `${number}${infer T1}${number}` ? T1 : never;
    // type d9 = `2234` extends `${number}${infer T1}${number}` ? T1 : never;
    // type d90 = `2234` extends `${number}${infer T1}${infer T2}` ? T1 : never;
    // type d901 = `1322234` extends `${number}2${infer T1}` ? T1 : never;
    //
    // type d91 = `1133` extends `${infer T1}${string}${number}` ? T1 extends `${number}` ? T1 : never : never;
    // type d92 = `1133` extends `${number}${string}${number}` ? true : never;
    //
    // type d10 = `112233` extends `${number}${infer T1}${number}` ? T1 : never;
    // type e1 = `${number}a${string}` extends `${string}a${infer T}` ? T : never;

    validExtend<`a${string}`, `a${string}`>();
    expect(stringifyType(typeOf<`${'1' | ''}a${string}`>())).toEqual('`1a${string}` | `a${string}`');
    validExtend<`a${string}`, `${'1' | ''}a${string}`>();
    invalidExtend<`a${string}`, `${'1' | '0'}a${string}`>();
    validExtend<`1a${string}`, `${'1' | '0'}a${string}`>();
    validExtend<`0a${string}`, `${'1' | '0'}a${string}`>();

    type e1 = `abcd${string}` extends `ab${infer T1}` ? T1 : never;
    expect(stringifyResolvedType(typeOf<e1>())).toEqual('`cd${string}`');

    type e2 = `abcd${string}` extends `ab${string}${infer T1}` ? T1 : never;
    expect(stringifyResolvedType(typeOf<e2>())).toEqual('`d${string}`');
});

test('template literal infer', () => {
    type a1 = 'abc' extends `a${infer T}` ? T : never;
    expectEqualType(typeOf<a1>(), typeOf<'bc'>() as any, { noTypeNames: true });

    type a2 = 'abcd' extends `a${infer T}${infer T2}` ? [T, T2] : never;
    expectEqualType(typeOf<a2>(), typeOf<['b', 'cd']>() as any, { noTypeNames: true });

    type a3 = 'abcd' extends `a${string}${infer T2}` ? T2 : never;
    expectEqualType(typeOf<a3>(), typeOf<'cd'>() as any, { noTypeNames: true });

    type TN<T> = T extends `a${number}` ? T extends `a${infer T}` ? T : never : never;
    type e1 = TN<`a123.4`>;
    expectEqualType(typeOf<e1>(), typeOf<'123.4'>() as any, { noTypeNames: true });
});

test('tuple indexAccess', () => {
    expect(indexAccess(typeOf<[string]>(), { kind: ReflectionKind.literal, literal: 0 })).toMatchObject({ kind: ReflectionKind.string });
    expect(indexAccess(typeOf<[string]>(), { kind: ReflectionKind.literal, literal: 1 })).toMatchObject({ kind: ReflectionKind.undefined });
    expect(indexAccess(typeOf<[string, string]>(), { kind: ReflectionKind.literal, literal: 1 })).toMatchObject({ kind: ReflectionKind.string });
    expect(indexAccess(typeOf<[string, number]>(), { kind: ReflectionKind.literal, literal: 1 })).toMatchObject({ kind: ReflectionKind.number });
    expectEqualType(indexAccess(typeOf<[string, ...number[], boolean]>(), { kind: ReflectionKind.literal, literal: 1 }), {
        kind: ReflectionKind.union, types: [{ kind: ReflectionKind.number }, { kind: ReflectionKind.boolean }],
    });
    expectEqualType(indexAccess(typeOf<[string, ...(number | undefined)[]]>(), { kind: ReflectionKind.literal, literal: 1 }), {
        kind: ReflectionKind.union, types: [{ kind: ReflectionKind.number }, { kind: ReflectionKind.undefined }],
    });
    expectEqualType(indexAccess(typeOf<[string, number?]>(), { kind: ReflectionKind.literal, literal: 1 }), {
        kind: ReflectionKind.union, types: [{ kind: ReflectionKind.number }, { kind: ReflectionKind.undefined }],
    });
});

test('parent object literal', () => {
    interface C {
        a: string;
    }

    const t1 = typeOf<C>();
    assertType(t1, ReflectionKind.objectLiteral);
    assertType(t1.types[0], ReflectionKind.propertySignature);
    expect(t1.types[0].parent).toBe(t1);

    const t2 = typeOf<C[] | string[]>();
    assertType(t2, ReflectionKind.union);
    assertType(t2.types[0], ReflectionKind.array);
    assertType(t2.types[0].type, ReflectionKind.objectLiteral);
    assertType(t2.types[0].type.types[0], ReflectionKind.propertySignature);
    expect(t2.types[0].parent).toBe(t2);
    expect(t2.types[0].type.parent).toBe(t2.types[0]);
    expect(t2.types[0].type.types[0].parent).toBe(t1);
});

test('parent object literal from fn', () => {
    interface C {
        a: string;
    }

    type t<T> = T;
    const tc = typeOf<C>();
    assertType(tc, ReflectionKind.objectLiteral);
    assertType(tc.types[0], ReflectionKind.propertySignature);

    const t1 = typeOf<t<C>>();
    expect(tc === t1).toBe(false);

    assertType(t1, ReflectionKind.objectLiteral);
    assertType(t1.types[0], ReflectionKind.propertySignature);

    expect(tc.types[0].parent === tc).toBe(true);
    //this is true since `t<T>` returns a new reference of T, not the exact same instance (so decorators can safely be attached etc)
    expect(t1.types[0].parent === t1).toBe(false);
});

test('parent class from fn', () => {
    class C {
        a!: string;
    }

    type t<T> = T;
    const tc = typeOf<C>();
    const t1 = typeOf<t<C>>();
    expect(tc === t1).toBe(false);

    assertType(t1, ReflectionKind.class);
    assertType(t1.types[0], ReflectionKind.property);

    //this is true since `t<T>` returns a new reference of T, not the exact same instance (so decorators can safely be attached etc)
    expect(t1.types[0].parent !== t1).toBe(true);
});

test('parent embedded', () => {
    interface C {
        a: string;
    }

    const t1 = typeOf<{ a: Embedded<C> }>();
    assertType(t1, ReflectionKind.objectLiteral);
    assertType(t1.types[0], ReflectionKind.propertySignature);
    expect(t1.types[0].parent).toBe(t1);
    assertType(t1.types[0].type, ReflectionKind.objectLiteral);
    expect(t1.types[0].type.parent).toBe(t1.types[0]);
});

test('enum extends', () => {
    enum EnumA {
        a, b, c
    }

    enum EnumB {
        a, b, c, d
    }

    validExtend<EnumA, EnumA>();
    invalidExtend<EnumA, EnumB>();
    invalidExtend<EnumB, EnumA>();
});

test('circular extends', () => {
    interface LoggerInterface {
        scoped(name: string): LoggerInterface;
    }

    interface Another {
        scoped(name: string): Another;

        method(): Another;
    }

    validExtend<LoggerInterface, LoggerInterface>();
    invalidExtend<LoggerInterface, Another>();
    validExtend<Another, LoggerInterface>();
});

test('union extends', () => {
    validExtend<string | number, string | number>();
});

test('extends regexp', () => {
    validExtend<RegExp, RegExp>();
});

test('extends complex type', () => {
    const type = typeOf<Type>();

    class Validation {
        constructor(public message: string, public type?: Type) {
        }
    }

    const member = findMember('type', (reflect(Validation) as TypeClass).types) as TypeProperty;
    expect(isSameType(type, member.type)).toBe(true);
    expect(isExtendable(type, member.type)).toBe(true);
});

test('tuple extends', () => {
    validExtend<[string], [string]>();
    invalidExtend<[], [string]>();
    validExtend<[string], []>();
    expect(isExtendable(typeOf<[string, number]>(), { kind: ReflectionKind.tuple, types: [] })).toBe(true);
    validExtend<[string], [...string[]]>();

    validExtend<[string, number], [...string[], number]>();
    validExtend<[string, string, number], [...string[], number]>();
    validExtend<[...string[], number], [...string[], number]>();

    validExtend<[number, string], [number, ...string[]]>();
    validExtend<[number, string, string], [number, ...string[]]>();
    validExtend<[number, ...string[]], [number, ...string[]]>();

    validExtend<[...string[], number], [...string[], number]>();
    validExtend<[...string[]], [...string[], number]>();
    validExtend<[...(string | number)[]], [...string[], number]>();

    invalidExtend<[boolean, string], [number, ...string[]]>();
    invalidExtend<[boolean], [number, ...string[]]>();
    invalidExtend<[boolean], [number]>();
    invalidExtend<[boolean], [boolean, boolean]>();
    validExtend<[...boolean[]], [boolean, boolean]>();

    validExtend<[...boolean[]], boolean[]>();
    validExtend<[boolean], boolean[]>();
    validExtend<[boolean, boolean], boolean[]>();
    validExtend<[boolean, boolean], (boolean | undefined)[]>();
    validExtend<[boolean, boolean, undefined], (boolean | undefined)[]>();
    validExtend<[boolean, boolean?], (boolean | undefined)[]>();

    validExtend<boolean[], [...boolean[]]>();
    invalidExtend<boolean[], [boolean]>();
    invalidExtend<(boolean | undefined)[], [boolean]>();
    validExtend<(boolean | undefined)[], [boolean?]>();
});

test('enum as literal type', () => {
    enum MessageType {
        add,
        delete,
    }

    interface MessageDelete {
        type: MessageType.delete,
        id: number;
    }

    const type = typeOf<MessageDelete>();
    console.log('type', type);
    expect(type).toMatchObject({
        annotations: {},
        typeName: 'MessageDelete',
        kind: ReflectionKind.objectLiteral, types: [
            { kind: ReflectionKind.propertySignature, name: 'type', type: { kind: ReflectionKind.literal, literal: 1 } },
            { kind: ReflectionKind.propertySignature, name: 'id', type: { kind: ReflectionKind.number } },
        ],
    } as TypeObjectLiteral as any);
});

test('class extends interface', () => {
    interface LoggerInterface {
        log(): boolean;
    }

    class Logger {
        constructor(verbose: boolean) {
        }

        log(): boolean {
            return true;
        }
    }

    class Logger2 {
        constructor(nothing: string) {
        }

        log(): boolean {
            return true;
        }
    }

    type t = Logger extends LoggerInterface ? true : false;
    type t2 = LoggerInterface extends Logger ? true : false;
    type t3 = Logger2 extends Logger ? true : false;
    type t4 = ClassType<Logger> extends ClassType<Logger2> ? true : false;

    validExtend<LoggerInterface, Logger>();
    validExtend<Logger, LoggerInterface>();
    validExtend<Logger, Logger2>();
    validExtend<Logger2, Logger>();
    validExtend<ClassType<Logger>, ClassType<Logger2>>();
});

test('InlineRuntimeType', () => {
    class User {
        id: number = 0;
    }

    const schema = ReflectionClass.from(User);
    type SchemaType = InlineRuntimeType<typeof schema>;
    const type = typeOf<SchemaType>();
    assertType(type, ReflectionKind.class);
    expect(type.typeName).toBe('SchemaType');

    assertType(type.types[0], ReflectionKind.property);
    expect(type.types[0].name).toBe('id');
});

test('hasCircularReference no', () => {
    interface User {
        id: number;
    }

    interface Bag {
        a: User;
        b: User;
    }

    const type = typeOf<Bag>();
    expect(hasCircularReference(type)).toBe(false);
    let visited = 0;
    visit(type, () => {
        visited++;
    });
    expect(visited).toBe(9);

    expect(stringifyResolvedType(type)).toBe(`Bag {
  a: User {id: number};
  b: User {id: number};
}`);
});

test('hasCircularReference yes', () => {
    interface User {
        id: number;
        sub?: User;
    }

    interface Bag {
        a: User;
        b: User;
    }

    const type = typeOf<Bag>();
    expect(hasCircularReference(type)).toBe(true);
    let visited = 0;
    visit(type, () => {
        visited++;
    });
    expect(visited).toBe(13);

    expect(stringifyResolvedType(type)).toBe(`Bag {
  a: User {
    id: number;
    sub?: User;
  };
  b: User {
    id: number;
    sub?: User;
  };
}`);
});

test('union and intersection filters', () => {
    expect(stringifyResolvedType(typeOf<string & ('a' | 'b')>())).toBe(`'a' | 'b'`);
    expect(stringifyResolvedType(typeOf<('a' | 'b') & string>())).toBe(`'a' | 'b'`);
    expect(stringifyResolvedType(typeOf<keyof any>())).toBe(`string | number | symbol`);
    expect(stringifyResolvedType(typeOf<keyof any & string>())).toBe(`string`);
    expect(stringifyResolvedType(typeOf<keyof any & number>())).toBe(`number`);
    expect(stringifyResolvedType(typeOf<(123 | 'asd') & string>())).toBe(`'asd'`);
    expect(stringifyResolvedType(typeOf<(1 | 123 | 'asd') & number>())).toBe(`1 | 123`);
    expect(stringifyResolvedType(typeOf<(true | 123 | 'asd') & (number | string)>())).toBe(`123 | 'asd'`);
    expect(stringifyResolvedType(typeOf<(true | 123 | 'asd') & ('asd')>())).toBe(`'asd'`);
    expect(stringifyResolvedType(typeOf<((true | 123) | 'asd') & (string | number)>())).toBe(`123 | 'asd'`);
    expect(stringifyResolvedType(typeOf<(true | 'asd' | number) & ('asd' & string)>())).toBe(`'asd'`);
    expect(stringifyResolvedType(typeOf<((true | 123) | 'asd') & any>())).toBe(`any`);
    expect(stringifyResolvedType(typeOf<('a' | 'c' | 'b') & ('a' | 'b') | number>())).toBe(`'a' | 'b' | number`);

    expect(stringifyResolvedType(typeOf<{ a: string } & { b: number }>())).toBe(`{\n  a: string;\n  b: number;\n}`);
});

test('union expansion intersection', () => {
    type U = { a: string } | { b: number };
    type I = U & { c: boolean };
    expect(stringifyResolvedType(typeOf<I>())).toBe(`{
    a: string;
    c: boolean;
  } | {
    b: number;
    c: boolean;
  }`);
});

test('index access on any', () => {
    {
        type Map2<T> = { [K in keyof T]: T[K] };
        type t = Map2<any>;

        expect(stringifyResolvedType(typeOf<t>())).toContain(`[index: string]: any`);
    }

    {
        type Map2<T> = { [K in keyof T]: K };
        type t = Map2<any>;

        expect(stringifyResolvedType(typeOf<t>())).toContain(`[index: string]: string`);
    }

    {
        type Map2<T> = { [K in keyof T]: T[K] extends number ? K : 34 };
        type t = Map2<any>;

        expect(stringifyResolvedType(typeOf<t>())).toContain(`[index: string]: string`);
    }

    {
        type Map2<T> = { [K in keyof T]: T[K] extends number ? K : 34 }[keyof T];
        type t = Map2<any>;

        expect(stringifyResolvedType(typeOf<t>())).toContain(`string | number | symbol`);
    }
});

test('keyof indexAccess on any', () => {
    type DeepPartial<T> = {
        [P in keyof T]?: T[P]
    };

    interface ChangesInterface<T> {
        $set?: DeepPartial<T>;
        $inc?: Partial<T>;
    }

    const t2 = typeOf<string>();
    const t3 = typeOf<Partial<{ bla: string }>>();

    const t = typeOf<ChangesInterface<any>>();
    assertType(t, ReflectionKind.objectLiteral);
    const $set = findMember('$set', t.types);
    assertType($set, ReflectionKind.propertySignature);
    assertType($set.type, ReflectionKind.objectLiteral);
    const indexSignature = $set.type.types[0];
    assertType(indexSignature, ReflectionKind.indexSignature);
    assertType(indexSignature.type, ReflectionKind.any);
    expect(indexSignature.type.parent === indexSignature).toBe(true);
});

test('weird keyof any', () => {
    type a = keyof any;
    type b = { [K in keyof any]: string }
    type c = { [K in a]: string }

    expect(stringifyResolvedType(typeOf<a>())).toBe(`string | number | symbol`);
    expect(stringifyResolvedType(typeOf<b>())).toContain(`{
  [index: string]: string;
  [index: number]: string;
  [index: symbol]: string;
}`);
    expect(stringifyResolvedType(typeOf<c>())).toContain(`{
  [index: string]: string;
  [index: number]: string;
  [index: symbol]: string;
}`);
});

test('any with partial', () => {
    type NumberFields<T> = { [K in keyof T]: T[K] extends number | bigint ? K : never }[keyof T]
    type Expression<T> = { [P in keyof T & string]?: string; }
    type Partial<T> = { [P in keyof T & string]?: T[P] }

    type t1 = NumberFields<any>;
    //ts says string, but that's probably not correct, see 'weird keyof any'
    expect(stringifyResolvedType(typeOf<t1>())).toBe(`string | number | symbol`);

    type t2 = Partial<any>;
    expect(stringifyResolvedType(typeOf<t2>())).toContain(`{[index: string]: any}`);

    interface ChangesInterface<T> {
        $set?: Partial<T> | T;
        $unset?: { [path: string]: number };
        $inc?: Partial<Pick<T, NumberFields<T>>>;
    }

    type t = ChangesInterface<any>;

    const type = typeOf<ChangesInterface<any>>();
    assertType(type, ReflectionKind.objectLiteral);
    console.log(type);
});

function getId<T>(receiveType?: ReceiveType<T>): number {
    const t = resolveReceiveType(receiveType);
    assertType(t, ReflectionKind.objectLiteral);
    return t.id || -1;
}

test('type id intersection', () => {
    type CustomA = { __meta?: never & ['CustomA'] };
    type CustomB = { __meta?: never & ['CustomB'] };

    type O = { a: string } & CustomA;
    type T1 = O & CustomB;
    type T2 = O & { b: string };

    const idO = getId<O>();
    expect(idO).toBeGreaterThan(0);

    const idT1 = getId<T1>();
    expect(idT1).not.toBe(idO); //new type id since nominal is per alias

    const idT2 = getId<T2>();
    expect(idT2).toBeGreaterThan(idO); //new type id since nominal is per alias
});

test('type id interface', () => {
    interface A {
        a: string;
    }

    interface B {
        b: string;
    }

    type O = A & B;

    interface C extends A, B {
    }

    interface C2 extends A, B {
        c: string;
    }

    expect(getId<A>()).toBeGreaterThan(0);
    expect(getId<B>()).toBeGreaterThan(getId<A>());

    expect(getId<O>()).toBeGreaterThan(getId<B>());

    expect(getId<C>()).toBeGreaterThan(getId<B>());
    expect(getId<C2>()).toBeGreaterThan(getId<B>());
});

test('type id interface extends', () => {
    interface A {
    }

    class Clazz implements A {
    }

    const tClazz = typeOf<Clazz>();
    const idA = getId<A>();
    assertType(tClazz, ReflectionKind.class);

    if (!tClazz.implements) throw new Error('no implements');

    assertType(tClazz.implements[0], ReflectionKind.objectLiteral);

    expect(idA).toBeGreaterThan(0);
    expect(idA).toBe(tClazz.implements[0].id);
});

test('new type annotation on already decorated', () => {
    type CustomA = { __meta?: never & ['CustomA'] };
    type CustomB = { __meta?: never & ['CustomB'] };

    type O = {} & CustomA;
    type T = O & CustomB;
    type Decorate<T> = T & CustomB;
    type EmptyTo<T> = {} & T & CustomB;

    expect(typeAnnotation.getAnnotations(typeOf<O>())).toEqual([{ name: 'CustomA', options: undefined }]);
    expect(typeAnnotation.getAnnotations(typeOf<T>())).toEqual([{ name: 'CustomA', options: undefined }, { name: 'CustomB', options: undefined }]);
    expect(typeAnnotation.getAnnotations(typeOf<O>())).toEqual([{ name: 'CustomA', options: undefined }]);

    expect(typeAnnotation.getAnnotations(typeOf<Decorate<O>>())).toEqual([{ name: 'CustomA', options: undefined }, { name: 'CustomB', options: undefined }]);
    expect(typeAnnotation.getAnnotations(typeOf<EmptyTo<O>>())).toEqual([{ name: 'CustomA', options: undefined }, { name: 'CustomB', options: undefined }]);
});

test('ignore constructor in mapped type', () => {
    class MyModel {
        foo(): string {
            return '';
        }

        constructor(public id: number) {
        }
    }

    type SORT_ORDER = 'asc' | 'desc' | any;
    type Sort<T, ORDER extends SORT_ORDER = SORT_ORDER> = { [P in keyof T & string]?: ORDER };

    type t = Sort<MyModel>;

    const type = typeOf<t>();
    assertType(type, ReflectionKind.objectLiteral);
    const members = resolveTypeMembers(type);
    expect(members.map(v => v.kind === ReflectionKind.propertySignature ? v.name : 'unknown')).toEqual(['foo', 'id']);
});

test('ignore constructor in keyof', () => {
    class MyModel {
        foo(): string {
            return '';
        }

        constructor(public id: number) {
        }
    }

    type t = keyof MyModel;

    const type = typeOf<t>();
    assertType(type, ReflectionKind.union);
    expect(type.types.map(v => v.kind === ReflectionKind.literal ? v.literal : 'unknown')).toEqual(['foo', 'id']);
});

test('function returns self reference', () => {
    type Option<T> = OptionType<T>;

    class OptionType<T> {
        constructor(val: T, some: boolean) {
        }
    }

    function Option<T>(val: T): Option<T> {
        return new OptionType(val, true);
    }

    const type = reflect(Option);
    assertType(type, ReflectionKind.function);
    expect(type.function).toBe(Option);
    assertType(type.return, ReflectionKind.function);
    expect(type.return.function).toBe(Option);
});

test('no runtime types', () => {
    /**
     * @reflection never
     */
    class MyModel {
        property!: string;
    }

    expect(() => reflect(MyModel)).toThrow('No valid runtime type for MyModel given');
    expect(reflectOrUndefined(MyModel)).toBe(undefined);
});

test('arrow function returns self reference', () => {
    type Option<T> = OptionType<T>;

    class OptionType<T> {
        constructor(val: T, some: boolean) {
        }
    }

    const Option = <T>(val: T): Option<T> => {
        return new OptionType(val, true);
    };

    const type = reflect(Option);
    assertType(type, ReflectionKind.function);
    expect(type.function).toBe(Option);

    //we need to find out why TS does resolve Option<T> in arrow function to the class and not the variable
    assertType(type.return, ReflectionKind.class);
    expect(type.return.classType).toBe(OptionType);
});

class User {
    a!: string;
}

class EmptyEntity {
}

class Setting {
    name!: string;
    value!: any;
}

describe('types equality', () => {
    const types = [
        typeOf<string>(),
        typeOf<number>(),
        typeOf<bigint>(),
        typeOf<symbol>(),
        typeOf<undefined>(),
        typeOf<null>(),
        typeOf<any>(),
        typeOf<never>(),
        typeOf<Date>(),
        typeOf<'a'>(),
        typeOf<23>(),
        typeOf<4n>(),
        typeOf<true>(),
        typeOf<string[]>(),
        typeOf<number[]>(),
        typeOf<[string]>(),
        typeOf<[number]>(),
        typeOf<User[]>(),
        typeOf<[User]>(),
        typeOf<User>(),
        typeOf<Setting>(),
        typeOf<{ a: string }>(),
        typeOf<{ a: string, b: number }>(),
        typeOf<{ b: number }>(),
        typeOf<{ [index: string]: string }>(),
        typeOf<{ [index: string]: number }>(),
        typeOf<{ [index: string]: number | string }>(),
        typeOf<{ [index: number]: number | string }>(),
        typeOf<() => void>(),
        typeOf<(a: string) => void>(),
        typeOf<(b: number) => void>(),
        typeOf<(b: string, a: number) => void>(),
        typeOf<string | number>(),
        typeOf<string | 'a'>(),
    ];

    for (const a of types) {
        for (const b of types) {
            if (a === b) {
                test(`${stringifyType(a)} same to ${stringifyType(b)}`, () => {
                    expect(isSameType(a, b)).toBe(true);
                });
            } else {
                test(`${stringifyType(a)} different to ${stringifyType(b)}`, () => {
                    expect(isSameType(a, b)).toBe(false);
                });
            }
        }
    }
});

test('function extends empty object literal', () => {
    interface ObjectLiteral {
    }

    type isFunction = Function extends ObjectLiteral ? true : false;
    expect(stringifyResolvedType(typeOf<isFunction>())).toBe('true');
});

test('call signature', () => {
    interface ObjectLiteralWithCall {
        (b: string): number;
    }

    const type = typeOf<ObjectLiteralWithCall>();
    assertType(type, ReflectionKind.objectLiteral);
    assertType(type.types[0], ReflectionKind.callSignature);
    assertType(type.types[0].parameters[0], ReflectionKind.parameter);
    expect(type.types[0].parameters[0].name).toBe('b');
    assertType(type.types[0].parameters[0].type, ReflectionKind.string);
    assertType(type.types[0].return, ReflectionKind.number);

    expect(stringifyResolvedType(typeOf<ObjectLiteralWithCall>())).toBe(`ObjectLiteralWithCall {(b: string) => number}`);
});

test('function extends non-empty object literal', () => {
    interface ObjectLiteral {
        a: string;
    }

    type isFunction = Function extends ObjectLiteral ? true : false;
    expect(stringifyResolvedType(typeOf<isFunction>())).toBe('false');
});

test('issue-429: invalid function detection', () => {
    interface IDTOInner {
        subfieldA: string;
        subfieldB: number;
    }

    interface IDTOOuter {
        fieldA: string;
        fieldB: IDTOInner;
        fieldC: number;

        someFunction(): void;
    }

    type ObjectKeysMatching<O extends {}, V> = { [K in keyof O]: O[K] extends V ? K : V extends O[K] ? K : never }[keyof O];
    type keys = ObjectKeysMatching<IDTOOuter, Function>;

    type isFunction = Function extends IDTOInner ? true : false;
    expect(stringifyResolvedType(typeOf<isFunction>())).toBe('false');
    expect(stringifyResolvedType(typeOf<keys>())).toBe(`'someFunction'`);
});

test('issue-430: referring to this', () => {
    class SomeClass {
        fieldA!: string;
        fieldB!: number;
        fieldC!: boolean;

        someFunctionA() {
        }

        someFunctionB(input: string) {
        }

        someFunctionC(input: keyof this /* behaves the same with keyof anything */) {
        }
    }

    type ArrowFunction = (...args: any) => any;
    type MethodKeys<T> = { [K in keyof T]: T[K] extends ArrowFunction ? K : never }[keyof T];
    type keys = MethodKeys<SomeClass>;

    //for the moment we treat `keyof this` as any, since `this` is not implemented at all.
    //this makes it possible that the code above works at least.
    expect(stringifyResolvedType(typeOf<keys>())).toBe(`'someFunctionA' | 'someFunctionB' | 'someFunctionC'`);
});

test('issue-495: extend Promise in union', () => {
    type Model = {
        foo: string;
    };

    type Interface = {
        modelBuilder(): Promise<Model> | Model;
    };

    class Implementation1 {
        async modelBuilder(): Promise<Model> {
            return { foo: 'bar' };
        }
    }

    class Implementation2 {
        async modelBuilder(): Promise<{ foo2: string }> {
            return { foo2: 'bar' };
        }
    }

    {
        type T = Implementation1 extends Interface ? true : false;
        const type = typeOf<T>();
        assertType(type, ReflectionKind.literal);
        expect(type.literal).toBe(true);
    }

    {
        type T = Implementation2 extends Interface ? true : false;
        const type = typeOf<T>();
        assertType(type, ReflectionKind.literal);
        expect(type.literal).toBe(false);
    }
});

test('used type does not leak parent to original', () => {
    class User {
        groups!: { via: typeof UserGroup };
    }

    class UserGroup {
        public user!: User;
    }

    const user = typeOf<User>();
    const userGroup = typeOf<UserGroup>();

    expect(userGroup.parent).toBe(undefined);
});
