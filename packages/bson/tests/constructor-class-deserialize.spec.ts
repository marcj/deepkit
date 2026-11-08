import { expect, test } from '@jest/globals';

import { ReceiveType } from '@deepkit/type';

import { getBSONDeserializer } from '../src/bson-deserializer.js';
import { getBSONSerializer } from '../src/bson-serializer.js';

function roundTrip<T>(data: unknown, type?: ReceiveType<T>): T {
    const bson = getBSONSerializer<any>()(data);
    return getBSONDeserializer<T>(undefined, type)(bson);
}

test('properties besides the constructor are assigned', () => {
    class User {
        ready: boolean = false;
        priority: number = 0;
        constructor(public _id: number, public name: string) {}
    }
    const user = roundTrip<User>({ _id: 1, name: 'a', ready: true, priority: 5 });
    expect(user).toBeInstanceOf(User);
    expect(user).toEqual(Object.assign(new User(1, 'a'), { ready: true, priority: 5 }));
});

test('a missing property keeps the default of the class', () => {
    class User {
        ready: boolean = true;
        tags: string[] = ['a'];
        constructor(public name: string) {}
    }
    const user = roundTrip<User>({ name: 'a' });
    expect(user.ready).toBe(true);
    expect(user.tags).toEqual(['a']);
});

test('an explicit null keeps the default of a property with a default', () => {
    class User {
        ready: boolean = true;
        constructor(public name: string) {}
    }
    expect(roundTrip<User>({ name: 'a', ready: null }).ready).toBe(true);
});

test('an explicit null of an optional property is undefined, not the default', () => {
    class User {
        note?: string = 'default';
        constructor(public name: string) {}
    }
    expect(roundTrip<User>({ name: 'a', note: null }).note).toBeUndefined();
});

test('a constructor can change what it receives', () => {
    class User {
        public name: string;
        ready: boolean = false;
        constructor(public id: number, name: string) {
            this.name = 'set by constructor';
            this.ready = true;
        }
    }
    const user = roundTrip<User>({ id: 1, name: 'from data', ready: false });
    expect(user.ready).toBe(false);
    expect(user.name).toBe('from data');
});

test('a constructor property keeps what the constructor made of it', () => {
    class User {
        constructor(public name: string) {
            this.name = name.toUpperCase();
        }
    }
    expect(roundTrip<User>({ name: 'a' }).name).toBe('A');
});

test('inherited constructor properties', () => {
    class Base {
        constructor(public id: number) {}
    }
    class User extends Base {
        ready: boolean = false;
        constructor(id: number, public name: string) {
            super(id);
        }
    }
    const user = roundTrip<User>({ id: 1, name: 'a', ready: true });
    expect(user).toBeInstanceOf(User);
    expect(user).toEqual(Object.assign(new User(1, 'a'), { ready: true }));
});

test('an index signature besides a constructor', () => {
    class Bag {
        [name: string]: any;
        constructor(public name: string) {}
    }
    const bag = roundTrip<Bag>({ name: 'a', other: 1, more: 'x' });
    expect(bag.name).toBe('a');
    expect(bag.other).toBe(1);
    expect(bag.more).toBe('x');
});

test('unknown fields are not assigned', () => {
    class User {
        constructor(public name: string) {}
    }
    expect(Object.keys(roundTrip<User>({ name: 'a', unknown: 1 }))).toEqual(['name']);
});
