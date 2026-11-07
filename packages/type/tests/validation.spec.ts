import { expect, jest, test } from '@jest/globals';
import { Email, MaxLength, MinLength, Positive, Validate, validate, validates, ValidationError, ValidationErrorItem, ValidatorError } from '../src/validator.js';
import { assert, is } from '../src/typeguard.js';
import { AutoIncrement, Excluded, Group, integer, PrimaryKey, Type, Unique, UUID } from '../src/reflection/type.js';
import { t } from '../src/decorator.js';
import { ReflectionClass, typeOf } from '../src/reflection/reflection.js';
import { cast, castFunction, deserialize, validatedDeserialize } from '../src/serializer-facade.js';

test('primitives', () => {
    expect(validate<string>('Hello')).toEqual([]);
    expect(validate<string>(123)).toEqual([{ code: 'type', message: 'Not a string', path: '', value: 123 }]);

    expect(validate<number>('Hello')).toEqual([{ code: 'type', message: 'Not a number', path: '', value: 'Hello' }]);
    expect(validate<number>(123)).toEqual([]);
});

test('UUID', () => {
    const valid = [
        'c232ab00-9414-11ec-b3c8-9f6bdeced846', // v1
        '919108f7-52d1-4320-9bac-f847db4148a8', // v4
        '017f22e2-79b0-7cc3-98c4-dc0c0c07398f', // v7
        '2489e9ad-2ee2-8e00-8ec9-32d5f69181c0', // v8
        '919108F7-52D1-4320-9BAC-F847DB4148A8', // uppercase
        '00000000-0000-0000-0000-000000000000', // Nil
        'ffffffff-ffff-ffff-ffff-ffffffffffff', // Max
    ];
    for (const value of valid) {
        expect(is<UUID>(value)).toBe(true);
        expect(validate<UUID>(value)).toEqual([]);
        expect(deserialize<UUID>(value)).toBe(value);
    }

    const invalid = [
        'zzzzzzzz-zzzz-4zzz-8zzz-zzzzzzzzzzzz', // not hex
        '919108f7-52d1-0320-9bac-f847db4148a8', // version 0
        '919108f7-52d1-f320-9bac-f847db4148a8', // version f
        '919108f7-52d1-4320-0bac-f847db4148a8', // variant 0
        '919108f7-52d1-4320-cbac-f847db4148a8', // variant c
        '00000000-0000-0000-0000-000000000001', // almost Nil
    ];
    for (const value of invalid) {
        expect(is<UUID>(value)).toBe(false);
        expect(validate<UUID>(value)).toEqual([{ code: 'type', message: 'Not a UUID', path: '', value }]);
        expect(() => deserialize<UUID>(value)).toThrow('Not a UUID');
    }
});

test('email', () => {
    expect(is<Email>('peter@example.com')).toBe(true);
    expect(is<Email>('nope')).toBe(false);
    expect(is<Email>('nope@')).toBe(false);
    expect(is<Email>('@')).toBe(false);
    expect(is<string & Email>('@')).toBe(false);

    expect(validate<Email>('peter@example.com')).toEqual([]);
    expect(validate<Email>('nope')).toEqual([{ path: '', code: 'pattern', message: `Pattern ^\\S+@\\S+$ does not match`, value: 'nope' }]);
    expect(validate<Email>('nope@')).toEqual([{ path: '', code: 'pattern', message: `Pattern ^\\S+@\\S+$ does not match`, value: 'nope@' }]);
    expect(validate<Email>('@')).toEqual([{ path: '', code: 'pattern', message: `Pattern ^\\S+@\\S+$ does not match`, value: '@' }]);
});

test('minLength', () => {
    type Username = string & MinLength<3>;

    expect(is<Username>('abc')).toBe(true);
    expect(is<Username>('ab')).toBe(false);

    expect(validate<Username>('abc')).toEqual([]);
    expect(validate<Username>('ab')).toEqual([{ path: '', code: 'minLength', message: `Min length is 3`, value: 'ab' }]);
});

test('custom validator pre defined', () => {
    function startsWith(v: string) {
        return (value: any) => {
            const valid = 'string' === typeof value && value.startsWith(v);
            return valid ? undefined : new ValidatorError('startsWith', `Does not start with ${v}`);
        };
    }

    const startsWithA = startsWith('a');
    type MyType = string & Validate<typeof startsWithA>;

    expect(is<MyType>('aah')).toBe(true);
    expect(is<MyType>('nope')).toBe(false);
    expect(validate<MyType>('nope')).toEqual([{ path: '', code: 'startsWith', message: `Does not start with a`, value: 'nope' }]);
});

