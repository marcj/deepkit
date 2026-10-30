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
        message: 'No valid union member found. Valid: \'local\' | \'majority\' | \'linearizable\' | \'available\'',
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
    expect(validate<MyClass>({ code: 1 } as any)).toEqual([{ code: 'type', message: 'No valid union member found. Valid: string | null', path: 'code', value: 1 }]);
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
    expect(validate<{ a: string } | { b: string }>({})).toMatchObject([{ path: '', message: 'No valid union member found. Valid: {a: string} | {b: string}' }]);
});
