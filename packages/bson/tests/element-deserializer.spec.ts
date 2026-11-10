import { expect, test } from '@jest/globals';

import { UnpopulatedCheck, typeOf, typeSettings } from '@deepkit/type';

import { getBSONDeserializer } from '../src/bson-deserializer.js';
import { AutoBuffer, getBSONSerializer } from '../src/bson-serializer.js';

test('tuples are decoded with the size they have', () => {
    type T = [number, string?, string?];
    const roundTrip = (value: T) => getBSONDeserializer<T>()(getBSONSerializer<T>()(value));
    expect(roundTrip([1])).toEqual([1]);
    expect(roundTrip([1, undefined, 'x'])).toEqual([1, undefined, 'x']);
    expect(roundTrip([1, 'y']).length).toBe(2);

    type Rest = [number, ...string[]];
    expect(getBSONDeserializer<Rest>()(getBSONSerializer<Rest>()([1, 'a', 'b']))).toEqual([1, 'a', 'b']);
});

test('a serializer that throws leaves nothing behind in an AutoBuffer', () => {
    const serialize = getBSONSerializer<{ a: { b: string } }>();
    const buffer = new AutoBuffer();
    const check = typeSettings.unpopulatedCheck;
    const reused = { b: 'x' };

    expect(() =>
        buffer.apply((data: any, state: any) => {
            (state._stack ||= []).push(reused);
            state.writer.typeOffset = 3;
            typeSettings.unpopulatedCheck = UnpopulatedCheck.ReturnSymbol;
            throw new TypeError('failed');
        }, {}),
    ).toThrow('failed');

    expect(typeSettings.unpopulatedCheck).toBe(check);
    expect((buffer.state as any)._stack).toBeUndefined();
    expect(buffer.state.writer.typeOffset).toBe(0);

    buffer.apply(serialize, { a: reused });
    expect(deserializeResult(buffer.buffer)).toEqual({ a: { b: 'x' } });
});

function deserializeResult(bytes: Uint8Array) {
    return getBSONDeserializer<{ a: { b: string } }>()(bytes);
}