test('custom validator with arguments', () => {
    function startsWith(value: any, type: Type, letter: string) {
        const valid = 'string' === typeof value && value.startsWith(letter);
        return valid ? undefined : new ValidatorError('startsWith', `Does not start with ${letter}`);
    }

    type MyType = string & Validate<typeof startsWith, 'a'>;

    expect(is<MyType>('aah')).toBe(true);
    expect(is<MyType>('nope')).toBe(false);
    expect(validate<MyType>('nope')).toEqual([{ path: '', code: 'startsWith', message: `Does not start with a`, value: 'nope' }]);

    type InvalidValidatorOption = string & Validate<typeof startsWith>;
    expect(() => is<InvalidValidatorOption>('aah')).toThrow(`Invalid option value given to validator function startsWith, expected letter: string`);
});

test('multiple custom validators with identical signatures', () => {
    const validator1: (value: any) => void = jest.fn();
    const validator2: (value: any) => void = jest.fn();

    type MyType = {
        a: string & Validate<typeof validator1>;
        b: string & Validate<typeof validator2>;
    }

    expect(is<MyType>({ a: 'a', b: 'b' })).toEqual(true);
    expect(validator1).toHaveBeenCalledTimes(1);
    expect(validator2).toHaveBeenCalledTimes(1);
});

test('decorator validator', () => {
    function minLength(length: number) {
        return (value: any): ValidatorError | void => {
            if ('string' === typeof value && value.length < length) return new ValidatorError('length', `Min length of ${length}`);
        };
    }

    class User {
        @t.validate(minLength(3))
        username!: string;
    }

    const reflection = ReflectionClass.from(User);
    const userType = typeOf<User>();
    //non-generic classes are cached
    expect(userType === reflection.type).toBe(true);

    expect(validate<User>({ username: 'Peter' })).toEqual([]);
    expect(validate<User>({ username: 'Pe' })).toEqual([{ path: 'username', code: 'length', message: `Min length of 3`, value: 'Pe' }]);
});

test('simple interface', () => {
    interface User {
        id: number;
        username: string;
    }

    expect(validate<User>(undefined)).toEqual([{ code: 'type', message: 'Not an object', path: '' }]);
    expect(is<User>({})).toEqual(false);
    expect(validate<User>({})).toEqual([{ code: 'type', message: 'Not a number', path: 'id' }, { code: 'type', message: 'Not a string', path: 'username' }]);
    expect(validate<User>({ id: 1 })).toEqual([{ code: 'type', message: 'Not a string', path: 'username' }]);
    expect(validate<User>({ id: 1, username: 'Peter' })).toEqual([]);
});

test('simple class', () => {
    class User {
        id!: number;
        username!: string;
    }

    expect(validate<User>(undefined)).toEqual([{ code: 'type', message: 'Not an object', path: '' }]);
    expect(validate<User>({})).toEqual([{ code: 'type', message: 'Not a number', path: 'id' }, { code: 'type', message: 'Not a string', path: 'username' }]);
    expect(validate<User>({ id: 1 })).toEqual([{ code: 'type', message: 'Not a string', path: 'username' }]);
    expect(validate<User>({ id: 1, username: 'Peter' })).toEqual([]);
});

test('class', () => {
    class User {
        id: integer & PrimaryKey & AutoIncrement & Positive = 0;

        email?: Email & Group<'sensitive'>;

        firstName?: string & MaxLength<128>;
        lastName?: string & MaxLength<128>;

        logins: integer & Positive & Excluded<'json'> = 0;

        constructor(public username: string & MinLength<3> & MaxLength<24> & Unique) {
        }
    }

    expect(is<User>({ id: 0, logins: 0, username: 'Peter' })).toBe(true);
    expect(is<User>({ id: -1, logins: 0, username: 'Peter' })).toBe(false);
    expect(is<User>({ id: 0, logins: 0, username: 'AB' })).toBe(false);
    expect(is<User>({ id: 0, logins: 0, username: 'Peter', email: 'abc@abc' })).toBe(true);
    expect(is<User>({ id: 0, logins: 0, username: 'Peter', email: 'abc' })).toBe(false);
});

