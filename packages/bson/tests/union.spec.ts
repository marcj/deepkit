import { expect, test } from '@jest/globals';

import { getBSONDeserializer, getBSONSerializer } from '../index.js';

type Kind = 'a' | 'b';
type Document = { kind: Kind };

const serialize = getBSONSerializer<Document>();
const deserialize = getBSONDeserializer<Document>();

test('a value of the union roundtrips', () => {
    expect(deserialize(serialize({ kind: 'b' }))).toEqual({ kind: 'b' });
});

test('a value outside of a literal union is an error', () => {
    expect(() => serialize({ kind: 'c' })).toThrow();
});

test('an optional union accepts undefined and still rejects other values', () => {
    type Optional = { kind?: Kind };
    const write = getBSONSerializer<Optional>();
    expect(getBSONDeserializer<Optional>()(write({}))).toEqual({});
    expect(() => write({ kind: 'c' })).toThrow();
});

class User {
    name: string = '';
}

class Order {
    total: number = 0;
}

test('a class union picks the member whose property is present, in either order', () => {
    const order = new Order();
    order.total = 3;
    const first = getBSONDeserializer<{ v: User | Order }>()(getBSONSerializer<{ v: User | Order }>()({ v: order }));
    expect(first.v).toBeInstanceOf(Order);
    expect((first.v as Order).total).toBe(3);

    const user = new User();
    user.name = 'peter';
    const second = getBSONDeserializer<{ v: Order | User }>()(getBSONSerializer<{ v: Order | User }>()({ v: user }));
    expect(second.v).toBeInstanceOf(User);
    expect((second.v as User).name).toBe('peter');
});
