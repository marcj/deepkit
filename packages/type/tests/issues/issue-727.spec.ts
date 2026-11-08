import { expect, test } from '@jest/globals';

import { is } from '../../src/typeguard.js';
import { User as Account, UserRecord as AccountRecord, Box as Container, Id as Key, User } from './issue-727/models.js';

//https://github.com/marcj/deepkit/issues/727
test('control: plain interface import', () => {
    expect(is<User>({ name: 'Alice' })).toBe(true);
});

test('control: renamed class import', () => {
    expect(is<AccountRecord>({ name: 'Alice' })).toBe(true);
});

test('renamed interface import', () => {
    expect(is<Account>({ name: 'Alice' })).toBe(true);
    expect(is<Account>({ name: 1 })).toBe(false);
});

test('renamed generic interface and type alias import', () => {
    expect(is<Container<number>>({ value: 1 })).toBe(true);
    expect(is<Container<number>>({ value: 'a' })).toBe(false);
    expect(is<Key>('a')).toBe(true);
    expect(is<Key>(1)).toBe(false);
});