test('path', () => {
    class Config {
        name!: string;
        value!: number;
    }

    class Container1 {
        configs: Config[] = [];
    }

    // expect(validate<Container1>({ configs: [{ name: 'a', value: 3 }] })).toEqual([]);
    expect(validate<Container1>({ configs: {} })).toEqual([{ code: 'type', message: 'Not an array', path: 'configs', value: {} }]);
    expect(validate<Container1>({ configs: [{ name: 'a', value: 123 }, { name: '12' }] })).toEqual([{
        code: 'type',
        message: 'Not a number',
        path: 'configs.1.value',
        value: undefined,
    }]);

    class Container2 {
        configs: { [name: string]: Config } = {};
    }

    expect(validate<Container2>({ configs: { a: { name: 'b' } } })).toEqual([{ code: 'type', message: 'Not a number', path: 'configs.a.value' }]);
    expect(validate<Container2>({ configs: { a: { name: 'b', value: 123 }, b: { name: 'b' } } })).toEqual([{ code: 'type', message: 'Not a number', path: 'configs.b.value' }]);
});

test('class with union literal', () => {
    class ConnectionOptions {
        readConcernLevel: 'local' | 'majority' | 'linearizable' | 'available' = 'majority';
    }

    expect(validate<ConnectionOptions>({ readConcernLevel: 'majority' })).toEqual([]);
    expect(validate<ConnectionOptions>({ readConcernLevel: 'invalid' })).toEqual([{
        code: 'type',
        message: 'Expected \'local\' | \'majority\' | \'linearizable\' | \'available\', got string',
        path: 'readConcernLevel',
        value: 'invalid',
    }]);
});

test('named tuple', () => {
    expect(validate<[name: string]>(['asd'])).toEqual([]);
    expect(validate<[name: string]>([23])).toEqual([{ code: 'type', message: 'Not a string', path: 'name', value: 23 }]);
});

test('inherited validations', () => {
    class User {
        username!: string & MinLength<3>;
    }

    class AddUserDto extends User {
        image?: string;
    }

    expect(validate<User>({ username: 'Pe' })).toEqual([{ code: 'minLength', message: 'Min length is 3', path: 'username', value: 'Pe' }]);
    expect(validate<User>({ username: 'Peter' })).toEqual([]);

    expect(validate<AddUserDto>({ username: 'Pe' })).toEqual([{ code: 'minLength', message: 'Min length is 3', path: 'username', value: 'Pe' }]);
    expect(validate<AddUserDto>({ username: 'Peter' })).toEqual([]);
});

test('mapped type', () => {
    type Api = {
        inc(x: number): number;
        dup(x: string): string;
    };
    type Request = {
        [Method in keyof Api]: {
            method: Method;
            arguments: Parameters<Api[Method]>;
        };
    }[keyof Api];

    type Response = {
        [Method in keyof Api]: {
            method: Method;
            result: ReturnType<Api[Method]>;
        };
    }[keyof Api];

    expect(validate<Request>({ method: 'inc', arguments: [4] })).toEqual([]);

    expect(validate<Request>({ method: 'dup', arguments: [''] })).toEqual([]);
    expect(validate<Request>({ method: 'inc', arguments: [''] })).not.toEqual([]);
    expect(validate<Request>({ method: 'unc', arguments: [''] })).not.toEqual([]);

    expect(validate<Response>({ method: 'inc', result: 4 })).toEqual([]);
    expect(validate<Response>({ method: 'dup', result: '' })).toEqual([]);

    expect(validate<Response>({ method: 'inc', result: '' })).not.toEqual([]);
    expect(validate<Request>({ method: 'enc', result: '' })).not.toEqual([]);
});

test('assert union', () => {
    expect(validates<'a' | 'b'>('a')).toBe(true);
    expect(validates<'a' | 'b'>('b')).toBe(true);
    expect(validates<'a' | 'b'>('c')).toBe(false);

    expect(() => assert<'a' | 'b'>('a')).not.toThrow();
    expect(() => assert<'a' | 'b'>('b')).not.toThrow();
    expect(() => assert<'a' | 'b'>('c')).toThrow('Validation error');
});

test('inline object', () => {
    //there was a bug where array checks do not correctly set validation state to true if array is empty, so all subsequent properties
    //are not checked correctly. this test case makes sure this works as expected.
    interface Post {
        tags: string[];
        collection: {
            items: string[]
        };
    }

    const errors = validate<Post>({
        tags: [],
        collection: {}, // This should make the validator throw an error
    });

    expect(errors).toEqual([{ path: 'collection.items', code: 'type', message: 'Not an array' }]);
    expect(() => validatedDeserialize<Post>({
        tags: [],
        collection: {}, // This should make the validator throw an error
    })).toThrow('collection.items(type): Not an array');
});

