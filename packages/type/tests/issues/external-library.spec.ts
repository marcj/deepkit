import { expect, test } from '@jest/globals';
import { GraphQLClient } from './external-library/index.js';
import { typeOf } from '../../src/reflection/reflection.js';
import { ReflectionKind } from '../../src/reflection/type.js';

test('class of library without runtime types', () => {
    // the class has no __type (#555)
    expect(typeOf<GraphQLClient>()).toMatchObject({ kind: ReflectionKind.class, classType: GraphQLClient });
});
