import { expect, test } from '@jest/globals';

import { saslprep } from '../../src/client/command/auth/saslprep.js';

test('saslprep RFC 4013 examples', () => {
    // soft hyphen is mapped to nothing
    expect(saslprep('I­X')).toBe('IX');
    expect(saslprep('user')).toBe('user');
    expect(saslprep('USER')).toBe('USER');
    // NFKC
    expect(saslprep('ª')).toBe('a');
    expect(saslprep('Ⅸ')).toBe('IX');
    expect(() => saslprep('\u0007')).toThrow('Prohibited character');
    expect(() => saslprep('ا1')).toThrow('Bidirectional RandALCat character must be the first and the last');
});

test('saslprep mapping', () => {
    expect(saslprep('')).toBe('');
    expect(saslprep('pencil')).toBe('pencil');
    // non-ASCII spaces are mapped to SPACE
    expect(saslprep('a b　c d')).toBe('a b c d');
    // mapped to nothing (U+200B is a non-ASCII space as well, the space mapping wins)
    expect(saslprep('a​b﻿c͏d᠋e')).toBe('a bcde');
    expect(saslprep('­')).toBe('');
    expect(saslprep('ﬃ')).toBe('ffi');
    expect(saslprep('é')).toBe('é');
    expect(saslprep('pässwörd')).toBe('pässwörd');
    expect(saslprep('\u{1D400}')).toBe('A');
    // NFKC turns the deprecated U+0340 into U+0300
    expect(saslprep('̀')).toBe('̀');
});

test('saslprep prohibited and unassigned', () => {
    expect(() => saslprep('a\u0000')).toThrow('Prohibited character');
    expect(() => saslprep('a\u007F')).toThrow('Prohibited character');
    expect(() => saslprep('')).toThrow('Prohibited character');
    expect(() => saslprep('\u{F0000}')).toThrow('Prohibited character');
    expect(() => saslprep('\uD800')).toThrow('Prohibited character');
    expect(() => saslprep('\u{E0001}')).toThrow('Prohibited character');
    expect(() => saslprep('⁪')).toThrow('Prohibited character');

    // unassigned in Unicode 3.2
    expect(() => saslprep('ȡ')).toThrow('Unassigned code point');
    expect(saslprep('ȡ', { allowUnassigned: true })).toBe('ȡ');
    expect(() => saslprep('\u{1F600}')).toThrow('Unassigned code point');
    expect(() => saslprep('xՠ')).toThrow('Unassigned code point');
});

test('saslprep bidi', () => {
    expect(saslprep('אב')).toBe('אב');
    expect(saslprep('ا1ب')).toBe('ا1ب');
    expect(() => saslprep('اaب')).toThrow('must not contain RandALCat and LCat');
    expect(() => saslprep('aا')).toThrow('must not contain RandALCat and LCat');
    expect(() => saslprep('1ا')).toThrow('Bidirectional RandALCat character must be the first and the last');
});