test('readonly constructor properties', () => {
    class Pilot {
        constructor(readonly name: string, readonly age: number) {
        }
    }

    expect(validate<Pilot>({ name: 'Peter', age: 32 })).toEqual([]);
    expect(validate<Pilot>({ name: 'Peter', age: 'sdd' })).toEqual([{ code: 'type', message: 'Not a number', path: 'age', value: 'sdd' }]);
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

    expect(validate<PilotId>({ value: 34 })).toEqual([]);
    expect(validate<PilotId>({ value: '33' })).toEqual([{ code: 'type', message: 'Not a number', path: 'value', value: '33' }]);
});

test('date', () => {
    class Account {
        public name!: string;
        public createdAt!: Date;
    }

    expect(validate<Account>({ name: 'jack', createdAt: 'asd' })).toEqual([{ code: 'type', message: 'Not a Date', path: 'createdAt', value: 'asd' }]);
});

test('speed', () => {
    interface User {
        username: string;
        logins: number;
        created: string;
    }

    let start, end;

    const iterations = 100_000;

    const c = castFunction<User>();
    start = performance.now();
    for (let i = 1; i < iterations; i++) {
        const user = c({
            username: 'Peter',
            logins: 23,
            created: '2020-01-01',
        });
    }
    end = performance.now();
    const deepkitInlined = end - start;
    console.log('deepkitInlined', deepkitInlined);

    start = performance.now();
    for (let i = 1; i < iterations; i++) {
        const user = cast<User>({
            username: 'Peter',
            logins: 23,
            created: '2020-01-01',
        });
    }
    end = performance.now();
    const deepkitRef = end - start;
    console.log('deepkitRef', deepkitRef);

    const ratio = deepkitRef / deepkitInlined;
    console.log('ratio', ratio);
    // there is a performance cost involved in passing User to cast,
    // but inline vs ref must not be slower than 2.5 times.
    // expect(ratio).toBeLessThan(2.5);
});

test('array with multiple errors', () => {
    interface Skill {
        level: number & Positive;
    }

    const errors = validate<Array<Skill>>([{level: -1}, {level: -1}]);
    console.log(errors);

    expect(errors).toEqual([
        {code: 'positive', message: 'Number needs to be positive', path: '0.level', value: -1},
        {code: 'positive', message: 'Number needs to be positive', path: '1.level', value: -1}
    ]);
});

test('ValidationErrorItem.toString() handles circular references (#505)', () => {
    const circular: any = { name: 'test' };
    circular.self = circular;

    const item = new ValidationErrorItem('path', 'type', 'Not valid', circular);
    expect(item.toString()).toContain('path(type): Not valid caused by value');

    expect(() => assert<string[]>(circular)).toThrow(ValidationError);
});

test('union member constraint errors are reported (#577)', () => {
    class MyClass {
        code!: (string & MinLength<1> & MaxLength<2>) | null;
    }

    expect(validate<MyClass>({ code: 'a' })).toEqual([]);
    expect(validate<MyClass>({ code: '' })).toEqual([{ code: 'minLength', message: 'Min length is 1', path: 'code', value: '' }]);
    expect(() => cast<MyClass>({ code: 'abc' })).toThrow('code(maxLength): Max length is 2');
    //no member matches the type
    expect(validate<MyClass>({ code: 1 } as any)).toEqual([{ code: 'type', message: 'Expected string | null, got number', path: 'code', value: 1 }]);
});

test('union of objects reports errors of the closest member (#577, #676)', () => {
    type MessageEvent = { type: 'message', message: { id: string } };
    type InputEvent = { type: 'input', value: string & MinLength<1> };
    type BusMessage = { v: MessageEvent | InputEvent };

    expect(validate<BusMessage>({ v: { type: 'input', value: '' } })).toEqual([{ code: 'minLength', message: 'Min length is 1', path: 'v.value', value: '' }]);
    expect(validate<BusMessage>({ v: { type: 'message', message: undefined } } as any)).toEqual([
        { code: 'type', message: 'Not an object', path: 'v.message', value: undefined },
    ]);
    //equally close members are ambiguous
    expect(validate<{ a: string } | { b: string }>({})).toMatchObject([{ path: '', message: 'Expected {a: string} | {b: string}, got object' }]);
});

