import { expect, test } from '@jest/globals';

import { cast, deserialize, serialize } from '../../src/serializer-facade.js';

//https://github.com/marcj/deepkit/issues/726
interface WebhookEvent {
    id: string;
    payload: unknown;
    context: any;
}

const event: WebhookEvent = { id: 'evt_123', payload: { orderId: 42 }, context: { orderId: 42 } };

test('control: any is kept', () => {
    expect(serialize<WebhookEvent>(event).context).toEqual({ orderId: 42 });
    expect(deserialize<WebhookEvent>(event).context).toEqual({ orderId: 42 });
    expect(cast<WebhookEvent>(event).context).toEqual({ orderId: 42 });
});

test('serialize keeps unknown', () => {
    expect(serialize<WebhookEvent>(event).payload).toEqual({ orderId: 42 });
});

test('deserialize keeps unknown', () => {
    expect(deserialize<WebhookEvent>(event).payload).toEqual({ orderId: 42 });
});

test('cast keeps unknown', () => {
    expect(cast<WebhookEvent>(event).payload).toEqual({ orderId: 42 });
});

test('unknown[] keeps its elements', () => {
    expect(deserialize<unknown[]>([1, 'a'])).toEqual([1, 'a']);
    expect(serialize<unknown[]>([1, 'a'])).toEqual([1, 'a']);
});

test('Record<string, unknown> keeps its entries', () => {
    expect(deserialize<Record<string, unknown>>({ a: 1 })).toEqual({ a: 1 });
    expect(serialize<Record<string, unknown>>({ a: 1 })).toEqual({ a: 1 });
});
