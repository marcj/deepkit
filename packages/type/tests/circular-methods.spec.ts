import { expect, test } from '@jest/globals';

import { ReflectionClass, hasCircularReference, typeOf } from '../src/reflection/reflection.js';
import { getSerializeFunction, serializer } from '../src/serializer.js';

class User {
    id: number = 0;

    constructor(public name: string) {}

    rename(name: string): User {
        this.name = name;
        return this;
    }
}

class Node {
    children: Node[] = [];
}

// the constructor and methods return the class itself, that is no circular data
test('methods do not make a class circular', () => {
    expect(hasCircularReference(typeOf<User>())).toBe(false);
    expect(ReflectionClass.from(User).hasCircularReference()).toBe(false);
    expect(hasCircularReference(typeOf<Node>())).toBe(true);
});

// without circular data, deserializing tracks no objects and allocates no state
test('deserializing a class with a constructor leaves the state alone', () => {
    const deserialize = getSerializeFunction(typeOf<User>(), serializer.deserializeRegistry);
    const state: any = {};
    const user = deserialize({ id: 1, name: 'Peter' }, state);
    expect(user).toBeInstanceOf(User);
    expect(user).toEqual(Object.assign(new User('Peter'), { id: 1 }));
    expect(state._stack).toBeUndefined();

    const nodes = getSerializeFunction(typeOf<Node>(), serializer.deserializeRegistry);
    const nodeState: any = {};
    nodes({ children: [{ children: [] }] }, nodeState);
    expect(nodeState._stack).toEqual([]);
});