test('union errors name the expected members', () => {
    interface Circle { kind: 'circle'; radius: number }
    interface Square { kind: 'square'; size: number }

    //names instead of full definitions
    expect(validate<Circle | Square>('circle')).toEqual([{ code: 'type', message: 'Expected Circle | Square, got string', path: '', value: 'circle' }]);
    expect(validate<string | number>(true)).toEqual([{ code: 'type', message: 'Expected string | number, got boolean', path: '', value: true }]);
    expect(validate<'a' | 'b'>('c')).toEqual([{ code: 'type', message: `Expected 'a' | 'b', got string`, path: '', value: 'c' }]);

    //the received type
    expect(validate<string | number>([1])[0].message).toBe('Expected string | number, got array');
    expect(validate<string | number>(null)[0].message).toBe('Expected string | number, got null');
    expect(validate<string | number>(new Date)[0].message).toBe('Expected string | number, got Date');
    expect(validate<{ kind: 'circle' }>({ kind: 1 })[0].message).toBe(`Expected 'circle', got number`);
    expect(validate<`a${number}`>(1)[0].message).toBe('Expected `a${number}`, got number');

    //large unions list the first members only
    type Large = 'a0' | 'a1' | 'a2' | 'a3' | 'a4' | 'a5' | 'a6' | 'a7' | 'a8' | 'a9' | 'a10' | 'a11';
    expect(validate<Large>('x')[0].message).toBe(`Expected 'a0' | 'a1' | 'a2' | 'a3' | 'a4' | 'a5' | 'a6' | 'a7' | 'a8' | 'a9' | ... (2 more), got string`);
});

test('discriminated union errors', () => {
    interface Circle { kind: 'circle'; radius: number }
    interface Square { kind: 'square'; size: number }
    type Shape = { shape: Circle | Square };

    //the discriminator selects the member
    expect(validate<Shape>({ shape: { kind: 'square', size: 'big' } })).toEqual([{ code: 'type', message: 'Not a number', path: 'shape.size', value: 'big' }]);
    //unknown or missing discriminator
    expect(validate<Shape>({ shape: { kind: 'triangle' } })).toEqual([{ code: 'type', message: `Expected 'circle' | 'square', got string`, path: 'shape.kind', value: 'triangle' }]);
    expect(validate<Shape>({ shape: { radius: 1 } })).toEqual([{ code: 'type', message: `Expected 'circle' | 'square', got undefined`, path: 'shape.kind', value: undefined }]);
});

test('union with array reports element errors', () => {
    expect(validate<string[] | number>(['a', 2])).toEqual([{ code: 'type', message: 'Not a string', path: '1', value: 2 }]);
    expect(validate<{ tags: string[] | string }>({ tags: [1] })).toEqual([{ code: 'type', message: 'Not a string', path: 'tags.0', value: 1 }]);
});

test('array type guard checks every item', () => {
    expect(is<string[]>(['a', 1, 'b'])).toBe(false);
    expect(is<string[]>([1, 'a'])).toBe(false);
    expect(is<string[]>(['a', 'b'])).toBe(true);
    expect(is<string[]>([])).toBe(true);
    expect(is<{ tags: string[] }>({ tags: ['a', 1, 'b'] })).toBe(false);
    expect(is<Set<number>>(new Set([1, 'a', 2]))).toBe(false);
    expect(is<Map<string, number>>(new Map<string, any>([['a', 'x'], ['b', 2]]))).toBe(false);
    expect(validate<string[]>([1, 'a', 2]).map(v => v.path)).toEqual(['0', '2']);
});

test('tuple length', () => {
    //#718
    expect(validate<[number]>([1])).toEqual([]);
    expect(validate<[number]>([1, 2])).toEqual([{ code: 'type', message: 'Expected 1 element', path: '', value: [1, 2] }]);
    expect(validate<[number]>([])).toEqual([{ code: 'type', message: 'Expected 1 element', path: '', value: [] }]);
    expect(validate<[number, string?]>([1, 'a', 3])).toEqual([{ code: 'type', message: 'Expected 1 to 2 elements', path: '', value: [1, 'a', 3] }]);
    expect(validate<[number, ...string[]]>([])).toEqual([{ code: 'type', message: 'Expected at least 1 element', path: '', value: [] }]);
    expect(validate<{ v: [number, number] }>({ v: [1, 2, 3] })).toEqual([{ code: 'type', message: 'Expected 2 elements', path: 'v', value: [1, 2, 3] }]);
    expect(validate<{ v: [number, number] }>({ v: [1, 'a'] })).toEqual([{ code: 'type', message: 'Not a number', path: 'v.1', value: 'a' }]);
});

