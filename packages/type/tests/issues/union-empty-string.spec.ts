import { expect, test } from '@jest/globals';

import { deserialize } from '../../src/serializer-facade.js';

test('an empty string in a string | number union stays a string', () => {
    // isNumeric('') was true, so '' became 0
    expect(deserialize<string | number>('')).toBe('');
    expect(deserialize<string | number>('12')).toBe(12);
    expect(deserialize<number | string>('')).toBe('');
});
