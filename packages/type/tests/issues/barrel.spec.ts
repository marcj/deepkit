import { expect, test } from '@jest/globals';
import { WeightUnit } from './barrel/index.js';
import { cast } from '../../src/serializer-facade.js';
import { typeOf } from '../../src/reflection/reflection.js';
import { ReflectionKind } from '../../src/reflection/type.js';

// types imported from a file with named re-exports (#318, #634)

test('type from named re-export', () => {
    expect(typeOf<WeightUnit>()).toMatchObject({ kind: ReflectionKind.union, typeName: 'WeightUnit' });
    expect(cast<WeightUnit>('kg')).toBe('kg');
    expect(() => cast<WeightUnit>('hp')).toThrow('Validation error');
});