test('template literal bigint', () => {
    //#718
    expect(validate<`${bigint}`>('12')).toEqual([]);
    expect(validate<`${bigint}`>('abc')).toEqual([{ code: 'type', message: 'Expected `${bigint}`, got string', path: '', value: 'abc' }]);
});

test('union of tuples picks the tuple with the matching length', () => {
    //#718, the first tuple accepted the longer array and dropped its additional elements
    type A = { v: [number] | [number, number] };
    expect(cast<A>({ v: [1, 2] })).toEqual({ v: [1, 2] });
    expect(cast<A>({ v: [1] })).toEqual({ v: [1] });
    expect(deserialize<A>({ v: [1, 2] })).toEqual({ v: [1, 2] });

    //when no tuple matches strictly, deserialization falls back to a tuple with a different length, like plain tuple deserialization
    type B = { v: [string, number] | [boolean] };
    expect(cast<B>({ v: ['a', 1, 2] })).toEqual({ v: ['a', 1] });
    expect(validate<B>({ v: ['a', 1, 2] })).toHaveLength(1);
    expect(is<B>({ v: ['a', 1, 2] })).toBe(false);
});

test('Record with template literal key (#720)', () => {
    expect(validate<Record<`x${string}`, string>>({ x1: 's' })).toEqual([]);
    expect(validate<Record<`x${string}`, string>>({ x1: 1 })).toEqual([{ code: 'type', message: 'Not a string', path: 'x1', value: 1 }]);
});

test('binary types (#719)', () => {
    expect(validate<Uint8Array>(new Uint8Array(2))).toEqual([]);
    expect(validate<Uint8Array>('a')).toEqual([{ code: 'type', message: 'Not a Uint8Array', path: '', value: 'a' }]);
    expect(validate<{ k: Uint8Array }>({ k: 'a' })).toEqual([{ code: 'type', message: 'Not a Uint8Array', path: 'k', value: 'a' }]);
    expect(validate<{ k: Uint8Array }>({})).toEqual([{ code: 'type', message: 'Not a Uint8Array', path: 'k', value: undefined }]);
    expect(validate<ArrayBuffer>('a')).toEqual([{ code: 'type', message: 'Not an ArrayBuffer', path: '', value: 'a' }]);
    expect(validate<Float32Array>([1])).toEqual([{ code: 'type', message: 'Not a Float32Array', path: '', value: [1] }]);
    expect(validate<Int8Array>(new Uint8Array(1))).toEqual([{ code: 'type', message: 'Not an Int8Array', path: '', value: new Uint8Array(1) }]);
});

test('void (#719)', () => {
    expect(is<void>(undefined)).toBe(true);
    expect(is<void>({})).toBe(false);
    expect(validate<void>(undefined)).toEqual([]);
    expect(validate<void>({})).toEqual([{ code: 'type', message: 'Not undefined', path: '', value: {} }]);
    expect(validate<{ k: void }>({ k: 1 })).toEqual([{ code: 'type', message: 'Not undefined', path: 'k', value: 1 }]);
    expect(validate<{ k: void }>({})).toEqual([]);
});

test('enum with values that are not strings or numbers (#719)', () => {
    enum E { A = '0', B = 'x' }

    expect(is<E>('0')).toBe(true);
    expect(is<E>({})).toBe(false);
    expect(is<E>(Object.create(null))).toBe(false);
    expect(is<E>(Symbol())).toBe(false);
    expect(validate<E>(Object.create(null))).toEqual([{ code: 'type', message: 'Invalid enum member', path: '', value: {} }]);
    //a value that can't be converted to a string is a validation error, not a TypeError
    expect(() => cast<E>(Object.create(null))).toThrow(ValidationError);
    expect(() => cast<E>(Object.create(null))).toThrow('Cannot convert [object Object] to enum');
});

test('unknown and symbol (#721)', () => {
    expect(validate<{ a: unknown }>({ a: 1 })).toEqual([]);
    expect(validate<symbol>(Symbol.for('a'))).toEqual([]);
    expect(validate<symbol>(1)).toEqual([{ code: 'type', message: 'Not a symbol', path: '', value: 1 }]);
    expect(validate<{ s: symbol }>({ s: 1 })).toEqual([{ code: 'type', message: 'Not a symbol', path: 's', value: 1 }]);
});
