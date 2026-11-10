import { expect, test } from '@jest/globals';

import { ValidationError } from '@deepkit/type';

import { getBSONDeserializer } from '../src/bson-deserializer.js';
import { getBSONSerializer, serializeBSONWithoutOptimiser } from '../src/bson-serializer.js';

interface Container {
    items: { id: number; tags: { count: number }[] }[];
}

function messageOf(fn: () => unknown): string {
    try {
        fn();
    } catch (error: any) {
        return error.message;
    }
    return 'did not throw';
}

// nested serializers get the path of their parent, the rest of the path is added when they throw
test('errors of nested values have the complete path', () => {
    const serialize = getBSONSerializer<Container>();
    expect(
        messageOf(() =>
            serialize({
                items: [
                    { id: 1, tags: [] },
                    { id: 2, tags: [{ count: 1 }, { count: 'x' as any }] },
                ],
            }),
        ),
    ).toContain('items.1.tags.1.count');

    const bson = serializeBSONWithoutOptimiser({
        items: [
            { id: 1, tags: [] },
            { id: 2, tags: [{ count: 1 }, { count: 'x' }] },
        ],
    });
    let error: unknown;
    try {
        getBSONDeserializer<Container>()(bson);
    } catch (e) {
        error = e;
    }
    expect(error).toBeInstanceOf(ValidationError);
    expect((error as ValidationError).errors.map(v => v.path)).toEqual(['items.1.tags.1.count']);
});
