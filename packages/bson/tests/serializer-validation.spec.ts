import { expect, test } from '@jest/globals';

import { BinaryBigInt, MongoId, Type, typeOf, UUID } from '@deepkit/type';

import { bsonBinarySerializer, getBSONSerializer, Writer } from '../src/bson-serializer.js';

enum Color {
    red,
    green,
}

class Model {
    constructor(public id: number) {}
}

const types: [string, Type][] = [
    ['number', typeOf<{ v: number }>()],
    ['bigint', typeOf<{ v: bigint }>()],
    ['binary bigint', typeOf<{ v: BinaryBigInt }>()],
    ['string', typeOf<{ v: string }>()],
    ['uuid', typeOf<{ v: UUID }>()],
    ['mongo id', typeOf<{ v: MongoId }>()],
    ['boolean', typeOf<{ v: boolean }>()],
    ['date', typeOf<{ v: Date }>()],
    ['regexp', typeOf<{ v: RegExp }>()],
    ['string literal', typeOf<{ v: 'a' }>()],
    ['number literal', typeOf<{ v: 1 }>()],
    ['binary', typeOf<{ v: Uint8Array }>()],
    ['array buffer', typeOf<{ v: ArrayBuffer }>()],
    ['array', typeOf<{ v: number[] }>()],
    ['tuple', typeOf<{ v: [number, string] }>()],
    ['object', typeOf<{ v: { a: number } }>()],
    ['class', typeOf<{ v: Model }>()],
    ['union', typeOf<{ v: number | string }>()],
    ['union with null', typeOf<{ v: number | null }>()],
    ['enum', typeOf<{ v: Color }>()],
    ['set', typeOf<{ v: Set<number> }>()],
    ['map', typeOf<{ v: Map<string, number> }>()],
    ['index signature', typeOf<{ [name: string]: number }>()],
    ['optional', typeOf<{ v?: number }>()],
    ['nullable', typeOf<{ v: number | null }>()],
    ['undefined', typeOf<{ v: undefined }>()],
    ['null', typeOf<{ v: null }>()],
    ['any', typeOf<{ v: any }>()],
    ['date in array', typeOf<{ v: Date[] }>()],
    ['nested number', typeOf<{ v: { a: { b: number } } }>()],
];

const values: [string, any][] = [
    ['undefined', undefined],
    ['null', null],
    ['string', 'abc'],
    ['empty string', ''],
    ['number', 123],
    ['NaN', NaN],
    ['infinity', Infinity],
    ['boolean', true],
    ['object', {}],
    ['array', []],
    ['array of strings', ['a']],
    ['array of undefined', [undefined]],
    ['date', new Date(0)],
    ['bigint', 12n],
    ['uuid', 'bef8de96-41fe-442f-b70c-c3a150f8c96c'],
    ['mongo id', '507f1f77bcf86cd799439011'],
    ['buffer', new Uint8Array(2)],
    ['nested wrong', { a: 'x' }],
    ['deep wrong', { a: { b: 'x' } }],
];

function outcome(run: () => unknown): string {
    try {
        run();
        return 'ok';
    } catch (error: any) {
        return error.constructor.name + ': ' + error.message.split('\n').slice(1).join(' ');
    }
}

test('the serializer rejects the same without a writer as with one, with the same error', () => {
    const differences: string[] = [];

    for (const [typeName, type] of types) {
        const serialize = getBSONSerializer(bsonBinarySerializer, type);

        for (const [valueName, value] of values) {
            for (const data of [{ v: value }, { v: value, other: 1 }, {}]) {
                const standalone = outcome(() => serialize(data));
                const written = outcome(() => serialize(data, { writer: new Writer(new Uint8Array(4096)) }));
                if (standalone !== written) differences.push(`${typeName} with ${valueName}: without writer "${standalone}", with writer "${written}"`);
            }
        }
    }

    expect([...new Set(differences)]).toEqual([]);
});
