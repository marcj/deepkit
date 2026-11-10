import { expect, test } from '@jest/globals';

import { ReflectionClass } from '../../src/reflection/reflection.js';
import { Index, Unique } from '../../src/reflection/type.js';

test('Unique & Index keeps the unique flag in either order', () => {
    class User {
        email: string & Unique & Index = '';
        username: string & Index & Unique = '';
    }

    const user = ReflectionClass.from(User);
    expect(user.getProperty('email').getIndex()).toEqual({ unique: true });
    expect(user.getProperty('username').getIndex()).toEqual({ unique: true });
});

test('options of several index annotations are combined', () => {
    class User {
        a: string & Index<{ sparse: true }> & Unique = '';
        b: string & Unique & Index<{ sparse: true }> = '';
    }

    const user = ReflectionClass.from(User);
    expect(user.getProperty('a').getIndex()).toEqual({ sparse: true, unique: true });
    expect(user.getProperty('b').getIndex()).toEqual({ sparse: true, unique: true });
});
