import { expect, test } from '@jest/globals';

import { deserialize, serialize } from '../../src/serializer-facade.js';

class User {
    name: string = '';
}

class Order {
    total: number = 0;
}

test('class union picks the member whose property is present, in either order', () => {
    const order = new Order();
    order.total = 3;
    const data = serialize<User | Order>(order);
    const result = deserialize<User | Order>(data);
    expect(result).toBeInstanceOf(Order);
    expect((result as Order).total).toBe(3);

    const user = new User();
    user.name = 'peter';
    const other = deserialize<Order | User>(serialize<Order | User>(user));
    expect(other).toBeInstanceOf(User);
    expect((other as User).name).toBe('peter');
});

test('without any matching property the first member stays', () => {
    expect(deserialize<User | Order>({})).toBeInstanceOf(User);
});
