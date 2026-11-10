import { expect, test } from '@jest/globals';

import { deserialize } from '../src/serializer-facade.js';
import { SerializationError } from '../src/serializer.js';
import { ValidationError, validate } from '../src/validator.js';

interface Item {
    id: number;
    tags: { count: number }[];
}

interface Container {
    items: Item[];
    byName: { [name: string]: Item };
}

function errorOf(fn: () => unknown): ValidationError | SerializationError {
    try {
        fn();
    } catch (error: any) {
        return error;
    }
    throw new Error('did not throw');
}

// nested serializers get the path of their parent, the rest of the path is added when they throw
test('the path of an error in nested arrays and objects is complete', () => {
    const items = [
        { id: 1, tags: [] },
        { id: 2, tags: [{ count: 1 }, { count: 'x' }] },
    ];
    const error = errorOf(() => deserialize<Container>({ items, byName: {} }));
    expect(error).toBeInstanceOf(ValidationError);
    expect((error as ValidationError).errors.map(v => v.path)).toEqual(['items.1.tags.1.count']);
    expect(error.message).toContain('items.1.tags.1.count');

    const second = errorOf(() => deserialize<Container>({ items: [], byName: { peter: { id: 'x', tags: [] } } }));
    expect((second as ValidationError).errors.map(v => v.path)).toEqual(['byName.peter.id']);

    const third = errorOf(() =>
        deserialize<Container>({
            items: [
                { id: 1, tags: [] },
                { id: 2, tags: [{ count: 1 }, { count: 2 }, { count: {} }] },
            ],
            byName: {},
        }),
    );
    expect((third as ValidationError).errors.map(v => v.path)).toEqual(['items.1.tags.2.count']);
});

test('collected validation errors have the complete path', () => {
    const errors = validate<Container>({ items: [{ id: 1, tags: [{ count: 'x' }] }], byName: { a: { id: 'x', tags: [] } } });
    expect(errors.map(v => v.path)).toEqual(['items.0.tags.0.count', 'byName.a.id']);
});
